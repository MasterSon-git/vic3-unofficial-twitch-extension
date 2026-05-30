using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Threading;
using Vic3Unofficial.Twitch.Desktop.Models;

namespace Vic3Unofficial.Twitch.Desktop.Infrastructure;

public interface IStatusSink
{
    void Post(StatusLevel level, string message);
    ReadOnlyObservableCollection<StatusItem> Events { get; }
}

public sealed class StatusHub : IStatusSink
{
    private readonly ObservableCollection<StatusItem> _items = new();
    private readonly Dispatcher? _dispatcher;
    public ReadOnlyObservableCollection<StatusItem> Events { get; }

    public StatusHub()
    {
        _dispatcher = Application.Current?.Dispatcher;
        Events = new(_items);
    }

    public void Post(StatusLevel level, string message)
    {
        var item = new StatusItem(System.DateTimeOffset.UtcNow, level, message);
        if (_dispatcher is null)
        {
            Push(item);
            return;
        }

        if (_dispatcher.HasShutdownStarted || _dispatcher.HasShutdownFinished)
        {
            return;
        }

        if (_dispatcher.CheckAccess())
        {
            Push(item);
            return;
        }

        try
        {
            _dispatcher.InvokeAsync(() => Push(item), DispatcherPriority.Background);
        }
        catch (InvalidOperationException)
        {
            // The UI dispatcher can start shutting down while background services stop.
        }
    }

    private void Push(StatusItem item)
    {
        _items.Add(item);
        if (_items.Count > 200) _items.RemoveAt(0);
    }
}
