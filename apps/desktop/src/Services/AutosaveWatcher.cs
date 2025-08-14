using System;
using System.IO;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public sealed class AutosaveWatcher : IAutosaveWatcher
{
    private FileSystemWatcher? _watcher;
    private Action<string>? _callback;
    private string _lastHash = "";

    public void Start(string directory, Action<string> onNewAutosave)
    {
        Stop();
        _callback = onNewAutosave;
        _watcher = new FileSystemWatcher(directory)
        {
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
            Filter = "*.v3",
            IncludeSubdirectories = false,
            EnableRaisingEvents = true
        };
        _watcher.Created += OnChanged;
        _watcher.Changed += OnChanged;
    }

    private void OnChanged(object sender, FileSystemEventArgs e)
    {
        var fi = new FileInfo(e.FullPath);
        if (!fi.Exists) return;
        var hash = $"{fi.Name}|{fi.Length}|{fi.LastWriteTimeUtc.Ticks}";
        if (hash == _lastHash) return;
        _lastHash = hash;
        _callback?.Invoke(fi.FullName);
    }

    public void Stop()
    {
        if (_watcher != null)
        {
            _watcher.EnableRaisingEvents = false;
            _watcher.Created -= OnChanged;
            _watcher.Changed -= OnChanged;
            _watcher.Dispose();
            _watcher = null;
        }
    }

    public void Dispose() => Stop();
}
