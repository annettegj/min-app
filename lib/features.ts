// Feature flags. Nothing here deletes functionality — it just gates it so it can be switched back on
// in ONE place.
//
// US_MARKET_ENABLED: US-market support (the US ICP sub-tab, the "US" / "No preference" target-market
// options, and US-ICP routing in Step 3) is fully BUILT but intentionally OFF for now — stakeholders
// haven't opted into US yet. While false: the ICP tab shows the US sub-tab as a disabled placeholder,
// the target-market selector is locked to Europe, and Step 3 scores everything against the European
// ICP. Flip to true to re-enable all of it at once.
export const US_MARKET_ENABLED = false;
