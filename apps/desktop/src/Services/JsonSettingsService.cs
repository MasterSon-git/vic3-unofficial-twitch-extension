using System;
using System.IO;
using System.Text.Json;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public sealed class JsonSettingsService : ISettingsService
{
    private sealed class Model
    {
        public string WorkerBaseUrl { get; set; } =
            "https://vic3-unofficial-twitch-ebs.masterharz-ss.workers.dev";
        public string AutosaveDir { get; set; } =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                         "Paradox Interactive", "Victoria 3", "save games");
        public int IngestIntervalMs { get; set; } = 300000; // 5min
    }

    private readonly string _settingsPath;
    private Model _m;

    public JsonSettingsService()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                               "Vic3UnofficialTwitch");
        Directory.CreateDirectory(dir);
        _settingsPath = Path.Combine(dir, "settings.json");
        _m = LoadInternal();
    }

    public string WorkerBaseUrl { get => _m.WorkerBaseUrl; set { _m.WorkerBaseUrl = value; Save(); } }
    public string AutosaveDir { get => _m.AutosaveDir; set { _m.AutosaveDir = value; Save(); } }
    public int IngestIntervalMs { get => _m.IngestIntervalMs; set { _m.IngestIntervalMs = value; Save(); } }

    private Model LoadInternal()
    {
        if (!File.Exists(_settingsPath)) return new Model();
        try { return JsonSerializer.Deserialize<Model>(File.ReadAllText(_settingsPath)) ?? new Model(); }
        catch { return new Model(); }
    }

    private void Save()
    {
        var json = JsonSerializer.Serialize(_m, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(_settingsPath, json);
    }
}
