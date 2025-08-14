using System.Windows;
using Vic3Unofficial.Twitch.Desktop.ViewModels;

namespace Vic3Unofficial.Twitch.Desktop.Views;

public partial class PairWindow : Window
{
    public PairWindow(PairViewModel vm)
    {
        InitializeComponent();
        DataContext = vm;
    }
}
