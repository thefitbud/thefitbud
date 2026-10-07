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
