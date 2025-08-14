using System.Collections.Generic;
using System.IO;
using Vic3Unofficial.Twitch.Desktop.Models;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public sealed class SaveParser : ISaveParser
{
    public (string saveHash, List<Country> countries) ParseForSnapshot(string savePath)
    {
        var fi = new FileInfo(savePath);
        var saveHash = $"{fi.Name}-{fi.Length}-{fi.LastWriteTimeUtc.Ticks}".Replace(" ", "_");
        var countries = new List<Country>
        {
            new Country { Tag="PRU", Treasury=1234567, MarketId="german_market" },
            new Country { Tag="FRA", Treasury=7654321, MarketId="french_market" }
        };
        return (saveHash, countries);
    }
}
