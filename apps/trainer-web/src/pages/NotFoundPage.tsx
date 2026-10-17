import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="centered-status">
      <h1>Page not found</h1>
      <p className="lede">
        This link may be outdated or you may not have access.
      </p>
      <Link className="button-primary" to="/">
        Back to Home
      </Link>
    </main>
  );
}
