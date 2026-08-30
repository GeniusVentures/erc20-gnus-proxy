---
phase: 01-erc-20-proxy-hardening
fixed_at: 2026-08-29T23:59:51Z
review_path: .planning/phases/01-erc-20-proxy-hardening/01-REVIEW.md
iteration: 1
findings_in_scope: 14
fixed: 14
skipped: 0
status: all_fixed
---

# Phase 1: Code Review Fix Report

**Fixed at:** 2026-08-29T23:59:51Z
**Source review:** .planning/phases/01-erc-20-proxy-hardening/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 14 (6 Warning + 8 Info; scope = all)
- Fixed: 14
- Skipped: 0

**Post-fix gates (phase constraints):**
- `npx hardhat test` (full suite): **87 passing / 0 failing** (baseline 85 + 2 new
  transfer() unit tests from WR-02)
- `npx tsc --noEmit`: **0 errors**

**Locked constraints honored:** no changes to the D-02 `_approve`/`_spendAllowance`
mirror (character-identical to gnus-ai `GNUSBridge.sol:531-560`), no changes to the
mock's reverting operator plane, no reordering of `ERC20ProxyStorage.Layout`, SWC-114
left as the accepted trade-off.

## Fixed Issues

### WR-01: Empty test asserts nothing while claiming proxy verification

**Files modified:** `test/integration/GNUSAiIntegration.test.ts`
**Commit:** e80cc57
**Applied fix:** Implemented the no-op `it()` (chose the cheap deterministic option
over duplicating DEXFlow's full proxy deployment): the test now asserts the freshly
deployed GeniusDiamond answers the exact ERC-1155 overloads `ERC20ProxyFacet` calls
on its target (`totalSupply(uint256)` and `balanceOf(address,uint256)` for the GNUS
token id — the D-04 warm-up surface), with an internal consistency check
(`ownerBalance <= totalSupply`) and a comment pointing to DEXFlow's "Live Pair
Wiring" suite for full proxy wiring parity. Renamed to match what it actually
verifies. GNUSAiIntegration suite: 15 passing.

### WR-02: `transfer()` has zero test coverage anywhere; the tripwire comment claims otherwise

**Files modified:** `test/unit/ERC20ProxyFacet.test.ts`
**Commit:** 92ebc49
**Applied fix:** Added an `ERC20ProxyFacet Transfer Tests` describe with two tests
mirroring the transferFrom block: (a) successful `transfer` moves the child-token
balance and emits `Transfer(msg.sender, recipient, amount)`; (b) over-balance
`transfer` reverts with `MockERC1155Supply: insufficient balance` and moves nothing.
Corrected the operator-plane tripwire comment to read
"transfer/transferFrom/approve" so its claim is backed by real tests. Unit suite:
36 passing (34 before + 2 new).

### WR-03: Mainnet RPC URL is malformed — API key concatenated into the `network` parameter

**Files modified:** `hardhat.config.ts`
**Commit:** 036bb84
**Applied fix:** `network=ethereum=${DRPC_API_KEY}` → `network=ethereum&dkey=${DRPC_API_KEY}`,
matching every other drpc entry. Verified by tsc (0 errors) over the config file.

### WR-04: `chainManager` chain IDs contradict the real chains and the `networks` section

**Files modified:** `hardhat.config.ts`
**Commit:** 4896da5
**Applied fix:** `chainManager.chains.sepolia.chainId` 11155112 → 11155111 (matches
`networks.sepolia.chainId`); `polygon_amoy` 800002 → 80002 (matches
`networks.polygon_amoy.chainId`). Also removed the now-dead `800002` hardforkHistory
stub under `networks.hardhat.chains` (born from the same typo; the correct 80002 stub
remains).

### WR-05: Monkey-patched `getContractFactory` silently drops arguments past the second

**Files modified:** `scripts/utils/GNUSLifecyclePolicyLinking.ts`
**Commit:** c80c883
**Applied fix:** The replacement now takes `(...args: any[])`, reads
`nameOrAbi = args[0]` / `let opts = args[1]` inside the string-name branch, writes the
rewritten options back via `args[1] = opts`, and forwards `original(...args)`. The
3-argument ABI form (`getContractFactory(abi, bytecode, signer)`) now passes through
untouched instead of rebinding `bytecode` as `opts` and dropping the signer.
Note: no repo call site uses the 3-arg form (latent defect), so this is
**fixed: requires human verification** for the ABI-form path — the exercised
string-name paths are regression-covered by the full suite (87 passing).

### WR-06: Block-number upper-bound assertion is a time bomb on forked/live networks

**Files modified:** `test/deployment/ProxyDiamondDeployment.test.ts`, `test/deployment/GeniusDiamondDeployment.test.ts`
**Commit:** 777f919
**Applied fix:** Kept the meaningful invariant (`blockNumber >= configBlockNumber` —
the fork was created at or after the pin) unconditionally on every network, and gated
the `lte(configBlockNumber + 500)` upper bound on `networkName === "hardhat"` (the
in-memory chain where the head is deterministic). Forked/live runs no longer fail
once the head is 501+ blocks past the pin. The local hardhat branch is exercised by
the suites (24 passing across both deployment files).

### IN-01: Duplicate owner enforcement in `initializeERC20Proxy`

**Files modified:** `contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol`
**Commit:** f737073
**Applied fix:** Removed the explicit `LibDiamond.enforceIsContractOwner();` body
statement; the `onlyOwnerRole` modifier runs first and already enforces the identical
check with the message the suite asserts (`"Only Contract Owner allowed"`). Observable
behavior is unchanged (the body statement was unreachable-in-effect). Not part of the
D-02 mirrored region. Compile clean; full suite green.

### IN-02: Unused import `IERC1155Upgradeable`

**Files modified:** `contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol`
**Commit:** 23b51bd
**Applied fix:** Deleted the unused import; `ERC1155SupplyUpgradeable` resolves
transitively via `ERC20ProxyStorage.sol` (verified by a clean full compile).

### IN-03: Debug namespace built from a single-quoted string containing `${...}`

**Files modified:** `test/unit/ERC20ProxyFacet.test.ts`, `test/deployment/ProxyDiamondDeployment.test.ts`, `test/deployment/ProxyDiamondPostDeploymentComparison.test.ts`, `test/integration/GNUSAiIntegration.test.ts`
**Commit:** 87f2b8e
**Applied fix:** Changed `debug("GNUSDeploy:log:${diamondName}")` to a template
literal in all four files so `DEBUG=GNUSDeploy:log:*` per-diamond filtering works.

### IN-04: Dead statements and unused variables in test files

**Files modified:** `test/deployment/GeniusDiamondDeployment.test.ts`, `test/integration/GNUSAiIntegration.test.ts`, `test/unit/ERC20ProxyFacet.test.ts`, `test/deployment/ProxyDiamondDeployment.test.ts`, `test/deployment/ProxyDiamondPostDeploymentComparison.test.ts`
**Commit:** c240478
**Applied fix:** Removed the no-op `ownerSigner;` / `ownerGeniusSigner;` expression
statements, the assigned-never-used `signer2Diamond` declaration + assignment in the
unit suite, and the computed-never-used `hardhatDiamondAbiPath` / `diamondArtifactName`
pairs in the three files that had them.

### IN-05: `latestVersionKey` compares version keys as floats

**Files modified:** `test/deployment/GeniusDiamondDeployment.test.ts`
**Commit:** b0c2510
**Applied fix:** Version keys are now compared numerically per dot-component
(`"2.10"` beats `"2.6"` because 10 > 6 at the minor position; missing components
default 0), and an empty `versions` map throws a clear `Error` instead of the reduce
`TypeError`. Verified against the real 2.5/2.6 config by the 17-test
GeniusDiamondDeployment suite (includes "should deploy each facet at its latest
configured version").

### IN-06: Outer per-test snapshot revert is silently invalidated inside the uninit describes

**Files modified:** `test/unit/ERC20ProxyFacet.test.ts`
**Commit:** 3142b3b
**Applied fix:** Added the finding's comment option at the outer `afterEach`
documenting that inside the three "(Uninitialized)" describes the inner rewind
invalidates the outer snapshot, so the outer revert intentionally no-ops there and
isolation comes from each describe's own per-test rewind. (Behavior deliberately
unchanged — the rewind-flag restructuring was the heavier alternative.)

### IN-07: `decimals()` hardcodes 18 while child-token amounts are plain counts

**Files modified:** `contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol`
**Commit:** 22018ce
**Applied fix:** Applied the finding's document branch: a comment on `decimals()`
recording that 18 is a deliberate metadata decision for ERC-20 tooling compatibility
while child-token amounts are plain minion-denominated counts (consumers trusting the
value mis-scale by 18 orders of magnitude). Returning `0` was rejected as a metadata
behavior change to a deployed surface, beyond this finding's scope.

### IN-08: Lazy linker can double-deploy the library under concurrent factory requests

**Files modified:** `scripts/utils/GNUSLifecyclePolicyLinking.ts`
**Commit:** 8e7bd78
**Applied fix:** The per-chain cache now stores in-flight `Promise<string>` values
via a `rememberLibraryDeployment(key, deploy)` memoizer: the cache check-and-set is
serialized through the map so concurrent linking-factory requests on one chain await
the same deployment, and a failed deployment is evicted so the next request retries.
`deployAndLinkLifecyclePolicy`, `deployAndLinkLifecyclePolicyWithSigner`, the patch's
cache read (now `await`ed), and `installLifecyclePolicyLinker` (now `has`-guarded so
it never overwrites an in-flight or completed entry) all use the promise-valued map.
Note: no current caller triggers concurrent factory requests, so the race path itself
is **fixed: requires human verification**; the sequential paths are covered by the
full suite (87 passing).

## Skipped Issues

None — all 14 in-scope findings were fixed.

## Operational note for the verifier

The husky pre-commit hook runs `yarn clean-compile`, whose `clean` → `compile`
ordering leaves `typechain-types/diamond-abi/` missing (the synthetic
`artifacts/diamond-abi/*.sol/*.json` files are written by test-suite runs via
`loadDiamondContract`, after the in-hook compile has already run). After any commit,
restore the typings before running `npx tsc`:

1. Run any suites covering both diamonds (e.g. the two deployment suites), and/or
2. `npx typechain --target ethers-v6 --out-dir typechain-types "artifacts/!(build-info)/**/+([a-zA-Z0-9_]).json"`

The gate results above (87 passing / 0 failing, tsc 0 errors) were produced after this
restoration at HEAD = 8e7bd78.

---

_Fixed: 2026-08-29T23:59:51Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
