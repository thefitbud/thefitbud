# Why Firoz isn't satisfied with the designs yet

This is an honest record, so the refinement pass fixes the right things and doesn't repeat old mistakes.

## 1. What went wrong before v2

**It looked like a prototype, not a shipping app.** The first HTML frames and the Figma Starter test read as wireframes with colour: flat white cards, default spacing, no visual rhythm, and none of the finish of the apps people compare us to (Hevy, MyFitnessPal, Everfit). Nobody would have mistaken them for a serious product.

**The old mocks were inconsistent.**
- Two fonts mixed on the same screens (Satoshi for display and Inter for UI, applied unevenly).
- Two different tab bars and two demo datasets, so screens didn't connect into one story.
- Uneven spacing and alignment between screens: margins, row heights and card padding drifted.
- Real overflow bugs carried into the design: the Diet ring number ("1,771") overflowed the ring, and the macro labels ("Protein 104 of 102 g") wrapped onto two lines.

**The type hierarchy was flat.** Sizes were too close together (titles, row text and numbers within a couple of points of each other), one display font was used everywhere, so nothing led the eye. There was too much padding, and almost every row sat in its own card, which made screens long, heavy and slow to scan.

**Coverage was thin.** At first only the workout flow was designed. Many buttons had no destination screen at all (no edit, delete, error, offline, empty or success states), so engineering had to guess.

**The benchmark was wrong.** The early reference set came from App Store marketing screenshots, which are staged and retouched, not real in-app screens. Type sizes and density were measured from marketing art. v1's type study re-measured real in-app captures (see `typography.md`).

## 2. What the device test on 13 Nov showed

Firoz tested the trainee iOS dev build (Aarav, demo seed). The findings are code bugs, but several are design-visible and show where the frames were vague:

1. **Progress tab looked broken:** a dev error toast from duplicate keys (two weigh-ins on one day), a duplicated "Progress" title under the status bar, a chart marker label clipped off the left edge, repeated "Oct Oct Oct" axis labels, and a spinner that made it feel like it never loaded.
2. **Offline showed a full-screen "Something went wrong (AUTH-NET)"** instead of the cached screen with "Saved on phone". Cold start offline isn't built.
3. **Start workout crashed** (keep-awake module resolution), so workout logging couldn't be tested on a device.
4. **Every bottom sheet on iOS appeared over a blank grey page** instead of the dimmed live screen.
5. **"Ate out" and "Changed the portion" did nothing** (the sheet's sub-screen collapsed to zero height).
6. **Workout done said "3 of 3" but showed two ticks**, and showed "1 min".
7. **The Live Activity showed "0 kg × 0" and "Next: set 1 of 3"** with no exercise name.
8. **Diet:** ring number overflow, macro wrap, and "Closed · can't be changed now" shown next to a "Change" button.
9. **Active workout UX gaps against the frames:** you couldn't finish or leave early, there was no ⋯ menu, no Skip set, no undo or edit of a logged set, and no moving between exercises. There was no haptic at the end of rest, "How to do it" opened Ask coach, and Pause sat where Back is expected.
10. **Food search "+" gave no feedback:** the added line appeared off-screen, there was no pressed or added state, a double tap added twice, and result rows weren't tappable.

The lesson for design: every state has to be drawn (pressed, added, locked, offline, the screen behind a sheet), numbers have to fit at real sizes with real data, and the frames have to be specific enough that engineering can't guess wrong.

## 3. Where v2 is: okayish

v2 fixes **structure and coverage**:
- one font (Inter) with a measured scale, one tab bar per role, and one dataset;
- the overflow checks (clip, offscreen, wrap, overlap) pass on every screen;
- 180 screens cover onboarding to sign out for trainee and coach, including empty, loading, offline, error, locked and success states;
- 27 flows were walked tap by tap, with 0 unresolved taps across 1,541 tappable elements.

It **still needs a real visual-design pass.** It looks tidy, not crafted: the hierarchy is correct but plain, the colour is functional, there's no illustration or imagery, and there's no motion. It doesn't yet feel like a premium coaching product.

## 4. Known weaknesses of v2

- **Placeholder photos and illustrations:** progress photos, check-in photos, empty states and onboarding use flat placeholders.
- **Generic exercise icons:** one dumbbell-style icon per exercise; no exercise thumbnails or media.
- **Static swipe and motion:** swipe actions are shown as frozen half-swiped rows; no transitions, rest-timer animation or haptic notes beyond text.
- **Light mode only**, and **iOS frame only** (no Android status bar, back gesture or Material differences).
- **The tap check is heuristic:** it matches elements by text and class against rules, not real behaviour. A tap under a dimmed sheet is counted as a tap on the screen beneath.
- **Approximate tap rings on flow sheets:** icon taps fall back to the first matching icon, so some red rings sit on the wrong button.
- **22 variant or state screens aren't walked by any flow**; they're reachable only through the tap map.
- **Food detail:** the quantity stepper and the unit chips (katori, piece, cup, grams) sit too close and visually overlap at the default size.
- **The overdue check-in reuses numbers** from the on-time check-in (same measurements and answers), so it doesn't read as a different week.
- **The swipe state on a set row hides the set number**, so you can't tell which set you're acting on.
- In 16 flow steps the tap lands somewhere other than the next thumbnail (marked "lands on …" in `flows/flows.md`).
- Times in the mocks are fixed demo values.
