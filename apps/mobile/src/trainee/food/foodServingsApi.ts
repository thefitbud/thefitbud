import type { FitBudApiClient } from "@fitbud/api-client";
import type {
  TraineeFoodDetail,
  TraineeFoodSearchResponse,
} from "@fitbud/contracts";
import { stage1Api } from "../../lib/stage1Api";
import type { ServingPresetV2 } from "./servingPresetsV2";
import { servingPresetsForFood } from "./servingPresetsV2";

type FoodItem = TraineeFoodSearchResponse["items"][number];

const detailCache = new Map<string, TraineeFoodDetail>();

export async function fetchTraineeFoodDetail(
  api: FitBudApiClient,
  foodId: string,
): Promise<TraineeFoodDetail> {
  const cached = detailCache.get(foodId);
  if (cached) return cached;
  const detail = await stage1Api(api).getTraineeFood(foodId);
  detailCache.set(foodId, detail);
  return detail;
}

export function servingPresetsFromDetail(
  detail: TraineeFoodDetail,
): ServingPresetV2[] {
  const ordered = detail.defaultServingId
    ? [
        ...detail.servings.filter((s) => s.id === detail.defaultServingId),
        ...detail.servings.filter((s) => s.id !== detail.defaultServingId),
      ]
    : detail.servings;
  return ordered.slice(0, 8).map((serving) => ({
    id: serving.id,
    label: serving.label,
    quantity: 1,
    servingId: serving.id,
  }));
}

export async function loadServingPresetsForFood(
  api: FitBudApiClient,
  item: FoodItem,
): Promise<ServingPresetV2[]> {
  try {
    const detail = await fetchTraineeFoodDetail(api, item.id);
    if (detail.servings.length > 0) {
      return servingPresetsFromDetail(detail);
    }
  } catch {
    // TODO(fallback): remove when every searchable food returns servings.
  }
  return servingPresetsForFood(item);
}
