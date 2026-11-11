import { Route, Routes } from "react-router-dom";
import { NotFoundPage } from "../NotFoundPage";
import { LogMealPage } from "./LogMealPage";
import { LogMeasurementPage } from "./LogMeasurementPage";

/**
 * `/clients/:relationshipId/log-entry/*` (registered by Z8-15, filled by Z8-16):
 * a client's meal and body measurement, logged or corrected by the trainer.
 */
export function LogEntryRoutes() {
  return (
    <Routes>
      <Route path="meal/:assignmentId" element={<LogMealPage />} />
      <Route path="measurement" element={<LogMeasurementPage mode="create" />} />
      <Route path="measurement/:measurementId" element={<LogMeasurementPage mode="edit" />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
