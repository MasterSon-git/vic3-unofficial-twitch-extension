namespace Vic3Unofficial.Twitch.Desktop.Services;

public interface ISettingsService
{
    string WorkerBaseUrl { get; set; }
    string AutosaveDir { get; set; }
    int IngestIntervalMs { get; set; }
}
