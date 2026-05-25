using System;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public sealed class IngestDuplicateSaveException : Exception
{
    public IngestDuplicateSaveException()
        : base("Worker already accepted this save.")
    {
    }
}
