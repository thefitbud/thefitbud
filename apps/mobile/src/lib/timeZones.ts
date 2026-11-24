/**
 * Bundled IANA time zone list for the trainee's time zone picker (Z14-14,
 * D-W14-16, D-W14-21). Hermes has no `Intl.supportedValuesOf`, so the list is
 * data, not discovered. Any of these (or the phone's own zone) may be picked.
 * Only the UTC offset is computed (with Intl, so it follows daylight saving);
 * the readable name is fixed text so it never depends on the runtime's ICU.
 */

import { EXTRA_ZONES } from "./ianaZones";

export type TimeZoneRegion =
  | "Asia"
  | "Europe"
  | "Africa"
  | "North America"
  | "South America"
  | "Oceania"
  | "Atlantic"
  | "Other";

export type TimeZoneEntry = {
  /** IANA id, saved as `traineeTimezone`. */
  id: string;
  city: string;
  country: string;
  /** Readable name, "India Standard Time". */
  name: string;
  /** Searchable short names and alternative city names ("IST", "New Delhi"). */
  aliases: string[];
  region: TimeZoneRegion;
};

// id | city | country | readable name | aliases (comma separated) | region
const ROWS: Array<[string, string, string, string, string, TimeZoneRegion]> = [
  ["Asia/Kolkata", "Kolkata", "India", "India Standard Time", "IST,New Delhi,Delhi,Mumbai,Bengaluru,Chennai,Calcutta", "Asia"],
  ["Asia/Dubai", "Dubai", "United Arab Emirates", "Gulf Standard Time", "GST,UAE,Abu Dhabi", "Asia"],
  ["Asia/Dhaka", "Dhaka", "Bangladesh", "Bangladesh Time", "BST", "Asia"],
  ["Asia/Karachi", "Karachi", "Pakistan", "Pakistan Time", "PKT,Lahore,Islamabad", "Asia"],
  ["Asia/Kathmandu", "Kathmandu", "Nepal", "Nepal Time", "NPT", "Asia"],
  ["Asia/Colombo", "Colombo", "Sri Lanka", "India Standard Time", "IST", "Asia"],
  ["Asia/Thimphu", "Thimphu", "Bhutan", "Bhutan Time", "BTT", "Asia"],
  ["Indian/Maldives", "Maldives", "Maldives", "Maldives Time", "MVT,Male", "Asia"],
  ["Asia/Kabul", "Kabul", "Afghanistan", "Afghanistan Time", "AFT", "Asia"],
  ["Asia/Tashkent", "Tashkent", "Uzbekistan", "Uzbekistan Time", "UZT", "Asia"],
  ["Asia/Almaty", "Almaty", "Kazakhstan", "East Kazakhstan Time", "ALMT", "Asia"],
  ["Asia/Tehran", "Tehran", "Iran", "Iran Standard Time", "IRST", "Asia"],
  ["Asia/Baghdad", "Baghdad", "Iraq", "Arabian Standard Time", "AST", "Asia"],
  ["Asia/Riyadh", "Riyadh", "Saudi Arabia", "Arabian Standard Time", "AST,KSA", "Asia"],
  ["Asia/Kuwait", "Kuwait", "Kuwait", "Arabian Standard Time", "AST", "Asia"],
  ["Asia/Qatar", "Doha", "Qatar", "Arabian Standard Time", "AST,Qatar", "Asia"],
  ["Asia/Bahrain", "Bahrain", "Bahrain", "Arabian Standard Time", "AST,Manama", "Asia"],
  ["Asia/Muscat", "Muscat", "Oman", "Gulf Standard Time", "GST,Oman", "Asia"],
  ["Asia/Jerusalem", "Jerusalem", "Israel", "Israel Time", "IST,Tel Aviv", "Asia"],
  ["Asia/Beirut", "Beirut", "Lebanon", "Eastern European Time", "EET", "Asia"],
  ["Asia/Amman", "Amman", "Jordan", "Jordan Time", "AST", "Asia"],
  ["Asia/Yangon", "Yangon", "Myanmar", "Myanmar Time", "MMT,Rangoon", "Asia"],
  ["Asia/Bangkok", "Bangkok", "Thailand", "Indochina Time", "ICT", "Asia"],
  ["Asia/Ho_Chi_Minh", "Ho Chi Minh City", "Vietnam", "Indochina Time", "ICT,Saigon,Hanoi", "Asia"],
  ["Asia/Jakarta", "Jakarta", "Indonesia", "Western Indonesia Time", "WIB", "Asia"],
  ["Asia/Singapore", "Singapore", "Singapore", "Singapore Time", "SGT", "Asia"],
  ["Asia/Kuala_Lumpur", "Kuala Lumpur", "Malaysia", "Malaysia Time", "MYT", "Asia"],
  ["Asia/Manila", "Manila", "Philippines", "Philippine Time", "PHT,PST", "Asia"],
  ["Asia/Hong_Kong", "Hong Kong", "Hong Kong", "Hong Kong Time", "HKT", "Asia"],
  ["Asia/Shanghai", "Shanghai", "China", "China Standard Time", "CST,Beijing", "Asia"],
  ["Asia/Taipei", "Taipei", "Taiwan", "Taipei Standard Time", "CST", "Asia"],
  ["Asia/Seoul", "Seoul", "South Korea", "Korean Standard Time", "KST", "Asia"],
  ["Asia/Tokyo", "Tokyo", "Japan", "Japan Standard Time", "JST", "Asia"],
  ["Europe/London", "London", "United Kingdom", "Greenwich Mean Time", "GMT,BST,UK,England", "Europe"],
  ["Europe/Dublin", "Dublin", "Ireland", "Greenwich Mean Time", "GMT,IST", "Europe"],
  ["Europe/Lisbon", "Lisbon", "Portugal", "Western European Time", "WET", "Europe"],
  ["Europe/Paris", "Paris", "France", "Central European Time", "CET", "Europe"],
  ["Europe/Berlin", "Berlin", "Germany", "Central European Time", "CET", "Europe"],
  ["Europe/Madrid", "Madrid", "Spain", "Central European Time", "CET", "Europe"],
  ["Europe/Rome", "Rome", "Italy", "Central European Time", "CET", "Europe"],
  ["Europe/Amsterdam", "Amsterdam", "Netherlands", "Central European Time", "CET", "Europe"],
  ["Europe/Brussels", "Brussels", "Belgium", "Central European Time", "CET", "Europe"],
  ["Europe/Zurich", "Zurich", "Switzerland", "Central European Time", "CET", "Europe"],
  ["Europe/Vienna", "Vienna", "Austria", "Central European Time", "CET", "Europe"],
  ["Europe/Stockholm", "Stockholm", "Sweden", "Central European Time", "CET", "Europe"],
  ["Europe/Oslo", "Oslo", "Norway", "Central European Time", "CET", "Europe"],
  ["Europe/Copenhagen", "Copenhagen", "Denmark", "Central European Time", "CET", "Europe"],
  ["Europe/Warsaw", "Warsaw", "Poland", "Central European Time", "CET", "Europe"],
  ["Europe/Prague", "Prague", "Czechia", "Central European Time", "CET", "Europe"],
  ["Europe/Budapest", "Budapest", "Hungary", "Central European Time", "CET", "Europe"],
  ["Europe/Athens", "Athens", "Greece", "Eastern European Time", "EET", "Europe"],
  ["Europe/Helsinki", "Helsinki", "Finland", "Eastern European Time", "EET", "Europe"],
  ["Europe/Kyiv", "Kyiv", "Ukraine", "Eastern European Time", "EET,Kiev", "Europe"],
  ["Europe/Bucharest", "Bucharest", "Romania", "Eastern European Time", "EET", "Europe"],
  ["Europe/Istanbul", "Istanbul", "Turkey", "Turkey Time", "TRT", "Europe"],
  ["Europe/Moscow", "Moscow", "Russia", "Moscow Standard Time", "MSK", "Europe"],
  ["Africa/Cairo", "Cairo", "Egypt", "Eastern European Time", "EET", "Africa"],
  ["Africa/Lagos", "Lagos", "Nigeria", "West Africa Time", "WAT", "Africa"],
  ["Africa/Accra", "Accra", "Ghana", "Greenwich Mean Time", "GMT", "Africa"],
  ["Africa/Nairobi", "Nairobi", "Kenya", "East Africa Time", "EAT", "Africa"],
  ["Africa/Addis_Ababa", "Addis Ababa", "Ethiopia", "East Africa Time", "EAT", "Africa"],
  ["Africa/Dar_es_Salaam", "Dar es Salaam", "Tanzania", "East Africa Time", "EAT", "Africa"],
  ["Africa/Kampala", "Kampala", "Uganda", "East Africa Time", "EAT", "Africa"],
  ["Africa/Johannesburg", "Johannesburg", "South Africa", "South Africa Standard Time", "SAST,Cape Town", "Africa"],
  ["Africa/Casablanca", "Casablanca", "Morocco", "Morocco Time", "WET", "Africa"],
  ["Africa/Algiers", "Algiers", "Algeria", "Central European Time", "CET", "Africa"],
  ["Indian/Mauritius", "Mauritius", "Mauritius", "Mauritius Time", "MUT", "Africa"],
  ["America/New_York", "New York", "United States", "Eastern Time", "EST,EDT,ET,US", "North America"],
  ["America/Chicago", "Chicago", "United States", "Central Time", "CST,CDT,CT,US", "North America"],
  ["America/Denver", "Denver", "United States", "Mountain Time", "MST,MDT,MT,US", "North America"],
  ["America/Phoenix", "Phoenix", "United States", "Mountain Standard Time", "MST,US,Arizona", "North America"],
  ["America/Los_Angeles", "Los Angeles", "United States", "Pacific Time", "PST,PDT,PT,US,San Francisco", "North America"],
  ["America/Anchorage", "Anchorage", "United States", "Alaska Time", "AKST,AKDT,US", "North America"],
  ["Pacific/Honolulu", "Honolulu", "United States", "Hawaii Time", "HST,US", "North America"],
  ["America/Toronto", "Toronto", "Canada", "Eastern Time", "EST,EDT,ET", "North America"],
  ["America/Vancouver", "Vancouver", "Canada", "Pacific Time", "PST,PDT,PT", "North America"],
  ["America/Edmonton", "Edmonton", "Canada", "Mountain Time", "MST,MDT,MT,Calgary", "North America"],
  ["America/Winnipeg", "Winnipeg", "Canada", "Central Time", "CST,CDT,CT", "North America"],
  ["America/Halifax", "Halifax", "Canada", "Atlantic Time", "AST,ADT,AT", "North America"],
  ["America/Mexico_City", "Mexico City", "Mexico", "Central Time", "CST,CT", "North America"],
  ["America/Panama", "Panama", "Panama", "Eastern Standard Time", "EST", "North America"],
  ["America/Jamaica", "Jamaica", "Jamaica", "Eastern Standard Time", "EST,Kingston", "North America"],
  ["America/Port_of_Spain", "Port of Spain", "Trinidad and Tobago", "Atlantic Standard Time", "AST,Trinidad", "North America"],
  ["America/Sao_Paulo", "Sao Paulo", "Brazil", "Brasilia Time", "BRT,Rio de Janeiro", "South America"],
  ["America/Argentina/Buenos_Aires", "Buenos Aires", "Argentina", "Argentina Time", "ART", "South America"],
  ["America/Santiago", "Santiago", "Chile", "Chile Time", "CLT", "South America"],
  ["America/Bogota", "Bogota", "Colombia", "Colombia Time", "COT", "South America"],
  ["America/Lima", "Lima", "Peru", "Peru Time", "PET", "South America"],
  ["America/Caracas", "Caracas", "Venezuela", "Venezuela Time", "VET", "South America"],
  ["Australia/Perth", "Perth", "Australia", "Australian Western Time", "AWST", "Oceania"],
  ["Australia/Adelaide", "Adelaide", "Australia", "Australian Central Time", "ACST,ACDT", "Oceania"],
  ["Australia/Brisbane", "Brisbane", "Australia", "Australian Eastern Standard Time", "AEST", "Oceania"],
  ["Australia/Sydney", "Sydney", "Australia", "Australian Eastern Time", "AEST,AEDT,Melbourne,Canberra", "Oceania"],
  ["Pacific/Auckland", "Auckland", "New Zealand", "New Zealand Time", "NZST,NZDT,NZ,Wellington", "Oceania"],
  ["Pacific/Fiji", "Fiji", "Fiji", "Fiji Time", "FJT,Suva", "Oceania"],
  ["Atlantic/Reykjavik", "Reykjavik", "Iceland", "Greenwich Mean Time", "GMT", "Atlantic"],
  ["Atlantic/Azores", "Azores", "Portugal", "Azores Time", "AZOT", "Atlantic"],
  ["UTC", "UTC", "Universal", "Coordinated Universal Time", "UTC,GMT,Zulu", "Other"],
];

const CURATED: TimeZoneEntry[] = ROWS.map(
  ([id, city, country, name, aliases, region]) => ({
    id,
    city,
    country,
    name,
    aliases: aliases.split(","),
    region,
  }),
);

/** "America/Argentina/Ushuaia" -> "Ushuaia", "Port-au-Prince" kept as is. */
function cityFromId(id: string): string {
  return (id.split("/").pop() ?? id).replace(/_/g, " ");
}

/**
 * Every canonical IANA zone: the curated names first, then the rest of the
 * bundled list with a city from the id (D-W14-21: any IANA zone can be picked).
 */
export const TIME_ZONES: readonly TimeZoneEntry[] = [
  ...CURATED,
  ...EXTRA_ZONES.filter(([id]) => !CURATED.some((zone) => zone.id === id)).map(
    ([id, name, region]): TimeZoneEntry => ({
      id,
      city: cityFromId(id),
      country: "",
      name,
      aliases: [],
      region,
    }),
  ),
];

const REGION_ORDER: TimeZoneRegion[] = [
  "Asia",
  "Europe",
  "Africa",
  "North America",
  "South America",
  "Oceania",
  "Atlantic",
  "Other",
];

/** Older ids that mean the same zone as a listed one. */
const ID_ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Europe/Kiev": "Europe/Kyiv",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Etc/UTC": "UTC",
  "Etc/GMT": "UTC",
};

/** The list id for an IANA id (folds old spellings), or the id itself. */
export function canonicalZoneId(id: string): string {
  return ID_ALIASES[id] ?? id;
}

const formatters = new Map<string, Intl.DateTimeFormat | null>();

/** One formatter per zone for the app's life; building them is the slow part. */
function formatterFor(zone: string): Intl.DateTimeFormat | null {
  if (formatters.has(zone)) return formatters.get(zone) ?? null;
  let formatter: Intl.DateTimeFormat | null = null;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  } catch {
    formatter = null;
  }
  formatters.set(zone, formatter);
  return formatter;
}

/**
 * UTC offset of `zone` at `at`, in minutes, from Intl. `null` when the runtime
 * does not know the zone.
 */
export function zoneOffsetMinutes(zone: string, at: Date = new Date()): number | null {
  const formatter = formatterFor(zone);
  if (!formatter) return null;
  try {
    const parts = formatter.formatToParts(at);
    const get = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value);
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") % 24,
      get("minute"),
      get("second"),
    );
    if (Number.isNaN(asUtc)) return null;
    const truncated = Math.floor(at.getTime() / 1000) * 1000;
    return Math.round((asUtc - truncated) / 60000);
  } catch {
    return null;
  }
}

/** "UTC+5:30", "UTC+0:00", "UTC-8:00". */
export function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hh = Math.floor(abs / 60);
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}

/** "UTC+5:30" for a zone now, or "" when the runtime does not know it. */
export function zoneOffsetLabel(zone: string, at: Date = new Date()): string {
  const minutes = zoneOffsetMinutes(zone, at);
  return minutes === null ? "" : formatUtcOffset(minutes);
}

export function findTimeZone(id: string | null | undefined): TimeZoneEntry | null {
  if (!id) return null;
  const canonical = canonicalZoneId(id);
  return TIME_ZONES.find((zone) => zone.id === canonical) ?? null;
}

/** The phone's own IANA zone, or null if it cannot be read. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** City and readable name for any zone id: the list's, else the id's city. */
export function timeZoneLabel(id: string | null | undefined): { city: string; name: string } {
  const entry = findTimeZone(id);
  if (entry) return { city: entry.city, name: entry.name };
  if (!id) return { city: "Kolkata", name: "India Standard Time" };
  const city = id.split("/").pop()?.replace(/_/g, " ") ?? id;
  return { city, name: "Your time zone" };
}

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Search by city, country, readable name, abbreviation or raw IANA id ("IST", "India"). */
export function searchTimeZones(query: string): TimeZoneEntry[] {
  const q = norm(query);
  if (!q) return [...TIME_ZONES];
  const exact: TimeZoneEntry[] = [];
  const rest: TimeZoneEntry[] = [];
  for (const zone of TIME_ZONES) {
    if (zone.aliases.some((alias) => norm(alias) === q)) {
      exact.push(zone);
      continue;
    }
    const haystack = [
      zone.city,
      zone.country,
      zone.name,
      zone.id,
      zone.id.replace(/[_/]/g, " "),
      ...zone.aliases,
    ].map(norm);
    if (haystack.some((text) => text.includes(q))) rest.push(zone);
  }
  return [...exact, ...rest];
}

/** The list grouped by region, in display order. */
export function groupTimeZones(
  zones: readonly TimeZoneEntry[],
): Array<{ region: TimeZoneRegion; zones: TimeZoneEntry[] }> {
  return REGION_ORDER.map((region) => ({
    region,
    zones: zones.filter((zone) => zone.region === region),
  })).filter((group) => group.zones.length > 0);
}
