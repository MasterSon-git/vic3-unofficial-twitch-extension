using System.Text.Json;
using System.Text.Json.Serialization;

namespace Vic3Unofficial.Twitch.Desktop.Generated;

public partial class EbsApiClient
{
    static partial void UpdateJsonSerializerSettings(JsonSerializerOptions settings)
    {
        settings.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    }
}
