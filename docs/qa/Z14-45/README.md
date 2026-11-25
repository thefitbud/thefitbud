# Z14-45: Submit intake works

No layout change, so no screenshots. Device steps for FitBud UI or Firoz on the next staging build (iOS and Android). A submitted intake can't be undone on staging: use the onboarding persona once per reseed, or a freshly invited test client.

1. Sign in as `vikram.onboarding@demo.fitbud.test`. The app opens Intake ("Getting to know you").
2. Answer the required questions on all five steps. Tap **Next** between steps.
3. On the last step tap **Submit intake**. Expect: the button shows its spinner, then the "waiting for your coach" screen. No bare "Loading…" page.
4. Fully close and relaunch the app. Expect: still the waiting screen, not Intake.
5. Required check (fresh reseed): leave a required question empty on an earlier step, go to the last step and tap **Submit intake**. Expect: the app jumps to that step and shows "Answer this question to continue." under the question. Nothing is sent.
6. Offline check: turn on airplane mode, tap **Submit intake**. Expect: "You're offline. We'll retry when you're back." stays on screen and the button still reads **Submit intake**. Turn airplane mode off and tap again: the intake is sent.

Automated: `apps/mobile/src/screens/IntakeScreen.submit.render.test.tsx` (real API client against a fake server that enforces the draft version).
