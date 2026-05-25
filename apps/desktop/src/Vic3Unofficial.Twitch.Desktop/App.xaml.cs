using System;
using System.CommandLine;
using System.IO;
using System.Net.Http;
using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Vic3Unofficial.Twitch.Desktop.BackgroundServices;
using Vic3Unofficial.Twitch.Desktop.Infrastructure;
using Vic3Unofficial.Twitch.Desktop.Services;
using Vic3Unofficial.Twitch.Desktop.ViewModels;
using Vic3Unofficial.Twitch.Desktop.Views;

namespace Vic3Unofficial.Twitch.Desktop;

public partial class App : Application
{
    public static LogLevel StartupLogLevel { get; set; } = LogLevel.Warning;
    public static DesktopDiagnostics StartupDiagnostics { get; set; } = new();
    public static IHost Host { get; private set; } = null!;

    protected override void OnStartup(StartupEventArgs e)
    {
#if DEBUG
        var parsedLogLevel = LogLevel.Debug;
#else
        var parsedLogLevel = LogLevel.Warning;
#endif
        var startupOptions = ParseStartupOptions(e.Args, parsedLogLevel);

        StartupLogLevel = startupOptions.LogLevel;
        StartupDiagnostics = startupOptions.Diagnostics;

        base.OnStartup(e);

        Host = Microsoft.Extensions.Hosting.Host
            .CreateDefaultBuilder()
            .ConfigureLogging(lb =>
            {
                lb.ClearProviders();
                lb.AddProvider(new FileLoggerProvider(GetLogFilePath()));
#if DEBUG
                lb.AddConsole();
#endif
                lb.SetMinimumLevel(StartupLogLevel);
            })
            .ConfigureServices(services =>
            {
                // Infrastructure
                services.AddSingleton<IStatusSink, StatusHub>();
                services.AddSingleton<ITokenStore, TokenStore>();
                services.AddSingleton<IUploadControl, UploadControl>();
                services.AddSingleton(StartupDiagnostics);

                // Settings
                services.AddSingleton<ISettingsService, JsonSettingsService>();

                // HttpClient + EBS. The client carries the current pairing token, so it must be shared across views.
                services.AddHttpClient("EbsClient");
                services.AddSingleton<IEbsClient>(sp => new EbsClient(
                    sp.GetRequiredService<IHttpClientFactory>().CreateClient("EbsClient"),
                    sp.GetRequiredService<ISettingsService>(),
                    sp.GetRequiredService<ITokenStore>(),
                    sp.GetRequiredService<ILogger<EbsClient>>(),
                    sp.GetRequiredService<IStatusSink>()));

                // Domain Services
                services.AddSingleton<ISaveFileWatcher, SaveFileWatcher>();
                services.AddSingleton<ISaveParser, SaveParser>();

                // Background worker
                services.AddHostedService<IngestWorker>();

                // VMs
                services.AddSingleton<MainViewModel>();
                services.AddTransient<PairViewModel>();

                // Views
                services.AddSingleton<MainWindow>();
                services.AddTransient<PairWindow>();
            })
            .Build();

        Host.StartAsync().GetAwaiter().GetResult();
        Host.Services.GetRequiredService<ILogger<App>>()
            .LogInformation("Desktop app started. Log file: {LogFile}", GetLogFilePath());

        var main = Host.Services.GetRequiredService<MainWindow>();
        MainWindow = main;
        main.Show();
    }

    private static string GetLogFilePath()
    {
        var logDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Vic3UnofficialTwitch",
            "logs");

        Directory.CreateDirectory(logDir);
        return Path.Combine(logDir, "app.log");
    }

    private sealed record StartupOptions(LogLevel LogLevel, DesktopDiagnostics Diagnostics);

    private static StartupOptions ParseStartupOptions(string[] args, LogLevel fallbackLogLevel)
    {
        var logLevelOption = new Option<LogLevel>("--logLevel")
        {
            Description = "Specifies minimum log level (Trace, Debug, Information, Warning, Error, Critical)."
        };
        var fileWatcherDiagnosticsOption = new Option<bool>("--fileWatcherDiagnostics")
        {
            Description = "Shows detailed file watcher events in the activity log."
        };
        var root = new RootCommand("Vic3 Unofficial Twitch Desktop Uploader")
        {
            TreatUnmatchedTokensAsErrors = false
        };
        root.Add(logLevelOption);
        root.Add(fileWatcherDiagnosticsOption);

        var parseResult = root.Parse(args);
        if (parseResult.Errors.Count > 0)
        {
            return new StartupOptions(fallbackLogLevel, new DesktopDiagnostics());
        }

        var logLevel = parseResult.GetResult(logLevelOption) is null
            ? fallbackLogLevel
            : parseResult.GetValue(logLevelOption);

        return new StartupOptions(
            logLevel,
            new DesktopDiagnostics
            {
                FileWatcherDiagnostics = parseResult.GetValue(fileWatcherDiagnosticsOption)
            });
    }

    protected override async void OnExit(ExitEventArgs e)
    {
        if (Host is not null)
        {
            await Host.StopAsync();
            Host.Dispose();
        }
        base.OnExit(e);
    }
}
