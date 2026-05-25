using System;
using System.IO;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public sealed class SaveFileWatcher : ISaveFileWatcher
{
    private FileSystemWatcher? _watcher;
    private Action<SaveFileEvent>? _callback;
    private string _lastHash = "";

    public void Start(string directory, Action<SaveFileEvent> onSaveChanged)
    {
        Stop();
        _callback = onSaveChanged;
        _watcher = new FileSystemWatcher(directory)
        {
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
            Filter = "*.v3",
            IncludeSubdirectories = false,
            EnableRaisingEvents = true
        };
        _watcher.Created += OnChanged;
        _watcher.Changed += OnChanged;
        _watcher.Renamed += OnChanged;
    }

    private void OnChanged(object sender, FileSystemEventArgs e)
    {
        var fi = new FileInfo(e.FullPath);
        if (!fi.Exists) return;
        var hash = $"{fi.Name}|{fi.Length}|{fi.LastWriteTimeUtc.Ticks}";
        if (hash == _lastHash) return;
        _lastHash = hash;
        _callback?.Invoke(new SaveFileEvent(fi.FullName, e.ChangeType.ToString(), fi.Length, fi.LastWriteTimeUtc));
    }

    public void Stop()
    {
        if (_watcher != null)
        {
            _watcher.EnableRaisingEvents = false;
            _watcher.Created -= OnChanged;
            _watcher.Changed -= OnChanged;
            _watcher.Renamed -= OnChanged;
            _watcher.Dispose();
            _watcher = null;
        }
    }

    public void Dispose() => Stop();
}
