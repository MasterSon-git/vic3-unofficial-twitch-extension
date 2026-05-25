using System;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public sealed class IngestPermanentException : Exception
{
    public IngestPermanentException(string message)
        : base(message)
    {
    }
}
