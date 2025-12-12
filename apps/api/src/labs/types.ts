export interface ObjectiveResult {
  id: string;
  title: string;
  passed: boolean;
  hint?: string;
  details?: string;
}

export interface LabValidationResult {
  labId: string;
  passed: boolean;
  score: number;
  objectives: ObjectiveResult[];
}

export interface LabDefinition {
  id: string;
  title: string;
  description: string;
}
