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
    public static IHost Host { get; private set; } = null!;

    protected override void OnStartup(StartupEventArgs e)
    {
#if DEBUG
        var parsedLogLevel = LogLevel.Debug;
#else
        var parsedLogLevel = LogLevel.Warning;
#endif
        parsedLogLevel = ParseLogLevel(e.Args, parsedLogLevel);

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

                // HttpClient + EBS. The client carries the current pairing token, so it must be shared across views.
                services.AddHttpClient("EbsClient");
                services.AddSingleton<IEbsClient>(sp => new EbsClient(
                    sp.GetRequiredService<IHttpClientFactory>().CreateClient("EbsClient"),
                    sp.GetRequiredService<ISettingsService>(),
                    sp.GetRequiredService<ITokenStore>(),
                    sp.GetRequiredService<ILogger<EbsClient>>(),
                    sp.GetRequiredService<IStatusSink>()));

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

    private static LogLevel ParseLogLevel(string[] args, LogLevel fallback)
    {
        var logLevelOption = new Option<LogLevel>("--logLevel")
        {
            Description = "Specifies minimum log level (Trace, Debug, Information, Warning, Error, Critical)."
        };
        var root = new RootCommand("Vic3 Unofficial Twitch Desktop Uploader")
        {
            TreatUnmatchedTokensAsErrors = false
        };
        root.Add(logLevelOption);

        var parseResult = root.Parse(args);
        if (parseResult.Errors.Count > 0 || parseResult.GetResult(logLevelOption) is null) return fallback;

        return parseResult.GetValue(logLevelOption);
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
