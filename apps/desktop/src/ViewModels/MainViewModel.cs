using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.DependencyInjection;
using System.Collections.ObjectModel;
using System.Threading.Tasks;
using Vic3Unofficial.Twitch.Desktop.Infrastructure;
using Vic3Unofficial.Twitch.Desktop.Models;
using Vic3Unofficial.Twitch.Desktop.Services;
using Vic3Unofficial.Twitch.Desktop.Views;

namespace Vic3Unofficial.Twitch.Desktop.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private readonly ISettingsService _settings;
    private readonly IEbsClient _ebs;
    private readonly IServiceProvider _services;

    public ReadOnlyObservableCollection<StatusItem> StatusEntries { get; }

    [ObservableProperty] private string _status = "Not paired";
    [ObservableProperty] private string _autosaveDir;
    [ObservableProperty] private bool _isWatching;

    public string WatchingButtonText => IsWatching ? "Stop Watching" : "Start Watching";

    public MainViewModel(ISettingsService settings, IStatusSink statusSink, IEbsClient ebs, IServiceProvider services)
    {
        _settings = settings;
        _ebs = ebs;
        _services = services;
        _autosaveDir = settings.AutosaveDir;
        RefreshPairingStatus();

        StatusEntries = statusSink.Events;
    }

    partial void OnAutosaveDirChanged(string value) => _settings.AutosaveDir = value;

    public async Task InitializeAsync()
    {
        if (string.IsNullOrEmpty(_ebs.IngestToken)) return;

        Status = "Checking saved pairing...";
        await _ebs.ValidateSavedPairingAsync();
        RefreshPairingStatus();
    }

    private void RefreshPairingStatus()
    {
        if (string.IsNullOrEmpty(_ebs.IngestToken))
        {
            Status = "Not paired";
            return;
        }

        Status = _ebs.HasActiveSlot
            ? $"Paired (channel {_ebs.ChannelId})"
            : $"Paired (channel {_ebs.ChannelId}, no active backend slot)";
    }

    [RelayCommand]
    private void ToggleWatching()
    {
        IsWatching = !IsWatching;
        OnPropertyChanged(nameof(WatchingButtonText));
        Status = IsWatching ? "Watching autosaves..." : "Stopped.";
    }

    [RelayCommand]
    private void Pair()
    {
        var dlg = _services.GetRequiredService<PairWindow>();
        dlg.Owner = System.Windows.Application.Current.MainWindow;
        if (dlg.ShowDialog() == true)
        {
            RefreshPairingStatus();
        }
    }

    [RelayCommand]
    private async Task Unpair()
    {
        await _ebs.UnpairAsync();
        RefreshPairingStatus();
    }
}
