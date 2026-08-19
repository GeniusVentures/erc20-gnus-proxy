# Roadmap: ERC-20 GNUS Proxy Hardening

**Created:** 2026-08-19
**Granularity:** Single phase
**Core Value:** A DEX-safe ERC-20 facade over GNUS.ai child tokens with real allowance semantics and immutable configuration.

## Phase Summary

| #   | Phase           | Goal                                                              | Requirements         | Success Criteria |
| --- | --------------- | ----------------------------------------------------------------- | -------------------- | ---------------- |
| 1   | Proxy Hardening | Real ERC-20 allowances, immutable config, DEX-flow tests          | PROXY-01, PROXY-02   | 5                |

## Phase Details

### Phase 1: ERC-20 Proxy Hardening

**Goal:** Fix ERC-20 proxy approval/allowance semantics and make child token ID (and all init config) immutable.

**Context:** This phase is the proxy-side half of gnus-ai Phase 11. The controlling decisions (D-01..D-14) are in `gnus-ai/.planning/phases/11-erc-20-proxy-hardening/11-CONTEXT.md`. The redeem adapter (PROXY-03) is implemented in gnus-ai, not here — this phase only covers the proxy contract itself plus the nested-submodule bump needed for its tests.

**Success Criteria:**

1. Real `_allowances` mapping in `ERC20ProxyStorage.Layout` — amount-specific ERC-20 approvals (replaces `setApprovalForAll()` backing).
2. `approve(spender, amount)` sets a real allowance, not an ERC-1155 operator approval; `allowance()` returns the real value.
3. `transferFrom()` uses real allowance with `_spendAllowance()` — no `isApprovedForAll` requirement on the ERC-20 surface.
4. Child token ID (and `erc1155Contract`, `name`, `symbol`) immutable after one-shot initialization.
5. DEX-style approve → transferFrom flow tested: allowance decreases correctly, zero-allowance rejection, allowance independent of operator approval.

**Also in scope (enabler):**
- Bump nested `contracts/gnus-ai` submodule pin from stale `7c0b237` (Oct 2024) to a gnus-ai commit including Phase 9/10/11 code — required so tests deploy a diamond with `GNUSTreasury.convert` and the redeem adapter.
- Bump nested `diamonds/GeniusDiamond` pin to match what current gnus-ai uses.

**Requirements:** PROXY-01, PROXY-02
**Priority:** P0 (security-critical)
**Reviewer:** @Super-Genius
**Assignee:** @Am0rfu5

**GitHub:** [erc20-gnus-proxy#9](https://github.com/GeniusVentures/erc20-gnus-proxy/issues/9)
**Cross-repo:** gnus-ai Phase 11 (redeem adapter, PROXY-03) — [erc20-gnus-proxy#10](https://github.com/GeniusVentures/erc20-gnus-proxy/issues/10) is diamond-side work tracked in `gnus-ai/.planning/`
**Concerns addressed:** gnus-ai CONCERNS #5 (all-or-nothing approval), #23 (proxy tests)

---

*Created: 2026-08-19 — bootstrapped during gnus-ai Phase 11 discuss-phase restructure*
