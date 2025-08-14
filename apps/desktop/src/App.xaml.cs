using System;
using System.CommandLine;
using System.IO;
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
    public static IHost Host { get; private set; } = null!;

    protected override async void OnStartup(StartupEventArgs e)
    {
        var logLevelOption = new Option<LogLevel>(
            name: "--logLevel",
            description: "Specifies minimum log level (Trace, Debug, Information, Warning, Error, Critical).",
#if DEBUG
            getDefaultValue: () => LogLevel.Debug
#else
            getDefaultValue: () => LogLevel.Warning
#endif
        );

        var root = new RootCommand("Vic3 Unofficial Twitch Desktop Uploader");
        root.AddOption(logLevelOption);

        LogLevel parsedLogLevel = LogLevel.Warning; // fallback

        root.SetHandler((logLevel) =>
        {
            parsedLogLevel = logLevel;
        }, logLevelOption);

        await root.InvokeAsync(e.Args);

        StartupLogLevel = parsedLogLevel;

        base.OnStartup(e);

        Host = Microsoft.Extensions.Hosting.Host
            .CreateDefaultBuilder()
            .ConfigureLogging(lb =>
            {
#if DEBUG
                lb.ClearProviders();
                lb.AddConsole();
#else
                lb.ClearProviders();
                var logDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "Vic3UnofficialTwitch", "logs");
                Directory.CreateDirectory(logDir);
                var logFile = Path.Combine(logDir, "app.log");
                lb.AddProvider(new FileLoggerProvider(logFile));
#endif
                lb.SetMinimumLevel(StartupLogLevel);
            })
            .ConfigureServices(services =>
            {
                // Infrastructure
                services.AddSingleton<IStatusSink, StatusHub>();
                services.AddSingleton<ITokenStore, TokenStore>();

                // Settings
                services.AddSingleton<ISettingsService, JsonSettingsService>();

                // HttpClient + EBS
                services.AddHttpClient<IEbsClient, EbsClient>();

                // Domain Services
                services.AddSingleton<IAutosaveWatcher, AutosaveWatcher>();
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

        var main = Host.Services.GetRequiredService<MainWindow>();
        MainWindow = main;
        main.Show();
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
