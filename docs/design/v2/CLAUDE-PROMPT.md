# Paste-ready prompt: FitBud mobile design v2, visual refinement

> Paste everything below the line into a new Claude session in the `thefitbud/thefitbud` repo on Firoz's PC. First unzip `fitbud-design-v2.zip` so that this folder sits at `docs/design/v2/`.

---

**Model:** use **Fable 5.2** as the design refiner and critic for this task. Record in the PR description which model you used and why: visual critique and refinement of existing mocks, not code.

**Task:** run a visual refinement pass on FitBud's v2 mobile mocks. Do it in the repo, on a new branch, and deliver it as one PR. **No app code** in this task, and **no new app builds**.

### 1. Set up
1. Create a branch `design/v2-refinement` from `main`.
2. Add the package as-is under `docs/design/v2/`, and commit it as the first commit ("docs(design): add v2 mobile mocks handoff"). Don't edit anything under `apps/` or `packages/`.

### 2. Read first, in this order
1. `docs/design/v2/WHY-NOT-SATISFIED.md`: what's wrong, and v2's known weaknesses. This is the brief.
2. `docs/design/v2/screen-profile.md`: every screen ID, its PNG and purpose, the open decisions and the deferred list.
3. `docs/design/v2/flows/flows.md` and `flows/index.md`, plus the sheets in `png/flows/`.
4. `docs/design/v2/DESIGN-SYSTEM.md`: the Honest Week logo (the v1 R2-B four-dot mark: three Navy dots and one open Coral ring; 2×2 app icon), its known risks, tokens, type and components. Its colours are provisional. Don't use the v2 strip wordmark in `assets/logo/not-chosen-v2-strip/`.
5. `docs/design/v2/NUDGE-AND-WHATSAPP.md`: Nudge is always a FitBud push; WhatsApp is only a redirect where it already exists.
6. `docs/design/v2/union-map.md` and `typography.md`.

### 3. The refinement pass
Go through **every mobile screen** in `png/trainee/` and `png/trainer/` (180). For each, improve:
- **Hierarchy:** a clear lead element per screen; use the type-scale contrast; one primary action.
- **Density:** fewer cards-per-row; grouped lists; tighter but still breathable (4 pt grid, 16 pt margins).
- **Alignment:** a consistent left edge, baselines, and number columns with tabular figures.
- **Iconography:** one Lucide family; propose an exercise thumbnail style. Draw our own art; never copy icons, fonts, logos or illustrations from other apps.
- **Illustration and imagery:** replace the placeholders (empty states, onboarding, progress photos) with a consistent, modest style that fits Honest Week.
- **Colour:** start from the current tokens and explore the three proposals in DESIGN-SYSTEM §3.4 with Firoz (all keep Navy #1A1248 and Coral #FF587D; Coral is never small text) on five anchor screens (TR-06a, W-03, TR-07a, TM-01a, TM-04b). Pick and record a direction. Then apply it via tokens only, and fix the four failing contrast tokens.
- **Polish and states:** pressed, disabled, loading, offline, locked, success and error. Draw the screen behind a sheet as the dimmed live screen. Numbers must fit with real data. Design the swipe reveal so it doesn't hide the set number. Fix the food-detail stepper/chip overlap and give the overdue check-in its own data.
- **Nudge sheet:** the preview title must read "{Coach} nudged you".
- **Brand in product:** use the mark's language in the week rows: filled dot = done, open ring = today (Coral), dash = rest, never red. Avoid anything that makes the dots look like a loader or pagination (DESIGN-SYSTEM §2).

**Constraints**
- Keep the screen IDs, the flows and the union-map rules (shared vs role-specific screens).
- Don't add features or duplicate screens. Anything that would delay MVP goes on the deferred list, not into the mocks.
- The deferred items stay deferred. In-person sessions, agenda and roll-call are "On hold, not mocked".
- Light mode and iOS frame are fine. Note anything Android-specific as a follow-up rather than drawing it.

### 4. Output (all inside `docs/design/v2/`)
- Refined PNGs under the **same IDs and file names**, in `png-refined/trainee/` and `png-refined/trainer/` (keep the originals for comparison). Use the same size (393×852 pt @3x), quantised to stay small.
- Updated `src/kit.css` tokens and components if you re-render with the kit. Otherwise ship your source files (HTML/CSS or SVG) under `src-refined/`.
- `CHANGELOG-refinement.md`: per screen (or per group of identical changes), say what changed and why, and list the decisions you made, including the chosen colour direction with its hex values and contrast ratios.
- Updated `DESIGN-SYSTEM.md` if any tokens or components changed, plus before/after contact sheets for each area.
- Open **one PR** to `main` titled "Design: v2 mobile visual refinement". The body should summarise the changes, the decisions, the model used and why, and the remaining weaknesses.

### 5. Standing rules
- **Decide and record; don't wait.** When something is ambiguous, pick the option that's best for MVP, write it in the changelog under "Decisions", and carry on. Collect anything that truly needs Firoz under "Questions for Firoz" in the PR.
- **Record the model used and why** in the PR and the changelog.
- **Be usage-cautious.** Work in batches by area, and re-render only what changed. **At 92% of your usage budget, stop and wrap up:** commit, push the branch, open or update the PR, and list what's left.
- **Never cancel GitHub Actions runs.**
- **No app code** (`apps/`, `packages/`) in this task, and **no new builds** (EAS, Xcode or Gradle).
- No credentials in files or the PR. Don't open credential pages.
- No Figma.
