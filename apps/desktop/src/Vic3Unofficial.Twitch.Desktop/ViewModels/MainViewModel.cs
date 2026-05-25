using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Win32;
using Vic3Unofficial.Twitch.Desktop.Infrastructure;
using Vic3Unofficial.Twitch.Desktop.Models;
using Vic3Unofficial.Twitch.Desktop.Services;

namespace Vic3Unofficial.Twitch.Desktop.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private readonly ISettingsService _settings;
    private readonly IEbsClient _ebs;
    private readonly IUploadControl _uploadControl;
    private readonly IStatusSink _status;
    private readonly IDialogService _dialogs;

    public ReadOnlyObservableCollection<StatusItem> StatusEntries { get; }

    [ObservableProperty] private string _saveDir;
    [ObservableProperty] private bool _isWatching;
    [ObservableProperty] private string _saveFileFormat = "unknown";

    public bool IsPaired => !string.IsNullOrEmpty(_ebs.IngestToken);
    public bool HasActiveSlot => _ebs.HasActiveSlot;
    public bool IsSaveFolderReady => Directory.Exists(SaveDir);
    public bool IsSaveFormatSupported => IsSupportedSaveFileFormat(SaveFileFormat);

    public string ConnectionStatusText
    {
        get
        {
            if (!IsPaired) return "Not paired";
            return HasActiveSlot ? "Paired and ready" : "Paired, waiting for backend slot";
        }
    }

    public string ConnectionDetailText
    {
        get
        {
            if (!IsPaired) return "Generate a code in Twitch, then pair this uploader.";
            if (!HasActiveSlot) return $"Channel {_ebs.ChannelId} is saved locally, but currently has no active backend slot.";
            return $"Connected to channel {_ebs.ChannelId}.";
        }
    }

    public string SaveFolderStatusText => IsSaveFolderReady ? "Folder found" : "Folder missing";

    public string SaveFormatStatusText => IsSaveFormatSupported
        ? $"Victoria 3 save format: {SaveFileFormat}"
        : $"Unsupported save format: {SaveFileFormat}";

    public string WatchingButtonText => IsWatching ? "Stop uploads" : "Start uploads";
    public string UploadStatusText => IsWatching ? "Watching saves" : "Uploads paused";

    public MainViewModel(
        ISettingsService settings,
        IStatusSink statusSink,
        IEbsClient ebs,
        IUploadControl uploadControl,
        IDialogService dialogs)
    {
        _settings = settings;
        _ebs = ebs;
        _uploadControl = uploadControl;
        _status = statusSink;
        _dialogs = dialogs;
        _saveDir = settings.SaveDir;
        StatusEntries = statusSink.Events;
        SaveFileFormat = settings.GetConfiguredSaveFileFormat();

        _uploadControl.StateChanged += OnUploadControlStateChanged;
        RefreshComputedState();
    }

    public async Task InitializeAsync()
    {
        SaveFileFormat = _settings.GetConfiguredSaveFileFormat();
        if (!string.IsNullOrEmpty(_ebs.IngestToken))
        {
            await _ebs.ValidateSavedPairingAsync();
        }

        RefreshComputedState();
    }

    partial void OnSaveDirChanged(string value)
    {
        _settings.SaveDir = value;
        RefreshComputedState();
    }

    partial void OnIsWatchingChanged(bool value) => RefreshComputedState();

    partial void OnSaveFileFormatChanged(string value) => RefreshComputedState();

    [RelayCommand(CanExecute = nameof(CanToggleWatching))]
    private void ToggleWatching()
    {
        SaveFileFormat = _settings.GetConfiguredSaveFileFormat();

        if (!IsWatching && !IsSaveFolderReady)
        {
            _status.Post(StatusLevel.Error, $"Save folder does not exist: {SaveDir}");
            RefreshComputedState();
            return;
        }

        if (!IsWatching && !IsSaveFormatSupported)
        {
            _status.Post(StatusLevel.Warning,
                $"Victoria 3 save_file_format is '{SaveFileFormat}'. Use 'zip_text_all' or 'text' before streaming.");
        }

        _uploadControl.IsWatching = !IsWatching;
        IsWatching = _uploadControl.IsWatching;
        RefreshComputedState();
    }

    [RelayCommand]
    private void BrowseSaveFolder()
    {
        var dialog = new OpenFolderDialog
        {
            Title = "Select Victoria 3 save folder",
            InitialDirectory = Directory.Exists(SaveDir)
                ? SaveDir
                : Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments)
        };

        if (dialog.ShowDialog(Application.Current.MainWindow) == true)
        {
            SaveDir = dialog.FolderName;
        }
    }

    [RelayCommand]
    private void RefreshSettings()
    {
        SaveFileFormat = _settings.GetConfiguredSaveFileFormat();
        RefreshComputedState();
    }

    [RelayCommand]
    private async Task Pair()
    {
        if (await _dialogs.ShowPairDialogAsync())
        {
            RefreshComputedState();
        }
    }

    [RelayCommand(CanExecute = nameof(IsPaired))]
    private async Task Unpair()
    {
        _uploadControl.IsWatching = false;
        IsWatching = false;
        await _ebs.UnpairAsync();
        RefreshComputedState();
    }

    private bool CanToggleWatching() => IsPaired && HasActiveSlot;

    private void OnUploadControlStateChanged(object? sender, EventArgs e)
    {
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher is not null && !dispatcher.CheckAccess())
        {
            dispatcher.Invoke(SyncWatchingState);
            return;
        }

        SyncWatchingState();
    }

    private void SyncWatchingState()
    {
        IsWatching = _uploadControl.IsWatching;
        RefreshComputedState();
    }

    private void RefreshComputedState()
    {
        OnPropertyChanged(nameof(IsPaired));
        OnPropertyChanged(nameof(HasActiveSlot));
        OnPropertyChanged(nameof(IsSaveFolderReady));
        OnPropertyChanged(nameof(IsSaveFormatSupported));
        OnPropertyChanged(nameof(ConnectionStatusText));
        OnPropertyChanged(nameof(ConnectionDetailText));
        OnPropertyChanged(nameof(SaveFolderStatusText));
        OnPropertyChanged(nameof(SaveFormatStatusText));
        OnPropertyChanged(nameof(WatchingButtonText));
        OnPropertyChanged(nameof(UploadStatusText));
        ToggleWatchingCommand.NotifyCanExecuteChanged();
        UnpairCommand.NotifyCanExecuteChanged();
    }

    private static bool IsSupportedSaveFileFormat(string saveFileFormat) =>
        string.Equals(saveFileFormat, "zip_text_all", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(saveFileFormat, "text", StringComparison.OrdinalIgnoreCase);
}
