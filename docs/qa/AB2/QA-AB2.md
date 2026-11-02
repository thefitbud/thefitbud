# QA-AB2 — Android crash on the invalid `accessibilityRole` value `main`

**Task:** [AB2](../../specs/AB2.md) · **Batch:** [W3](../../specs/batches/W3.md) · **Date:** 2 Nov 2026
**Verdict:** PASS (automated). Device check is Firoz's, below.

## The bug, re-derived on `main` @ e4d9003

- `apps/mobile/src/components/Screen.tsx:68` was `accessibilityRole={"main" as "summary"}`.
- `BaseViewManager.java:327` calls `AccessibilityRole.fromValue(...)`, which **throws**
  `IllegalArgumentException("Invalid accessibility role value: " + value)` at
  `ReactAccessibilityDelegate.java:307` for any value outside its 39-constant enum. `main` is not
  in it, so every `Screen`-based view fails to be created.
- The `role` prop takes a different path: `BaseViewManager.java:478` calls the **`@Nullable`**
  `Role.fromValue` (`ReactAccessibilityDelegate.java:170`), which returns `null` at :174 instead of
  throwing — and `MAIN` is in that enum anyway.
- Typing confirms the same split in `react-native@0.76.9`
  (`Libraries/Components/View/ViewAccessibility.d.ts`): the `Role` union contains `'main'` (:367);
  the `AccessibilityRole` union does not. **So the fix needs no cast.**

### Audit of every `accessibilityRole` in `apps/mobile/src` and `packages/*/src`

242 usages. button 177, header 39, text 4, tab 4, summary 4, radio 4, tablist 3, switch 2,
progressbar 1, checkbox 1, alert 1, **main 1**, plus one expression
`tappable ? "button" : "text"` (`apps/mobile/src/trainer/ClientsTab.tsx:252`, both valid).
**`main` was the only invalid value.** No bare JSX `role=` props. No `accessibilityRole` in any
`.ts` file, and `ui-mobile` is the only package that uses it. This matches the spec's audit exactly.

## The fix

`accessibilityRole={"main" as "summary"}` → `role="main"`, cast and stale comment removed.
Not mapped to `summary`, which would change what TalkBack announces for the whole screen.

## Guard test — red then green

`apps/mobile/src/components/accessibilityRole.test.ts`.

**Red**, against `Screen.tsx` exactly as it was on `main`:

```
 ❯ src/components/accessibilityRole.test.ts (3 tests | 1 failed)
   × uses no value outside the React Native 0.76 Android AccessibilityRole set
     → apps/mobile/src/components/Screen.tsx:68 uses accessibilityRole value "main", which React
       Native throws on when Android creates the view (Invalid accessibility role value: main).
       Expression: {"main" as "summary"}. Web/ARIA landmark roles belong on the `role` prop instead.

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```

**Green**, after the fix (4 cases after hardening, see below):

```
 ✓ src/components/accessibilityRole.test.ts (4 tests) 4ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

The test also reads `enum AccessibilityRole` out of
`react-native/ReactAndroid/src/main/java/.../ReactAccessibilityDelegate.java` in `node_modules`
(it ships in the npm package) and asserts the hard-coded 39-value list still matches it, so an RN
bump that changes the set fails loudly. This was clean, so it is included rather than skipped.

## Evasion testing — the scanner's real boundary

A scratch file with ten ways of hiding a bad value was run through the scanner. First pass,
**three got through**: a value held in a `const` elsewhere in the file, a template literal
`` `main` ``, and anything built without a literal (`parts.join(sep)`). Two were "caught" only by
accident — `"ma" + "in"` flagged as `ma`/`in`, and `parts.join("")` flagged on the empty string.

Two changes closed the gap:

1. The literal regex now accepts backticks, so plain template literals resolve.
2. A new case, **"resolves every accessibilityRole value to a string literal"**, fails on any
   occurrence whose value is not a plain literal. That converts the silent `const` / `.join()` /
   computed-value escape into a loud failure telling the author to inline the literal or move a
   web landmark to `role`.

**A later fresh review found four more evasions, all now closed.** They are recorded here because
the first version of this document claimed more than the test delivered:

| Evasion | Was | Now |
|---|---|---|
| `accessibilityRole={IMPORTED as "summary"}` | **passed** — the cast's own valid literal satisfied the check | flagged |
| `accessibilityRole={cond ? ROLE : "text"}` | **passed** — one valid literal anywhere satisfied it | flagged |
| `{ accessibilityRole: ROLE }` in an object literal | **passed** — a bare identifier was skipped before any check | flagged |
| `<View {...{ ["accessibilityRole"]: "main" }} />` | **passed** — a computed key did not match the pattern | flagged |

The first is the one that mattered: an unresolvable value wearing an `as "<valid role>"` cast is
**exactly the shape of the bug this file guards against**. The cause was that the catch-all keyed
on the expression containing *zero* literals rather than on every **value position** being a
literal. It now drops `as`/`satisfies` type annotations (the asserted type is not the value) and
splits a ternary into its two branches, ignoring the condition — so
`tappable ? "button" : "text"` still passes while `cond ? ROLE : "text"` does not.

Closing it surfaced a further weakness: the scan matched `accessibilityRole` **inside comments**,
including the explanatory comment in `Screen.tsx` ending "not an Android accessibilityRole:".
Comments are now blanked before matching (strings are not, so a computed key keeps its name).

**What still gets through, honestly:**

- **A value crossing a module boundary.** `accessibilityRole={props.role}` is flagged at the
  forwarding site, but the scanner never resolves the value itself and a reviewer must.
- **`.ts` files are not scanned**, only `.tsx` in `apps/mobile/src` and `packages/ui-mobile/src`
  (the spec's scope). There are no `accessibilityRole` occurrences in any `.ts` file today, so the
  hole is empty, but a props object built in a `.ts` helper would miss the scan.
- **`"ma" + "in"` fails for the wrong reason** — the message names the fragments, not `main`.
- It is a text scan, not a type check: it cannot see through a third-party component that renames
  the prop. An ESLint rule on the JSX attribute would close the `.ts` and cross-module cases at
  lint level; suggested as a follow-up.

This is a guard, not a proof. It pins the one class of bug that caused AB2 and makes the
unresolvable cases loud rather than silent.

## Web DOM — acceptance criterion 2

`expo start --web` on 8099 (`CI=1 BROWSER=none EXPO_NO_TELEMETRY=1`), with the API on 8788 and
`EXPO_PUBLIC_API_BASE_URL` pointed at it so Metro's `/__fitbud_api` proxy resolves (the BT3b
recipe). Playwright 1.64.1, Chromium 1243, 393×852, `deviceScaleFactor: 2`. Sign-in →
"Sign in with a code instead" reaches `CodeSignInScreen`, which renders `Screen`, without auth.

```html
<main role="main" class="css-view-175oi2r r-flexGrow-16y2uox">
```

One `main` element, containing "Sign in with a code / We'll send a 6-digit code to your email. /
Email / WhatsApp / Coming soon / Mobile number or email / Send code / Use password instead".
The screen title still renders as `<h1>Sign in with a code</h1>`, so heading semantics are
unchanged. No `accessibilityRole` attribute leaks into the DOM.

Screenshot: `01-codesignin-web-main-393x852.png`. No visual change (Satoshi falls back —
`api.fontshare.com` is blocked by the egress proxy — so judge layout, not letterforms).

## Checks

| Check | Result |
|---|---|
| `pnpm build:packages` | 7/7 |
| `pnpm lint` | 17/17 tasks |
| `pnpm typecheck` | 17/17 tasks (mobile ran fresh — `role="main"` type-checks with no cast) |
| `npx turbo run test --force` | 17/17 tasks, 193 files, **1,583 tests passed** |

Per package: api 87 files / 792, mobile 44 / **386** (+4, this test), trainer-web 33 / 212,
core 25 / 133, api-client 1 / 30, contracts 1 / 23, tokens 2 / 7.

Not run: Android build or device render (`eas build` is a remote command — not for agents), iOS
(on hold), trainer-web e2e (unaffected; no trainer-web file changed).

## Device checklist for Firoz (Android dev build, staging)

- [ ] Sign-in → "Sign in with a code instead" renders with no red screen.
- [ ] An OTP can be requested from that screen.
- [ ] After sign-in, trainee **Today**, **Workout**, **Diet**, **Progress** tabs all render.
- [ ] Trainer **Attention**, **Clients**, **Check-ins**, **More** tabs all render.
- [ ] TalkBack still reads the screen title as a heading.
