using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Threading.Tasks;
using System.Windows;
using Vic3Unofficial.Twitch.Desktop.Services;

namespace Vic3Unofficial.Twitch.Desktop.ViewModels;

public partial class PairViewModel : ObservableObject
{
    private readonly IEbsClient _ebs;

    [ObservableProperty] private string _pairCode = "";

    public PairViewModel(IEbsClient ebs) => _ebs = ebs;

    [RelayCommand]
    private async Task Confirm(Window window)
    {
        if (string.IsNullOrWhiteSpace(PairCode) || PairCode.Length < 4) return;
        try
        {
            var ok = await _ebs.CompletePairingAsync(PairCode.Trim());
            window.DialogResult = ok;
            window.Close();
        }
        catch (System.Exception ex)
        {
            MessageBox.Show(window, ex.Message, "Pairing error", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    [RelayCommand]
    private void Cancel(Window window)
    {
        window.DialogResult = false;
        window.Close();
    }
}
