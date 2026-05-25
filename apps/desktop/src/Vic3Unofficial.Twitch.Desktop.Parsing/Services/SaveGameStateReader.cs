using System;
using System.IO;
using System.IO.Compression;

namespace Vic3Unofficial.Twitch.Desktop.Parsing.Services;

internal static class SaveGameStateReader
{
    private const string GameStateEntryName = "gamestate";
    private const int HeaderProbeBytes = 4096;

    public static SaveGameState Open(string savePath)
    {
        var file = new FileStream(savePath, FileMode.Open, FileAccess.Read, FileShare.Read, bufferSize: 128 * 1024, FileOptions.SequentialScan);
        var zipOffset = FindZipOffset(file);
        if (zipOffset >= 0)
        {
            var zipSlice = new SlicedReadOnlyStream(file, zipOffset, file.Length - zipOffset);
            var archive = new ZipArchive(zipSlice, ZipArchiveMode.Read);
            var entry = archive.GetEntry(GameStateEntryName) ??
                        throw new InvalidDataException("Victoria 3 save does not contain a gamestate entry.");
            return new SaveGameState(entry.Open(), archive, zipSlice, file);
        }

        var textOffset = FindTextOffset(file);
        file.Position = textOffset;
        return new SaveGameState(file);
    }

    private static long FindZipOffset(Stream stream)
    {
        stream.Position = 0;
        Span<byte> buffer = stackalloc byte[HeaderProbeBytes];
        var read = stream.Read(buffer);
        for (var i = 0; i <= read - 4; i++)
        {
            if (buffer[i] == 0x50 && buffer[i + 1] == 0x4B && buffer[i + 2] == 0x03 && buffer[i + 3] == 0x04) return i;
        }

        return -1;
    }

    private static long FindTextOffset(Stream stream)
    {
        stream.Position = 0;
        Span<byte> buffer = stackalloc byte[HeaderProbeBytes];
        var read = stream.Read(buffer);
        if (!StartsWithAscii(buffer[..read], "SAV")) return 0;

        for (var i = 0; i < read; i++)
        {
            if (buffer[i] == (byte)'\n') return i + 1;
        }

        throw new InvalidDataException("Victoria 3 save header is incomplete.");
    }

    private static bool StartsWithAscii(ReadOnlySpan<byte> bytes, string value)
    {
        if (bytes.Length < value.Length) return false;
        for (var i = 0; i < value.Length; i++)
        {
            if (bytes[i] != (byte)value[i]) return false;
        }

        return true;
    }
}
