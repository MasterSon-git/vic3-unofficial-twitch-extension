using System;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public sealed class IngestTransientException : Exception
{
    public IngestTransientException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
