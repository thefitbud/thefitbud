import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5173";
const OUT = join(
  process.cwd(),
  "../../docs/implementation/screens/trainer-web",
);
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";

function hashFile(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: 30_000,
  });
}

async function loadSeed(page) {
  return page.evaluate(async () => {
    const token = sessionStorage.getItem("fitbud.trainer.accessToken");
    if (!token) throw new Error("No access token in session");
    const get = async (path) => {
      const res = await fetch(`/api${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(`${path} failed: ${JSON.stringify(json)}`);
      }
      return json.data ?? json;
    };
    const clients = (await get("/clients?limit=50")).items ?? [];
    const byName = (needle) =>
      clients.find((c) =>
        c.traineeDisplayName?.toLowerCase().includes(needle.toLowerCase()),
      );
    let workspaceRid = null;
    for (const client of clients) {
      if (!client.relationshipId) continue;
      try {
        await get(`/workspaces/relationships/${client.relationshipId}`);
        workspaceRid = client.relationshipId;
        break;
      } catch {
        /* try next client */
      }
    }
    const rohan = byName("rohan");
    const aarav = byName("aarav");
    const kavya = byName("kavya");
    const sneha = byName("sneha");
    const meera = byName("meera");
    const activeRid = workspaceRid ?? aarav?.relationshipId ?? rohan?.relationshipId ?? null;
    const attention = await get("/exceptions/attention?groupBy=relationship");
    let exceptionId = null;
    for (const group of attention.groups ?? []) {
      const item = group.items?.find((i) => i.status === "active" || i.status === "detected");
      if (item) {
        exceptionId = item.id;
        break;
      }
    }
    if (!exceptionId) {
      exceptionId = attention.groups?.[0]?.items?.[0]?.id ?? null;
    }
    const invites = (await get("/invitations")).items ?? [];
    const inviteId =
      invites.find((i) => i.status === "pending")?.id ?? null;
    async function findOrCreateDraft(rid, workoutTemplateId) {
      if (!rid) return null;
      const authHeaders = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      };
      const readDraft = async () => {
        const plans = (await get(`/plans/relationships/${rid}?limit=10`)).items ?? [];
        for (const row of plans) {
          let draft = row.versions?.find((v) => v.status === "draft");
          if (!draft) {
            const source = row.versions?.find(
              (v) => v.status === "published" || v.status === "effective",
            );
            if (source) {
              const created = await fetch(`/api/plans/${row.plan.id}/versions`, {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify({ sourceVersionId: source.id }),
              }).then((r) => r.json());
              const body = created.data ?? created;
              draft = body?.id ? { id: body.id, status: "draft" } : null;
            }
          }
          if (draft) {
            return {
              planId: row.plan.id,
              versionId: draft.id,
              rid,
            };
          }
        }
        return null;
      };
      let draft = await readDraft();
      if (!draft && workoutTemplateId) {
        await fetch(`/api/plans/relationships/${rid}/from-template`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ templateId: workoutTemplateId }),
        });
        draft = await readDraft();
      }
      return draft;
    }
    const workoutTemplates = await get("/templates?limit=10&templateType=workout");
    const templateId = workoutTemplates.items?.[0]?.id ?? null;
    let planEdit = null;
    let assignDraft = null;
    let planRid = null;
    const planCandidates = [
      aarav?.relationshipId,
      rohan?.relationshipId,
      workspaceRid,
    ].filter(Boolean);
    for (const rid of planCandidates) {
      try {
        const draft = await findOrCreateDraft(rid, templateId);
        if (draft) {
          assignDraft = draft;
          planEdit = draft;
          planRid = rid;
          break;
        }
      } catch {
        /* try next client */
      }
    }
    const inbox = await get("/checkins/inbox?view=submitted");
    const inboxItem = inbox.items?.[0] ?? null;
    const checkinId = inboxItem?.checkin?.id ?? null;
    const checkinRid = inboxItem?.coachingRelationshipId ?? workspaceRid;
    const dietTemplates = await get("/templates?limit=10&templateType=nutrition");
    const combinedTemplates = await get("/templates?limit=10&templateType=combined");
    const dietTemplateId = dietTemplates.items?.[0]?.id ?? null;
    const combinedTemplateId = combinedTemplates.items?.[0]?.id ?? null;
    const asks = await get("/coach-asks?status=open");
    const askId = asks.items?.[0]?.id ?? null;
    return {
      rohanRid: rohan?.relationshipId ?? null,
      activeRid,
      workspaceRid,
      kavyaRid: kavya?.relationshipId ?? null,
      snehaRid: sneha?.relationshipId ?? null,
      meeraRid: meera?.relationshipId ?? null,
      exceptionId,
      inviteId,
      planEdit,
      assignDraft,
      planRid,
      checkinId,
      checkinRid,
      templateId,
      dietTemplateId,
      combinedTemplateId,
      askId,
    };
  });
}

async function assertReady(page, testId, shotId) {
  if (testId !== "screen-TW-01" && page.url().includes("/sign-in")) {
    throw new Error(`${shotId}: landed on sign-in instead of ${testId}`);
  }
  const signInHeading = page.getByRole("heading", { name: /welcome back, coach/i });
  if (testId !== "screen-TW-01" && (await signInHeading.isVisible().catch(() => false))) {
    throw new Error(`${shotId}: sign-in heading visible`);
  }
  await page.getByTestId(testId).waitFor({ state: "visible", timeout: 45_000 });
}

async function captureShot(page, shotId, testId, prepare, options = {}) {
  if (prepare) await prepare(page);
  await assertReady(page, testId, shotId);
  const path = join(OUT, `${shotId}.png`);
  const target = page.getByTestId(testId);
  if (options.elementOnly) {
    await target.screenshot({ path });
  } else {
    await page.screenshot({ path, fullPage: true });
  }
  const bytes = await readFile(path);
  return { shotId, path, bytes, hash: hashFile(bytes), size: bytes.length };
}

function buildShots(seed) {
  const w = seed.workspaceRid;
  const p = seed.planRid ?? seed.assignDraft?.rid ?? w;
  const k = seed.kavyaRid;
  const s = seed.snehaRid;
  const assignRid = seed.assignDraft?.rid ?? p;
  return [
    {
      id: "TW-01",
      testId: "screen-TW-01",
      async run(page) {
        await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
      },
    },
    {
      id: "TW-02",
      testId: "screen-TW-02",
      async run(page) {
        await page.goto(`${BASE}/welcome?capture=welcome`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-03",
      testId: "screen-TW-03",
      async run(page) {
        await page.goto(`${BASE}/checkins`, { waitUntil: "domcontentloaded" });
      },
    },
    {
      id: "TW-04",
      testId: "screen-TW-04",
      async run(page) {
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      },
    },
    {
      id: "TW-05",
      testId: "screen-TW-05",
      async run(page) {
        if (!seed.exceptionId) throw new Error("TW-05: no exception in seed");
        await page.goto(`${BASE}/?exception=${seed.exceptionId}`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-06",
      testId: "screen-TW-06",
      async run(page) {
        await page.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
      },
    },
    {
      id: "TW-07",
      testId: "screen-TW-07",
      async run(page) {
        await page.goto(`${BASE}/clients/add`, { waitUntil: "domcontentloaded" });
      },
    },
    {
      id: "TW-08",
      testId: "screen-TW-08",
      async run(page) {
        if (!seed.inviteId) throw new Error("TW-08: no pending invitation");
        await page.goto(`${BASE}/invitations/${seed.inviteId}`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-09",
      testId: "screen-TW-09",
      async run(page) {
        if (!w) throw new Error("TW-09: no workspace client");
        await page.goto(`${BASE}/clients/${w}/overview`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-10",
      testId: "screen-TW-10",
      async run(page) {
        if (!s) throw new Error("TW-10: Sneha missing");
        await page.goto(`${BASE}/clients/${s}/onboarding`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-11",
      testId: "screen-TW-11",
      async run(page) {
        if (!w) throw new Error("TW-11: no workspace client");
        await page.goto(`${BASE}/clients/${w}/configure`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-12",
      testId: "screen-TW-12",
      async run(page) {
        if (!p) throw new Error("TW-12: no plan client");
        await page.goto(`${BASE}/clients/${p}/plan`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-13",
      testId: "screen-TW-13",
      async run(page) {
        if (!seed.templateId) throw new Error("TW-13: no workout template");
        await page.goto(`${BASE}/templates/workouts/${seed.templateId}`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-14",
      testId: "screen-TW-14",
      async run(page) {
        if (!seed.dietTemplateId) throw new Error("TW-14: no diet template");
        await page.goto(`${BASE}/templates/diets/${seed.dietTemplateId}`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-15",
      testId: "screen-TW-15",
      async run(page) {
        if (!p) throw new Error("TW-15: no plan client");
        await page.goto(`${BASE}/clients/${p}/plan`, {
          waitUntil: "domcontentloaded",
        });
        const effectiveView = page
          .getByRole("listitem")
          .filter({ hasText: /effective/i })
          .getByRole("button", { name: /^view$/i })
          .first();
        if (await effectiveView.isVisible().catch(() => false)) {
          await effectiveView.click();
        }
      },
    },
    {
      id: "TW-16",
      testId: "screen-TW-16",
      async run(page) {
        if (!assignRid || !seed.assignDraft) {
          throw new Error("TW-16: no draft for assign modal");
        }
        await page.goto(`${BASE}/clients/${assignRid}/plan?assign=1`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-17",
      testId: "screen-TW-17",
      async run(page) {
        if (!p) throw new Error("TW-17: no plan client");
        await page.goto(`${BASE}/clients/${p}/activity`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-18",
      testId: "screen-TW-18",
      async run(page) {
        if (!p) throw new Error("TW-18: no plan client");
        await page.goto(`${BASE}/clients/${p}/progress`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-19",
      testId: "screen-TW-19",
      async run(page) {
        if (!p) throw new Error("TW-19: no plan client");
        await page.goto(`${BASE}/clients/${p}/check-ins`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-20",
      testId: "screen-TW-20",
      async run(page) {
        if (!seed.checkinRid || !seed.checkinId) throw new Error("TW-20: no check-in");
        await page.goto(
          `${BASE}/clients/${seed.checkinRid}/check-ins/${seed.checkinId}`,
          {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-21",
      testId: "screen-TW-21",
      async run(page) {
        if (!p) throw new Error("TW-21: no plan client");
        await page.goto(`${BASE}/clients/${p}/history`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-22",
      testId: "screen-TW-22",
      async run(page) {
        await page.goto(`${BASE}/checkins`, { waitUntil: "domcontentloaded" });
      },
    },
    {
      id: "TW-23",
      testId: "screen-TW-23",
      async run(page) {
        await page.goto(`${BASE}/templates/workouts`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-24",
      testId: "screen-TW-24",
      async run(page) {
        await page.goto(`${BASE}/templates/onboarding`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-25",
      testId: "screen-TW-25",
      async run(page) {
        await page.goto(`${BASE}/templates/checkins`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-26",
      testId: "screen-TW-26",
      async run(page) {
        await page.goto(`${BASE}/templates/libraries`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-27",
      testId: "screen-TW-27",
      async run(page) {
        if (!seed.combinedTemplateId) throw new Error("TW-27: no combined template");
        await page.goto(
          `${BASE}/templates/full-plans/${seed.combinedTemplateId}`,
          {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-28",
      testId: "screen-TW-28",
      async run(page) {
        await page.goto(`${BASE}/settings/profile`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-29",
      testId: "screen-TW-29",
      async run(page) {
        await page.goto(`${BASE}/settings/notifications`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-30",
      testId: "screen-TW-30",
      async run(page) {
        await page.goto(`${BASE}/settings/ended`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-31",
      testId: "screen-TW-31",
      async run(page) {
        if (!w) throw new Error("TW-31: no workspace client");
        await page.goto(`${BASE}/clients/${w}/overview`, {
          waitUntil: "domcontentloaded",
        });
        const details = page.getByRole("button", { name: /^details$/i });
        if (await details.isVisible().catch(() => false)) {
          await details.click();
        } else {
          await page.getByLabel("More actions").click();
          await page
            .getByRole("button", { name: /reminder settings for this client/i })
            .click();
        }
      },
    },
    {
      id: "TW-32",
      testId: "screen-TW-32",
      async run(page) {
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
        if (seed.askId) {
          await page.goto(`${BASE}/?ask=${seed.askId}`, {
            waitUntil: "domcontentloaded",
          });
        }
      },
    },
    {
      id: "TW-33",
      testId: "screen-TW-33",
      async run(page) {
        await page.goto(`${BASE}/not-a-real-route`, {
          waitUntil: "domcontentloaded",
        });
      },
    },
    {
      id: "TW-34",
      testId: "screen-TW-34",
      async run(page) {
        if (!w) throw new Error("TW-34: no workspace client");
        await page.goto(`${BASE}/clients/${w}/overview`, {
          waitUntil: "domcontentloaded",
        });
        const addNote = page.getByRole("button", { name: /add note/i }).first();
        if (await addNote.isVisible().catch(() => false)) {
          await addNote.click();
        } else {
          await page.getByLabel("More actions").click();
          await page.getByRole("button", { name: /^add note$/i }).click();
        }
      },
    },
  ];
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const tw01 = await captureShot(page, "TW-01", "screen-TW-01", async (p) => {
    await p.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  });

  await signIn(page);
  const seed = await loadSeed(page);
  const shots = buildShots(seed);
  const results = [tw01];
  const hashes = new Map();

  for (const shot of shots) {
    if (shot.id === "TW-01") continue;
    await shot.run(page);
    const result = await captureShot(page, shot.id, shot.testId, undefined, {
      elementOnly: shot.id === "TW-03" || shot.id === "TW-15",
    });
    results.push(result);
  }

  for (const result of results) {
    const prev = hashes.get(result.hash);
    if (prev && prev !== result.shotId) {
      throw new Error(
        `Duplicate screenshot: ${result.shotId} matches ${prev} (${result.size} bytes)`,
      );
    }
    hashes.set(result.hash, result.shotId);
  }

  await writeFile(
    join(OUT, "manifest.json"),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        seed,
        files: results.map((r) => ({
          id: r.shotId,
          bytes: r.size,
          sha256: r.hash,
        })),
      },
      null,
      2,
    ),
  );
  await browser.close();
  console.log(
    "Captured",
    results.length,
    "screenshots;",
    [...new Set(results.map((r) => r.size))].length,
    "distinct sizes",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
