using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Vic3Unofficial.Twitch.Desktop.Infrastructure;

public interface ITokenStore
{
    (string channelId, string ingestToken)? Load();
    void Save(string channelId, string ingestToken);
    void Clear();
}

public sealed class TokenStore : ITokenStore
{
    private readonly string _path;

    private sealed class TokenModel
    {
        public string ChannelId { get; set; } = "";
        public string IngestToken { get; set; } = "";
        public DateTimeOffset SavedAt { get; set; } = DateTimeOffset.UtcNow;
    }

    public TokenStore()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                               "Vic3UnofficialTwitch");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "token.bin");
    }

    public (string channelId, string ingestToken)? Load()
    {
        if (!File.Exists(_path)) return null;
        try
        {
            var enc = File.ReadAllBytes(_path);
            var dec = ProtectedData.Unprotect(enc, null, DataProtectionScope.CurrentUser);
            var json = Encoding.UTF8.GetString(dec);
            var model = JsonSerializer.Deserialize<TokenModel>(json);
            if (model == null || string.IsNullOrWhiteSpace(model.ChannelId) || string.IsNullOrWhiteSpace(model.IngestToken))
                return null;
            return (model.ChannelId, model.IngestToken);
        }
        catch { return null; }
    }

    public void Save(string channelId, string ingestToken)
    {
        var model = new TokenModel { ChannelId = channelId, IngestToken = ingestToken };
        var json = JsonSerializer.Serialize(model);
        var bytes = Encoding.UTF8.GetBytes(json);
        var enc = ProtectedData.Protect(bytes, null, DataProtectionScope.CurrentUser);
        File.WriteAllBytes(_path, enc);
    }

    public void Clear()
    {
        if (File.Exists(_path)) File.Delete(_path);
    }
}
