using System;

namespace Vic3Unofficial.Twitch.Desktop.Infrastructure;

public interface IUploadControl
{
    bool IsWatching { get; set; }
    event EventHandler? StateChanged;
}

public sealed class UploadControl : IUploadControl
{
    private bool _isWatching;

    public bool IsWatching
    {
        get => _isWatching;
        set
        {
            if (_isWatching == value) return;
            _isWatching = value;
            StateChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    public event EventHandler? StateChanged;
}
