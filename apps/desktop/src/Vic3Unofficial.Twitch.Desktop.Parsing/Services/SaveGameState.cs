using System;
using System.IO;

namespace Vic3Unofficial.Twitch.Desktop.Services;

internal sealed class SaveGameState : IDisposable
{
    private readonly IDisposable[] _ownedResources;

    public SaveGameState(Stream stream, params IDisposable[] ownedResources)
    {
        Stream = stream;
        _ownedResources = ownedResources;
    }

    public Stream Stream { get; }

    public void Dispose()
    {
        Stream.Dispose();

        foreach (var resource in _ownedResources)
        {
            resource.Dispose();
        }
    }
}
