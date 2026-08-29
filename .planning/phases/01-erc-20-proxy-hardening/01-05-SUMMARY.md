---
phase: 01-erc-20-proxy-hardening
plan: 05
subsystem: tests
tags: [solidity, erc20, erc1155, integration, dex, allowances, router-pattern, hardening]

# Dependency graph
requires:
  - "01-02: linking harness + local LocalDiamondDeployer — setupLifecyclePolicyLinking() is the first statement of before(); both diamonds deploy from the 2.6 configs"
  - "01-03: hardened ERC20ProxyFacet — every asserted revert string comes from the 01-03 Fixed Revert Strings table"
  - "01-04: unit-suite allowance state machine — the D-05 sequence is its live-pair counterpart"
provides:
  - "Green 9-test DEXFlow integration suite: the full D-05 router pattern against the live GeniusDiamond+ProxyDiamond pair from the nested submodule at 61b7ca4"
  - "Criterion 5 (criterion-5 / PROXY-01 lynchpin) proven live in both directions with the proxy holding NFT_PROXY_OPERATOR_ROLE"
  - "Empirical fact for future fixtures: the diamond's safeTransferFrom internal operator check reads the base _operatorApprovals mapping — the cut ERC1155ProxyOperator isApprovedForAll override answers the external view selector only, so a proxy operator still needs per-user setApprovalForAll"
  - "localDiamondDeployerKey pattern: suites that initialize their own ProxyDiamond must use a distinct deployer key or they poison the shared process-wide instance for later suites"
affects: [01-06-regression, any future suite that deploys the ProxyDiamond in the same process as another suite]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dedicated deployer instance per initializing suite: localDiamondDeployerKey on the LocalDiamondDeployerConfig splits the (diamondName, network, chainId) cache entry so two suites can each own a fresh ProxyDiamond in one hardhat process"
    - "Child-token ID capture without hardcoding: read getNFTInfo(GNUS_TOKEN_ID).childCurIndex BEFORE createNFT (createNFT assigns newTokenID = (parentID << 128) | childCurIndex++)"
    - "Criterion-5 two-direction proof: (A) operator approval present + allowance absent must reject; (B) operator approval absent + allowance present must spend — asserted in one it on snapshot-isolated pristine state"

key-files:
  created:
    - test/integration/DEXFlow.test.ts
  modified: []

key-decisions:
  - "Fixture grants BOTH NFT_PROXY_OPERATOR_ROLE to the proxy (universal isApprovedForAll view — the strongest arrangement for criterion 5) AND holder setApprovalForAll(proxy, true) (the base mapping the transfer path actually checks). The plan's role-grant-only reading of Pitfall 6 does not authorize transfers on the diamond"
  - "createNFT maxSupply raised to 1000000 (the plan's literal 100 would cap the mint below the funded amount); all amounts stay plain minion-denominated BigInts per Phase 9"
  - "Router simulated by a plain signer (signer2) — no fork infra, no new dependencies"

patterns-established:
  - "Live-pair DEX fixture: GeniusDiamond + ProxyDiamond in one before(), roles computed client-side via keccak256(toUtf8Bytes(...)), outer snapshot after the fixture, inner snapshot per test"

requirements-completed: [PROXY-01]

# Metrics
duration: 10min
completed: 2026-08-29
---

# Phase 1 Plan 5: DEXFlow Integration Suite Summary

**Built test/integration/DEXFlow.test.ts running the complete D-05 router pattern against the live GeniusDiamond+ProxyDiamond pair deployed from the nested 61b7ca4 submodule — 9 tests green standalone, full suite 83 passing / 2 failing (the same two 01-06-owned NFTFactory failures), with criterion 5 (ERC-20 allowance independent of ERC-1155 operator approval) proven live in both directions while the proxy holds NFT_PROXY_OPERATOR_ROLE.**

## Performance

- **Duration:** ~10 min (2026-08-29T23:02:38Z → 2026-08-29T23:12:44Z)
- **Tasks:** 2 (all auto, no checkpoints)
- **Files:** 1 created, 0 modified

## Task Commits

1. **Task 1: DEXFlow fixture — live pair, roles, child token, proxy init** — `3dd28d7` (test)
2. **Task 2: D-05 assertion sequence incl. criterion 5** — `276140c` (test)

## Accomplishments

- **Task 1 (`3dd28d7`):** the fixture — `setupLifecyclePolicyLinking()` first in `before()` (before any `LocalDiamondDeployer.getInstance`), then GeniusDiamond (`diamonds/GeniusDiamond/geniusdiamond.config.json`) and ProxyDiamond (`diamonds/ProxyDiamond/proxydiamond.config.json`) in the same `before()`, both with `writeDeployedDiamondData: false`. Roles computed client-side via `ethers.keccak256(ethers.toUtf8Bytes(...))` (NFT_PROXY_OPERATOR_ROLE, CREATOR_ROLE, MINTER_ROLE — the getter is not in the aggregated ABI). Child token: `createNFT(GNUS_TOKEN_ID, "DEX Test", "DEXT", 2, 1000000, "0x")` with the id captured from `getNFTInfo(GNUS_TOKEN_ID).childCurIndex` read pre-creation; creator funded with a plain minion-denominated BigInt (1000000n × 2 headroom) via `mint(address,uint256)`, child minted to the holder via the 4-arg factory path that burns creator GNUS 1:1. `grantRole(NFT_PROXY_OPERATOR_ROLE, proxyDiamondAddress)` from the diamond owner, then `initializeERC20Proxy(geniusDiamondAddress, childTokenId, "DEX Test Token", "DEXT")`. Outer snapshot after the fixture, inner snapshot per test. Two fixture-validation its: pair wiring (name/symbol/decimals/totalSupply/balanceOf over the ERC-1155 leg) and role/universal-operator-approval wiring.
- **Task 2 (`276140c`):** the seven-element D-05 sequence as separate its, each starting from the funded, initialized state via the inner snapshot: (1) `approve(router, n)` records exactly n with the Approval event; (2) `transferFrom` moves n child tokens (verified on the proxy AND directly on the diamond's ERC-1155 overload) and zeroes the allowance; (3) partial spends leave the exact finite remainder (300 + 450 of 1000 → 250, with the Approval-on-decrement event); (4) over-spend reverts `ERC20: insufficient allowance` and moves nothing; (5) a fresh spender with no approve is rejected with the same string; (6) criterion 5 in both directions — see below; (7) `approve(MaxUint256)` survives two finite spends with no decrement and the recipient's balance doubles accordingly.

## Criterion 5 (the phase's acceptance lynchpin)

Proven live with the proxy holding NFT_PROXY_OPERATOR_ROLE (`hasRole` asserted; `isApprovedForAll(holder, proxy) === true` for every user via the override):

- **Grants nothing (direction A):** after `setApprovalForAll(router, true)` and `setApprovalForAll(proxy, true)` on the diamond, `allowance(holder, router)` and `allowance(holder, proxy)` are both 0n and an unapproved `transferFrom` reverts `ERC20: insufficient allowance`. This is the exact state the pre-hardening facet was exploitable in (operator approval present, allowance absent).
- **Not required (direction B):** on pristine state with `isApprovedForAll(holder, router) === false`, a real ERC-20 allowance spends fine — the proxy's own operator rights cover the ERC-1155 leg; the router never needs ERC-1155 approval.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Role grant alone does not authorize the ERC-1155 transfer leg**
- **Found during:** Task 2 (first suite run: tests 2/3/6/7 reverted `ERC1155: caller is not owner nor approved` INSIDE the diamond — Pitfall 6's warning sign)
- **Issue:** `safeTransferFrom`'s internal operator check in `@gnus.ai/.../ERC1155Upgradeable.sol:125` reads the base `_operatorApprovals` mapping. On the diamond, `isApprovedForAll` is only overridden in the separately-cut ERC1155ProxyOperator facet, which answers the external view selector — it cannot intercept another facet's internal call. The role grant makes `isApprovedForAll(user, proxy)` read true for all users while authorizing zero transfers. gnus-ai's own suite documents this ("Set approval explicitly (since isApprovedForAll override may not work in Diamond)").
- **Fix:** fixture addition — the holder calls `setApprovalForAll(proxyDiamondAddress, true)` on the diamond alongside the role grant. Fixture-only change; the facet was never touched (per the plan's "fix the fixture, never the facet"). Net effect strengthens criterion 5: the suite now proves allowance independence in the exact pre-hardening exploit configuration.
- **Files modified:** test/integration/DEXFlow.test.ts
- **Committed in:** 276140c

**2. [Rule 3 - Blocking] Shared LocalDiamondDeployer cache entry broke the unit suite in full-suite runs**
- **Found during:** Task 2 (full-suite run: `ERC20ProxyFacet Unit Tests` before-all failed `Initializable: contract is already initialized`)
- **Issue:** my suite initializes the ProxyDiamond under the process-wide `(ProxyDiamond, hardhat, 31337)` deployer cache entry. The unit suite runs later in the same process, receives the cached (already-initialized) instance without re-deploying, and its `initializeERC20Proxy` hits the one-shot gate.
- **Fix:** `localDiamondDeployerKey: "dexflow-proxy"` on this suite's proxy config — a dedicated deployer instance and a fresh, separately-initialized ProxyDiamond. The unit suite keeps the default entry exactly as in the 74/2 baseline. (GeniusDiamond intentionally still reuses the shared entry, matching GNUSAiIntegration's established behavior.)
- **Files modified:** test/integration/DEXFlow.test.ts
- **Committed in:** 276140c

### Documented design notes (planned or plan-conformant, no logic concern)

**3. createNFT maxSupply set to 1000000, not the plan's literal 100**
The plan's example args are internally inconsistent (maxSupply 100 caps the mint below the funded 1000000n). maxSupply was raised to the mint amount; everything stays plain minion-denominated BigInts per the Phase 9 rule the plan cites.

**4. childTokenId captured from pre-creation chain state**
"Capture childTokenId from the result" implemented as `getNFTInfo(GNUS_TOKEN_ID).childCurIndex` read before `createNFT` (which assigns `(parentID << 128) | childCurIndex++`) — deterministic, no event parsing, no hardcoding, and correct regardless of how many child NFTs earlier suites created.

**Total deviations:** 2 auto-fixed (Rules 1/3) + 2 documented notes
**Impact on plan:** All acceptance criteria met.

## Verification

- Task 1 gate: `test -f` + grep (`setupLifecyclePolicyLinking` 2, `NFT_PROXY_OPERATOR_ROLE` 6, `initializeERC20Proxy` 1) + suite green (2 passing at that commit)
- Task 2 gate: grep (`ERC20: insufficient allowance` 4, `setApprovalForAll` 5, `MaxUint256` 5) + suite green
- **Plan verify gate: `npx hardhat test test/integration/DEXFlow.test.ts` → 9 passing / 0 failing** (re-verified standalone after each commit hook's clean-compile cycle)
- **Full suite: 83 passing / 2 failing** = the 74/2 baseline plus this suite's 9; the only failures are the same two NFTFactory assertions in GNUSAiIntegration.test.ts, owned by plan 01-06 (untouched)
- `npx tsc --noEmit`: 5 source errors — exactly the 01-06-owned set (ProxyDiamondDeployment x3, ProxyDiamondPostDeploymentComparison x1, GNUSAiIntegration x1); 0 errors in DEXFlow.test.ts; the 2 generated typechain-types errors are currently absent (clean compile cycle)
- No tracked-file deletions in either commit; no new untracked files from this plan (`typechain-types/` and `.planning/config.json` are pre-existing 01-01/orchestrator deferrals)

## Files Created/Modified

- `test/integration/DEXFlow.test.ts` — NEW (502 lines): live-pair fixture + 2 fixture-validation its + the 7-element D-05 describe

## Issues Encountered

- None blocking. The two fixture defects above each cost one diagnose-fix cycle; both are fixture-level, root-caused from the nested contracts' source (not trial and error).

## Deferred Issues (out of scope, discovered during execution)

- The `isApprovedForAll`-override-vs-internal-check split is a live gnus-ai diamond behavior worth a note upstream: any integrator assuming the role alone authorizes proxy transfers will revert at runtime. Recorded here for the 01-06 regression plan's awareness; no action in this repo.

## User Setup Required

None.

## Known Stubs

None — the suite is fully functional; no placeholder code.

## Threat Surface

No new security-relevant surface beyond the plan's threat model. Mitigations delivered:
- **T-1-04** (allowance/operator-plane conflation — the old vulnerability): criterion 5 proven live in both directions, with the proxy holding the operator role AND explicit per-user operator approval present
- **T-1-13** (misconfigured role grant masking a facet bug): the role grant targets the PROXY only; all spend reverts carry the facet's `ERC20: insufficient allowance` string, pinning the revert site to the facet — the one diamond-side revert encountered during development was diagnosed as a fixture defect and fixed in the fixture
- **T-1-12** (infinite-allowance drift): MaxUint256 no-decrement across two spends on the live pair

## Next Phase Readiness

- **Plan 06 (regression):** owns the 2 NFTFactory failures and the 5 tsc errors; the measured baseline to hold is now **83 passing / 2 failing** with DEXFlow included. The pre-commit hook's clean-compile wipe behavior (01-04 Deviation 3) still applies to standalone runs.

## Self-Check: PASSED

- Commit 3dd28d7 (Task 1) found on gsd/phase-1-erc-20-proxy-hardening
- Commit 276140c (Task 2) found on gsd/phase-1-erc-20-proxy-hardening
- test/integration/DEXFlow.test.ts exists (502 lines) with setupLifecyclePolicyLinking, client-side NFT_PROXY_OPERATOR_ROLE, initializeERC20Proxy, all seven D-05 elements, and the criterion-5 both-direction assertions
- Plan verify gate green: 9 passing / 0 failing standalone; full suite 83/2 with only the 01-06-owned failures

---
*Phase: 01-erc-20-proxy-hardening*
*Completed: 2026-08-29*
