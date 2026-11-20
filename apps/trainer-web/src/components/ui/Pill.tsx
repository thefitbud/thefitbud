import type { ReactNode } from "react";

export type PillTone = "done" | "neutral" | "crit" | "warn" | "info" | "coach" | "due";

const TONE_CLASS: Record<PillTone, string> = {
  done: "ui-p-done",
  neutral: "ui-p-neutral",
  crit: "ui-p-crit",
  warn: "ui-p-warn",
  info: "ui-p-info",
  coach: "ui-p-coach",
  due: "ui-p-due",
};

type Props = {
  tone: PillTone;
  icon?: ReactNode;
  children: ReactNode;
};

export function Pill({ tone, icon, children }: Props) {
  return (
    <span className={`ui-pill ${TONE_CLASS[tone]}`}>
      {icon}
      {children}
    </span>
  );
}
