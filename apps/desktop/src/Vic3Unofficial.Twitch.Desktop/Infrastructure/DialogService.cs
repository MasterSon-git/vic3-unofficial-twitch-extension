using System;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using System.Windows;
using Vic3Unofficial.Twitch.Desktop.Views;

namespace Vic3Unofficial.Twitch.Desktop.Infrastructure;

public interface IDialogService
{
    Task<bool> ShowPairDialogAsync();
}

public sealed class DialogService : IDialogService
{
    private readonly IServiceProvider _services;
    public DialogService(IServiceProvider services) => _services = services;

    public Task<bool> ShowPairDialogAsync()
    {
        var win = _services.GetRequiredService<PairWindow>();
        win.Owner = Application.Current.MainWindow;
        var ok = win.ShowDialog() == true;
        return Task.FromResult(ok);
    }
}
