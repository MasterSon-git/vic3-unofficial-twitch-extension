using System;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Vic3Unofficial.Twitch.Desktop.Extensions;
using Vic3Unofficial.Twitch.Desktop.Infrastructure;
using Vic3Unofficial.Twitch.Desktop.Models;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public sealed class EbsClient : IEbsClient
{
    private readonly HttpClient _http;
    private readonly ISettingsService _settings;
    private readonly ITokenStore _tokenStore;
    private readonly ILogger<EbsClient> _log;
    private readonly IStatusSink _status;

    public EbsClient(HttpClient http, ISettingsService settings, ITokenStore tokenStore, ILogger<EbsClient> log, IStatusSink status)
    {
        _http = http;
        _http.Timeout = TimeSpan.FromSeconds(30);
        _settings = settings;
        _tokenStore = tokenStore;
        _log = log;
        _status = status;

        // Token aus Store laden (falls vorhanden)
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

    public async Task<bool> CompletePairingAsync(string code)
    {
        _log.LogInformation("Pair/complete started. BaseUrl={BaseUrl}", BaseUrl);
        _status.Post(StatusLevel.Info, "Pairing…");

        var payload = JsonSerializer.Serialize(new { code });
        var res = await _http.PostAsync($"{BaseUrl}/pair/complete",
            new StringContent(payload, Encoding.UTF8, "application/json"));
        var text = await res.Content.ReadAsStringAsync();
        
        if (!res.IsSuccessStatusCode)
        {
            _log.LogWarning("Pair/complete failed: {Status} {Body}", (int)res.StatusCode, text.Truncate(500));
            _status.Post(StatusLevel.Warning, $"Pairing failed: {res.StatusCode}  {text}");
            throw new Exception($"pair/complete failed: {res.StatusCode} {text}");
        }

        using var doc = JsonDocument.Parse(text);
        ChannelId   = doc.RootElement.GetProperty("channelId").GetString();
        IngestToken = doc.RootElement.GetProperty("ingestToken").GetString();
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

    public async Task UploadBootstrapAsync(Bootstrap bootstrap)
    {
        EnsurePaired();
        using var req = new HttpRequestMessage(HttpMethod.Put, $"{BaseUrl}/bootstrap");
        req.Headers.Add("x-ingest-token", IngestToken!);
        req.Content = new StringContent(JsonSerializer.Serialize(bootstrap), Encoding.UTF8, "application/json");
        var res = await _http.SendAsync(req);
        await HandleAuthFailures(res); // NEW
        if (!res.IsSuccessStatusCode)
        {
            var text = await res.Content.ReadAsStringAsync();
            throw new Exception($"bootstrap failed: {res.StatusCode} {text}");
        }
    }

    public async Task IngestAsync(Snapshot snapshot)
    {
        EnsurePaired();
        using var req = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/ingest");
        req.Headers.Add("x-ingest-token", IngestToken!);
        req.Content = new StringContent(JsonSerializer.Serialize(snapshot), Encoding.UTF8, "application/json");
        var res = await _http.SendAsync(req);
        var text = await res.Content.ReadAsStringAsync();
        await HandleAuthFailures(res); // NEW
        if (!res.IsSuccessStatusCode) throw new Exception($"ingest failed: {res.StatusCode} {text}");
    }

    private void EnsurePaired()
    {
        if (string.IsNullOrEmpty(ChannelId) || string.IsNullOrEmpty(IngestToken))
            throw new InvalidOperationException("Client is not paired.");
    }

    private Task HandleAuthFailures(HttpResponseMessage res)
    {
        if (res.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        {
            // Token vermutlich abgelaufen/ungültig → lokalen Store leeren
            _tokenStore.Clear();
            ChannelId = null;
            IngestToken = null;
        }
        return Task.CompletedTask;
    }
}
