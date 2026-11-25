import {
  AlignLeft,
  Camera,
  CircleCheck,
  CircleDot,
  Gauge,
  Hash,
  ListChecks,
  MessageSquare,
  Moon,
  Ruler,
  Scale,
  Type,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { CheckinStandardKey } from "@fitbud/contracts";
import type { CheckinBuilderFieldType } from "./checkinBuilder";

const STANDARD_ICONS: Partial<Record<CheckinStandardKey, LucideIcon>> = {
  weight: Scale,
  waist: Ruler,
  hips: Ruler,
  chest: Ruler,
  arm: Ruler,
  thigh: Ruler,
  photo_front: Camera,
  photo_side: Camera,
  photo_back: Camera,
  energy: Zap,
  sleep_quality: Moon,
  stress: Gauge,
  hunger: Utensils,
  notes: MessageSquare,
};

export function standardRowIcon(key: CheckinStandardKey): LucideIcon {
  return STANDARD_ICONS[key] ?? Gauge;
}

const TYPE_ICONS: Record<CheckinBuilderFieldType, LucideIcon> = {
  short_text: Type,
  long_text: AlignLeft,
  single_choice: CircleDot,
  multiple_choice: ListChecks,
  number: Hash,
  yes_no: CircleCheck,
  measurement: Ruler,
  photo_intent: Camera,
  scale_1_5: Gauge,
};

export function typeRowIcon(type: CheckinBuilderFieldType): LucideIcon {
  return TYPE_ICONS[type];
}
