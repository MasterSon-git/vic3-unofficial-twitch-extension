using System;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public sealed class IngestPubSubRejectedException : Exception
{
    public IngestPubSubRejectedException(int? upstreamStatus)
        : base(upstreamStatus.HasValue
            ? $"Twitch rejected the Worker PubSub request with HTTP {upstreamStatus.Value}."
            : "Twitch rejected the Worker PubSub request.")
    {
        UpstreamStatus = upstreamStatus;
    }

    public int? UpstreamStatus { get; }
}
