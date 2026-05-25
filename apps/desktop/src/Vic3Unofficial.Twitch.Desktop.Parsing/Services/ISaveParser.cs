using System.Collections.Generic;
using Vic3Unofficial.Twitch.Desktop.Parsing.Models;

namespace Vic3Unofficial.Twitch.Desktop.Parsing.Services;

public interface ISaveParser
{
    (string saveHash, List<Country> countries) ParseForSnapshot(string savePath);
}
