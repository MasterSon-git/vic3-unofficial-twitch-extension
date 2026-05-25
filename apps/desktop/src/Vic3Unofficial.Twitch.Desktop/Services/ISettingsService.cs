namespace Vic3Unofficial.Twitch.Desktop.Services;

public sealed record VictoriaUiSettings(double? GuiScale, string? SkinTheme, double StreamAspectRatio);

public interface ISettingsService
{
    string WorkerBaseUrl { get; set; }
    string SaveDir { get; set; }
    int IngestIntervalMs { get; set; }
    int SnapshotCountryLimit { get; set; }
    double StreamAspectRatio { get; set; }
    double SuggestedStreamAspectRatio { get; }
    string GetConfiguredSaveFileFormat();
    VictoriaUiSettings GetVictoriaUiSettings();
}
