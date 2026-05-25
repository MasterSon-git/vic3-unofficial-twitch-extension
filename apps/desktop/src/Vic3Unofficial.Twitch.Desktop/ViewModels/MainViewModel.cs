using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Win32;
using Vic3Unofficial.Twitch.Desktop.Infrastructure;
using Vic3Unofficial.Twitch.Desktop.Models;
using Vic3Unofficial.Twitch.Desktop.Services;

namespace Vic3Unofficial.Twitch.Desktop.ViewModels;

public sealed record StreamAspectRatioOption(string Label, double Value);

public partial class MainViewModel : ObservableObject
{
    private readonly ISettingsService _settings;
    private readonly IEbsClient _ebs;
    private readonly IUploadControl _uploadControl;
    private readonly IStatusSink _status;
    private readonly IDialogService _dialogs;

    public ReadOnlyObservableCollection<StatusItem> StatusEntries { get; }
    public IReadOnlyList<StreamAspectRatioOption> StreamAspectRatioOptions { get; }

    [ObservableProperty] private string _saveDir;
    [ObservableProperty] private bool _isWatching;
    [ObservableProperty] private string _saveFileFormat = "unknown";
    [ObservableProperty] private double _streamAspectRatio;

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
    public string StreamAspectRatioStatusText => $"Stream aspect ratio: {FormatAspectRatio(StreamAspectRatio)}";

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
        StreamAspectRatioOptions = BuildStreamAspectRatioOptions(settings.SuggestedStreamAspectRatio, settings.StreamAspectRatio);
        _saveDir = settings.SaveDir;
        _streamAspectRatio = settings.StreamAspectRatio;
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

    partial void OnStreamAspectRatioChanged(double value)
    {
        _settings.StreamAspectRatio = value;
        RefreshComputedState();
    }

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
        StreamAspectRatio = _settings.StreamAspectRatio;
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
        OnPropertyChanged(nameof(StreamAspectRatioStatusText));
        OnPropertyChanged(nameof(WatchingButtonText));
        OnPropertyChanged(nameof(UploadStatusText));
        ToggleWatchingCommand.NotifyCanExecuteChanged();
        UnpairCommand.NotifyCanExecuteChanged();
    }

    private static bool IsSupportedSaveFileFormat(string saveFileFormat) =>
        string.Equals(saveFileFormat, "zip_text_all", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(saveFileFormat, "text", StringComparison.OrdinalIgnoreCase);

    private static IReadOnlyList<StreamAspectRatioOption> BuildStreamAspectRatioOptions(double suggested, double current)
    {
        var options = new List<StreamAspectRatioOption>
        {
            new($"Primary monitor ({FormatAspectRatio(suggested)})", suggested),
        };

        AddIfMissing(options, "16:9", 16.0 / 9.0);
        AddIfMissing(options, "16:10", 16.0 / 10.0);
        AddIfMissing(options, "21:9", 21.0 / 9.0);
        AddIfMissing(options, "32:9", 32.0 / 9.0);
        AddIfMissing(options, $"Current custom ({FormatAspectRatio(current)})", current);
        return options;
    }

    private static void AddIfMissing(List<StreamAspectRatioOption> options, string label, double value)
    {
        if (options.Any(option => Math.Abs(option.Value - value) < 0.001)) return;
        options.Add(new StreamAspectRatioOption(label, value));
    }

    private static string FormatAspectRatio(double value)
    {
        if (Math.Abs(value - 16.0 / 9.0) < 0.001) return "16:9";
        if (Math.Abs(value - 16.0 / 10.0) < 0.001) return "16:10";
        if (Math.Abs(value - 21.0 / 9.0) < 0.001) return "21:9";
        if (Math.Abs(value - 32.0 / 9.0) < 0.001) return "32:9";
        return $"{value:0.###}:1";
    }
}
