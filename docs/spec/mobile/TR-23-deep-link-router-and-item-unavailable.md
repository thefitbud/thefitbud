# TR-23 · Deep-link router and "item unavailable"

**ID:** TR-23 · **Name:** Deep-link router and "item unavailable" · **Priority:** P0 · **Route/screen:** — · **Batch:** M-4 (see `../BATCHES.md`)

**Files to touch:**
- `src/navigation/linking.ts` [new]
- `apps/mobile/src/notifications/routing.ts` (exists: old code. Rebuild it to the target; do not patch it)
- `pages/GoResolver.tsx` [new]
- `apps/mobile/src/trainee/DeepLinkUnavailableScreen.tsx` (exists)
- `apps/trainer-web/src/pages/GoResolverPage.tsx` (exists)

**API (from the guide):** API-NEW `GET /links/resolve?kind=&id=` returning `{role, route, available, reason?}`

**Code status:** the guide says "New-proposed" (no code, or only partial code). Build it to the target. If you find code already in the repo, treat it as unverified legacy.

**Read first:** `../00-foundations.md` · `../01-product-rules.md` · `../02-navigation.md` (routes, IA) · `../03-api-changes.md` · `../04-flows.md` (§3.5) · `../05-notifications.md` · `../09-demo-data.md`

---

## (b) Guide section (verbatim)

> **Read every line of this section.** Item 3, **"Legacy (do not keep)"**, describes the OLD UI that you must **REPLACE**. Never preserve or restyle it. Item 4, **"Gaps to close"**, lists what's wrong. The target is item 5 onward. Copied from FitBud UI/UX Implementation Guide v1.2 (retired 30 Oct 2026; this file is now the source). Changes: the misleading "Status" label is dropped, two subsections are renamed. Old image embeds were removed on 30 Oct 2026; the visual target is the locked frames in `docs/design/` (see section (c)). Nothing else is changed.

<!-- BEGIN VERBATIM TR-23 -->
### TR-23 · Deep-link router and "item unavailable"

> **Priority:** P0 · **Files:** `src/navigation/linking.ts` [new] (replacing tab-only `src/notifications/routing.ts`), web `pages/GoResolver.tsx` [new] · **API:** API-NEW `GET /links/resolve?kind=&id=` returning `{role, route, available, reason?}`

1. **Purpose.** Every push, WhatsApp link and widget tap opens the **exact** screen (D3).
2. **Entry.** Notification taps and actions, `https://{appHost}/go/{kind}/{id}`, `fitbud://…`, widget taps.
3. **Legacy (do not keep).** `routing.ts` maps a payload to a tab only, and `TraineeShell` special-cases check-ins.
4. **Gaps to close.** No exact routing. No unavailable state. No https links.
5. **Target design.**
   - **Resolution:**
     - The app receives a URL or payload, then parses `{kind, id}`.
     - With no session, it goes to TR-01 and then resumes.
     - Otherwise it resolves locally from the cache, falling back to the API.
     - It routes by role: trainee to their screen, trainer to the TM screen or the web workspace.
   - **Unavailable screen:** "This item isn't available anymore", with the reason (replaced by a plan update, coaching ended, or not your account) and *Go to Today*.
   - **Expired reminder taps:** opening a meal reminder after the meal is logged shows the meal with "Already logged ✓". No error.
   - **Dated routes:** `/today/:date` opens TR-06 on that date. Past dates are read-only plus late logging (D23), and future dates are a preview. `/meal/:id` opens the meal's own date.
6. **States.** Resolving: a 300 ms spinner before navigating.
7. **Edge cases.**
   - A trainer tapping a trainee link (shared by mistake) for a client they don't own: Forbidden.
   - Dual-role users: prompt to switch role.
8. **Deep links.** The full mapping is in §3.5.
9. **References.**
   - React Navigation deep linking [R46] https://reactnavigation.org/docs/deep-linking/
   - Expo linking overview [R61] https://docs.expo.dev/linking/overview
   - Expo notifications [R61] https://docs.expo.dev/versions/latest/sdk/notifications
10. **UX decisions.** https links work everywhere (WhatsApp, SMS, email). The app scheme stays as the internal fallback (`app.json` `scheme: "fitbud"`).
11. **Implementation.**
    - Configure Android App Links (`assetlinks.json`) and iOS Universal Links (`apple-app-site-association`) on `{appHost}` (OQ-2).
    - Serve the `/go/*` web route from trainer-web (it resolves for trainers and shows an "Open in app" page for trainees on desktop).
    - Push payloads carry `{notificationId, notificationType, domainEntityType, domainEntityId, createdAt}` (the existing safe payload), and the client maps them to a route with the same table.
12. **Acceptance criteria.**
    - [ ] Every notification type in §4 opens its documented screen (an automated test per type).
    - [ ] WhatsApp links open the app when installed.
    - [ ] The unavailable state is covered.
13. **Priority:** P0.
<!-- END VERBATIM TR-23 -->

---

## (c) Design frames

The old Figma reference images and 18 Oct build captures were removed on 30 Oct 2026. The only visual target is the locked frames in [`docs/design/`](../../design/README.md): find this screen's frames in the README's screen index and build to them. Where text in (b) describes layout that a locked frame changes, the frame wins; content rules in [01-product-rules](../01-product-rules.md) and [banned-strings.json](../banned-strings.json) still apply. If a screen or state has no locked frame, stop and ask for design; never invent it.

## (d) Acceptance checks (verifiable)

Every check needs a PASS or FAIL line in your report, citing a screenshot in `docs/spec/evidence/`. Cite checks by ID (e.g. `TR-23.3`). Where a QA check restates a guide criterion, both must pass. A check you can't prove is FAIL, not ✅.

1. **TR-23.1** [guide §12] Every notification type in §4 opens its documented screen (an automated test per type).
2. **TR-23.2** [guide §12] WhatsApp links open the app when installed.
3. **TR-23.3** [guide §12] The unavailable state is covered.
4. **TR-23.4** [product rule] The banned-strings check (01-product-rules.md §B) finds no match on this screen in any captured state.
5. **TR-23.5** [guide §1.1 DoD] Loading, empty, error, offline and partial states exist as specified in "States" (one evidence screenshot per state, or a named test).

## (e) Observed in 18 Oct QA

These failures were seen on branch `cursor/stage1-foundation-a3da` @ `7f74108`. Fix every one, and prove the fix in the checks above.

- Mobile QA index: "Link unavailable" renders; fine.

## (f) Demo state to verify

Local stack: web http://localhost:5173 (proxies `/api` to http://127.0.0.1:8787). Expo web runs on :8081 with `EXPO_PUBLIC_SCREEN_CAPTURE=1`. Every demo password is `FitBud-demo-2026`. Reset with `pnpm db:reset` (stop the API first). See `../09-demo-data.md` for all IDs.

- Account **aarav.ontrack@demo.fitbud.test** · route `overlay deep_link (unavailable)` · 18 Oct capture `fitbud-mobile-shots/ios/TR-23-deep-link-unavailable.png`

## (g) Viewport for evidence

**393×852** (iPhone 15 profile, Expo web or a device). Save it as `docs/spec/evidence/TR-23.png`. Save extra states as `docs/spec/evidence/TR-23--<state>.png` (e.g. `--empty`, `--error`, `--offline`).

