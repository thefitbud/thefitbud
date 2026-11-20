import type { ReactNode } from "react";

export type TableColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
};

type Props = {
  columns: TableColumn[];
  rows: Record<string, ReactNode>[];
  compact?: boolean;
  caption: string;
};

export function Table({ columns, rows, compact = false, caption }: Props) {
  return (
    <table className={`ui-table${compact ? " is-compact" : ""}`}>
      <caption className="ui-t-meta" style={{ textAlign: "left", padding: "0 0 8px" }}>
        {caption}
      </caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} className={column.align === "right" ? "is-r" : undefined} scope="col">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {columns.map((column) => (
              <td key={column.key} className={column.align === "right" ? "is-r" : undefined}>
                {row[column.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
