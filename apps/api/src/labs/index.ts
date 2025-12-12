import type { World } from "../sim/world.js";

import { ccna001, validateCcna001 } from "./ccna001.js";
import type { LabDefinition, LabValidationResult } from "./types.js";

export const labs: LabDefinition[] = [ccna001];

export function validateLab(labId: string, world: World): LabValidationResult | null {
  switch (labId) {
    case ccna001.id:
      return validateCcna001(world);
    default:
      return null;
  }
}
