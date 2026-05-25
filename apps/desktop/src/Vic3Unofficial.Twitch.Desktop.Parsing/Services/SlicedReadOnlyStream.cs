using System;
using System.IO;

namespace Vic3Unofficial.Twitch.Desktop.Services;

internal sealed class SlicedReadOnlyStream : Stream
{
    private readonly Stream _inner;
    private readonly long _start;
    private readonly long _length;
    private long _position;

    public SlicedReadOnlyStream(Stream inner, long start, long length)
    {
        if (!inner.CanSeek) throw new ArgumentException("Inner stream must be seekable.", nameof(inner));
        if (start < 0) throw new ArgumentOutOfRangeException(nameof(start));
        if (length < 0) throw new ArgumentOutOfRangeException(nameof(length));

        _inner = inner;
        _start = start;
        _length = length;
    }

    public override bool CanRead => true;
    public override bool CanSeek => true;
    public override bool CanWrite => false;
    public override long Length => _length;

    public override long Position
    {
        get => _position;
        set => Seek(value, SeekOrigin.Begin);
    }

    public override int Read(byte[] buffer, int offset, int count)
    {
        if (_position >= _length) return 0;

        var remaining = _length - _position;
        var bytesToRead = (int)Math.Min(count, remaining);
        _inner.Position = _start + _position;
        var read = _inner.Read(buffer, offset, bytesToRead);
        _position += read;
        return read;
    }

    public override int Read(Span<byte> buffer)
    {
        if (_position >= _length) return 0;

        var remaining = _length - _position;
        var bytesToRead = (int)Math.Min(buffer.Length, remaining);
        _inner.Position = _start + _position;
        var read = _inner.Read(buffer[..bytesToRead]);
        _position += read;
        return read;
    }

    public override long Seek(long offset, SeekOrigin origin)
    {
        var target = origin switch
        {
            SeekOrigin.Begin => offset,
            SeekOrigin.Current => _position + offset,
            SeekOrigin.End => _length + offset,
            _ => throw new ArgumentOutOfRangeException(nameof(origin))
        };

        if (target < 0) throw new IOException("Cannot seek before the beginning of the stream.");
        _position = target;
        return _position;
    }

    public override void Flush()
    {
    }

    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
}
