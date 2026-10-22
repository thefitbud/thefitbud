import { Navigate, useParams } from "react-router-dom";

/** Deep links open Home with the TW-05 drawer (guide §2.1). */
export function ExceptionDetailPage() {
  const { exceptionId = "" } = useParams();
  if (!exceptionId) {
    return <Navigate to="/" replace />;
  }
  return <Navigate to={`/?exception=${exceptionId}`} replace />;
}
