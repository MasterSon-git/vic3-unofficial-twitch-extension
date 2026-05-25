using System;
using System.IO;
using Microsoft.Extensions.Logging;

namespace Vic3Unofficial.Twitch.Desktop.Infrastructure;

public sealed class FileLoggerProvider : ILoggerProvider
{
    private readonly string _filePath;
    private readonly object _gate = new();

    public FileLoggerProvider(string filePath)
    {
        _filePath = filePath;
        Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);
    }

    public ILogger CreateLogger(string categoryName) => new FileLogger(_filePath, categoryName, _gate);
    public void Dispose() { }

    private sealed class FileLogger : ILogger
    {
        private readonly string _path;
        private readonly string _category;
        private readonly object _gate;

        public FileLogger(string path, string category, object gate)
        {
            _path = path;
            _category = category;
            _gate = gate;
        }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => NullScope.Instance;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state,
                                Exception? exception, Func<TState, Exception?, string> formatter)
        {
            var msg = $"{DateTime.UtcNow:O} [{logLevel}] {_category}: {formatter(state, exception)}";
            if (exception != null) msg += Environment.NewLine + exception;

            lock (_gate)
            {
                File.AppendAllText(_path, msg + Environment.NewLine);
            }
        }

        private sealed class NullScope : IDisposable
        {
            public static readonly NullScope Instance = new();
            public void Dispose() { }
        }
    }
}
