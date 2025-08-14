using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Collections.ObjectModel;
using Vic3Unofficial.Twitch.Desktop.Infrastructure;
using Vic3Unofficial.Twitch.Desktop.Models;
using Vic3Unofficial.Twitch.Desktop.Services;
using Vic3Unofficial.Twitch.Desktop.Views;
using Microsoft.Extensions.DependencyInjection;

namespace Vic3Unofficial.Twitch.Desktop.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private readonly ISettingsService _settings;
    public ReadOnlyObservableCollection<StatusItem> StatusEntries { get; }

    [ObservableProperty] private string _status = "Not paired";
    [ObservableProperty] private string _autosaveDir;
    [ObservableProperty] private bool _isWatching; // optional fürs UI – hier nicht direkt gesteuert
    public string WatchingButtonText => IsWatching ? "Stop Watching" : "Start Watching";

    private readonly IEbsClient _ebs;
    private readonly IServiceProvider _services;

    public MainViewModel(ISettingsService settings, IStatusSink statusSink, IEbsClient ebs, IServiceProvider services)
    {
        _settings = settings;
        _ebs = ebs;
        _services = services;
        _autosaveDir = settings.AutosaveDir;

       StatusEntries = statusSink.Events;
    }

    partial void OnAutosaveDirChanged(string value) => _settings.AutosaveDir = value;

    [RelayCommand]
    private void ToggleWatching()
    {
        IsWatching = !IsWatching;
        OnPropertyChanged(nameof(WatchingButtonText));
        Status = IsWatching ? "Watching autosaves…" : "Stopped.";
    }

    [RelayCommand]
    private async System.Threading.Tasks.Task UploadBootstrapAsync()
    {
        if (string.IsNullOrEmpty(_ebs.IngestToken))
        {
            Status = "Please pair first.";
            return;
        }

        try
        {
            var boot = new Bootstrap
            {
                Version = "v1",
                CountriesByTag = { ["PRU"] = "Prussia", ["FRA"] = "France" },
                FlagsByTag = { ["PRU"] = "https://example.com/flags/PRU.png", ["FRA"] = "https://example.com/flags/FRA.png" },
                MarketsById = { ["german_market"] = "German Market", ["french_market"] = "French Market" }
            };
            await _ebs.UploadBootstrapAsync(boot);
            Status = "Bootstrap uploaded.";
        }
        catch (System.Exception ex)
        {
            Status = $"Bootstrap error: {ex.Message}";
        }
    }

    [RelayCommand]
    private void Pair()
    {
        var dlg = _services.GetRequiredService<PairWindow>();
        dlg.Owner = System.Windows.Application.Current.MainWindow;
        if (dlg.ShowDialog() == true)
        {
            Status = _ebs.IngestToken is null ? "Pairing failed" : $"Paired (channel { _ebs.ChannelId })";
        }
    }
}
