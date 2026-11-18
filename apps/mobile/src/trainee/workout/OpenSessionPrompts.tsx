/**
 * What the Workout tab offers for a workout that is open but not on screen
 * (Z12-45):
 *
 * - W-18 "Pick up where you left off?": the app was closed mid-workout. The
 *   tab finds the server's open execution with no session in memory, and asks
 *   once per launch.
 * - "Finish now" on the in-progress card (W-01b) and "Finish and save" in the
 *   dialog: the same "Finish early?" sheet as the log (W-16).
 * - Discard, behind the same confirm as the log (W-15).
 */
import { useEffect, useState } from "react";
import { Timer } from "lucide-react-native";
import type { WorkoutAssignment, WorkoutExecution } from "@fitbud/contracts";
import { reportError } from "../../lib/reportError";
import { useTheme } from "../../providers/ThemeProvider";
import { enqueueAndPush } from "../../sync/actions";
import { useSyncEngine } from "../../sync/SyncProvider";
import { DiscardDialog } from "../ActiveWorkoutScreen";
import {
  discardLocally,
  finishLocally,
  resumeBody,
  sessionSetCounts,
  unloggedExercises,
} from "../workoutSession";
import { ConfirmDialog, FinishSheet } from "./log/LogSheets";

/** Executions already asked about since the app started. */
const asked = new Set<string>();

/** For tests: forget what was asked. */
export function resetResumePrompt(): void {
  asked.clear();
}

export function OpenSessionPrompts({
  assignment,
  execution,
  canPrompt,
  finishRequested,
  onFinishRequestHandled,
  coachFirst,
  timeZone,
  onResume,
  onFinished,
  onDiscarded,
}: {
  /** The focused day's assignment when its workout is open, else null. */
  assignment: WorkoutAssignment | null;
  /** Its full execution, once read. */
  execution: WorkoutExecution | null;
  /** False while a session is in memory or a start is under way. */
  canPrompt: boolean;
  /** "Finish now" was tapped on the card. */
  finishRequested: boolean;
  onFinishRequestHandled: () => void;
  coachFirst: string;
  timeZone: string;
  onResume: (assignment: WorkoutAssignment) => void;
  onFinished: (execution: WorkoutExecution, assignment: WorkoutAssignment) => void;
  onDiscarded: (execution: WorkoutExecution, assignment: WorkoutAssignment) => void;
}) {
  const theme = useTheme();
  const sync = useSyncEngine();
  const [resumeOpen, setResumeOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [sessionRpe, setSessionRpe] = useState<number | null>(null);
  const open =
    execution != null &&
    assignment != null &&
    execution.assignmentId === assignment.id &&
    (execution.status === "started" || execution.status === "paused");

  useEffect(() => {
    if (!open || !canPrompt || !execution) return;
    if (asked.has(execution.id)) return;
    asked.add(execution.id);
    setResumeOpen(true);
  }, [open, canPrompt, execution]);

  useEffect(() => {
    if (!finishRequested) return;
    onFinishRequestHandled();
    if (open) startFinish();
    // Runs on the request only.
  }, [finishRequested]);

  if (!open || !execution || !assignment) return null;
  const counts = sessionSetCounts(execution);
  const notLogged = counts.total - counts.done;
  const title = assignment.workoutDayName;

  function startFinish() {
    if (!execution) return;
    const pending = sessionSetCounts(execution);
    setResumeOpen(false);
    if (pending.total - pending.done > 0 || execution.requireSessionRpe) {
      setSessionRpe(execution.sessionRpe);
      setFinishOpen(true);
      return;
    }
    finish(execution.sessionRpe);
  }

  function finish(rpe: number | null) {
    if (!execution || !assignment) return;
    const optimistic = finishLocally(execution, rpe);
    setFinishOpen(false);
    void (async () => {
      try {
        await enqueueAndPush(sync, {
          recordId: execution.id,
          operation: "workout.complete",
          expectedServerVersion: execution.recordVersion,
          payload: {
            executionId: execution.id,
            assignmentId: execution.assignmentId,
            expectedVersion: execution.recordVersion,
            workoutName: title,
            body: { sessionRpe: rpe },
          },
        });
      } catch (err: unknown) {
        reportError("workout.complete", err);
      }
      onFinished(optimistic, assignment);
    })();
  }

  function discard() {
    if (!execution || !assignment) return;
    setDiscardOpen(false);
    void (async () => {
      try {
        await enqueueAndPush(sync, {
          recordId: execution.assignmentId,
          operation: "workout.skip",
          payload: { assignmentId: execution.assignmentId, workoutName: title },
        });
      } catch (err: unknown) {
        reportError("workout.discard", err);
      }
      onDiscarded(discardLocally(execution), assignment);
    })();
  }

  return (
    <>
      <ConfirmDialog
        visible={resumeOpen}
        icon={<Timer color={theme.colors.brand} size={22} strokeWidth={2.2} />}
        title="Pick up where you left off?"
        body={resumeBody(title, execution, timeZone)}
        actions={[
          {
            label: "Resume workout",
            onPress: () => {
              setResumeOpen(false);
              onResume(assignment);
            },
          },
          { label: "Finish and save", variant: "secondary", onPress: startFinish },
          {
            label: "Discard",
            variant: "dangerQuiet",
            onPress: () => {
              setResumeOpen(false);
              setDiscardOpen(true);
            },
          },
        ]}
        onDismiss={() => setResumeOpen(false)}
      />
      <FinishSheet
        visible={finishOpen}
        unlogged={unloggedExercises(execution)}
        notLogged={notLogged}
        total={counts.total}
        coachFirst={coachFirst}
        requireRpe={execution.requireSessionRpe}
        sessionRpe={sessionRpe}
        onPickRpe={setSessionRpe}
        onGoTo={() => {
          setFinishOpen(false);
          onResume(assignment);
        }}
        onFinish={() => finish(sessionRpe)}
        onDismiss={() => setFinishOpen(false)}
      />
      <DiscardDialog
        visible={discardOpen}
        logged={counts.done}
        coachFirst={coachFirst}
        onDiscard={discard}
        onDismiss={() => setDiscardOpen(false)}
      />
    </>
  );
}
