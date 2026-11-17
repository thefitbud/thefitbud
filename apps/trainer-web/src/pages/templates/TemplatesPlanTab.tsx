/**
 * Z12-13: plan template cards moved into the unified Templates hub table
 * (`TemplatesHub.tsx`). This module keeps the export for files_owned and any
 * legacy imports; the hub owns list UI, filters, Use and fork.
 */
import type { PlanTemplateType } from "@fitbud/contracts";

export type TemplatesPlanTabProps = {
  templateType: PlanTemplateType;
  hubSlug: string;
};

export function TemplatesPlanTab(_props: TemplatesPlanTabProps): null {
  void _props;
  return null;
}
