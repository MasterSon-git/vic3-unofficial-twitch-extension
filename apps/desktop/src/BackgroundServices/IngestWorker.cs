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
    private readonly IAutosaveWatcher _watcher;
    private readonly ISaveParser _parser;
    private readonly ISettingsService _settings;

    private string? _lastSaveHash;
    private DateTimeOffset _lastAccepted = DateTimeOffset.MinValue;
    private int _seq;
    private string? _pendingPath;

    public IngestWorker(
        ILogger<IngestWorker> log,
        IStatusSink status,
        IEbsClient ebs,
        IAutosaveWatcher watcher,
        ISaveParser parser,
        ISettingsService settings)
    {
        _log = log; _status = status; _ebs = ebs; _watcher = watcher; _parser = parser; _settings = settings;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        _status.Post(StatusLevel.Info, "Ingest worker started.");
        _watcher.Start(_settings.AutosaveDir, p =>
        {
            _pendingPath = p;
            _status.Post(StatusLevel.Info, $"Autosave detected: {Path.GetFileName(p)}");
        });

        try
        {
            while (!ct.IsCancellationRequested)
            {
                var now = DateTimeOffset.UtcNow;
                var due = _lastAccepted + TimeSpan.FromMilliseconds(_settings.IngestIntervalMs);

                // Noch nicht gepaired?
                if (string.IsNullOrEmpty(_ebs.IngestToken) || string.IsNullOrEmpty(_ebs.ChannelId))
                {
                    await Task.Delay(TimeSpan.FromSeconds(2), ct);
                    continue;
                }

                // Kein neues Autosave?
                if (_pendingPath is null)
                {
                    await Task.Delay(TimeSpan.FromSeconds(2), ct);
                    continue;
                }

                // Intervall einhalten (5 Min), außer Server bietet Fast-Path bei neuem save_hash – wir schicken erst nach Intervall.
                if (now < due)
                {
                    var wait = due - now;
                    // tickweise warten, damit Cancel schnell greift
                    await Task.Delay(wait > TimeSpan.FromSeconds(30) ? TimeSpan.FromSeconds(30) : wait, ct);
                    continue;
                }

                // Neuestes Save ermitteln
                var di = new DirectoryInfo(_settings.AutosaveDir);
                var latest = di.Exists ? di.GetFiles("*.v3").OrderByDescending(f => f.LastWriteTimeUtc).FirstOrDefault() : null;
                if (latest is null)
                {
                    await Task.Delay(TimeSpan.FromSeconds(5), ct);
                    continue;
                }

                var (saveHash, countries) = _parser.ParseForSnapshot(latest.FullName);
                if (saveHash == _lastSaveHash)
                {
                    // Nichts Neues
                    _pendingPath = null;
                    await Task.Delay(TimeSpan.FromSeconds(5), ct);
                    continue;
                }

                var snap = new Snapshot
                {
                    ChannelId = _ebs.ChannelId!,
                    SaveHash = saveHash,
                    Seq = ++_seq,
                    Countries = countries
                };

                try
                {
                    _status.Post(StatusLevel.Info, $"Ingest seq={_seq} save={saveHash}");
                    await _ebs.IngestAsync(snap);
                    _lastAccepted = DateTimeOffset.UtcNow;
                    _lastSaveHash = saveHash;
                    _pendingPath = null;
                    _status.Post(StatusLevel.Info, $"Ingest OK (next ≥ {_lastAccepted.AddMilliseconds(_settings.IngestIntervalMs):HH:mm:ss} UTC)");
                }
                catch (Exception ex)
                {
                    _log.LogWarning(ex, "Ingest failed");
                    _status.Post(StatusLevel.Warning, $"Ingest failed: {ex.Message}");
                    // kurz warten, dann neu evaluieren
                    await Task.Delay(TimeSpan.FromSeconds(10), ct);
                }
            }
        }
        finally
        {
            _watcher.Stop();
            _status.Post(StatusLevel.Info, "Ingest worker stopped.");
        }
    }
}
