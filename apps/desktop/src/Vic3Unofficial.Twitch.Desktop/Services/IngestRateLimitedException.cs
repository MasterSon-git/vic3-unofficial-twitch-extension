using System;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public sealed class IngestRateLimitedException : Exception
{
    public IngestRateLimitedException(TimeSpan retryAfter)
        : base($"Worker ingest interval has not elapsed. Retry after {retryAfter.TotalSeconds:N0} seconds.")
    {
        RetryAfter = retryAfter;
    }

    public TimeSpan RetryAfter { get; }
}
