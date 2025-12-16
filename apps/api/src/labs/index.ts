import type { World } from "../sim/world.js";

import { ccna001, validateCcna001 } from "./ccna001.js";
import { ccna002, validateCcna002 } from "./ccna002.js";
import { pc001, validatePc001 } from "./pc001.js";
import type { LabDefinition, LabValidationResult } from "./types.js";

export const labs: LabDefinition[] = [ccna001, ccna002, pc001];

export function validateLab(labId: string, world: World): LabValidationResult | null {
  switch (labId) {
    case ccna001.id:
      return validateCcna001(world);
    case ccna002.id:
      return validateCcna002(world);
    case pc001.id:
      return validatePc001(world);
    default:
      return null;
  }
}
