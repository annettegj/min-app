// Shared types/const for the ICP "Test on example companies" feature. The example set is a fixed,
// user-editable list stored in app_settings under ICP_TEST_COMPANIES_KEY (JSON of IcpTestExample[]).
// Each example carries an "expected" category so the test can show expected-vs-actual and flag drift.
export const ICP_TEST_COMPANIES_KEY = "icp_test_companies";

export type ExpectedCategory = "early_mover" | "follower" | "enabler" | "reject" | "";

export type IcpTestExample = { name: string; expected: ExpectedCategory };

// Labels for the UI dropdown / display.
export const EXPECTED_LABELS: { value: ExpectedCategory; label: string }[] = [
  { value: "early_mover", label: "Early mover" },
  { value: "follower", label: "Follower" },
  { value: "enabler", label: "Enabler" },
  { value: "reject", label: "Reject (should be excluded)" },
  { value: "", label: "No expectation" },
];

// Whether the actual result matches the expectation. `included` + actual `tier` come from the test;
// `expected` is the user's label. Returns "ok" | "mismatch" | "none" (no expectation set).
export function expectedMatch(
  expected: ExpectedCategory,
  included: boolean,
  actualTier: string
): "ok" | "mismatch" | "none" {
  if (!expected) return "none";
  if (expected === "reject") return included ? "mismatch" : "ok";
  // A tier expectation: must be included AND classified as that tier.
  return included && actualTier === expected ? "ok" : "mismatch";
}
