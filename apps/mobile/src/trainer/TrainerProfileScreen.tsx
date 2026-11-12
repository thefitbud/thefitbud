import { useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { ChevronLeft, ChevronRight, KeyRound } from "lucide-react-native";
import { ApiClientError } from "@fitbud/api-client";
import { brand, ink, surface } from "@fitbud/tokens";
import { fontFamilyBold, fontFamilySemiBold, spacing } from "@fitbud/ui-mobile";
import { Text } from "../components/Text";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { reportError } from "../lib/reportError";
import type {
  TrainerProfile,
  UpdateTrainerProfileRequest,
} from "@fitbud/contracts";
import { Screen } from "../components/Screen";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { stage1Api } from "../lib/stage1Api";

/** `PUT /me/trainer-profile` is installed on the client at runtime (api-client stage1-augment) but is not in the typed wrappers. */
type ProfileWriter = {
  updateTrainerProfile(
    body: UpdateTrainerProfileRequest,
  ): Promise<TrainerProfile>;
};

type Props = {
  onBack: () => void;
  /** Overrides the built-in password flow (tests, future shells). */
  onChangePassword?: () => void;
};

/** Frame 55 shows "India (IST)". Other zones show their zone name as stored (no picker exists yet). */
export function timezoneLabel(zone: string | null | undefined): string {
  if (!zone) return "—";
  if (zone === "Asia/Kolkata" || zone === "Asia/Calcutta") return "India (IST)";
  return zone;
}

/** Frame 55: "Current password, then a new one". Calls the signed-in password change. */
export function ChangePasswordForm({ onBack }: { onBack: () => void }) {
  const { api } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit() {
    if (current.length < 8 || next.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await stage1Api(api).setPassword({
        currentPassword: current,
        newPassword: next,
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        // The API's own curated message (INVALID_CREDENTIALS says the current password is wrong).
        setError(err.message);
      } else {
        reportError("trainer-password-change", err);
        setError("PASSWORD-SAVE");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Change password" subtitle="Current password, then a new one">
      {error ? <ErrorBanner message={error} /> : null}
      {done ? (
        <View style={styles.formStack}>
          <Text style={styles.pwHint}>Password updated.</Text>
          <PrimaryButton label="Done" onPress={onBack} />
        </View>
      ) : (
        <View style={styles.formStack}>
          <Field
            label="Current password"
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
          />
          <Field
            label="New password"
            value={next}
            onChangeText={setNext}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            hint="At least 8 characters"
          />
          <PrimaryButton
            label="Update password"
            loading={saving}
            onPress={() => {
              void onSubmit();
            }}
          />
          <PrimaryButton label="Cancel" variant="ghost" onPress={onBack} />
        </View>
      )}
    </Screen>
  );
}

export function TrainerProfileScreen({ onBack, onChangePassword }: Props) {
  const { me, api, reloadMe } = useAuth();
  const profile = me?.trainerProfile;
  const [name, setName] = useState(profile?.displayName ?? "");
  const [mobile, setMobile] = useState(profile?.whatsappE164 ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);

  if (passwordOpen) {
    return <ChangePasswordForm onBack={() => setPasswordOpen(false)} />;
  }

  const timezone = me?.timezone ?? null;
  const dirty =
    name.trim() !== (profile?.displayName ?? "") ||
    (mobile.trim() || null) !== (profile?.whatsappE164 ?? null);
  const canSave =
    dirty && name.trim().length > 0 && !saving && timezone !== null;

  async function onSave() {
    if (!canSave || timezone === null) return;
    const mobileTrim = mobile.trim();
    if (mobileTrim && (mobileTrim.length < 8 || mobileTrim.length > 20)) {
      setError("Enter a mobile number with 8 to 20 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await (api as unknown as ProfileWriter).updateTrainerProfile({
        displayName: name.trim(),
        whatsappE164: mobile.trim() || null,
        timezone,
      });
      // Reload `me` quietly so More shows the new name without leaving the tab.
      await reloadMe();
      onBack();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        reportError("trainer-profile-save", err);
        setError("PROFILE-SAVE");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to More"
          onPress={onBack}
          style={styles.barSide}
        >
          <ChevronLeft color={brand.indigo} size={22} strokeWidth={2} />
          <Text style={styles.barLink}>More</Text>
        </Pressable>
        <Text style={styles.barTitle} accessibilityRole="header">
          Profile
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save"
          accessibilityState={{ disabled: !canSave }}
          disabled={!canSave}
          onPress={() => {
            void onSave();
          }}
          style={[styles.barSide, styles.barRight]}
        >
          <Text style={[styles.barLink, !canSave ? styles.dim : null]}>
            Save
          </Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {error ? <ErrorBanner message={error} /> : null}
        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              accessibilityLabel="Name"
              autoCapitalize="words"
              onChangeText={setName}
              style={styles.input}
              value={name}
            />
          </View>
          <View style={[styles.field, styles.sep]}>
            <Text style={styles.label}>Mobile / WhatsApp</Text>
            <TextInput
              accessibilityLabel="Mobile / WhatsApp"
              keyboardType="phone-pad"
              onChangeText={setMobile}
              style={styles.input}
              value={mobile}
            />
          </View>
          <View style={[styles.field, styles.sep]}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{me?.email ?? "—"}</Text>
          </View>
          {/* No timezone picker exists yet, so this shows the zone and has no chevron. */}
          <View style={[styles.field, styles.sep]}>
            <Text style={styles.label}>Timezone</Text>
            <Text style={styles.value}>{timezoneLabel(timezone)}</Text>
          </View>
        </View>
        <Text style={styles.note}>
          Clients use this number for "Ask coach" on WhatsApp. Sign-in codes go
          to your email.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change password"
          onPress={onChangePassword ?? (() => setPasswordOpen(true))}
          style={[styles.card, styles.pwRow]}
        >
          <View style={styles.tile}>
            <KeyRound color={brand.indigo} size={20} strokeWidth={1.75} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.pwTitle}>Change password</Text>
            <Text style={styles.pwHint}>Current password, then a new one</Text>
          </View>
          <ChevronRight color={ink[500]} size={18} strokeWidth={2} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: surface.pageMobile, flex: 1 },
  bar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  barSide: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 44,
    minWidth: 72,
  },
  barRight: { justifyContent: "flex-end" },
  barLink: {
    color: brand.indigo,
    fontFamily: fontFamilySemiBold,
    fontSize: 18,
  },
  barTitle: { color: brand.deepNavy, fontSize: 18 },
  dim: { opacity: 0.4 },
  content: { gap: spacing.lg, padding: spacing.lg },
  card: {
    backgroundColor: surface.card,
    borderColor: ink[200],
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  field: { gap: 2, minHeight: 72, paddingHorizontal: 20, paddingVertical: 12 },
  sep: { borderTopColor: ink[200], borderTopWidth: 1 },
  label: { color: ink[500], fontSize: 16 },
  input: {
    color: brand.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 20,
    minHeight: 32,
    padding: 0,
  },
  value: {
    color: brand.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 20,
    minHeight: 32,
  },
  note: { color: ink[500], fontSize: 16, lineHeight: 24, marginHorizontal: 4 },
  pwRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tile: {
    alignItems: "center",
    backgroundColor: brand.paleLavender,
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  flex: { flex: 1 },
  formStack: { gap: spacing.md },
  pwTitle: { color: brand.deepNavy, fontFamily: fontFamilyBold, fontSize: 19 },
  pwHint: { color: ink[500], fontSize: 16 },
});
