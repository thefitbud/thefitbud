import type { TraineeFoodSearchResponse } from "@fitbud/contracts";

export type ServingPresetV2 = {
  id: string;
  label: string;
  quantity: number;
  servingId?: string;
};

type FoodItem = TraineeFoodSearchResponse["items"][number];

const NAME_PRESETS: Array<{ match: RegExp; presets: Omit<ServingPresetV2, "id">[] }> =
  [
    {
      match: /roti|chapati|phulka/i,
      presets: [
        { label: "1 roti", quantity: 1 },
        { label: "2 roti", quantity: 2 },
        { label: "½ roti", quantity: 0.5 },
      ],
    },
    {
      match: /dal|sambar|curry|sabzi/i,
      presets: [
        { label: "1 katori", quantity: 1 },
        { label: "½ katori", quantity: 0.5 },
        { label: "1½ katori", quantity: 1.5 },
      ],
    },
    {
      match: /rice|khichdi|biryani/i,
      presets: [
        { label: "1 katori", quantity: 1 },
        { label: "½ katori", quantity: 0.5 },
        { label: "1 plate", quantity: 1.5 },
      ],
    },
    {
      match: /milk|lassi|shake/i,
      presets: [
        { label: "1 glass", quantity: 1 },
        { label: "½ glass", quantity: 0.5 },
        { label: "1 cup", quantity: 1 },
      ],
    },
  ];

const DEFAULT_PRESETS: Omit<ServingPresetV2, "id">[] = [
  { label: "½ serving", quantity: 0.5 },
  { label: "1 serving", quantity: 1 },
  { label: "1½ serving", quantity: 1.5 },
  { label: "2 servings", quantity: 2 },
];

/** TODO(fallback): remove when GET /me/foods/:id always succeeds for search hits. */
export function servingPresetsForFood(item: FoodItem): ServingPresetV2[] {
  const matched =
    NAME_PRESETS.find((row) => row.match.test(item.name))?.presets ??
    DEFAULT_PRESETS;
  return matched.map((preset, index) => ({
    ...preset,
    id: `${item.id}-heuristic-${index}`,
    servingId: item.defaultServingId ?? undefined,
  }));
}

export const PORTION_MULTIPLIER_CHIPS = [
  { label: "½×", multiplier: 0.5 },
  { label: "¾×", multiplier: 0.75 },
  { label: "1¼×", multiplier: 1.25 },
  { label: "1½×", multiplier: 1.5 },
] as const;
