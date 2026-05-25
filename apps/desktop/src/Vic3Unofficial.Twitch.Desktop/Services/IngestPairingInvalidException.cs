using System;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public sealed class IngestPairingInvalidException : Exception
{
    public IngestPairingInvalidException()
        : base("Pairing expired or was revoked.")
    {
    }
}
