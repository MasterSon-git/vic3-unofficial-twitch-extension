namespace Vic3Unofficial.Twitch.Desktop.Models;

public sealed class Country
{
    public string Tag { get; set; } = "";
    public int? Score { get; set; }
    public string? Rank { get; set; }
    public double? Prestige { get; set; }
    public double? Treasury { get; set; }
    public double? Gdp { get; set; }
    public string? MarketId { get; set; }
}
