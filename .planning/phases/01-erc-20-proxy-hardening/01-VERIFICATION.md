---
phase: 01-erc-20-proxy-hardening
verified: 2026-08-29T23:40:06Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
---

# Phase 1: ERC-20 Proxy Hardening Verification Report

**Phase Goal:** Fix ERC-20 proxy approval/allowance semantics and make child token ID (and all init config) immutable.
**Verified:** 2026-08-29T23:40:06Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Verified against the 5 ROADMAP success criteria plus the pin-bump enabler (the roadmap
`success_criteria` JSON array is empty; the criteria live in the ROADMAP.md phase section
and were used verbatim).

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Real `_allowances` mapping in `ERC20ProxyStorage.Layout` — amount-specific ERC-20 approvals (replaces `setApprovalForAll()` backing) | ✓ VERIFIED | `contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol:27` — `mapping(address => mapping(address => uint256)) _allowances` appended as the LAST Layout member; commit `447e5d1` diff shows pure append (existing field order and `keccak256("erc20.proxy.storage")` slot constant untouched) |
| 2 | `approve(spender, amount)` sets a real allowance; `allowance()` returns the real value | ✓ VERIFIED | `ERC20ProxyFacet.sol:122-125` → `_approve` writes `layout()._allowances[owner][spender] = amount` + emits `Approval` (lines 155-161); `allowance()` reads the same mapping (lines 112-114). Unit tests assert set/read round-trip with event; DEXFlow test 1 asserts live-pair round-trip |
| 3 | `transferFrom()` uses real allowance with `_spendAllowance()` — no `isApprovedForAll` requirement on the ERC-20 surface | ✓ VERIFIED | `ERC20ProxyFacet.sol:134-140` calls `_spendAllowance(sender, msg.sender, amount)` before the ERC-1155 leg; `_spendAllowance` (171-179) requires `currentAllowance >= amount` ("ERC20: insufficient allowance"), decrements finite allowances, never decrements `type(uint256).max`. Zero occurrences of `isApprovedForAll`/`setApprovalForAll` in the facet; aggregated ProxyDiamond ABI (20 entries) contains neither function (0 grep hits in `diamond-abi/ProxyDiamond.json`) |
| 4 | Child token ID (and `erc1155Contract`, `name`, `symbol`) immutable after one-shot initialization | ✓ VERIFIED | `initializeERC20Proxy` carries the `initializer` modifier (`ERC20ProxyFacet.sol:33`); config writes exist ONLY inside that function (lines 42-47); grep confirms no other contract imports `ERC20ProxyStorage`, and `proxydiamond.config.json` deploys exactly 3 facets (Cut/Loupe/Proxy). Re-init test reverts "Initializable: contract is already initialized" and asserts config unchanged |
| 5 | DEX-style approve → transferFrom flow tested: allowance decreases correctly, zero-allowance rejection, allowance independent of operator approval | ✓ VERIFIED | `test/integration/DEXFlow.test.ts` against the live GeniusDiamond+ProxyDiamond pair: test 2/3 finite decrement + exact remainder, test 4 over-spend revert moves nothing, test 5 zero-allowance rejection, test 6 (criterion 5) proves BOTH directions — operator approval (role + `setApprovalForAll`) grants zero allowance AND spend works without router operator approval — while the proxy holds `NFT_PROXY_OPERATOR_ROLE`; test 7 MaxUint256 no-decrement. Suite executed by this verifier: green |
| 6 | Enabler: nested `contracts/gnus-ai` pin ≥ d731384 and matching `diamonds/GeniusDiamond` pin | ✓ VERIFIED | `git submodule status`: `contracts/gnus-ai` at `61b7ca45` (verified descendant of `d731384` via `merge-base --is-ancestor`), `diamonds/GeniusDiamond` at `dfebdf09`. Both diamonds deploy from these pins in the test run |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol` | `_allowances` append-only home (D-01) | ✓ VERIFIED | 40 lines, mapping present, slot constant untouched (diff-verified) |
| `contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol` | D-02 allowance internals + D-03/D-04 one-shot guarded init | ✓ VERIFIED | 188 lines; `_spendAllowance`/`_approve`/`initializer`/4 static guards + `totalSupply(uint256)` warm-up (line 44) before commits (45-47) |
| `contracts/erc20-gnus-proxy/mocks/MockERC1155Supply.sol` | Minimal ERC-1155 mock with reverting operator plane | ✓ VERIFIED | 51 lines; `setApprovalForAll`/`isApprovedForAll` revert by design (tripwire); mint/balance/supply/safeTransferFrom real |
| `test/unit/ERC20ProxyFacet.test.ts` | Mock-based fixture, flipped re-init, D-04 guards, allowance state machine | ✓ VERIFIED | 599 lines; explicit `initializeERC20Proxy(mockAddress, 1, ...)` (line 152); re-init revert (line 337); 8 D-04 guard tests incl. EOA and wrong-ABI warm-up rejections + unminted-id acceptance; 7 state-machine tests; ABI absence check (line 577) |
| `test/integration/DEXFlow.test.ts` | D-05 live-pair router suite (criterion 5) | ✓ VERIFIED | 502 lines; `setupLifecyclePolicyLinking()` first statement (line 90); both diamonds from configs; 9 tests incl. the two-direction criterion-5 proof |
| `scripts/utils/GNUSLifecyclePolicyLinking.ts` | Library-linking harness (five exports) | ✓ VERIFIED | 278 lines; `LIBRARY_FQN` + 5 exports; zero top-level imports (config-load safe); wired via `hardhat.config.ts:12,22` `extendEnvironment(installLazyLifecyclePolicyLinker)` |
| `diamonds/GeniusDiamond/geniusdiamond.config.json` | 2.6 facet config, callback-free | ✓ VERIFIED | `protocolVersion: 2.6`, `GNUSTreasury_Initialize260` present, 0 "callback" references; GeniusDiamond deploys from it in 3 suites |
| `package.json` / `yarn.lock` | Pinned `@geniusventures` deps; tracked lockfile | ✓ VERIFIED | Exact pins `1.3.4-gv` / `1.1.15-gv.2` / `1.1.0-gv`; `@gnus.ai/contracts-upgradeable-diamond` `=4.5.0` untouched; `yarn.lock` tracked; 0 tracked build dirs (`node_modules/`, `openzeppelin-*`, `sushi-list/`, `package-lock.json` all untracked) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `ERC20ProxyFacet.sol` | `ERC20ProxyStorage.sol` | `ERC20ProxyStorage.layout()._allowances` reads/writes | ✓ WIRED | Lines 113, 159 (pattern present 3x) |
| `ERC20ProxyFacet.sol` | `Initializable` (upgradeable-diamond) | `initializer` modifier on `initializeERC20Proxy` | ✓ WIRED | Line 33; import line 4; runtime-proven by re-init revert test |
| `hardhat.config.ts` | `GNUSLifecyclePolicyLinking.ts` | `extendEnvironment(installLazyLifecyclePolicyLinker)` | ✓ WIRED | hardhat.config.ts lines 12, 20-22 |
| `test/unit before()` | `MockERC1155Supply` | explicit `initializeERC20Proxy(mockAddress, 1, ...)` | ✓ WIRED | Test line 152; mock deployed line 143 |
| `DEXFlow before()` | linking harness / configs | `setupLifecyclePolicyLinking()` before `getInstance`; `configFilePath` 2.6 configs | ✓ WIRED | Test lines 90, 98, 113; GeniusDiamond deploy succeeds (no UNLINKED_LIBRARY) |
| DEXFlow fixture | `ERC1155ProxyOperator` role | `grantRole(NFT_PROXY_OPERATOR_ROLE, proxy)` client-side keccak256 | ✓ WIRED | Test lines 70-72, 200-203; `hasRole` asserted true at runtime |
| Facet config | nested gnus-ai @ 61b7ca4 | every facet deploys from the pinned submodule | ✓ WIRED | 3 GeniusDiamond-deploying suites green |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `ERC20ProxyFacet.allowance()` | `_allowances[owner][spender]` | proxy-local mapping written by `_approve` | Yes — written by `approve()`/`_spendAllowance()`, consumed by `transferFrom` gate | ✓ FLOWING |
| `ERC20ProxyFacet.totalSupply()/balanceOf()` | ERC-1155 leg | `erc1155Contract.totalSupply(childTokenId)` / `balanceOf` on live GeniusDiamond | Yes — DEXFlow asserts live-diamond parity (lines 253-256, 333-337) | ✓ FLOWING |
| DEXFlow assertions | child balances | live GeniusDiamond ERC-1155 state via factory mint (1:1 GNUS burn) | Yes — `mint(address,uint256,uint256,bytes)` production path, balances verified on BOTH contracts | ✓ FLOWING |

### Behavioral Spot-Checks

Executed by this verifier (not trusted from SUMMARY/orchestrator claims):

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full phase gate | `npx hardhat test` | 85 passing, 0 failing, exit 0 — all 6 suites ran (3 deployment + DEXFlow + GNUSAiIntegration + unit) | ✓ PASS |
| Typecheck (build leg) | `npx tsc` | exit 0 | ✓ PASS |
| Operator plane absent from proxy ABI | parse `diamond-abi/ProxyDiamond.json` | 20 entries; `approve`/`allowance`/`transferFrom`/`initializeERC20Proxy` present; `setApprovalForAll`/`isApprovedForAll` absent | ✓ PASS |
| Enabler pin ancestry | `git -C contracts/gnus-ai merge-base --is-ancestor d731384 61b7ca4` | true | ✓ PASS |
| Submodule pins | `git submodule status` | `contracts/gnus-ai` 61b7ca45, `diamonds/GeniusDiamond` dfebdf09 | ✓ PASS |
| Unscoped framework imports | grep bare `diamonds`/`hardhat-diamonds` imports outside callbacks | 0 matches; callbacks dirs deleted | ✓ PASS |

Note: the 01-05 SUMMARY honestly recorded an intermediate "83 passing / 2 failing" state;
the 01-06 gate commit (83aa74e) closed those two NFTFactory failures — this verifier's
own full-suite run confirms 0 failing at HEAD.

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` probes declared by any PLAN or SUMMARY;
the phase gate is the hardhat suite (covered under Behavioral Spot-Checks).

### Requirements Coverage

`PROXY-01`, `PROXY-02`, plus the enabler. Note: **`.planning/REQUIREMENTS.md` does not
exist in this repository** — requirement IDs are defined in `.planning/ROADMAP.md`'s
Phase 1 section (the roadmap JSON `success_criteria` array is empty; the section text is
the contract). Coverage was verified against those definitions. No orphaned IDs are
possible without a REQUIREMENTS.md; flagged below as an informational finding.

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| PROXY-01 | 01-03, 01-04, 01-05, 01-06 | Fix approval/allowance semantics — real amount-specific allowances, no operator-approval bypass | ✓ SATISFIED | Truths 1-3, 5: facet implementation + unit state machine + live-pair DEXFlow incl. criterion-5 two-direction proof |
| PROXY-02 | 01-03, 01-04, 01-06 | Make child token ID and all init config immutable (one-shot init) | ✓ SATISFIED | Truth 4: `initializer` gate, sole writer, guards, revert tests |
| enabler (pin bump) | 01-01, 01-02, 01-06 | Nested `contracts/gnus-ai` ≥ d731384 (61b7ca4) + matching GeniusDiamond pin (dfebdf0) | ✓ SATISFIED | Truth 6: submodule status + ancestry check + green deploys from the pins |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `test/integration/GNUSAiIntegration.test.ts` | 209 | Empty `it("should verify the ERC20Proxy has the TestToken", ...)` — no-op test inflates green count | ⚠️ Warning | Already documented as WR-01 in 01-REVIEW.md. Does not gate: the 01-06 must-have truths (1:1 burn economics) are covered by real assertions at lines 401-413 and 497-505 |
| `test/unit/ERC20ProxyFacet.test.ts` | 577-581 | Tripwire comment claims "every passing transfer/approve test" but `transfer()` has zero direct coverage (review WR-02) | ⚠️ Warning | `transfer()` is unchanged pre-existing code, not a phase success criterion; transferFrom/approve coverage is exhaustive |
| `hardhat.config.ts` | 261, 130, 135 | Pre-existing malformed mainnet drpc URL + wrong chainManager chain IDs (review WR-03/WR-04) | ℹ️ Info | Pre-existing lines, untouched by this phase; no phase truth depends on them |

Debt-marker gate: 0 `TBD`/`FIXME`/`XXX` across all phase-modified files
(contracts, harness, tests, configs).

### Human Verification Required

None. The phase is contracts + on-chain test suites; every success criterion was
verified programmatically (source inspection, ABI parsing, diff verification, and a
full suite execution by this verifier). No UI, no external services, no deployment to
live networks is claimed by this phase.

### Gaps Summary

No gaps. All 5 ROADMAP success criteria and the pin-bump enabler are verified in the
codebase at HEAD (dfa8bd2). The three warnings above are harness-quality items already
captured in 01-REVIEW.md (0 Critical / 6 Warning); none affect goal achievement, and the
review triage channel — not verification — owns their disposition.

---

_Verified: 2026-08-29T23:40:06Z_
_Verifier: Claude (gsd-verifier)_
