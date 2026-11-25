import {
  AlertCircle,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  LayoutGrid,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  User,
  Utensils,
} from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState, OfflineBanner } from "../components/ui/ErrorState";
import { Checkbox, Field, Radio, SelectField, TextInput } from "../components/ui/Field";
import type { ReactNode } from "react";
import { LibraryThumb } from "../components/ui/LibraryThumb";
import { LoadingState } from "../components/ui/LoadingState";
import { LogoLockup } from "../components/ui/LogoLockup";
import { Pill } from "../components/ui/Pill";
import { Seg } from "../components/ui/Seg";
import { Tabs } from "../components/ui/Tabs";
import { Toast } from "../components/ui/Toast";
import { Toggle } from "../components/ui/Toggle";

/**
 * Dev-only specimen for the v3 web kit. Route /__ds, not in the nav.
 * Layout follows W-00. Food and exercise rows keep the live coloured tile.
 */
export function DesignSystemPage() {
  const [range, setRange] = useState("6wk");
  const [tab, setTab] = useState("all");
  const [visible, setVisible] = useState(true);
  const [unchecked, setUnchecked] = useState(false);
  const [nudge, setNudge] = useState<"push" | "note">("push");
  const [reminders, setReminders] = useState(true);
  const [off, setOff] = useState(false);

  return (
    <div className="ds-sheet" data-testid="screen-W-00">
      <div className="ds-sheet-inner">
        <div className="ds-head">
          <LogoLockup />
          <span className="ui-t-meta">Trainer web kit v3-web · light only · 18 Nov 2026</span>
        </div>
        <p className="ui-t-meta ds-lead">
          Every control below is a shared component. No browser-default select, checkbox, radio, date or
          fieldset anywhere in the app.
        </p>
        <div className="ds-cols">
          <section className="ui-card ds-section">
            <div className="ui-card-h">
              <h2>Type scale</h2>
              <span className="ui-t-meta">8 steps, Inter, tabular digits</span>
            </div>
            <TypeRow label="KPI 28/32 · 600" sample={<span className="ui-t-kpi">64.2 kg</span>} />
            <TypeRow label="Title 24/32 · 600" sample={<span className="ui-t-title">Ananya Bose</span>} />
            <TypeRow label="Modal title 20/28 · 600" sample={<span className="ui-t-modal">Use template for a client</span>} />
            <TypeRow label="Card title 17/24 · 600" sample={<span className="ui-t-h2">This week</span>} />
            <TypeRow label="Row / label 14/20 · 600" sample={<span className="ui-t-h3">Beginner home · no equipment</span>} />
            <TypeRow label="Body 14/20 · 400" sample={<span className="ui-t-body">Lower A on Tue was not logged.</span>} />
            <TypeRow label="Meta 13/18 · 400 ink3" sample={<span className="ui-t-meta">Workout · 3 days a week</span>} />
            <TypeRow label="Caption 12/16 · 500" sample={<span className="ui-t-cap">Published · axis · table head</span>} />
          </section>

          <section className="ui-card ds-section">
            <div className="ui-card-h">
              <h2>Buttons</h2>
              <span className="ui-t-meta">one primary per view; never coral, never periwinkle</span>
            </div>
            <div className="ds-row">
              <Button>
                <Plus className="ui-i" strokeWidth={1.75} aria-hidden /> New template
              </Button>
              <Button variant="secondary">Cancel</Button>
              <Button variant="quiet">Review</Button>
              <Button variant="ghost">Show all</Button>
              <Button variant="secondary" icon aria-label="More actions">
                <MoreHorizontal className="ui-i" strokeWidth={1.75} aria-hidden />
              </Button>
            </div>
            <div className="ds-row">
              <Button variant="danger">End coaching</Button>
              <Button variant="danger-quiet">Revoke invite</Button>
              <Button disabled>Saving…</Button>
              <Button size="sm">Small 32</Button>
              <Button size="lg">Large 44</Button>
            </div>
          </section>

          <section className="ui-card ds-section">
            <div className="ui-card-h">
              <h2>Segmented control · chips · tabs</h2>
              <span className="ui-t-meta">segment = one value; chip = filter; tab = section</span>
            </div>
            <div className="ds-row">
              <Seg
                aria-label="Range"
                value={range}
                onChange={setRange}
                options={[
                  { value: "6wk", label: "6 wk" },
                  { value: "3mo", label: "3 mo" },
                  { value: "all", label: "All" },
                ]}
              />
              <Chip>
                Owner <b>Anyone</b>
                <ChevronDown className="ui-i" strokeWidth={1.75} aria-hidden />
              </Chip>
              <Chip selected>
                <Check className="ui-i" strokeWidth={1.75} aria-hidden /> Missed
              </Chip>
              <Chip>Pending</Chip>
            </div>
            <Tabs
              aria-label="Template types"
              value={tab}
              onChange={setTab}
              items={[
                { id: "all", label: "All", count: 14 },
                { id: "workouts", label: "Workouts", count: 7 },
                { id: "checkins", label: "Check-ins", count: 1 },
              ]}
            />
          </section>

          <section className="ui-card ds-section">
            <div className="ui-card-h">
              <h2>Form fields</h2>
              <span className="ui-t-meta">36 px desktop, 44 px iPad; toggle on = green (done)</span>
            </div>
            <div className="ds-fields">
              <Field label="Template name" help="Clients see this name.">
                <TextInput aria-label="Template name" value="Strength foundations" />
              </Field>
              <Field label="Client">
                <SelectField aria-label="Client" open chevron={<ChevronUp className="ui-i" strokeWidth={1.75} aria-hidden />}>
                  <span className="ui-av is-sm ui-av1">AB</span>
                  Ananya Bose
                </SelectField>
              </Field>
              <Field label="Starts">
                <SelectField aria-label="Starts" chevron={<ChevronDown className="ui-i" strokeWidth={1.75} aria-hidden />}>
                  <Calendar className="ui-i" strokeWidth={1.75} aria-hidden />
                  Mon 23 Nov
                </SelectField>
              </Field>
              <Field label="Search">
                <TextInput
                  aria-label="Search"
                  value="Ana"
                  focused
                  caret
                  icon={<Search className="ui-i" strokeWidth={1.75} aria-hidden />}
                />
              </Field>
            </div>
            <div className="ds-controls ds-row" style={{ marginTop: 16 }}>
              <Checkbox checked={visible} onChange={setVisible}>
                Visible to client
              </Checkbox>
              <Checkbox checked={unchecked} onChange={setUnchecked}>
                Unchecked
              </Checkbox>
              <Radio checked={nudge === "push"} onChange={() => setNudge("push")}>
                Push reminder
              </Radio>
              <Radio checked={nudge === "note"} onChange={() => setNudge("note")}>
                Note only
              </Radio>
              <Toggle checked={reminders} onChange={setReminders}>
                Reminders on
              </Toggle>
              <Toggle checked={off} onChange={setOff}>
                Off
              </Toggle>
            </div>
          </section>

          <section className="ui-card ds-section">
            <div className="ui-card-h">
              <h2>Status pills</h2>
              <span className="ui-t-meta">semantic tint + ink; coral only for due/today</span>
            </div>
            <div className="ds-row">
              <Pill tone="done" icon={<Check className="ui-i" strokeWidth={2} aria-hidden />}>
                Published
              </Pill>
              <Pill tone="neutral" icon={<Pencil className="ui-i" strokeWidth={2} aria-hidden />}>
                Draft
              </Pill>
              <Pill tone="crit" icon={<AlertCircle className="ui-i" strokeWidth={2} aria-hidden />}>
                Critical
              </Pill>
              <Pill tone="warn">Off plan</Pill>
              <Pill tone="info" icon={<ListChecks className="ui-i" strokeWidth={2} aria-hidden />}>
                To review
              </Pill>
              <Pill tone="coach" icon={<User className="ui-i" strokeWidth={2} aria-hidden />}>
                You
              </Pill>
              <Pill tone="due">Due now</Pill>
            </div>
          </section>

          <section className="ui-card ds-section">
            <div className="ui-card-h">
              <h2>Thumbnails · avatars</h2>
            </div>
            <div className="ds-row">
              <span className="ui-thumb">
                <Dumbbell className="ui-i" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="ui-thumb">
                <Utensils className="ui-i" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="ui-thumb">
                <ListChecks className="ui-i" strokeWidth={1.75} aria-hidden />
              </span>
              <LibraryThumb name="Poha" kind="food" />
              <LibraryThumb name="Goblet squat" kind="exercise" />
              <span className="ui-t-meta">Poha · Goblet squat: coloured tile from the name</span>
            </div>
            <div className="ds-row">
              <span className="ui-av ui-av1">AB</span>
              <span className="ui-av ui-av2">RM</span>
              <span className="ui-av ui-av3">DN</span>
              <span className="ui-av ui-av4">SK</span>
              <span className="ui-av ui-av5">PI</span>
              <span className="ui-av ui-av6">VK</span>
              <span className="ui-av ui-av-coach">RV</span>
              <span className="ui-av-stack">
                <span className="ui-av is-sm ui-av1">AB</span>
                <span className="ui-av is-sm ui-av4">DN</span>
                <span className="ui-av is-sm ui-av3">SK</span>
              </span>
            </div>
          </section>

          <section className="ui-card ds-section">
            <div className="ui-card-h">
              <h2>Toast · banner · empty · loading</h2>
            </div>
            <div className="ds-row">
              <Toast inline message="Review saved" actionLabel="Undo" />
            </div>
            <div style={{ marginBottom: 10 }}>
              <OfflineBanner>You’re offline. Changes will save when you’re back.</OfflineBanner>
            </div>
            <div style={{ marginBottom: 10 }}>
              <ErrorState onRetry={() => undefined}>Couldn’t load check-ins. Your data is safe.</ErrorState>
            </div>
            <div className="ds-split">
              <EmptyState
                icon={<LayoutGrid className="ui-i" strokeWidth={1.75} aria-hidden />}
                title="No templates of your own yet"
                meta="Copy a FitBud base to start."
              />
              <LoadingState />
            </div>
          </section>

          <section className="ui-card ds-section">
            <div className="ui-card-h">
              <h2>Modal vs side panel</h2>
            </div>
            <div className="ds-split">
              <div className="ds-diagram">
                <div className="ds-modal-stage">
                  <i />
                </div>
                <b className="ui-t-h3">Centred modal · 560 / 720</b>
                <span className="ui-t-meta">
                  From a detail page or for one decision: exception review on a client, Use template, confirm.
                </span>
              </div>
              <div className="ds-diagram">
                <div className="ds-panel-stage">
                  <div className="ds-rows">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <i />
                </div>
                <b className="ui-t-h3">Side panel · 540</b>
                <span className="ui-t-meta">
                  Only when opened from a list that stays useful: Home queue, Check-ins inbox, Activity.
                </span>
              </div>
            </div>
          </section>

          <section className="ui-card ds-section">
            <div className="ui-card-h">
              <h2>Charts</h2>
            </div>
            <div className="ds-charts">
              <div>
                <div className="ui-bar" style={{ marginBottom: 8 }}>
                  <i style={{ width: "65%" }} />
                </div>
                <div className="ui-bar">
                  <i style={{ width: "40%", background: "var(--carbs)" }} />
                </div>
                <p className="ui-t-meta" style={{ marginTop: 8 }}>
                  Bars: brand on fill; macros protein / carbs / fat
                </p>
              </div>
              <p className="ui-t-meta">
                Line 2 px brand, area fill, 1 px line gridlines, axis 12/16 ink3, goal = 1.5 px dashed coach,
                last point 4.5 px ring. Caption is a sentence (“Last weigh-in Sun 15 Nov”), never a raw
                timestamp.
              </p>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

function TypeRow({ label, sample }: { label: string; sample: ReactNode }) {
  return (
    <div className="ds-type-row">
      <span className="ui-t-cap ui-ink3">{label}</span>
      {sample}
    </div>
  );
}
