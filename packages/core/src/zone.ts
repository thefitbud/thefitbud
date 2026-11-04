/**
 * IANA time zone resolution for engines with incomplete zone data.
 *
 * Hermes on Apple platforms has no zone data of its own: `PlatformIntlApple`
 * validates a `timeZone` option against `NSTimeZone.knownTimeZoneNames`, which
 * omits several canonical IANA names (notably `Asia/Kolkata`, for which Apple
 * lists only the legacy `Asia/Calcutta`). Passing such a name to
 * `Intl.DateTimeFormat` throws `RangeError: Incorrect timeZone information
 * provided`, which red-boxes the app.
 *   - https://github.com/facebook/hermes/issues/1100
 *   - https://github.com/facebook/hermes/issues/1607
 *   - https://github.com/facebook/hermes/pull/1611
 *
 * This module probes the requested name, then a narrow table of sourced
 * aliases that denote the same zone. It never substitutes a *different* zone:
 * if no candidate works, it throws `UnsupportedTimeZoneError`, which names the
 * zone, lists every candidate tried and quotes the engine's own reason. A
 * wrong-but-plausible date is worse than a named error (D-W3-12, D-W3-18).
 */

/**
 * Alias groups: names that denote the same zone, so swapping one for another
 * can never shift the displayed time.
 *
 * Every entry is a 1:1 link in the IANA tzdata `backward` file (canonical name
 * first, legacy name second), confirmed as an engine-acceptance workaround by
 * the Hermes reports above.
 *
 * - `Asia/Kolkata` / `Asia/Calcutta` — the confirmed crash. hermes#1100 (the
 *   maintainer confirms `Asia/Calcutta` is accepted where `Asia/Kolkata` is
 *   not) and date-fns/tz#32 (same error, same workaround).
 * - `UTC` / `Etc/UTC` / `Etc/GMT` / `GMT` — `Etc/UTC` and `Etc/GMT` are in
 *   hermes#1611's list of previously failing zones; Apple's
 *   `knownTimeZoneNames` carries the bare `UTC` and `GMT`. This matters here
 *   because `users.timezone` defaults to `UTC`.
 * - `Asia/Ho_Chi_Minh` / `Asia/Saigon`, `Asia/Kathmandu` / `Asia/Katmandu`,
 *   `Europe/Kyiv` / `Europe/Kiev` — tzdata `backward`; named in CU17's spec as
 *   the other 1:1 renames in hermes#1611's list.
 *
 * Deliberately narrow: an alias is only safe when both names are the same
 * zone. Do not add a "near enough" neighbour.
 */
const ALIAS_GROUPS: readonly (readonly string[])[] = [
  ["Asia/Kolkata", "Asia/Calcutta"],
  ["UTC", "Etc/UTC", "Etc/GMT", "GMT"],
  ["Asia/Ho_Chi_Minh", "Asia/Saigon"],
  ["Asia/Kathmandu", "Asia/Katmandu"],
  ["Europe/Kyiv", "Europe/Kiev"],
];

/**
 * The zone to display when the **device's own zone cannot be read at all**.
 *
 * **D-W3b-11, option (b), decided by Firoz, 4 Nov 2026:** "Trainer screens use
 * the device timezone. If the device zone can't be read, fall back to
 * `Asia/Kolkata` (our users are in India). Never show UTC. This fallback is an
 * explicit rule. An invalid or unsupported zone still shows an error that
 * names the zone."
 *
 * So this is a *chosen* rule, not a default anyone fell into, which is why it
 * is a named constant with this comment rather than an inline `||`. It is
 * India-first by decision: a trainer whose device zone is unreadable sees
 * Indian dates, which may be wrong for them.
 *
 * It applies to **one** case only — an unreadable device zone. A zone that is
 * present but cannot be resolved still throws `UnsupportedTimeZoneError`
 * naming the zone (D-W3-12, D-W3-18); this constant must never be used to
 * swallow that.
 */
export const FALLBACK_DISPLAY_TIME_ZONE = "Asia/Kolkata";

/**
 * The device's own IANA zone, for screens that display in the viewer's zone
 * (D-W3b-11 (b)).
 *
 * Returns `FALLBACK_DISPLAY_TIME_ZONE` only when the engine reports no usable
 * zone name — missing, blank, or the read itself throwing. The returned name
 * is **not** resolved here: callers format through the resolver as usual, so a
 * device that reports a name the engine cannot use still produces a named
 * error rather than a quietly substituted zone. On iOS the device zone often
 * reads back as the legacy `Asia/Calcutta`, which the alias table handles.
 */
export function deviceTimeZone(): string {
  let reported: unknown;
  try {
    // Narrow by construction: this catch covers the single act of *reading*
    // the device zone, which is the only trigger D-W3b-11 sanctions. No
    // resolution or formatting happens inside it, so it cannot hide an
    // unsupported-zone error.
    reported = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return FALLBACK_DISPLAY_TIME_ZONE;
  }
  if (typeof reported !== "string" || reported.trim() === "") {
    return FALLBACK_DISPLAY_TIME_ZONE;
  }
  return reported.trim();
}

/** Thrown when no candidate name for a zone is accepted by this engine. */
export class UnsupportedTimeZoneError extends RangeError {
  readonly timeZone: string;
  readonly tried: readonly string[];
  readonly engineMessage: string;

  constructor(timeZone: string, tried: readonly string[], engineMessage: string) {
    super(
      `Time zone "${timeZone}" is not supported on this device ` +
        `(tried: ${tried.join(", ")}). Engine said: ${engineMessage}`,
    );
    this.name = "UnsupportedTimeZoneError";
    this.timeZone = timeZone;
    this.tried = tried;
    this.engineMessage = engineMessage;
  }
}

/** Candidate names for a zone: the requested name first, then its aliases. */
export function timeZoneCandidates(timeZone: string): readonly string[] {
  const group = ALIAS_GROUPS.find((names) =>
    names.some((name) => name.toLowerCase() === timeZone.toLowerCase()),
  );
  if (!group) return [timeZone];
  return [timeZone, ...group.filter((name) => name !== timeZone)];
}

const resolved = new Map<string, string>();

/**
 * Clear the memoised resolutions. Needed when the engine's zone data can
 * change under us (tests that stub `Intl`); harmless otherwise.
 */
export function clearTimeZoneResolutionCache(): void {
  resolved.clear();
}

function engineAccepts(candidate: string): string | null {
  try {
    // Reading Intl off the global on every probe keeps this honest about the
    // engine actually in use rather than one captured at module load.
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(0);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * The name for `timeZone` that this engine accepts in an `Intl` `timeZone`
 * option: the requested name where possible, otherwise an alias for the very
 * same zone.
 *
 * @throws {UnsupportedTimeZoneError} when no candidate is accepted. Callers
 * must not swallow it: there is no correct date to show.
 */
export function resolveIntlTimeZone(timeZone: string): string {
  const requested = timeZone.trim();
  if (!requested) {
    throw new UnsupportedTimeZoneError(timeZone, [], "No time zone was given");
  }

  const cached = resolved.get(requested);
  if (cached !== undefined) return cached;

  const candidates = timeZoneCandidates(requested);
  const reasons: string[] = [];
  for (const candidate of candidates) {
    const reason = engineAccepts(candidate);
    if (reason === null) {
      resolved.set(requested, candidate);
      return candidate;
    }
    reasons.push(reason);
  }
  throw new UnsupportedTimeZoneError(
    requested,
    candidates,
    reasons[0] ?? "unknown reason",
  );
}

/**
 * The one place in `packages/core` that builds a zoned `Intl.DateTimeFormat`.
 * Pass options exactly as you would to `Intl.DateTimeFormat`; the `timeZone`
 * is resolved first.
 *
 * **Omitting `timeZone` entirely** keeps the engine's own default zone, which
 * is what a viewer-local formatter wants. **Passing a present but blank
 * `timeZone`** is a caller bug — a zone was meant to be supplied and was lost
 * — and throws, because answering from the device's zone would show a
 * trainee in India the phone's date with no error at all.
 */
export function zonedDateTimeFormat(
  locales: string | readonly string[],
  options: Intl.DateTimeFormatOptions = {},
): Intl.DateTimeFormat {
  const { timeZone, ...rest } = options;
  if (timeZone === undefined) {
    return new Intl.DateTimeFormat(locales as string | string[], rest);
  }
  return new Intl.DateTimeFormat(locales as string | string[], {
    ...rest,
    timeZone: resolveIntlTimeZone(timeZone),
  });
}
