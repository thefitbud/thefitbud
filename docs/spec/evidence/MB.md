# MB evidence (mockups-v2)

Branch: `cursor/mb-trainee-workout-progress-c688`  
Visual target: `docs/spec/mockups-v2/png` @ 393×852  
Proof: mobile vitest **74** · api vitest **228** (Node **22.23.3**) · clock-frozen demo-seed / batch-0 / read-models

Prior live QA (20 Oct): **5 MATCH · 15 CLOSE · 2 FAR**. This round closed the listed behaviour gaps + FAR structure; ratings below are code-verified vs mockups-v2 (no new browser sheet this pass).

## Match vs mockup (honest)

| Screen | Match | Note |
|---|---|---|
| TR-07 Diet | **CLOSE** | Due + “Something different” one meta line; 50/50 Eaten / Something different; ⋯ header; seed still drives which meal is expanded |
| TR-07b Photo | **CLOSE** | Compact ✓ Eaten as planned + photop below |
| TR-08 Something different | **MATCH** | opt3 + grey ✕ + WhatsApp Ask coach |
| TR-08b Portion | **CLOSE** | Per-food kcal (no ×qty double-count); sticky totbar+Save; stepper qty+unit; odd fractions may still decimal |
| TR-08c Ate out | **CLOSE** | Outline chips + sticky Save |
| TR-26 / 09 Food search | **CLOSE** | Plan browse before typing; clear ✕; sticky kcal+Save; unit in stepper; one-line names |
| TR-10 Workout week | **CLOSE** | Miss card “workouts weren't logged · Log it” when week has ✕ |
| TR-10b Day detail | **CLOSE** | Real overview: back+⋯, 3 stats (singular “exercise”), coach note, chips/cues, sticky Start |
| TR-11 Active | **CLOSE** | Accordion + previous + log bar |
| TR-11b Rest | **CLOSE** | Next line + progress; mid-workout footer; Finish only after final set |
| TR-12 Summary | **CLOSE** | Eyebrow workout·date; Changed card; week dots; RV initials; purple sticky Done |
| TR-13 Progress | **CLOSE** | Single Progress+bell; check-in rows with weight; Rohan weight series seeded (86.4 kg latest) |
| TR-14 Check-in | **CLOSE** | step 1 of 3 + Due; measurements+photos step1; waist stepper; photo tiles; draft saved line |
| TR-15 Notifications | **CLOSE** | Today group; per-type icons; ✓ Already logged; review → Acknowledged + relative time |
| TR-20 More | **CLOSE** | One More title; meal count; quiet hours 12h |
| TR-02 Invite | **CLOSE** | Mobile + locked Email + Create password; Sign out removed |
| TR-03 Intake | **CLOSE** | Radio cards, day pills, sleep stepper, Yes/No; Back + Saved chip |
| TR-04 Waiting | **CLOSE** | Hi {first}; joined + intake submittedAt; WA glyph + green outline button |
| TR-05 Reminders | **CLOSE** | Radio time rows + Skip |
| TR-09 Meal plan | **CLOSE** | Portion column (“1 plate”) |
| TR-18 Ask coach | **CLOSE** | Preview one short link |
| TR-23 Unavailable | **CLOSE** | Go to Today pinned above tab bar |

**Counts:** **1 MATCH · 21 CLOSE · 0 FAR** (live QA was 5/15/2; FARs closed in code — not re-sheeted). Remaining gaps are polish/seed density.

## Behaviour fixes

| Item | Result |
|---|---|
| No CHECKIN_VERSION_CONFLICT loop / sync 500 | **PASS** — submit skips saveDraft race; sync pre-check insert; conflict on already-submitted → success |
| After trainer review → Today “Next check-in …” | **PASS** — `pickTodayCheckin` prefers scheduled over reviewed |
| Diet next-up at night never “due now” early | **PASS** — `mealDueStatusLabel` countdown / clock before window |
| Review notif time + Acknowledged | **PASS** — Just now/Today relative; outcome Acknowledged |
| Demo / batch-0 / read-models clock-independent | **PASS** — frozen `2026-10-19T14:30:00.000Z` + fake timers |

## Test counts (Node ≥ 22.23)

- `@fitbud/mobile` vitest: **74** passed  
- `@fitbud/api` vitest: **228** passed (46 files)  
- typecheck mobile + api: green  
