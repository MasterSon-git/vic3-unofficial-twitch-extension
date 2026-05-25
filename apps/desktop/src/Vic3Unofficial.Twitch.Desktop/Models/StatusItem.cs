using System;

namespace Vic3Unofficial.Twitch.Desktop.Models;

public sealed record StatusItem(DateTimeOffset Timestamp, StatusLevel Level, string Message);
