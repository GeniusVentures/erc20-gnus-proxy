# ERC-20 GNUS Proxy — Hardening Project

## What This Is

The `erc20-gnus-proxy` repo is a **standalone ERC-20 proxy diamond** (ProxyDiamond + ERC20ProxyFacet) that presents one ERC-1155 child token from the GNUS.ai GeniusDiamond as a standard ERC-20 token. It is a separate contract from the gnus-ai diamond — not a facet on it.

Current state (pre-hardening): the proxy's ERC-20 surface is broken for DeFi use:
- `approve(spender, amount)` maps to `setApprovalForAll(spender, amount > 0)` — all-or-nothing, not amount-specific. DEX flows break.
- `allowance(owner, spender)` returns `type(uint256).max` or `0` — not real ERC-20 allowance semantics.
- `transferFrom()` requires ERC-1155 operator approval instead of spending an allowance.
- `initializeERC20Proxy()` is owner-callable repeatedly — child token ID, ERC-1155 contract address, name, and symbol are all mutable after deployment (attack vector).

## Core Value

**A DEX-safe ERC-20 facade over GNUS.ai child tokens with real allowance semantics and immutable configuration.**

## Requirements

### Active

- [ ] **PROXY-01**: Real amount-specific ERC-20 allowances — `_allowances` mapping in proxy storage; `approve(spender, amount)` sets a real allowance (NOT `setApprovalForAll`); `allowance()` returns the real value.
- [ ] **PROXY-02**: Immutable proxy configuration — `initializeERC20Proxy` is one-shot; `childTokenId`, `erc1155Contract`, `name`, `symbol` cannot change after initialization.
- [ ] **PROXY-03**: Redeem adapter for proxied-child → GNUS — lives **in the gnus-ai repo** as a generic diamond-side adapter (see Cross-Repo Dependencies); this repo's side is only the call-out and its tests.

### Out of Scope

- Reserve/custody apparatus in the proxy — the proxy stays a dumb thin wrapper (no custody of tokens).
- Proxy operator exemptions — no reliance on `NFT_PROXY_OPERATOR_ROLE` auto-approval bypasses.
- Redemption rate math — conversion is 1:1 minion-denominated (gnus-ai Phase 9 D1/D2); `exchangeRate` is display-only.
- Proxy diamond upgrade governance — no live deployments documented; out of scope.

## Context

**Repo structure:** Own diamond (`ProxyDiamond`) with facets in `contracts/erc20-gnus-proxy/`. Nested submodules:
- `contracts/gnus-ai` — GeniusDiamond contracts used to deploy a test diamond (pin is STALE at Oct-2024 `7c0b237`; Phase 1 bumps it).
- `diamonds/GeniusDiamond` — diamond deployment tooling.

**Tests:** Hardhat/Mocha in `test/{unit,integration,deployment}`; `test-assets/deployments-test/GeniusDiamond` deployment fixtures. Tests deploy a GeniusDiamond from the nested submodule and attach the proxy to it.

**Cross-repo context:** The controlling design decisions for this project live in `gnus-ai/.planning/phases/11-erc-20-proxy-hardening/11-CONTEXT.md` (D-01..D-14), captured 2026-08-19. This repo's Phase 1 implements the proxy-side half (PROXY-01/02 + DEX tests).

## Constraints

- **Solidity 0.8.19** compiler target (matches gnus-ai).
- **Diamond storage append-only** — `ERC20ProxyStorage.Layout` may only gain new fields at the end (deployed-proxy storage compatibility).
- **Breaking change accepted** — integrations relying on `approve → setApprovalForAll` will break; that behavior was the vulnerability. No migration shim.
- **Branch conventions:** work happens on `gsd/phase-{N}-{slug}` branches; PRs target `develop`, NEVER `main`.
- **Multi-repo protocol:** commit inside this submodule first, then pin-bump the outer TokenContracts repo.

## Cross-Repo Dependencies

| Dependency | Direction | Detail |
|---|---|---|
| gnus-ai Phase 11 (redeem adapter) | this repo ← gnus-ai | The generic redeem adapter (PROXY-03) is implemented diamond-side in gnus-ai. This repo's redeem tests need a nested `contracts/gnus-ai` pin that includes it. Ordering: gnus-ai lands first, then nested bump, then proxy tests. |
| gnus-ai Phase 9 (conversion-native model) | design input | `GNUSTreasury.convert(childId, 0, amount, to)` is the ONLY redemption path — no reserve apparatus exists. |
| gnus-ai Phase 13 (entitlements) | constraint source | Proxy stays dumb; no proxy changes needed for Phase 13; AI Credits must never be redeemable. |

---

*Created: 2026-08-19 — bootstrapped during gnus-ai Phase 11 discuss-phase restructure*
