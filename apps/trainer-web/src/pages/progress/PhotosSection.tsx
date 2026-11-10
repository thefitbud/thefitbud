import { useState } from "react";
import type { ProgressEntry } from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";
import { LinkedMedia } from "../../components/LinkedMedia";

type Props = {
  photoEntries: ProgressEntry[];
  loading: boolean;
};

/** Progress photos with a two-date compare. Moved unchanged from the page; Z8-14 rebuilds it per frame 160f. */
export function PhotosSection({ photoEntries, loading }: Props) {
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
  const compareLeft = photoEntries.find((row) => row.id === compareA) ?? null;
  const compareRight = photoEntries.find((row) => row.id === compareB) ?? null;

  return (
    <section
      className="workspace-card pg-photos"
      id="progress-photos"
      aria-labelledby="photos-heading"
    >
      <div className="workspace-card-head">
        <h2 id="photos-heading">Photos</h2>
        <div className="progress-compare-controls">
          <label className="field">
            <span>Compare</span>
            <select
              value={compareA}
              onChange={(event) => setCompareA(event.target.value)}
            >
              <option value="">Pick a date</option>
              {photoEntries.map((row) => (
                <option key={row.id} value={row.id}>
                  {formatCivilDate(row.observedAt.slice(0, 10))}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>With</span>
            <select
              value={compareB}
              onChange={(event) => setCompareB(event.target.value)}
            >
              <option value="">Pick a date</option>
              {photoEntries.map((row) => (
                <option key={row.id} value={row.id}>
                  {formatCivilDate(row.observedAt.slice(0, 10))}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {compareLeft?.mediaAssetId && compareRight?.mediaAssetId ? (
        <div className="progress-compare" data-testid="photo-compare">
          <figure className="progress-photo">
            <figcaption>
              {formatCivilDate(compareLeft.observedAt.slice(0, 10))}
            </figcaption>
            <LinkedMedia
              mediaAssetId={compareLeft.mediaAssetId}
              label="Earlier progress photo"
            />
          </figure>
          <figure className="progress-photo">
            <figcaption>
              {formatCivilDate(compareRight.observedAt.slice(0, 10))}
            </figcaption>
            <LinkedMedia
              mediaAssetId={compareRight.mediaAssetId}
              label="Later progress photo"
            />
          </figure>
        </div>
      ) : null}

      <ul className="progress-photo-grid">
        {photoEntries.map((row) => (
          <li key={row.id}>
            <p>{formatCivilDate(row.observedAt.slice(0, 10))}</p>
            {row.mediaAssetId ? (
              <LinkedMedia
                mediaAssetId={row.mediaAssetId}
                label={row.title?.trim() || "Progress photo"}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {!loading && photoEntries.length === 0 ? (
        <p className="workspace-empty" role="status">
          No progress photos yet
        </p>
      ) : null}
    </section>
  );
}
