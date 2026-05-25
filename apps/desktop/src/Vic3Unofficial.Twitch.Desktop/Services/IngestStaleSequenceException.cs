using System;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public sealed class IngestStaleSequenceException : Exception
{
    public IngestStaleSequenceException(int lastSeq)
        : base($"Worker already accepted sequence {lastSeq}.")
    {
        LastSeq = lastSeq;
    }

    public int LastSeq { get; }
}
