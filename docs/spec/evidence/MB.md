# MB evidence (mockups-v2)

Branch: `cursor/mb-trainee-workout-progress-c688`  
Visual target: `docs/spec/mockups-v2/png` @ 393×852  
Proof: mobile vitest **74** · api sync **5** · checkins **5** · meals **10** · openapi **3** · core whatsapp **4** (Node **22.23.3**) · Expo captures after `pnpm db:reset`

## Match vs mockup (honest)

| Screen | Match | Note |
|---|---|---|
| TR-07 Diet | **CLOSE** | H1 + week pill + daysum2 rings/bars + Today's meals + compact rows; due expanded mealc still varies by seed state |
| TR-07b Photo | **CLOSE** | Inline photop after confirm; confirm now writes prescription kcal |
| TR-08 Something different | **MATCH** | opt3 + grey ✕ + WhatsApp glyph Ask coach |
| TR-08b Portion | **CLOSE** | Sticky Save + totbar + unit labels; fraction glyphs may still show decimals for odd servings |
| TR-08c Ate out | **CLOSE** | Outline chips + sticky Save |
| TR-26 / 09 Food search | **CLOSE** | Capture opens food_search; search/log/sticky abar present |
| TR-10 Workout week | **CLOSE** | Week strip + navy hero + miss card (seed-dependent density) |
| TR-10b Day detail | **CLOSE** | Eyebrow + dstats + chips; sticky Start/Back bar |
| TR-11 Active | **CLOSE** | Accordion + previous + EDITED + log bar; polish vs 11 |
| TR-11b Rest | **CLOSE** | Rest band + next line + progress |
| TR-12 Summary | **CLOSE** | stat4 + avatar row; sticky Done via Screen footer |
| TR-13 Progress | **CLOSE** | Weight hero + chart + Log rows |
| TR-14 Check-in | **CLOSE** | 3-step chrome when due; reviewed shows **Acknowledged** |
| TR-15 Notifications | **CLOSE** | Opaque screen · Today/Earlier · settings row |
| TR-20 More | **CLOSE** | Profile + coach WhatsApp cards + icon rows |
| TR-02 Invite | **CLOSE** | Hero + Join {Coach} when invite preview loads (capture seeds Anita token) |
| TR-03 Intake | **CLOSE** | Stepper + radio/day pills (not bare boxes) |
| TR-04 Waiting | **CLOSE** | Timeline + WhatsApp outline |
| TR-05 Reminders | **CLOSE** | Radio time rows + Skip |
| TR-09 Meal plan | **CLOSE** | Training/Rest + tab bar kept |
| TR-18 Ask coach | **CLOSE** | Sheet + green bubble + WA glyph |
| TR-23 Unavailable | **CLOSE** | Icon + Tonight instead + CTA + tabs |

**Counts:** **1 MATCH · 21 CLOSE · 0 FAR** (vs prior QA 0 / 9 / 13). Remaining gaps are polish/seed density, not wrong structure.

## Behaviour fixes

| Item | Result |
|---|---|
| Sync first apply → `applied` (not already_applied) | PASS — `sync.test` green |
| Check-in CHECKIN_VERSION_CONFLICT stream | PASS — flush draft + refetch etag before submit |
| Trainer Acknowledged reaches trainee | PASS — inbox `checkin_reviewed` + Today card + Check-in screen |
| Scheduled check-in not fillable | PASS — “Next check-in {date}” only |
| Next-up at ~10:50 pm | PASS — most recent overdue; chips not “Later” after window |
| Confirm 0 kcal | PASS — compliance stores prescription macros |

## Test counts (Node ≥ 22.23)

- `@fitbud/mobile` vitest: **74** passed  
- `@fitbud/api` sync: **5** · checkins: **5** · meals: **10** · openapi: **3**  
- `@fitbud/core` whatsapp: **4**  
- mobile typecheck: green  
