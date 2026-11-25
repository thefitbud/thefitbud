import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ApiClientError, userFacingMessage } from "@fitbud/api-client";
import type {
  OnboardingFieldDefinition,
  OnboardingFormResponse,
  OnboardingFormVersion,
} from "@fitbud/contracts";
import {
  formatCivilDate,
  formatClockTime,
  formatLocalDate,
  formatOnboardingAnswer,
} from "@fitbud/core";
import { AlertTriangle, Check, ClipboardList, Flag } from "lucide-react";
import { Button } from "../components/Button";
import { WhatsAppGlyph } from "../components/WhatsAppGlyph";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { whatsappHref } from "../lib/whatsapp";
import type { WorkspaceOutletContext } from "./workspaceContext";
import "./OnboardingReviewPage.css";

type AnswerRow = {
  field: OnboardingFieldDefinition;
  text: string;
  chips: string[] | null;
};

const STEPS = [
  { id: "invited", label: "Invited" },
  { id: "joined", label: "Joined" },
  { id: "intake", label: "Intake" },
  { id: "ready", label: "Ready to coach" },
] as const;

function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || "Client";
}

function formDisplayName(name: string): string {
  if (/^default onboarding$/i.test(name.trim())) {
    return "FitBud standard intake";
  }
  return name;
}

function answerPresent(raw: unknown): boolean {
  if (raw == null) return false;
  if (typeof raw === "string") return raw.trim().length > 0;
  if (typeof raw === "number") return Number.isFinite(raw);
  if (typeof raw === "boolean") return true;
  if (Array.isArray(raw)) return raw.length > 0;
  return false;
}

function choiceChips(
  field: OnboardingFieldDefinition,
  raw: unknown,
): string[] | null {
  if (field.type === "multiple_choice" && Array.isArray(raw)) {
    const labels = new Map(field.options.map((o) => [o.id, o.label]));
    return raw
      .filter((id): id is string => typeof id === "string")
      .map((id) => labels.get(id) ?? id);
  }
  if (field.type === "single_choice" && typeof raw === "string") {
    const match = field.options.find((o) => o.id === raw);
    return [match?.label ?? raw];
  }
  if (field.type === "select" && typeof raw === "string") {
    return [raw];
  }
  return null;
}

function formatWhen(
  iso: string | null | undefined,
  timeZone: string | null | undefined,
): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  let civil: string | null = null;
  if (timeZone) {
    try {
      civil = formatLocalDate(at, timeZone);
    } catch {
      civil = iso.slice(0, 10);
    }
  } else {
    civil = iso.slice(0, 10);
  }
  if (!civil || !/^\d{4}-\d{2}-\d{2}$/.test(civil)) return null;
  const day = formatCivilDate(civil);
  const clock = formatClockTime(iso, timeZone ?? undefined);
  return clock ? `${day}, ${clock}` : day;
}

function ClampedAnswer({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 220 || text.split("\n").length > 4;
  return (
    <div className={`intake-answer-body${expanded ? " is-expanded" : ""}`}>
      <p className="intake-answer-text">{text}</p>
      {long ? (
        <button
          type="button"
          className="text-link intake-show-more"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

export function OnboardingReviewPage() {
  const { relationshipId = "" } = useParams();
  const navigate = useNavigate();
  const { workspace, refreshEpoch } = useOutletContext<WorkspaceOutletContext>();
  const [intake, setIntake] = useState<OnboardingFormResponse | null>(null);
  const [definition, setDefinition] = useState<OnboardingFormVersion | null>(
    null,
  );
  const [formName, setFormName] = useState<string | null>(null);
  const [intakeMissing, setIntakeMissing] = useState(false);
  const [markedReadyAt, setMarkedReadyAt] = useState<string | null>(null);
  const [invitedAt, setInvitedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const header = workspace?.header ?? null;
  const displayName = header?.traineeDisplayName ?? "Client";
  const firstName = firstNameOf(displayName);
  const timeZone = header?.traineeTimezone ?? null;
  const clientWhatsapp = header?.clientWhatsappE164 ?? null;

  /** "refresh" (workspace refresh) updates quietly, without the full-page loading swap. */
  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!relationshipId) return;
      if (mode === "initial") setLoading(true);
      setError(null);
      setIntakeMissing(false);
      try {
        const def = await apiClient.getCurrentOnboardingForm(relationshipId);
        setDefinition(def);

        const [templateResult, submissionResult, historyResult, invitesResult] =
          await Promise.all([
            apiClient.getOnboardingFormTemplate(def.templateId).then(
              (value) => ({ ok: true as const, value }),
              () => ({ ok: false as const }),
            ),
            apiClient.getOnboardingResponse(relationshipId).then(
              (value) => ({ ok: true as const, value }),
              (err: unknown) => ({ ok: false as const, err }),
            ),
            apiClient
              .listHistory(relationshipId, {
                kind: "onboarding_reviewed",
                limit: 1,
              })
              .then(
                (value) => ({ ok: true as const, value }),
                () => ({ ok: false as const }),
              ),
            apiClient.listInvitations({ limit: 50 }).then(
              (value) => ({ ok: true as const, value }),
              () => ({ ok: false as const }),
            ),
          ]);

        setFormName(
          templateResult.ok
            ? formDisplayName(templateResult.value.name)
            : formDisplayName(def.key),
        );

        if (submissionResult.ok) {
          setIntake(submissionResult.value);
        } else if (
          submissionResult.err instanceof ApiClientError &&
          submissionResult.err.status === 404
        ) {
          setIntake(null);
          setIntakeMissing(true);
        } else {
          throw submissionResult.err;
        }

        if (historyResult.ok && historyResult.value.items[0]) {
          setMarkedReadyAt(historyResult.value.items[0].occurredAt);
        } else {
          setMarkedReadyAt(null);
        }

        if (invitesResult.ok) {
          const match = invitesResult.value.items.find(
            (item) => item.coachingRelationshipId === relationshipId,
          );
          setInvitedAt(match?.createdAt ?? null);
        } else {
          setInvitedAt(null);
        }
      } catch (err) {
        setError(
          userFacingMessage(err, { fallback: "Could not load onboarding review." }),
        );
      } finally {
        setLoading(false);
      }
    },
    [relationshipId],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  // The workspace stays mounted while it refreshes (#88): refetch on its
  // refresh instead of relying on a remount.
  const seenRefreshEpoch = useRef(refreshEpoch);
  useEffect(() => {
    if (seenRefreshEpoch.current === refreshEpoch) return;
    seenRefreshEpoch.current = refreshEpoch;
    void load("refresh");
  }, [load, refreshEpoch]);

  const answerRows = useMemo((): AnswerRow[] => {
    if (!definition || !intake) return [];
    return definition.fields.map((field) => {
      const raw = intake.answers[field.id];
      const chips = choiceChips(field, raw);
      const text = formatOnboardingAnswer(field, raw).trim() || "—";
      return { field, text, chips };
    });
  }, [definition, intake]);

  const highlightCount = useMemo(
    () => answerRows.filter((row) => row.field.highlight === true).length,
    [answerRows],
  );

  const sectionProgress = useMemo(() => {
    if (!definition) return { answered: 0, total: 0 };
    const sections = new Map<string, OnboardingFieldDefinition[]>();
    for (const field of definition.fields) {
      const key = field.section?.trim() || "General";
      const list = sections.get(key) ?? [];
      list.push(field);
      sections.set(key, list);
    }
    const total = sections.size;
    if (!intake) return { answered: 0, total };
    let answered = 0;
    for (const fields of sections.values()) {
      if (fields.some((field) => answerPresent(intake.answers[field.id]))) {
        answered += 1;
      }
    }
    return { answered, total };
  }, [definition, intake]);

  const onboardingStatus = header?.onboardingStatus;
  const submitted =
    intake?.status === "submitted" && Boolean(intake.submittedAt);
  const alreadyReady =
    onboardingStatus === "coaching_ready" ||
    onboardingStatus === "active" ||
    onboardingStatus === "ended" ||
    Boolean(markedReadyAt);
  const readOnly = alreadyReady && onboardingStatus !== "onboarding_submitted";

  const coachingEnded = onboardingStatus === "ended";
  // Ended clients are read-only (D-W7-7): no intake WhatsApp draft.
  const thanksHref =
    clientWhatsapp && !coachingEnded
      ? whatsappHref({
          phoneE164: clientWhatsapp,
          draftText: `Thanks for filling your intake, ${firstName}. I'll review it and set up your coaching next.`,
        })
      : null;

  const remindHref = clientWhatsapp
    ? whatsappHref({
        phoneE164: clientWhatsapp,
        draftText: `Hi ${firstName}, please complete your FitBud intake so I can set up your coaching.`,
      })
    : null;

  const emptyNotSubmitted =
    intakeMissing ||
    !intake ||
    intake.status !== "submitted" ||
    onboardingStatus === "onboarding_pending" ||
    onboardingStatus === "invited";

  const activeStepIndex = emptyNotSubmitted
    ? 2
    : readOnly
      ? 3
      : 3;
  const doneThrough = emptyNotSubmitted ? 1 : 2;

  // D-W13-15: Coaching setup is a Settings tab section now.
  const coachingSetupHref = `/clients/${relationshipId}/settings#coaching`;

  async function markReadyAndConfigure() {
    if (!relationshipId) return;
    setActing(true);
    setError(null);
    try {
      if (onboardingStatus === "onboarding_submitted") {
        if (!intake || intake.status !== "submitted") {
          setError("Submitted intake is required before configuring coaching.");
          return;
        }
        const result = await apiClient.reviewOnboarding(
          relationshipId,
          { outcome: "coaching_ready" },
          createIdempotencyKey(),
        );
        setMarkedReadyAt(result.review.createdAt);
      }
      navigate(coachingSetupHref);
    } catch (err) {
      setError(
        userFacingMessage(err, { fallback: "Could not complete onboarding review." }),
      );
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="intake-review-page intake-embedded" aria-busy="true">
        <p className="muted">Loading intake…</p>
      </div>
    );
  }

  if (error && !definition) {
    return (
      <div className="intake-review-page intake-embedded">
        <p className="form-error" role="alert">
          {error}
        </p>
        <Link
          to={`/clients/${relationshipId}/overview`}
          className="button-secondary"
        >
          Back to workspace
        </Link>
      </div>
    );
  }

  const submittedWhen = formatWhen(intake?.submittedAt, timeZone);
  const joinedWhen = formatWhen(header?.startedAt, timeZone);
  const invitedWhen = formatWhen(invitedAt, timeZone);
  const intakeStartedWhen = formatWhen(
    intake && intake.status !== "submitted" ? intake.createdAt : null,
    timeZone,
  );
  const readyCivil = markedReadyAt
    ? (() => {
        try {
          return timeZone
            ? formatLocalDate(new Date(markedReadyAt), timeZone)
            : markedReadyAt.slice(0, 10);
        } catch {
          return markedReadyAt.slice(0, 10);
        }
      })()
    : null;

  const nextStepCopy = emptyNotSubmitted
    ? `Wait for ${firstName}'s intake, then review it and mark ${firstName} ready to coach.`
    : highlightCount > 0
      ? `Review the ${highlightCount} flagged answer${highlightCount === 1 ? "" : "s"}, then mark ${firstName} ready to set up the plan and reminders.`
      : `Review ${firstName}'s intake, then mark ${firstName} ready to set up the plan and reminders.`;

  const joinedLine = joinedWhen
    ? `${firstName} joined ${joinedWhen.split(",")[0]}`
    : null;

  // W13-10 (frame W-146): answers grouped by form section, label-left rows.
  const groups: Array<{ name: string; rows: AnswerRow[] }> = [];
  for (const row of answerRows) {
    const name = row.field.section?.trim() || "Answers";
    const group = groups.find((g) => g.name === name);
    if (group) group.rows.push(row);
    else groups.push({ name, rows: [row] });
  }
  const flagged = answerRows.filter((row) => row.field.highlight === true);
  const answeredCount = answerRows.filter((row) => row.text !== "—").length;

  const nextStepCard = (
    <section className="cs-card intake-next" aria-labelledby="intake-next-title">
      <header className="cs-card-head">
        <h2 id="intake-next-title">Next step</h2>
      </header>
      <div className="cs-card-pad intake-next-body">
        {readOnly ? null : <p>{nextStepCopy}</p>}
        {readOnly ? (
          <p className="intake-ready-mark" role="status">
            Marked ready
            {readyCivil
              ? ` ${formatCivilDate(readyCivil)}`
              : ""}
          </p>
        ) : null}
        <div className="intake-side-actions">
          {!emptyNotSubmitted && !readOnly ? (
            <Button
              variant="primary"
              disabled={acting || !submitted}
              onClick={() => {
                void markReadyAndConfigure();
              }}
            >
              {acting ? "Working…" : "Mark ready & configure"}
            </Button>
          ) : null}
          {readOnly && submitted ? (
            <Button
              variant="secondary"
              onClick={() => navigate(coachingSetupHref)}
            >
              {onboardingStatus === "ended"
                ? "View coaching setup"
                : "Open coaching setup"}
            </Button>
          ) : null}
          {!emptyNotSubmitted && !coachingEnded && thanksHref ? (
            <a
              className="ui-btn ui-btn-secondary"
              href={thanksHref}
              target="_blank"
              rel="noreferrer"
            >
              <WhatsAppGlyph />
              Message on WhatsApp
            </a>
          ) : !emptyNotSubmitted && !coachingEnded && submitted ? (
            <Button variant="whatsapp" disabled>
              <WhatsAppGlyph />
              Message on WhatsApp
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );

  const timelineCard = (
    <section className="cs-card" aria-labelledby="intake-timeline-title">
      <header className="cs-card-head">
        <h2 id="intake-timeline-title">Timeline</h2>
      </header>
      <ol className="intake-timeline cs-card-pad">
        {invitedWhen ? (
          <li>
            <span className="intake-timeline-dot is-muted" aria-hidden />
            <span>Invited · {invitedWhen}</span>
          </li>
        ) : null}
        {joinedWhen ? (
          <li>
            <span className="intake-timeline-dot" aria-hidden />
            <span>Joined · {joinedWhen}</span>
          </li>
        ) : null}
        {emptyNotSubmitted && intakeStartedWhen ? (
          <li>
            <span className="intake-timeline-dot" aria-hidden />
            <span>Intake started · {intakeStartedWhen}</span>
          </li>
        ) : null}
        {!emptyNotSubmitted && submittedWhen ? (
          <li>
            <span className="intake-timeline-dot" aria-hidden />
            <span>Intake submitted · {submittedWhen}</span>
          </li>
        ) : null}
      </ol>
    </section>
  );

  return (
    <div
      className="intake-review-page intake-embedded"
      data-testid="screen-TW-10"
      id="cs-onboarding"
    >
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {readOnly ? null : (
        <ol className="intake-stepper" aria-label="Onboarding progress">
          {STEPS.map((step, index) => {
            const done = index <= doneThrough;
            const active = index === activeStepIndex;
            const state = done && !active ? "is-done" : active ? "is-active" : "";
            return (
              <li key={step.id} className={`intake-step ${state}`.trim()}>
                <div className="intake-step-top">
                  <span className="intake-step-num" aria-hidden="true">
                    {done && !active ? <Check size={14} strokeWidth={2.5} /> : index + 1}
                  </span>
                  <span className="intake-step-label">{step.label}</span>
                </div>
                <div className="intake-step-rail" aria-hidden="true" />
              </li>
            );
          })}
        </ol>
      )}

      {readOnly ? null : nextStepCard}

      {emptyNotSubmitted ? (
        <section className="cs-card intake-empty-state" role="status">
          <span className="intake-empty-icon" aria-hidden="true">
            <ClipboardList size={28} strokeWidth={1.75} />
          </span>
          <h3>
            {firstName} hasn&apos;t submitted the intake yet
          </h3>
          <p>
            {joinedLine ? `${joinedLine} and has ` : ""}
            answered {sectionProgress.answered} of {sectionProgress.total}{" "}
            section{sectionProgress.total === 1 ? "" : "s"}. You can remind{" "}
            {firstName} on WhatsApp.
          </p>
          {remindHref ? (
            <a
              className="ui-btn ui-btn-primary"
              href={remindHref}
              target="_blank"
              rel="noreferrer"
            >
              <WhatsAppGlyph />
              Remind on WhatsApp
            </a>
          ) : (
            <Button variant="primary" disabled>
              <WhatsAppGlyph />
              Remind on WhatsApp
            </Button>
          )}
        </section>
      ) : (
        <>
          <header className="intake-embed-head">
            <h2 className="intake-review-heading">
              {formName ?? "Intake"}
              {definition ? ` · v${definition.version}` : null}
            </h2>
            <p className="intake-review-submitted">
              {[
                submittedWhen ? `Submitted ${submittedWhen}` : null,
                `${answeredCount} answer${answeredCount === 1 ? "" : "s"}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </header>

          {flagged.length > 0 ? (
            <section
              className="cs-card intake-keep"
              aria-labelledby="intake-keep-title"
              data-testid="intake-keep-in-mind"
            >
              <h3 id="intake-keep-title" className="intake-keep-title">
                <Flag className="ui-i" aria-hidden="true" />
                {flagged.length === 1
                  ? "1 answer to keep in mind"
                  : `${flagged.length} answers to keep in mind`}
              </h3>
              <ul className="intake-keep-list">
                {flagged.map((row) => (
                  <li key={row.field.id}>
                    {row.field.section?.trim() ? (
                      <span className="ui-pill ui-p-warn">{row.field.section.trim()}</span>
                    ) : null}
                    <span>
                      <b>{row.field.label}:</b> {row.chips ? row.chips.join(", ") : row.text}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {groups.map((group, index) => (
            <section
              key={group.name}
              className="cs-card"
              aria-labelledby={`intake-group-${index}`}
            >
              <header className="cs-card-head">
                <h3 id={`intake-group-${index}`}>{group.name}</h3>
                <p className="cs-card-aside">
                  {(() => {
                    const count = group.rows.filter((row) => row.text !== "—").length;
                    return count === 1 ? "1 answer" : `${count} answers`;
                  })()}
                </p>
              </header>
              <dl className="cs-rows intake-answer-list">
                {group.rows.map((row) => (
                  <div className="cs-row" key={row.field.id}>
                    <dt>
                      <span className="cs-row-q">{row.field.label}</span>
                      {row.field.highlight ? (
                        <span className="intake-review-flag">
                          <AlertTriangle size={13} strokeWidth={2} aria-hidden />
                          Review
                        </span>
                      ) : null}
                    </dt>
                    <dd className="cs-row-value">
                      {row.chips ? (
                        <ul className="intake-choice-chips">
                          {row.chips.map((chip) => (
                            <li key={chip}>{chip}</li>
                          ))}
                        </ul>
                      ) : row.field.type === "yes_no" ? (
                        <span>{row.text}</span>
                      ) : (
                        <ClampedAnswer text={row.text} />
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </>
      )}

      <div className="intake-foot">
        {readOnly ? nextStepCard : null}
        {timelineCard}
      </div>
    </div>
  );
}
