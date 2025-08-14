using System;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public interface IAutosaveWatcher : IDisposable
{
    void Start(string directory, Action<string> onNewAutosave);
    void Stop();
}
