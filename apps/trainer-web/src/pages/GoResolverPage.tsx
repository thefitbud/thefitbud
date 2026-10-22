import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  linkKindSchema,
  linkResolveResponseSchema,
  type LinkKind,
  type LinkResolveResponse,
} from "@fitbud/contracts";
import { stage1Api } from "../lib/stage1-api";
import { LoadingBlock } from "../components/StatePanels";

export function GoResolverPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const kind = params.get("kind") ?? "";
  const id = params.get("id") ?? "";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kind || !id) {
      setError("This link is missing kind or id.");
      return;
    }
    const parsed = linkKindSchema.safeParse(kind);
    if (!parsed.success) {
      setError("This link type is not supported.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const raw = await stage1Api.resolveLink(parsed.data as LinkKind, id);
        const result = linkResolveResponseSchema.parse(raw) as LinkResolveResponse;
        if (cancelled) return;
        if (result.available && result.route) {
          navigate(result.route, { replace: true });
          return;
        }
        if (result.reason === "ended") {
          navigate(`/clients/${id}/overview`, { replace: true });
          return;
        }
        setError(
          result.reason === "not_yours"
            ? "You don't have access to this link."
            : "This link is no longer available.",
        );
      } catch {
        if (!cancelled) setError("Could not open this link.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, id, navigate]);

  if (error) {
    return (
      <section className="page centered-status">
        <h1>Link unavailable</h1>
        <p className="lede">{error}</p>
        <Link className="button-primary" to="/">Back to Home</Link>
      </section>
    );
  }

  return (
    <section className="page centered-status">
      <LoadingBlock label="Opening link…" />
    </section>
  );
}
