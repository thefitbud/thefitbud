import { useCallback, useEffect, useState } from "react";
import { ApiClientError, userFacingMessage } from "@fitbud/api-client";
import type {
  ReminderType,
  ResponsivenessCategoryCounts,
  ResponsivenessResponse,
} from "@fitbud/contracts";
import { possessivePronoun } from "@fitbud/core";
import { Toggle } from "../../components/ui";
import { WhatsAppGlyph } from "../../components/WhatsAppGlyph";
import {
  RESPONSIVENESS_WINDOW_DAYS,
  labelTitle,
  preferredWorkoutText,
  quietHoursText,
  summaryCounts,
} from "../../components/workspace/ResponsivenessPanel";
import { apiClient } from "../../lib/api";
import { isWhatsAppAutomationEnabled, useConfig } from "../../lib/config";
import { stage1Api } from "../../lib/stage1-api";
import { clientWhatsappHref, whatsappHref } from "../../lib/whatsapp";

/** The three categories FitBud reminds about, in frame W-181 order. */
export const REMINDER_CATEGORIES: Array<{
  type: ReminderType;
  label: string;
  /** Key into the responsiveness `categories` counts. */
  counts: "workouts" | "meals" | "checkins";
}> = [
  { type: "workout_reminder", label: "Workouts", counts: "workouts" },
  { type: "meal_reminder", label: "Meals", counts: "meals" },
  { type: "checkin_reminder", label: "Check-in", counts: "checkins" },
];

type RuleState = Record<string, boolean>;

const DEFAULT_RULES: RuleState = {
  workout_reminder: true,
  meal_reminder: true,
  checkin_reminder: true,
};

/** "6 sent · 4 opened · 3 logged after · 2 on own" (the drawer's per-category counts, one line). */
export function categoryCountsLine(row: ResponsivenessCategoryCounts): string {
  const parts = [`${row.sent} sent`];
  if (row.opened !== null) parts.push(`${row.opened} opened`);
  parts.push(`${row.loggedAfter} logged after`, `${row.loggedOnOwn} logged on own`);
  if (row.notLogged > 0) parts.push(`${row.notLogged} not logged`);
  if (row.suppressed > 0) parts.push(`${row.suppressed} held back`);
  return parts.join(" · ");
}

/**
 * Settings › Reminders (W13-10, frame W-181). The facts the Reminders drawer
 * shows (TW-31: the 14-day pattern, per-category counts, the client's quiet
 * hours and workout time, the paused / push-off states and the footnote) plus
 * the three automatic reminder switches that used to sit in Coaching setup.
 * The switches save exactly as before (`saveReminderRules`, one rule a time).
 * Ended: everything is read-only and the switches are not offered (D-W7-7).
 */
export function RemindersSection({
  relationshipId,
  firstName,
  gender,
  clientWhatsappE164,
  hasCustomMealTimes,
  ended,
  online,
  refreshEpoch,
  onToast,
  onEndedElsewhere,
}: {
  relationshipId: string;
  firstName: string;
  gender?: string | null;
  clientWhatsappE164?: string | null;
  hasCustomMealTimes?: boolean;
  ended: boolean;
  online: boolean;
  refreshEpoch: number;
  onToast: (message: string) => void;
  /** A save refused because coaching ended elsewhere (409 RELATIONSHIP_ENDED). */
  onEndedElsewhere: () => void;
}) {
  const { config } = useConfig();
  const waAutomationOn = isWhatsAppAutomationEnabled(config);
  const pronoun = possessivePronoun(gender);
  const [data, setData] = useState<ResponsivenessResponse | null>(null);
  const [factsError, setFactsError] = useState<string | null>(null);
  const [rules, setRules] = useState<RuleState>(DEFAULT_RULES);
  const [rulesLoaded, setRulesLoaded] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void stage1Api
      .getResponsiveness(relationshipId, RESPONSIVENESS_WINDOW_DAYS)
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setFactsError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFactsError(userFacingMessage(err, { fallback: "Could not load reminders data." }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [relationshipId, refreshEpoch]);

  const loadRules = useCallback(async () => {
    try {
      const result = await apiClient.getReminderRules(relationshipId);
      const next: RuleState = { ...DEFAULT_RULES };
      for (const item of result.items) {
        if (item.reminderType in next) next[item.reminderType] = item.enabled;
      }
      setRules(next);
      setRulesError(null);
    } catch (err) {
      setRulesError(userFacingMessage(err, { fallback: "Could not load reminder settings." }));
    } finally {
      setRulesLoaded(true);
    }
  }, [relationshipId]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  async function toggle(type: ReminderType, enabled: boolean) {
    if (ended || !online) return;
    const previous = rules[type];
    setRules((current) => ({ ...current, [type]: enabled }));
    setSaving(type);
    try {
      const result = await apiClient.saveReminderRules(relationshipId, {
        rules: [{ reminderType: type, enabled }],
      });
      setRules((current) => {
        const next: RuleState = { ...current, [type]: enabled };
        for (const item of result.items) {
          if (item.reminderType in next) next[item.reminderType] = item.enabled;
        }
        return next;
      });
      const label = REMINDER_CATEGORIES.find((c) => c.type === type)?.label ?? "Reminder";
      onToast(enabled ? `${label} reminders on` : `${label} reminders off`);
    } catch (err) {
      setRules((current) => ({ ...current, [type]: previous ?? true }));
      if (
        err instanceof ApiClientError &&
        err.status === 409 &&
        err.code === "RELATIONSHIP_ENDED"
      ) {
        onEndedElsewhere();
        return;
      }
      onToast(userFacingMessage(err, { fallback: "Could not update reminder." }));
    } finally {
      setSaving(null);
    }
  }

  const quiet = data ? quietHoursText(data) : null;
  const preferred = data ? preferredWorkoutText(data, firstName) : null;
  const pushOff = data?.label === "notifications_off";
  const askHref = pushOff
    ? clientWhatsappHref({
        phoneE164: clientWhatsappE164,
        name: firstName,
        onboardingStatus: "active",
      })
    : null;
  const openWhatsappHref = clientWhatsappE164
    ? whatsappHref({
        phoneE164: clientWhatsappE164,
        draftText: `Hi ${firstName}, checking in from FitBud about your coaching setup.`,
      })
    : null;

  return (
    <div className="cs-panel" data-testid="cs-section-reminders" id="cs-reminders">
      <h2 className="sr-only">Reminders</h2>
      {factsError && !data ? (
        <p className="form-error" role="alert">
          {factsError}
        </p>
      ) : !data ? (
        <p className="muted" aria-busy="true">
          Loading reminder responsiveness…
        </p>
      ) : (
        <section
          className="cs-card cs-kpis"
          aria-label={`Last ${RESPONSIVENESS_WINDOW_DAYS} days`}
          data-testid="cs-reminders-summary"
        >
          <div className="cs-kpi">
            <p className="cs-kpi-value cs-kpi-word responsiveness-summary">
              {labelTitle(data.label)}
            </p>
            <p className="cs-kpi-label">{summaryCounts(data)}</p>
          </div>
          <div className="cs-kpi">
            <p className="cs-kpi-value">{data.counts.sent}</p>
            <p className="cs-kpi-label">
              Reminders sent · last {RESPONSIVENESS_WINDOW_DAYS} days
            </p>
          </div>
          <div className="cs-kpi">
            <p className="cs-kpi-value">
              {data.counts.opened}
              <span className="cs-kpi-of"> of {data.counts.sent}</span>
            </p>
            <p className="cs-kpi-label">Opened · last {RESPONSIVENESS_WINDOW_DAYS} days</p>
          </div>
        </section>
      )}

      {pushOff && !ended ? (
        <p className="cs-notice" role="status">
          {askHref ? (
            <a href={askHref} target="_blank" rel="noreferrer">
              Ask {firstName} to turn on notifications · WhatsApp
            </a>
          ) : (
            <>Ask {firstName} to turn on notifications · WhatsApp</>
          )}
        </p>
      ) : null}

      <section className="cs-card" aria-labelledby="cs-reminders-auto-title">
        <header className="cs-card-head">
          <h3 id="cs-reminders-auto-title">Automatic reminders</h3>
          <p className="cs-card-aside">
            {ended ? "Off while coaching is ended" : `FitBud push to ${firstName}'s phone`}
          </p>
        </header>
        {rulesError ? (
          <p className="form-error cs-card-pad" role="alert">
            {rulesError}
          </p>
        ) : null}
        <dl className="cs-rows">
          {REMINDER_CATEGORIES.map((category) => {
            const counts = data?.categories?.[category.counts] ?? null;
            const labelId = `cs-reminder-${category.type}`;
            return (
              <div
                className="cs-row"
                key={category.type}
                data-testid={`cs-reminder-row-${category.counts}`}
              >
                <dt>
                  <span className="cs-row-label" id={labelId}>
                    {category.label}
                  </span>
                  {counts ? (
                    <span className="cs-row-help">{categoryCountsLine(counts)}</span>
                  ) : null}
                </dt>
                <dd className="cs-row-end">
                  {ended ? (
                    <span className="cs-row-value">Off</span>
                  ) : (
                    <Toggle
                      checked={Boolean(rules[category.type])}
                      labelledBy={labelId}
                      disabled={!online || !rulesLoaded || saving === category.type}
                      onChange={(next) => {
                        void toggle(category.type, next);
                      }}
                    />
                  )}
                </dd>
              </div>
            );
          })}
          <div className="cs-row">
            <dt>
              <span className="cs-row-label">WhatsApp reminders</span>
              <span className="cs-row-help">
                {waAutomationOn
                  ? `Used when app notifications don't reach ${firstName}. The trainer can't opt a client in.`
                  : `FitBud reminds ${firstName} in the app for now.`}
              </span>
            </dt>
            <dd className="cs-row-end">
              {waAutomationOn ? null : <span className="chip-coming">Coming soon</span>}
              {ended ? null : openWhatsappHref ? (
                <a
                  className="ui-btn ui-btn-secondary ui-btn-sm"
                  href={openWhatsappHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  <WhatsAppGlyph />
                  Open WhatsApp
                </a>
              ) : null}
            </dd>
          </div>
        </dl>
      </section>

      <section className="cs-card" aria-labelledby="cs-reminders-client-title">
        <header className="cs-card-head">
          <h3 id="cs-reminders-client-title">{firstName}&apos;s settings</h3>
          <p className="cs-card-aside">{firstName} changes these in the app</p>
        </header>
        <dl className="cs-rows">
          <div className="cs-row">
            <dt>
              <span className="cs-row-label">Quiet hours</span>
              <span className="cs-row-help">No reminders in this window</span>
            </dt>
            <dd className="cs-row-value">{quiet ?? "Not set"}</dd>
          </div>
          <div className="cs-row">
            <dt>
              <span className="cs-row-label">Workout time</span>
              <span className="cs-row-help">Workout reminders follow it</span>
            </dt>
            <dd className="cs-row-value">{preferred ?? "Not set"}</dd>
          </div>
          <div className="cs-row">
            <dt>
              <span className="cs-row-label">Meal times</span>
            </dt>
            <dd className="cs-row-value">
              {hasCustomMealTimes
                ? `${firstName} has customized meal times in the app`
                : "FitBud default meal times"}
            </dd>
          </div>
        </dl>
        <p className="cs-card-foot responsiveness-footer">
          {ended
            ? "Reminders are off while coaching is ended."
            : `Reminders are timed by FitBud and respect ${firstName}'s settings and meal times. FitBud reminds only when something isn't logged, and never in ${pronoun} quiet hours. ${firstName} controls ${pronoun} own notification settings.`}
        </p>
      </section>
    </div>
  );
}
