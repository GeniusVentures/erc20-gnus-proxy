---
phase: 01-erc-20-proxy-hardening
plan: 06
type: execute
wave: 3
depends_on: ["01-04", "01-05"]
files_modified:
  - test/integration/GNUSAiIntegration.test.ts
  - test/deployment/ProxyDiamondDeployment.test.ts
  - test/deployment/ProxyDiamondPostDeploymentComparison.test.ts
autonomous: true
requirements: [PROXY-01, PROXY-02, enabler]

must_haves:
  truths:
    - "GNUSAiIntegration economics match the new pin: child mints burn GNUS 1:1 minion-denominated (no exchange-rate multiplication)"
    - "Both ProxyDiamond deployment suites pass against the callback-free config and the hardened facet"
    - "npx hardhat test (all suites) and yarn compile are green — the phase gate"
  artifacts:
    - path: "test/integration/GNUSAiIntegration.test.ts"
      provides: "new-pin-correct GeniusDiamond integration suite"
      contains: "burntSupply"
    - path: "test/deployment/ProxyDiamondDeployment.test.ts"
      provides: "callback-free ProxyDiamond deployment validation"
  key_links:
    - from: "test/integration/GNUSAiIntegration.test.ts"
      to: "nested GeniusDiamond mint/burn at 61b7ca4"
      via: "1:1 burn expectation equal to minted child amount"
      pattern: "1:1"
    - from: "test/deployment/*"
      to: "diamonds/ProxyDiamond/proxydiamond.config.json"
      via: "config-vs-deployed comparison against callback-free config"
      pattern: "proxydiamond\\.config\\.json"
---

<objective>
Align the remaining suites with the new pin and hardened facet: fix the stale exchange-rate burn assertions in GNUSAiIntegration.test.ts (Pitfall 5), rework the two ProxyDiamond deployment suites for the callback-free config and post-D-03 facet, then run the full-suite phase gate.

Purpose: closes the enabler's test debt and produces the single green run (all suites + compile + ABI regen) that /gsd:verify-work consumes.
Output: fully green test tree, ready for code review and PR.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-erc-20-proxy-hardening/01-RESEARCH.md (Pitfall 5, Validation Architecture sampling/phase gate)
@.planning/phases/01-erc-20-proxy-hardening/01-PATTERNS.md (sections: test/integration/GNUSAiIntegration.test.ts, test/deployment/*)
@.planning/phases/01-erc-20-proxy-hardening/01-02-lifecycle-linking-and-deploy-harness-PLAN.md (SUMMARY — A3 deployer decision to follow)
</context>

<tasks>

<task type="auto">
  <name>Task 1: GNUSAiIntegration economics rework — 1:1 minion-denominated burns</name>
  <files>test/integration/GNUSAiIntegration.test.ts</files>
  <read_first>
  test/integration/GNUSAiIntegration.test.ts lines 380-410 (single-mint burn assertion — the toWei(5.0 * 2.0) bug) and lines 440-476 (mintBatch burn expectation), plus each test's actual mint calls
  ../gnus-ai/test/unit/ERC1155ProxyOperator.test.ts lines 312-352 (the authoritative 1:1 pattern at the new pin: fund with mintAmount, 4-arg mint, supply check)
  </read_first>
  <action>
  First RUN the suite once against the bumped pin before editing assertions (npx hardhat test test/integration/GNUSAiIntegration.test.ts) and catalogue every failure — revert-string drift is expected at 61b7ca4 (e.g. the "Only Creators or Admins can create NFT child of GNUS" wording at line ~322 may have changed); fix assertions against observed behavior, keeping the rejectedWith(Error, /.../) regex style by loosening the regex where wording drifted rather than pinning new exact strings blindly.
  Then fix the economics: the burn assertion at lines ~403-407 (burntSupply === toWei(5.0 * 2.0), "Exchange rate: 2.0 GNUS burned per minted token") is WRONG at the new pin — Phase 9 changed child mint to 1:1 minion-denominated GNUS burn. Replace the exchange-rate expectation with the 1:1 rule: expected burn equals the total child amount minted in that test (read the actual mint arguments in scope; where the test mints parseEther-scaled amounts the burn equals the same amount; where it mints plain numbers the burn equals the plain sum — no exchange-rate multiplication anywhere). Apply the same treatment to the mintBatch test's burn expectation (lines ~457-476, amounts [50, 1, 1] — burn equals 52 at 1:1). createNFT's exchRate parameter is stored display-only; leave the calls' arguments as-is unless they now revert.
  Add setupLifecyclePolicyLinking() to the suite's before() before LocalDiamondDeployer.getInstance if the run shows an unresolved-library failure (the GeniusDiamond deploy needs it — same harness as Plan 02; follow the A3 deployer decision recorded in the Plan 02 SUMMARY if the local-copy migration applies here too).
  Keep the scaffold (describe loops, before()/snapshots lines 21-128, role-grant + mint beforeEach lines 212-248) unchanged.
  Commit scope: test(hardening): 1:1 minion-denominated burn expectations at new pin.
  </action>
  <verify>
    <automated>! grep -q "toWei(5.0 \* 2.0)" test/integration/GNUSAiIntegration.test.ts && ! grep -qi "exchange rate: 2.0" test/integration/GNUSAiIntegration.test.ts && npx hardhat test test/integration/GNUSAiIntegration.test.ts</automated>
  </verify>
  <acceptance_criteria>
  - Suite green against pin 61b7ca4
  - Zero exchange-rate-multiplication burn assertions remain (grep gates)
  - Burn expectations equal minted child amounts 1:1 in both the single-mint and mintBatch tests
  - Revert-string drift fixed via observed behavior, regex-style preserved
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: ProxyDiamond deployment suites on callback-free config + hardened facet</name>
  <files>test/deployment/ProxyDiamondDeployment.test.ts, test/deployment/ProxyDiamondPostDeploymentComparison.test.ts</files>
  <read_first>
  test/deployment/ProxyDiamondDeployment.test.ts (full — 227 lines; find callback/init-derived assertions)
  test/deployment/ProxyDiamondPostDeploymentComparison.test.ts (full — 229 lines; config-vs-deployed comparison logic)
  diamonds/ProxyDiamond/proxydiamond.config.json (post-Plan-01 state: no callbacks key)
  </read_first>
  <action>
  Rework both ProxyDiamond deployment suites for the two changes that hit them: (a) the deploy callback createXMPLToken no longer runs (deleted in Plan 01) — remove or rewrite any assertion premised on callback-initialized state (name "ExampleToken" / symbol "XMPL" present immediately after deploy, childTokenId == chainID, and any ERC20ProxyFacet callback wiring checks); the diamond now deploys UNINITIALIZED and initialization is an explicit, owner-only, one-shot act (the DEXFlow and unit fixtures demonstrate the pattern); (b) the facet's ABI surface is unchanged in shape (approve/allowance/transferFrom keep their IERC20Upgradeable signatures) but its storage semantics changed — config-vs-deployed comparisons should still validate facet registration and selectors; update any expected-selector list only if the aggregated ABI shifted.
  Follow the Plan 02 SUMMARY's A3 deployer decision for import consistency. These suites do NOT need lifecycle linking (they deploy only the ProxyDiamond — no lifecycle-linked facets), but if the shared LocalDiamondDeployer path requires it after any migration, add it exactly as Plan 02 did.
  Keep the multichain describe-loop scaffold untouched; change only callback/init-derived assertions and imports.
  Commit scope: test(hardening): proxy deployment suites on callback-free config.
  </action>
  <verify>
    <automated>! grep -q "createXMPLToken" test/deployment/ProxyDiamondDeployment.test.ts && ! grep -q "createXMPLToken" test/deployment/ProxyDiamondPostDeploymentComparison.test.ts && npx hardhat test test/deployment/ProxyDiamondDeployment.test.ts test/deployment/ProxyDiamondPostDeploymentComparison.test.ts</automated>
  </verify>
  <acceptance_criteria>
  - Both suites green; zero references to createXMPLToken or callback-initialized state
  - Config-vs-deployed comparison validates the callback-free config exactly as deployed
  - No suite imports a second deployer variant (consistent with the A3 decision)
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Phase gate — full suite + compile + follow-through record</name>
  <files>.planning/phases/01-erc-20-proxy-hardening/01-06-SUMMARY.md</files>
  <read_first>
  .planning/phases/01-erc-20-proxy-hardening/01-VALIDATION.md (sampling contract and sign-off boxes)
  package.json scripts (test, clean, compile, diamond:generate-*-abi-typechain)
  </read_first>
  <action>
  Run the phase gate: yarn clean, then yarn compile (hardhat compile + both diamond ABI/typechain regenerations against the final facet and configs), then npx hardhat test (full tree: unit + integration + deployment). All must be green in one pass. Capture the final counts (passing/failing, suites) in the SUMMARY.
  Then write the SUMMARY with three follow-through records: (1) the outer TokenContracts repo pin-bump of THIS submodule is the next multi-repo step and is deliberately OUTSIDE this repo's plans (commit here first, then pin-bump outer — per PROJECT.md multi-repo protocol); (2) explicit non-work this phase: RPC deployment fixtures under test-assets/deployments-test/** are stale-but-unused by local suites and were NOT regenerated; test-assets/** import renames were intentionally skipped; diamonds/GeniusDiamond/geniusdiamond-sepolia-v2.5-step1.config.json left as historical artifact; increaseAllowance/decreaseAllowance intentionally not added per D-02; SWC-114 accepted per D-02 (do not "fix"); (3) branch/PR state — work committed on gsd/phase-1-erc-20-proxy-hardening targeting develop (never main), with /gsd:code-review as the required pre-PR gate per project rules.
  Do not git add any of: cache_hardhat/, openzeppelin-contracts-diamond/, openzeppelin-transpiler/, sushi-list/, package-lock.json, coverage/, coverage.json.
  Commit scope: chore(hardening): phase 1 full-suite gate.
  </action>
  <verify>
    <automated>yarn clean && yarn compile && npx hardhat test</automated>
  </verify>
  <acceptance_criteria>
  - yarn clean && yarn compile exits 0 (ABI regeneration included)
  - npx hardhat test exits 0 across all suites in one pass
  - SUMMARY records: outer pin-bump follow-through, the explicit non-work list, PR/branch/ review-gate state
  - Git index contains no forbidden artifacts
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| stale assertions -> new-pin contract behavior | Test expectations are the specification here; wrong economics assertions would mask a real burn-math regression |
| deployment suites -> configs | Config-vs-deployed comparisons guard against silent facet-registration drift |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-1-14 | Repudiation/Tampering (specification drift) | GNUSAiIntegration burn assertions | mitigate | Fix to the 1:1 rule derived from gnus-ai's current tests (authoritative pattern), run-first-then-edit workflow captures real revert strings instead of assumptions |
| T-1-10 | Tampering (config/deploy drift) | ProxyDiamond deployment suites | mitigate | Keep config-vs-deployed comparison intact; remove only callback-premised assertions |
| T-1-15 | Denial of Service (gate integrity) | phase gate | mitigate | Single-pass full-suite + clean compile + ABI regen; forbidden-artifact index check keeps the repo reproducible |
</threat_model>

<verification>
- Per-suite green commands in Tasks 1-2; full-tree gate in Task 3
- Gate output archived in the SUMMARY for /gsd:verify-work consumption
</verification>

<success_criteria>
- Every suite in the repo green on the bumped pins with the hardened facet
- Phase-level validation contract (01-VALIDATION.md) fully satisfiable — all rows executable and green
- Multi-repo follow-through and non-work explicitly recorded for the verifier
</success_criteria>

<output>
Create .planning/phases/01-erc-20-proxy-hardening/01-06-SUMMARY.md when done (must include the follow-through and non-work records)
</output>
