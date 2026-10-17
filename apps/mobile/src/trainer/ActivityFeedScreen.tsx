import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
type ActivityFeedEvent = Awaited<
  ReturnType<ReturnType<typeof stage1Api>["getActivityFeed"]>
>["events"][number];
import { colors, spacing } from "@fitbud/ui-mobile";
import { stage1Api } from "../lib/stage1Api";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { SegmentedControl } from "../components/SegmentedControl";

type Filter = "all" | "meals" | "workouts" | "checkins";

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function matchesFilter(event: ActivityFeedEvent, filter: Filter): boolean {
  if (filter === "all") return true;
  const hay = `${event.type} ${event.subtype ?? ""} ${event.summary}`.toLowerCase();
  if (filter === "meals") return hay.includes("meal") || hay.includes("kcal");
  if (filter === "workouts") return hay.includes("workout");
  if (filter === "checkins") return hay.includes("check");
  return true;
}

type Props = {
  relationshipId?: string;
};

export function ActivityFeedScreen({ relationshipId }: Props) {
  const { api } = useAuth();
  const s1 = stage1Api(api);
  const [events, setEvents] = useState<ActivityFeedEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReset = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await s1.getActivityFeed({
        limit: 20,
        rid: relationshipId,
      });
      setEvents(page.events);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load activity.",
      );
    } finally {
      setLoading(false);
    }
  }, [relationshipId, s1]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await s1.getActivityFeed({
        limit: 20,
        cursor,
        rid: relationshipId,
      });
      setEvents((prev) => [...prev, ...page.events]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load activity.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void loadReset();
  }, [loadReset]);

  const filtered = useMemo(
    () => events.filter((event) => matchesFilter(event, filter)),
    [events, filter],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, ActivityFeedEvent[]>();
    for (const event of filtered) {
      const day = event.occurredAt.slice(0, 10);
      const bucket = map.get(day) ?? [];
      bucket.push(event);
      map.set(day, bucket);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  if (loading && events.length === 0) {
    return <Text style={styles.muted}>Loading activity…</Text>;
  }

  return (
    <View style={styles.wrap}>
      {error ? <ErrorBanner message={error} /> : null}
      <SegmentedControl
        options={[
          { id: "all", label: "All" },
          { id: "meals", label: "Meals" },
          { id: "workouts", label: "Workouts" },
          { id: "checkins", label: "Check-ins" },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <PrimaryButton
        label="Refresh"
        variant="secondary"
        loading={loading}
        onPress={() => {
          void loadReset();
        }}
      />
      {filtered.length === 0 ? (
        <Text style={styles.muted}>
          No client activity yet. It'll appear as your clients log.
        </Text>
      ) : (
        <View style={styles.list}>
          {grouped.map(([day, dayEvents]) => (
            <View key={day} style={styles.group}>
              <Text style={styles.groupTitle}>
                {new Intl.DateTimeFormat("en-IN", {
                  dateStyle: "full",
                }).format(new Date(`${day}T12:00:00.000Z`))}
              </Text>
              {dayEvents.map((event) => (
                <View key={event.id} style={styles.row}>
                  <Text style={styles.who}>
                    {event.traineeDisplayName ?? "Client"}
                  </Text>
                  <Text style={styles.summary}>{event.summary}</Text>
                  <Text style={styles.meta}>
                    {formatWhen(event.occurredAt)}
                    {event.traineeLocalTime
                      ? ` · ${event.traineeLocalTime} their time`
                      : ""}
                    {event.kcal != null ? ` · ${event.kcal} kcal` : ""}
                  </Text>
                  <View style={styles.actions}>
                    <Pressable
                      accessibilityRole="button"
                      style={styles.actionBtn}
                      onPress={() => {
                        if (event.link) {
                          void import("expo-linking").then((Linking) =>
                            Linking.openURL(event.link!),
                          );
                        }
                      }}
                    >
                      <Text style={styles.actionText}>Open</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      style={styles.actionBtnAlt}
                      onPress={() => {
                        void import("./whatsapp").then(({ openContextualWhatsApp }) =>
                          openContextualWhatsApp({
                            draftText: `Hi — saw your update: ${event.summary}`,
                          }),
                        );
                      }}
                    >
                      <Text style={styles.actionTextAlt}>Nudge</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
      {cursor ? (
        <PrimaryButton
          label="Load more"
          variant="ghost"
          loading={loadingMore}
          onPress={() => {
            void loadMore();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  muted: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.lg,
  },
  list: {
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  group: {
    gap: spacing.sm,
  },
  groupTitle: {
    color: colors.deepNavy,
    fontSize: 14,
    fontWeight: "700",
  },
  row: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderColor: colors.lightGrey,
    borderWidth: 1,
    gap: spacing.xs,
    minHeight: 64,
    padding: spacing.lg,
  },
  who: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "600",
  },
  summary: {
    color: colors.darkGrey,
    fontSize: 14,
    lineHeight: 20,
  },
  meta: {
    color: colors.midGrey,
    fontSize: 12,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionBtn: {
    backgroundColor: colors.paleLavender,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  actionBtnAlt: {
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  actionText: {
    color: colors.indigo,
    fontSize: 13,
    fontWeight: "600",
  },
  actionTextAlt: {
    color: colors.deepNavy,
    fontSize: 13,
    fontWeight: "600",
  },
});
