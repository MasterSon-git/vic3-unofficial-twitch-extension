using System;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Vic3Unofficial.Twitch.Desktop.Extensions;
using Vic3Unofficial.Twitch.Desktop.Infrastructure;
using Vic3Unofficial.Twitch.Desktop.Models;
using ApiException = Vic3Unofficial.Twitch.Desktop.Generated.ApiException;
using ApiCountry = Vic3Unofficial.Twitch.Desktop.Generated.Country;
using ApiEbsClient = Vic3Unofficial.Twitch.Desktop.Generated.EbsApiClient;
using ApiPairCompleteRequest = Vic3Unofficial.Twitch.Desktop.Generated.PairCompleteRequest;
using ApiPairCompleteResponse = Vic3Unofficial.Twitch.Desktop.Generated.PairCompleteResponse;
using ApiSnapshot = Vic3Unofficial.Twitch.Desktop.Generated.Snapshot;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public sealed class EbsClient : IEbsClient
{
    private readonly ApiEbsClient _api;
    private readonly ISettingsService _settings;
    private readonly ITokenStore _tokenStore;
    private readonly ILogger<EbsClient> _log;
    private readonly IStatusSink _status;

    public EbsClient(HttpClient http, ISettingsService settings, ITokenStore tokenStore, ILogger<EbsClient> log, IStatusSink status)
    {
        http.Timeout = TimeSpan.FromSeconds(30);
        _api = new ApiEbsClient(http);
        _api.ReadResponseAsString = true;
        _settings = settings;
        _api.BaseUrl = BaseUrl;
        _tokenStore = tokenStore;
        _log = log;
        _status = status;

        var loaded = _tokenStore.Load();
        if (loaded.HasValue)
        {
            ChannelId = loaded.Value.channelId;
            IngestToken = loaded.Value.ingestToken;
            _log.LogInformation("Loaded token from store for channel {ChannelId}", ChannelId);
            _status.Post(StatusLevel.Info, $"Loaded saved session for channel {ChannelId}");
        }
    }

    public string BaseUrl => _settings.WorkerBaseUrl.TrimEnd('/');
    public string? ChannelId { get; private set; }
    public string? IngestToken { get; private set; }
    public bool HasActiveSlot { get; private set; }

    public async Task<bool> CompletePairingAsync(string code)
    {
        _log.LogInformation("Pair/complete started. BaseUrl={BaseUrl}", BaseUrl);
        _status.Post(StatusLevel.Info, "Pairing...");

        ApiPairCompleteResponse response;
        try
        {
            response = await _api.CompletePairAsync(new ApiPairCompleteRequest { Code = code });
        }
        catch (ApiException ex)
        {
            var responseText = ex.Response ?? "";
            _log.LogWarning("Pair/complete failed: {Status} {Body}", ex.StatusCode, responseText.Truncate(500));
            _status.Post(StatusLevel.Warning, $"Pairing failed: {ex.StatusCode}  {responseText}");
            throw new Exception($"pair/complete failed: {ex.StatusCode} {responseText}", ex);
        }

        ChannelId = response.ChannelId;
        IngestToken = response.IngestToken.ToString();
        HasActiveSlot = true;
        _log.LogInformation("Pairing OK. ChannelId={ChannelId}, TokenLen={Len}",
            ChannelId, IngestToken?.Length ?? 0);
        _status.Post(StatusLevel.Info, $"Paired with channel {ChannelId}");

        if (!string.IsNullOrEmpty(ChannelId) && !string.IsNullOrEmpty(IngestToken))
        {
            _tokenStore.Save(ChannelId!, IngestToken!);
            return true;
        }
        return false;
    }

    public async Task<bool> ValidateSavedPairingAsync()
    {
        if (string.IsNullOrEmpty(IngestToken)) return false;

        try
        {
            var response = await _api.GetPairTokenStatusAsync(IngestToken);
            if (response.Paired && !string.IsNullOrWhiteSpace(response.ChannelId))
            {
                ChannelId = response.ChannelId;
                HasActiveSlot = true;
                return true;
            }
        }
        catch (ApiException ex)
        {
            if ((HttpStatusCode)ex.StatusCode == (HttpStatusCode)429)
            {
                HasActiveSlot = false;
                _status.Post(StatusLevel.Warning, "No active backend slot is currently available. Pairing remains saved.");
                return false;
            }

            await HandleAuthFailures(ex.StatusCode);
            return false;
        }

        HasActiveSlot = false;
        _tokenStore.Clear();
        ChannelId = null;
        IngestToken = null;
        return false;
    }

    public async Task UnpairAsync()
    {
        var token = IngestToken;
        var serverRevoked = string.IsNullOrEmpty(token);
        if (!string.IsNullOrEmpty(token))
        {
            try
            {
                await _api.RevokePairAsync(token);
                serverRevoked = true;
            }
            catch (ApiException ex) when ((HttpStatusCode)ex.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            {
                _log.LogWarning("Pair/revoke rejected: {Status}", ex.StatusCode);
                _status.Post(StatusLevel.Warning, "Server unpair failed: saved token is no longer valid. Use Twitch config Unpair to clear the server pairing.");
            }
            catch (ApiException ex)
            {
                _log.LogWarning("Pair/revoke failed: {Status}", ex.StatusCode);
                _status.Post(StatusLevel.Warning, $"Server unpair failed: {ex.StatusCode}. Local pairing was removed.");
            }
        }

        _tokenStore.Clear();
        ChannelId = null;
        IngestToken = null;
        HasActiveSlot = false;
        _status.Post(StatusLevel.Info, serverRevoked ? "Unpaired" : "Local pairing removed");
    }

    public async Task IngestAsync(Snapshot snapshot)
    {
        EnsurePaired();

        try
        {
            await _api.IngestSnapshotAsync(IngestToken!, ToApiSnapshot(snapshot));
        }
        catch (ApiException ex)
        {
            var responseText = ex.Response ?? "";
            await HandleAuthFailures(ex.StatusCode);
            if ((HttpStatusCode)ex.StatusCode == HttpStatusCode.Conflict &&
                TryReadStaleSequence(responseText, out var lastSeq))
            {
                throw new IngestStaleSequenceException(lastSeq);
            }

            if ((HttpStatusCode)ex.StatusCode == HttpStatusCode.BadGateway &&
                TryReadPubSubRejected(responseText, out var upstreamStatus))
            {
                throw new IngestPubSubRejectedException(upstreamStatus);
            }

            if ((HttpStatusCode)ex.StatusCode == HttpStatusCode.BadGateway &&
                HasErrorCode(responseText, "pubsub_failed"))
            {
                throw new IngestPubSubFailedException();
            }

            if ((HttpStatusCode)ex.StatusCode == (HttpStatusCode)429)
            {
                if (TryReadTooSoonRetry(responseText, out var retryAfter))
                {
                    _status.Post(StatusLevel.Warning, $"Worker rate limit reached. Next ingest in {retryAfter.TotalSeconds:N0} seconds.");
                    throw new IngestRateLimitedException(retryAfter);
                }

                HasActiveSlot = false;
                _status.Post(StatusLevel.Warning, "No active backend slot is currently available. Ingest paused.");
            }
            throw new Exception($"ingest failed: {ex.StatusCode} {responseText}", ex);
        }
    }

    private static bool TryReadStaleSequence(string responseText, out int lastSeq)
    {
        lastSeq = -1;
        if (string.IsNullOrWhiteSpace(responseText)) return false;

        try
        {
            using var document = JsonDocument.Parse(responseText);
            var root = document.RootElement;
            if (!root.TryGetProperty("error", out var error) ||
                error.ValueKind != JsonValueKind.String ||
                error.GetString() != "stale_sequence")
            {
                return false;
            }

            return root.TryGetProperty("lastSeq", out var lastSeqElement) &&
                   lastSeqElement.TryGetInt32(out lastSeq);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static bool TryReadPubSubRejected(string responseText, out int? upstreamStatus)
    {
        upstreamStatus = null;
        if (string.IsNullOrWhiteSpace(responseText)) return false;

        try
        {
            using var document = JsonDocument.Parse(responseText);
            var root = document.RootElement;
            if (!root.TryGetProperty("error", out var error) ||
                error.ValueKind != JsonValueKind.String ||
                error.GetString() != "pubsub_rejected")
            {
                return false;
            }

            if (root.TryGetProperty("upstreamStatus", out var upstreamStatusElement) &&
                upstreamStatusElement.TryGetInt32(out var parsed))
            {
                upstreamStatus = parsed;
            }

            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static bool HasErrorCode(string responseText, string expectedErrorCode)
    {
        if (string.IsNullOrWhiteSpace(responseText)) return false;

        try
        {
            using var document = JsonDocument.Parse(responseText);
            var root = document.RootElement;
            return root.TryGetProperty("error", out var error) &&
                   error.ValueKind == JsonValueKind.String &&
                   error.GetString() == expectedErrorCode;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private void EnsurePaired()
    {
        if (string.IsNullOrEmpty(ChannelId) || string.IsNullOrEmpty(IngestToken))
            throw new InvalidOperationException("Client is not paired.");
    }

    private static ApiSnapshot ToApiSnapshot(Snapshot snapshot)
    {
        var apiSnapshot = new ApiSnapshot
        {
            ChannelId = snapshot.ChannelId,
            SaveHash = snapshot.SaveHash,
            Seq = snapshot.Seq,
            UpdatedAt = DateTimeOffset.TryParse(snapshot.UpdatedAt, out var updatedAt) ? updatedAt : null
        };

        foreach (var country in snapshot.Countries)
        {
            apiSnapshot.Countries.Add(new ApiCountry
            {
                Tag = country.Tag,
                Score = country.Score,
                Rank = country.Rank,
                Prestige = country.Prestige,
                Treasury = country.Treasury,
                Gdp = country.Gdp,
                MarketId = country.MarketId
            });
        }

        return apiSnapshot;
    }

    private Task HandleAuthFailures(int statusCode)
    {
        if ((HttpStatusCode)statusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        {
            _tokenStore.Clear();
            ChannelId = null;
            IngestToken = null;
            HasActiveSlot = false;
            _status.Post(StatusLevel.Warning, "Pairing expired or revoked. Pair again from the Twitch config view.");
        }
        return Task.CompletedTask;
    }

    private static bool TryReadTooSoonRetry(string responseText, out TimeSpan retryAfter)
    {
        retryAfter = TimeSpan.Zero;
        if (string.IsNullOrWhiteSpace(responseText)) return false;

        try
        {
            using var document = JsonDocument.Parse(responseText);
            var root = document.RootElement;
            if (!root.TryGetProperty("error", out var error) ||
                error.ValueKind != JsonValueKind.String ||
                error.GetString() != "too_soon")
            {
                return false;
            }

            var retryInMs = root.TryGetProperty("retryInMs", out var retryElement) &&
                            retryElement.TryGetInt32(out var parsed)
                ? parsed
                : 300000;
            retryAfter = TimeSpan.FromMilliseconds(Math.Max(1000, retryInMs));
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
