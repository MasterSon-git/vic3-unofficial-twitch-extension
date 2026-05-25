using System;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

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
        if (!File.Exists(_victoriaSettingsPath)) return "zip_binary_all";

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(_victoriaSettingsPath));
            if (document.RootElement.TryGetProperty("game", out var game) &&
                game.TryGetProperty("save_file_format", out var format) &&
                format.ValueKind == JsonValueKind.String &&
                !string.IsNullOrWhiteSpace(format.GetString()))
            {
                return format.GetString()!;
            }
        }
        catch
        {
            return "zip_binary_all";
        }

        return "zip_binary_all";
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
}
