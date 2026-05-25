using System;
using System.Collections.Generic;

namespace Vic3Unofficial.Twitch.Desktop.Models;

public sealed class Snapshot
{
    public string ChannelId { get; set; } = "";
    public string SaveHash { get; set; } = "";
    public int Seq { get; set; }
    public List<Country> Countries { get; set; } = new();
    public string UpdatedAt { get; set; } = DateTime.UtcNow.ToString("o");
}
