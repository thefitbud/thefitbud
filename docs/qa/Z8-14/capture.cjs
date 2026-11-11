// Z8-14 QA capture (LOCAL demo seed only, never remote).
// Usage, with the API and trainer web already running on the demo seed:
//   node docs/qa/Z8-14/capture.cjs <trainer-web dir> <web url> <out dir> <photos dir>
// Local-only fixtures, all written through the API the apps use (no SQL):
//   - four placeholder progress photos for Rohan Mehta (synthetic silhouettes, made
//     for this capture), uploaded as the trainer through POST /files/upload-targets,
//     PUT /files/:id/content, POST /files/:id/confirm and
//     POST /progress/relationships/:id/entries (the demo seed has no photos);
//   - Harpreet Singh (coaching ready, no data) gets an active coaching setup that
//     pins the keyed global v2 check-in form (PUT .../draft, POST .../activate) and a
//     scheduled next check-in on that form (POST /checkins/relationships/:id/schedule),
//     so the empty state shows the form's questions as "No entries";
//   - then two weigh-ins for her through POST /progress/relationships/:id/measurements,
//     captured after her empty state.
// The by-reps capture uses Ananya Bose as seeded; the ratings compare uses Siddharth
// Jain after fixture-ratings.sql (applied before this script).
const { createRequire } = require("node:module");
const path = require("node:path");
const fs = require("node:fs");
const [, , webDir, webUrl, outDir, photosDir] = process.argv;
const req = createRequire(path.join(path.resolve(webDir), "package.json"));
const { chromium } = req("@playwright/test");

const VIEWPORTS = [
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [768, 1024],
];
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const want = (name) => !ONLY || ONLY.includes(name);

async function api(page, method, url, body, extraHeaders = {}) {
  return page.evaluate(
    async ({ method, url, body, extraHeaders }) => {
      const token = sessionStorage.getItem("fitbud.trainer.accessToken");
      const headers = {
        authorization: `Bearer ${token}`,
        "x-fitbud-role": "trainer",
        ...extraHeaders,
      };
      let payload;
      if (body && body.base64) {
        payload = Uint8Array.from(atob(body.base64), (c) => c.charCodeAt(0));
        headers["content-type"] = "image/png";
      } else if (body) {
        payload = JSON.stringify(body);
        headers["content-type"] = "application/json";
      }
      if (method !== "GET" && method !== "PUT") {
        headers["idempotency-key"] = crypto.randomUUID();
      }
      const res = await fetch(`/api${url}`, { method, headers, body: payload });
      const text = await res.text();
      if (!res.ok) throw new Error(`${method} ${url} ${res.status} ${text.slice(0, 300)}`);
      const json = text ? JSON.parse(text) : null;
      return json && typeof json === "object" && "data" in json ? json.data : json;
    },
    { method, url, body, extraHeaders },
  );
}

// Demo seed relationship ids are deterministic (demoUuid).
const REL = {
  "Rohan Mehta": "c422296e-ed7b-4196-a2b4-647096af3002",
  Kavya: "b9f01670-8acc-45f6-adab-d7728bca88a6",
  Harpreet: "519b5b84-c1bf-4bf3-ab4f-3cbb71e12f84",
  Siddharth: "8f0e3518-8945-4289-83ec-782cabefdcb5",
  Ananya: "f52b6b44-9724-4eb3-abd9-a251ec00adb0",
};
async function relationshipId(_page, name) {
  return REL[name];
}

async function openProgress(page, relId) {
  await page.goto(`${webUrl}/clients/${relId}/progress`);
  await page.locator(".pg-layout:not([data-testid])").first().waitFor({ timeout: 45000 });
  await page.waitForTimeout(700);
}

async function shoot(page, name, setup) {
  for (const [w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    await setup();
    await page.screenshot({ path: path.join(outDir, `${name}-${w}x${h}.png`) });
  }
}

async function shoot1440(page, name, setup) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup();
  await page.screenshot({ path: path.join(outDir, `${name}-1440x900.png`) });
}

async function uploadPhotos(page, relId, dates) {
  for (let i = 0; i < dates.length; i += 1) {
    const bytes = fs.readFileSync(path.join(photosDir, `photo${i + 1}.png`));
    const target = await api(page, "POST", "/files/upload-targets", {
      coachingRelationshipId: relId,
      mediaType: "progress_photo",
      contentType: "image/png",
      byteSize: bytes.length,
      originalFilename: `progress-${i + 1}.png`,
    });
    const id = target.mediaAsset.id;
    await api(page, "PUT", `/files/${id}/content`, { base64: bytes.toString("base64") });
    await api(page, "POST", `/files/${id}/confirm`, { byteSize: bytes.length, contentType: "image/png" });
    await api(page, "POST", `/progress/relationships/${relId}/entries`, {
      entryType: "progress_photo",
      observedAt: dates[i],
      mediaAssetId: id,
    });
  }
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${webUrl}/sign-in`);
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill("rahul.coach@demo.fitbud.test");
  await page.locator('input[name="password"]').fill("FitBud-demo-2026");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/sign-in"), { timeout: 45000 });

  const rohan = await relationshipId(page, "Rohan Mehta");
  const kavya = await relationshipId(page, "Kavya");
  const harpreet = await relationshipId(page, "Harpreet");
  console.log({ rohan, kavya, harpreet });

  // 160: default weight view; 160d compare; 160e workouts (1440 only).
  if (want("160")) {
    await shoot1440(page, "160-trainer-web-progress-v3-web", () => openProgress(page, rohan));
    await shoot1440(page, "160d-trainer-web-progress-compare-v3-web", async () => {
      await openProgress(page, rohan);
      await page.getByRole("button", { name: /Compare with/ }).click();
      await page.locator("#pg-compare-list button").first().click();
      await page.waitForTimeout(800);
    });
    await shoot1440(page, "160e-trainer-web-progress-workouts-v3-web", async () => {
      await openProgress(page, rohan);
      await page.getByRole("tab", { name: /Exercise progress/ }).click();
      await page.waitForTimeout(800);
    });
  }

  // 160e by reps: a bodyweight lift charted by reps (D-W8-7).
  if (want("reps")) {
    const ananya = await relationshipId(page, "Ananya");
    await shoot1440(page, "160e-bodyweight-lift-by-reps", async () => {
      await openProgress(page, ananya);
      await page.getByRole("tab", { name: /Exercise progress/ }).click();
      const select = page.locator(".pg-select select").first();
      await select.waitFor({ timeout: 20000 });
      const options = await select.locator("option").allTextContents();
      console.log("lifts", options);
      const pick = options.find((o) => /pull|chin|push|dip/i.test(o));
      if (pick) await select.selectOption({ label: pick });
      await page.waitForTimeout(800);
      const value = await page.locator(".pg-segment[aria-label='Chart value']").textContent().catch(() => null);
      console.log("picked", pick, value);
    });
  }

  // Ratings compare: weight with a 1 to 5 rating (Siddharth answers the rating questions).
  if (want("ratings")) {
    const siddharth = await relationshipId(page, "Siddharth");
    await shoot1440(page, "160d-ratings-compare", async () => {
      await openProgress(page, siddharth);
      await page.getByRole("button", { name: /Compare with/ }).click();
      const energy = page.locator("#pg-compare-list button", { hasText: /Energy|Sleep|Stress|Hunger/ }).first();
      if (await energy.count()) await energy.click();
      await page.waitForTimeout(800);
    });
  }

  // 160i loading: hold the progress reads.
  if (want("160i")) {
    await shoot(page, "160i-trainer-web-progress-loading-v3-web", async () => {
      await page.route("**/api/progress/**", () => {});
      await page.goto(`${webUrl}/clients/${rohan}/progress`);
      await page.getByTestId("progress-skeleton").waitFor({ timeout: 30000 });
      await page.waitForTimeout(500);
    });
    await page.unroute("**/api/progress/**");
  }

  // 161 empty: Harpreet before any data, with an active setup on the keyed v2 form.
  if (want("setup")) {
    const V2 = "c1000001-0000-4000-8000-000000000012";
    const draft = await api(page, "PUT", `/configurations/relationships/${harpreet}/draft`, {
      expectedVersion: 0,
      goalShort: "Strength + 1.6 km under 6 min",
      checkin: { cadence: "weekly", dueWindowHours: 48, formVersionId: V2 },
      tracking: { requireBodyWeight: true, requireProgressPhotos: false, requireSessionRpe: false },
    });
    console.log("draft", draft.status, draft.missingSections);
    const active = await api(page, "POST", `/configurations/relationships/${harpreet}/activate`, {
      expectedVersion: draft.recordVersion,
    });
    console.log("activated", active.status);
    const inDays = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const scheduled = await api(page, "POST", `/checkins/relationships/${harpreet}/schedule`, {
      localDate: inDays,
      checkinFormVersionId: V2,
    });
    console.log("scheduled", JSON.stringify(scheduled).slice(0, 200));
  }

  if (want("161")) {
    await shoot(page, "161-trainer-web-progress-empty-v3-web", () => openProgress(page, harpreet));
  }

  // 160h ended: Kavya.
  if (want("160h")) {
    await shoot(page, "160h-trainer-web-progress-ended-v3-web", () => openProgress(page, kavya));
  }

  // 160g sparse: two weigh-ins for Harpreet.
  if (want("160g")) {
    const now = Date.now();
    const day = 86400000;
    const existing = await api(page, "GET", `/progress/relationships/${harpreet}/measurements`);
    if (!(existing.items || []).length) {
      for (const [ago, value] of [[6, 72.4], [1, 71.8]]) {
        await api(page, "POST", `/progress/relationships/${harpreet}/measurements`, {
          type: "body_weight_kg",
          value,
          unit: "kg",
          observedAt: new Date(now - ago * day).toISOString(),
        });
      }
    }
    await shoot(page, "160g-trainer-web-progress-sparse-v3-web", () => openProgress(page, harpreet));
  }

  // 160f photos compare: four photo dates for Rohan, on dates he weighed in.
  if (want("160f")) {
    const listed = await api(page, "GET", `/progress/relationships/${rohan}/entries?limit=100`);
    if (!(listed.items || []).some((e) => e.entryType === "progress_photo")) {
      const metrics = await api(page, "GET", `/progress/relationships/${rohan}/metrics?keys=weight&range=all`);
      const pts = metrics.series[0].points;
      const picks = [pts[0], pts[Math.floor(pts.length / 3)], pts[Math.floor((2 * pts.length) / 3)], pts[pts.length - 1]];
      // 08:30 in Delhi on each weigh-in day.
      await uploadPhotos(page, rohan, picks.map((p) => `${p.localDate}T03:00:00.000Z`));
    }
    await shoot(page, "160f-trainer-web-progress-photos-v3-web", async () => {
      await openProgress(page, rohan);
      await page.getByRole("tab", { name: /Progress photos/ }).click();
      await page.locator(".pg-photo-frame img").nth(1).waitFor({ timeout: 20000 });
      await page.waitForTimeout(800);
    });
  }

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
