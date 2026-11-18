import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import { formatPersonName } from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Field } from "../../components/Field";
import { Text } from "../../components/Text";
import { reportError } from "../../lib/reportError";
import { ThemeScope, createThemedStyles } from "../../providers/ThemeProvider";
import { initials } from "../MoreScreen";
import { M2Page } from "./m2";

type Props = {
  onBack: () => void;
  coachName?: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1994-03-12" → "12 Mar 1994" (a birth date: no weekday). */
export function birthDateLabel(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : "";
}

/**
 * "12 Mar 1994" (or "12 March 1994") → "1994-03-12". Null when it is not a
 * real past date; an empty string clears the date.
 */
export function parseBirthDate(text: string, today = new Date()): string | null | "" {
  const value = text.trim();
  if (!value) return "";
  const match = /^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})$/.exec(value);
  if (!match) return null;
  const monthIndex = MONTHS.findIndex((m) => m.toLowerCase() === match[2]!.toLowerCase());
  if (monthIndex < 0) return null;
  const day = Number(match[1]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day) return null;
  if (date.getTime() > today.getTime() || year < 1900) return null;
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * TR-20b profile. Name and email come from the account and are read-only
 * here (the API takes only date of birth and gender); the mock's height has
 * no backend source and is not shown.
 */
function ProfileScreenBody({ onBack, coachName }: Props) {
  const { me, api, reloadMe } = useAuth();
  const styles = useStyles();
  const [name, setName] = useState(formatPersonName(me?.email?.split("@")[0] ?? ""));
  const [gender, setGender] = useState<string | null>(null);
  const [dob, setDob] = useState("");
  const [savedDob, setSavedDob] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dobError, setDobError] = useState<string | null>(null);
  const coachFirst = coachName?.trim().split(/\s+/)[0] || "your coach";

  const load = useCallback(async () => {
    setError(null);
    try {
      const profile = await api.getTraineeProfile();
      setName(formatPersonName(profile.displayName));
      setGender(profile.gender);
      const label = birthDateLabel(profile.dateOfBirth);
      setDob(label);
      setSavedDob(label);
    } catch (err) {
      reportError("ProfileScreen.load", err);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't load your profile (PROF-LOAD). Go back and try again.",
      );
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const parsed = parseBirthDate(dob);
    if (parsed === null) {
      setDobError("Write it like 12 Mar 1994.");
      return;
    }
    setDobError(null);
    setSaving(true);
    setError(null);
    try {
      await api.updateTraineeProfile({ dateOfBirth: parsed || null, gender });
      void reloadMe();
      onBack();
    } catch (err) {
      reportError("ProfileScreen.save", err);
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't save your profile (PROF-SAVE). Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <M2Page
      title="Profile"
      onCancel={onBack}
      onSave={() => {
        void save();
      }}
      saveDisabled={dob === savedDob}
      saving={saving}
      plain
      testID="profile"
    >
      {error ? <ErrorBanner message={error} /> : null}
      <View style={styles.avatar} accessibilityElementsHidden>
        <Text style={styles.avatarText}>{initials(name || "•")}</Text>
      </View>
      <Field
        label="Name"
        value={name}
        editable={false}
        hint={`Set by ${coachFirst} when they invited you.`}
      />
      <Field
        label="Email"
        value={me?.email ?? ""}
        editable={false}
        hint="Used to sign in."
      />
      <Field
        label="Date of birth"
        value={dob}
        onChangeText={(value) => {
          setDob(value);
          setDobError(null);
        }}
        placeholder="12 Mar 1994"
        autoCapitalize="words"
        autoCorrect={false}
        hint={dobError ?? undefined}
      />
      <Text tone="ink3" style={styles.foot}>
        Goals and targets are set by {coachFirst}.
      </Text>
    </M2Page>
  );
}

const useStyles = createThemedStyles((t) => ({
  avatar: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 36,
    height: 72,
    justifyContent: "center",
    marginBottom: 4,
    width: 72,
  },
  avatarText: { color: t.colors.ink, fontSize: 22, fontWeight: "700" },
  foot: { fontSize: 15, lineHeight: 21, paddingHorizontal: 2 },
}));

/** ProfileScreen in the system theme (Z12-49): its own styles read the scope. */
export function ProfileScreen(props: Parameters<typeof ProfileScreenBody>[0]) {
  return (
    <ThemeScope scheme="system">
      <ProfileScreenBody {...props} />
    </ThemeScope>
  );
}
