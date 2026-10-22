import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { ChevronRight, Search } from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type { AttentionGroupsResponse, ClientDirectoryItem } from "@fitbud/contracts";
import { formatClockTime, formatPersonName, labelFor } from "@fitbud/core";
import { colors, fontFamilyMedium, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { stage1Api } from "../lib/stage1Api";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { StatusChip } from "../components/StatusChip";
import { initialsFromName } from "../components/m2";
import { ActivityFeedScreen } from "./ActivityFeedScreen";
import { readTrainerCache, writeTrainerCache } from "./cache";
import {
  clientListQueryForChip,
  mapDirectoryItemToRow,
  type ClientDirectoryRow,
  type ClientListFilter,
} from "./clients";

type Segment = "clients" | "activity";

const FILTERS: Array<{ id: ClientListFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "needs_attention", label: "Needs attention" },
  { id: "checkin_due", label: "Check-in due" },
  { id: "onboarding", label: "Onboarding" },
  { id: "ended", label: "Ended" },
];

type Props = {
  onOpenClient: (row: ClientDirectoryRow) => void;
  initialSegment?: Segment;
};

type Chip = { label: string; kind: "severity" | "adherence" | "lifecycle" | "checkin" | "custom"; value: string };
type AttentionGroup = AttentionGroupsResponse["groups"][number];

function rowChips(item: ClientDirectoryItem, group?: AttentionGroup): Chip[] {
  const chips: Chip[] = [];
  const reviewed =
    group != null &&
    group.items.length > 0 &&
    group.items.every((entry) => entry.status === "acknowledged");
  if (reviewed) {
    chips.push({
      label: labelFor("client_chip", "reviewed_still_open"),
      kind: "custom",
      value: "reviewed_still_open",
    });
  } else if (group?.mostSevere === "critical") {
    chips.push({ label: "", kind: "severity", value: "critical" });
  } else if (item.adherenceState === "needs_attention") {
    chips.push({ label: "", kind: "severity", value: "attention" });
  } else if (item.adherenceState === "on_track") {
    chips.push({ label: "", kind: "adherence", value: "on_track" });
  }
  const checkin = item.nextCheckin?.status;
  if (checkin === "submitted") {
    chips.push({
      label: labelFor("client_chip", "checkin_submitted"),
      kind: "custom",
      value: "checkin_submitted",
    });
  } else if (checkin === "overdue" || checkin === "due") {
    chips.push({
      label: labelFor("client_chip", "checkin_overdue"),
      kind: "custom",
      value: "checkin_overdue",
    });
  } else if (item.renewalState === "due" || item.renewalState === "expired") {
    chips.push({
      label: labelFor("client_chip", "renewal_due"),
      kind: "custom",
      value: "renewal_due",
    });
  } else if (item.status === "active" || item.status === "coaching_ready") {
    chips.push({ label: "", kind: "lifecycle", value: "active" });
  } else {
    chips.push({ label: "", kind: "lifecycle", value: item.status });
  }
  return chips.slice(0, 2);
}

function isOfflineError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof ApiClientError) return err.status === 0;
  return err instanceof Error && /fetch|network|offline/i.test(err.message);
}

export function ClientsTab({ onOpenClient, initialSegment = "clients" }: Props) {
  const { api } = useAuth();
  const [segment, setSegment] = useState<Segment>(initialSegment);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<ClientListFilter>("all");
  const [items, setItems] = useState<ClientDirectoryItem[]>([]);
  const [attentionByRelationship, setAttentionByRelationship] = useState<
    Map<string, AttentionGroup>
  >(new Map());
  const [counts, setCounts] = useState({ all: 0, needs: 0, checkin: 0, onboarding: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineAt, setOfflineAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [page, allPage, attention] = await Promise.all([
        api.listClients({ ...clientListQueryForChip(chip, query), limit: 50 }),
        api.listClients({ limit: 50 }),
        stage1Api(api)
          .getAttentionGroups()
          .catch(() => ({ groups: [] as AttentionGroupsResponse["groups"] })),
      ]);
      setItems(page.items);
      setAttentionByRelationship(
        new Map(attention.groups.map((group) => [group.relationshipId, group])),
      );
      const all = allPage.items;
      setCounts({
        all: all.length,
        needs: all.filter((item) => item.adherenceState === "needs_attention").length,
        checkin: all.filter((item) => {
          const status = item.nextCheckin?.status;
          return status === "due" || status === "overdue" || status === "submitted";
        }).length,
        onboarding: all.filter((item) =>
          ["invited", "onboarding_pending", "onboarding_submitted"].includes(item.status),
        ).length,
      });
      writeTrainerCache("trainer:clients", { items: page.items, savedAt: new Date().toISOString() });
      setOfflineAt(null);
    } catch (err) {
      const cached = readTrainerCache<{ items: ClientDirectoryItem[]; savedAt: string }>(
        "trainer:clients",
      );
      if (isOfflineError(err) && cached) {
        setItems(cached.items);
        setOfflineAt(cached.savedAt);
        setError(null);
      } else {
        setError("Couldn't load. Pull to try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [api, chip, query]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      void load();
    }, 300);
    return () => clearTimeout(handle);
  }, [load]);

  const rows = useMemo(
    () => items.map((item) => ({ item, row: mapDirectoryItemToRow(item) })),
    [items],
  );

  const countFor = (id: ClientListFilter) => {
    if (id === "all") return counts.all;
    if (id === "needs_attention") return counts.needs;
    if (id === "checkin_due") return counts.checkin;
    if (id === "onboarding") return counts.onboarding;
    return null;
  };

  if (segment === "activity") {
    return (
      <Screen title="Clients" chrome="app" showHeader>
        <SegmentBar segment={segment} onChange={setSegment} />
        <ActivityFeedScreen />
      </Screen>
    );
  }

  return (
    <Screen
      title="Clients"
      chrome="app"
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load().finally(() => setRefreshing(false));
      }}
    >
      <SegmentBar segment={segment} onChange={setSegment} />
      <View style={styles.search}>
        <Search color={colors.midGrey} size={18} />
        <TextInput
          accessibilityLabel={`Search ${counts.all} clients`}
          placeholder={`Search ${counts.all} clients`}
          placeholderTextColor={colors.midGrey}
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
        />
      </View>
      <View style={styles.filters}>
        {FILTERS.map((item) => {
          const count = countFor(item.id);
          const label = count == null ? item.label : `${item.label} ${count}`;
          const selected = chip === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setChip(item.id)}
              style={[styles.filter, selected ? styles.filterOn : null]}
            >
              <Text style={[styles.filterText, selected ? styles.filterTextOn : null]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {offlineAt ? (
        <Text style={styles.offline}>
          You're offline. Showing the last update from{" "}
          {formatClockTime(offlineAt, "Asia/Kolkata")}.
        </Text>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      {loading && rows.length === 0 ? (
        <View>
          <View style={styles.skeleton} />
          <View style={styles.skeleton} />
          <View style={styles.skeleton} />
        </View>
      ) : null}
      {!loading && rows.length === 0 ? (
        <Text style={styles.empty}>
          {query.trim() || chip !== "all"
            ? "No clients match."
            : "No clients yet. Invite clients from FitBud on web."}
        </Text>
      ) : null}
      <View style={styles.list}>
        {rows.map(({ item, row }, index) => {
          const tappable = Boolean(row.relationshipId);
          return (
            <Pressable
              key={row.key}
              accessibilityRole={tappable ? "button" : "text"}
              disabled={!tappable}
              onPress={() => {
                if (tappable) onOpenClient(row);
              }}
              style={[styles.row, index > 0 ? styles.rowBorder : null]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initialsFromName(row.name)}</Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.name}>{formatPersonName(row.name)}</Text>
                <Text style={styles.sub}>{row.subtitle}</Text>
                <View style={styles.chipRow}>
                  {rowChips(
                    item,
                    item.relationshipId
                      ? attentionByRelationship.get(item.relationshipId)
                      : undefined,
                  ).map((entry) =>
                    entry.kind === "custom" ? (
                      <View key={entry.value} style={styles.customChip}>
                        <Text style={styles.customChipText}>{entry.label}</Text>
                      </View>
                    ) : (
                      <StatusChip
                        key={entry.value}
                        kind={entry.kind}
                        value={entry.value}
                      />
                    ),
                  )}
                </View>
              </View>
              {tappable ? <ChevronRight color={colors.midGrey} size={18} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

function SegmentBar({
  segment,
  onChange,
}: {
  segment: Segment;
  onChange: (segment: Segment) => void;
}) {
  return (
    <View style={styles.segment}>
      {(["clients", "activity"] as const).map((id) => {
        const selected = segment === id;
        return (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(id)}
            style={[styles.segmentItem, selected ? styles.segmentOn : null]}
          >
            <Text style={[styles.segmentText, selected ? styles.segmentTextOn : null]}>
              {id === "clients" ? "Clients" : "Activity"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    backgroundColor: "#EEEDF5",
    borderRadius: 14,
    flexDirection: "row",
    marginBottom: 12,
    padding: 4,
  },
  segmentItem: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    minHeight: 40,
    justifyContent: "center",
  },
  segmentOn: { backgroundColor: colors.white },
  segmentText: { color: colors.midGrey, fontFamily: fontFamilyMedium, fontSize: 15 },
  segmentTextOn: { color: colors.deepNavy, fontFamily: fontFamilySemiBold },
  search: {
    alignItems: "center",
    backgroundColor: "#EEEDF5",
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: colors.deepNavy,
    flex: 1,
    fontSize: 16,
    minHeight: 44,
  },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  filter: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  filterOn: { backgroundColor: colors.deepNavy, borderColor: colors.deepNavy },
  filterText: { color: colors.deepNavy, fontFamily: fontFamilyMedium, fontSize: 14 },
  filterTextOn: { color: colors.white },
  list: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 8,
  },
  row: { alignItems: "center", flexDirection: "row", gap: 10, padding: 14 },
  rowBorder: { borderTopColor: "#E7E9F2", borderTopWidth: 1 },
  avatar: {
    alignItems: "center",
    backgroundColor: "#F8D7D7",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  avatarText: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 13 },
  rowBody: { flex: 1, gap: 4 },
  name: { color: colors.deepNavy, fontFamily: fontFamilySemiBold, fontSize: 16 },
  sub: { color: colors.midGrey, fontSize: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  customChip: {
    borderColor: "#E7E9F2",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  customChipText: { color: colors.deepNavy, fontSize: 12 },
  empty: { color: colors.deepNavy, fontSize: 16, lineHeight: 22, marginTop: 24 },
  skeleton: {
    backgroundColor: "#E7E9F2",
    borderRadius: 16,
    height: 72,
    marginBottom: 8,
  },
  offline: { color: colors.deepNavy, fontSize: 14, marginBottom: 8 },
});
