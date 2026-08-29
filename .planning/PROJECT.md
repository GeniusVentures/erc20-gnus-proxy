# ERC-20 GNUS Proxy — Hardening Project

## What This Is

The `erc20-gnus-proxy` repo is a **standalone ERC-20 proxy diamond** (ProxyDiamond + ERC20ProxyFacet) that presents one ERC-1155 child token from the GNUS.ai GeniusDiamond as a standard ERC-20 token. It is a separate contract from the gnus-ai diamond — not a facet on it.

Current state (post-hardening, Phase 01 complete 2026-08-29): the proxy's ERC-20 surface is DEX-safe —
- Real `_allowances` mapping in `ERC20ProxyStorage.Layout` (append-only, slot 4); `approve`/`allowance`/`transferFrom` use real amount-specific allowances mirroring `GNUSBridge.sol` exactly (approve(max) infinite, never decremented).
- Zero operator-plane calls on the ERC-20 surface (no `setApprovalForAll`/`isApprovedForAll`).
- `initializeERC20Proxy()` is one-shot (`initializer` modifier) with static guards + `totalSupply` warm-up; all four config fields immutable after init.
- Full suite 85 passing / 0 failing (unit 34, DEXFlow live-pair 9 incl. criterion 5, deployment 27, integration 15); toolchain pinned to `@geniusventures` npm packages, compiler 0.8.19, nested pins `contracts/gnus-ai@61b7ca4` / `diamonds/GeniusDiamond@dfebdf0`.

Pre-hardening history (for reference): approve mapped to `setApprovalForAll(spender, amount > 0)`; allowance returned max/0; `transferFrom()` required operator approval; `initializeERC20Proxy()` was re-callable (config mutable after deployment).

## Core Value

**A DEX-safe ERC-20 facade over GNUS.ai child tokens with real allowance semantics and immutable configuration.**

## Requirements

### Active

- [x] **PROXY-01**: Real amount-specific ERC-20 allowances — `_allowances` mapping in proxy storage; `approve(spender, amount)` sets a real allowance (NOT `setApprovalForAll`); `allowance()` returns the real value. *Validated in Phase 01 (2026-08-29) — VERIFICATION.md 6/6.*
- [x] **PROXY-02**: Immutable proxy configuration — `initializeERC20Proxy` is one-shot; `childTokenId`, `erc1155Contract`, `name`, `symbol` cannot change after initialization. *Validated in Phase 01 (2026-08-29) — VERIFICATION.md 6/6.*
- [x] **PROXY-03**: Redeem adapter for proxied-child → GNUS — **DONE in gnus-ai (commit d731384, 2026-08-20).** Shipped as a **caller-bound direct-burn** `redeem(uint256 childId, uint256 amount)`: the user calls the diamond directly, no operator approvals, no proxy involvement. **This repo has NO PROXY-03 work** — the proxy never calls redeem. See Cross-Repo Dependencies.

### Out of Scope

- Reserve/custody apparatus in the proxy — the proxy stays a dumb thin wrapper (no custody of tokens).
- Proxy operator exemptions — no reliance on `NFT_PROXY_OPERATOR_ROLE` auto-approval bypasses.
- Redemption rate math — conversion is 1:1 minion-denominated (gnus-ai Phase 9 D1/D2); `exchangeRate` is display-only.
- Proxy diamond upgrade governance — no live deployments documented; out of scope.

## Context

**Repo structure:** Own diamond (`ProxyDiamond`) with facets in `contracts/erc20-gnus-proxy/`. Nested submodules:
- `contracts/gnus-ai` — GeniusDiamond contracts used to deploy a test diamond (pin bumped in Phase 01 from stale Oct-2024 `7c0b237` to `61b7ca4`).
- `diamonds/GeniusDiamond` — diamond deployment tooling.

**Tests:** Hardhat/Mocha in `test/{unit,integration,deployment}`; `test-assets/deployments-test/GeniusDiamond` deployment fixtures. Tests deploy a GeniusDiamond from the nested submodule and attach the proxy to it.

**Cross-repo context:** The controlling design decisions for this project live in `gnus-ai/.planning/phases/11-erc-20-proxy-hardening/11-CONTEXT.md` (D-01..D-14), captured 2026-08-19. This repo's Phase 1 implements the proxy-side half (PROXY-01/02 + DEX tests). Note: 11-CONTEXT.md D-08 describes the superseded two-gate adapter design; the shipped caller-bound direct-burn redeem (see PROXY-03 above) removes any proxy/redeem interaction.

## Constraints

- **Solidity 0.8.19** compiler target (matches gnus-ai).
- **Diamond storage append-only** — `ERC20ProxyStorage.Layout` may only gain new fields at the end (deployed-proxy storage compatibility).
- **Breaking change accepted** — integrations relying on `approve → setApprovalForAll` will break; that behavior was the vulnerability. No migration shim.
- **Branch conventions:** work happens on `gsd/phase-{N}-{slug}` branches; PRs target `develop`, NEVER `main`.
- **Multi-repo protocol:** commit inside this submodule first, then pin-bump the outer TokenContracts repo.

## Cross-Repo Dependencies

| Dependency | Direction | Detail |
|---|---|---|
| gnus-ai Phase 11 (redeem adapter) | none (shipped) | PROXY-03 shipped in gnus-ai as caller-bound direct-burn `redeem(childId, amount)` (contracts `d731384`, gnus-ai `ff28e18`). The user calls the diamond directly — the proxy never calls redeem, holds no redeem role, and needs no redeem tests. The earlier "adapter target + approval chain" design (D-08 two-gate, PR #75 two-gate fix) is **superseded**. |
| gnus-ai nested pin for tests | this repo ← gnus-ai | This repo's `contracts/gnus-ai` pin is STALE (Oct-2024 `7c0b237`). Phase 1 must bump it to a gnus-ai-contracts commit ≥ `d731384` so the test diamond includes Phase 9/10/11 (convert, bridgeIn, current redeem). Ordering: bump nested pin, then proxy tests. |
| gnus-ai Phase 9 (conversion-native model) | design input | `GNUSTreasury.convert(childId, 0, amount, to)` is the underlying conversion path — no reserve apparatus exists. The caller-bound redeem performs the same 1:1 burn/mint pair directly. |
| gnus-ai Phase 13 (entitlements) | constraint source | Proxy stays dumb; no proxy changes needed for Phase 13; AI Credits must never be redeemable. |

---

*Created: 2026-08-19 — bootstrapped during gnus-ai Phase 11 discuss-phase restructure*
*Last updated: 2026-08-29 — Phase 01 (erc-20-proxy-hardening) complete: PROXY-01/PROXY-02 validated, milestone proxy-hardening executed*
