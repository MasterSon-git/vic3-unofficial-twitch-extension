using System;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Vic3Unofficial.Twitch.Desktop.Views;

namespace Vic3Unofficial.Twitch.Desktop.Infrastructure;

public interface IDialogService
{
    Task<string?> ShowPairDialogAsync();
}

public sealed class DialogService : IDialogService
{
    private readonly IServiceProvider _services;
    public DialogService(IServiceProvider services) => _services = services;

    public Task<string?> ShowPairDialogAsync()
    {
        var win = _services.GetRequiredService<PairWindow>(); // VM ist bereits injiziert
        var ok = win.ShowDialog() == true;

        // ViewModel hält den Code (via Binding)
        var vm = (Vic3Unofficial.Twitch.Desktop.ViewModels.PairViewModel)win.DataContext;
        return Task.FromResult(ok ? vm.PairCode : null);
    }
}
