# Phase 1: ERC-20 Proxy Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-28
**Phase:** 1-ERC-20 Proxy Hardening
**Areas discussed:** Init validation strictness, Allowance semantics parity, DEX test depth
**Mode:** Advisor (table-first) — USER-PROFILE technical owner, minimal_decisive tier; three parallel gsd-advisor-researcher agents researched the areas before selection

---

## Area Selection

Presented 4 gray areas; user selected 3 for discussion. **Pin bump target deliberately not selected** — left to researcher/planner discretion (floor `d731384`).

---

## Init validation strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Guards + smoke test | require nonzero 1155 address, childTokenId != 0, non-empty name/symbol + warm-up totalSupply(childTokenId) call before committing writes. ~5 lines, no new imports. | ✓ |
| ERC-165 gate | supportsInterface(IERC1155) + zero-address check only. Cannot verify ERC1155Supply (no interface ID exists); misses empty strings and id 0. | |

**User's choice:** Guards + smoke test
**Notes:** Advisor research (OWASP SC10, Aurelion Labs uninitialized-diamond incident): static guards neutralize the three unrecoverable misconfigs; the warm-up call verifies contract existence + ABI compatibility strictly better than ERC-165. Unminted child ids still pass (ERC1155Supply returns 0) — no false brick of a legitimately not-yet-minted token.

---

## Allowance semantics parity

| Option | Description | Selected |
|--------|-------------|----------|
| Match reference | Mirror GNUSBridge _approve/_spendAllowance exactly: approve(max) infinite and never decremented, direct overwrite, Approval emitted on decrement. OZ-standard router behavior. | ✓ |
| Diverge | USDT-style zero-first re-approval rule and/or decrement max allowances. Breaks router re-approval flows; creates two divergent ERC-20 surfaces. | |

**User's choice:** Match reference
**Notes:** Research confirmed the reference at GNUSBridge.sol:531/547 is byte-for-byte the OpenZeppelin v4/v5 pattern that Uniswap-family routers and SafeERC20 integrators assume. Divergence carries high risk (router re-approve-max txs revert, per-transfer gas) for only the well-known SWC-114 race mitigation.

---

## DEX test depth

| Option | Description | Selected |
|--------|-------------|----------|
| Unit + integration | Exhaustive unit allowance tests + new test/integration/DEXFlow.test.ts running the router pattern against the live bumped GeniusDiamond+ProxyDiamond pair. | ✓ |
| Unit only | Extend the existing unit test only. Cannot prove allowance independence from operator approval — criterion 5 fails as written. | |

**User's choice:** Unit + integration
**Notes:** Researcher's decisive point: the pre-phase allowance IS isApprovedForAll, and the bumped nested submodule's ERC1155ProxyOperator overrides that check — the highest-risk interaction (new allowance mapping vs. custom operator semantics) is only exercisable with both contracts live. The integration fixture simultaneously proves the deployment harness survives the pin bump. Router simulated by a plain signer; no fork infra, no new deps.

---

## Claude's Discretion

- Pin bump target commit (exact `d731384` vs latest gnus-ai-contracts tip; GeniusDiamond pin matches current gnus-ai) — user non-selection
- Allowance internal placement (facet-local vs `ERC20Storage` library copy), exact revert strings, test file organization

## Deferred Ideas

- ERC-165 gate layering — only if the proxy is ever pointed at third-party ERC-1155s beyond GeniusDiamond
- Repo hygiene (committed `coverage/`, stale diamond-abi messages) — carried from gnus-ai 11-CONTEXT; not Phase 1 scope
- Proxy diamond upgrade governance — out of scope, no live deployments
