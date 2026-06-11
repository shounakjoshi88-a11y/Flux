// backend/orchestrator/verifier.ts
// Verifies phase results against defined success criteria.

import type { Phase, PhaseResult, VerificationOutcome } from "./types";

export class Verifier {
  verify(phase: Phase, result: PhaseResult): VerificationOutcome {
    const results = phase.criteria.map((c) => {
      switch (c.type) {
        case "has_sources":
          return {
            criterion: c,
            passed: result.sources.length > 0,
            detail: result.sources.length > 0
              ? `${result.sources.length} source(s) found`
              : "No sources found",
          };

        case "min_sources":
          return {
            criterion: c,
            passed: result.sources.length >= (c.minCount ?? 1),
            detail: `${result.sources.length}/${c.minCount} sources`,
          };

        case "has_file":
          return {
            criterion: c,
            passed: result.files.length > 0,
            detail: result.files.length > 0
              ? `File "${result.files[0]?.filename}" generated`
              : "No file generated",
          };

        case "has_skill_content":
          return {
            criterion: c,
            passed: result.skillContent.length > 100,
            detail: result.skillContent.length > 100
              ? `Skill content loaded (${result.skillContent.length} chars)`
              : `Skill content too short (${result.skillContent.length} chars)`,
          };

        case "has_text_output":
          return {
            criterion: c,
            passed: result.text.trim().length > 20,
            detail: result.text.trim().length > 20
              ? `Text output generated (${result.text.length} chars)`
              : "Text output too short or empty",
          };

        default:
          return { criterion: c, passed: true, detail: "Unknown criterion" };
      }
    });

    const passed = results.every((r) => r.passed);
    return { passed, results };
  }
}
