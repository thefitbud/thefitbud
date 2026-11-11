import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronRight, PencilLine } from "lucide-react";
import { SECTION_STATUS_LABEL, type SectionStatus } from "./sectionStatus";

/** Done / To do / Editing: icon plus text, never colour alone. */
export function SectionBadge({ status }: { status: SectionStatus }) {
  return (
    <span
      className={`cs-section-badge is-${status}`}
      data-testid="configure-section-badge"
    >
      {status === "done" ? (
        <Check size={13} strokeWidth={2.4} aria-hidden="true" />
      ) : status === "editing" ? (
        <PencilLine size={13} strokeWidth={2.2} aria-hidden="true" />
      ) : null}
      {SECTION_STATUS_LABEL[status]}
    </span>
  );
}

/** One row of the Coaching setup list (frames 148/149). */
export function AccordionSection({
  id,
  title,
  summary,
  status,
  defaultOpen = false,
  forceOpen = false,
  children,
  error,
}: {
  id: string;
  title: string;
  summary: string;
  status?: SectionStatus;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  children: ReactNode;
  error?: string | null;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <details
      className={`configure-accordion${error ? " has-error" : ""}`}
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>
        <ChevronRight
          className="configure-accordion-chevron"
          size={18}
          strokeWidth={2}
          aria-hidden="true"
        />
        <span className="configure-accordion-title">{title}</span>
        <span className="configure-accordion-summary">{summary}</span>
        {status ? <SectionBadge status={status} /> : null}
      </summary>
      <div className="configure-accordion-body" id={id}>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {children}
      </div>
    </details>
  );
}
