---
phase: 01-erc-20-proxy-hardening
plan: 04
subsystem: tests
tags: [solidity, mock, erc1155, allowances, unit-tests, snapshot-isolation, hardening]

# Dependency graph
requires:
  - "01-02: linking harness + local LocalDiamondDeployer (A3) — the fixture calls setupLifecyclePolicyLinking() first and keeps the local deployer import"
  - "01-03: hardened ERC20ProxyFacet — every asserted revert string comes from the 01-03 Fixed Revert Strings table"
provides:
  - "MockERC1155Supply: minimal ERC-1155 subset mock with reverting operator plane (runtime tripwire for T-1-04)"
  - "Green 34-test unit suite: D-04 guard block (all four guard strings + EOA/wrong-ABI warm-up rejections + owner gate + unminted-id tolerance), flipped re-init test, exhaustive finite-allowance state machine, ABI-level setApprovalForAll absence"
  - "Snapshot-pool pattern for uninitialized-state tests on Hardhat (evm_revert consumes its target; re-arming is unreliable)"
affects: [01-05-dexflow-integration, 01-06-regression]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-init snapshot POOL: N root snapshots taken in before() before initialization; each uninitialized-state test consumes exactly one (LIFO pop) — Hardhat's evm_revert consumes the snapshot it reverts to and snapshots taken after a revert-to-older can be invalidated, so re-arming after each rewind silently no-ops (empirically verified)"
    - "Fixture state repair: each uninitialized describe's after() consumes one pooled snapshot and re-runs the canonical initializeERC20Proxy, so later initialized describes always see canonical state regardless of gate-arming tests"

key-files:
  created:
    - contracts/erc20-gnus-proxy/mocks/MockERC1155Supply.sol
  modified:
    - test/unit/ERC20ProxyFacet.test.ts

key-decisions:
  - "Snapshot pool over re-arming: the plan's 'chain safely off the same snapshot' assumption does not hold on Hardhat (consume-on-revert + post-revert snapshot invalidation); a pre-allocated pool of root snapshots is deterministic under both observed semantics"
  - "transfer()-before-init test removed rather than weakened: a CALL to the zero address succeeds silently in the EVM (Solidity's extcodesize guard reverts only for high-level calls), so no revert shape exists to assert; an initialized-guard on transfer is outside locked D-01..D-05 scope (D-04 warm-up + one-shot init are the locked protections)"
  - "ABI absence assertion normalized over ethers v6 getFunction behaviors: this version returns null for a missing name (no throw); the test accepts null or undefined so an ethers upgrade cannot silently flip the assertion"

patterns-established:
  - "Mock operator-plane tripwire: setApprovalForAll/isApprovedForAll revert on touch, making 'the facet never uses the operator plane' executable behavior — every passing transfer/approve test doubles as proof"
  - "Wrong-ABI warm-up rejection target: the ProxyDiamond's own address (its totalSupply() takes no uint256 arg, so the totalSupply(uint256) selector misses) — exactly the pre-phase self-pointing configuration"

requirements-completed: [PROXY-01, PROXY-02]

# Metrics
duration: 24min
completed: 2026-08-29
---

# Phase 1 Plan 4: Unit Suite, Mock, and Allowance Tests Summary

**Rebuilt the ERC20ProxyFacet unit suite on a minimal local ERC-1155 mock with a reverting operator plane: flipped the re-init test to pin the Initializable gate, added the full D-04 guard block (four guard strings, EOA and self-pointing warm-up rejections, owner gate, unminted-id tolerance), and an exhaustive finite-allowance state machine — 34 tests green, full suite 74 passing with only the two 01-06-owned NFTFactory failures left.**

## Performance

- **Duration:** ~24 min (2026-08-29T22:41:46Z → 2026-08-29T23:05:00Z)
- **Tasks:** 3 (all auto, no checkpoints)
- **Files:** 1 created, 1 modified

## Accomplishments

- **Task 1 (`7ca4ff2`):** `contracts/erc20-gnus-proxy/mocks/MockERC1155Supply.sol` — standalone ~48-line mock (no OZ imports, MockERC20.sol conventions): private `(uint256 => address => uint256)` balances and `(uint256 => uint256)` supplies; `totalSupply(uint256)` pure read returning 0 for unminted ids (D-04 warm-up tolerance), `balanceOf`, `safeTransferFrom` with balance bookkeeping ("MockERC1155Supply: insufficient balance", no approval check — the proxy's allowance logic is the system under test), `mint` test helper; `setApprovalForAll`/`isApprovedForAll` revert "MockERC1155Supply: operator plane must not be touched"; no ERC-20 surface, no ERC-165.
- **Task 2 (`f828ab3`):** fixture rework — `setupLifecyclePolicyLinking()` first in `before()`, mock deployed after the ProxyDiamond, explicit `initializeERC20Proxy(mock, 1, "ExampleToken", "XMPL")` (callback gone), pre-init snapshot pool; reworked uninitialized tests to the deterministic post-hardening semantics; flipped re-init test asserting `Initializable: contract is already initialized` plus post-failure name/symbol immutability; new "Initialization Guard Tests" describe with all four D-04 guard strings verbatim, EOA warm-up rejection, wrong-ABI (self-pointing diamond) warm-up rejection, owner-gate (`Only Contract Owner allowed` from pre-init state so the modifier is genuinely exercised), and the unminted-id tolerance test last (arms the gate; the describe's after() restores the canonical fixture). Fixed the file's tsc error (`as unknown as LocalDiamondDeployerConfig`, mirroring 01-02's fix).
- **Task 3 (`364951b`):** "Allowance State Machine Tests" describe — set/read with Approval event (owner, spender, value), decrement to zero on full spend with before/after `balanceOf` assertions through the proxy, Approval-on-decrement event with the remaining allowance as value, over-spend revert (`ERC20: insufficient allowance`) with nothing moved, zero-allowance rejection, direct overwrite (D-02 rejects the USDT zero-first rule), MaxUint256 no-decrement across two consecutive spends with the recipient's balance doubling; ABI-coverage describe extended with the negative `setApprovalForAll` absence assertion.

## Test Inventory (34)

| Block | Tests | Notable assertions |
|---|---|---|
| Interface Support | 3 | unchanged scaffold |
| DiamondLoupe | 4 | unchanged scaffold |
| Basic Views | 3 | name/symbol now from explicit init |
| State Query (Uninitialized) | 4 | totalSupply/balanceOf broad rejection; allowance returns 0n; approve succeeds as proxy-local write |
| TransferFrom (Uninitialized) | 1 | reverts `ERC20: insufficient allowance` (gate fires before the ERC-1155 leg) |
| Initialization | 1 | re-init reverts `Initializable: contract is already initialized`; state immutable after |
| Allowance State Machine | 7 | full D-02/D-05 state machine incl. MaxUint256 across two spends |
| Initialization Guard | 8 | 4 guard strings, EOA + wrong-ABI warm-up, owner gate, unminted-id tolerance |
| ABI Coverage | 3 | required functions present; `setApprovalForAll` absent |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Snapshot rewind mechanism was unreliable (re-arm pattern)**
- **Found during:** Task 2 (first suite run: 25/27 — reason-less transferFrom revert + after-hook "already initialized")
- **Issue:** The plan's "consecutive guard tests chain safely off the same snapshot" assumption does not hold on Hardhat Network. Empirical probe: `evm_revert` CONSUMES its target snapshot (second revert to the same id returns false), and snapshots taken after a revert-to-older can be invalidated. The re-arm pattern (`revert(S); S = snapshot()`) silently no-oped, leaving tests to run against leftover state — a leftover allowance let transferFrom pass the gate and revert reason-lessly on the zero-address ERC-1155 leg, and the guard describe's after() init hit an armed gate.
- **Fix:** Pre-allocated pool of 20 root snapshots taken in `before()` before initialization; each uninitialized-state test (and each restore) consumes exactly one (LIFO pop, throw on exhaustion). Deterministic under both observed semantics. Root-cause probes kept out of the repo (temp scripts, deleted).
- **Files modified:** test/unit/ERC20ProxyFacet.test.ts
- **Committed in:** f828ab3

**2. [Rule 1 - Bug] ABI absence assertion: ethers v6 getFunction does not throw for a missing name**
- **Found during:** Task 3 (first run of the negative assertion)
- **Issue:** The plan's suggested `expect(() => contractInterface.getFunction("setApprovalForAll")).to.throw()` never threw — this ethers version returns `null` for a missing name (verified: the aggregated ABI has zero `setApprovalForAll` occurrences; 16 functions, 3 facets).
- **Fix:** try/catch-normalized lookup accepting null (this version) or undefined (newer versions), asserted absent — the plan's sanctioned "equivalent fragments check" spirit, version-proof in both directions. (An intermediate `interface.fragments` attempt was dropped: the typechain `ProxyDiamondInterface` type does not expose `.functions`/typed fragment names.)
- **Files modified:** test/unit/ERC20ProxyFacet.test.ts
- **Committed in:** 364951b

**3. [Rule 3 - Blocking] Task-1 commit hook wiped diamond-ABI typings, breaking the suite at import time**
- **Found during:** Task 2 (first suite run crashed with `Cannot find module './ProxyDiamond__factory'`)
- **Issue:** The pre-commit hook runs `yarn clean-compile`; `yarn clean` deletes `artifacts cache diamond-abi typechain-types diamond-typechain-types`, and a plain `hardhat compile` regenerates typechain WITHOUT the diamond-ABI factories — those only appear when `loadDiamondContract` (any test run) has written the synthetic `artifacts/diamond-abi/*.json` and a subsequent compile globs it (01-03 documented the transient; the standalone unit run cannot self-heal because the crash happens at import time, before any deploy runs).
- **Fix:** Rebuilt the local typing state deterministically: `npx hardhat clean && npx hardhat compile` regenerates a CLEAN typechain-types with no dangling diamond-abi indexes. Verified nothing in the repo imports the diamond-abi factories (`ProxyDiamond__factory`/`GeniusDiamond__factory` have zero import sites in test/ or scripts/ — the ProxyDiamond type comes from `diamond-typechain-types`, regenerated by the `diamond:generate-*-abi-typechain` scripts). The clean state survives subsequent commit hooks, so the unit suite now runs standalone. Entirely local/generated files — nothing committed.
- **Files modified:** none committed (generated artifacts only)

**4. [Rule 2 - Correctness] Owner-gate test was passing for the wrong reason**
- **Found during:** Task 2 (fixture design)
- **Issue:** The existing "Should only allow owner to initialize" ran against INITIALIZED state, where the `initializer` modifier reverts before `onlyOwnerRole` is ever reached — it asserted `.to.be.reverted` and passed on the Initializable string, the same "wrong reason" anti-pattern the plan cites for the old uninitialized tests.
- **Fix:** Moved the test into the Initialization Guard describe (pre-init state via the snapshot pool) and asserted `Only Contract Owner allowed` verbatim — the modifier is now genuinely exercised.
- **Files modified:** test/unit/ERC20ProxyFacet.test.ts
- **Committed in:** f828ab3

---

### Documented design notes (planned, no logic change)

**5. transfer()-before-init test removed (plan-directed)**
- The plan explicitly orders its removal: a CALL to the zero address succeeds silently in the EVM, so the old revert expectation is unachievable. An initialized-guard on transfer is outside locked D-01..D-05 scope — D-04's warm-up plus the one-shot init are the locked protections. Rationale recorded here per the plan's acceptance criteria.

**6. Allowance describe placed before the guard describe**
- The plan does not fix file order for the new describes. The Allowance State Machine needs clean per-test initialized isolation; placing it before the uninitialized block (whose reverts can invalidate later-taken snapshots) keeps its isolation snapshots on an unbroken chain. The guard block's after() restore still guarantees canonical state for anything after it.

**Total deviations:** 4 auto-fixed (Rules 1/2/3) + 2 documented notes
**Impact on plan:** All acceptance criteria met.

## Verification

- Task 1 gate: mock grep gate (contract present, 2 operator-plane revert strings, no `function approve`) + `npx hardhat compile` exit 0
- Task 2 gate: grep gate (Initializable string present, child-token-ID guard string present, no "Should allow owner to reinitialize") + suite green
- Task 3 gate: grep gate (`ERC20: insufficient allowance` x3, `MaxUint256` x4, `setApprovalForAll` x3 — all three occurrences inside the single negative-ABI test: title, comment, call site) + suite green
- **Plan verify gate: `npx hardhat test test/unit/ERC20ProxyFacet.test.ts` → 34 passing / 0 failing** (also verified standalone immediately after each commit hook)
- **Full suite: 74 passing / 2 failing** — the only failures are the two NFTFactory integration assertions in GNUSAiIntegration.test.ts, owned by plan 01-06 (untouched)
- **tsc:** `test/unit/ERC20ProxyFacet.test.ts` clean (was 1 error, line 61 cast — fixed). Remaining 5 errors are exactly the 01-06-owned set (ProxyDiamondDeployment x3, ProxyDiamondPostDeploymentComparison x1, GNUSAiIntegration x1). The 2 generated typechain-types errors are currently absent because the local typechain state was rebuilt cleanly; they return whenever a diamonds-ABI compile cycle regenerates them (documented 01-01/01-03 deferral, out of scope)
- `setApprovalForAll`/`isApprovedForAll` have zero runtime call sites in the suite (mock would revert); no tracked-file deletions in any commit; no stray untracked files from this plan

## Files Created/Modified

- `contracts/erc20-gnus-proxy/mocks/MockERC1155Supply.sol` — NEW (48 lines): ERC-1155 subset mock with reverting operator plane
- `test/unit/ERC20ProxyFacet.test.ts` — fixture on the mock with snapshot pool, reworked uninitialized tests, flipped re-init, guard block, allowance state machine, ABI negative assertion

## Issues Encountered

- None blocking. The typechain wipe (Deviation 3) cost one investigation cycle; resolution is local-only and reproducible.

## Deferred Issues (out of scope, discovered during execution)

- `typechain-types/` untracked and `.yarn/install-state.gz` tracked-but-modified remain on 01-01's deferred list; `.planning/config.json` untracked (orchestrator-owned) — all pre-existing, untouched
- The pre-commit hook's `yarn clean-compile` makes any standalone single-file run dependent on a prior clean-regeneration state when diamond-abi typings are present; noted for 01-06's full-suite work (the full-suite run self-heals by writing the synthetic artifacts during deployment tests)

## User Setup Required

None.

## Known Stubs

None — the mock and all tests are fully functional; no placeholder code.

## Threat Surface

No new security-relevant surface beyond the plan's threat model. Mitigations delivered:
- **T-1-02** (re-init hijack regression): flipped test pins the exact Initializable string + state immutability
- **T-1-03** (bad init target regression): all four D-04 guard strings pinned verbatim; EOA and self-pointing warm-up rejections; unminted-id tolerance prevents over-blocking
- **T-1-04** (operator-plane bypass): mock reverts on touch (runtime tripwire) + ABI absence assertion (structural pin)
- **T-1-12** (infinite-allowance drift): MaxUint256 no-decrement across two spends

## Next Phase Readiness

- **Plan 05 (DEXFlow integration):** the unit fixture is the template — `setupLifecyclePolicyLinking()` first, mock-free GeniusDiamond fixture with the 01-PATTERNS "Deployment scaffold" additions (role grants, 1:1 child minting, plain minion-denominated amounts); the allowance state machine tests map 1:1 onto the DEXFlow assertion sequence (criterion 5's setApprovalForAll-independence needs the GeniusDiamond's real operator plane, out of unit scope)
- **Plan 06 (regression):** owns the 5 remaining tsc errors and the 2 NFTFactory failures; the full-suite 74/2 state is the measured baseline to hold

## Self-Check: PASSED

- Commit 7ca4ff2 (Task 1) found on gsd/phase-1-erc-20-proxy-hardening
- Commit f828ab3 (Task 2) found on gsd/phase-1-erc-20-proxy-hardening
- Commit 364951b (Task 3) found on gsd/phase-1-erc-20-proxy-hardening
- contracts/erc20-gnus-proxy/mocks/MockERC1155Supply.sol exists with the operator-plane tripwire and mint helper
- test/unit/ERC20ProxyFacet.test.ts exists with the Initializable flip, all four guard strings, the allowance state machine, and the negative ABI assertion
- Plan verify gate green: 34 passing / 0 failing; tsc residual = 5 errors, all in 01-06-owned files

---
*Phase: 01-erc-20-proxy-hardening*
*Completed: 2026-08-29*
