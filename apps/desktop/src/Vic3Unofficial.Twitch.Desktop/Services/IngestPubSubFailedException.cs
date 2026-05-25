using System;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public sealed class IngestPubSubFailedException : Exception
{
    public IngestPubSubFailedException()
        : base("Worker could not publish the snapshot to Twitch PubSub.")
    {
    }
}
