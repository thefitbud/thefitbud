import { useMemo, useState } from "react";
import { Camera } from "lucide-react";
import type { ProgressEntry, ProgressMetricSeries } from "@fitbud/contracts";
import { formatLocalDate } from "@fitbud/core";
import { LinkedMedia } from "../../components/LinkedMedia";
import { formatMetricValue, formatPointDate } from "./metricKeys";

/** One client calendar day with progress photos; the earliest photo of the day stands for it. */
export type PhotoDate = {
  localDate: string;
  entry: ProgressEntry & { mediaAssetId: string };
  /** Photos stored on that day (more than one is named under the strip). */
  count: number;
};

/** Progress photo entries grouped by the client's calendar day, oldest first. */
export function groupPhotoDates(
  entries: readonly ProgressEntry[],
  timeZone: string,
): PhotoDate[] {
  const byDate = new Map<string, PhotoDate>();
  const sorted = entries
    .filter(
      (row): row is ProgressEntry & { mediaAssetId: string } =>
        row.entryType === "progress_photo" && Boolean(row.mediaAssetId),
    )
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  for (const entry of sorted) {
    const localDate = formatLocalDate(new Date(entry.observedAt), timeZone);
    const existing = byDate.get(localDate);
    if (existing) existing.count += 1;
    else byDate.set(localDate, { localDate, entry, count: 1 });
  }
  return [...byDate.values()];
}

type Props = {
  dates: PhotoDate[];
  /** All-time weight series: a photo's chip shows the weight entered that day, when there is one. */
  weight: ProgressMetricSeries | undefined;
  clientFirstName: string;
};

/**
 * Frame 160f: two progress photos side by side, picked by date from the strip
 * below. Progress photos carry no pose today, so the Front/Side/Back switch of the
 * frame is not shown (follow-up: a pose on the stored photo).
 */
export function PhotosPanel({ dates, weight, clientFirstName }: Props) {
  const [picked, setPicked] = useState<string[]>(() =>
    dates.length > 1
      ? [dates[0]!.localDate, dates.at(-1)!.localDate]
      : dates.map((row) => row.localDate),
  );

  const weightByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const point of weight?.points ?? []) {
      map.set(point.localDate, formatMetricValue(point.value, weight!.unit));
    }
    return map;
  }, [weight]);

  // A date that left the list (refresh) drops out of the pair.
  const valid = picked.filter((date) =>
    dates.some((row) => row.localDate === date),
  );
  const shown = dates.filter((row) => valid.includes(row.localDate));

  function pick(localDate: string) {
    if (valid.includes(localDate)) return;
    // The date picked longest ago gives way; the pair always shows oldest on the left.
    setPicked(valid.length < 2 ? [...valid, localDate] : [valid[1]!, localDate]);
  }

  function chip(row: PhotoDate) {
    const day = formatPointDate(row.localDate);
    const kg = weightByDate.get(row.localDate);
    return kg ? `${day} · ${kg}` : day;
  }

  const multi = dates.filter((row) => row.count > 1);
  const summary = [
    dates.length === 1 ? "1 date with photos" : `${dates.length} dates with photos`,
    ...multi.map(
      (row) =>
        `${formatPointDate(row.localDate)} has ${row.count} photos, the first is shown`,
    ),
  ].join(" · ");

  return (
    <>
      <div className="pg-panel-head">
        <div>
          <h2 id="pg-panel-title">Progress photos</h2>
          <p className="pg-subtitle">
            <Camera
              className="pg-subtitle-icon"
              size={14}
              strokeWidth={1.6}
              aria-hidden
            />
            Only you and {clientFirstName} see these
          </p>
        </div>
      </div>

      <div
        className={
          shown.length > 1 ? "pg-photo-pair" : "pg-photo-pair is-single"
        }
        data-testid="photo-compare"
      >
        {shown.map((row, index) => (
          <figure key={row.localDate} className="pg-photo-frame">
            <figcaption className="pg-photo-chip">{chip(row)}</figcaption>
            <LinkedMedia
              mediaAssetId={row.entry.mediaAssetId}
              label={`${index === 0 && shown.length > 1 ? "Earlier" : shown.length > 1 ? "Later" : "Progress"} photo, ${formatPointDate(row.localDate)}`}
            />
          </figure>
        ))}
      </div>

      <div className="pg-photo-strip-head">
        <p className="pg-table-heading" id="pg-photo-strip-heading">
          {dates.length > 1
            ? "Pick two dates to compare"
            : "A second date makes a compare"}
        </p>
        <p className="pg-photo-summary">{summary}</p>
      </div>
      <ul
        className="pg-photo-strip"
        aria-labelledby="pg-photo-strip-heading"
      >
        {dates.map((row) => {
          const isPicked = valid.includes(row.localDate);
          return (
            <li key={row.localDate}>
              <button
                type="button"
                className={isPicked ? "pg-photo-thumb is-picked" : "pg-photo-thumb"}
                aria-pressed={isPicked}
                aria-label={`${formatPointDate(row.localDate)}${isPicked ? ", in the compare" : ""}`}
                onClick={() => pick(row.localDate)}
              >
                <span className="pg-photo-chip" aria-hidden="true">
                  {formatPointDate(row.localDate)}
                </span>
                <LinkedMedia
                  mediaAssetId={row.entry.mediaAssetId}
                  label=""
                />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
