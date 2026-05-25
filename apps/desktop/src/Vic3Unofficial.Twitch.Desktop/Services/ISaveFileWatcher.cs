using System;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public interface ISaveFileWatcher : IDisposable
{
    void Start(string directory, Action<SaveFileEvent> onSaveChanged);
    void Stop();
}

public sealed record SaveFileEvent(string Path, string ChangeType, long Length, DateTime LastWriteTimeUtc);
