import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/cloudflare";
import type { Env } from "../types.js";
import {
  isSentryReportingEnabled,
  scrubSentryEvent,
  sentryOptions,
  sentryRelease,
  type SentryScrubTarget,
} from "./sentry.js";

const FAKE_DSN = "https://public@o0.ingest.sentry.io/0";

function env(overrides: Partial<Env> & { SENTRY_RELEASE?: string } = {}): Env {
  return overrides as Env;
}

describe("isSentryReportingEnabled", () => {
  it("is off when SENTRY_DSN is unset", () => {
    expect(isSentryReportingEnabled(env({ SENTRY_ENVIRONMENT: "staging" }))).toBe(false);
    expect(isSentryReportingEnabled(env({ SENTRY_DSN: "", SENTRY_ENVIRONMENT: "production" }))).toBe(false);
    expect(isSentryReportingEnabled(env({ SENTRY_DSN: "   ", SENTRY_ENVIRONMENT: "staging" }))).toBe(false);
  });

  it("is off when the environment is development", () => {
    expect(
      isSentryReportingEnabled(env({ SENTRY_DSN: FAKE_DSN, SENTRY_ENVIRONMENT: "development" })),
    ).toBe(false);
  });

  it("is off for local, preview, and an unset environment", () => {
    expect(isSentryReportingEnabled(env({ SENTRY_DSN: FAKE_DSN, SENTRY_ENVIRONMENT: "local" }))).toBe(false);
    expect(isSentryReportingEnabled(env({ SENTRY_DSN: FAKE_DSN, SENTRY_ENVIRONMENT: "preview" }))).toBe(false);
    expect(isSentryReportingEnabled(env({ SENTRY_DSN: FAKE_DSN }))).toBe(false);
  });

  it("is on for staging and production when a DSN is set", () => {
    expect(isSentryReportingEnabled(env({ SENTRY_DSN: FAKE_DSN, SENTRY_ENVIRONMENT: "staging" }))).toBe(true);
    expect(
      isSentryReportingEnabled(env({ SENTRY_DSN: `  ${FAKE_DSN}  `, SENTRY_ENVIRONMENT: "production" })),
    ).toBe(true);
  });
});

describe("sentryOptions", () => {
  it("leaves the DSN unset when reporting is off, including development", () => {
    const missing = sentryOptions(env({ SENTRY_ENVIRONMENT: "staging" }));
    expect(missing.dsn).toBeUndefined();
    expect(missing.enabled).toBe(false);

    const development = sentryOptions(
      env({ SENTRY_DSN: FAKE_DSN, SENTRY_ENVIRONMENT: "development" }),
    );
    expect(development.dsn).toBeUndefined();
    expect(development.enabled).toBe(false);
    expect(development.environment).toBe("development");
  });

  it("sends errors only, with no default PII, on staging", () => {
    const options = sentryOptions(env({ SENTRY_DSN: ` ${FAKE_DSN} `, SENTRY_ENVIRONMENT: "staging" }));
    expect(options.enabled).toBe(true);
    expect(options.dsn).toBe(FAKE_DSN);
    expect(options.environment).toBe("staging");
    expect(options.tracesSampleRate).toBe(0);
    expect(options.sendDefaultPii).toBe(false);
  });

  it("reads the environment tag from SENTRY_ENVIRONMENT on production", () => {
    const options = sentryOptions(env({ SENTRY_DSN: FAKE_DSN, SENTRY_ENVIRONMENT: "production" }));
    expect(options.environment).toBe("production");
    expect(options.enabled).toBe(true);
  });
});

describe("sentryRelease", () => {
  it("is unset when the deploy var is absent, blank, or not a string", () => {
    expect(sentryRelease(env())).toBeUndefined();
    expect(sentryRelease(env({ SENTRY_RELEASE: "" }))).toBeUndefined();
    expect(sentryRelease(env({ SENTRY_RELEASE: "   " }))).toBeUndefined();
    expect(sentryRelease({ SENTRY_RELEASE: 123 })).toBeUndefined();
    expect(sentryOptions(env({ SENTRY_DSN: FAKE_DSN, SENTRY_ENVIRONMENT: "staging" })).release).toBeUndefined();
  });

  it("uses the git SHA when SENTRY_RELEASE is set", () => {
    const sha = "abc123def456";
    expect(sentryRelease(env({ SENTRY_RELEASE: ` ${sha} ` }))).toBe(sha);
    expect(
      sentryOptions(env({ SENTRY_DSN: FAKE_DSN, SENTRY_ENVIRONMENT: "staging", SENTRY_RELEASE: sha })).release,
    ).toBe(sha);
  });
});

describe("scrubSentryEvent", () => {
  function event(): SentryScrubTarget {
    return {
      request: {
        url: "https://api-staging.thefitbud.com/clients?email=ada@example.com&token=secret#frag",
        query_string: "email=ada@example.com&token=secret",
        cookies: { fitbud_session: "session-value" },
        headers: {
          Authorization: "Bearer secret-token",
          Cookie: "fitbud_session=session-value",
          "Content-Type": "application/json",
        },
        data: { password: "hunter2", note: "knee pain" },
      },
      extra: {
        requestId: "req-1",
        email: "ada@example.com",
        displayName: "Ada Lovelace",
        name: "Ada",
        notes: "Trainee felt dizzy",
        note: "private",
        weight: 72.4,
        body_weight_kg: 72.4,
        waist_cm: 80,
        hip_cm: 90,
        chest_cm: 88,
        steps: 4200,
        bodyFat: 22,
        client: { email: "nested@example.com", id: "user-1", trainerName: "Rahul" },
        filename: "plan.json",
        errorName: "TypeError",
      },
      contexts: {
        health: { heartRate: 80, sleep: 7, measurement: 70 },
        trace: { span_id: "abc" },
        profile: { firstName: "Ada", lastName: "Lovelace", status: "active" },
      },
    };
  }

  it("drops the request body, cookies, Authorization and the query string", () => {
    const scrubbed = scrubSentryEvent(event());
    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.query_string).toBeUndefined();
    expect(scrubbed.request?.headers?.Authorization).toBeUndefined();
    expect(scrubbed.request?.headers?.Cookie).toBeUndefined();
    expect(scrubbed.request?.headers?.["Content-Type"]).toBe("application/json");
    expect(scrubbed.request?.url).toBe("https://api-staging.thefitbud.com/clients");
  });

  it("removes emails, names, notes and health fields from extra and contexts", () => {
    const scrubbed = scrubSentryEvent(event());
    const extra = scrubbed.extra ?? {};
    expect(extra.requestId).toBe("req-1");
    expect(extra.email).toBeUndefined();
    expect(extra.displayName).toBeUndefined();
    expect(extra.name).toBeUndefined();
    expect(extra.notes).toBeUndefined();
    expect(extra.note).toBeUndefined();
    expect(extra.weight).toBeUndefined();
    expect(extra.body_weight_kg).toBeUndefined();
    expect(extra.waist_cm).toBeUndefined();
    expect(extra.hip_cm).toBeUndefined();
    expect(extra.chest_cm).toBeUndefined();
    expect(extra.steps).toBeUndefined();
    expect(extra.bodyFat).toBeUndefined();
    expect(extra.client).toEqual({ id: "user-1" });
    expect(extra.filename).toBe("plan.json");
    expect(extra.errorName).toBe("TypeError");

    const contexts = scrubbed.contexts ?? {};
    expect(contexts.health).toEqual({});
    expect(contexts.trace).toEqual({ span_id: "abc" });
    expect(contexts.profile).toEqual({ status: "active" });
  });

  it("runs as beforeSend and still returns the event", () => {
    const options = sentryOptions(env({ SENTRY_DSN: FAKE_DSN, SENTRY_ENVIRONMENT: "production" }));
    const body = event();
    const sent = options.beforeSend!(body as ErrorEvent, {}) as ErrorEvent;
    expect(sent).toBe(body);
    expect(sent.request?.data).toBeUndefined();
    expect(sent.extra?.email).toBeUndefined();
  });

  it("drops every key that contains email, including plurals and inner matches", () => {
    const scrubbed = scrubSentryEvent({
      extra: {
        requestId: "req-9",
        emails: ["ada@example.com", "coach@example.com"],
        emailAddress: "ada@example.com",
        userEmail: "ada@example.com",
        primary_email: "ada@example.com",
        filename: "plan.json",
      },
    });
    expect(scrubbed.extra).toEqual({ requestId: "req-9", filename: "plan.json" });
  });

  it("drops progress-entry body text and check-in wellbeing and field answers", () => {
    const scrubbed = scrubSentryEvent({
      extra: {
        progressEntry: {
          id: "pe-1",
          entryType: "note",
          title: "Week 4",
          body: "Knee still swollen after Tuesday's session",
        },
        checkin: {
          id: "ci-1",
          status: "submitted",
          wellbeing: "Slept badly and felt dizzy on waking",
          fieldAnswers: {
            energy: "low",
            pain: "left knee on the stairs",
          },
        },
      },
    });
    expect(scrubbed.extra?.progressEntry).toEqual({
      id: "pe-1",
      entryType: "note",
      title: "Week 4",
    });
    expect(scrubbed.extra?.checkin).toEqual({ id: "ci-1", status: "submitted" });
  });

  it("keeps only an opaque id on event.user", () => {
    const scrubbed = scrubSentryEvent({
      user: {
        id: "user-1",
        email: "ada@example.com",
        username: "ada",
        ip_address: "203.0.113.8",
      },
    });
    expect(scrubbed.user).toEqual({ id: "user-1" });
  });

  it("strips breadcrumb URLs and sensitive breadcrumb data", () => {
    const scrubbed = scrubSentryEvent({
      breadcrumbs: [
        {
          category: "fetch",
          data: {
            url: "https://api-staging.thefitbud.com/checkins?email=ada@example.com&token=secret#notes",
            method: "POST",
            status_code: 500,
            email: "ada@example.com",
            wellbeing: "Slept badly",
            fieldAnswers: { pain: "left knee" },
          },
        },
      ],
    });
    expect(scrubbed.breadcrumbs).toEqual([
      {
        category: "fetch",
        data: {
          url: "https://api-staging.thefitbud.com/checkins",
          method: "POST",
          status_code: 500,
        },
      },
    ]);

    const options = sentryOptions(env({ SENTRY_DSN: FAKE_DSN, SENTRY_ENVIRONMENT: "production" }));
    const crumb = {
      category: "navigation",
      data: {
        url: "https://trainer.thefitbud.com/clients/user-1?email=ada@example.com#progress",
        emails: ["ada@example.com"],
        body: "Knee still swollen",
      },
    };
    const sent = options.beforeBreadcrumb!(crumb, {});
    expect(sent?.data).toEqual({
      url: "https://trainer.thefitbud.com/clients/user-1",
    });
  });
});
