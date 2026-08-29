---
phase: 01-erc-20-proxy-hardening
plan: 03
subsystem: contracts
tags: [solidity, erc20, allowances, hardening, initializable, diamond-storage]

# Dependency graph
requires:
  - "01-01: pinned toolchain + submodules at 61b7ca4/dfebdf0, 0.8.19 compile config"
provides:
  - "Hardened ERC20ProxyFacet surface: proxy-local amount-specific allowances (_approve/_spendAllowance mirrored from GNUSBridge.sol:531-555) with the operator plane (setApprovalForAll/isApprovedForAll) structurally removed from the facet"
  - "One-shot initializeERC20Proxy (initializer modifier) with D-04 static guards and totalSupply(uint256) warm-up before state commits"
  - "Fixed revert strings for Plans 04/05 to assert verbatim (see Fixed Revert Strings below)"
affects: [01-04-unit-tests, 01-05-dexflow-integration, 01-06-regression, ProxyDiamond deployment suites that call initializeERC20Proxy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Diamond-storage append-only field addition: new mapping as the LAST Layout member, keccak-derived slot constant untouched (T-1-06)"
    - "Verbatim internal-mirroring with exactly one substitution (storage home) so the two ERC-20 surfaces of the same asset keep identical allowance semantics (D-02 parity motive)"

key-files:
  created: []
  modified:
    - contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol
    - contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol

key-decisions:
  - "internals kept `internal virtual` exactly as the GNUSBridge reference (verbatim mirror); _spendAllowance reads through the public allowance() view exactly as the reference does"
  - "transferFrom spends the allowance BEFORE the ERC-1155 leg; the old isApprovedForAll require was deleted outright (not replaced)"
  - "init body order: enforceIsContractOwner (left untouched per minimal-diff) -> 4 static guards -> warm-up -> childTokenId/name/symbol writes"

patterns-established:
  - "Facet revert-string convention: facet-prefixed strings for facet-local guards (ERC20Proxy: ...), exact OZ strings for mirrored internals"

requirements-completed: [PROXY-01, PROXY-02]

# Metrics
duration: 5min
completed: 2026-08-29
---

# Phase 1 Plan 3: Facet Allowance and Init Hardening Summary

**Appended the proxy-local `_allowances` mapping to the storage layout (append-only), mirrored GNUSBridge's `_approve`/`_spendAllowance` internals verbatim onto the facet with the operator plane structurally removed, and made `initializeERC20Proxy` one-shot with D-04 guards plus a `totalSupply(uint256)` warm-up — PROXY-01 and PROXY-02 are now implemented at the contract level.**

## Performance

- **Duration:** ~5 min (2026-08-29T22:33:07Z → 2026-08-29T22:38:00Z)
- **Tasks:** 3 (all auto, no checkpoints)
- **Files:** 2 modified, 0 created

## Accomplishments

- **D-01 (Task 1, `447e5d1`):** `mapping(address => mapping(address => uint256)) _allowances` appended as the LAST member of `ERC20ProxyStorage.Layout` (after `symbol`); existing field order and the `keccak256("erc20.proxy.storage")` slot constant untouched; struct NatSpec documents the new field. The vestigial `ERC20Storage` import was deleted from the facet (zero grep hits remain) — the split-storage-home anti-pattern is off the table.
- **D-02 (Task 2, `964cf56`):** `allowance` reads `ERC20ProxyStorage.layout()._allowances[owner][spender]` (the isApprovedForAll ternary is gone); `approve` calls `_approve(msg.sender, spender, amount)` (single Approval emission inside `_approve`); `transferFrom` calls `_spendAllowance(sender, msg.sender, amount)` before the existing ERC-1155 `safeTransferFrom` leg and Transfer emit. `_approve`/`_spendAllowance` mirror `GNUSBridge.sol:531-555` verbatim (including NatSpec and `internal virtual`) with exactly one substitution each — the storage home. `type(uint256).max` never decrements (T-1-12); the decrement path emits Approval inside `unchecked`.
- **D-03/D-04 (Task 3, `f2ca3f6`):** signature closes `) initializer onlyOwnerRole external {` (existing modifier-before-visibility order preserved); four static guards with the planner-fixed revert strings; `l.erc1155Contract = ERC1155SupplyUpgradeable(_erc1155Address); l.erc1155Contract.totalSupply(_childTokenId);` warm-up executes BEFORE `childTokenId`/`name`/`symbol` commit; `LibDiamond.enforceIsContractOwner()` left untouched per minimal-diff; no `supportsInterface` gate (explicitly rejected by D-04).

## Fixed Revert Strings (for Plans 04/05 verbatim assertions)

| Context | String |
|---|---|
| init: zero ERC-1155 address | `ERC20Proxy: ERC1155 contract cannot be zero address` |
| init: childTokenId 0 | `ERC20Proxy: child token ID cannot be zero` |
| init: empty name | `ERC20Proxy: name cannot be empty` |
| init: empty symbol | `ERC20Proxy: symbol cannot be empty` |
| init: second call (package-defined) | `Initializable: contract is already initialized` |
| transferFrom over-spend / zero allowance | `ERC20: insufficient allowance` |
| approve from zero-address owner | `ERC20: approve from the zero address` |
| approve to zero-address spender | `ERC20: approve to the zero address` |

## Task Commits

1. **Task 1: D-01 storage append + vestigial import removal** — `447e5d1` (feat)
2. **Task 2: D-02 real allowance surface — mirror GNUSBridge internals** — `964cf56` (feat)
3. **Task 3: D-03 one-shot init + D-04 guards and warm-up smoke test** — `f2ca3f6` (feat)

## Verification

- All three per-task grep gates green (run after prettier formatting, so the verified form IS the committed form)
- Plan-level facet gates: zero `setApprovalForAll` / `isApprovedForAll` / `supportsInterface` / `ERC20Storage` occurrences in `ERC20ProxyFacet.sol`; `ERC20ProxyStorage.layout()._allowances` access pattern, `initializer onlyOwnerRole external`, and `totalSupply(_childTokenId)` present; `_allowances` declared after `symbol` with the slot constant unchanged
- `npx hardhat compile` exits 0 after every task (final run: clean, nothing to recompile)
- Function ordering verified: externals … → `transferFrom` → `_approve` → `_spendAllowance` → `onlyOwnerRole` modifier (GNUSBridge external-then-internal ordering)
- Commit hygiene: no file deletions in any task commit; no stray untracked files from this plan
- `npx tsc --noEmit`: the 6 known source-file errors (owned by 01-04/01-06) are unchanged; see Issues for the 2 transient generated-artifact errors

## Files Created/Modified

- `contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol` — `_allowances` appended to `Layout` (+ NatSpec `@param`)
- `contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol` — ERC20Storage import removed; allowance/approve/transferFrom reworked; `_approve`/`_spendAllowance` internals added; one-shot guarded init

## Deviations from Plan

None — plan executed exactly as written. All three tasks matched their read_first line numbers and the mirror source at `../gnus-ai/contracts/gnus-ai/GNUSBridge.sol:531-555` (verified byte-for-byte before editing).

## Issues Encountered

- **tsc count 8 vs the known 6:** the 2 extra errors are `TS2307 Cannot find module './GeniusDiamond'` in `typechain-types/diamond-abi/index.ts` and `typechain-types/factories/diamond-abi/index.ts` — generated, gitignored files. The repo's pre-commit hook (`yarn clean-compile`) wiped typings that only a diamonds-ABI-generating run (deployment/integration tests) recreates. Not caused by this plan's source changes (the facet's external ABI is unchanged); the 6 real errors are the exact known set. They will self-heal on the next test run in Plans 04-06.

## Deferred Issues (out of scope, discovered during execution)

- `.planning/config.json` (orchestrator-created) sits untracked — the orchestrator owns whether/how it gets committed
- `typechain-types/` untracked and `.yarn/install-state.gz` tracked-but-modified remain on 01-01's deferred list

## User Setup Required

None.

## Known Stubs

None — the allowance internals and init guards are fully implemented; no placeholder code.

## Threat Surface

No new security-relevant surface beyond the plan's threat model. Mitigations delivered:
- **T-1-04** (allowance bypass via operator approval): structurally removed — grep-clean facet, proxy-local amount-specific state
- **T-1-02** (re-init config hijack): `initializer` one-shot + `onlyOwnerRole` (+ the untouched body-level owner check)
- **T-1-03** (wrong/malicious ERC-1155 target): static guards + `totalSupply(uint256)` warm-up before any write commits
- **T-1-06** (storage collision): append-only field, slot constant untouched
- **T-1-12** (infinite-allowance surprise): max allowance never decrements (mirrored exactly)
- **T-1-01** (SWC-114 approval race): accepted per locked D-02 — direct overwrite, industry-standard trade-off; do NOT "fix" in later plans

## Next Phase Readiness

- **Plan 04 (unit rewrite):** the facet's external ABI is unchanged in shape — `initializeERC20Proxy`, `allowance`, `approve`, `transferFrom` keep their signatures, so fixture wiring survives; rewrite assertions against the Fixed Revert Strings table above and the D-02 state machine (decrement + Approval event, over-spend revert, max-allowance no-decrement). The existing suite is red BY DESIGN until then (it asserts the old setApprovalForAll behavior and re-callable init).
- **Plan 05 (DEXFlow integration):** the `setApprovalForAll` independence criterion is now provable — the facet has no operator-plane path at all.
- **Deployment tests** calling `initializeERC20Proxy`: valid-but-unminted child ids still pass the warm-up (ERC1155Supply returns 0); id 0 is now permanently rejected.

## Self-Check: PASSED

- Commit 447e5d1 (Task 1) found on gsd/phase-1-erc-20-proxy-hardening
- Commit 964cf56 (Task 2) found on gsd/phase-1-erc-20-proxy-hardening
- Commit f2ca3f6 (Task 3) found on gsd/phase-1-erc-20-proxy-hardening
- contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol exists with `_allowances` after `symbol`, slot constant intact
- contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol exists with all D-02/D-03/D-04 markers
- Plan verify gate green: hardhat compile exit 0 + all facet grep gates

---
*Phase: 01-erc-20-proxy-hardening*
*Completed: 2026-08-29*
