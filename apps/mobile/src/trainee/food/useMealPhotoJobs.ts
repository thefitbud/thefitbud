import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { reportError } from "../../lib/reportError";
import { useReachability, useSyncEngine } from "../../sync/SyncProvider";
import { deviceStorage } from "../../sync/storage";
import { invalidateRelationshipDayData } from "../dataCache";
import {
  prepareMealPhoto,
  recordAttachedMealVersion,
  uploadAndAttachMealPhoto,
} from "../mealActions";
import {
  mealPhotoJobsFor,
  resolveMealEntryId,
  type MealPhotoJob,
  type MealPhotoJobs,
} from "./mealPhotoJobs";

const EMPTY: Readonly<Record<string, MealPhotoJob>> = {};
const noopSubscribe = () => () => undefined;

/**
 * The signed-in trainee's meal photo jobs (see `mealPhotoJobs.ts`), started
 * on first use and wired to this session's API, outbox and reachability.
 * The runner outlives the screen: a photo keeps sending after Diet unmounts.
 */
export function useMealPhotoJobs(enabled = true): {
  jobs: Readonly<Record<string, MealPhotoJob>>;
  runner: MealPhotoJobs | null;
} {
  const { api, me } = useAuth();
  const sync = useSyncEngine();
  const reachability = useReachability();
  const ownerId = enabled ? (me?.userId ?? null) : null;

  const runner = useMemo(() => {
    if (!ownerId) return null;
    return mealPhotoJobsFor(ownerId, () => {
      const device = deviceStorage();
      return {
        storage: device.storage,
        ownerId,
        // The keychain has no room for photos: the record keeps the file.
        persistBytes: device.capacity === "full",
        report: reportError,
      };
    });
  }, [ownerId]);

  useEffect(() => {
    if (!runner) return;
    runner.configure({
      resolveEntryId: (job, hint) =>
        resolveMealEntryId({
          job,
          hint,
          listOutbox: () => sync.store.listOutbox(),
          fetchMeal: async () => {
            const listed = await api.listMealAssignments(job.relationshipId, {
              fromDate: job.localDate,
              toDate: job.localDate,
            });
            return listed.items.find((item) => item.id === job.assignmentId) ?? null;
          },
        }),
      send: async (job, input) => {
        const { entry } = await uploadAndAttachMealPhoto(api, {
          relationshipId: job.relationshipId,
          assignmentId: job.assignmentId,
          entryId: input.entryId,
          bytes: input.bytes,
          attachKey: job.attachKey,
          uploadKey: job.uploadKey,
          mediaAssetId: job.mediaAssetId,
          onUploaded: input.onUploaded,
        });
        // The next edit of this meal sends the version the attach produced.
        try {
          await recordAttachedMealVersion(sync, entry);
        } catch (err) {
          reportError("mealPhoto.version", err);
        }
      },
      reloadBytes: async (uri) =>
        (await prepareMealPhoto({ uri, width: 0, height: 0 })).bytes,
      onSent: (job) => invalidateRelationshipDayData(job.relationshipId),
    });
    runner.connect({ reachability, outbox: sync.store });
    void runner.start().then(() => runner.kick());
  }, [runner, api, sync, reachability]);

  const jobs = useSyncExternalStore(
    runner ? runner.subscribe : noopSubscribe,
    runner ? runner.snapshot : () => EMPTY,
    runner ? runner.snapshot : () => EMPTY,
  );
  return { jobs, runner };
}
