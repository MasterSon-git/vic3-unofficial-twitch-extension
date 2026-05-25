namespace Vic3Unofficial.Twitch.Desktop.Services;

public interface ISettingsService
{
    string WorkerBaseUrl { get; set; }
    string SaveDir { get; set; }
    int IngestIntervalMs { get; set; }
    int SnapshotCountryLimit { get; set; }
    string GetConfiguredSaveFileFormat();
}
