using System;
using System.IO;

namespace Vic3Unofficial.Twitch.Desktop.Services;

internal sealed class PrefixedReadOnlyStream : Stream
{
    private readonly byte[] _prefix;
    private readonly Stream _inner;
    private int _prefixPosition;

    public PrefixedReadOnlyStream(ReadOnlySpan<byte> prefix, Stream inner)
    {
        _prefix = prefix.ToArray();
        _inner = inner;
    }

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }

    public override int Read(byte[] buffer, int offset, int count)
    {
        var totalRead = 0;

        if (_prefixPosition < _prefix.Length)
        {
            var prefixRead = Math.Min(count, _prefix.Length - _prefixPosition);
            Array.Copy(_prefix, _prefixPosition, buffer, offset, prefixRead);
            _prefixPosition += prefixRead;
            totalRead += prefixRead;
            offset += prefixRead;
            count -= prefixRead;
        }

        if (count > 0)
        {
            totalRead += _inner.Read(buffer, offset, count);
        }

        return totalRead;
    }

    public override int Read(Span<byte> buffer)
    {
        var totalRead = 0;

        if (_prefixPosition < _prefix.Length)
        {
            var prefixRead = Math.Min(buffer.Length, _prefix.Length - _prefixPosition);
            _prefix.AsSpan(_prefixPosition, prefixRead).CopyTo(buffer);
            _prefixPosition += prefixRead;
            totalRead += prefixRead;
            buffer = buffer[prefixRead..];
        }

        if (!buffer.IsEmpty)
        {
            totalRead += _inner.Read(buffer);
        }

        return totalRead;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _inner.Dispose();
        base.Dispose(disposing);
    }

    public override void Flush()
    {
    }

    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
}
