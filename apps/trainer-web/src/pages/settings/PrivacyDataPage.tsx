import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiClientError, FitBudApiClient, userFacingMessage } from "@fitbud/api-client";
import { accountArchivedErrorDetailsSchema } from "@fitbud/contracts";
import {
  ACCOUNT_DELETION_CONFIRM_WORD,
  ACCOUNT_DELETION_EMAIL,
  ACCOUNT_DELETION_MAILTO,
  accountDeletionCopy as copy,
} from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { stage1Api } from "../../lib/stage1-api";
import "./PrivacyDataPage.css";

/** The typed word matches (spaces around it ignored; letters must be capitals). */
export function isDeleteConfirmed(typed: string): boolean {
  return typed.trim() === ACCOUNT_DELETION_CONFIRM_WORD;
}

/** Shown when a fresh sign-in returns another account than the one signed in. */
export const OTHER_ACCOUNT_COPY =
  "Those details are for a different account. Use the ones for this account.";

export const CURRENT_WRONG_COPY = "That password doesn't match.";

type Step = "confirm" | "proof";

type DeletionOutcome =
  | { kind: "archived"; purgeAfter: string }
  | { kind: "active_clients"; copy: string }
  | { kind: "error"; copy: string };

/**
 * Fresh-proof delete (D-W6-31): POST /account/deletion with a brand-new
 * password login's bearer token. Cookie sessions prefer `created_at` over the
 * bearer, so this client omits credentials and sends only the fresh Authorization
 * header — the token's `auth_time` is the proof, matching mobile Z12-29.
 */
function freshDeleteClient(token: string): FitBudApiClient {
  const baseUrl =
    import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "/api";
  return new FitBudApiClient({
    baseUrl,
    getAccessToken: () => token,
    getSelectedRole: () => "trainer",
    fetch: (input, init) =>
      globalThis.fetch(input, { ...init, credentials: "omit" }),
  });
}

async function activeClientsCopy(client: FitBudApiClient, err: ApiClientError): Promise<string> {
  try {
    const page = await client.listRelationships({ limit: 50 });
    const count = page.items.filter((row) => row.status === "active").length;
    if (count > 0) return copy.activeClients(count);
  } catch {
    // Fall through to the API's static message.
  }
  return userFacingMessage(err);
}

export async function requestAccountDeletion(input: {
  token: string;
}): Promise<DeletionOutcome> {
  const client = freshDeleteClient(input.token);
  try {
    const result = await client.deleteAccount();
    return { kind: "archived", purgeAfter: result.purgeAfter };
  } catch (err) {
    if (err instanceof ApiClientError) {
      if (err.status === 409 && err.code === "ACTIVE_CLIENTS") {
        return {
          kind: "active_clients",
          copy: await activeClientsCopy(client, err),
        };
      }
      if (err.status === 403 && err.code === "ACCOUNT_ARCHIVED") {
        const details = accountArchivedErrorDetailsSchema.safeParse(err.details);
        if (details.success) {
          return { kind: "archived", purgeAfter: details.data.purgeAfter };
        }
      }
      return { kind: "error", copy: userFacingMessage(err) };
    }
    return { kind: "error", copy: "Something went wrong. Try again." };
  }
}

export function PrivacyDataPage() {
  const { me, finishAccountDeletion } = useAuth();
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("confirm");
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeClients, setActiveClients] = useState<string | null>(null);

  const confirmed = isDeleteConfirmed(typed);
  const email = me?.email ?? null;

  function requestExport() {
    setToast(
      "We received your export request. We'll email you when your download is ready.",
    );
    window.setTimeout(() => setToast(null), 6000);
  }

  function resetModal() {
    setStep("confirm");
    setTyped("");
    setPassword("");
    setFieldError(null);
    setError(null);
    setActiveClients(null);
    setBusy(false);
    busyRef.current = false;
  }

  function closeModal() {
    setOpen(false);
    resetModal();
  }

  function openModal() {
    resetModal();
    setOpen(true);
  }

  async function run(task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFieldError(null);
    setError(null);
    setActiveClients(null);
    try {
      await task();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function onContinueConfirm() {
    if (!confirmed) return;
    setFieldError(null);
    setError(null);
    setActiveClients(null);
    setStep("proof");
  }

  function onSubmitProof(event: FormEvent) {
    event.preventDefault();
    if (!email || !password) return;
    void run(async () => {
      let fresh: { token: string; userId: string };
      try {
        fresh = await stage1Api.login({ identifier: email, password });
      } catch (err) {
        if (
          err instanceof ApiClientError &&
          err.status === 401 &&
          err.code === "INVALID_CREDENTIALS"
        ) {
          setFieldError(CURRENT_WRONG_COPY);
          return;
        }
        setError(
          userFacingMessage(err, { fallback: "Something went wrong. Try again." }),
        );
        return;
      }
      if (!me || fresh.userId !== me.userId) {
        setFieldError(OTHER_ACCOUNT_COPY);
        return;
      }
      const outcome = await requestAccountDeletion({ token: fresh.token });
      if (outcome.kind === "archived") {
        finishAccountDeletion(outcome.purgeAfter);
        return;
      }
      if (outcome.kind === "active_clients") {
        setActiveClients(outcome.copy);
        setStep("confirm");
        return;
      }
      setError(outcome.copy);
    });
  }

  return (
    <div className="settings-card" data-testid="privacy-data-page">
      <header className="settings-card-h">
        <h2>Privacy and data</h2>
      </header>
      <div className="settings-card-pad">
      <section className="settings-copy-block">
        <h3>What FitBud stores</h3>
        <ul className="settings-bullet-list">
          <li>
            Your account details (email, display name, timezone, and sign-in
            credentials).
          </li>
          <li>
            Coaching data you create: client roster, plans, notes, check-in
            reviews, and configuration.
          </li>
          <li>
            Client-submitted intake, check-ins, meals, workouts, and progress —
            only for clients you coach.
          </li>
          <li>
            Notification preferences and quiet hours for your trainer account.
          </li>
        </ul>
        <p className="muted">
          We do not sell personal data. Read the{" "}
          <Link to="/privacy">Privacy Policy</Link>, including{" "}
          <Link to="/privacy#delete-account">how deleting your account works</Link>
          , and the <Link to="/terms">Terms of Service</Link>.
        </p>
      </section>
      <section className="privacy-card">
        <h3>Data export</h3>
        <p className="muted">
          Request a copy of your trainer account data. We will email you a secure
          link when the export is ready.
        </p>
        <button
          type="button"
          className="button-secondary"
          onClick={requestExport}
        >
          Request data export
        </button>
      </section>
      <section className="privacy-card privacy-card-danger" data-testid="delete-account-section">
        <h3>{copy.title}</h3>
        <p className="muted">
          Archives your account for 6 months, then deletes it for good.
        </p>
        <button
          type="button"
          className="button-danger-outline"
          onClick={openModal}
          data-testid="delete-account-open"
        >
          {copy.title}…
        </button>
      </section>
      {toast ? (
        <p className="form-success" role="status">
          {toast}
        </p>
      ) : null}

      {open ? (
        <div
          className="modal-scrim"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy) closeModal();
          }}
        >
          <div
            className="modal-card delete-account-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            data-testid="delete-account-modal"
          >
            {step === "confirm" ? (
              <>
                <header className="delete-account-header">
                  <h2 id="delete-account-title">{copy.title}</h2>
                  <p>{copy.body}</p>
                  <p>
                    {copy.emailLead}
                    <a href={ACCOUNT_DELETION_MAILTO}>{ACCOUNT_DELETION_EMAIL}</a>
                    {copy.emailTail}
                  </p>
                </header>
                <div className="delete-account-body">
                  {activeClients ? (
                    <div
                      className="delete-account-blocked"
                      role="alert"
                      data-testid="delete-account-active-clients"
                    >
                      <p>{activeClients}</p>
                      <Link to="/clients" onClick={closeModal}>
                        {copy.goToClients}
                      </Link>
                    </div>
                  ) : null}
                  {error ? (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  ) : null}
                  <label className="field">
                    <span>{copy.confirmLabel}</span>
                    <input
                      type="text"
                      value={typed}
                      autoCapitalize="characters"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={Boolean(activeClients)}
                      onChange={(event) => setTyped(event.target.value)}
                      data-testid="delete-account-confirm"
                    />
                  </label>
                  <p className="muted delete-account-hint">{copy.proofHintPassword}</p>
                </div>
                <footer className="delete-account-footer">
                  {activeClients ? (
                    <span className="muted xs">
                      Nothing is archived until your clients are ended.
                    </span>
                  ) : (
                    <span />
                  )}
                  <div className="delete-account-footer-actions">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={closeModal}
                      disabled={busy}
                    >
                      {copy.cancel}
                    </button>
                    <button
                      type="button"
                      className="button-danger"
                      disabled={!confirmed || Boolean(activeClients) || busy}
                      onClick={onContinueConfirm}
                      data-testid="delete-account-continue"
                    >
                      {copy.confirmButton}
                    </button>
                  </div>
                </footer>
              </>
            ) : (
              <form onSubmit={onSubmitProof}>
                <header className="delete-account-header">
                  <h2 id="delete-account-title">{copy.proofTitle}</h2>
                  <p>{copy.proofPasswordLead}</p>
                </header>
                <div className="delete-account-body">
                  {error ? (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  ) : null}
                  {email ? (
                    <p className="muted">
                      Signed in as <strong>{email}</strong>
                    </p>
                  ) : null}
                  <label className="field">
                    <span>{copy.proofPasswordLabel}</span>
                    <input
                      type="password"
                      value={password}
                      autoComplete="current-password"
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setFieldError(null);
                      }}
                      data-testid="delete-account-password"
                    />
                  </label>
                  {fieldError ? (
                    <p className="form-error" role="alert">
                      {fieldError}
                    </p>
                  ) : null}
                </div>
                <footer className="delete-account-footer">
                  <span />
                  <div className="delete-account-footer-actions">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={closeModal}
                      disabled={busy}
                    >
                      {copy.cancel}
                    </button>
                    <button
                      type="submit"
                      className="button-danger"
                      disabled={!password || busy}
                      data-testid="delete-account-submit"
                    >
                      {busy ? "Working…" : copy.confirmButton}
                    </button>
                  </div>
                </footer>
              </form>
            )}
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
