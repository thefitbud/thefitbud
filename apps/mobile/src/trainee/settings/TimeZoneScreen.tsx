import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Check, Search, Smartphone, X } from "lucide-react-native";
import { Snackbar } from "../../components/Snackbar";
import { Text } from "../../components/Text";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import {
  canonicalZoneId,
  deviceTimeZone,
  groupTimeZones,
  searchTimeZones,
  timeZoneLabel,
  zoneOffsetLabel,
  type TimeZoneEntry,
} from "../../lib/timeZones";
import { M2Group, M2Page, M2Section } from "./m2";

type Props = {
  /** The saved IANA zone. */
  current: string;
  /**
   * Saves the zone (the existing account update). Resolves true when saved,
   * false when it failed (the caller restores the old zone and shows the error).
   */
  onPick: (zoneId: string) => Promise<boolean> | boolean | void;
  onBack: () => void;
  /** Wait before returning to Account so the "set" toast can be read. */
  returnDelayMs?: number;
};

function offsetSuffix(zoneId: string): string {
  const label = zoneOffsetLabel(zoneId);
  return label ? ` · ${label}` : "";
}

/**
 * TR-20h, one searchable time zone list (Z14-14, D-W14-16, D-W14-21). Search by
 * city, country, abbreviation or IANA id; "Use phone's time zone" on top; the current
 * zone ticked. Picking saves and returns to Account after a short toast.
 */
export function TimeZoneScreen({ current, onPick, onBack, returnDelayMs = 1200 }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(canonicalZoneId(current));
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const mounted = useRef(true);
  const phoneZone = deviceTimeZone();
  const phoneId = phoneZone ? canonicalZoneId(phoneZone) : null;

  useEffect(
    () => () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const results = useMemo(() => searchTimeZones(query), [query]);
  const groups = useMemo(() => groupTimeZones(results), [results]);
  const searching = query.trim().length > 0;

  async function pick(zoneId: string, city: string) {
    if (saving.current || timer.current) return;
    saving.current = true;
    const previous = selected;
    setSelected(canonicalZoneId(zoneId));
    const saved = (await onPick(zoneId)) !== false;
    saving.current = false;
    if (!mounted.current) return;
    if (!saved) {
      // The caller shows the failure on Account; no success copy here.
      setSelected(previous);
      onBack();
      return;
    }
    setToast(`Time zone set to ${city}${offsetSuffix(zoneId)}`);
    timer.current = setTimeout(onBack, returnDelayMs);
  }

  const phoneLabel = timeZoneLabel(phoneZone);
  const phoneTicked = phoneId !== null && selected === phoneId;

  function row(zone: TimeZoneEntry) {
    const ticked = !phoneTicked && selected === zone.id;
    return (
      <Pressable
        key={zone.id}
        accessibilityRole="button"
        accessibilityLabel={`${zone.city}, ${zone.name}${offsetSuffix(zone.id)}`}
        accessibilityState={{ selected: ticked }}
        onPress={() => void pick(zone.id, zone.city)}
        style={styles.row}
      >
        <View style={styles.tx}>
          <Text style={styles.label}>{zone.city}</Text>
          <Text style={styles.hint}>
            {zone.name}
            {offsetSuffix(zone.id)}
          </Text>
        </View>
        {ticked ? <Check size={22} color={theme.colors.ink} strokeWidth={2.5} /> : null}
      </Pressable>
    );
  }

  return (
    <M2Page title="Time zone" onBack={onBack} testID="time-zone">
      <View style={styles.search}>
        <Search size={20} color={theme.colors.ink3} strokeWidth={2} />
        <TextInput
          accessibilityLabel="Search city or time zone"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Search city or time zone"
          placeholderTextColor={theme.colors.ink3}
          selectionColor={theme.colors.brand}
          returnKeyType="search"
          value={query}
          onChangeText={setQuery}
          style={styles.input}
        />
        {searching ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => setQuery("")}
            style={styles.clear}
          >
            <X size={18} color={theme.colors.ink3} strokeWidth={2.25} />
          </Pressable>
        ) : null}
      </View>

      {!searching && phoneZone ? (
        <>
          <M2Group>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Use phone's time zone, ${phoneLabel.city}, ${phoneLabel.name}`}
              accessibilityState={{ selected: phoneTicked }}
              onPress={() => void pick(phoneZone, phoneLabel.city)}
              style={styles.row}
            >
              <View style={styles.tile}>
                <Smartphone size={20} color={theme.colors.ink2} strokeWidth={1.75} />
              </View>
              <View style={styles.tx}>
                <Text style={styles.label}>Use phone&apos;s time zone</Text>
                <Text style={styles.hint}>
                  {phoneLabel.city} · {phoneLabel.name}
                </Text>
              </View>
              {phoneTicked ? (
                <Check size={22} color={theme.colors.ink} strokeWidth={2.5} />
              ) : null}
            </Pressable>
          </M2Group>
          <Text style={styles.footnote}>
            Reminders and your day use this time zone. Your coach sees it too.
          </Text>
        </>
      ) : null}

      {results.length === 0 ? (
        <View style={styles.empty} accessibilityRole="summary">
          <View style={styles.emptyTile}>
            <Search size={30} color={theme.colors.ink} strokeWidth={1.75} />
          </View>
          <Text style={styles.emptyTitle}>
            {`No time zone matches “${query.trim()}”`}
          </Text>
          <Text style={styles.emptyBody}>
            {"Try the nearest big city or the country, like “India” or “Dubai”."}
          </Text>
        </View>
      ) : (
        groups.map((group) => (
          <View key={group.region}>
            <M2Section label={group.region} />
            <M2Group>{group.zones.map(row)}</M2Group>
          </View>
        ))
      )}

      {toast ? (
        <View style={styles.toast}>
          <Snackbar message={toast} leadingCheck />
        </View>
      ) : null}
    </M2Page>
  );
}

const useStyles = createThemedStyles((t) => ({
  search: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  input: {
    color: t.colors.ink,
    flex: 1,
    fontSize: 17,
    minHeight: 44,
  },
  clear: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 36,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tile: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 12,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  tx: {
    flex: 1,
  },
  label: {
    color: t.colors.ink,
    fontSize: 17,
  },
  hint: {
    color: t.colors.ink2,
    fontSize: 14,
    marginTop: 2,
  },
  footnote: {
    color: t.colors.ink2,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  empty: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  emptyTile: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 20,
    height: 80,
    justifyContent: "center",
    width: 80,
  },
  emptyTitle: {
    color: t.colors.ink,
    fontSize: 21,
    fontWeight: "700",
    marginTop: 20,
    textAlign: "center",
  },
  emptyBody: {
    color: t.colors.ink2,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 8,
    textAlign: "center",
  },
  toast: {
    marginTop: 16,
  },
}));
