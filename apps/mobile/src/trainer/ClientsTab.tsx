import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import {
  Ban,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  Clock,
  Copy,
  Eye,
  Mail,
  MessageCircleQuestionMark,
  Search,
  TriangleAlert,
  UserRoundPlus,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react-native";
import { Text } from "../components/Text";
import { ApiClientError } from "@fitbud/api-client";
import type {
  AttentionGroupsResponse,
  ClientDirectoryItem,
  CoachAsk,
} from "@fitbud/contracts";
import {
  deviceTimeZone,
  formatClockTime,
  formatPersonName,
  formatRelative,
} from "@fitbud/core";
import { v3LightColors } from "@fitbud/tokens";
import {
  colors,
  fontFamilyMedium,
  fontFamilySemiBold,
} from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { stage1Api } from "../lib/stage1Api";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { initialsFromName } from "../components/m2";
import { reportError } from "../lib/reportError";
import { trainerWebUrl } from "../lib/legalLinks";
import { ActivityFeedScreen } from "./ActivityFeedScreen";
import { readTrainerCache, trainerCacheEpoch, writeTrainerCache } from "./cache";
import {
  applyClientListFilter,
  clientListQueryForChip,
  isCheckinDue,
  isEndedClient,
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
  { id: "invites", label: "Invites" },
  { id: "ended", label: "Ended" },
];

type Props = {
  onOpenClient: (row: ClientDirectoryRow) => void;
  initialSegment?: Segment;
};

type AttentionGroup = AttentionGroupsResponse["groups"][number];

type RosterChip = {
  key: string;
  label: string;
  Icon: LucideIcon;
  bg: string;
  fg: string;
};

const AVATARS = [
  { backgroundColor: v3LightColors.av1Bg, color: v3LightColors.av1Fg },
  { backgroundColor: v3LightColors.av2Bg, color: v3LightColors.av2Fg },
  { backgroundColor: v3LightColors.av3Bg, color: v3LightColors.av3Fg },
  { backgroundColor: v3LightColors.av4Bg, color: v3LightColors.av4Fg },
  { backgroundColor: v3LightColors.av5Bg, color: v3LightColors.av5Fg },
  { backgroundColor: v3LightColors.av6Bg, color: v3LightColors.av6Fg },
] as const;

function avatarTone(name: string): (typeof AVATARS)[number] {
  const code = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATARS[code % AVATARS.length] ?? AVATARS[0];
}

function rowChips(
  item: ClientDirectoryItem,
  group: AttentionGroup | undefined,
  hasOpenAsk: boolean,
): RosterChip[] {
  if (isEndedClient(item)) {
    return [
      {
        key: "ended",
        label: "Ended",
        Icon: Ban,
        bg: v3LightColors.fill,
        fg: v3LightColors.ink3,
      },
    ];
  }
  if (item.status === "invited") {
    return [
      {
        key: "pend",
        label: "Invite pending",
        Icon: Mail,
        bg: v3LightColors.fill,
        fg: v3LightColors.ink2,
      },
    ];
  }
  if (
    item.status === "onboarding_pending" ||
    item.status === "onboarding_submitted"
  ) {
    return [
      {
        key: "onb",
        label: "Onboarding",
        Icon: UserRoundPlus,
        bg: v3LightColors.infoTint,
        fg: v3LightColors.info,
      },
    ];
  }

  const chips: RosterChip[] = [];
  const reviewed =
    group != null &&
    group.items.length > 0 &&
    group.items.every((entry) => entry.status === "acknowledged");
  const offPlan = group?.items.some(
    (entry) =>
      (entry.status === "detected" || entry.status === "active") &&
      entry.type === "meal_deviation",
  );
  const openMissed = group?.items.some(
    (entry) =>
      (entry.status === "detected" || entry.status === "active") &&
      entry.type !== "meal_deviation",
  );

  if (reviewed) {
    chips.push({
      key: "rev",
      label: "Reviewed",
      Icon: Eye,
      bg: v3LightColors.fill,
      fg: v3LightColors.ink2,
    });
  } else if (group?.mostSevere === "critical" || openMissed) {
    chips.push({
      key: "needs",
      label: "Needs attention",
      Icon: group?.mostSevere === "critical" ? CircleAlert : TriangleAlert,
      bg:
        group?.mostSevere === "critical"
          ? v3LightColors.critTint
          : v3LightColors.warnTint,
      fg:
        group?.mostSevere === "critical"
          ? v3LightColors.crit
          : v3LightColors.warn,
    });
  } else if (item.adherenceState === "needs_attention") {
    chips.push({
      key: "needs",
      label: "Needs attention",
      Icon: TriangleAlert,
      bg: v3LightColors.warnTint,
      fg: v3LightColors.warn,
    });
  } else if (item.adherenceState === "on_track") {
    chips.push({
      key: "ok",
      label: "On track",
      Icon: CircleCheck,
      bg: v3LightColors.doneTint,
      fg: v3LightColors.done,
    });
  }

  if (hasOpenAsk) {
    chips.push({
      key: "ask",
      label: "Asked you",
      Icon: MessageCircleQuestionMark,
      bg: v3LightColors.brandTint,
      fg: v3LightColors.brandInk,
    });
  }

  if (offPlan) {
    chips.push({
      key: "off",
      label: "Off plan",
      Icon: UtensilsCrossed,
      bg: v3LightColors.warnTint,
      fg: v3LightColors.warn,
    });
  }

  const checkin = item.nextCheckin?.status;
  if (checkin === "submitted") {
    chips.push({
      key: "ci",
      label: "Check-in to review",
      Icon: ClipboardCheck,
      bg: v3LightColors.infoTint,
      fg: v3LightColors.info,
    });
  } else if (checkin === "overdue") {
    chips.push({
      key: "over",
      label: "Check-in overdue",
      Icon: Clock,
      bg: v3LightColors.warnTint,
      fg: v3LightColors.warn,
    });
  } else if (checkin === "due") {
    chips.push({
      key: "due",
      label: "Check-in due",
      Icon: Clock,
      bg: v3LightColors.warnTint,
      fg: v3LightColors.warn,
    });
  } else if (item.renewalState === "due" || item.renewalState === "expired") {
    chips.push({
      key: "renewal",
      label: "Renewal due",
      Icon: CalendarClock,
      bg: v3LightColors.warnTint,
      fg: v3LightColors.warn,
    });
  }

  // Cap at two chips so the row stays readable (TM-02a).
  return chips.slice(0, 2);
}

function RosterChipView({ chip }: { chip: RosterChip }) {
  return (
    <View style={[styles.chip, { backgroundColor: chip.bg }]}>
      <chip.Icon size={13} color={chip.fg} strokeWidth={2.4} />
      <Text style={[styles.chipText, { color: chip.fg }]}>{chip.label}</Text>
    </View>
  );
}

function isOfflineError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof ApiClientError) return err.status === 0;
  return err instanceof Error && /fetch|network|offline/i.test(err.message);
}

type Counts = {
  all: number;
  needs: number;
  checkin: number;
  onboarding: number;
  invites: number;
  ended: number;
};

const EMPTY_COUNTS: Counts = {
  all: 0,
  needs: 0,
  checkin: 0,
  onboarding: 0,
  invites: 0,
  ended: 0,
};

export function ClientsTab({ onOpenClient, initialSegment = "clients" }: Props) {
  const { api, me } = useAuth();
  const trainerZone = deviceTimeZone();
  const [segment, setSegment] = useState<Segment>(initialSegment);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<ClientListFilter>("all");
  const [items, setItems] = useState<ClientDirectoryItem[]>([]);
  const [attentionByRelationship, setAttentionByRelationship] = useState<
    Map<string, AttentionGroup>
  >(new Map());
  const [askByRelationship, setAskByRelationship] = useState<Set<string>>(
    new Set(),
  );
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineAt, setOfflineAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const searchRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    setError(null);
    const cacheEpoch = trainerCacheEpoch();
    try {
      const s1 = stage1Api(api);
      const [page, allPage, attention, asks] = await Promise.all([
        api.listClients({ ...clientListQueryForChip(chip, query), limit: 50 }),
        api.listClients({ limit: 50 }),
        s1.getAttentionGroups().catch(() => ({
          groups: [] as AttentionGroupsResponse["groups"],
        })),
        s1.listCoachAsks({ status: "open" }).catch(() => ({
          items: [] as CoachAsk[],
        })),
      ]);
      setItems(applyClientListFilter(page.items, chip));
      setAttentionByRelationship(
        new Map(attention.groups.map((group) => [group.relationshipId, group])),
      );
      setAskByRelationship(
        new Set(asks.items.map((ask) => ask.relationshipId)),
      );
      const live = allPage.items.filter((item) => !isEndedClient(item));
      setCounts({
        all: live.length,
        needs: live.filter((item) => item.adherenceState === "needs_attention")
          .length,
        checkin: live.filter(isCheckinDue).length,
        onboarding: live.filter((item) =>
          ["onboarding_pending", "onboarding_submitted"].includes(item.status),
        ).length,
        invites: live.filter((item) => item.status === "invited").length,
        ended: allPage.items.filter(isEndedClient).length,
      });
      writeTrainerCache(
        "trainer:clients",
        {
          items: applyClientListFilter(page.items, chip),
          savedAt: new Date().toISOString(),
        },
        cacheEpoch,
      );
      setOfflineAt(null);
    } catch (err) {
      const cached = readTrainerCache<{
        items: ClientDirectoryItem[];
        savedAt: string;
      }>("trainer:clients");
      if (isOfflineError(err) && cached) {
        setItems(applyClientListFilter(cached.items, chip));
        setOfflineAt(cached.savedAt);
        setError(null);
      } else {
        if (!isOfflineError(err)) reportError("clients.load", err);
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

  useEffect(() => {
    if (searchOpen) {
      const t = setTimeout(() => searchRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [searchOpen]);

  const rows = useMemo(
    () =>
      items.map((item) => ({
        item,
        row: mapDirectoryItemToRow(item, trainerZone),
      })),
    [items, trainerZone],
  );

  const countFor = (id: ClientListFilter): number | null => {
    if (id === "all") return counts.all;
    if (id === "needs_attention") return counts.needs;
    if (id === "checkin_due") return counts.checkin;
    if (id === "onboarding") return counts.onboarding;
    if (id === "invites") return counts.invites;
    if (id === "ended") return counts.ended;
    return null;
  };

  const trainerName = me?.trainerProfile?.displayName
    ? formatPersonName(me.trainerProfile.displayName)
    : null;
  const offlineClock = offlineAt
    ? formatClockTime(offlineAt, trainerZone)
    : null;
  const eyebrow = offlineClock
    ? `As of ${offlineClock}`
    : trainerName
      ? counts.all > 0
        ? `${trainerName} · ${counts.all} active`
        : trainerName
      : counts.all > 0
        ? `${counts.all} active`
        : "Clients";

  async function copyWebLink() {
    // Dynamic import keeps expo-clipboard out of the ClientsTab module graph
    // for render tests that do not mock it.
    try {
      const { setStringAsync } = await import("expo-clipboard");
      const ok = await setStringAsync(trainerWebUrl());
      setCopied(Boolean(ok));
      if (ok) setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      reportError("clients.copy-web-link", err);
    }
  }

  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
  }

  if (segment === "activity") {
    return (
      <Screen v3 title="Clients" chrome="app" showHeader={false}>
        <ClientsHeader
          eyebrow="Last 7 days"
          onSearch={() => {
            setSegment("clients");
            setSearchOpen(true);
          }}
        />
        <SegmentBar segment={segment} onChange={setSegment} />
        <ActivityFeedScreen />
      </Screen>
    );
  }

  return (
    <Screen
      v3
      title="Clients"
      chrome="app"
      showHeader={false}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load().finally(() => setRefreshing(false));
      }}
    >
      {searchOpen ? (
        <SearchBar
          inputRef={searchRef}
          value={query}
          onChange={setQuery}
          onCancel={closeSearch}
        />
      ) : (
        <ClientsHeader eyebrow={eyebrow} onSearch={() => setSearchOpen(true)} />
      )}

      {searchOpen ? null : (
        <SegmentBar segment={segment} onChange={setSegment} />
      )}

      {searchOpen ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersScroll}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map((item) => {
            const count = countFor(item.id);
            const label =
              count == null ? item.label : `${item.label} ${count}`;
            const selected = chip === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setChip(item.id)}
                style={[styles.filter, selected ? styles.filterOn : null]}
              >
                <Text
                  style={[
                    styles.filterText,
                    selected ? styles.filterTextOn : null,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {offlineAt ? (
        <View style={styles.offlineBanner} accessibilityRole="alert">
          <Text style={styles.offlineText}>
            {`You're offline. Showing clients from ${offlineClock}.`}
          </Text>
        </View>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}

      {searchOpen && !loading ? (
        <Text style={styles.resultLabel}>
          {rows.length === 1
            ? "1 client"
            : `${rows.length} clients`}
        </Text>
      ) : null}

      {loading && rows.length === 0 ? <LoadingSkeleton /> : null}

      {!loading && rows.length === 0 ? (
        query.trim() || chip !== "all" || searchOpen ? (
          <Text style={styles.emptyMatch}>
            {query.trim()
              ? "No clients match."
              : chip === "invites"
                ? "No pending invites."
                : chip === "ended"
                  ? "No ended clients."
                  : "No clients match."}
          </Text>
        ) : (
          <EmptyState copied={copied} onCopy={() => void copyWebLink()} />
        )
      ) : null}

      {rows.length > 0 ? (
        <View style={styles.list}>
          {rows.map(({ item, row }, index) => {
            const tone = avatarTone(row.name);
            const age = formatRelative(item.updatedAt);
            const chips = rowChips(
              item,
              item.relationshipId
                ? attentionByRelationship.get(item.relationshipId)
                : undefined,
              item.relationshipId
                ? askByRelationship.has(item.relationshipId)
                : false,
            );
            // Invites without a relationship are not tappable into overview.
            const canOpen = Boolean(row.relationshipId);
            return (
              <Pressable
                key={row.key}
                accessibilityRole={canOpen ? "button" : "text"}
                disabled={!canOpen}
                onPress={() => {
                  if (canOpen) onOpenClient(row);
                }}
                style={[
                  styles.row,
                  index > 0 ? styles.rowBorder : null,
                  isEndedClient(item) ? styles.rowDim : null,
                ]}
              >
                <View
                  style={[
                    styles.avatar,
                    {
                      backgroundColor: isEndedClient(item) || item.status === "invited"
                        ? v3LightColors.fill
                        : tone.backgroundColor,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.avatarText,
                      {
                        color:
                          isEndedClient(item) || item.status === "invited"
                            ? v3LightColors.ink3
                            : tone.color,
                      },
                    ]}
                  >
                    {initialsFromName(row.name)}
                  </Text>
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={styles.name}>{formatPersonName(row.name)}</Text>
                    <Text style={styles.age}>{age}</Text>
                  </View>
                  <Text style={styles.sub}>{row.subtitle}</Text>
                  {chips.length > 0 ? (
                    <View style={styles.chipRow}>
                      {chips.map((entry) => (
                        <RosterChipView key={entry.key} chip={entry} />
                      ))}
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {searchOpen && query.trim() ? (
        <Text style={styles.endedNote}>
          Searches active, invited and ended clients.
        </Text>
      ) : null}
      {chip === "ended" && rows.length > 0 ? (
        <Text style={styles.endedNote}>
          Ended clients are read only. Reactivate from a client’s page.
        </Text>
      ) : null}
      {chip === "invites" && rows.length > 0 ? (
        <Text style={styles.endedNote}>
          Invite new clients on FitBud web.
        </Text>
      ) : null}
    </Screen>
  );
}

function ClientsHeader({
  eyebrow,
  onSearch,
}: {
  eyebrow: string;
  onSearch: () => void;
}) {
  return (
    <View style={styles.titleRow}>
      <View style={styles.titleBlock}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.screenTitle} accessibilityRole="header">
          Clients
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search clients"
        onPress={onSearch}
        style={styles.searchBtn}
      >
        <Search color={v3LightColors.ink} size={20} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

function SearchBar({
  inputRef,
  value,
  onChange,
  onCancel,
}: {
  inputRef: RefObject<TextInput | null>;
  value: string;
  onChange: (next: string) => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.searchRow}>
      <View style={styles.searchField}>
        <Search color={v3LightColors.ink3} size={18} strokeWidth={2} />
        <TextInput
          ref={inputRef as RefObject<TextInput>}
          accessibilityLabel="Search clients"
          value={value}
          onChangeText={onChange}
          placeholder="Search"
          placeholderTextColor={v3LightColors.ink3}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={styles.searchInput}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel search"
        onPress={onCancel}
        style={styles.cancelBtn}
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
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
            <Text
              style={[
                styles.segmentText,
                selected ? styles.segmentTextOn : null,
              ]}
            >
              {id === "clients" ? "Clients" : "Activity"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function EmptyState({
  copied,
  onCopy,
}: {
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Users color={v3LightColors.brand} size={28} strokeWidth={1.75} />
      </View>
      <Text style={styles.emptyTitle} accessibilityRole="header">
        No clients yet
      </Text>
      <Text style={styles.emptyBody}>
        Invite your first client from FitBud web. They’ll show up here once they
        accept.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Copy web link"
        onPress={onCopy}
        style={styles.copyBtn}
      >
        <Copy color={v3LightColors.brand} size={16} strokeWidth={2.2} />
        <Text style={styles.copyText}>
          {copied ? "Copied" : "Copy web link"}
        </Text>
      </Pressable>
    </View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={styles.list} accessibilityLabel="Loading clients">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <View key={i}>
          {i > 0 ? <View style={styles.rowBorderLine} /> : null}
          <View style={styles.skelRow}>
            <View style={[styles.skelBlock, { width: 44, height: 44, borderRadius: 22 }]} />
            <View style={{ flex: 1, gap: 7 }}>
              <View style={[styles.skelBlock, { width: "50%", height: 14 }]} />
              <View style={[styles.skelBlock, { width: "35%", height: 11 }]} />
              <View style={[styles.skelBlock, { width: "40%", height: 16 }]} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.midGrey, fontSize: 15, lineHeight: 20 },
  screenTitle: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 30,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  searchBtn: {
    alignItems: "center",
    backgroundColor: v3LightColors.fill,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    marginTop: 18,
    width: 40,
  },
  searchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
    marginTop: 6,
  },
  searchField: {
    alignItems: "center",
    backgroundColor: v3LightColors.fill,
    borderRadius: 14,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: v3LightColors.ink,
    flex: 1,
    fontSize: 16,
    minHeight: 44,
  },
  cancelBtn: { minHeight: 44, justifyContent: "center" },
  cancelText: {
    color: v3LightColors.brand,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  segment: {
    backgroundColor: v3LightColors.fill,
    borderRadius: 14,
    flexDirection: "row",
    marginBottom: 12,
    padding: 4,
  },
  segmentItem: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 40,
  },
  segmentOn: { backgroundColor: colors.white },
  segmentText: {
    color: colors.midGrey,
    fontFamily: fontFamilyMedium,
    fontSize: 15,
  },
  segmentTextOn: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
  },
  filtersScroll: { flexGrow: 0, marginBottom: 8, marginHorizontal: -4 },
  filters: { flexDirection: "row", gap: 8, paddingHorizontal: 4 },
  filter: {
    backgroundColor: colors.white,
    borderColor: v3LightColors.line2,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 12,
  },
  filterOn: {
    backgroundColor: v3LightColors.ink,
    borderColor: v3LightColors.ink,
  },
  filterText: {
    color: v3LightColors.ink,
    fontFamily: fontFamilyMedium,
    fontSize: 14,
  },
  filterTextOn: { color: colors.white },
  offlineBanner: {
    backgroundColor: v3LightColors.fill,
    borderRadius: 14,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  offlineText: { color: v3LightColors.ink2, fontSize: 14, lineHeight: 20 },
  resultLabel: {
    color: v3LightColors.ink3,
    fontFamily: fontFamilySemiBold,
    fontSize: 12,
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
    textTransform: "uppercase",
  },
  list: {
    backgroundColor: colors.white,
    borderColor: v3LightColors.line,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 4,
    overflow: "hidden",
  },
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowBorder: { borderTopColor: v3LightColors.line, borderTopWidth: StyleSheet.hairlineWidth },
  rowBorderLine: {
    backgroundColor: v3LightColors.line,
    height: StyleSheet.hairlineWidth,
    marginLeft: 70,
  },
  rowDim: { opacity: 0.65 },
  avatar: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  avatarText: { fontFamily: fontFamilySemiBold, fontSize: 13 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  name: {
    color: colors.deepNavy,
    flex: 1,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  age: { color: colors.midGrey, fontSize: 13 },
  sub: { color: colors.midGrey, fontSize: 13.5, marginTop: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 5 },
  chip: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: { fontFamily: fontFamilySemiBold, fontSize: 12 },
  endedNote: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  emptyMatch: {
    color: colors.deepNavy,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 24,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: v3LightColors.line,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 26,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: v3LightColors.brandTint,
    borderRadius: 16,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  emptyTitle: {
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 20,
    marginTop: 16,
  },
  emptyBody: {
    color: v3LightColors.ink2,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: "center",
  },
  copyBtn: {
    alignItems: "center",
    backgroundColor: v3LightColors.brandTint,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 48,
    paddingHorizontal: 18,
  },
  copyText: {
    color: v3LightColors.brand,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  skelRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  skelBlock: { backgroundColor: v3LightColors.skel1, borderRadius: 8 },
});
