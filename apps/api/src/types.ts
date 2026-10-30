import type { RealtimeEvent } from "@fitbud/contracts";

export type Env = {
  DB: D1Database;
  /** R2 bucket for progress/meal/check-in media. Ownership lives in D1. */
  MEDIA: R2Bucket;
  /**
   * Optional Cloudflare Queue for reminder delivery.
   * When absent (tests / local without queue binding), delivery runs inline.
   */
  REMINDER_QUEUE?: Queue<{ notificationId: string; deliveryId: string }>;
  /**
   * Selected realtime fan-out: one Durable Object room per coaching relationship.
   * Optional so unit tests and workflows remain correct without WebSockets.
   */
  RELATIONSHIP_REALTIME?: DurableObjectNamespace;
  /**
   * Test-only sink for emitted realtime hints when DO binding is absent.
   * Never used in production configuration.
   */
  REALTIME_TEST_SINK?: RealtimeEvent[];
  FIREBASE_PROJECT_ID: string;
  SESSION_COOKIE_NAME: string;
  /** `test` uses the documented Firebase token test double. */
  AUTH_MODE: "test" | "firebase";
  /**
   * `test` records provider acceptance via a local FCM double.
   * `fcm` requires production credentials (not wired in MVP local).
   */
  PUSH_PROVIDER_MODE?: "test" | "fcm";
  /** HMAC secret for time-limited media upload/download URLs. */
  MEDIA_SIGNING_SECRET: string;
  ENVIRONMENT?: "local" | "staging" | "production" | "preview";
  EMAIL_PROVIDER?: "dev_sink" | "disabled" | "resend" | "ses";
  SYSTEM_EMAIL_FROM?: string;
  SYSTEM_EMAIL_REPLY_TO?: string;
  ADMIN_ALERT_EMAILS?: string;
  SUPPORT_EMAIL?: string;
  APP_HOST?: string;
  FLAG_WA_OTP?: string;
  FLAG_WA_AUTOMATION?: string;
  FLAG_STEPS_ENABLED?: string;
  LIBRARY_MEDIA_BASE_URL?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  WA_PHONE_NUMBER_ID?: string;
  WA_ACCESS_TOKEN?: string;
  WA_APP_SECRET?: string;
  WA_WEBHOOK_VERIFY_TOKEN?: string;
  WA_MONTHLY_BUDGET_INR?: string;
  WA_HARD_CAP_INR?: string;
  /** Optional ISO instant for local demo captures. Unset in production. */
  NOW?: string;
};
export type Variables = {
  requestId: string;
  actor: ActorContext | null;
};

export type ActorContext = {
  userId: string;
  firebaseUid: string;
  accountState: "active" | "disabled";
  timezone: string;
  permittedRoles: Array<"trainer" | "trainee">;
  selectedRole: "trainer" | "trainee" | null;
  surface: "trainer_web" | "mobile";
  trainerProfileId: string | null;
  traineeProfileId: string | null;
  authMethod: "bearer" | "session";
};
