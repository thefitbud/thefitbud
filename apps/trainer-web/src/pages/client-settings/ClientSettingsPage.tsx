import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import {
  Bell,
  ClipboardCheck,
  ClipboardList,
  Lock,
  Pencil,
  Plus,
  Target,
  User,
  UserX,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { userFacingMessage } from "@fitbud/api-client";
import type { ClientSettingsResponse, PaymentRecord } from "@fitbud/contracts";
import { formatCivilDate, labelFor } from "@fitbud/core";
import { apiClient } from "../../lib/api";
import { useAuth } from "../../auth/AuthProvider";
import { StatusChip } from "../../components/StatusChip";
import type { WorkspaceOutletContext } from "../workspaceContext";
import { ConfigureCoachingPage } from "../ConfigureCoachingPage";
import { OnboardingReviewPage } from "../OnboardingReviewPage";
import { EditBasicsDrawer } from "./EditBasicsDrawer";
import { SubscriptionDrawer } from "./SubscriptionDrawer";
import { PaymentDrawer } from "./PaymentDrawer";
import { RemindersSection } from "./RemindersSection";
import {
  COACHING_MODE_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  civilDateOf,
  formatPhone,
  formatRupees,
  formatTimeZone,
  renewalChipLabel,
  weeksSince,
} from "./clientSettingsFormat";
import {
  SETTINGS_SECTIONS,
  isFirstSectionOfPanel,
  panelForSection,
  sectionElementId,
  sectionFromHash,
  type SettingsSectionId,
} from "./settingsSections";
import "./client-settings.css";

const SECTION_ICONS: Record<SettingsSectionId, LucideIcon> = {
  basic: User,
  subscription: Wallet,
  coaching: Target,
  checkins: ClipboardCheck,
  reminders: Bell,
  onboarding: ClipboardList,
  danger: UserX,
};

function titleCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

/** Newest due date first, as the API lists them; newest record first on a tie. */
function sortPayments(payments: PaymentRecord[]): PaymentRecord[] {
  return [...payments].sort(
    (a, b) => b.dueOn.localeCompare(a.dueOn) || b.createdAt.localeCompare(a.createdAt),
  );
}

/** The newest record marked paid (the list is newest due date first). */
function lastPaid(payments: PaymentRecord[]): PaymentRecord | null {
  return (
    [...payments]
      .filter((p) => p.status === "paid" && p.paidOn)
      .sort((a, b) => (b.paidOn ?? "").localeCompare(a.paidOn ?? ""))[0] ?? null
  );
}

type PaymentEditor = { record: PaymentRecord | null; returnFocus: HTMLElement | null };

/**
 * One label-left settings row (W-209, DS §5.7): label (and an optional helper
 * line) on the left, the value on the right.
 */
function SettingRow({
  label,
  help,
  value,
  testId,
}: {
  label: string;
  help?: ReactNode;
  value: ReactNode;
  testId?: string;
}) {
  return (
    <div className="cs-row" data-testid={testId}>
      <dt>
        <span className="cs-row-label">{label}</span>
        {help ? <span className="cs-row-help">{help}</span> : null}
      </dt>
      <dd className="cs-row-value">{value}</dd>
    </div>
  );
}

/**
 * The client Settings tab (`/clients/:relationshipId/settings`), W13-10 /
 * D-WEB-3, frames W-209 (+ iPad), W-IP07, W-181 and W-146.
 *
 * A sub-nav of seven sections, each deep-linkable by hash (see
 * `settingsSections.ts`). Client details, Package and payments and the Danger
 * zone share one panel; Coaching setup and Check-ins are the Coaching setup
 * form (one version, one Save); Reminders was the drawer; Onboarding answers
 * was its own page. Every section saves exactly what it saved before:
 * basics and subscription as new versions (Z8-3), payment records for the
 * trainer's own tracking only (Z8-4), coaching setup versions, reminder rules.
 * An ended client sees every section read-only.
 */
export function ClientSettingsPage() {
  const {
    workspace,
    relationshipId,
    online,
    ended,
    openWorkspaceModal,
    reloadWorkspace,
    refreshEpoch,
  } = useOutletContext<WorkspaceOutletContext>();
  const location = useLocation();
  const navigate = useNavigate();
  const { me } = useAuth();
  const [settings, setSettings] = useState<ClientSettingsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState(false);
  const [subscriptionSaved, setSubscriptionSaved] = useState(false);
  const [paymentEditor, setPaymentEditor] = useState<PaymentEditor | null>(null);
  const [paymentSaved, setPaymentSaved] = useState<"added" | "updated" | null>(null);
  const [active, setActive] = useState<SettingsSectionId>(() =>
    sectionFromHash(location.hash),
  );
  const [toast, setToast] = useState<string | null>(null);
  const [endedElsewhere, setEndedElsewhere] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const subscriptionButtonRef = useRef<HTMLButtonElement>(null);
  const panel = panelForSection(active);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setSettings(await apiClient.getClientSettings(relationshipId));
    } catch (err) {
      setLoadError(userFacingMessage(err, { fallback: "Couldn't load client settings." }));
    } finally {
      setLoading(false);
    }
  }, [relationshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  // A link such as `/settings#subscription` (or an old `/configure` URL,
  // redirected with `#coaching`) lands on that section.
  useEffect(() => {
    if (!location.hash) return;
    setActive(sectionFromHash(location.hash));
  }, [location.hash]);

  // Sections below the first one of a panel are scrolled to; the first one
  // keeps the client header in view.
  // Coaching setup and Check-ins render after their own data loads, so the
  // target is looked for over a few frames.
  const panelReady = panel !== "details" || settings !== null;
  useEffect(() => {
    if (!panelReady || isFirstSectionOfPanel(active)) return;
    let frame = 0;
    let tries = 0;
    const seek = () => {
      const target = document.getElementById(sectionElementId(active));
      if (target) {
        target.scrollIntoView?.({ block: "start" });
        return;
      }
      tries += 1;
      if (tries < 120) frame = window.requestAnimationFrame(seek);
    };
    seek();
    return () => window.cancelAnimationFrame(frame);
  }, [active, panelReady]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const header = workspace?.header ?? null;
  const profileName = settings?.basics.displayName ?? header?.traineeDisplayName ?? "";
  const shownName = settings?.basics.clientDisplayName ?? profileName;
  const firstName = shownName.split(/\s+/)[0] || shownName;
  const gender = header?.traineeProfile.gender?.trim() || null;
  const readOnly = ended || endedElsewhere || settings?.readOnly === true;

  function goTo(id: SettingsSectionId) {
    if (id === active && !isFirstSectionOfPanel(id)) {
      // Same section again: the effect does not rerun, so scroll here.
      document
        .getElementById(sectionElementId(id))
        ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }
    setActive(id);
    navigate({ hash: `#${id}` }, { replace: true });
  }

  function closeDrawer() {
    setEditing(false);
    // Return focus to the control that opened the drawer.
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  function closeSubscriptionDrawer() {
    setEditingSubscription(false);
    window.setTimeout(() => subscriptionButtonRef.current?.focus(), 0);
  }

  function openPaymentEditor(record: PaymentRecord | null, opener: HTMLElement) {
    setPaymentSaved(null);
    setPaymentEditor({ record, returnFocus: opener });
  }

  function closePaymentDrawer() {
    const target = paymentEditor?.returnFocus ?? null;
    setPaymentEditor(null);
    window.setTimeout(() => {
      // The opener may be gone after a reload; fall back to the section title.
      if (target?.isConnected) target.focus();
      else document.getElementById("cs-payments-title")?.focus();
    }, 0);
  }

  const mainSections = SETTINGS_SECTIONS.filter((s) => s.id !== "danger");
  const nav = (
    <nav className="cs-subnav" aria-label="Client settings sections" data-testid="cs-subnav">
      <ul>
        {mainSections.map(({ id, label }) => {
          const Icon = SECTION_ICONS[id];
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                className={`cs-subnav-link${active === id ? " is-on" : ""}`}
                aria-current={active === id ? "true" : undefined}
                data-testid={`cs-nav-${id}`}
                onClick={(e) => {
                  e.preventDefault();
                  goTo(id);
                }}
              >
                <Icon className="ui-i" aria-hidden="true" />
                {label}
              </a>
            </li>
          );
        })}
      </ul>
      <p className="cs-subnav-group">Danger zone</p>
      <ul>
        <li>
          <a
            href="#danger"
            className={`cs-subnav-link${readOnly ? "" : " is-danger"}${active === "danger" ? " is-on" : ""}`}
            aria-current={active === "danger" ? "true" : undefined}
            data-testid="cs-nav-danger"
            onClick={(e) => {
              e.preventDefault();
              goTo("danger");
            }}
          >
            <UserX className="ui-i" aria-hidden="true" />
            {readOnly ? "Coaching ended" : "End coaching"}
          </a>
        </li>
      </ul>
    </nav>
  );

  let details: ReactNode = null;
  if (panel === "details") {
    if (loading && !settings) {
      details = (
        <p className="muted" aria-busy="true">
          Loading client settings…
        </p>
      );
    } else if (loadError && !settings) {
      details = (
        <div className="cs-card cs-card-pad" role="alert">
          <p className="form-error">{loadError}</p>
          <button type="button" className="ui-btn ui-btn-secondary" onClick={() => void load()}>
            Try again
          </button>
        </div>
      );
    } else if (settings) {
      details = renderDetails(settings);
    }
  }

  function renderDetails(current: ClientSettingsResponse) {
    const { basics, subscription, payments } = current;
    const contactPhone = basics.contactPhoneE164;
    const phone = contactPhone ?? basics.phoneE164;
    const today = civilDateOf(new Date().toISOString()) ?? "";
    const chip = subscription ? renewalChipLabel(subscription, today) : null;
    const startedOn = civilDateOf(current.startedAt);
    const endedOn = current.endedAt ? civilDateOf(current.endedAt) : null;
    const weeks = current.endedAt ? null : weeksSince(current.startedAt);
    const age = header?.traineeProfile.age ?? null;
    const timeZone = header?.traineeTimezone?.trim() || null;
    const ageSex = [age !== null ? String(age) : null, gender ? titleCase(gender) : null]
      .filter(Boolean)
      .join(" · ");
    const paid = lastPaid(payments);

    return (
      <>
        {readOnly ? (
          <p className="cs-readonly-banner" data-testid="cs-readonly-banner">
            <Lock className="ui-i" aria-hidden />
            {endedOn
              ? `Coaching with ${firstName} ended ${formatCivilDate(endedOn)}. Client settings are read-only.`
              : `Coaching with ${firstName} has ended. Client settings are read-only.`}
          </p>
        ) : null}
        <section
          id={sectionElementId("basic")}
          className="cs-card"
          aria-labelledby="cs-basic-title"
          data-testid="cs-section-basic"
        >
          <header className="cs-card-head">
            <h2 id="cs-basic-title">Basic details</h2>
            {readOnly ? null : (
              <button
                ref={editButtonRef}
                type="button"
                className="ui-btn ui-btn-secondary ui-btn-sm cs-edit-button"
                onClick={() => {
                  setSavedNotice(false);
                  setEditing(true);
                }}
                disabled={!online}
                aria-label="Edit basic details"
              >
                <Pencil className="ui-i" aria-hidden />
                Edit
              </button>
            )}
          </header>
          <dl className="cs-rows">
            <SettingRow label="Name" value={shownName} testId="cs-basic-name" />
            <SettingRow
              label="Phone"
              help={phone ? (contactPhone ? "WhatsApp" : "Sign-in phone") : undefined}
              value={phone ? formatPhone(phone) : "Not added"}
              testId="cs-basic-phone"
            />
            {ageSex ? <SettingRow label="Age and sex" value={ageSex} /> : null}
            {timeZone ? (
              <SettingRow
                label="Time zone"
                help={`Reminders follow ${firstName}'s time`}
                value={formatTimeZone(timeZone)}
              />
            ) : null}
          </dl>
          {savedNotice ? (
            <p className="cs-saved" role="status">
              Saved.
            </p>
          ) : null}
        </section>

        <section
          id={sectionElementId("subscription")}
          className="cs-card"
          aria-labelledby="cs-subscription-title"
          data-testid="cs-section-subscription"
        >
          <header className="cs-card-head">
            <h2 id="cs-subscription-title">Package and payments</h2>
            {readOnly && subscription ? (
              <span className="ui-pill ui-p-neutral">Ended</span>
            ) : subscription && chip ? (
              <StatusChip
                kind="renewal"
                value={subscription.renewalState}
                label={chip}
              />
            ) : null}
            {readOnly ? null : (
              <button
                ref={subscriptionButtonRef}
                type="button"
                className="ui-btn ui-btn-secondary ui-btn-sm cs-edit-button"
                onClick={() => {
                  setSubscriptionSaved(false);
                  setEditingSubscription(true);
                }}
                disabled={!online}
                aria-label="Edit subscription"
              >
                <Pencil className="ui-i" aria-hidden />
                Edit
              </button>
            )}
          </header>
          {subscription ? (
            <dl className="cs-rows">
              <SettingRow label="Package" value={subscription.planName} />
              <SettingRow
                label={subscription.amountPaise !== null ? "Fee" : "Payment frequency"}
                value={
                  subscription.amountPaise !== null ? (
                    <>
                      <span className="cs-num">{formatRupees(subscription.amountPaise)}</span>
                      {" · "}
                      {labelFor("payment_frequency", subscription.paymentFrequency)}
                    </>
                  ) : (
                    labelFor("payment_frequency", subscription.paymentFrequency)
                  )
                }
              />
              {subscription.coachingMode ? (
                <SettingRow
                  label="Coaching mode"
                  value={COACHING_MODE_LABELS[subscription.coachingMode]}
                />
              ) : null}
              <SettingRow
                label="Started"
                value={formatCivilDate(subscription.startsOn)}
              />
              <SettingRow
                label="Renews"
                value={
                  readOnly && endedOn
                    ? `Ended ${formatCivilDate(endedOn)}`
                    : formatCivilDate(subscription.renewsOn)
                }
              />
              {paid ? (
                <SettingRow
                  label="Last payment"
                  help="Recorded by you. FitBud does not take payments."
                  value={[
                    formatRupees(paid.amountPaise),
                    paid.method ? PAYMENT_METHOD_LABELS[paid.method] : null,
                    paid.paidOn ? formatCivilDate(paid.paidOn) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  testId="cs-last-payment"
                />
              ) : null}
            </dl>
          ) : (
            <p className="cs-empty cs-card-pad">No subscription saved yet.</p>
          )}
          {subscriptionSaved ? (
            <p className="cs-saved cs-card-pad" role="status">
              Saved as a new subscription version.
            </p>
          ) : null}

          <div className="cs-payments" data-testid="cs-payments">
            <div className="cs-payments-head">
              <h3 id="cs-payments-title" className="cs-payments-title" tabIndex={-1}>
                Payment records · tracking only
              </h3>
              {readOnly || !subscription ? null : (
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost ui-btn-sm"
                  onClick={(e) => openPaymentEditor(null, e.currentTarget)}
                  disabled={!online}
                >
                  <Plus className="ui-i" aria-hidden />
                  Add payment record
                </button>
              )}
            </div>
            {payments.length === 0 ? (
              <>
                <p className="cs-empty">No payment records yet.</p>
                {subscription || readOnly ? null : (
                  // The API ties each record to a subscription version.
                  <p className="cs-empty">Save a subscription first, then add payment records to it.</p>
                )}
              </>
            ) : (
              <div className="cs-table-wrap">
                <table className="cs-table">
                  <caption className="sr-only">Payments you&apos;ve recorded</caption>
                  <thead>
                    <tr>
                      <th scope="col">Due</th>
                      <th scope="col">Note</th>
                      <th scope="col" className="is-r">
                        Amount
                      </th>
                      <th scope="col">Status</th>
                      <th scope="col">Method</th>
                      <th scope="col">Paid on</th>
                      {readOnly ? null : (
                        <th scope="col">
                          <span className="sr-only">Actions</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} data-testid="cs-payment-row">
                        <td className="cs-nowrap">{formatCivilDate(payment.dueOn)}</td>
                        <td className="cs-pay-note">
                          {payment.note ? payment.note : <span aria-label="No note">—</span>}
                        </td>
                        <td className="cs-num cs-nowrap is-r">{formatRupees(payment.amountPaise)}</td>
                        <td>
                          <span
                            className={`ui-pill ${payment.status === "paid" ? "ui-p-done" : "ui-p-neutral"} cs-pay-chip is-${payment.status}`}
                          >
                            {PAYMENT_STATUS_LABELS[payment.status]}
                          </span>
                        </td>
                        <td>
                          {payment.method ? (
                            PAYMENT_METHOD_LABELS[payment.method]
                          ) : (
                            <span aria-label="No method">—</span>
                          )}
                        </td>
                        <td className="cs-nowrap">
                          {payment.paidOn ? (
                            formatCivilDate(payment.paidOn)
                          ) : (
                            <span aria-label="Not paid">—</span>
                          )}
                        </td>
                        {readOnly ? null : (
                          <td className="cs-pay-action">
                            <button
                              type="button"
                              className="ui-btn ui-btn-quiet ui-btn-sm"
                              onClick={(e) => openPaymentEditor(payment, e.currentTarget)}
                              disabled={!online}
                              aria-label={`Edit payment record due ${formatCivilDate(payment.dueOn)}, ${formatRupees(payment.amountPaise)}`}
                            >
                              <Pencil className="ui-i" aria-hidden />
                              Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {paymentSaved ? (
              <p className="cs-saved" role="status">
                {paymentSaved === "added" ? "Payment record added." : "Payment record saved."}
              </p>
            ) : null}
          </div>
        </section>

        <section
          id={sectionElementId("danger")}
          className={`cs-card cs-danger${readOnly ? " is-ended" : ""}`}
          aria-labelledby="cs-danger-title"
          data-testid="cs-section-danger"
        >
          <div className="cs-danger-row">
            <div className="cs-danger-copy">
              <h2 id="cs-danger-title">{readOnly ? "Coaching ended" : "End coaching"}</h2>
              <p data-testid="cs-coaching-dates">
                {startedOn && endedOn
                  ? `Coached ${formatCivilDate(startedOn)} — ${formatCivilDate(endedOn)}`
                  : startedOn
                    ? `Coaching since ${formatCivilDate(startedOn)}${weeks ? ` · ${weeks}` : ""}`
                    : endedOn
                      ? `Coaching ended ${formatCivilDate(endedOn)}`
                      : null}
              </p>
              {readOnly ? null : (
                <p>
                  {firstName} keeps the account and history. Plans and reminders stop
                  today. You can reactivate later.
                </p>
              )}
            </div>
            {readOnly ? null : (
              <button
                type="button"
                className="ui-btn ui-btn-danger-quiet cs-end-button"
                onClick={() => openWorkspaceModal({ type: "end" })}
                disabled={!online}
              >
                End coaching…
              </button>
            )}
          </div>
        </section>
      </>
    );
  }

  let body: ReactNode;
  if (panel === "details") {
    body = details;
  } else if (panel === "coaching") {
    body = <ConfigureCoachingPage />;
  } else if (panel === "reminders") {
    body = (
      <RemindersSection
        relationshipId={relationshipId}
        firstName={(header?.traineeDisplayName ?? shownName).trim().split(/\s+/)[0] ?? ""}
        gender={gender}
        clientWhatsappE164={header?.clientWhatsappE164 ?? null}
        hasCustomMealTimes={header?.hasCustomMealTimes ?? false}
        ended={readOnly}
        online={online}
        refreshEpoch={refreshEpoch}
        onToast={setToast}
        onEndedElsewhere={() => {
          setEndedElsewhere(true);
          reloadWorkspace?.();
        }}
      />
    );
  } else {
    body = <OnboardingReviewPage />;
  }

  return (
    <section
      className="cs-page"
      aria-labelledby="client-settings-title"
      data-testid="client-settings-page"
      data-section={active}
    >
      <h2 id="client-settings-title" className="sr-only">
        Client settings
      </h2>
      <div className="cs-layout">
        <aside className="cs-side">{nav}</aside>
        <div className="cs-main" data-testid={`cs-panel-${panel}`}>
          {endedElsewhere && !ended ? (
            <p className="cs-readonly-banner" role="status">
              <Lock className="ui-i" aria-hidden />
              Coaching with {firstName} has ended. Client settings are read-only.
            </p>
          ) : null}
          {body}
        </div>
      </div>
      {toast ? (
        <div className="home-toast" role="status">
          {toast}
        </div>
      ) : null}
      {editing && settings ? (
        <EditBasicsDrawer
          relationshipId={relationshipId}
          settings={settings}
          online={online}
          onClose={closeDrawer}
          onSaved={(next) => {
            setSettings(next);
            setSavedNotice(true);
            closeDrawer();
          }}
        />
      ) : null}
      {editingSubscription && settings && !readOnly ? (
        <SubscriptionDrawer
          relationshipId={relationshipId}
          subscription={settings.subscription}
          online={online}
          onClose={closeSubscriptionDrawer}
          onSaved={(next) => {
            setSettings((current) => (current ? { ...current, subscription: next } : current));
            setSubscriptionSaved(true);
            closeSubscriptionDrawer();
            // The workspace header shows the renewal chip: refresh it too.
            reloadWorkspace?.();
          }}
          onStale={() => {
            closeSubscriptionDrawer();
            void load();
            reloadWorkspace?.();
          }}
        />
      ) : null}
      {paymentEditor && settings && !readOnly ? (
        <PaymentDrawer
          relationshipId={relationshipId}
          record={paymentEditor.record}
          // "Today" in the trainer's stored timezone (browser zone when unset).
          today={civilDateOf(new Date().toISOString(), me?.timezone || undefined) ?? ""}
          online={online}
          onClose={closePaymentDrawer}
          onSaved={(next) => {
            const added = paymentEditor.record === null;
            setSettings((current) =>
              current
                ? {
                    ...current,
                    payments: sortPayments([
                      ...current.payments.filter((p) => p.id !== next.id),
                      next,
                    ]),
                  }
                : current,
            );
            setPaymentSaved(added ? "added" : "updated");
            closePaymentDrawer();
          }}
          onStale={() => {
            closePaymentDrawer();
            void load();
          }}
        />
      ) : null}
    </section>
  );
}
