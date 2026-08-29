---
phase: 01-erc-20-proxy-hardening
plan: 06
subsystem: tests
tags: [solidity, erc20, erc1155, integration, deployment, regression, phase-gate, hardening]

# Dependency graph
requires:
  - "01-01: pinned deps + 0.8.19 + submodule pins 61b7ca4/dfebdf0 — the pin the 1:1 economics are asserted against"
  - "01-02: linking harness — the lazy installLazyLifecyclePolicyLinker wiring is what lets GNUSAiIntegration deploy standalone without an eager call"
  - "01-03: hardened ERC20ProxyFacet — the 10-selector surface the config-vs-deployed comparison validates"
  - "01-04: unit suite + snapshot-pool learnings; 01-05: DEXFlow + localDiamondDeployerKey + pre-creation childCurIndex pattern (reused here for the mintBatch rework)"
provides:
  - "Phase 1 exit gate GREEN in a single pass: yarn clean && yarn compile (both diamond ABI/typechain regenerations) exit 0 + npx hardhat test 85 passing / 0 failing across all 6 suites"
  - "GNUSAiIntegration suite at the new-pin economics: 1:1 minion-denominated burn assertions in both the single-mint (toWei(5)) and mintBatch (52 = 50+1+1) tests"
  - "Both ProxyDiamond deployment suites tsc-clean and aligned to the callback-free config; all 5 phase-owned tsc source errors resolved (npx tsc --noEmit exit 0)"
affects: [phase-1-exit, /gsd:verify-work, /gsd:code-review, the outer TokenContracts pin-bump follow-through]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct-children-only factory mint at 61b7ca4: GNUSNFTFactory.beforeMint's D6 gate ((id >> 128) == GNUS_TOKEN_ID) permanently blocks factory mint/mintBatch of grandchildren ('Direct children only; use convert() for descendants') — batch-mint tests must batch direct children of GNUS created in-suite"
    - "maxSupply enforcement relocated to the linked GNUSLifecyclePolicy.enforceMintGate, evaluated POST supply-increment in the _beforeTokenTransfer hook — the first over-cap mint of a direct child still reverts 'Max Supply for NFT would be exceeded'"
    - "Deterministic fresh child IDs without hardcoding: getNFTInfo(GNUS_TOKEN_ID).childCurIndex read BEFORE createNFTs (applied to the gnus-ai-side integration suite the same way 01-05 applied it to DEXFlow)"

key-files:
  created:
    - .planning/phases/01-erc-20-proxy-hardening/01-06-SUMMARY.md
  modified:
    - test/integration/GNUSAiIntegration.test.ts
    - test/deployment/ProxyDiamondDeployment.test.ts
    - test/deployment/ProxyDiamondPostDeploymentComparison.test.ts

key-decisions:
  - "mintBatch test reworked to three fresh DIRECT children of GNUS (same [100,1,1] supply limits) — the plan's '[50,1,1] burn equals 52' intent is unachievable over grandchildren at the new pin (D6 depth gate), observed run-first as predicted"
  - "The old mintBatch test's logging-only tail (its own TODO lamented the missing assertion) replaced with real assertions: burn === 52n plus recipient balanceOfBatch checks"
  - "setupLifecyclePolicyLinking NOT added to GNUSAiIntegration: the plan made it conditional on an unresolved-library failure and the standalone run deployed clean — the lazy linker wired in hardhat.config.ts (01-02) covers this process; the conditional did not fire"
  - "ProxyDiamondDeployment config made explicit (chainId, writeDeployedDiamondData: false, proxydiamond.config.json path), replacing stale commented lines that referenced the wrong directory (diamonds/GeniusDiamond/proxydiamond.config.json)"

patterns-established:
  - "Run-first-then-edit paid off: the standalone catalogue reproduced exactly the 2 baseline failures with precise signatures (burn === toWei(5) confirming 1:1; 'Direct children only' revealing the dead grandchild premise) before any edit was made"

requirements-completed: [PROXY-01, PROXY-02, enabler]

# Metrics
duration: 7min
completed: 2026-08-29
---

# Phase 1 Plan 6: Integration Deployment Rework and Phase Gate Summary

**Aligned the last three suites with the new pin and closed the phase: GNUSAiIntegration now asserts 1:1 minion-denominated burns in both mint tests (the mintBatch test reworked to direct children of GNUS after the D6 depth gate made grandchildren factory-unmintable), both ProxyDiamond deployment suites run tsc-clean against the callback-free config, and the phase gate passed in a single pass — `yarn clean && yarn compile` (both diamond ABI/typechain regenerations) exit 0 and `npx hardhat test` 85 passing / 0 failing across all 6 suites.**

## Performance

- **Duration:** ~7 min (2026-08-29T23:14:30Z → 2026-08-29T23:21:48Z)
- **Tasks:** 3 (all auto, no checkpoints)
- **Files:** 1 created (this SUMMARY), 3 modified

## Task Commits

1. **Task 1: GNUSAiIntegration economics rework — 1:1 minion-denominated burns** — `4f57807` (test)
2. **Task 2: ProxyDiamond deployment suites on callback-free config + hardened facet** — `bea622d` (test)
3. **Task 3: Phase gate + this SUMMARY** — `chore(hardening): phase 1 full-suite gate` (docs)

## Accomplishments

- **Task 1 (`4f57807`):** ran the suite standalone FIRST and catalogued exactly the 2 baseline failures (13 passing / 2 failing) with precise signatures: the single-mint burn measured `toWei(5)` (confirming the 1:1 rule empirically) and the mintBatch over-supply attempt reverted `Direct children only; use convert() for descendants` (not the expected `Max Supply...`). Root-caused in the pinned source: `GNUSNFTFactory.beforeMint` line 93 gates factory mints to direct children of GNUS (`(id >> 128) == GNUS_TOKEN_ID`), making the old grandchildren-of-Addr1 batch permanently unmintable. Fixed the single-mint assertion to `burntSupply === toWei(5.0)` (burn equals minted amount, no exchange-rate multiplication); reworked the mintBatch test to create three fresh direct children of GNUS (IDs captured from pre-creation `childCurIndex`, the 01-05 pattern) with the same `[100, 1, 1]` supply limits — the over-supply rejection still fires `Max Supply for NFT would be exceeded` (the gate now lives in the linked `GNUSLifecyclePolicy.enforceMintGate`, verified post-supply-increment so the first over-cap mint reverts), the valid `[50, 1, 1]` batch succeeds, and the previously-missing burn assertion was added (`burntSupply === 52n`) along with recipient `balanceOfBatch` checks replacing the logging-only tail. Also fixed the file's tsc cast error. Suite: **15 passing / 0 failing**.
- **Task 2 (`bea622d`):** both ProxyDiamond deployment suites reworked for the callback-free config. Verified zero `createXMPLToken` / callback-initialized-state references remained (the callback and its premises were already gone — Plan 01 deleted the callback; these suites never asserted name/symbol/childTokenId post-deploy). `ProxyDiamondDeployment.test.ts` config block made explicit (`chainId`, `writeDeployedDiamondData: false`, `diamonds/ProxyDiamond/proxydiamond.config.json`), replacing stale commented lines referencing the wrong directory; both suites' tsc errors fixed with the repo conventions (`provider as any`, `as unknown as LocalDiamondDeployerConfig`). Config-vs-deployed comparison validates the hardened facet's exact 10-selector surface (allowance, approve, balanceOf, decimals, initializeERC20Proxy, name, symbol, totalSupply, transfer, transferFrom). Local deployer import unchanged per the A3 decision; no lifecycle linking needed (ProxyDiamond has no linked facets). Suites: **10 passing / 0 failing**.
- **Task 3 (this commit):** the phase gate — see below.

## Phase Gate Result (06-T3 / the phase exit gate)

```
yarn clean && yarn compile && npx hardhat test
```

- `yarn clean && yarn compile`: **exit 0** — hardhat compile + `diamond:generate-proxy-abi-typechain` + `diamond:generate-gnus-abi-typechain` both regenerated against the final facet and configs
- `npx hardhat test`: **85 passing / 0 failing** — single pass, all suites:

| Suite | Tests |
|---|---|
| test/deployment/GeniusDiamondDeployment.test.ts | 17 |
| test/deployment/ProxyDiamondDeployment.test.ts | 7 |
| test/deployment/ProxyDiamondPostDeploymentComparison.test.ts | 3 |
| test/integration/DEXFlow.test.ts | 9 |
| test/integration/GNUSAiIntegration.test.ts | 15 |
| test/unit/ERC20ProxyFacet.test.ts | 34 |
| **Total** | **85** |

- `npx tsc --noEmit`: **exit 0** — all 5 phase-owned source errors resolved; the transient generated typechain-types errors (documented 01-01 deferral) are absent in the clean-regenerated state
- Git index clean of forbidden artifacts (no cache_hardhat/, openzeppelin-contracts-diamond/, openzeppelin-transpiler/, sushi-list/, package-lock.json, coverage/, coverage.json staged in any commit)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] mintBatch test premise is dead at the new pin (D6 depth gate)**
- **Found during:** Task 1 (run-first catalogue: over-supply mintBatch reverted `Direct children only; use convert() for descendants`, not `Max Supply for NFT would be exceeded`)
- **Issue:** The plan assumed the `[50, 1, 1]` mintBatch over grandchildren of Addr1 still succeeds and burns 52. At 61b7ca4, `GNUSNFTFactory.beforeMint` (line 93) permanently blocks factory minting of anything deeper than direct children of GNUS — descendants must be issued via `GNUSTreasury.convert`. Both the over-supply AND the valid grandchild batch revert unconditionally.
- **Fix:** Reworked the test to three fresh direct children of GNUS created in-test with the same `[100, 1, 1]` supply limits (IDs from pre-creation `childCurIndex`, deterministic and snapshot-isolated). The over-supply rejection is preserved — verified from source that the maxSupply gate now lives in the linked `GNUSLifecyclePolicy.enforceMintGate` and evaluates the POST-increment supply, so the first over-cap mint still reverts with the exact original string. The 1:1 burn assertion the plan requires (`burn === 52`) is honored over the new IDs.
- **Files modified:** test/integration/GNUSAiIntegration.test.ts
- **Commit:** 4f57807

**2. [Rule 1 - Bug] Stale exchange-rate comment tripped the plan's own grep gate**
- **Found during:** Task 1 (verify gate `! grep -qi "exchange rate: 2.0"` failed on a beforeEach comment)
- **Issue:** The beforeEach `createNFT(..., 2.0, ...)` carried the comment "Exchange rate: 2.0 tokens for 1 GNUS token" — misleading at the new pin (exchRate is display-only) and failing the plan's literal gate.
- **Fix:** Comment updated to "display-only at the new pin — no burn multiplication"; the argument itself left as-is per the plan's explicit instruction.
- **Files modified:** test/integration/GNUSAiIntegration.test.ts
- **Commit:** 4f57807

**3. [Rule 3 - Blocking] The 4 remaining deployment-suite tsc errors**
- **Found during:** Task 2 (baseline: 5 source errors, 4 in the deployment suites)
- **Issue:** Provider-type mismatch (`@ethersproject/providers` vs ethers-v6 JsonRpcProvider in `networkProviders.set`) and the unsafe `as LocalDiamondDeployerConfig` cast.
- **Fix:** The repo conventions already used by the green suites — `ethers.provider as any` for the provider sets, `as unknown as LocalDiamondDeployerConfig` for the config cast (the 01-02/01-04 fix pattern).
- **Files modified:** test/deployment/ProxyDiamondDeployment.test.ts, test/deployment/ProxyDiamondPostDeploymentComparison.test.ts
- **Commit:** bea622d

### Documented design notes (planned or plan-conformant)

**4. setupLifecyclePolicyLinking NOT added to GNUSAiIntegration**
The plan's instruction was explicitly conditional ("if the run shows an unresolved-library failure"). The standalone run deployed the GeniusDiamond cleanly — the lazy linker wired via `extendEnvironment` in hardhat.config.ts (Plan 02) covers every process. The conditional did not fire; adding the eager call anyway would have violated minimal change.

**5. mintBatch logging tail replaced with assertions (beyond the plan's literal scope)**
The reworked test's tail could not keep the old grandchild-ID debug loop (the IDs no longer exist in the test). Rather than port dead logging, the old TODO ("There is no test at the end of all this processing") was resolved with a recipient `balanceOfBatch` assertion. Strengthens the test; documented here because it is a structural change to a test body the plan only asked to re-economics.

**Total deviations:** 3 auto-fixed (Rules 1/3) + 2 documented notes
**Impact on plan:** All acceptance criteria met.

## Verification

- Task 1 gate: `! grep "toWei(5.0 * 2.0)"` + `! grep -i "exchange rate: 2.0"` both pass; `npx hardhat test test/integration/GNUSAiIntegration.test.ts` → **15 passing / 0 failing**
- Task 2 gate: `! grep "createXMPLToken"` in both suites (0 occurrences); `npx hardhat test test/deployment/ProxyDiamondDeployment.test.ts test/deployment/ProxyDiamondPostDeploymentComparison.test.ts` → **10 passing / 0 failing**
- Task 3 gate (the phase gate): `yarn clean && yarn compile && npx hardhat test` → compile exit 0, **85 passing / 0 failing**
- `npx tsc --noEmit` → exit 0 (zero errors)
- No tracked-file deletions in any commit; no new untracked files from this plan beyond the SUMMARY

## Follow-Through Records (Task 3 required content)

### 1. Outer repo pin-bump — the next multi-repo step, deliberately OUTSIDE this repo's plans

Per PROJECT.md's multi-repo protocol (commit inside this submodule first, then pin-bump the outer repo): all Phase 1 work is committed on this submodule's `gsd/phase-1-erc-20-proxy-hardening` branch. The **outer TokenContracts repo must next pin-bump its `erc20-gnus-proxy` submodule pointer** to this branch's merged state (via the develop PR below). That pin-bump is the next multi-repo step and is intentionally not part of any plan in this repo's `.planning/`.

### 2. Explicit non-work this phase (recorded for the verifier — none of this is accidental omission)

- **RPC deployment fixtures** under `test-assets/deployments-test/**` are stale-but-unused by local suites (no test/script/hardhat.config reference imports them; the only `test-assets` mention in code is an unrelated devops output path). **NOT regenerated.**
- **`test-assets/**` import renames** (the `diamonds`/`hardhat-diamonds` → `@geniusventures/*` fallout flagged in 01-PATTERNS): **intentionally skipped** — nothing in the active test tree imports from test-assets.
- **`diamonds/GeniusDiamond/geniusdiamond-sepolia-v2.5-step1.config.json`**: left as a **historical artifact** (verified present).
- **`increaseAllowance`/`decreaseAllowance`**: intentionally NOT added per D-02 (not required by D-01/D-02; the GNUSBridge parity surface was scoped to approve/allowance/transferFrom semantics).
- **SWC-114** (approve race pattern): **accepted per D-02 — do not "fix"**. The direct-overwrite semantics are the locked design; a USDT-style zero-first requirement was explicitly rejected.

### 3. Branch / PR / review-gate state

- All work is on **`gsd/phase-1-erc-20-proxy-hardening`** in this submodule, targeting **`develop`** (never `main`) per PROJECT.md branch conventions.
- **`/gsd:code-review` is the required pre-PR gate** for this phase per project rules — it must be run (with Critical/Warning findings resolved) before any PR is created; the PR itself opens in draft mode first.
- Not yet done at SUMMARY time: the develop PR, the code review, and the outer pin-bump (items 1 and 3 are the handoff sequence: code-review → draft PR → merge → outer pin-bump).

## Files Created/Modified

- `test/integration/GNUSAiIntegration.test.ts` — 1:1 burn assertions (single-mint + mintBatch), mintBatch reworked to direct children of GNUS, tsc cast fix
- `test/deployment/ProxyDiamondDeployment.test.ts` — explicit callback-free config, provider casts, tsc clean
- `test/deployment/ProxyDiamondPostDeploymentComparison.test.ts` — tsc cast fix
- `.planning/phases/01-erc-20-proxy-hardening/01-06-SUMMARY.md` — this file

## Issues Encountered

- None blocking. The D6 depth gate discovery (Deviation 1) was resolved in one root-cause pass from the pinned contract source; the 01-05 on-chain finding (isApprovedForAll override answers the view only) explains why no burn-assertion drift appeared beyond the economics — the NFTFactory path never touches the operator plane.

## Deferred Issues (out of scope, discovered during execution)

- None new. Standing pre-existing deferrals (01-01): `typechain-types/` untracked, `.yarn/install-state.gz` tracked-but-modified, `.planning/config.json` untracked (orchestrator-owned), transient generated typechain-types tsc errors after diamonds-ABI compile cycles.

## User Setup Required

None.

## Known Stubs

None — all suites are fully functional; no placeholder code.

## Threat Surface

No new security-relevant surface beyond the plan's threat model. Mitigations delivered:
- **T-1-14** (specification drift in burn assertions): both burn expectations now pin the 1:1 rule derived from the pinned contract source AND empirically observed (run-first workflow); the mintBatch test additionally asserts recipient balances
- **T-1-10** (config/deploy drift): config-vs-deployed comparison intact and green against the hardened facet's 10-selector surface; only the stale config comments changed
- **T-1-15** (gate integrity): single-pass full-suite + clean compile + both ABI regenerations green; no forbidden artifacts staged

## Next Phase Readiness

- Phase 1 is COMPLETE: every suite green at the bumped pins with the hardened facet; the 01-VALIDATION.md rows 06-T1/06-T2/06-T3 are all executable and green.
- Handoff: `/gsd:code-review` (pre-PR gate) → draft PR `gsd/phase-1-erc-20-proxy-hardening` → `develop` → outer TokenContracts pin-bump.

## Self-Check: PASSED

- Commit 4f57807 (Task 1) found on gsd/phase-1-erc-20-proxy-hardening
- Commit bea622d (Task 2) found on gsd/phase-1-erc-20-proxy-hardening
- test/integration/GNUSAiIntegration.test.ts: 15 passing standalone; grep gates pass
- Both deployment suites: 10 passing combined; zero createXMPLToken references
- Phase gate: compile exit 0 + 85 passing / 0 failing in one pass; npx tsc --noEmit exit 0

---
*Phase: 01-erc-20-proxy-hardening*
*Completed: 2026-08-29*
