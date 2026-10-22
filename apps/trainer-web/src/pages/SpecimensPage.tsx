import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "../components/Button";
import { OverflowMenu } from "../components/OverflowMenu";
import { StatusChip } from "../components/StatusChip";
import { BrandMark } from "../components/BrandMark";

/**
 * Dev-only specimens for Batch 0 evidence captures (real components, not HTML mocks).
 * Route: /__specimens
 */
export function SpecimensPage() {
  return (
    <div className="specimens-page" data-testid="screen-B0-specimens">
      <section id="type" className="specimen-block">
        <h1 className="specimen-display">FitBud display 28</h1>
        <p className="specimen-semi">Satoshi 600 · actions</p>
        <p className="specimen-body">Body 16 — Progress, guided.</p>
      </section>

      <section id="buttons" className="specimen-block">
        <h2>Buttons</h2>
        <div className="specimen-row">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="tinted">Tinted</Button>
          <Button variant="tertiary">Tertiary</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="whatsapp">WhatsApp</Button>
          <OverflowMenu
            items={[
              { id: "one", label: "Mark reviewed", onSelect: () => undefined },
              { id: "two", label: "Open client", onSelect: () => undefined },
            ]}
          />
        </div>
      </section>

      <section id="chips" className="specimen-block">
        <h2>StatusChip</h2>
        <div className="specimen-row">
          <StatusChip kind="severity" value="critical" />
          <StatusChip kind="severity" value="attention" />
          <StatusChip kind="adherence" value="on_track" />
          <StatusChip kind="checkin" value="submitted" />
          <span className="status-chip status-chip-info">
            <AlertTriangle size={14} aria-hidden />
            <span>Info tone</span>
          </span>
          <span className="status-chip status-chip-positive">
            <CheckCircle2 size={14} aria-hidden />
            <span>Positive</span>
          </span>
        </div>
      </section>

      <section id="logo" className="specimen-block">
        <h2>Honest Week mark</h2>
        <div className="specimen-row">
          <span className="brand-glyph" aria-hidden="true">
            <BrandMark size={32} variant="inverse" />
          </span>
          <BrandMark size={32} />
        </div>
      </section>
    </div>
  );
}
