import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Check, ChevronLeft, Search, Smartphone, X } from "lucide-react-native";
import { Snackbar } from "../../components/Snackbar";
import { Text } from "../../components/Text";
import { androidTopInset } from "../../screens/auth/authParts";
import { ThemeScope, createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import {
  canonicalZoneId,
  deviceTimeZone,
  groupTimeZones,
  searchTimeZones,
  timeZoneLabel,
  zoneOffsetLabel,
  type TimeZoneEntry,
} from "../../lib/timeZones";
import { M2Group } from "./m2";

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

type ListItem =
  | { kind: "header"; key: string; label: string }
  | { kind: "zone"; key: string; zone: TimeZoneEntry; first: boolean; last: boolean };

/** Flat rows for the virtualised list: a region label, then its zones. */
function listItems(groups: ReturnType<typeof groupTimeZones>): ListItem[] {
  const items: ListItem[] = [];
  for (const group of groups) {
    items.push({ kind: "header", key: `h:${group.region}`, label: group.region });
    group.zones.forEach((zone, index) =>
      items.push({
        kind: "zone",
        key: zone.id,
        zone,
        first: index === 0,
        last: index === group.zones.length - 1,
      }),
    );
  }
  return items;
}

/**
 * TR-20h, one searchable time zone list (Z14-14, D-W14-16, D-W14-21). Search by
 * city, country, abbreviation or IANA id; "Use phone's time zone" on top; the current
 * zone ticked. Picking saves and returns to Account after a short toast.
 *
 * The ~425 rows are a FlatList (own page chrome, because `M2Page` wraps its
 * children in a ScrollView, which would stop a nested list from virtualising).
 */
export function TimeZoneScreen(props: Props) {
  // The scope only reaches its children, so every themed hook lives in the body.
  return (
    <ThemeScope scheme="system">
      <TimeZoneBody {...props} />
    </ThemeScope>
  );
}

function TimeZoneBody({ current, onPick, onBack, returnDelayMs = 1200 }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(canonicalZoneId(current));
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const mounted = useRef(true);
  // Offsets are read for the moment the screen opens and cached per zone, so a
  // row never builds Intl state twice (DST is right for "now").
  const openedAt = useRef(new Date());
  const offsets = useRef(new Map<string, string>());
  const phoneZone = deviceTimeZone();
  const phoneId = phoneZone ? canonicalZoneId(phoneZone) : null;

  useEffect(
    () => () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function offsetSuffix(zoneId: string): string {
    let label = offsets.current.get(zoneId);
    if (label === undefined) {
      label = zoneOffsetLabel(zoneId, openedAt.current);
      offsets.current.set(zoneId, label);
    }
    return label ? ` · ${label}` : "";
  }

  const results = useMemo(() => searchTimeZones(query), [query]);
  const items = useMemo(() => listItems(groupTimeZones(results)), [results]);
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

  function renderItem({ item }: { item: ListItem }) {
    if (item.kind === "header") {
      return (
        <Text style={styles.section} accessibilityRole="header">
          {item.label.toUpperCase()}
        </Text>
      );
    }
    const { zone } = item;
    const ticked = !phoneTicked && selected === zone.id;
    return (
      <View
        style={[
          styles.cell,
          item.first ? styles.cellFirst : null,
          item.last ? styles.cellLast : null,
        ]}
      >
        {item.first ? null : <View style={styles.sep} />}
        <Pressable
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
      </View>
    );
  }

  const header =
    !searching && phoneZone ? (
      <View>
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
      </View>
    ) : null;

  const empty = (
    <View style={styles.empty} accessibilityRole="summary">
      <View style={styles.emptyTile}>
        <Search size={30} color={theme.colors.ink} strokeWidth={1.75} />
      </View>
      <Text style={styles.emptyTitle}>{`No time zone matches “${query.trim()}”`}</Text>
      <Text style={styles.emptyBody}>
        {"Try the nearest big city or the country, like “India” or “Dubai”."}
      </Text>
    </View>
  );

  return (
    <>
      <SafeAreaView style={styles.page} testID="time-zone">
        <View style={styles.nav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            style={styles.back}
          >
            <ChevronLeft color={theme.colors.ink} size={26} strokeWidth={2.25} />
          </Pressable>
          <Text style={styles.navTitle} accessibilityRole="header" numberOfLines={1}>
            Time zone
          </Text>
          <View style={styles.back} />
        </View>
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
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.key}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          extraData={`${selected}|${phoneTicked}`}
          initialNumToRender={14}
          maxToRenderPerBatch={14}
          windowSize={7}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
        />
        {toast ? (
          <View style={styles.toast}>
            <Snackbar message={toast} leadingCheck />
          </View>
        ) : null}
      </SafeAreaView>
    </>
  );
}

const useStyles = createThemedStyles((t) => ({
  page: { backgroundColor: t.colors.bg, flex: 1, paddingTop: androidTopInset },
  nav: { alignItems: "center", flexDirection: "row", minHeight: 52, paddingHorizontal: 8 },
  navTitle: {
    color: t.colors.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  back: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  listContent: { paddingBottom: 32, paddingHorizontal: 20, paddingTop: 4 },
  section: {
    color: t.colors.ink3,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 8,
    marginTop: 20,
  },
  cell: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.edge,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  cellFirst: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cellLast: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sep: { backgroundColor: t.colors.line, height: StyleSheet.hairlineWidth, marginLeft: 16 },
  search: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
    marginHorizontal: 20,
    marginTop: 8,
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
    paddingHorizontal: 20,
  },
}));
