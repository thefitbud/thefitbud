import { useState } from "react";
import { ApiClientError } from "@fitbud/api-client";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Field } from "../../components/Field";
import { Text } from "../../components/Text";
import { authFailure } from "../../lib/authErrors";
import { stage1Api } from "../../lib/stage1Api";
import { InlineError, PasswordInput } from "../../screens/auth/authParts";
import { M2Page } from "./m2";

type Props = {
  onBack: () => void;
};

export const CURRENT_WRONG_COPY = "That isn't your current password.";
export const CURRENT_REQUIRED_COPY = "Enter your current password.";
export const MISMATCH_COPY = "The two new passwords don't match.";

/**
 * Maps a `POST /auth/password/set` failure. Fixed text only behind the code
 * that proves it (AGENTS.md no misleading catch): 401 INVALID_CREDENTIALS →
 * wrong current password, CURRENT_PASSWORD_REQUIRED, the API's own password
 * rule text; anything else is a short code through `reportError`.
 */
export function passwordChangeError(err: unknown): { field: "current" | null; copy: string } {
  if (err instanceof ApiClientError) {
    if (err.status === 401 && err.code === "INVALID_CREDENTIALS") {
      return { field: "current", copy: CURRENT_WRONG_COPY };
    }
    if (err.code === "CURRENT_PASSWORD_REQUIRED") {
      return { field: "current", copy: CURRENT_REQUIRED_COPY };
    }
    if (err.code.startsWith("PASSWORD_")) return { field: null, copy: err.message };
  }
  return { field: null, copy: authFailure(err, "general", "PasswordScreen.save").copy };
}

/** TR-20g change password: current, new and confirm, saved from the nav bar. */
export function PasswordScreen({ onBack }: Props) {
  const { api } = useAuth();
  const s1 = stage1Api(api);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = next.length >= 8 && confirm === next;

  async function save() {
    if (!ready) return;
    setSaving(true);
    setError(null);
    setCurrentError(null);
    try {
      await s1.setPassword({
        ...(current ? { currentPassword: current } : {}),
        newPassword: next,
      });
      setDone(true);
    } catch (err) {
      const failure = passwordChangeError(err);
      if (failure.field === "current") setCurrentError(failure.copy);
      else setError(failure.copy);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <M2Page title="Change password" onBack={onBack} plain testID="password-done">
        <Text variant="body">Password changed. Use it next time you sign in.</Text>
      </M2Page>
    );
  }

  return (
    <M2Page
      title="Change password"
      onCancel={onBack}
      onSave={() => {
        void save();
      }}
      saveDisabled={!ready}
      saving={saving}
      plain
      testID="password"
    >
      {error ? <ErrorBanner message={error} /> : null}
      <PasswordInput
        label="Current password"
        value={current}
        onChangeText={(value) => {
          setCurrent(value);
          setCurrentError(null);
        }}
        textContentType="password"
        invalid={Boolean(currentError)}
      />
      {currentError ? <InlineError message={currentError} /> : null}
      <PasswordInput
        label="New password"
        value={next}
        onChangeText={setNext}
        textContentType="newPassword"
      />
      <Text tone="ink3" style={{ fontSize: 14, lineHeight: 19, marginTop: -12, marginLeft: 2 }}>
        At least 8 characters. Avoid your name or phone number.
      </Text>
      <Field
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        placeholder="Type it again"
        autoCapitalize="none"
        textContentType="newPassword"
      />
      {mismatch ? <InlineError message={MISMATCH_COPY} /> : null}
      <Text tone="ink3" style={{ fontSize: 15, lineHeight: 21, marginLeft: 2 }}>
        You&apos;ll stay signed in on this phone.
      </Text>
    </M2Page>
  );
}
