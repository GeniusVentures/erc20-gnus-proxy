# Phase 1: ERC-20 Proxy Hardening - Context

**Gathered:** 2026-08-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the standalone ProxyDiamond DEX-safe: real amount-specific ERC-20 allowances (PROXY-01), one-shot immutable initialization of all four config fields (PROXY-02), and the nested-submodule pin bump that lets tests run against a current GeniusDiamond (PROXY-04). This is parent-milestone v1.1 Phase 16, executing in this repo as its own Phase 1.

In scope: `ERC20ProxyFacet.sol` allowance/init surface, `ERC20ProxyStorage.Layout` append, DEX-flow tests (unit + integration), nested `contracts/gnus-ai` pin ≥ `d731384` and `diamonds/GeniusDiamond` pin match.

Out of scope: redeem-adapter work (PROXY-03 shipped in gnus-ai as caller-bound direct-burn — the proxy never calls redeem), reserve/custody apparatus, proxy operator exemptions, proxy diamond upgrade governance, anything on the gnus-ai diamond itself.

</domain>

<decisions>
## Implementation Decisions

### Allowance semantics (PROXY-01)
- **D-01:** `_allowances` mapping (`mapping(address => mapping(address => uint256))`) appended to `ERC20ProxyStorage.Layout` — append-only, AFTER the existing four fields. `approve(spender, amount)` writes the mapping and emits `Approval`; `allowance(owner, spender)` reads it; `transferFrom()` spends via `_spendAllowance()`. No `setApprovalForAll` anywhere on the ERC-20 surface. *(Carried from gnus-ai 11-CONTEXT D-10/D-11.)*
- **D-02:** **Match the reference implementation exactly** — mirror `GNUSBridge.sol` `_approve` (line 531) / `_spendAllowance` (line 547): `approve(type(uint256).max)` is infinite and NEVER decremented in `transferFrom`; direct overwrite allowed (zero-address checks only, no USDT-style "approve to 0 first" rule); `Approval` emitted on decrement. Rationale: byte-for-byte OpenZeppelin-standard router behavior, and identical semantics with the diamond-side facade means one allowance mental model across both ERC-20 surfaces. The SWC-114 approval race is accepted as the industry-standard trade-off (same as OZ, USDC).

### Init immutability (PROXY-02)
- **D-03:** `initializeERC20Proxy` becomes one-shot via the already-imported `Initializable` `initializer` modifier; `childTokenId`, `erc1155Contract`, `name`, `symbol` are all write-once. *(Carried from gnus-ai 11-CONTEXT D-12.)*
- **D-04:** **Static guards + functional smoke test** at init — `require(_erc1155Address != address(0))`, `require(_childTokenId != 0)` (id 0 is GNUS itself; proxying it creates a second competing ERC-20 face), non-empty `name`/`symbol`, plus a warm-up call `l.erc1155Contract.totalSupply(_childTokenId)` BEFORE committing the writes (proves the target is a live contract speaking the exact ABI this facet depends on; unminted child ids still pass since ERC1155Supply returns 0). ERC-165 `supportsInterface` was REJECTED as the gate: no interface ID exists for the `ERC1155Supply` extension this facet actually calls, and diamond loupe aggregation can false-negative.

### DEX-flow tests (PROXY-01 acceptance)
- **D-05:** **Unit + integration depth.** Unit: extend `test/unit/ERC20ProxyFacet.test.ts` for the exhaustive finite-allowance state machine (decrement math, over-spend revert, zero-allowance rejection). Integration: new `test/integration/DEXFlow.test.ts` (modeled on `GNUSAiIntegration.test.ts`) running the full router pattern against the live GeniusDiamond+ProxyDiamond pair from the bumped nested submodule — approve → transferFrom → decreasing allowance → zero-allowance rejection → **`setApprovalForAll` does NOT grant or spend ERC-20 allowance** → max-allowance no-decrement check. Router simulated by a regular signer (a router is just approve+transferFrom — no fork infra, no new deps). Criterion 5 (allowance independent of operator approval) is only provable with both contracts live, because the nested `ERC1155ProxyOperator` overrides `isApprovedForAll`.

### Constraints carried forward (locked — do not re-litigate)
- Breaking change accepted: integrations relying on `approve → setApprovalForAll` break; that behavior was the vulnerability. No migration shim. *(11-CONTEXT D-13.)*
- Proxy stays a dumb thin wrapper: no token custody, no `NFT_PROXY_OPERATOR_ROLE` bypass reliance. *(11-CONTEXT / 13-CONTEXT D6.)*
- Solidity 0.8.19; diamond storage append-only.
- Branch `gsd/phase-1-erc-20-proxy-hardening` created before work; PRs target `develop`, never `main`; commit in this submodule first, then pin-bump outer TokenContracts.

### Claude's Discretion
- **Pin bump target** (user deliberately did not select this for discussion): researcher/planner picks the gnus-ai-contracts commit, floor `d731384`, leaning latest stable; `diamonds/GeniusDiamond` pin matches whatever current gnus-ai uses. Deployment-harness rework forced by the bump is in-scope phase work (D-05 integration suite doubles as its proof).
- Exact revert strings; whether allowance internals live in the facet or a copied library helper (the `ERC20Storage` library from `@gnus.ai/contracts-upgradeable-diamond` is already available as an alternative storage home — planner weighs against D-01's Layout append).
- Test file organization details within the three existing test dirs.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Controlling decisions (gnus-ai, archived at v1.0 close)
- `../gnus-ai/.planning/milestones/v1.0-phases/11-erc-20-proxy-hardening/11-CONTEXT.md` — D-01..D-14, the controlling proxy-hardening decisions (this repo's ROADMAP cites the pre-archive path `gnus-ai/.planning/phases/…` — the archived path above is canonical now). Note D-08's two-gate adapter design is superseded by the shipped caller-bound direct-burn redeem.
- `../gnus-ai/.planning/milestones/v1.0-phases/09-per-child-gnus-treasury-reserve/09-CONTEXT.md` — D1 conversion-native model, D5 nonConvertible semantics (context for what the child token is).
- `../gnus-ai/.planning/milestones/v1.0-phases/13-time-bound-erc1155-entitlements/13-CONTEXT.md` — D6 proxy-operator bypass risk; "keep the proxy dumb" constraint.

### Parent milestone (v1.1)
- `../../.planning/ROADMAP.md` §Phase 16 — goal/success criteria (executes here as Phase 1)
- `../../.planning/REQUIREMENTS.md` — PROXY-01/02/04 definitions and traceability

### Source files
- `contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol` — the broken surface to fix: `approve` → `setApprovalForAll(spender, amount>0)` (line 112), `allowance` → max/0 via `isApprovedForAll` (line 102), `transferFrom` requires operator approval (line 126), re-callable `initializeERC20Proxy` with zero validation (line 25)
- `contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol` — `Layout` struct; `_allowances` appends here per D-01
- `contracts/erc20-gnus-proxy/ProxyDiamond.sol` — the diamond scaffold
- `../gnus-ai/contracts/gnus-ai/GNUSBridge.sol` lines 440-622 — the reference ERC-20 facade (`_approve` :531, `_spendAllowance` :547) to mirror per D-02
- `contracts/gnus-ai/ERC1155ProxyOperator.sol` — the operator override that makes criterion 5 integration-testable (in the NESTED submodule copy that will be bumped)

### Requirements source
- [erc20-gnus-proxy#9](https://github.com/GeniusVentures/erc20-gnus-proxy/issues/9) — PROXY-01/02 text, owner Am0rfu5
- [erc20-gnus-proxy#10](https://github.com/GeniusVentures/erc20-gnus-proxy/issues/10) — superseded reserve-adapter design; reinterpretation per 11-CONTEXT D-06/D-07

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Initializable.sol` from `@gnus.ai/contracts-upgradeable-diamond/proxy/utils/Initializable.sol` — already imported by `ERC20ProxyFacet`; provides the `initializer` modifier for D-03.
- `../gnus-ai/contracts/gnus-ai/GNUSBridge.sol:531-560` — `_approve`/`_spendAllowance` internals: copy-adapt for the facet per D-02.
- Existing test infrastructure: `test/unit/ERC20ProxyFacet.test.ts` (snapshot-isolated, LocalDiamondDeployer fixture), `test/integration/GNUSAiIntegration.test.ts` (the model for `DEXFlow.test.ts`), `test/deployment/*` suites, `test-assets/deployments-test/GeniusDiamond` fixtures.

### Established Patterns
- Diamond storage append-only: new `Layout` fields only at the end (storage-slot compatibility).
- `erc1155Contract` is stored as a typed `ERC1155SupplyUpgradeable` contract instance inside the Layout — the warm-up smoke call (D-04) reuses the assignment target before the struct writes commit.
- Tests deploy a GeniusDiamond from the NESTED `contracts/gnus-ai` submodule — pin bump (PROXY-04) changes what those tests exercise; the Oct-2024 → 2026-08 delta may force deployment-harness rework.

### Integration Points
- Proxy → GeniusDiamond (ERC-1155): `safeTransferFrom`, `balanceOf`, `totalSupply` on the immutable `childTokenId` — the only diamond touchpoints.
- Diamond → proxy: none (proxy dumb; diamond never calls back).
- No redeemer path: the proxy never calls `redeem`; gnus-ai owns it caller-bound.

</code_context>

<specifics>
## Specific Ideas

- Parity motive (D-02): two ERC-20 surfaces will exist for the same underlying asset (diamond facade + this proxy); divergent allowance semantics between them is the integrator footgun to eliminate.
- Criterion-5 testability (D-05): independence from operator approval is a two-contract property — the nested `ERC1155ProxyOperator` overrides `isApprovedForAll`, so the proof needs the live pair.

</specifics>

<deferred>
## Deferred Ideas

- ERC-165 `supportsInterface` gate — layer ON TOP of the static guards only if the proxy is ever pointed at third-party ERC-1155s beyond GeniusDiamond.
- Repo hygiene observed at bootstrap (`coverage/`, `coverage.json` committed at repo root; stale diamond-abi commit messages) — carried from 11-CONTEXT deferred; not in Phase 1 scope.
- Proxy diamond upgrade governance (who can diamondCut ProxyDiamond) — out of scope; no live proxy deployments documented.

None of these block Phase 1.

</deferred>

---

*Phase: 1-erc-20-proxy-hardening*
*Context gathered: 2026-08-28*
