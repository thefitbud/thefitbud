import { Navigate } from "react-router-dom";

/** Legacy entry — redirect to the Templates hub (TW-23). */
export function TemplatesPage() {
  return <Navigate to="/templates/workouts" replace />;
}
