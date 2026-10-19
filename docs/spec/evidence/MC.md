# MC evidence

Branch: `cursor/mc-trainee-settings-1568`  
Base: `cursor/mb-trainee-workout-progress-c688`  
Stack: API `:8787` + Expo web `:8081` (`EXPO_PUBLIC_SCREEN_CAPTURE=1`) · viewport 393×852, plus 360×800 for More and Reminders  
Set 6. Meal notifications are Open and Snooze 30 min only, with the FitBud app icon and no food names. Snooze fires once and waits until quiet hours end when that time falls inside them. The in-app banner is one line and opens that meal. The workout preview logs a set and advances to the next set. There is no rest timer. The Live Activity, Dynamic Island, lock screen, and Android notification need a dev build.

Tests this run: `@fitbud/mobile` typecheck green · mobile vitest 90. API, core, contracts, api-client, and trainer-web were not re-run (last counts 230, 126, 22, 7, 24).

## Summary counts

| Screen | PASS | FAIL | Total |
|---|---:|---:|---:|
| TR-16 | 7 | 3 | 10 |
| TR-17 | 3 | 2 | 5 |
| TR-19 | 3 | 4 | 7 |
| TR-20 | 4 | 3 | 7 |
| TR-21 | 3 | 3 | 6 |
| TR-22 | 4 | 4 | 8 |
| TR-24 | 5 | 2 | 7 |
| TR-25 | 5 | 2 | 7 |
| **Total** | **34** | **23** | **57** |

## TR-16 · Reminders

| ID | Result | Proof |
|---|---|---|
| TR-16.1 | FAIL | Switch click did not expose `aria-checked` on Expo web, so persist was not proven. |
| TR-16.2 | PASS | Copy uses 6:00 pm fallback and 40 min after meals (`TR-16.png`). Engine constants `WORKOUT_FALLBACK_ANCHOR` 18:00, `MEAL_REMINDER_AFTER_MINUTES` 40. |
| TR-16.3 | PASS | `TR-16--ishita-pushoff.png` — “Your coach has turned off workout reminders.” |
| TR-16.4 | PASS | Same shot — “Off in phone settings” and “Turn on in Settings”. Web does not treat missing browser push as off for Aarav. |
| TR-16.5 | PASS | “Using your plan's meal times” / Change on `TR-16.png`. Deepak shows “plan 1:00 pm” on `TR-24--deepak-dubai.png`. |
| TR-16.6 | FAIL | `wa_automation` is off, so opt-out cannot be exercised. |
| TR-16.7 | PASS | “WhatsApp reminders” / “Coming soon” on `TR-16.png`. |
| TR-16.8 | PASS | Farhan: “Meal reminders are paused until Mon 26 Oct” (`TR-16--farhan-paused.png`). Ishita differs. Aarav is “Notifications: On”. |
| TR-16.9 | PASS | Captured text has no banned-string hit. |
| TR-16.10 | FAIL | Loading, error, and offline were not each captured. |

## TR-17 · Quiet hours

| ID | Result | Proof |
|---|---|---|
| TR-17.1 | FAIL | Save was not clicked, so a new range was not proven to persist. |
| TR-17.2 | PASS | `packages/core/src/reminder.test.ts` quiet-hours cases. |
| TR-17.3 | PASS | Screen copy “FitBud never sends reminders after 10 pm.” Hard stop `22:00` in core. |
| TR-17.4 | PASS | `TR-17.png` uses 10:00 pm – 7:00 am. No banned-string hit. |
| TR-17.5 | FAIL | Error and offline were not captured. |

## TR-19 · Sync

| ID | Result | Proof |
|---|---|---|
| TR-19.1 | FAIL | `durableStore.test.ts` reopens an unsent meal log. A device reboot was not run. |
| TR-19.2 | FAIL | `indicatorFromCounts` covers four states in `outboxCopy.test.ts`. The capture only showed the quiet synced state. |
| TR-19.3 | PASS | `conflictCopy` in `outboxCopy.test.ts`. The screen had nothing failed (`TR-19.png`). |
| TR-19.4 | FAIL | Sign-out sheet was not opened. |
| TR-19.5 | PASS | `describeOutboxEntry` returns “Lunch · Eaten as planned · …”. |
| TR-19.6 | PASS | `TR-19.png` text has no banned-string hit. |
| TR-19.7 | FAIL | Offline and error were not captured. |

## TR-20 · More

| ID | Result | Proof |
|---|---|---|
| TR-20.1 | PASS | `TR-20.png` — name, coach, no ids, no dev copy. |
| TR-20.2 | FAIL | Every row was not clicked. |
| TR-20.3 | FAIL | Help mailto / copy sheet was not opened. |
| TR-20.4 | PASS | Aarav has no Past coaching row. |
| TR-20.5 | PASS | “We'll get back to you within a day.” sits on Help. |
| TR-20.6 | PASS | No banned-string hit. |
| TR-20.7 | FAIL | Error and offline were not captured. |

## TR-21 · Lock screen

Set 6 mockups 27, 27b, 27c, 27-android, 28, 28b, 29, and 29b are in `docs/spec/mockups-v2`. Meal notifications have no log action and no food names. The workout card has no rest timer.

| ID | Result | Proof |
|---|---|---|
| TR-21.1 | FAIL | `TR-21--rohan.png` shows “Next: Breakfast · 8:00 am”. That is an in-app preview. The home-screen widget needs a dev build. |
| TR-21.2 | PASS | Rohan, on the next-item widget: Eaten as planned, then “Saved on this phone.” (`TR-21--confirmed.png`). Same outbox path as Diet. Meal notifications and the in-app banner do not log. |
| TR-21.3 | FAIL | The preview shows set 2 of 3, Last 20 kg × 10, and 22.5 kg × 10, then after the check “Set 3 of 3 · Last: 22.5 kg × 10” and “Set 2 logged · 22.5 kg × 10” (`TR-21--live.png`, `TR-21--logged.png`). More weight then shows 25 kg (`TR-21--stepped.png`). No rest countdown, +30 s, or Skip. ActivityKit (`apps/mobile/targets/FitBudLiveActivity`, LiveActivityIntent) and the Android scaffold (`apps/mobile/targets/android/WorkoutSetNotification.kt`) need a dev build. iOS asks for Face ID on the first lock-screen tap and does not open the app. Expo web does not run them. |
| TR-21.4 | PASS | Captured text has no “placeholder” and no screen id. |
| TR-21.5 | PASS | Banned-string scan on the captured text was empty. |
| TR-21.6 | FAIL | Aarav empty state is “Nothing left today” (`TR-21.png`). Loading, error, offline, and signed-out were not captured. |

Rohan’s meal card is “Breakfast isn't logged yet” with Open and Snooze 30 min, and the expanded line is “Breakfast · 8:00 am” (`TR-21--rohan.png`). Open reaches “What did you have instead?” (`TR-21--meal-open.png`). The in-app banner is one line, “Breakfast isn't logged yet”, and Open Breakfast opens that meal (`TR-21--banner.png`). Snooze during Rohan’s quiet hours (10:00 pm – 6:30 am) said “Snoozed until quiet hours end.” The system re-send needs a dev build; Expo web only stores the follow-up time. `snoozeFireAt` covers the 30-minute case and the quiet-hours wait in `actions.test.ts`.

## TR-22 · Ended coaching

| ID | Result | Proof |
|---|---|---|
| TR-22.1 | PASS | `TR-22.png` has no meal or workout log actions. |
| TR-22.2 | PASS | “Coaching with Rahul Verma ended on Fri 9 Oct.” |
| TR-22.3 | FAIL | Past coaching was not opened. |
| TR-22.4 | FAIL | Restart coaching was not clicked. |
| TR-22.5 | FAIL | A new coach's workspace was not checked. |
| TR-22.6 | PASS | `TR-22--nikhil-reactivate.png` — “Rahul Verma wants to restart coaching with you”, Restart coaching, Not now. |
| TR-22.7 | PASS | No banned-string hit. |
| TR-22.8 | FAIL | Expired and error states were not captured. |

## TR-24 · Meal times

| ID | Result | Proof |
|---|---|---|
| TR-24.1 | PASS | Deepak lunch 2:30 pm, “Reminder about 3:10 pm” (`TR-24--deepak-dubai.png`). Engine reads the override before the plan time. |
| TR-24.2 | FAIL | Trainer activity and the custom-times indicator were not opened. |
| TR-24.3 | PASS | Reset to plan + Save removed Deepak's lunch override (local D1). Dinner weekdays 21:00 stayed. |
| TR-24.4 | PASS | Slots show Breakfast, Lunch, Snack, Dinner. The false “Snack after Dinner” error is gone. |
| TR-24.5 | PASS | Aarav has 4 title-cased meals (`TR-24.png`). |
| TR-24.6 | PASS | No banned-string hit. |
| TR-24.7 | FAIL | Offline and error were not captured. |

## TR-25 · Steps

Spike: **No-go**. Libraries are not installed, there is no EAS device, and the flag stays off.

| ID | Result | Proof |
|---|---|---|
| TR-25.1 | PASS | `StepsCard` renders nothing while the flag is off. Settings say the Today card stays hidden. |
| TR-25.2 | FAIL | No device grant. Spike is No-go. |
| TR-25.3 | PASS | This screen does not read or upload steps. |
| TR-25.4 | PASS | No-go recorded here. |
| TR-25.5 | PASS | `TR-25.png` says “Coming soon”. The flag name is not shown. |
| TR-25.6 | PASS | No banned-string hit. |
| TR-25.7 | FAIL | Only the coming-soon state was captured. |
