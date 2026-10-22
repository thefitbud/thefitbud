import { ForbiddenState } from "../components/StatePanels";

/** TW-33 forbidden / no-access surface for another trainer's client. */
export function ForbiddenPage() {
  return (
    <main className="centered-status" data-testid="screen-TW-33-forbidden">
      <ForbiddenState />
    </main>
  );
}
