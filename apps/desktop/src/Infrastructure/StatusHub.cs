using System.Collections.ObjectModel;
using System.Windows;
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
    public ReadOnlyObservableCollection<StatusItem> Events { get; }

    public StatusHub() => Events = new(_items);

    public void Post(StatusLevel level, string message)
    {
        var item = new StatusItem(System.DateTimeOffset.UtcNow, level, message);
        var d = Application.Current?.Dispatcher;
        if (d != null && !d.CheckAccess()) d.Invoke(() => Push(item)); else Push(item);
    }

    private void Push(StatusItem item)
    {
        _items.Add(item);
        if (_items.Count > 200) _items.RemoveAt(0);
    }
}
