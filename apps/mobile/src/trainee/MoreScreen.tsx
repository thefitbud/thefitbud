import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import {
  Bell,
  ChevronRight,
  Globe,
  History,
  KeyRound,
  Languages,
  Mail,
  Moon,
  RefreshCw,
  Shield,
  Smartphone,
  Utensils,
  LogOut,
} from "lucide-react-native";
import { Text } from "../components/Text";
import type { CoachingRelationship, TraineeProfile } from "@fitbud/contracts";
import { formatCivilDate, whatsappHref } from "@fitbud/core";
import { colors, radii, semanticColors, spacing, touchTargetMin } from "@fitbud/ui-mobile";
import { useConfig } from "../providers/ConfigProvider";
import { useAuth } from "../auth/AuthProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { openSupportEmail, DEFAULT_SUPPORT_EMAIL } from "../lib/support";
import { stage1Api } from "../lib/stage1Api";
import type { TraineeOverlayOpener } from "../navigation/TraineeOverlay";
import { WhatsAppGlyph } from "../components/m2/WhatsAppGlyph";
import { coachInitials } from "./workoutDisplay";
import { useSyncEngine } from "../sync/SyncProvider";

type Props = {
  relationship: CoachingRelationship;
  onOpenOverlay: TraineeOverlayOpener;
};

function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.split("-").map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  const md = (now.getMonth() + 1) * 100 + now.getDate();
  const bd = m * 100 + d;
  if (md < bd) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function timezoneLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-IN", {
      timeZone: tz,
      timeZoneName: "long",
    }).formatToParts(new Date());
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    return name ?? tz;
  } catch {
    return tz;
  }
}

export function MoreScreen({ relationship, onOpenOverlay }: Props) {
  const { me, signOut, selectRole, api } = useAuth();
  const sync = useSyncEngine();
  const { config } = useConfig();
  const s1 = stage1Api(api);
  const supportEmail = config?.supportEmail ?? DEFAULT_SUPPORT_EMAIL;
  const trainerName =
    relationship.trainerDisplayName?.trim() ||
    me?.trainerProfile?.displayName?.trim() ||
    "Your coach";
  const coachShort = trainerName.split(/\s+/)[0] ?? trainerName;

  const [profile, setProfile] = useState<TraineeProfile | null>(null);
  const [mealCount, setMealCount] = useState<number | null>(null);
  const [quietHours, setQuietHours] = useState<string | null>(null);
  const [locale, setLocale] = useState("English");
  const [syncLabel, setSyncLabel] = useState("All saved");

  const loadMeta = useCallback(async () => {
    try {
      const trainee = await api.getTraineeProfile();
      setProfile(trainee);
    } catch {
      setProfile(null);
    }
    try {
      const prefs = await api.getNotificationPreferences();
      if (prefs.quietHoursStart && prefs.quietHoursEnd) {
        setQuietHours(`${prefs.quietHoursStart} – ${prefs.quietHoursEnd}`);
      }
      if (prefs.locale) {
        setLocale(prefs.locale === "en-IN" ? "English" : prefs.locale);
      }
    } catch {
      // ignore
    }
    try {
      const meals = await s1.getMealTimes();
      setMealCount(meals.slots.length);
    } catch {
      setMealCount(null);
    }
    const outbox = await sync.store.listOutbox();
    const pending = outbox.some(
      (row) => row.status === "pending" || row.status === "in_flight",
    );
    setSyncLabel(pending ? "Syncing…" : "All saved");
  }, [api, s1, sync.store]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const displayName = profile?.displayName?.trim() || me?.email?.split("@")[0] || "You";
  const age = ageFromDob(profile?.dateOfBirth);
  const profileMeta = [
    "Profile",
    age != null ? String(age) : null,
    "kg and cm",
  ]
    .filter(Boolean)
    .join(" · ");

  const coachingSince = formatCivilDate(
    relationship.startedAt.slice(0, 10),
    { includeWeekday: true },
  );

  const tz = me?.timezone ?? "UTC";

  async function openCoachWhatsApp() {
    const phone = relationship.trainerWhatsappE164;
    if (!phone) return;
    const url = whatsappHref({
      phoneE164: phone,
      draftText: `Hi ${coachShort}, `,
    });
    try {
      await Linking.openURL(url);
    } catch {
      // ignore
    }
  }

  const cardShadow = useMemo(
    () =>
      Platform.select({
        ios: {
          shadowColor: "#1A1248",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 3,
        },
        default: { elevation: 1 },
      }),
    [],
  );

  function row(
    key: string,
    opts: {
      icon: ReactNode;
      title: string;
      subtitle?: string;
      value?: string;
      onPress?: () => void;
      rightAction?: React.ReactNode;
      titleColor?: string;
      tileNeu?: boolean;
    },
  ) {
    const content = (
      <>
        <View style={[styles.tile, opts.tileNeu && styles.tileNeu]}>{opts.icon}</View>
        <View style={styles.lrowText}>
          <Text style={[styles.rowTitle, opts.titleColor ? { color: opts.titleColor } : null]}>
            {opts.title}
          </Text>
          {opts.subtitle ? <Text style={styles.rowMeta}>{opts.subtitle}</Text> : null}
        </View>
        {opts.value ? <Text style={styles.rowVal}>{opts.value}</Text> : null}
        {opts.rightAction ?? (opts.onPress ? (
          <ChevronRight size={18} color={colors.midGrey} strokeWidth={2} />
        ) : null)}
      </>
    );
    if (opts.onPress) {
      return (
        <Pressable
          key={key}
          accessibilityRole="button"
          style={styles.lrow}
          onPress={opts.onPress}
        >
          {content}
        </Pressable>
      );
    }
    return (
      <View key={key} style={styles.lrow}>
        {content}
      </View>
    );
  }

  return (
    <Screen chrome="app" title="More" showHeader={false}>
      <Text style={styles.h1} accessibilityRole="header">
        More
      </Text>

      <View style={[styles.listCard, cardShadow]}>
        <Pressable
          accessibilityRole="button"
          style={styles.prof}
          onPress={() => onOpenOverlay({ screen: "profile" })}
        >
          <View style={styles.avatarLg}>
            <Text style={styles.avatarText}>{coachInitials(displayName)}</Text>
          </View>
          <View style={styles.profText}>
            <Text style={styles.profName}>{displayName}</Text>
            <Text style={styles.profMeta}>{profileMeta}</Text>
          </View>
          <ChevronRight size={18} color={colors.midGrey} strokeWidth={2} />
        </Pressable>

        <View style={styles.coachBlock}>
          <View style={styles.coachRow}>
            <View style={styles.avatarMd}>
              <Text style={styles.avatarTextMd}>
                {coachInitials(trainerName)}
              </Text>
            </View>
            <View style={styles.lrowText}>
              <Text style={styles.rowTitle}>{trainerName} · your coach</Text>
              <Text style={styles.rowMeta}>Coaching since {coachingSince}</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ask coach on WhatsApp"
            style={styles.waBtn}
            onPress={() => {
              void openCoachWhatsApp();
            }}
          >
            <WhatsAppGlyph />
            <Text style={styles.waBtnLabel}>Ask coach on WhatsApp</Text>
          </Pressable>
          <Text style={styles.waLine}>
            Opens WhatsApp with a draft. You press Send.
          </Text>
        </View>
      </View>

      <View style={[styles.listCard, styles.listGap, cardShadow]}>
        {row("reminders", {
          icon: <Bell size={19} color={colors.indigo} strokeWidth={1.75} />,
          title: "Reminders",
          value: "Meals and workouts",
          onPress: () => onOpenOverlay({ screen: "reminder_settings" }),
        })}
        {row("meals", {
          icon: <Utensils size={19} color={colors.indigo} strokeWidth={1.75} />,
          title: "Meal times",
          value: mealCount != null ? `${mealCount} meals` : "—",
          onPress: () => onOpenOverlay({ screen: "meal_times" }),
        })}
        {row("quiet", {
          icon: <Moon size={19} color={colors.indigo} strokeWidth={1.75} />,
          title: "Quiet hours",
          value: quietHours ?? "—",
          onPress: () => onOpenOverlay({ screen: "quiet_hours" }),
        })}
        {row("tz", {
          icon: <Globe size={19} color={colors.indigo} strokeWidth={1.75} />,
          title: "Time zone",
          subtitle: `${timezoneLabel(tz)} · from phone`,
          rightAction: (
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenOverlay({ screen: "profile" })}
            >
              <Text style={styles.changeLink}>Change</Text>
            </Pressable>
          ),
        })}
      </View>

      <View style={[styles.listCard, styles.listGap, cardShadow]}>
        {row("password", {
          icon: <KeyRound size={19} color={colors.midGrey} strokeWidth={1.75} />,
          title: "Password and sign-in",
          tileNeu: true,
          onPress: () => onOpenOverlay({ screen: "password" }),
        })}
        {row("past", {
          icon: <History size={19} color={colors.midGrey} strokeWidth={1.75} />,
          title: "Past coaching",
          subtitle: "Previous coaches and dates",
          tileNeu: true,
          onPress: () => onOpenOverlay({ screen: "past_coaching" }),
        })}
        {row("language", {
          icon: <Languages size={19} color={colors.midGrey} strokeWidth={1.75} />,
          title: "Language",
          value: locale,
          tileNeu: true,
          onPress: () => onOpenOverlay({ screen: "profile" }),
        })}
        {row("sync", {
          icon: <RefreshCw size={19} color={colors.midGrey} strokeWidth={1.75} />,
          title: "Sync status",
          value: syncLabel,
          tileNeu: true,
          onPress: () => onOpenOverlay({ screen: "sync" }),
        })}
        {row("widget", {
          icon: <Smartphone size={19} color={colors.midGrey} strokeWidth={1.75} />,
          title: "Lock-screen widget",
          tileNeu: true,
          onPress: () => onOpenOverlay({ screen: "widget_tips" }),
        })}
        {row("privacy", {
          icon: <Shield size={19} color={colors.midGrey} strokeWidth={1.75} />,
          title: "Privacy",
          subtitle: "What your coach can see",
          tileNeu: true,
          onPress: () => onOpenOverlay({ screen: "privacy" }),
        })}
      </View>

      <View style={[styles.listCard, styles.listGap, cardShadow]}>
        <Pressable
          accessibilityRole="button"
          style={styles.lrow}
          onPress={() => {
            void openSupportEmail({
              supportEmail,
              screenId: "TR-20",
              role: "trainee",
              extra: `Relationship: ${relationship.id}`,
            });
          }}
        >
          <View style={[styles.tile, styles.tileNeu]}>
            <Mail size={19} color={colors.midGrey} strokeWidth={1.75} />
          </View>
          <View style={styles.lrowText}>
            <Text style={styles.rowTitle}>Help</Text>
            <Text style={styles.rowMeta}>
              We&apos;ll get back to you within a day.
            </Text>
          </View>
          <ChevronRight size={18} color={colors.midGrey} strokeWidth={2} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={styles.lrow}
          onPress={signOut}
        >
          <View style={[styles.tile, styles.tileCrit]}>
            <LogOut size={19} color={semanticColors.critical.text} strokeWidth={1.75} />
          </View>
          <View style={styles.lrowText}>
            <Text style={[styles.rowTitle, styles.signOutTitle]}>Sign out</Text>
          </View>
        </Pressable>
      </View>

      {me?.permittedRoles.includes("trainer") ? (
        <PrimaryButton
          label="Switch to trainer mode"
          variant="secondary"
          onPress={() => {
            void selectRole("trainer");
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: {
    color: colors.deepNavy,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.66,
    lineHeight: 36,
    marginBottom: spacing.md,
    paddingHorizontal: 4,
  },
  listCard: {
    backgroundColor: colors.white,
    borderColor: "#E7E9F2",
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  listGap: {
    marginTop: spacing.md,
  },
  prof: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  profText: {
    flex: 1,
  },
  profName: {
    color: colors.deepNavy,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.2,
    lineHeight: 26,
  },
  profMeta: {
    color: colors.midGrey,
    fontSize: 14,
  },
  avatarLg: {
    alignItems: "center",
    backgroundColor: "#C9BEFF",
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  avatarMd: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  avatarText: {
    color: colors.deepNavy,
    fontSize: 19,
    fontWeight: "700",
  },
  avatarTextMd: {
    color: colors.deepNavy,
    fontSize: 15,
    fontWeight: "700",
  },
  coachBlock: {
    borderTopColor: "#E7E9F2",
    borderTopWidth: 1,
    paddingBottom: 12,
    paddingHorizontal: spacing.lg,
    paddingTop: 14,
  },
  coachRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  waLine: {
    color: colors.midGrey,
    fontSize: 13,
    lineHeight: 17,
    marginTop: 6,
    textAlign: "center",
  },
  lrow: {
    alignItems: "center",
    borderTopColor: "#E7E9F2",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  lrowText: {
    flex: 1,
    minWidth: 0,
  },
  tile: {
    alignItems: "center",
    backgroundColor: colors.paleLavender,
    borderRadius: 11,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  tileNeu: {
    backgroundColor: colors.background,
  },
  tileCrit: {
    backgroundColor: semanticColors.critical.fill,
  },
  rowTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  rowMeta: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 19,
  },
  rowVal: {
    color: colors.midGrey,
    fontSize: 15,
  },
  changeLink: {
    color: colors.indigo,
    fontSize: 15,
    fontWeight: "600",
    minHeight: touchTargetMin,
    lineHeight: touchTargetMin,
  },
  signOutTitle: {
    color: semanticColors.critical.text,
  },
  waBtn: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.lightGrey,
    borderRadius: radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    height: 48,
    justifyContent: "center",
  },
  waBtnLabel: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
});
