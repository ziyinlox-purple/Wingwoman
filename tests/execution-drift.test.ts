import { describe, expect, it } from "vitest";
import { evaluateExecutionDrift } from "../src/execution/drift.js";

describe("execution drift", () => {
  it("D. detects drift when Codex planned to change A but the diff changed B", () => {
    const record = evaluateExecutionDrift({
      intendedAction: "Update the auth router to reject expired pairing codes",
      actualChanges: "Changed the billing dashboard copy and invoice table styles",
      verification: "Typecheck passed",
    });

    expect(record).toMatchObject({
      driftDetected: true,
      requiresReplan: true,
    });
    expect(record.reason).toContain("replan");
  });

  it("does not flag drift when actual changes match the intended target", () => {
    const record = evaluateExecutionDrift({
      intendedAction: "Update the auth router to reject expired pairing codes",
      actualChanges: "Updated auth router validation and added expired pairing code coverage",
      verification: "Auth tests passed",
    });

    expect(record.driftDetected).toBe(false);
    expect(record.requiresReplan).toBe(false);
  });
});
