import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="centered-status" data-testid="screen-TW-33">
      <h1>We couldn&apos;t find that page</h1>
      <p className="lede">
        This link may be outdated, or the page may have moved.
      </p>
      <Link className="button-primary" to="/">
        Home
      </Link>
    </main>
  );
}
