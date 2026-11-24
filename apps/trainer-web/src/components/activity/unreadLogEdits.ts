import { createContext } from "react";

/**
 * Z14-16: meal entries whose "client changed a meal log" notification the trainer
 * has not read yet. The Activity page provides it; rows show a dot for these.
 */
export const UnreadLogEditsContext = createContext<ReadonlySet<string>>(new Set());
