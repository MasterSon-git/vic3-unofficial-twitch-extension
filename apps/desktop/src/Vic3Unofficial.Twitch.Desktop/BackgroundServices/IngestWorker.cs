using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Vic3Unofficial.Twitch.Desktop.Infrastructure;
using Vic3Unofficial.Twitch.Desktop.Models;
using Vic3Unofficial.Twitch.Desktop.Services;

namespace Vic3Unofficial.Twitch.Desktop.BackgroundServices;

public sealed class IngestWorker : BackgroundService
{
    private readonly ILogger<IngestWorker> _log;
    private readonly IStatusSink _status;
    private readonly IEbsClient _ebs;
    private readonly ISaveFileWatcher _watcher;
    private readonly ISaveParser _parser;
    private readonly ISettingsService _settings;
    private readonly IUploadControl _uploadControl;
    private readonly DesktopDiagnostics _diagnostics;

    private string? _lastSaveHash;
    private DateTimeOffset _lastAccepted = DateTimeOffset.MinValue;
    private int _seq;
    private int _pendingChangeCount;
    private int _processedChangeCount;

    public IngestWorker(
        ILogger<IngestWorker> log,
        IStatusSink status,
        IEbsClient ebs,
        ISaveFileWatcher watcher,
        ISaveParser parser,
        ISettingsService settings,
        IUploadControl uploadControl,
        DesktopDiagnostics diagnostics)
    {
        _log = log;
        _status = status;
        _ebs = ebs;
        _watcher = watcher;
        _parser = parser;
        _settings = settings;
        _uploadControl = uploadControl;
        _diagnostics = diagnostics;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        _status.Post(StatusLevel.Info, "Ingest worker started.");
        WarnIfSaveFormatIsUnsupported();

        var watcherActive = false;
        string? watchedDirectory = null;

        try
        {
            while (!ct.IsCancellationRequested)
            {
                if (!_uploadControl.IsWatching)
                {
                    if (watcherActive)
                    {
                        _watcher.Stop();
                        watcherActive = false;
                        watchedDirectory = null;
                        _pendingChangeCount = 0;
                        _processedChangeCount = 0;
                        _status.Post(StatusLevel.Info, "Save watching stopped.");
                    }

                    await Task.Delay(TimeSpan.FromMilliseconds(500), ct);
                    continue;
                }

                if (string.IsNullOrEmpty(_ebs.IngestToken) || string.IsNullOrEmpty(_ebs.ChannelId))
                {
                    _uploadControl.IsWatching = false;
                    _status.Post(StatusLevel.Warning, "Pair with the Twitch config view before starting uploads.");
                    continue;
                }

                var saveDirectory = _settings.SaveDir;
                if (!Directory.Exists(saveDirectory))
                {
                    _uploadControl.IsWatching = false;
                    _status.Post(StatusLevel.Error, $"Save folder does not exist: {saveDirectory}");
                    continue;
                }

                if (!watcherActive ||
                    !string.Equals(watchedDirectory, saveDirectory, StringComparison.OrdinalIgnoreCase))
                {
                    _watcher.Start(saveDirectory, ev =>
                    {
                        Interlocked.Increment(ref _pendingChangeCount);
                        _log.LogInformation(
                            "Save watcher event: {ChangeType} {Path} length={Length} lastWriteUtc={LastWriteUtc:O}",
                            ev.ChangeType,
                            ev.Path,
                            ev.Length,
                            ev.LastWriteTimeUtc);
                        _status.Post(StatusLevel.Info, FormatSaveEvent(ev));
                    });
                    watcherActive = true;
                    watchedDirectory = saveDirectory;
                    _status.Post(StatusLevel.Info, $"Watching saves in {saveDirectory}");
                }

                if (Volatile.Read(ref _pendingChangeCount) == Volatile.Read(ref _processedChangeCount))
                {
                    await Task.Delay(TimeSpan.FromSeconds(2), ct);
                    continue;
                }

                var processedChangeCount = await TryIngestLatestSaveAsync(saveDirectory, ct);
                if (processedChangeCount.HasValue)
                {
                    Volatile.Write(ref _processedChangeCount, processedChangeCount.Value);
                }
            }
        }
        finally
        {
            _watcher.Stop();
            _status.Post(StatusLevel.Info, "Ingest worker stopped.");
        }
    }

    private async Task<int?> TryIngestLatestSaveAsync(string saveDirectory, CancellationToken ct)
    {
        await WaitForLocalIngestIntervalAsync(ct);
        if (!_uploadControl.IsWatching) return null;

        var changeCountToProcess = await WaitForSaveEventsToSettleAsync(ct);
        if (!_uploadControl.IsWatching) return null;

        var latest = GetLatestSave(saveDirectory);
        if (latest is null)
        {
            await Task.Delay(TimeSpan.FromSeconds(5), ct);
            return changeCountToProcess;
        }

        await WaitUntilSaveIsReadyAsync(latest.FullName, ct);
        latest.Refresh();

        if (Volatile.Read(ref _pendingChangeCount) != changeCountToProcess)
        {
            return null;
        }

        return await ParseAndIngestSaveAsync(latest, ct)
            ? changeCountToProcess
            : null;
    }

    private async Task<int> WaitForSaveEventsToSettleAsync(CancellationToken ct)
    {
        var delay = TimeSpan.FromSeconds(5);

        while (!ct.IsCancellationRequested && _uploadControl.IsWatching)
        {
            var countBeforeDelay = Volatile.Read(ref _pendingChangeCount);
            _log.LogDebug("Waiting for save watcher events to settle at change count {ChangeCount}.", countBeforeDelay);
            await Task.Delay(delay, ct);

            var countAfterDelay = Volatile.Read(ref _pendingChangeCount);
            if (countAfterDelay == countBeforeDelay)
            {
                return countAfterDelay;
            }
        }

        return Volatile.Read(ref _pendingChangeCount);
    }

    private async Task<bool> ParseAndIngestSaveAsync(FileInfo latest, CancellationToken ct)
    {
        try
        {
            var (saveHash, countries) = _parser.ParseForSnapshot(latest.FullName);
            if (saveHash == _lastSaveHash)
            {
                return true;
            }

            var snapshotCountries = countries
                .Take(_settings.SnapshotCountryLimit)
                .ToList();
            _status.Post(
                StatusLevel.Info,
                $"Parsed {countries.Count} countries, sending {snapshotCountries.Count}.");

            var snap = new Snapshot
            {
                ChannelId = _ebs.ChannelId!,
                SaveHash = saveHash,
                Countries = snapshotCountries
            };

            return await SendSnapshotAsync(snap, ct);
        }
        catch (IngestRateLimitedException ex)
        {
            _status.Post(StatusLevel.Warning, $"Worker asked to retry ingest at {DateTimeOffset.UtcNow.Add(ex.RetryAfter):HH:mm:ss} UTC.");
            await Task.Delay(ex.RetryAfter, ct);
            return false;
        }
        catch (IngestStaleSequenceException ex)
        {
            _seq = Math.Max(_seq, ex.LastSeq);
            _status.Post(StatusLevel.Info, $"Ingest sequence synchronized with Worker at {ex.LastSeq}.");
            return false;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Ingest failed");
            _status.Post(StatusLevel.Warning, $"Ingest failed: {ex.Message}");
            await Task.Delay(TimeSpan.FromSeconds(10), ct);
            return false;
        }
    }

    private async Task<bool> SendSnapshotAsync(Snapshot snap, CancellationToken ct)
    {
        for (var attempts = 0; attempts < 3; attempts++)
        {
            try
            {
                snap.Seq = ++_seq;
                _status.Post(StatusLevel.Info, $"Ingest seq={_seq} save={snap.SaveHash}");
                await _ebs.IngestAsync(snap);
                _lastAccepted = DateTimeOffset.UtcNow;
                _lastSaveHash = snap.SaveHash;
                _status.Post(StatusLevel.Info, $"Ingest OK (next >= {_lastAccepted.AddMilliseconds(_settings.IngestIntervalMs):HH:mm:ss} UTC)");
                return true;
            }
            catch (IngestStaleSequenceException ex)
            {
                _seq = Math.Max(_seq, ex.LastSeq);
                _status.Post(StatusLevel.Info, $"Ingest sequence synchronized with Worker at {ex.LastSeq}.");
            }
            catch (IngestPubSubFailedException)
            {
                _status.Post(StatusLevel.Warning, "Worker could not publish to Twitch PubSub. Retrying shortly.");
                await Task.Delay(TimeSpan.FromSeconds(10), ct);
            }
            catch (IngestPubSubRejectedException ex)
            {
                _uploadControl.IsWatching = false;
                var upstreamStatus = ex.UpstreamStatus.HasValue ? $" Twitch status: {ex.UpstreamStatus.Value}." : "";
                _status.Post(
                    StatusLevel.Error,
                    $"Worker PubSub publishing is rejected by Twitch.{upstreamStatus} Check the Twitch Extension and Worker configuration before restarting uploads.");
                return false;
            }
        }

        return false;
    }

    private async Task WaitForLocalIngestIntervalAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && _uploadControl.IsWatching)
        {
            var now = DateTimeOffset.UtcNow;
            var due = _lastAccepted + TimeSpan.FromMilliseconds(_settings.IngestIntervalMs);
            if (now >= due) return;

            var wait = due - now;
            await Task.Delay(wait > TimeSpan.FromSeconds(30) ? TimeSpan.FromSeconds(30) : wait, ct);
        }
    }

    private static FileInfo? GetLatestSave(string saveDirectory) =>
        new DirectoryInfo(saveDirectory)
            .GetFiles("*.v3")
            .OrderByDescending(f => f.LastWriteTimeUtc)
            .FirstOrDefault();

    private async Task WaitUntilSaveIsReadyAsync(string path, CancellationToken ct)
    {
        const int requiredStableChecks = 3;
        var stableChecks = 0;
        long? lastLength = null;
        DateTime? lastWriteTimeUtc = null;

        while (!ct.IsCancellationRequested)
        {
            var file = new FileInfo(path);
            if (!file.Exists)
            {
                stableChecks = 0;
                await Task.Delay(TimeSpan.FromMilliseconds(500), ct);
                continue;
            }

            var unchanged = lastLength == file.Length && lastWriteTimeUtc == file.LastWriteTimeUtc;
            if (unchanged && CanOpenForExclusiveRead(path))
            {
                stableChecks++;
                if (stableChecks >= requiredStableChecks) return;
            }
            else
            {
                stableChecks = 0;
            }

            lastLength = file.Length;
            lastWriteTimeUtc = file.LastWriteTimeUtc;
            await Task.Delay(TimeSpan.FromMilliseconds(500), ct);
        }
    }

    private static bool CanOpenForExclusiveRead(string path)
    {
        try
        {
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.None);
            return stream.Length > 0;
        }
        catch (IOException)
        {
            return false;
        }
        catch (UnauthorizedAccessException)
        {
            return false;
        }
    }

    private void WarnIfSaveFormatIsUnsupported()
    {
        var saveFileFormat = _settings.GetConfiguredSaveFileFormat();
        if (IsSupportedSaveFileFormat(saveFileFormat)) return;

        _status.Post(StatusLevel.Warning,
            $"Victoria 3 save_file_format is '{saveFileFormat}'. Set it to 'zip_text_all' or 'text' before streaming.");
    }

    private static bool IsSupportedSaveFileFormat(string saveFileFormat) =>
        string.Equals(saveFileFormat, "zip_text_all", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(saveFileFormat, "text", StringComparison.OrdinalIgnoreCase);

    private string FormatSaveEvent(SaveFileEvent ev) =>
        _diagnostics.FileWatcherDiagnostics
            ? $"Save event ({ev.ChangeType}): {Path.GetFileName(ev.Path)} [{ev.Length:n0} bytes, {ev.LastWriteTimeUtc:HH:mm:ss} UTC]"
            : $"Save changed: {Path.GetFileName(ev.Path)}";
}
