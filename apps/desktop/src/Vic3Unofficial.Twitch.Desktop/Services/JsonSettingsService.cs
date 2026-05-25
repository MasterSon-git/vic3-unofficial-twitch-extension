using System;
using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public sealed class JsonSettingsService : ISettingsService
{
    private sealed class Model
    {
        public string WorkerBaseUrl { get; set; } =
            "https://vic3-unofficial-twitch-ebs.masterharz-ss.workers.dev";
        public string SaveDir { get; set; } =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                         "Paradox Interactive", "Victoria 3", "save games");
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? AutosaveDir { get; set; }
        public int IngestIntervalMs { get; set; } = 300000; // 5min
        public int SnapshotCountryLimit { get; set; } = 30;
        public double StreamAspectRatio { get; set; } = GetPrimaryMonitorAspectRatio();
    }

    private readonly string _settingsPath;
    private readonly string _victoriaSettingsPath;
    private Model _m;

    public JsonSettingsService()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                               "Vic3UnofficialTwitch");
        Directory.CreateDirectory(dir);
        _settingsPath = Path.Combine(dir, "settings.json");
        _victoriaSettingsPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                                             "Paradox Interactive", "Victoria 3", "pdx_settings.json");
        _m = LoadInternal();
    }

    public string WorkerBaseUrl { get => _m.WorkerBaseUrl; set { _m.WorkerBaseUrl = value; Save(); } }
    public string SaveDir { get => _m.SaveDir; set { _m.SaveDir = value; Save(); } }
    public int IngestIntervalMs { get => _m.IngestIntervalMs; set { _m.IngestIntervalMs = value; Save(); } }
    public double StreamAspectRatio
    {
        get => ClampStreamAspectRatio(_m.StreamAspectRatio);
        set
        {
            _m.StreamAspectRatio = ClampStreamAspectRatio(value);
            Save();
        }
    }

    public double SuggestedStreamAspectRatio => GetPrimaryMonitorAspectRatio();

    public int SnapshotCountryLimit
    {
        get => Math.Clamp(_m.SnapshotCountryLimit, 1, 300);
        set
        {
            _m.SnapshotCountryLimit = Math.Clamp(value, 1, 300);
            Save();
        }
    }

    public string GetConfiguredSaveFileFormat()
    {
        using var document = TryOpenVictoriaSettings();
        if (document is null) return "zip_binary_all";

        return TryGetString(document.RootElement, "game", "save_file_format") ?? "zip_binary_all";
    }

    public VictoriaUiSettings GetVictoriaUiSettings()
    {
        using var document = TryOpenVictoriaSettings();
        if (document is null) return new VictoriaUiSettings(null, null, StreamAspectRatio);

        var guiScale = TryGetDouble(document.RootElement, "GUI", "scale");
        var skinTheme = TryGetString(document.RootElement, "Theme", "selected_ui_skin_theme");
        return new VictoriaUiSettings(guiScale, skinTheme, StreamAspectRatio);
    }

    private Model LoadInternal()
    {
        if (!File.Exists(_settingsPath)) return new Model();
        try
        {
            var json = File.ReadAllText(_settingsPath);
            var model = JsonSerializer.Deserialize<Model>(json) ?? new Model();
            using var document = JsonDocument.Parse(json);
            var hasSaveDir = document.RootElement.TryGetProperty(nameof(Model.SaveDir), out _);
            if (!hasSaveDir && !string.IsNullOrWhiteSpace(model.AutosaveDir))
            {
                model.SaveDir = model.AutosaveDir;
            }
            model.AutosaveDir = null;
            return model;
        }
        catch { return new Model(); }
    }

    private void Save()
    {
        var json = JsonSerializer.Serialize(_m, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(_settingsPath, json);
    }

    private static double ClampStreamAspectRatio(double value) =>
        double.IsFinite(value) ? Math.Clamp(value, 1.0, 4.0) : GetPrimaryMonitorAspectRatio();

    private static double GetPrimaryMonitorAspectRatio()
    {
        var width = SystemParameters.PrimaryScreenWidth;
        var height = SystemParameters.PrimaryScreenHeight;
        if (width <= 0 || height <= 0) return 16.0 / 9.0;
        return ClampAspectRatioWithoutFallback(width / height);
    }

    private static double ClampAspectRatioWithoutFallback(double value) =>
        double.IsFinite(value) ? Math.Clamp(value, 1.0, 4.0) : 16.0 / 9.0;

    private JsonDocument? TryOpenVictoriaSettings()
    {
        if (!File.Exists(_victoriaSettingsPath)) return null;

        try
        {
            return JsonDocument.Parse(File.ReadAllText(_victoriaSettingsPath));
        }
        catch
        {
            return null;
        }
    }

    private static string? TryGetString(JsonElement root, string sectionName, string propertyName)
    {
        if (root.TryGetProperty(sectionName, out var section) &&
            section.TryGetProperty(propertyName, out var property) &&
            property.ValueKind == JsonValueKind.String &&
            !string.IsNullOrWhiteSpace(property.GetString()))
        {
            return property.GetString();
        }

        return null;
    }

    private static double? TryGetDouble(JsonElement root, string sectionName, string propertyName)
    {
        if (!root.TryGetProperty(sectionName, out var section) ||
            !section.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        return property.ValueKind switch
        {
            JsonValueKind.Number when property.TryGetDouble(out var value) => value,
            JsonValueKind.String when double.TryParse(
                property.GetString(),
                NumberStyles.Float,
                CultureInfo.InvariantCulture,
                out var value) => value,
            _ => null
        };
    }
}
