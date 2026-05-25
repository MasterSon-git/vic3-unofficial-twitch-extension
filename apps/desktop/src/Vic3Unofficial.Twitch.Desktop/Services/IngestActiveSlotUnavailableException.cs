using System;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public sealed class IngestActiveSlotUnavailableException : Exception
{
    public IngestActiveSlotUnavailableException()
        : base("No active backend slot is currently available.")
    {
    }
}
