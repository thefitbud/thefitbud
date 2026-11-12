import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDemoSeedSql } from "./build.js";
import { PERSONA_CONFIGS } from "./generator/personas.js";
import { legacyTimezoneFor } from "./history.js";
import { loadDemoLibraryIndex } from "./personas.js";
import { createMemoryDb, type MemoryDbHandle } from "../../test-support/memory-db.js";
import { evaluateRelationshipExceptions } from "../../domain/exceptions.js";

/**
 * Task QS6: persona overlays (history.ts) find their meal / workout slot in the
 * client's real timezone, the one buildAssignmentsAndLogs builds the windows in
 * and build.ts writes to users.timezone, never in a hard-coded zone. The shipped
 * personas live in IST and Dubai, where an "Asia/Kolkata" or "Asia/Dubai"
 * literal happens to be right, so this in-memory variant moves the slot-overlay
 * clients to other zones: Arjun (skipped lunch + missed workout), Neha and Tanvi
 * to New York, Deepak (skipped workout) to Los Angeles (west of both literals, so
 * a slot computed in IST or Dubai closes before the real one). An overlay that still computes
 * its slot in a literal zone logs or asks outside the item's real window, or
 * raises an exception on a window that has not closed. The configs are restored
 * afterwards.
 */
const VARIANTS: Record<string, string> = {
  "arjun.attention@demo.fitbud.test": "America/New_York",
  "neha.attention@demo.fitbud.test": "America/New_York",
  "tanvi.attention@demo.fitbud.test": "America/New_York",
  "deepak.dubai@demo.fitbud.test": "America/Los_Angeles",
};
const INSTANTS = [
  "2026-10-22T12:37:00.000Z",
  "2026-10-22T21:06:00.000Z",
  "2026-10-20T03:31:00.000Z",
  "2026-10-25T14:30:00.000Z",
  "2026-10-26T00:30:00.000Z",
];

const originals = new Map<string, string>();
beforeAll(() => {
  for (const [email, timezone] of Object.entries(VARIANTS)) {
    const cfg = PERSONA_CONFIGS.find((p) => p.email === email);
    if (!cfg) throw new Error(`no persona ${email}`);
    originals.set(email, cfg.timezone);
    cfg.timezone = timezone;
  }
});
afterAll(() => {
  for (const [email, timezone] of originals) {
    PERSONA_CONFIGS.find((p) => p.email === email)!.timezone = timezone;
  }
});

const emails = Object.keys(VARIANTS);
const inEmails = `(${emails.map((e) => `'${e}'`).join(", ")})`;
const OWNED = `(select r.id from coaching_relationships r join user_identities i on i.user_id = r.trainee_user_id where i.email in ${inEmails})`;

describe.each(INSTANTS)("demo seed overlays with clients moved out of IST / Dubai at %s", (now) => {
  let handle: MemoryDbHandle;
  const q = (sql: string) => handle.sqlite.exec(sql)[0]?.values ?? [];
  const rows = (sql: string) => q(sql).map((r) => r.map(String).join(" | "));

  beforeAll(async () => {
    handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
    handle.sqlite.exec(buildDemoSeedSql({ referenceInstant: now, passwordHash: "qs6-tz-test-hash", libraryIndex }));
  }, 60_000);

  afterAll(() => handle?.close());

  it("uses the moved zone everywhere (users.timezone, legacyTimezoneFor)", () => {
    for (const [email, timezone] of Object.entries(VARIANTS)) {
      expect(legacyTimezoneFor(email)).toBe(timezone);
      expect(rows(`select u.timezone from users u join user_identities i on i.user_id = u.id where i.email = '${email}'`)).toEqual([timezone]);
    }
  });

  it("logs skips inside the item's real window", () => {
    const logs = `
      select 'meal_compliance' as tbl, c.id, c.outcome as what, m.window_starts_at as opens, m.window_ends_at as closes, c.logged_at as at
        from meal_compliance c join meal_assignments m on m.id = c.assignment_id where c.coaching_relationship_id in ${OWNED}
      union all select 'workout_executions', x.id, x.status, w.window_starts_at, w.window_ends_at, x.started_at
        from workout_executions x join workout_assignments w on w.id = x.assignment_id where x.coaching_relationship_id in ${OWNED}`;
    expect(rows(`select * from (${logs}) where at < opens or at > '${now}'`)).toEqual([]);
    expect(rows(`select * from (${logs}) where what = 'skipped' and at > closes`)).toEqual([]);
    // Not vacuous: the overlays' skipped lunches (Arjun, Neha, Tanvi) and Deepak's skipped workout are there.
    expect(Number(q(`select count(*) from (${logs}) where what = 'skipped' and tbl = 'meal_compliance'`)[0]?.[0])).toBeGreaterThanOrEqual(3);
    expect(Number(q(`select count(*) from (${logs}) where what = 'skipped' and tbl = 'workout_executions'`)[0]?.[0])).toBeGreaterThanOrEqual(1);
  });

  it("raises skipped / missed exceptions only on closed windows of real items", () => {
    const items = `select e.id, e.type, e.detected_at, coalesce(m.window_ends_at, w.window_ends_at) as closes, coalesce(m.id, w.id) as item
      from exceptions e
      left join meal_assignments m on e.source_entity_type = 'meal_assignment' and m.id = e.source_entity_id
      left join workout_assignments w on e.source_entity_type = 'workout_assignment' and w.id = e.source_entity_id
      where e.status <> 'resolved' and e.coaching_relationship_id in ${OWNED}
        and e.type in ('overdue_meal', 'skipped_meal', 'missed_workout', 'skipped_workout')`;
    expect(rows(`select * from (${items}) where item is null or closes >= '${now}' or detected_at < closes or detected_at > '${now}'`)).toEqual([]);
    expect(Number(q(`select count(*) from (${items})`)[0]?.[0])).toBeGreaterThanOrEqual(4);
  });

  it("first coach read creates, resolves and changes nothing", async () => {
    const tableBefore = rows("select * from exceptions order by id");
    const created: string[] = [];
    const resolved: string[] = [];
    let activated = 0;
    for (const [rel, name] of q(`select r.id, coalesce(u.display_name, r.id) from coaching_relationships r
        left join trainee_profiles u on u.user_id = r.trainee_user_id where r.status = 'active' order by r.id`)) {
      const known = new Set(rows(`select id from exceptions where coaching_relationship_id = '${String(rel)}'`));
      const result = await evaluateRelationshipExceptions(handle.db, String(rel), now);
      for (const exception of result.exceptions) {
        if (!known.has(exception.id)) created.push(`${String(name)}: ${exception.type} ${exception.sourceEntityId}`);
      }
      for (const exception of result.resolvedExceptions) resolved.push(`${String(name)}: ${exception.type} ${exception.sourceEntityId}`);
      activated += result.activated;
    }
    expect(created).toEqual([]);
    expect(resolved).toEqual([]);
    expect(activated).toBe(0);
    expect(rows("select * from exceptions order by id")).toEqual(tableBefore);
  }, 60_000);
});

describe("overlay slot timezone (QS6)", () => {
  it("never hands an overlay slot finder a zone of its own", () => {
    const source = readFileSync(new URL("./history.ts", import.meta.url), "utf8");
    const calls = source.match(/slotsFor\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(5);
    expect(calls.filter((call) => call.includes(","))).toEqual([]);
    expect(source).not.toMatch(/overlaySlotFinder\(\{[^}]*timezone/);
  });
});

/**
 * Z11-4: close minus 30 minutes, derived independently of the seed. For an IST
 * client and a New York client, the reference instant is the local close of that
 * day's lunch (plan local time + 12 h, read in the client's own zone) minus 30
 * minutes, and the seed runs at that instant. The seeded window must close at
 * exactly that local clock time, and the item is still open: no exception on it
 * at seed time or when evaluated at the reference instant. Forcing the windows
 * into IST moves the New York client's close by hours and fails.
 */
function zonedInstant(localDate: string, hhmm: string, zone: string): number {
  // Find the instant whose clock in `zone` reads localDate hhmm (no DST edge on these dates).
  const target = Date.parse(`${localDate}T${hhmm}:00.000Z`);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: zone, dateStyle: "short", timeStyle: "short", hourCycle: "h23" });
  const clock = (ms: number) => fmt.format(new Date(ms)).replace(",", "");
  let guess = target;
  for (let i = 0; i < 3; i += 1) {
    const [d, t] = clock(guess).split(" ");
    const shown = Date.parse(`${d}T${t}:00.000Z`);
    guess += target - shown;
  }
  return guess;
}

describe("close minus 30 minutes in two zones (Z11-4)", () => {
  const PROBE_NOW = "2026-10-22T12:37:00.000Z";
  const LOCAL_DATE = "2026-10-20";
  const CASES = [
    { email: "pooja.silent@demo.fitbud.test", zone: "Asia/Kolkata" },
    { email: "arjun.attention@demo.fitbud.test", zone: "America/New_York" },
  ];
  const seed = async (referenceInstant: string) => {
    const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    handle.sqlite.exec(buildDemoSeedSql({ referenceInstant, passwordHash: "z11-4-tz-test-hash", libraryIndex: loadDemoLibraryIndex(handle.sqlite) }));
    return handle;
  };
  const lunchOf = (handle: MemoryDbHandle, email: string, localDate: string) =>
    handle.sqlite.exec(
      `select m.id, m.coaching_relationship_id, m.window_starts_at, m.window_ends_at, m.meal_prescription_json
         from meal_assignments m join coaching_relationships r on r.id = m.coaching_relationship_id
         join user_identities i on i.user_id = r.trainee_user_id
         where i.email = '${email}' and r.status = 'active' and m.local_date = '${localDate}' and m.meal_name like 'Lunch%'`,
    )[0]?.values[0];

  it("covers an IST and a non-IST client", () => {
    expect(CASES.map((c) => c.zone)).toEqual(["Asia/Kolkata", "America/New_York"]);
  });

  it.each(CASES)("closes at the local clock time and is open at close - 30 min for $email ($zone)", async ({ email, zone }) => {
    // 1. The plan's lunch local time, from a probe seed.
    const probe = await seed(PROBE_NOW);
    let lunchTime: string;
    try {
      expect(probe.sqlite.exec(`select u.timezone from users u join user_identities i on i.user_id = u.id where i.email = '${email}'`)[0]?.values[0]?.[0]).toBe(zone);
      const row = lunchOf(probe, email, LOCAL_DATE);
      expect(row, "a lunch assignment on the probe date").toBeDefined();
      const json = JSON.parse(String(row![4])) as { localTime?: string };
      lunchTime = json.localTime ?? "";
      expect(lunchTime).toMatch(/^\d\d:\d\d$/);
    } finally {
      probe.close();
    }
    // 2. Expected close and reference instant, computed here in the client's zone.
    const opens = zonedInstant(LOCAL_DATE, lunchTime, zone);
    const closes = opens + 12 * 3_600_000;
    const reference = new Date(closes - 30 * 60_000).toISOString();
    // 3. Seed at that instant.
    const handle = await seed(reference);
    try {
      const row = lunchOf(handle, email, LOCAL_DATE);
      expect(row, "a lunch assignment on the local date").toBeDefined();
      const [id, rel, startsAt, endsAt] = row!.map(String);
      expect(startsAt).toBe(new Date(opens).toISOString());
      expect(endsAt).toBe(new Date(closes).toISOString());
      expect(reference > startsAt! && reference < endsAt!).toBe(true);
      const onItem = (sourceId: string | undefined) => handle.sqlite.exec(`select type, status from exceptions where source_entity_id = '${sourceId}'`)[0]?.values ?? [];
      expect(onItem(id)).toEqual([]);
      const during = await evaluateRelationshipExceptions(handle.db, rel!, reference);
      expect(during.exceptions.filter((e) => e.sourceEntityId === id)).toEqual([]);
      expect(onItem(id)).toEqual([]);
    } finally {
      handle.close();
    }
  }, 120_000);
});
