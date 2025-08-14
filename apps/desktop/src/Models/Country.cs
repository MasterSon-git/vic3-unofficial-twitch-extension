namespace Vic3Unofficial.Twitch.Desktop.Models;

public sealed class Country
{
    public string Tag { get; set; } = "";
    public long? Treasury { get; set; }
    public double? Gdp { get; set; }
    public string? MarketId { get; set; }
}
