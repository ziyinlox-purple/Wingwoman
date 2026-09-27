export interface ExecutionDriftInput {
  intendedAction: string;
  actualChanges: string;
  verification: string;
}

export interface ExecutionDriftRecord extends ExecutionDriftInput {
  driftDetected: boolean;
  requiresReplan: boolean;
  reason: string | null;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "to",
  "in",
  "of",
  "for",
  "with",
  "change",
  "changed",
  "modify",
  "modified",
  "update",
  "updated",
  "改",
  "修改",
  "更新",
]);

function keywords(value: string): Set<string> {
  const normalized = value.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
  return new Set(normalized.filter((token) => token.length > 1 && !STOP_WORDS.has(token)));
}

export function evaluateExecutionDrift(input: ExecutionDriftInput): ExecutionDriftRecord {
  const intended = keywords(input.intendedAction);
  const actual = keywords(input.actualChanges);
  const shared = [...intended].filter((token) => actual.has(token));
  const driftDetected = intended.size > 0 && actual.size > 0 && shared.length === 0;

  return {
    ...input,
    driftDetected,
    requiresReplan: driftDetected,
    reason: driftDetected
      ? "Actual changes do not overlap the intended action; stop execution and replan before continuing."
      : null,
  };
}
