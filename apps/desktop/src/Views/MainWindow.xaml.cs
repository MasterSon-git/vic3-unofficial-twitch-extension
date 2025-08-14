using System.Windows;
using Vic3Unofficial.Twitch.Desktop.ViewModels;

namespace Vic3Unofficial.Twitch.Desktop.Views;

public partial class MainWindow : Window
{
    public MainWindow(MainViewModel vm)
    {
        InitializeComponent();
        DataContext = vm;
    }
}
