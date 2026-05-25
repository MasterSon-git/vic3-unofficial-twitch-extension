using System.Collections.Generic;
using System.Threading.Tasks;
using Vic3Unofficial.Twitch.Desktop.Parsing.Models;

namespace Vic3Unofficial.Twitch.Desktop.Services;

public interface IEbsClient
{
    string BaseUrl { get; }
    string? ChannelId { get; }
    string? IngestToken { get; }
    bool HasActiveSlot { get; }

    Task<bool> CompletePairingAsync(string code);
    Task<bool> ValidateSavedPairingAsync();
    Task UnpairAsync();
    Task IngestAsync(string saveHash, int seq, IReadOnlyCollection<Country> countries);
}
