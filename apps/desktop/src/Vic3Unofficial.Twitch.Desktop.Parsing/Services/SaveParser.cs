using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Vic3Unofficial.Twitch.Desktop.Parsing.Models;

namespace Vic3Unofficial.Twitch.Desktop.Parsing.Services;

[Flags]
internal enum ParsedSaveSection
{
    None = 0,
    Countries = 1,
    CountryRankings = 2
}

public sealed partial class SaveParser : ISaveParser
{
    private const string UnsupportedBinaryMessage =
        "Unsupported Victoria 3 save format. Set save_file_format to 'zip_text_all' or 'text' and create a new save.";
    private const ParsedSaveSection RequiredSections = ParsedSaveSection.Countries | ParsedSaveSection.CountryRankings;

    public (string saveHash, List<Country> countries) ParseForSnapshot(string savePath)
    {
        var fi = new FileInfo(savePath);
        var saveHash = $"{fi.Name}-{fi.Length}-{fi.LastWriteTimeUtc.Ticks}".Replace(" ", "_");

        using var gameState = SaveGameStateReader.Open(savePath);
        using var textGameState = OpenTextGameState(gameState.Stream);
        using var reader = new StreamReader(textGameState, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize: 128 * 1024);

        return (saveHash, ParseCountries(reader));
    }

    private static Stream OpenTextGameState(Stream gameState)
    {
        Span<byte> header = stackalloc byte[16];
        var read = gameState.Read(header);

        if (read >= 2 && header[0] == 0xAD && header[1] == 0x55) throw new InvalidDataException(UnsupportedBinaryMessage);
        if (read >= 4 && !LooksLikeText(header[..read])) throw new InvalidDataException(UnsupportedBinaryMessage);

        if (gameState.CanSeek)
        {
            gameState.Position -= read;
            return gameState;
        }

        return new PrefixedReadOnlyStream(header[..read], gameState);
    }

    private static bool LooksLikeText(ReadOnlySpan<byte> bytes)
    {
        foreach (var b in bytes)
        {
            if (b is 0x09 or 0x0A or 0x0D) continue;
            if (b < 0x20 || b > 0x7E) return false;
        }

        return true;
    }


    private static List<Country> ParseCountries(TextReader reader)
    {
        var countries = new List<CountryBuilder>();
        var rankings = new Dictionary<int, CountryRanking>();
        var depth = 0;
        var countryManagerDepth = -1;
        var databaseDepth = -1;
        CountryBuilder? country = null;
        var countryDepth = -1;
        var gdpDepth = -1;
        var popStatisticsDepth = -1;
        var rankingRootDepth = -1;
        var rankingListDepth = -1;
        CountryRankingBuilder? ranking = null;
        var rankingDepth = -1;
        var parsedSections = ParsedSaveSection.None;

        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            var trimmed = line.Trim();

            if (countryManagerDepth < 0 && trimmed == "country_manager={") countryManagerDepth = depth + 1;
            else if (countryManagerDepth > 0 && databaseDepth < 0 && depth == countryManagerDepth && trimmed == "database={")
                databaseDepth = depth + 1;
            else if (databaseDepth > 0 && country is null && depth == databaseDepth && CountryBlockStartRegex().IsMatch(trimmed))
            {
                country = new CountryBuilder { Id = int.Parse(trimmed[..trimmed.IndexOf('=', StringComparison.Ordinal)], CultureInfo.InvariantCulture) };
                countryDepth = depth + 1;
                gdpDepth = -1;
                popStatisticsDepth = -1;
            }
            else if (rankingRootDepth < 0 && trimmed == "country_rankings={") rankingRootDepth = depth + 1;
            else if (rankingRootDepth > 0 && rankingListDepth < 0 && depth == rankingRootDepth && trimmed == "country_rankings={ {")
            {
                rankingListDepth = depth + 1;
                ranking = new CountryRankingBuilder();
                rankingDepth = depth + 2;
            }
            else if (rankingListDepth > 0 && ranking is null && depth == rankingListDepth && trimmed == "{")
            {
                ranking = new CountryRankingBuilder();
                rankingDepth = depth + 1;
            }

            if (country is not null)
            {
                ParseCountryLine(country, trimmed, depth, countryDepth, ref gdpDepth, ref popStatisticsDepth);
            }

            if (ranking is not null && depth == rankingDepth && (trimmed == "} {" || trimmed == "}"))
            {
                if (ranking.ToRanking() is { } parsed) rankings[parsed.CountryId] = parsed;
                ranking = trimmed == "} {" ? new CountryRankingBuilder() : null;
            }
            else if (ranking is not null)
            {
                ParseRankingLine(ranking, trimmed, depth, rankingDepth);
            }

            depth += CountBraces(trimmed);
            if (gdpDepth > 0 && depth < gdpDepth) gdpDepth = -1;
            if (popStatisticsDepth > 0 && depth < popStatisticsDepth) popStatisticsDepth = -1;

            if (country is not null && depth < countryDepth)
            {
                if (country.CanBuild()) countries.Add(country);
                country = null;
                countryDepth = -1;
                gdpDepth = -1;
                popStatisticsDepth = -1;
            }

            if (ranking is not null && depth < rankingDepth)
            {
                if (ranking.ToRanking() is { } parsed) rankings[parsed.CountryId] = parsed;
                ranking = null;
                rankingDepth = -1;
            }

            if (databaseDepth > 0 && depth < databaseDepth) databaseDepth = -1;
            if (countryManagerDepth > 0 && depth < countryManagerDepth)
            {
                countryManagerDepth = -1;
                parsedSections |= ParsedSaveSection.Countries;
            }

            if (rankingListDepth > 0 && depth < rankingListDepth) rankingListDepth = -1;
            if (rankingRootDepth > 0 && depth < rankingRootDepth)
            {
                rankingRootDepth = -1;
                parsedSections |= ParsedSaveSection.CountryRankings;
            }

            if (HasParsedRequiredSections(parsedSections)) break;
        }

        return countries
            .Select(country => country.ToCountry(rankings.TryGetValue(country.Id, out var ranking) ? ranking : null))
            .OfType<Country>()
            .OrderBy(country => country.Score ?? int.MaxValue)
            .ThenByDescending(country => country.Prestige ?? double.MinValue)
            .ThenBy(country => country.Tag, StringComparer.Ordinal)
            .Take(300)
            .ToList();
    }

    private static bool HasParsedRequiredSections(ParsedSaveSection parsedSections) =>
        (parsedSections & RequiredSections) == RequiredSections;

    private static void ParseCountryLine(
        CountryBuilder country,
        string trimmed,
        int depth,
        int countryDepth,
        ref int gdpDepth,
        ref int popStatisticsDepth)
    {
        if (depth == countryDepth)
        {
            if (TryReadQuotedValue(trimmed, "definition", out var definition)) country.Tag = definition;
            else if (TryReadValue(trimmed, "market", out var market)) country.MarketId = market;
            else if (TryReadValue(trimmed, "capital", out var capital)) country.HasCapital = capital != "4294967295";
            else if (trimmed == "gdp={") gdpDepth = depth + 1;
            else if (trimmed == "pop_statistics={") popStatisticsDepth = depth + 1;
            else if (TryReadValue(trimmed, "dead", out var dead)) country.Dead = string.Equals(dead, "yes", StringComparison.OrdinalIgnoreCase);
            else if (TryReadValue(trimmed, "is_main_tag", out var isMainTag))
                country.IsMainTag = string.Equals(isMainTag, "yes", StringComparison.OrdinalIgnoreCase);
        }

        if (depth == countryDepth + 1 && TryReadDouble(trimmed, "money", out var money)) country.Treasury = money;

        if (popStatisticsDepth > 0 && depth == popStatisticsDepth)
        {
            if (TryReadDouble(trimmed, "population_lower_strata", out var lower)) country.PopulationLowerStrata = lower;
            else if (TryReadDouble(trimmed, "population_middle_strata", out var middle)) country.PopulationMiddleStrata = middle;
            else if (TryReadDouble(trimmed, "population_upper_strata", out var upper)) country.PopulationUpperStrata = upper;
            else if (TryReadInlineArrayValueSum(trimmed, "standard_of_living_by_religion_array", out var solSum))
                country.StandardOfLivingSum = solSum;
        }

        if (gdpDepth > 0)
        {
            if (country.Gdp is null && TryReadValuesFirstDouble(trimmed, out var gdp)) country.Gdp = gdp;
        }
    }

    private static void ParseRankingLine(CountryRankingBuilder ranking, string trimmed, int depth, int rankingDepth)
    {
        if (depth != rankingDepth) return;

        if (TryReadValue(trimmed, "country", out var countryId) &&
            int.TryParse(countryId, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedCountryId))
            ranking.CountryId = parsedCountryId;
        else if (TryReadValue(trimmed, "score", out var score) &&
                 int.TryParse(score, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedScore))
            ranking.Score = parsedScore;
        else if (TryReadValue(trimmed, "rank", out var rank))
            ranking.Rank = rank;
        else if (TryReadDouble(trimmed, "prestige", out var prestige))
            ranking.Prestige = prestige;
    }

    private static bool TryReadValue(string line, string key, out string value)
    {
        value = "";
        var prefix = key + "=";
        if (!line.StartsWith(prefix, StringComparison.Ordinal)) return false;
        value = line[prefix.Length..].Trim();
        return value.Length > 0;
    }

    private static bool TryReadQuotedValue(string line, string key, out string value)
    {
        value = "";
        if (!TryReadValue(line, key, out var raw)) return false;
        if (raw.Length < 2 || raw[0] != '"' || raw[^1] != '"') return false;
        value = raw[1..^1];
        return value.Length > 0;
    }

    private static bool TryReadDouble(string line, string key, out double value)
    {
        value = 0;
        return TryReadValue(line, key, out var raw) &&
               double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out value);
    }

    private static bool TryReadValuesFirstDouble(string line, out double value)
    {
        value = 0;
        var match = ValuesRegex().Match(line);
        return match.Success && double.TryParse(match.Groups[1].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out value);
    }

    private static bool TryReadInlineArrayValueSum(string line, string key, out double sum)
    {
        sum = 0;
        var prefix = key + "={";
        if (!line.StartsWith(prefix, StringComparison.Ordinal) || !line.EndsWith('}')) return false;

        var content = line[prefix.Length..^1].Trim();
        if (content.Length == 0) return true;

        var foundValue = false;
        foreach (var token in content.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var valueText = token;
            var separator = token.IndexOf('=');
            if (separator >= 0)
            {
                valueText = token[(separator + 1)..];
            }
            else if (!foundValue)
            {
                continue;
            }

            if (!double.TryParse(valueText, NumberStyles.Float, CultureInfo.InvariantCulture, out var value)) continue;
            sum += value;
            foundValue = true;
        }

        return foundValue;
    }

    private static int CountBraces(string line)
    {
        var count = 0;
        var inString = false;
        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (c == '"' && (i == 0 || line[i - 1] != '\\')) inString = !inString;
            if (inString) continue;
            if (c == '{') count++;
            else if (c == '}') count--;
        }

        return count;
    }

    [GeneratedRegex(@"^\d+=\{$")]
    private static partial Regex CountryBlockStartRegex();

    [GeneratedRegex(@"^values=\{\s*([-+]?\d+(?:\.\d+)?)")]
    private static partial Regex ValuesRegex();

    private sealed class CountryBuilder
    {
        public int Id { get; set; }
        public string? Tag { get; set; }
        public double? Treasury { get; set; }
        public double? Gdp { get; set; }
        public double? PopulationLowerStrata { get; set; }
        public double? PopulationMiddleStrata { get; set; }
        public double? PopulationUpperStrata { get; set; }
        public double? StandardOfLivingSum { get; set; }
        public string? MarketId { get; set; }
        public bool Dead { get; set; }
        public bool IsMainTag { get; set; }
        public bool HasCapital { get; set; }

        public bool CanBuild() => !Dead && IsMainTag && HasCapital && !string.IsNullOrWhiteSpace(Tag);

        public Country? ToCountry(CountryRanking? ranking)
        {
            if (!CanBuild()) return null;
            return new Country
            {
                Tag = Tag!,
                Score = ranking?.Score,
                Rank = ranking?.Rank,
                Prestige = ranking?.Prestige,
                Treasury = Treasury,
                Gdp = Gdp,
                Sol = CalculateStandardOfLiving(),
                Population = CalculatePopulation(),
                MarketId = MarketId
            };
        }

        private double? CalculatePopulation()
        {
            if (PopulationLowerStrata is null && PopulationMiddleStrata is null && PopulationUpperStrata is null) return null;
            return (PopulationLowerStrata ?? 0) + (PopulationMiddleStrata ?? 0) + (PopulationUpperStrata ?? 0);
        }

        private double? CalculateStandardOfLiving()
        {
            var population = CalculatePopulation();
            if (population is null or <= 0 || StandardOfLivingSum is null) return null;
            return StandardOfLivingSum.Value / population.Value;
        }
    }

    private sealed class CountryRankingBuilder
    {
        public int? CountryId { get; set; }
        public int? Score { get; set; }
        public string? Rank { get; set; }
        public double? Prestige { get; set; }

        public CountryRanking? ToRanking()
        {
            if (CountryId is null) return null;
            return new CountryRanking(CountryId.Value, Score, Rank, Prestige);
        }
    }

    private sealed record CountryRanking(int CountryId, int? Score, string? Rank, double? Prestige);
}
