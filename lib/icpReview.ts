// The editable "rubric" for the advisory ICP review. This is the ONLY part a user can change (from
// the "What does the AI review check?" window). The surrounding scaffolding — the intro, the ICP
// content injection, and the report_review tool-call / `ok` semantics — stays fixed in code
// (buildReviewPrompt below) so the structured-output contract can never be broken by an edit.
// Stored in app_settings under `icp_review_instructions`; this constant is the default/fallback and
// the seed shown in the UI until someone edits it.
export const DEFAULT_ICP_REVIEW_INSTRUCTIONS = `Judge ONLY whether the text works as instructions. Do NOT judge the business strategy or whether the criteria are "correct" — only whether an AI could apply it consistently. Check that it includes, and states clearly:
1. The target market / who qualifies (geography and company type).
2. Priority tiers or archetypes to classify companies into (e.g. early mover / follower / enabler, or similar).
3. A scoring method — how points or criteria produce a fit score, and how that maps to a rating scale (e.g. 1–5 stars).
4. Hard exclusion rules (who to drop outright).
5. Internal consistency — no contradictions, no undefined terms, nothing left dangling.

Mark an issue "critical" if a scorer genuinely could not proceed (e.g. no scoring method at all, or empty/nonsense), and "minor" if it would still work but could be clearer.`;

export const ICP_REVIEW_INSTRUCTIONS_KEY = "icp_review_instructions";

// Wraps the editable instructions in the fixed scaffolding. `instructions` is user-editable;
// everything else here is structural and must not be exposed to editing.
export function buildReviewPrompt(instructions: string, marketLabel: string, content: string): string {
  return `You are reviewing a draft "Ideal Customer Profile" (ICP) document. This exact text is fed to another AI that scores supplement companies as potential B2B customers — it must read as clear, unambiguous scoring instructions for the ${marketLabel} market.

${instructions.trim()}

Draft ICP to review:
---
${content}
---

Report your assessment by calling the report_review tool. Set "ok" to true if there are no critical issues (minor issues are fine), false otherwise. Use an empty issues array if the document is clear and complete.`;
}
