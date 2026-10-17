import type { Checkin } from "@fitbud/contracts";
import type { TraineeOverlay } from "../navigation/TraineeOverlay";

export type TraineeCaptureNav = {
  setTab: (
    tab: "today" | "workout" | "diet" | "progress" | "more",
  ) => void;
  openOverlay: (overlay: TraineeOverlay) => void;
  openCheckin: (checkin: Checkin) => void;
  startTodayWorkout: () => Promise<void>;
  openSomethingDifferent: () => Promise<void>;
  openWorkoutOverview: () => Promise<void>;
  openTodayCheckin: () => Promise<void>;
  closeOverlay: () => void;
  ensureWorkoutDay: () => Promise<void>;
  startCaptureWorkout: () => Promise<void>;
  showCaptureWorkoutSummary: () => void;
  clearCaptureWorkoutScreens: () => void;
  signOut: () => void;
};

export type TrainerCaptureNav = {
  setTab: (tab: "attention" | "clients" | "checkins" | "more") => void;
  clearOverlay: () => void;
  openActivity: () => void;
  openFirstClient: () => Promise<void>;
  openFirstException: () => Promise<void>;
  openFirstCheckin: () => Promise<void>;
  signOut: () => void;
};

export type AuthCaptureNav = {
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithTestInvite: () => Promise<void>;
  selectTrainerRole: () => Promise<void>;
  selectTraineeRole: () => Promise<void>;
  signOut: () => void;
};

let traineeNav: TraineeCaptureNav | null = null;
let trainerNav: TrainerCaptureNav | null = null;
let authNav: AuthCaptureNav | null = null;

export function registerTraineeCaptureNav(nav: TraineeCaptureNav | null) {
  traineeNav = nav;
}

export function registerTrainerCaptureNav(nav: TrainerCaptureNav | null) {
  trainerNav = nav;
}

export function registerAuthCaptureNav(nav: AuthCaptureNav | null) {
  authNav = nav;
}

export function isCaptureModeEnabled(): boolean {
  return process.env.EXPO_PUBLIC_SCREEN_CAPTURE === "1";
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function navigateCaptureScreen(
  screenId: string,
  options?: { skipAuth?: boolean },
): Promise<void> {
  const id = screenId.trim().toUpperCase();
  const skipAuth = options?.skipAuth === true;

  if (!skipAuth && id === "TR-01") {
    authNav?.signOut();
    await wait(800);
    return;
  }

  if (!skipAuth && id === "TR-02") {
    authNav?.signOut();
    await wait(400);
    await authNav?.signInWithTestInvite();
    await wait(2000);
    return;
  }

  if (!skipAuth && id === "TR-03") {
    await authNav?.signInWithPassword(
      "vikram.onboarding@demo.fitbud.test",
      "FitBud-demo-2026",
    );
    await wait(2500);
    return;
  }

  if (!skipAuth && id === "TR-04") {
    await authNav?.signInWithPassword(
      "sneha.review@demo.fitbud.test",
      "FitBud-demo-2026",
    );
    await wait(2500);
    return;
  }

  if (!skipAuth && id === "TR-22") {
    await authNav?.signInWithPassword(
      "kavya.ended@demo.fitbud.test",
      "FitBud-demo-2026",
    );
    await wait(2500);
    return;
  }

  if (!skipAuth && id === "TM-08") {
    await authNav?.signInWithPassword(
      "karan.dual@demo.fitbud.test",
      "FitBud-demo-2026",
    );
    await wait(2000);
    return;
  }

  if (!skipAuth && id.startsWith("TM-")) {
    await authNav?.signInWithPassword(
      "rahul.coach@demo.fitbud.test",
      "FitBud-demo-2026",
    );
    await wait(2500);
  } else if (!skipAuth && id.startsWith("TR-")) {
    const traineeEmail =
      id === "TR-07"
        ? "lakshmi.foods@demo.fitbud.test"
        : id === "TR-08"
          ? "deepak.dubai@demo.fitbud.test"
          : "aarav.ontrack@demo.fitbud.test";
    await authNav?.signInWithPassword(traineeEmail, "FitBud-demo-2026");
    await wait(2500);
  }

  if (!traineeNav && !trainerNav) {
    await wait(1500);
  }

  if (id.startsWith("TR-") && id !== "TR-05") {
    traineeNav?.closeOverlay();
    await wait(400);
  }

  if (id.startsWith("TM-") && id !== "TM-08") {
    trainerNav?.clearOverlay();
    await wait(300);
  }

  switch (id) {
    case "TR-05":
      traineeNav?.closeOverlay();
      traineeNav?.openOverlay({ screen: "reminder_setup" });
      break;
    case "TR-06":
      traineeNav?.setTab("today");
      break;
    case "TR-07":
      traineeNav?.setTab("diet");
      break;
    case "TR-08":
      traineeNav?.setTab("diet");
      break;
    case "TR-09":
      traineeNav?.openOverlay({ screen: "meal_plan" });
      break;
    case "TR-10":
      await traineeNav?.ensureWorkoutDay();
      traineeNav?.setTab("workout");
      await wait(800);
      await traineeNav?.openWorkoutOverview();
      break;
    case "TR-11":
      await traineeNav?.ensureWorkoutDay();
      await traineeNav?.startCaptureWorkout();
      break;
    case "TR-12":
      traineeNav?.showCaptureWorkoutSummary();
      break;
    case "TR-13":
      traineeNav?.clearCaptureWorkoutScreens();
      traineeNav?.setTab("progress");
      break;
    case "TR-14":
      traineeNav?.setTab("today");
      await wait(800);
      await traineeNav?.openTodayCheckin();
      break;
    case "TR-15":
      traineeNav?.openOverlay({ screen: "notifications" });
      break;
    case "TR-16":
      traineeNav?.setTab("more");
      await wait(400);
      traineeNav?.openOverlay({ screen: "reminder_settings" });
      break;
    case "TR-17":
      traineeNav?.openOverlay({ screen: "quiet_hours" });
      break;
    case "TR-18":
      traineeNav?.openOverlay({
        screen: "ask_coach",
        itemType: "meal_assignment",
        itemId: "00000000-0000-4000-8000-000000000001",
        topic: "Lunch",
      });
      break;
    case "TR-19":
      traineeNav?.openOverlay({ screen: "sync" });
      break;
    case "TR-20":
      traineeNav?.setTab("more");
      break;
    case "TR-21":
      traineeNav?.openOverlay({ screen: "widget_tips" });
      break;
    case "TR-23":
      traineeNav?.openOverlay({
        screen: "deep_link",
        reason: "This link is no longer available.",
      });
      break;
    case "TR-24":
      traineeNav?.openOverlay({ screen: "meal_times" });
      break;
    case "TR-25":
      traineeNav?.openOverlay({ screen: "steps_settings" });
      break;
    case "TR-26":
      traineeNav?.openOverlay({ screen: "food_search" });
      break;
    case "TM-01":
      trainerNav?.setTab("attention");
      break;
    case "TM-02":
      trainerNav?.setTab("clients");
      break;
    case "TM-03":
      trainerNav?.setTab("clients");
      await wait(1200);
      await trainerNav?.openFirstClient();
      break;
    case "TM-04":
      trainerNav?.setTab("attention");
      await wait(1200);
      await trainerNav?.openFirstException();
      break;
    case "TM-05":
      trainerNav?.setTab("checkins");
      break;
    case "TM-06":
      trainerNav?.setTab("checkins");
      await wait(1200);
      await trainerNav?.openFirstCheckin();
      break;
    case "TM-07":
      trainerNav?.setTab("more");
      break;
    case "TM-09":
      trainerNav?.openActivity();
      break;
    default:
      break;
  }

  await wait(1500);
}

export function installCaptureGlobals() {
  if (!isCaptureModeEnabled()) return;
  if (typeof globalThis === "undefined") return;
  const g = globalThis as typeof globalThis & {
    __fitbudCapture?: {
      navigate: (
        screenId: string,
        options?: { skipAuth?: boolean },
      ) => Promise<void>;
      loginTrainee: (email: string) => Promise<void>;
      loginTrainer: () => Promise<void>;
      loginInvite: () => Promise<void>;
      signOut: () => void;
      ready: boolean;
    };
  };
  g.__fitbudCapture = {
    navigate: navigateCaptureScreen,
    loginTrainee: (email: string) =>
      authNav?.signInWithPassword(email, "FitBud-demo-2026"),
    loginTrainer: () =>
      authNav?.signInWithPassword(
        "rahul.coach@demo.fitbud.test",
        "FitBud-demo-2026",
      ),
    loginInvite: () => authNav?.signInWithTestInvite(),
    signOut: () => authNav?.signOut(),
    ready: true,
  };
}
