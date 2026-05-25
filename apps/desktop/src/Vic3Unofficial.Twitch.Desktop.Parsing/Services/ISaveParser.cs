using System.Collections.Generic;
using Vic3Unofficial.Twitch.Desktop.Models;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public interface ISaveParser
{
    (string saveHash, List<Country> countries) ParseForSnapshot(string savePath);
}
