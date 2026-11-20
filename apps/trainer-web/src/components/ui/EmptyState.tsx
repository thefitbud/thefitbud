import type { ReactNode } from "react";

type Props = {
  icon: ReactNode;
  title: string;
  meta?: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, meta, action }: Props) {
  return (
    <div className="ui-card ui-empty">
      <div className="ui-empty-tile">{icon}</div>
      <b className="ui-t-h3">{title}</b>
      {meta ? <span className="ui-t-meta">{meta}</span> : null}
      {action}
    </div>
  );
}
