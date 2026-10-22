import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  OnboardingFieldDefinition,
  OnboardingFormResponse,
  OnboardingFormVersion,
} from "@fitbud/contracts";
import {
  formatCivilDate,
  formatOnboardingAnswer,
  formatRelative,
  possessivePronoun,
} from "@fitbud/core";
import { Button } from "../components/Button";
import { WhatsAppGlyph } from "../components/WhatsAppGlyph";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { whatsappHref } from "../lib/whatsapp";
import type { WorkspaceOutletContext } from "./workspaceContext";
import "../styles/plan.css";

type AnswerRow = {
  field: OnboardingFieldDefinition;
  text: string;
  chips: string[] | null;
};

function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || "Client";
}

function civilFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const slice = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
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
  const { workspace } = useOutletContext<WorkspaceOutletContext>();
  const [intake, setIntake] = useState<OnboardingFormResponse | null>(null);
  const [definition, setDefinition] = useState<OnboardingFormVersion | null>(
    null,
  );
  const [formName, setFormName] = useState<string | null>(null);
  const [intakeMissing, setIntakeMissing] = useState(false);
  const [markedReadyAt, setMarkedReadyAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const header = workspace?.header ?? null;
  const displayName = header?.traineeDisplayName ?? "Client";
  const firstName = firstNameOf(displayName);
  const pronoun = possessivePronoun(header?.traineeProfile.gender);
  const clientWhatsapp =
    header?.clientWhatsappE164 ?? null;

  const load = useCallback(async () => {
    if (!relationshipId) return;
    setLoading(true);
    setError(null);
    setIntakeMissing(false);
    try {
      const def = await apiClient.getCurrentOnboardingForm(relationshipId);
      setDefinition(def);

      const [templateResult, submissionResult, historyResult] =
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
        ]);

      setFormName(templateResult.ok ? templateResult.value.name : def.key);

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
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load onboarding review.",
      );
    } finally {
      setLoading(false);
    }
  }, [relationshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  const answerRows = useMemo((): AnswerRow[] => {
    if (!definition || !intake) return [];
    return definition.fields.map((field) => {
      const raw = intake.answers[field.id];
      const chips = choiceChips(field, raw);
      const text =
        formatOnboardingAnswer(field, raw).trim() || "—";
      return { field, text, chips };
    });
  }, [definition, intake]);

  const highlights = useMemo(
    () => answerRows.filter((row) => row.field.highlight === true),
    [answerRows],
  );

  const sections = useMemo(() => {
    const groups = new Map<string, AnswerRow[]>();
    for (const row of answerRows) {
      const key = row.field.section?.trim() || "";
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [answerRows]);

  const onboardingStatus = header?.onboardingStatus;
  const submitted =
    intake?.status === "submitted" && Boolean(intake.submittedAt);
  const alreadyReady =
    onboardingStatus === "coaching_ready" ||
    onboardingStatus === "active" ||
    onboardingStatus === "ended" ||
    Boolean(markedReadyAt);
  const readOnly = alreadyReady && onboardingStatus !== "onboarding_submitted";

  const thanksHref = clientWhatsapp
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
      navigate(`/clients/${relationshipId}/configure`);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not complete onboarding review.",
      );
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="workspace-page intake-review-page" aria-busy="true">
        <p className="muted">Loading intake…</p>
      </div>
    );
  }

  if (error && !definition) {
    return (
      <div className="workspace-page intake-review-page">
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

  const submittedCivil = civilFromIso(intake?.submittedAt);
  const readyCivil = civilFromIso(markedReadyAt);
  const versionLabel = definition
    ? `${formName ?? definition.key} v${definition.version}`
    : null;

  const emptyNotSubmitted =
    intakeMissing ||
    !intake ||
    intake.status !== "submitted" ||
    onboardingStatus === "onboarding_pending" ||
    onboardingStatus === "invited";

  return (
    <div
      className="workspace-page intake-review-page"
      data-testid="screen-TW-10"
    >
      <header className="intake-review-header">
        <h2 className="intake-review-title">
          Intake
          {submitted && submittedCivil ? (
            <>
              {" "}
              · submitted {formatCivilDate(submittedCivil)}
            </>
          ) : null}
          {versionLabel ? (
            <>
              {" "}
              · {versionLabel}
            </>
          ) : null}
        </h2>
      </header>

      {emptyNotSubmitted ? (
        <section className="intake-empty" role="status">
          <p>
            {firstName} hasn&apos;t submitted {pronoun} intake yet
            {intake && intake.status === "draft" && intake.updatedAt
              ? `. Last saved ${formatRelative(intake.updatedAt)}`
              : ""}
            .
          </p>
          {remindHref ? (
            <a
              className="button-secondary button-whatsapp"
              href={remindHref}
              target="_blank"
              rel="noreferrer"
            >
              <WhatsAppGlyph />
              Remind on WhatsApp
            </a>
          ) : (
            <Button variant="whatsapp" disabled>
              <WhatsAppGlyph />
              Remind on WhatsApp
            </Button>
          )}
        </section>
      ) : (
        <>
          {highlights.length > 0 ? (
            <section
              className="intake-worth-noting"
              aria-labelledby="worth-noting-heading"
            >
              <h3 id="worth-noting-heading">Worth noting</h3>
              <dl className="intake-answer-list">
                {highlights.map((row) => (
                  <div key={`highlight-${row.field.id}`}>
                    <dt>{row.field.label}</dt>
                    <dd>
                      {row.chips ? (
                        <ul className="intake-choice-chips">
                          {row.chips.map((chip) => (
                            <li key={chip}>{chip}</li>
                          ))}
                        </ul>
                      ) : (
                        <ClampedAnswer text={row.text} />
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {sections.map(([sectionName, rows]) => (
            <section
              key={sectionName || "answers"}
              className="intake-section"
              aria-label={sectionName || "Intake answers"}
            >
              {sectionName ? (
                <h3 className="intake-section-title">{sectionName}</h3>
              ) : null}
              <dl className="intake-answer-list">
                {rows.map((row) => (
                  <div key={row.field.id}>
                    <dt>{row.field.label}</dt>
                    <dd>
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

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <footer className="screen-sticky-footer">
        {readOnly ? (
          <p className="intake-ready-mark" role="status">
            Marked ready
            {readyCivil
              ? ` ${formatCivilDate(readyCivil, { includeWeekday: false })}`
              : ""}
          </p>
        ) : null}
        <div className="screen-sticky-footer-actions">
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
              variant="primary"
              onClick={() => navigate(`/clients/${relationshipId}/configure`)}
            >
              {onboardingStatus === "ended"
                ? "View coaching setup"
                : "Open configure"}
            </Button>
          ) : null}
          {thanksHref && submitted ? (
            <a
              className="button-secondary button-whatsapp"
              href={thanksHref}
              target="_blank"
              rel="noreferrer"
            >
              <WhatsAppGlyph />
              WhatsApp client
            </a>
          ) : submitted ? (
            <Button variant="whatsapp" disabled>
              <WhatsAppGlyph />
              WhatsApp client
            </Button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
