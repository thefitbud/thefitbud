export type Kpi = {
  key: string;
  /** The caption under the number: "Latest · Sun 15 Nov". */
  label: string;
  /** The number, as formatted text: "64.2", "−2.9", "17 of 24". */
  value: string;
  /** The small unit after the number: "kg", "kg / wk". */
  unit?: string;
};

type Props = {
  items: Kpi[];
};

/** The KPI row above a chart (frame W-160): number first, caption below. No percentages. */
export function KpiRow({ items }: Props) {
  return (
    <dl className="pg-kpis" data-testid="pg-kpis">
      {items.map((item) => (
        <div key={item.key} className="pg-kpi" data-testid={`pg-kpi-${item.key}`}>
          <dt className="pg-kpi-l">{item.label}</dt>
          <dd className="pg-kpi-v">
            {item.value}
            {item.unit ? <small>{item.unit}</small> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Weeks between two civil dates, or null when they are under a week apart. */
export function weeksBetween(from: string, to: string): number | null {
  const day = (date: string) => {
    const [y, m, d] = date.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  const days = day(to) - day(from);
  return days >= 7 ? days / 7 : null;
}

const NUMBER = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const ONE_DECIMAL = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

/** A value split for a KPI: "64.2" and "kg" (a 1 to 5 rating has the unit "of 5"). */
export function kpiValue(
  value: number,
  unit: string | null,
): Pick<Kpi, "value" | "unit"> {
  return { value: NUMBER.format(value), unit: unit ?? "of 5" };
}

/** A signed difference split for a KPI: "−2.9" and "kg". */
export function kpiDifference(
  value: number,
  unit: string | null,
  perWeek = false,
): Pick<Kpi, "value" | "unit"> {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  const suffix = perWeek ? " / wk" : "";
  return {
    value: `${sign}${ONE_DECIMAL.format(Math.abs(rounded))}`,
    unit: unit ? `${unit}${suffix}` : perWeek ? "/ wk" : undefined,
  };
}

/** "17 of 24": workouts finished and planned in the range. No percentage. */
export type WorkoutsKpi = { completed: number; planned: number };

export function workoutsKpi(
  counts: WorkoutsKpi | null,
  label: string,
): Kpi | null {
  if (!counts || (counts.completed === 0 && counts.planned === 0)) return null;
  return {
    key: "workouts",
    label,
    value: `${counts.completed} of ${counts.planned}`,
  };
}
