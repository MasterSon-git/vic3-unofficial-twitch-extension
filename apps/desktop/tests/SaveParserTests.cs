using System.IO.Compression;
using System.Text;
using Vic3Unofficial.Twitch.Desktop.Parsing.Services;

namespace Vic3Unofficial.Twitch.Desktop.Parsing.Tests;

public sealed class SaveParserTests
{
    [Fact]
    public void ParsesPlainTextSaveWithCountryValues()
    {
        using var file = TestSaveFile.CreateText(GameStateText);

        var (_, countries) = new SaveParser().ParseForSnapshot(file.Path);

        var gbr = Assert.Single(countries, country => country.Tag == "GBR");
        Assert.Equal(1207668.69792, gbr.Treasury);
        Assert.Equal(24298716.4524, gbr.Gdp);
        Assert.Equal("0", gbr.MarketId);
        Assert.Equal(1, gbr.Score);
        Assert.Equal("great_power", gbr.Rank);
        Assert.Equal(544, gbr.Prestige);

        Assert.DoesNotContain(countries, country => country.Tag == "GER");
        Assert.DoesNotContain(countries, country => country.Tag == "SCA");
        Assert.Equal(new[] { "GBR", "FRA" }, countries.Select(country => country.Tag));
    }

    [Fact]
    public void ParsesZipTextSaveWithParadoxHeader()
    {
        using var file = TestSaveFile.CreateZipText(GameStateText);

        var (_, countries) = new SaveParser().ParseForSnapshot(file.Path);

        Assert.Contains(countries, country => country.Tag == "GBR" && country.Gdp == 24298716.4524);
    }

    [Fact]
    public void StopsAfterRequiredSections()
    {
        using var file = TestSaveFile.CreateText(GameStateText + ExtraCountryAfterRequiredSections);

        var (_, countries) = new SaveParser().ParseForSnapshot(file.Path);

        Assert.DoesNotContain(countries, country => country.Tag == "AAA");
    }

    [Fact]
    public void RejectsZipBinarySaveWithClearMessage()
    {
        using var file = TestSaveFile.CreateZipBinary();

        var exception = Assert.Throws<InvalidDataException>(() => new SaveParser().ParseForSnapshot(file.Path));

        Assert.Contains("save_file_format", exception.Message);
        Assert.Contains("zip_text_all", exception.Message);
    }

    private const string GameStateText = """
SAV0100test
meta_data={
	version="1.13.6"
}
country_manager={
	database={
0={
	is_main_tag=yes
	definition="GER"
	ruler=4294967295
	capital=4294967295
	dead=yes
	gdp={
		sample_rate=28
	}
}
1={
	is_main_tag=yes
	definition="GBR"
	capital=5
	market=0
	budget={
		money=1207668.69792
		credit=40711686.97924
	}
	gdp={
		sample_rate=28
		channels={
0={
				values={ 24298716.4524 }
			}		}
	}
}
2={
	is_main_tag=yes
	definition="SCA"
	ruler=4294967295
	capital=4294967295
	gdp={
		sample_rate=28
	}
}
4={
	is_main_tag=yes
	definition="FRA"
	capital=456
	market=2
	budget={
		money=1016893.07704
	}
	gdp={
		channels={
0={
				values={ 20326387.1824 }
			}		}
	}
}
	}
}
country_rankings={
	average_prestige=22
	highest_prestige=544
	country_rankings={ {
			rank=great_power
			target=great_power
			prestige=405
			score=2
			country=4
		} {
			rank=great_power
			target=great_power
			prestige=544
			score=1
			country=1
		} {
			rank=insignificant_power
			target=insignificant_power
			prestige=5
			score=120
			country=0
		} }
}
""";

    private const string ExtraCountryAfterRequiredSections = """
country_manager={
	database={
5={
	is_main_tag=yes
	definition="AAA"
	capital=1
	gdp={
		channels={
0={
				values={ 999999999 }
			}		}
	}
}
	}
}
country_rankings={
	country_rankings={ {
			rank=great_power
			prestige=999
			score=0
			country=5
		} }
}
""";

    private sealed class TestSaveFile : IDisposable
    {
        private TestSaveFile(string path) => Path = path;

        public string Path { get; }

        public static TestSaveFile CreateText(string content)
        {
            var path = CreatePath();
            File.WriteAllText(path, content, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            return new TestSaveFile(path);
        }

        public static TestSaveFile CreateZipText(string gameState)
        {
            var path = CreatePath();
            WriteParadoxSaveZip(path, archive =>
            {
                WriteEntry(archive, "gamestate", gameState);
                WriteEntry(archive, "meta", "meta_data={ version=\"1.13.6\" }");
            });
            return new TestSaveFile(path);
        }

        public static TestSaveFile CreateZipBinary()
        {
            var path = CreatePath();
            WriteParadoxSaveZip(path, archive =>
            {
                var entry = archive.CreateEntry("gamestate");
                using var stream = entry.Open();
                stream.Write(new byte[] { 0xAD, 0x55, 0x01, 0x00, 0x03, 0x00 });
            });
            return new TestSaveFile(path);
        }

        public void Dispose()
        {
            if (File.Exists(Path)) File.Delete(Path);
        }

        private static string CreatePath() => System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"{Guid.NewGuid():N}.v3");

        private static void WriteParadoxSaveZip(string path, Action<ZipArchive> writeEntries)
        {
            using var zipBytes = new MemoryStream();
            using (var archive = new ZipArchive(zipBytes, ZipArchiveMode.Create, leaveOpen: true))
            {
                writeEntries(archive);
            }

            using var file = File.Create(path);
            WriteParadoxHeader(file);
            zipBytes.Position = 0;
            zipBytes.CopyTo(file);
        }

        private static void WriteParadoxHeader(Stream stream)
        {
            var header = Encoding.ASCII.GetBytes("SAV01000000000000000000\n");
            stream.Write(header);
        }

        private static void WriteEntry(ZipArchive archive, string name, string content)
        {
            var entry = archive.CreateEntry(name, CompressionLevel.Optimal);
            using var stream = entry.Open();
            using var writer = new StreamWriter(stream, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            writer.Write(content);
        }
    }
}
