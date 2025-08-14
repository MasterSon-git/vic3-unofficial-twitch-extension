using System.Collections.Generic;

namespace Vic3Unofficial.Twitch.Desktop.Models;

public sealed class Bootstrap
{
    public string Version { get; set; } = "v1";
    public Dictionary<string, string> CountriesByTag { get; set; } = new();
    public Dictionary<string, string> FlagsByTag { get; set; } = new();
    public Dictionary<string, string> MarketsById { get; set; } = new();
}
