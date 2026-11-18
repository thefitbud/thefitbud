import { useRef, useState } from "react";
import { Linking, View } from "react-native";
import { CircleAlert } from "lucide-react-native";
import { ApiClientError, type FitBudApiClient } from "@fitbud/api-client";
import { accountArchivedErrorDetailsSchema, type Role } from "@fitbud/contracts";
import {
  ACCOUNT_DELETION_CONFIRM_WORD,
  ACCOUNT_DELETION_EMAIL,
  ACCOUNT_DELETION_MAILTO,
  accountDeletionCopy as copy,
} from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../../components/Button";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Field } from "../../components/Field";
import { Text } from "../../components/Text";
import { createMobileApiClient } from "../../lib/api";
import { authFailure, mismatchedResponseCopy } from "../../lib/authErrors";
import { reportError } from "../../lib/reportError";
import { stage1Api } from "../../lib/stage1Api";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";
import {
  CodeBoxes,
  InlineError,
  PasswordInput,
  TextLink,
} from "../../screens/auth/authParts";
import { verifyCodeError } from "../../screens/auth/verifyCodeError";
import { CURRENT_WRONG_COPY } from "./PasswordScreen";
import { M2Page } from "./m2";

type Props = {
  onBack: () => void;
};

/** The typed word matches (spaces around it ignored; letters must be capitals). */
export function isDeleteConfirmed(typed: string): boolean {
  return typed.trim() === ACCOUNT_DELETION_CONFIRM_WORD;
}

/** Shown when a fresh sign-in returns another account than the one signed in. */
export const OTHER_ACCOUNT_COPY =
  "Those details are for a different account. Use the ones for this account.";

export type DeletionOutcome =
  | { kind: "archived"; purgeAfter: string }
  | { kind: "active_clients"; copy: string }
  | { kind: "error"; copy: string };

/**
 * POST /account/deletion with the token from a sign-in made just now
 * (D-W6-31: the token's `auth_time` must be within 5 minutes). The session's
 * own token is never used: it may be hours old.
 *
 * - 409 ACTIVE_CLIENTS: nothing is archived; the count comes from the
 *   trainer's own relationships (falls back to the API's own message).
 * - 403 ACCOUNT_ARCHIVED (a second tap or another device got there first): the
 *   account is archived, with the server's purge date.
 * - Anything else: the API's curated message or a short code (D-W3-12).
 */
export async function requestAccountDeletion(input: {
  client: FitBudApiClient;
  /** The same token as a trainer, to count active clients for the 409 copy. */
  trainerClient: FitBudApiClient | null;
}): Promise<DeletionOutcome> {
  try {
    const result = await input.client.deleteAccount();
    return { kind: "archived", purgeAfter: result.purgeAfter };
  } catch (err) {
    if (err instanceof ApiClientError) {
      if (err.status === 409 && err.code === "ACTIVE_CLIENTS") {
        return { kind: "active_clients", copy: await activeClientsCopy(input.trainerClient, err) };
      }
      if (err.status === 403 && err.code === "ACCOUNT_ARCHIVED") {
        const details = accountArchivedErrorDetailsSchema.safeParse(err.details);
        if (details.success) {
          return { kind: "archived", purgeAfter: details.data.purgeAfter };
        }
      }
    }
    return { kind: "error", copy: authFailure(err, "general", "DeleteAccount.delete").copy };
  }
}

async function activeClientsCopy(
  trainerClient: FitBudApiClient | null,
  err: ApiClientError,
): Promise<string> {
  if (trainerClient) {
    try {
      const page = await trainerClient.listRelationships({ limit: 50 });
      const count = page.items.filter((row) => row.status === "active").length;
      if (count > 0) return copy.activeClients(count);
    } catch (countErr) {
      reportError("DeleteAccount.countClients", countErr);
    }
  }
  // The API's own static text ("End coaching with your clients first.").
  return err.message;
}

type Step = "confirm" | "proof";
type ProofMode = "password" | "code";

/**
 * Z12-29: Privacy → Delete account. BP1-delete-account-ios.png restyled on v3
 * tokens, with D-W12-6's copy (TR-20d's sample copy is not used, D-W12-25).
 * Typed confirm, then a fresh sign-in (password or a code), then the request.
 * On success the session ends and the archived notice shows (AuthProvider).
 */
export function DeleteAccountScreen({ onBack }: Props) {
  const { api, me, selectedRole, selectRole, finishAccountDeletion } = useAuth();
  const s1 = stage1Api(api);
  const theme = useTheme();
  const styles = useStyles();
  const [step, setStep] = useState<Step>("confirm");
  const [typed, setTyped] = useState("");
  const [mode, setMode] = useState<ProofMode>("password");
  const knownEmail = me?.email ?? null;
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeClients, setActiveClients] = useState<string | null>(null);

  const confirmed = isDeleteConfirmed(typed);
  const proofIdentifier = (knownEmail ?? identifier).trim();
  const canTrainer = me?.permittedRoles.includes("trainer") ?? false;

  function clearErrors() {
    setFieldError(null);
    setError(null);
    setActiveClients(null);
  }

  async function run(task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    clearErrors();
    try {
      await task();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  /** The sign-in made just now: delete with its token. */
  async function deleteWith(fresh: { token: string; userId: string }) {
    if (!me || fresh.userId !== me.userId) {
      setFieldError(OTHER_ACCOUNT_COPY);
      return;
    }
    const role: Role | null = selectedRole;
    const client = createMobileApiClient({
      getAccessToken: () => fresh.token,
      getSelectedRole: () => role,
    });
    const trainerClient = canTrainer
      ? createMobileApiClient({
          getAccessToken: () => fresh.token,
          getSelectedRole: () => "trainer",
        })
      : null;
    const outcome = await requestAccountDeletion({ client, trainerClient });
    if (outcome.kind === "archived") {
      finishAccountDeletion(outcome.purgeAfter);
      return;
    }
    if (outcome.kind === "active_clients") {
      setActiveClients(outcome.copy);
      return;
    }
    setError(outcome.copy);
  }

  function submitPassword() {
    if (!proofIdentifier || !password) return;
    void run(async () => {
      let fresh: { token: string; userId: string };
      try {
        fresh = await s1.login({ identifier: proofIdentifier, password });
      } catch (err) {
        const failure = authFailure(err, "password-login", "DeleteAccount.password");
        // Only the API's INVALID_CREDENTIALS proves the password was wrong.
        if (failure.kind === "wrong-credentials") setFieldError(CURRENT_WRONG_COPY);
        else setError(failure.copy);
        return;
      }
      await deleteWith(fresh);
    });
  }

  function sendCode() {
    if (!proofIdentifier) return;
    void run(async () => {
      try {
        await s1.startOtp({ identifier: proofIdentifier, purpose: "login" });
        setCodeSentTo(proofIdentifier);
        setCode("");
      } catch (err) {
        setError(authFailure(err, "code-send", "DeleteAccount.sendCode").copy);
      }
    });
  }

  function submitCode(value: string) {
    if (value.length !== 6 || !codeSentTo) return;
    void run(async () => {
      let result;
      try {
        result = await s1.verifyOtp({ identifier: codeSentTo, purpose: "login", code: value });
      } catch (err) {
        setFieldError(verifyCodeError(err));
        return;
      }
      if (result.purpose !== "login") {
        setError(mismatchedResponseCopy("DeleteAccount.verifyCode.purpose"));
        return;
      }
      await deleteWith(result);
    });
  }

  const activeClientsBlock = activeClients ? (
    <View style={styles.blocked} accessibilityRole="alert" testID="delete-account-active-clients">
      <Text style={styles.blockedText}>{activeClients}</Text>
      {canTrainer ? (
        <TextLink
          label={copy.goToClients}
          align="flex-start"
          onPress={() => {
            void selectRole("trainer");
          }}
        />
      ) : null}
    </View>
  ) : null;

  if (step === "proof") {
    const passwordReady = Boolean(proofIdentifier) && password.length > 0;
    return (
      <M2Page
        title={copy.proofTitle}
        onBack={() => {
          clearErrors();
          setStep("confirm");
        }}
        testID="delete-account-proof"
        footer={
          <View style={styles.footer}>
            {mode === "password" ? (
              <Button
                label={copy.confirmButton}
                variant="danger"
                loading={busy}
                disabled={!passwordReady || busy}
                onPress={submitPassword}
                testID="delete-account-submit"
              />
            ) : codeSentTo ? (
              <Button
                label={copy.confirmButton}
                variant="danger"
                loading={busy}
                disabled={code.length !== 6 || busy}
                onPress={() => submitCode(code)}
                testID="delete-account-submit"
              />
            ) : (
              <Button
                label={copy.proofSendCode}
                variant="primary"
                loading={busy}
                disabled={!proofIdentifier || busy}
                onPress={sendCode}
                testID="delete-account-send-code"
              />
            )}
            <Button label={copy.cancel} variant="text" onPress={onBack} />
          </View>
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
        {activeClientsBlock}
        {knownEmail ? null : (
          <Field
            label="Mobile number or email"
            value={identifier}
            onChangeText={(value) => {
              setIdentifier(value);
              setCodeSentTo(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            testID="delete-account-identifier"
          />
        )}
        {mode === "password" ? (
          <>
            <Text variant="body" tone="ink2" style={styles.lead}>
              {copy.proofPasswordLead}
            </Text>
            <PasswordInput
              label={copy.proofPasswordLabel}
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setFieldError(null);
              }}
              textContentType="password"
              invalid={Boolean(fieldError)}
              onSubmitEditing={submitPassword}
              testID="delete-account-password"
            />
            {fieldError ? <InlineError message={fieldError} /> : null}
            <TextLink
              label={copy.proofUseCode}
              onPress={() => {
                clearErrors();
                setMode("code");
              }}
            />
          </>
        ) : (
          <>
            {codeSentTo ? (
              <>
                <Text variant="body" tone="ink2" style={styles.lead}>
                  {copy.proofCodeSent(codeSentTo)}
                </Text>
                <CodeBoxes
                  value={code}
                  onChange={(value) => {
                    setCode(value);
                    setFieldError(null);
                  }}
                  onComplete={submitCode}
                  invalid={Boolean(fieldError)}
                />
                {fieldError ? <InlineError message={fieldError} /> : null}
                <TextLink label={copy.proofResend} onPress={sendCode} disabled={busy} />
              </>
            ) : null}
            <TextLink
              label={copy.proofUsePassword}
              onPress={() => {
                clearErrors();
                setMode("password");
              }}
            />
          </>
        )}
      </M2Page>
    );
  }

  return (
    <M2Page
      title={copy.title}
      onBack={onBack}
      testID="delete-account"
      footer={
        <View style={styles.footer}>
          <Button
            label={copy.confirmButton}
            variant="danger"
            disabled={!confirmed}
            onPress={() => {
              clearErrors();
              setStep("proof");
            }}
            testID="delete-account-continue"
          />
          <Button label={copy.cancel} variant="text" onPress={onBack} />
        </View>
      }
    >
      <View style={styles.card}>
        <View style={styles.heading}>
          <View style={styles.alertTile}>
            <CircleAlert color={theme.colors.crit} size={26} strokeWidth={2.25} />
          </View>
          <Text style={styles.cardTitle} accessibilityRole="header">
            {copy.title}
          </Text>
        </View>
        <Text style={styles.cardBody}>{copy.body}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.emailBody}>
          {copy.emailLead}
          <Text
            style={styles.emailLink}
            accessibilityRole="link"
            accessibilityLabel={`Email ${ACCOUNT_DELETION_EMAIL}`}
            onPress={() => {
              void Linking.openURL(ACCOUNT_DELETION_MAILTO).catch((err: unknown) =>
                reportError("DeleteAccount.mailto", err),
              );
            }}
          >
            {ACCOUNT_DELETION_EMAIL}
          </Text>
          {copy.emailTail}
        </Text>
      </View>
      <Field
        label={copy.confirmLabel}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        accessibilityLabel={copy.confirmLabel}
        testID="delete-account-confirm"
      />
      <Text variant="body" tone="ink2" style={styles.hint}>
        {copy.proofHintPassword}
      </Text>
    </M2Page>
  );
}

const useStyles = createThemedStyles((t) => ({
  card: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    marginBottom: 14,
    padding: 18,
  },
  heading: { alignItems: "center", flexDirection: "row", gap: 14 },
  alertTile: {
    alignItems: "center",
    backgroundColor: t.colors.critTint,
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  cardTitle: { color: t.colors.ink, fontSize: 19, fontWeight: "600" },
  cardBody: { color: t.colors.ink, fontSize: 16, lineHeight: 23 },
  emailBody: { color: t.colors.ink, fontSize: 15, lineHeight: 21 },
  emailLink: { color: t.colors.brand, fontWeight: "500" },
  hint: { lineHeight: 22, marginTop: -4 },
  lead: { lineHeight: 22, marginBottom: 14 },
  footer: { gap: 6 },
  blocked: {
    backgroundColor: t.colors.critTint,
    borderRadius: 16,
    marginBottom: 14,
    padding: 16,
  },
  blockedText: { color: t.colors.critInk, fontSize: 15, lineHeight: 21 },
}));
