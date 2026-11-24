import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { userFacingMessage } from "@fitbud/api-client";
import { formatPersonName } from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { BottomSheet } from "../../components/BottomSheet";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Field } from "../../components/Field";
import { PrimaryButton } from "../../components/PrimaryButton";
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

/** Earliest date of birth the picker offers (D-W14-17). */
export const BIRTH_DATE_MIN = new Date(1920, 0, 1);

/** A picked calendar day → the API value "1994-03-12" (local day, never shifted by the zone). */
export function birthDateIso(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "1994-03-12" → that day at local noon (the picker's start value), or null. */
export function birthDateFromIso(iso: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
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
  // The API value ("1994-03-12"), or "" when no date is set.
  const [dob, setDob] = useState("");
  const [savedDob, setSavedDob] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coachFirst = coachName?.trim().split(/\s+/)[0] || "your coach";

  const load = useCallback(async () => {
    setError(null);
    try {
      const profile = await api.getTraineeProfile();
      setName(formatPersonName(profile.displayName));
      setGender(profile.gender);
      const iso = birthDateFromIso(profile.dateOfBirth) ? (profile.dateOfBirth ?? "") : "";
      setDob(iso);
      setSavedDob(iso);
    } catch (err) {
      reportError("ProfileScreen.load", err);
      setError(
        userFacingMessage(err, { fallback: "Couldn't load your profile. Go back and try again." }),
      );
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.updateTraineeProfile({ dateOfBirth: dob || null, gender });
      void reloadMe();
      onBack();
    } catch (err) {
      reportError("ProfileScreen.save", err);
      setError(
        userFacingMessage(err, { fallback: "Couldn't save your profile. Try again." }),
      );
    } finally {
      setSaving(false);
    }
  }

  function openPicker() {
    const start = birthDateFromIso(dob) ?? new Date(1990, 0, 1, 12);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: start,
        mode: "date",
        display: "calendar",
        maximumDate: new Date(),
        minimumDate: BIRTH_DATE_MIN,
        onChange: (event: DateTimePickerEvent, picked?: Date) => {
          if (event.type === "set" && picked) setDob(birthDateIso(picked));
        },
      });
      return;
    }
    setPending(start);
    setPickerOpen(true);
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Date of birth, ${birthDateLabel(dob) || "not set"}`}
        accessibilityHint="Opens a calendar"
        onPress={openPicker}
        testID="profile-dob"
      >
        <View pointerEvents="none">
          <Field
            label="Date of birth"
            value={birthDateLabel(dob)}
            editable={false}
            placeholder="12 Mar 1994"
          />
        </View>
      </Pressable>
      {dob ? (
        <PrimaryButton label="Clear date of birth" variant="text" onPress={() => setDob("")} />
      ) : null}
      <Text tone="ink3" style={styles.foot}>
        Goals and targets are set by {coachFirst}.
      </Text>
      <BottomSheet
        visible={pickerOpen}
        title="Date of birth"
        onDismiss={() => setPickerOpen(false)}
      >
        <DateTimePicker
          value={pending}
          mode="date"
          display="spinner"
          maximumDate={new Date()}
          minimumDate={BIRTH_DATE_MIN}
          onChange={(_event: DateTimePickerEvent, picked?: Date) => {
            if (picked) setPending(picked);
          }}
        />
        <PrimaryButton
          label="Done"
          onPress={() => {
            setDob(birthDateIso(pending));
            setPickerOpen(false);
          }}
        />
        <PrimaryButton label="Cancel" variant="text" onPress={() => setPickerOpen(false)} />
      </BottomSheet>
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
