import { useEffect, useState } from "react";
import { ApiClientError } from "@fitbud/api-client";
import { apiClient, resolveApiUrl } from "../lib/api";

type MediaState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "not_ready" }
  | { status: "error"; message: string };

export function LinkedMedia({
  mediaAssetId,
  label,
}: {
  mediaAssetId: string;
  label: string;
}) {
  const [state, setState] = useState<MediaState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void apiClient.getDownloadTarget(mediaAssetId).then(
      (target) => {
        if (cancelled) return;
        if (target.mediaAsset.status !== "ready") {
          setState({ status: "not_ready" });
          return;
        }
        setState({
          status: "ready",
          url: resolveApiUrl(target.downloadUrl),
        });
      },
      (err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.code === "MEDIA_NOT_READY") {
          setState({ status: "not_ready" });
          return;
        }
        setState({
          status: "error",
          message:
            err instanceof ApiClientError
              ? err.message
              : "Could not load this photo.",
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mediaAssetId]);

  if (state.status === "loading") {
    return <p className="muted">Loading photo…</p>;
  }
  if (state.status === "not_ready") {
    return <p className="muted">Photo is not ready for download.</p>;
  }
  if (state.status === "error") {
    return (
      <p className="form-error" role="alert">
        {state.message}
      </p>
    );
  }
  return (
    <img className="linked-media" src={state.url} alt={label} />
  );
}
