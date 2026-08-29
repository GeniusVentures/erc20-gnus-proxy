---
phase: 01-erc-20-proxy-hardening
reviewed: 2026-08-29T23:33:21Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol
  - contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol
  - contracts/erc20-gnus-proxy/mocks/MockERC1155Supply.sol
  - diamonds/ProxyDiamond/proxydiamond.config.json
  - hardhat.config.ts
  - package.json
  - scripts/utils/GNUSLifecyclePolicyLinking.ts
  - test/deployment/GeniusDiamondDeployment.test.ts
  - test/deployment/ProxyDiamondDeployment.test.ts
  - test/deployment/ProxyDiamondPostDeploymentComparison.test.ts
  - test/integration/DEXFlow.test.ts
  - test/integration/GNUSAiIntegration.test.ts
  - test/unit/ERC20ProxyFacet.test.ts
findings:
  critical: 0
  warning: 6
  info: 8
  total: 14
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-08-29T23:33:21Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Reviewed the ERC-20 proxy hardening deliverable across the facet/storage/mock Solidity
sources, the diamond/toolchain configs, the GNUSLifecyclePolicy linking harness, and the
six test suites at commit range `317c280..HEAD`.

**The core contract change is sound.** The `_approve`/`_spendAllowance` internals are
character-identical to the gnus-ai `GNUSBridge.sol:531-560` reference (verified
side-by-side), satisfying D-02 exactly. The `_allowances` mapping is a true append at
`Layout` slot 4 (after `erc1155Contract`, `childTokenId`, `name`, `symbol`), satisfying
D-01 append-only. `initializeERC20Proxy` implements D-03 (one-shot `initializer`) and
D-04 (static guards + `totalSupply(uint256)` warm-up before the commit writes) as decided.
No Critical findings on the contract surface.

Per the phase context, the following were **verified and deliberately NOT flagged**: the
mock's reverting operator plane (the DEXFlow live-pair suite proves the real operator
topology — `NFT_PROXY_OPERATOR_ROLE` grant + explicit `setApprovalForAll(proxy)` — is a
tested integration requirement, not an unhandled gap), and the SWC-114 approval race
(accepted trade-off per D-02).

The 14 findings are all in the surrounding harness: a no-op test that inflates the
evidence count, a completely untested `transfer()` path that the unit suite's tripwire
comment claims is covered, a malformed mainnet RPC URL, wrong `chainManager` chain IDs,
an arity-narrowing defect in the `getContractFactory` monkey-patch, and a time-bomb
block-range assertion — plus dead code and latent pitfalls at Info level.

## Critical Issues

None found in the changed contract code.

## Warnings

### WR-01: Empty test asserts nothing while claiming proxy verification

**File:** `test/integration/GNUSAiIntegration.test.ts:209`
**Issue:** `it("should verify the ERC20Proxy has the TestToken", async function () {});`
has an empty body. It always passes, inflates the green-test count (the suite's "85
green" includes it), and its name claims exactly the verification this phase exists to
provide — a reader auditing proxy coverage will believe it was performed. This is the
"missing assertions" failure mode that directly affects test reliability.
**Fix:** Either implement it (deploy/wire a ProxyDiamond against the GeniusDiamond child
token as DEXFlow already does and assert `totalSupply()`/`balanceOf()` parity) or delete
it. Do not leave a named no-op in the suite.

### WR-02: `transfer()` has zero test coverage anywhere; the tripwire comment claims otherwise

**File:** `test/unit/ERC20ProxyFacet.test.ts:577-595` (claim), `contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol:99-104` (untested code)
**Issue:** A grep across all suites for `.transfer(` (excluding `transferFrom`) returns
zero matches — the facet's `transfer()` is never called by any unit, integration, or
deployment test. Two consequences: (a) D-05's "exhaustive" state-machine claim is
unfulfilled for a core ERC-20 function; (b) the unit suite's operator-plane comment
("every passing transfer/approve test above also proves the facet never touches the
operator plane") cites transfer tests that do not exist — the mock tripwire is exercised
only via `transferFrom` and `approve`.
**Fix:** Add unit tests mirroring the `transferFrom` block: successful `transfer` moves
child-token balance and emits `Transfer(msg.sender, recipient, amount)`; over-balance
`transfer` reverts inside the mock's balance check.

### WR-03: Mainnet RPC URL is malformed — API key concatenated into the `network` parameter

**File:** `hardhat.config.ts:261`
**Issue:** `url: \`https://lb.drpc.org/ogrpc?network=ethereum=${process.env.DRPC_API_KEY}\``
is missing the `&dkey=` parameter name (every other drpc entry uses
`?network=X&dkey=${...}`). The key becomes part of the `network` value, so any
`--network mainnet` deploy/verify hits an invalid/unauthenticated endpoint. Pre-existing
line, but it is in a reviewed file and is a latent production-path break.
**Fix:**
```ts
url: `https://lb.drpc.org/ogrpc?network=ethereum&dkey=${process.env.DRPC_API_KEY}`,
```

### WR-04: `chainManager` chain IDs contradict the real chains and the `networks` section

**File:** `hardhat.config.ts:130,135`
**Issue:** `chainManager.chains.sepolia.chainId` is `11155112` — Sepolia is `11155111`,
which is what `networks.sepolia.chainId` (line 220) correctly says. Likewise
`chainManager.chains.polygon_amoy.chainId` is `800002` while Amoy is `80002` (line 251).
Any `test-multichain --chains sepolia` / `polygon_amoy` run forks one chain ID while
configuring another — hardhat rejects forking configs whose pinned chainId mismatches the
fork target, so those runs fail confusingly. Pre-existing, in a reviewed file.
**Fix:** Set sepolia to `11155111` and polygon_amoy to `80002` (then remove the redundant
`800002` hardforkHistory stub at line 176-180 if desired).

### WR-05: Monkey-patched `getContractFactory` silently drops arguments past the second

**File:** `scripts/utils/GNUSLifecyclePolicyLinking.ts:179-233`
**Issue:** The replacement is declared `async (nameOrAbi: any, opts?: any)` and forwards
only `original(nameOrAbi, opts)`. hardhat-ethers exposes a 3-argument overload
`getContractFactory(abi, bytecode, signer)` (confirmed in
`@nomicfoundation/hardhat-ethers/types/index.d.ts:14`); for that form the patch rebinds
`opts = bytecode` and drops the `signer` entirely, so any ABI-form caller would get a
factory on the default signer — contracts deployed from the wrong account, silently. No
current repo call site uses the 3-arg form (the diamonds framework uses
`getContractFactory(name, { signer })`), which is why tests stay green — the defect is
latent in a process-wide patch installed on every hardhat process.
**Fix:** Preserve arity with rest parameters:
```ts
ethersRef.getContractFactory = async (...args: any[]) => {
  const [nameOrAbi, opts] = args;
  // ... existing string-name logic, possibly rewriting args[1] ...
  return original(...args);
};
```

### WR-06: Block-number upper-bound assertion is a time bomb on forked/live networks

**File:** `test/deployment/ProxyDiamondDeployment.test.ts:154`, `test/deployment/GeniusDiamondDeployment.test.ts:192`
**Issue:** `expect(blockNumber).to.be.lte(configBlockNumber + 500)` compares the live
provider's head block against the pinned fork block + 500. On any fork/live multichain
run, the chain advances; once the head is 501+ blocks past the pin, these tests fail for
no code-related reason (and the bound is arbitrary — block time on some chains blows past
500 blocks within minutes). This is the flaky-pattern class that affects test
reliability. Pre-existing lines inside modified files.
**Fix:** Assert only the meaningful invariant — the fork was created at or after the pin:
drop the upper bound, or gate it on `networkName === "hardhat"` (in-memory chain where
the head is deterministic).

## Info

### IN-01: Duplicate owner enforcement in `initializeERC20Proxy`

**File:** `contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol:33-34`
**Issue:** The function carries both the `onlyOwnerRole` modifier and an explicit
`LibDiamond.enforceIsContractOwner();` as its first statement — the identical check runs
twice (extra gas, and a reader must puzzle over which one is authoritative).
**Fix:** Drop line 34 and keep the modifier (or vice versa).

### IN-02: Unused import `IERC1155Upgradeable`

**File:** `contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol:6`
**Issue:** `IERC1155Upgradeable` is imported but never referenced in the facet (the cast
on line 43 uses `ERC1155SupplyUpgradeable`, which arrives transitively via
`ERC20ProxyStorage.sol`).
**Fix:** Delete the import.

### IN-03: Debug namespace built from a single-quoted string containing `${...}`

**File:** `test/unit/ERC20ProxyFacet.test.ts:26`, `test/deployment/ProxyDiamondDeployment.test.ts:26`, `test/deployment/ProxyDiamondPostDeploymentComparison.test.ts:27`, `test/integration/GNUSAiIntegration.test.ts:23`
**Issue:** `debug("GNUSDeploy:log:${diamondName}")` uses single quotes, so the namespace
is the literal text `GNUSDeploy:log:${diamondName}` — `DEBUG=GNUSDeploy:log:*` filtering
by diamond never matches the intended value. `GeniusDiamondDeployment.test.ts:65` does it
correctly with backticks.
**Fix:** Change the quotes to backticks.

### IN-04: Dead statements and unused variables in test files

**File:** `test/deployment/GeniusDiamondDeployment.test.ts:142` (`ownerSigner;`), `test/integration/GNUSAiIntegration.test.ts:107` (`ownerGeniusSigner;`), `test/unit/ERC20ProxyFacet.test.ts:57,128` (`signer2Diamond` assigned, never used), `test/unit/ERC20ProxyFacet.test.ts:110-111`, `test/deployment/ProxyDiamondDeployment.test.ts:80-81`, `test/deployment/ProxyDiamondPostDeploymentComparison.test.ts:79-80` (`diamondArtifactName` computed, never used)
**Issue:** No-op expression statements left from an if/else collapse, plus
connect/compute results never consumed. Harmless but noise in suites presented as
evidence.
**Fix:** Delete the no-op statements and unused bindings.

### IN-05: `latestVersionKey` compares version keys as floats

**File:** `test/deployment/GeniusDiamondDeployment.test.ts:55-61`
**Issue:** `Number(b) > Number(a)` over version keys: `"2.10"` numerically equals 2.1 and
loses to `"2.6"` (2.6), so a future 2.10 facet would be validated against the wrong
"latest" version; and an empty `versions` object makes `reduce` throw `TypeError`
(crash, not assertion failure). Safe with the current 2.5/2.6 config only.
**Fix:** Compare major/minor numerically per component (split on `"."`), and return early
(or `expect.fail`) when `versions` is empty.

### IN-06: Outer per-test snapshot revert is silently invalidated inside the uninit describes

**File:** `test/unit/ERC20ProxyFacet.test.ts:160-166,267-321,444-453`
**Issue:** In the three "Uninitialized" describes, the inner `beforeEach` `evm_revert`s to
a pool snapshot taken BEFORE the outer `beforeEach` snapshot. Hardhat's `evm_revert`
invalidates snapshots created after the reverted one, so the outer `afterEach`
`evm_revert(snapshotId)` targets a dead snapshot and quietly returns `false` — a no-op.
The suite still works because every uninit test rewinds again in its own `beforeEach`,
but the outer isolation layer is dead code inside those describes and relies on subtle,
undocumented snapshot semantics.
**Fix:** Add a comment noting the outer revert is intentionally ineffective inside
uninit describes, or skip the outer snapshot when a rewind flag is set.

### IN-07: `decimals()` hardcodes 18 while child-token amounts are plain counts

**File:** `contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol:70-72`
**Issue:** DEXFlow documents child-token amounts as plain minion-denominated BigInt
counts (`CHILD_MINT_AMOUNT = 1000000n`), yet the proxy advertises `decimals() = 18`.
DEX routers and indexers that trust the 18-decimals claim will mis-scale displayed and
quoted amounts by 18 orders of magnitude. Pre-existing metadata decision, unchanged this
phase — flagging so it is a conscious choice rather than an accident.
**Fix:** If child tokens are indeed plain counts, return `0` (or document the mismatch);
otherwise leave as-is with a comment recording the decision.

### IN-08: Lazy linker can double-deploy the library under concurrent factory requests

**File:** `scripts/utils/GNUSLifecyclePolicyLinking.ts:197-219`
**Issue:** The cache check and set are not serialized: two concurrent
`getContractFactory` calls for linking artifacts on the same chain key (e.g. a future
`Promise.all` facet deployment) both miss the cache and both deploy the library. Both
deployed libraries exist on-chain so links still resolve, but the cache ends pointing at
the second address while some bytecode references the first — confusing during incident
debugging.
**Fix:** Memoize the in-flight deployment promise per chain key (store
`Promise<string>` in the map) instead of the resolved address only.

---

_Reviewed: 2026-08-29T23:33:21Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
