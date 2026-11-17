/**
 * Z12-38: inside the app's NoticeHost, the trainee's meal and coach-note
 * banners go through the shared queue: one at a time, gone in about 4 s, a
 * tap opens the target (a note is marked read), and each shows once per
 * session even when Today remounts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessibilityInfo } from "react-native";
import {
  coachingRelationshipSchema,
  mealAssignmentSchema,
  notificationSchema,
} from "@fitbud/contracts";
import { act, fireEvent, mockAuth, render, screen } from "../../test/render";
import { localDateInTimezone } from "../../lib/dates";
import { NoticeHost } from "../../components/notice/NoticeHost";
import { BANNER_MS, createNoticeQueue, type NoticeQueue } from "../../components/notice/noticeQueue";
import { useForegroundBannerActive } from "../today/bannerSlot";

const TIME_ZONE = "Asia/Kolkata";
const TODAY = localDateInTimezone(TIME_ZONE);
const NOTE_ID = "00000000-0000-4000-8000-0000000c0002";
const NOTIFICATION_ID = "00000000-0000-4000-8000-0000000c0001";

const relationship = coachingRelationshipSchema.parse({
  id: "1b65e3ad-84cf-4fe1-a546-0d62656c2c79",
  trainerUserId: "a00ed048-8bac-4010-b641-dd888c8a8730",
  traineeUserId: "a0a69e20-297d-4101-a5e2-ecce9b8491cb",
  status: "active",
  onboardingStatus: "coaching_ready",
  invitationId: null,
  startedAt: "2026-09-01T06:30:00.000Z",
  endedAt: null,
  createdAt: "2026-09-01T06:30:00.000Z",
  updatedAt: "2026-11-01T06:30:00.000Z",
  trainerDisplayName: "Rahul Verma",
});

const snack = mealAssignmentSchema.parse({
  id: "00000000-0000-4000-8000-000000000150",
  coachingRelationshipId: relationship.id,
  planId: "3f4a9b2c-1d5e-4f60-9a71-8b2c3d4e5f60",
  planVersionId: "5c6d7e8f-9a0b-41c2-83d4-e5f607182930",
  mealPrescriptionId: "00000000-0000-4000-8000-000000000250",
  mealName: "Evening snack",
  localDate: TODAY,
  windowStartsAt: `${TODAY}T11:30:00.000Z`,
  windowEndsAt: `${TODAY}T12:29:00.000Z`,
  photoRequired: false,
  status: "pending",
  scheduleStatus: "scheduled",
  prescription: {
    id: "00000000-0000-4000-8000-000000000350",
    order: 5,
    name: "Evening snack",
    mealType: "snack",
    localTime: "00:00",
    photoRequired: false,
    items: [
      {
        name: "Roasted chana",
        portionLabel: "1 katori",
        calories: 220,
        proteinGrams: 11,
        carbsGrams: 30,
        fatGrams: 5,
      },
    ],
    instructions: null,
    scheduleHint: null,
  },
  compliance: null,
  createdAt: `${TODAY}T00:00:00.000Z`,
  updatedAt: `${TODAY}T00:00:00.000Z`,
});

const noteNotification = notificationSchema.parse({
  id: NOTIFICATION_ID,
  recipientUserId: relationship.traineeUserId,
  coachingRelationshipId: relationship.id,
  type: "trainer_note_shared",
  notificationType: "trainer_note_shared",
  domainEntityType: "coaching_relationship",
  domainEntityId: NOTE_ID,
  state: "delivered",
  dedupeKey: `trainer_note_shared:${NOTE_ID}`,
  createdAt: `${TODAY}T08:00:00.000Z`,
  readAt: null,
  route: "/today",
  routing: {
    notificationId: NOTIFICATION_ID,
    notificationType: "trainer_note_shared",
    domainEntityType: "coaching_relationship",
    domainEntityId: NOTE_ID,
    createdAt: `${TODAY}T08:00:00.000Z`,
  },
});

const markNotificationRead = vi.fn(async () => noteNotification);
const api = {
  listMealAssignments: vi.fn(async () => ({ items: [snack], nextCursor: null })),
  listNotifications: vi.fn(async () => ({ items: [noteNotification], nextCursor: null })),
  listMeCoachNotes: vi.fn(async () => ({
    items: [
      {
        id: NOTE_ID,
        body: "Try 42.5 kg on the RDLs today if set 2 feels easy.",
        sharedAt: `${TODAY}T08:00:00.000Z`,
        seenAt: null,
        createdAt: `${TODAY}T08:00:00.000Z`,
      },
    ],
  })),
  markNotificationRead,
};
const auth = mockAuth({ api: api as never, me: { timezone: TIME_ZONE } as never });
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));

const { ForegroundBanner } = await import("./ForegroundBanner");

function SlotProbe() {
  return <>{useForegroundBannerActive() ? "slot:busy" : "slot:free"}</>;
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}

describe("ForegroundBanner on the notice queue (Z12-38)", () => {
  let queue: NoticeQueue;
  const onOpenMeal = vi.fn();
  const onGoToday = vi.fn();

  beforeEach(() => {
    queue = createNoticeQueue();
    // A 00:00 snack is due by 09:00 IST. Only Date and timeouts are faked.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date(`${TODAY}T09:00:00+05:30`));
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(async () => true);
    vi.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
    onOpenMeal.mockReset();
    onGoToday.mockReset();
    markNotificationRead.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function renderToday() {
    return render(
      <NoticeHost queue={queue}>
        <SlotProbe />
        <ForegroundBanner
          relationship={relationship}
          coachName="Rahul Verma"
          onOpenMeal={onOpenMeal}
          onGoToday={onGoToday}
        />
      </NoticeHost>,
    );
  }

  it("meal first, then the coach note, one at a time, each gone in about 4 s", async () => {
    renderToday();
    await settle();
    expect(screen.getByText("Evening snack isn't logged yet")).toBeTruthy();
    expect(screen.getByText("Roasted chana · tap to log")).toBeTruthy();
    expect(screen.queryByText("Rahul has a note for you")).toBeNull();
    // Today's reviewed banner waits while a queued banner is up.
    expect(screen.getByText("slot:busy")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(BANNER_MS);
    });
    expect(screen.queryByText("Evening snack isn't logged yet")).toBeNull();
    expect(screen.getByText("Rahul has a note for you")).toBeTruthy();
    expect(screen.getByText("Try 42.5 kg on the RDLs today if set 2 feels easy.")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(BANNER_MS);
    });
    expect(screen.queryByText("Rahul has a note for you")).toBeNull();
    expect(screen.getByText("slot:free")).toBeTruthy();
  });

  it("a tap on the meal opens it; a tap on the note goes to Today and marks it read", async () => {
    renderToday();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: /^Evening snack isn't logged yet/ }));
    expect(onOpenMeal).toHaveBeenCalledWith(snack.id);
    fireEvent.click(screen.getByRole("button", { name: /^Rahul has a note for you/ }));
    expect(onGoToday).toHaveBeenCalledTimes(1);
    expect(markNotificationRead).toHaveBeenCalledWith(NOTIFICATION_ID);
  });

  it("Today opening again does not bring the same banners back", async () => {
    const first = renderToday();
    await settle();
    act(() => {
      vi.advanceTimersByTime(BANNER_MS * 2);
    });
    first.unmount();
    renderToday();
    await settle();
    expect(screen.queryByText("Evening snack isn't logged yet")).toBeNull();
    expect(screen.queryByText("Rahul has a note for you")).toBeNull();
  });

  it("no meal banner while that meal is open", async () => {
    queue.setScreen(`meal:${snack.id}`);
    renderToday();
    await settle();
    expect(screen.queryByText("Evening snack isn't logged yet")).toBeNull();
    expect(screen.getByText("Rahul has a note for you")).toBeTruthy();
  });
});
