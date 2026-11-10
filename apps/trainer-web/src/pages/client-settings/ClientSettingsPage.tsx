import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import {
  ChevronLeft,
  CreditCard,
  Pencil,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import type { ClientSettingsResponse } from "@fitbud/contracts";
import { formatCivilDate, labelFor } from "@fitbud/core";
import { apiClient } from "../../lib/api";
import { StatusChip } from "../../components/StatusChip";
import type { WorkspaceOutletContext } from "../workspaceContext";
import { EditBasicsDrawer } from "./EditBasicsDrawer";
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
import "./client-settings.css";

type SectionId = "basic" | "subscription" | "relationship";

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: "basic", label: "Basic details", icon: User },
  { id: "subscription", label: "Subscription & package", icon: CreditCard },
  { id: "relationship", label: "Coaching relationship", icon: Users },
];

function sectionFromHash(hash: string): SectionId {
  const id = hash.replace(/^#/, "");
  return SECTIONS.some((s) => s.id === id) ? (id as SectionId) : "basic";
}

function titleCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function Row({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="cs-row" data-testid={testId}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * Client settings (`/clients/:relationshipId/settings`), frames 209 / 209b.
 * Basic details, subscription, payment records (tracking only) and the coaching
 * relationship. Only the trainer-owned name and contact phone are edited here
 * (frame 210, D-W8-10). Session packages and collect/pay parts of the frames
 * are not built (D-W8-2). Subscription edit is Z8-3; adding payments is Z8-4.
 */
export function ClientSettingsPage() {
  const { workspace, relationshipId, online, ended, openWorkspaceModal } =
    useOutletContext<WorkspaceOutletContext>();
  const location = useLocation();
  const [settings, setSettings] = useState<ClientSettingsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [active, setActive] = useState<SectionId>(() => sectionFromHash(location.hash));
  const editButtonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setSettings(await apiClient.getClientSettings(relationshipId));
    } catch (err) {
      setLoadError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't load client settings. (CS-LOAD)",
      );
    } finally {
      setLoading(false);
    }
  }, [relationshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  // A link such as `/settings#subscription` lands on that section.
  useEffect(() => {
    if (!settings || !location.hash) return;
    const id = sectionFromHash(location.hash);
    setActive(id);
    document.getElementById(`cs-${id}`)?.scrollIntoView?.({ block: "start" });
  }, [settings, location.hash]);

  const header = workspace?.header ?? null;
  const profileName = settings?.basics.displayName ?? header?.traineeDisplayName ?? "";
  const shownName = settings?.basics.clientDisplayName ?? profileName;
  const firstName = shownName.split(/\s+/)[0] || shownName;
  const readOnly = ended || settings?.readOnly === true;

  function goTo(id: SectionId) {
    setActive(id);
    document.getElementById(`cs-${id}`)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  function closeDrawer() {
    setEditing(false);
    // Return focus to the control that opened the drawer.
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  const nav = (
    <nav className="cs-nav" aria-label="Client settings sections">
      <p className="cs-eyebrow">Client settings</p>
      <ul>
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className={`cs-nav-link${active === id ? " is-active" : ""}`}
              aria-current={active === id ? "true" : undefined}
              onClick={(e) => {
                e.preventDefault();
                goTo(id);
              }}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );

  const coachingNote = (
    <p className="cs-coaching-note">
      Goal, expectations, check-ins and reminders are coaching, so they live in{" "}
      <Link to={`/clients/${relationshipId}/configure`}>Plan › Coaching setup</Link>.
    </p>
  );

  let content: ReactNode;
  if (loading && !settings) {
    content = (
      <p className="muted" aria-busy="true">
        Loading client settings…
      </p>
    );
  } else if (loadError && !settings) {
    content = (
      <div className="cs-card" role="alert">
        <p className="form-error">{loadError}</p>
        <button type="button" className="button-secondary" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  } else if (settings) {
    const { basics, subscription, payments } = settings;
    const phone = basics.contactPhoneE164 ?? basics.phoneE164;
    const today = civilDateOf(new Date().toISOString()) ?? "";
    const chip = subscription ? renewalChipLabel(subscription, today) : null;
    const startedOn = civilDateOf(settings.startedAt);
    const endedOn = settings.endedAt ? civilDateOf(settings.endedAt) : null;
    const weeks = settings.endedAt ? null : weeksSince(settings.startedAt);
    const age = header?.traineeProfile.age ?? null;
    const gender = header?.traineeProfile.gender?.trim() || null;
    const timeZone = header?.traineeTimezone?.trim() || null;

    content = (
      <>
        <section
          id="cs-basic"
          className="cs-card"
          aria-labelledby="cs-basic-title"
          data-testid="cs-section-basic"
        >
          <header className="cs-card-head">
            <h3 id="cs-basic-title">Basic details</h3>
            {readOnly ? null : (
              <button
                ref={editButtonRef}
                type="button"
                className="cs-edit-button"
                onClick={() => {
                  setSavedNotice(false);
                  setEditing(true);
                }}
                disabled={!online}
                aria-label="Edit basic details"
              >
                <Pencil size={16} strokeWidth={1.75} aria-hidden />
                Edit
              </button>
            )}
          </header>
          <dl className="cs-grid">
            <Row label="Name" value={shownName} testId="cs-basic-name" />
            <Row
              label="Phone"
              value={phone ? formatPhone(phone) : "Not added"}
              testId="cs-basic-phone"
            />
            {gender ? <Row label="Sex" value={titleCase(gender)} /> : null}
            {age !== null ? <Row label="Age" value={String(age)} /> : null}
            {timeZone ? <Row label="Time zone" value={formatTimeZone(timeZone)} /> : null}
          </dl>
          {savedNotice ? (
            <p className="cs-saved" role="status">
              Saved.
            </p>
          ) : null}
        </section>

        <section
          id="cs-subscription"
          className="cs-card"
          aria-labelledby="cs-subscription-title"
          data-testid="cs-section-subscription"
        >
          <header className="cs-card-head">
            <h3 id="cs-subscription-title">Subscription & package</h3>
            {subscription && chip ? (
              <StatusChip
                kind="renewal"
                value={subscription.renewalState}
                label={chip}
                className="status-chip-xs"
              />
            ) : null}
          </header>
          {subscription ? (
            <dl className="cs-grid">
              <Row label="Plan" value={subscription.planName} />
              <Row
                label="Payment frequency"
                value={labelFor("payment_frequency", subscription.paymentFrequency)}
              />
              <Row label="Started" value={formatCivilDate(subscription.startsOn)} />
              <Row label="Renews" value={formatCivilDate(subscription.renewsOn)} />
              {subscription.amountPaise !== null ? (
                <Row
                  label="Amount"
                  value={<span className="cs-num">{formatRupees(subscription.amountPaise)}</span>}
                />
              ) : null}
            </dl>
          ) : (
            <p className="cs-empty">No subscription saved yet.</p>
          )}

          <div className="cs-payments" data-testid="cs-payments">
            <h4 className="cs-eyebrow">Payment records · tracking only</h4>
            {payments.length === 0 ? (
              <p className="cs-empty">No payment records yet.</p>
            ) : (
              <div className="cs-table-wrap">
                <table className="cs-table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Status</th>
                      <th scope="col">Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{formatCivilDate(payment.dueOn)}</td>
                        <td className="cs-num">{formatRupees(payment.amountPaise)}</td>
                        <td>
                          <span className={`cs-pay-chip is-${payment.status}`}>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="cs-footnote">
              Payment records are for your own tracking. FitBud doesn't collect payments,
              send invoices or remind clients to pay.
            </p>
          </div>
        </section>

        <section
          id="cs-relationship"
          className="cs-card"
          aria-labelledby="cs-relationship-title"
          data-testid="cs-section-relationship"
        >
          <header className="cs-card-head">
            <h3 id="cs-relationship-title">Coaching relationship</h3>
            {readOnly ? null : (
              <button
                type="button"
                className="cs-end-button"
                onClick={() => openWorkspaceModal({ type: "end" })}
                disabled={!online}
              >
                End coaching…
              </button>
            )}
          </header>
          <dl className="cs-grid">
            {startedOn ? (
              <Row
                label="Coaching since"
                value={`${formatCivilDate(startedOn)}${weeks ? ` · ${weeks}` : ""}`}
              />
            ) : null}
            {endedOn ? <Row label="Coaching ended" value={formatCivilDate(endedOn)} /> : null}
            {subscription?.coachingMode ? (
              <Row label="Mode" value={COACHING_MODE_LABELS[subscription.coachingMode]} />
            ) : null}
          </dl>
        </section>
      </>
    );
  }

  return (
    <section
      className="cs-page"
      aria-labelledby="client-settings-title"
      data-testid="client-settings-page"
    >
      <div className="cs-titlebar">
        <Link className="cs-back" to={`/clients/${relationshipId}/overview`}>
          <ChevronLeft size={18} strokeWidth={1.75} aria-hidden />
          Overview
        </Link>
        <h2 id="client-settings-title">Client settings</h2>
        {firstName ? (
          <p className="cs-only-you">
            Only you see these. They don't change {firstName}'s plan.
          </p>
        ) : null}
      </div>
      <div className="cs-layout">
        <aside className="cs-side">
          {nav}
          <div className="cs-side-note">{coachingNote}</div>
        </aside>
        <div className="cs-main">
          {content}
          <div className="cs-bottom-note">{coachingNote}</div>
        </div>
      </div>
      {editing && settings ? (
        <EditBasicsDrawer
          relationshipId={relationshipId}
          settings={settings}
          firstName={firstName}
          online={online}
          onClose={closeDrawer}
          onSaved={(next) => {
            setSettings(next);
            setSavedNotice(true);
            closeDrawer();
          }}
        />
      ) : null}
    </section>
  );
}
