import { useCallback, useEffect, useState } from "react";
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  Bell,
  ChevronRight,
  Cloud,
  Globe,
  KeyRound,
  Languages,
  LogOut,
  Mail,
  Moon,
  Shield,
  Smartphone,
  Utensils,
} from "lucide-react-native";
import type { CoachingRelationship } from "@fitbud/contracts";
import {
  formatCivilDate,
  formatLocalDate,
  formatPersonName,
  whatsappHref,
} from "@fitbud/core";
import { brand, ink, semantic, surface } from "@fitbud/tokens";
import {
  colors,
  fontFamilyBold,
  fontFamilySemiBold,
  spacing,
} from "@fitbud/ui-mobile";
import { Text } from "../components/Text";
import { BottomSheet } from "../components/BottomSheet";
import { ErrorBanner } from "../components/ErrorBanner";
import { useAuth } from "../auth/AuthProvider";
import { useConfig } from "../providers/ConfigProvider";
import { isStepsEnabled } from "../lib/config";
import {
  buildSupportMailto,
  DEFAULT_SUPPORT_EMAIL,
} from "../lib/support";
import { stage1Api } from "../lib/stage1Api";
import { useSyncEngine } from "../sync/SyncProvider";
import type { TraineeOverlayOpener } from "../navigation/TraineeOverlay";
import { M2Card, M2Group, M2Row, m2Gutter } from "./settings/m2";
import { clockRange } from "./settings/clock";

type Props = {
  relationship: CoachingRelationship;
  onOpenOverlay: TraineeOverlayOpener;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "•";
}

function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const now = new Date();
  let age = now.getFullYear() - year;
  const today = (now.getMonth() + 1) * 100 + now.getDate();
  if (today < month * 100 + day) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

function zoneName(zone: string | null | undefined): string {
  if (!zone || zone === "Asia/Kolkata" || zone === "Asia/Calcutta") {
    return "India Standard Time";
  }
  if (zone === "Asia/Dubai") return "Gulf Standard Time";
  try {
    const name = new Intl.DateTimeFormat("en-IN", {
      timeZone: zone,
      timeZoneName: "long",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    if (name && !/GMT|UTC/i.test(name)) return name;
  } catch {
    /* unknown zone */
  }
  return "Your time zone";
}

function civilFromIso(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatCivilDate(formatLocalDate(date, timeZone));
}

async function copyText(value: string): Promise<boolean> {
  const clipboard = (
    globalThis as { navigator?: { clipboard?: { writeText?: (v: string) => Promise<void> } } }
  ).navigator?.clipboard;
  if (!clipboard?.writeText) return false;
  await clipboard.writeText(value);
  return true;
}

export function MoreScreen({ relationship, onOpenOverlay }: Props) {
  const { api, me, signOut, selectRole } = useAuth();
  const { config } = useConfig();
  const sync = useSyncEngine();
  const s1 = stage1Api(api);
  const stepsOn = isStepsEnabled(config);
  const supportEmail = config?.supportEmail ?? DEFAULT_SUPPORT_EMAIL;
  const timeZone = me?.timezone || "Asia/Kolkata";
  const coachName = formatPersonName(
    relationship.trainerDisplayName?.trim() || "Your coach",
  );
  const [displayName, setDisplayName] = useState(
    formatPersonName(me?.email?.split("@")[0] ?? "You"),
  );
  const [profileLine, setProfileLine] = useState("Profile · kg and cm");
  const [quietLabel, setQuietLabel] = useState("10:00 pm – 7:00 am");
  const [mealLabel, setMealLabel] = useState("");
  const [pastHint, setPastHint] = useState<string | null>(null);
  const [zone, setZone] = useState(timeZone);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [signOutCount, setSignOutCount] = useState<number | null>(null);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [syncLabel, setSyncLabel] = useState("All saved");

  const load = useCallback(async () => {
    setError(null);
    const browserOffline =
      typeof navigator !== "undefined" && navigator.onLine === false;
    setOffline(browserOffline);
    try {
      const [profile, prefs, meals, rels] = await Promise.all([
        api.getTraineeProfile().catch(() => null),
        api.getNotificationPreferences().catch(() => null),
        s1.getMealTimes().catch(() => null),
        api.listRelationships({ limit: 50 }).catch(() => null),
      ]);
      if (profile) {
        const name = formatPersonName(profile.displayName);
        setDisplayName(name);
        const age = ageFromDob(profile.dateOfBirth);
        setProfileLine(
          age == null ? "Profile · kg and cm" : `Profile · ${age} · kg and cm`,
        );
      }
      if (prefs?.quietHoursStart && prefs.quietHoursEnd) {
        setQuietLabel(clockRange(prefs.quietHoursStart, prefs.quietHoursEnd));
      }
      if (prefs?.traineeTimezone) setZone(prefs.traineeTimezone);
      if (meals) {
        const changed = meals.slots.filter((slot) => slot.overrideTime).length;
        setMealLabel(
          changed > 0
            ? `${changed} changed`
            : meals.slots.length > 0
              ? `${meals.slots.length} meals`
              : "",
        );
      }
      const ended = (rels?.items ?? []).filter((row) => row.status === "ended");
      if (ended.length > 0) {
        const latest = [...ended].sort((a, b) =>
          (b.endedAt ?? "").localeCompare(a.endedAt ?? ""),
        )[0]!;
        const who = formatPersonName(
          latest.trainerDisplayName?.trim() || "Previous coach",
        );
        const start = civilFromIso(latest.startedAt, timeZone);
        const end = civilFromIso(latest.endedAt, timeZone);
        setPastHint(
          start && end ? `${who} · ${start} – ${end}` : who,
        );
      } else {
        setPastHint(null);
      }
      const outbox = await sync.store.listOutbox().catch(() => []);
      const failed = outbox.some(
        (row) => row.status === "rejected" || row.status === "conflicted",
      );
      const waiting = outbox.some(
        (row) => row.status === "pending" || row.status === "in_flight",
      );
      setSyncLabel(failed ? "Couldn't send" : waiting ? "Saved on phone" : "All saved");
    } catch {
      setError(
        browserOffline
          ? "You're offline. Pull to try again."
          : "Could not load settings.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, me?.timezone, s1, sync.store, timeZone]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openHelp() {
    const url = buildSupportMailto({
      supportEmail,
      screenId: "TR-20",
      role: "trainee",
      extra: "Screen name: More",
    });
    const can = await Linking.canOpenURL(url).catch(() => false);
    if (can) {
      await Linking.openURL(url);
      return;
    }
    setCopied(null);
    setHelpOpen(true);
  }

  async function askCoach() {
    const phone = relationship.trainerWhatsappE164;
    if (!phone) return;
    const first = coachName.split(/\s+/)[0] || "coach";
    const href = whatsappHref({
      phoneE164: phone,
      draftText: `Hi ${first}, I have a question.`,
    });
    await Linking.openURL(href);
  }

  async function beginSignOut() {
    const rows = await sync.store.listOutbox();
    const unsent = rows.filter(
      (row) =>
        row.status === "pending" ||
        row.status === "in_flight" ||
        row.status === "rejected" ||
        row.status === "conflicted",
    );
    if (unsent.length > 0) {
      setSignOutCount(unsent.length);
      return;
    }
    signOut();
  }

  async function saveZone(next: string) {
    setZone(next);
    setZoneOpen(false);
    try {
      await api.updateNotificationPreferences({ traineeTimezone: next });
    } catch {
      setError("Could not save your time zone. Pull to try again.");
    }
  }

  const dual = me?.permittedRoles.includes("trainer") ?? false;
  const endedCoaching = relationship.status === "ended";
  const coachSince = civilFromIso(relationship.startedAt, zone || timeZone);
  const coachHint = endedCoaching
    ? `Coaching ended ${civilFromIso(relationship.endedAt, zone || timeZone) || "recently"}`
    : coachSince
      ? `Coaching since ${coachSince}`
      : "Your coach";

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <Text style={styles.h1} accessibilityRole="header">
        More
      </Text>
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? (
        <Text style={styles.muted} accessibilityLabel="Loading settings">
          Loading…
        </Text>
      ) : null}
      {offline && !error ? (
        <Text style={styles.muted}>You're offline. Showing what we have.</Text>
      ) : null}

      <M2Card>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profile"
          onPress={() => onOpenOverlay({ screen: "profile" })}
          style={styles.prof}
        >
          <View style={styles.avatarLg}>
            <Text style={styles.avatarLgText}>{initials(displayName)}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.profName}>{displayName}</Text>
            <Text style={styles.profSub}>{profileLine}</Text>
          </View>
          <ChevronRight color={ink[500]} size={18} strokeWidth={2} />
        </Pressable>
        <View style={styles.coach}>
          <View style={styles.coachRow}>
            <View style={styles.avatarMd}>
              <Text style={styles.avatarMdText}>{initials(coachName)}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.coachName}>
                {endedCoaching ? coachName : `${coachName} · your coach`}
              </Text>
              <Text style={styles.profSub}>{coachHint}</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ask coach on WhatsApp"
            disabled={!relationship.trainerWhatsappE164}
            onPress={() => {
              void askCoach();
            }}
            style={[
              styles.waBtn,
              !relationship.trainerWhatsappE164 ? styles.waDisabled : null,
            ]}
          >
            <WhatsAppGlyph />
            <Text style={styles.waLabel}>Ask coach on WhatsApp</Text>
          </Pressable>
          <Text style={styles.waLine}>
            {relationship.trainerWhatsappE164
              ? "Opens WhatsApp with a draft. You press Send."
              : "Your coach hasn't added a WhatsApp number yet."}
          </Text>
        </View>
      </M2Card>

      <View style={styles.group}>
        <M2Group>
          <M2Row
            icon={<Bell color={brand.indigo} size={17} strokeWidth={1.75} />}
            label="Reminders"
            value="Meals and workouts"
            onPress={() => onOpenOverlay({ screen: "reminder_settings" })}
          />
          <M2Row
            icon={<Utensils color={brand.indigo} size={17} strokeWidth={1.75} />}
            label="Meal times"
            value={mealLabel || undefined}
            onPress={() => onOpenOverlay({ screen: "meal_times" })}
          />
          <M2Row
            icon={<Moon color={brand.indigo} size={17} strokeWidth={1.75} />}
            label="Quiet hours"
            value={quietLabel}
            onPress={() => onOpenOverlay({ screen: "quiet_hours" })}
          />
          <M2Row
            icon={<Globe color={brand.indigo} size={17} strokeWidth={1.75} />}
            label="Time zone"
            hint={`${zoneName(zone)} · from phone`}
            showChevron={false}
            trailing={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change time zone"
                onPress={() => setZoneOpen(true)}
                style={styles.change}
              >
                <Text style={styles.changeText}>Change</Text>
              </Pressable>
            }
          />
        </M2Group>
      </View>

      <View style={styles.group}>
        <M2Group>
          <M2Row
            tile="neutral"
            icon={<KeyRound color={ink[500]} size={17} strokeWidth={1.75} />}
            label="Password and sign-in"
            onPress={() => onOpenOverlay({ screen: "password" })}
          />
          {pastHint ? (
            <M2Row
              tile="neutral"
              icon={<HistoryIcon />}
              label="Past coaching"
              hint={pastHint}
              onPress={() => onOpenOverlay({ screen: "past_coaching" })}
            />
          ) : null}
          <M2Row
            tile="neutral"
            icon={<Languages color={ink[500]} size={17} strokeWidth={1.75} />}
            label="Language"
            value="English"
            onPress={() => onOpenOverlay({ screen: "language" })}
          />
          {stepsOn ? (
            <M2Row
              tile="neutral"
              label="Steps"
              onPress={() => onOpenOverlay({ screen: "steps_settings" })}
            />
          ) : null}
          <M2Row
            tile="neutral"
            icon={<Cloud color={ink[500]} size={17} strokeWidth={1.75} />}
            label="Sync status"
            value={syncLabel}
            onPress={() => onOpenOverlay({ screen: "sync" })}
          />
          <M2Row
            tile="neutral"
            icon={<Smartphone color={ink[500]} size={17} strokeWidth={1.75} />}
            label="Lock-screen widget"
            onPress={() => onOpenOverlay({ screen: "widget_tips" })}
          />
          <M2Row
            tile="neutral"
            icon={<Shield color={ink[500]} size={17} strokeWidth={1.75} />}
            label="Privacy"
            hint="What your coach can see"
            onPress={() => onOpenOverlay({ screen: "privacy" })}
          />
        </M2Group>
      </View>

      <View style={styles.group}>
        <M2Group>
          <M2Row
            tile="neutral"
            icon={<Mail color={ink[500]} size={17} strokeWidth={1.75} />}
            label="Help"
            hint="We'll get back to you within a day."
            onPress={() => {
              void openHelp();
            }}
          />
          {dual ? (
            <M2Row
              tile="neutral"
              label="Switch to coach view"
              onPress={() => {
                void selectRole("trainer");
              }}
            />
          ) : null}
          <M2Row
            tile="critical"
            icon={<LogOut color={semantic.critical.text} size={17} strokeWidth={1.75} />}
            label="Sign out"
            labelColor={semantic.critical.text}
            showChevron={false}
            onPress={() => {
              void beginSignOut();
            }}
          />
        </M2Group>
      </View>

      <BottomSheet
        visible={helpOpen}
        title="Email support"
        subtitle="We'll get back to you within a day."
        onDismiss={() => setHelpOpen(false)}
      >
        <Text style={styles.sheetBody}>{supportEmail}</Text>
        {copied ? <Text style={styles.sheetOk}>{copied}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy address"
          style={styles.sheetBtn}
          onPress={() => {
            void copyText(supportEmail).then((ok) => {
              setCopied(
                ok
                  ? `Email address copied: ${supportEmail}`
                  : supportEmail,
              );
            });
          }}
        >
          <Text style={styles.sheetBtnText}>Copy address</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy details"
          style={styles.sheetBtn}
          onPress={() => {
            const details = buildSupportMailto({
              supportEmail,
              screenId: "TR-20",
              role: "trainee",
              extra: "Screen name: More",
            });
            void copyText(details).then(() => {
              setCopied("Support details copied.");
            });
          }}
        >
          <Text style={styles.sheetBtnText}>Copy details</Text>
        </Pressable>
      </BottomSheet>

      <BottomSheet
        visible={zoneOpen}
        title="Time zone"
        subtitle="From your phone, unless you change it."
        onDismiss={() => setZoneOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="India Standard Time"
          style={styles.sheetBtn}
          onPress={() => {
            void saveZone("Asia/Kolkata");
          }}
        >
          <Text style={styles.sheetBtnText}>India Standard Time</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Gulf Standard Time"
          style={styles.sheetBtn}
          onPress={() => {
            void saveZone("Asia/Dubai");
          }}
        >
          <Text style={styles.sheetBtnText}>Gulf Standard Time</Text>
        </Pressable>
      </BottomSheet>

      <BottomSheet
        visible={signOutCount != null}
        title="Sign out anyway?"
        subtitle={
          signOutCount == null
            ? undefined
            : `${signOutCount} ${signOutCount === 1 ? "log hasn't" : "logs haven't"} been sent. Sign out anyway?`
        }
        onDismiss={() => setSignOutCount(null)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Stay signed in"
          style={styles.sheetBtn}
          onPress={() => setSignOutCount(null)}
        >
          <Text style={styles.sheetBtnText}>Stay</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out anyway"
          style={styles.sheetBtn}
          onPress={() => {
            setSignOutCount(null);
            signOut();
          }}
        >
          <Text style={[styles.sheetBtnText, { color: semantic.critical.text }]}>
            Sign out anyway
          </Text>
        </Pressable>
      </BottomSheet>
    </ScrollView>
  );
}

function HistoryIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
        stroke={ink[500]}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M3 3v5h5M12 7v5l4 2"
        stroke={ink[500]}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function WhatsAppGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        fill="#25D366"
        d="M12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.9 0-3.18-1.24-6.16-3.48-8.41A11.82 11.82 0 0 0 12.05 0Z"
      />
      <Path
        fill="#fff"
        d="M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88Z"
      />
      <Path
        fill="#25D366"
        d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.47-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35Z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: surface.pageMobile,
  },
  content: {
    paddingBottom: 32,
    paddingHorizontal: m2Gutter,
    paddingTop: 8,
  },
  h1: {
    color: brand.deepNavy,
    fontFamily: fontFamilyBold,
    fontSize: 30,
    letterSpacing: -0.66,
    lineHeight: 36,
    marginBottom: 12,
    marginLeft: 4,
  },
  muted: {
    color: ink[500],
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  group: {
    marginTop: 16,
  },
  prof: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    minHeight: 84,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  avatarLg: {
    alignItems: "center",
    backgroundColor: brand.paleLavender,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  avatarLgText: {
    color: brand.indigo,
    fontFamily: fontFamilyBold,
    fontSize: 19,
  },
  profName: {
    color: brand.deepNavy,
    fontFamily: fontFamilyBold,
    fontSize: 20,
    letterSpacing: -0.2,
    lineHeight: 26,
  },
  profSub: {
    color: ink[500],
    fontSize: 14,
    lineHeight: 19,
  },
  flex: {
    flex: 1,
  },
  coach: {
    borderTopColor: surface.border,
    borderTopWidth: 1,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  coachRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  avatarMd: {
    alignItems: "center",
    backgroundColor: brand.deepNavy,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  avatarMdText: {
    color: colors.white,
    fontFamily: fontFamilySemiBold,
    fontSize: 13,
  },
  coachName: {
    color: brand.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  waBtn: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: "#D5D8E2",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    height: 48,
    justifyContent: "center",
    marginTop: 12,
  },
  waDisabled: {
    opacity: 0.5,
  },
  waLabel: {
    color: ink[700],
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  waLine: {
    color: ink[500],
    fontSize: 13,
    lineHeight: 17,
    marginTop: 6,
    textAlign: "center",
  },
  change: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  changeText: {
    color: brand.indigo,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  sheetBody: {
    color: brand.deepNavy,
    fontSize: 16,
    marginBottom: 8,
  },
  sheetOk: {
    color: ink[500],
    fontSize: 14,
    marginBottom: 8,
  },
  sheetBtn: {
    alignItems: "center",
    borderColor: surface.border,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 8,
    minHeight: 48,
  },
  sheetBtnText: {
    color: brand.indigo,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
});
