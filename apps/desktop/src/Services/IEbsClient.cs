using System.Threading.Tasks;
using Vic3Unofficial.Twitch.Desktop.Models;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public interface IEbsClient
{
    string BaseUrl { get; }
    string? ChannelId { get; }
    string? IngestToken { get; }

    Task<bool> CompletePairingAsync(string code);
    Task UploadBootstrapAsync(Bootstrap bootstrap);
    Task IngestAsync(Snapshot snapshot);
}
