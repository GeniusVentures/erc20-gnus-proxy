---
phase: 1
slug: erc-20-proxy-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-28
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `01-RESEARCH.md` § Validation Architecture. Task IDs bind when PLAN.md files are finalized.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Hardhat 2.26.x + Mocha/Chai (`@nomicfoundation/hardhat-toolbox`), chai-as-promised, snapshot isolation via `evm_snapshot`/`evm_revert` |
| **Config file** | `hardhat.config.ts` (no .mocharc; per-suite `this.timeout(0)`) |
| **Quick run command** | `npx hardhat test test/unit/ERC20ProxyFacet.test.ts` |
| **Full suite command** | `npx hardhat test` |
| **Estimated runtime** | quick ~30s est. / full ~2 min est. (not yet measured — node_modules empty until Wave 0) |

---

## Sampling Rate

- **After every task commit:** Run `npx hardhat test test/unit/ERC20ProxyFacet.test.ts`
- **After every plan wave:** Run `npx hardhat test`
- **Before `/gsd:verify-work`:** Full suite green + `yarn compile` clean (diamond ABI regeneration included)
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| *(bind at planning)* | 01 | 0 | enabler | — | Reproducible install: `yarn.lock` committed; tree compiles at 0.8.19 on bumped pins | build | `yarn install && yarn clean && yarn compile` | ❌ W0 | ⬜ pending |
| *(bind at planning)* | 01 | 0 | enabler | T-1-05 | Library-linked facets deploy locally (no `UNLINKED_LIBRARY`) | deployment | `npx hardhat test test/deployment/GeniusDiamondDeployment.test.ts` | ✅ rework | ⬜ pending |
| *(bind at planning)* | 01 | 1 | PROXY-01 | — | `approve` writes real mapping; `allowance` reads it back; no `setApprovalForAll` on ERC-20 surface | unit | `npx hardhat test test/unit/ERC20ProxyFacet.test.ts` | ✅ extend | ⬜ pending |
| *(bind at planning)* | 01 | 1 | PROXY-01 | T-1-04 | Finite-allowance decrement math; over-spend revert; zero-allowance rejection; `approve(max)` infinite (no decrement) | unit | `npx hardhat test test/unit/ERC20ProxyFacet.test.ts` | ❌ new block | ⬜ pending |
| *(bind at planning)* | 01 | 1 | PROXY-02 | T-1-02 | Re-init reverts `Initializable: contract is already initialized` | unit | same file — FLIP existing re-init test | ✅ rewrite | ⬜ pending |
| *(bind at planning)* | 01 | 1 | PROXY-02 | T-1-03 | Init guards: zero address / id 0 / empty name/symbol revert; smoke test rejects dead/wrong-ABI target | unit | same file — NEW guard block | ❌ new block | ⬜ pending |
| *(bind at planning)* | 01 | 1+ | PROXY-01 | T-1-05 | Criterion 5: allowance independent of operator approval (live pair, `ERC1155ProxyOperator` override in play) | integration | `npx hardhat test test/integration/DEXFlow.test.ts` | ❌ new file | ⬜ pending |
| *(bind at planning)* | 01 | 0/1 | enabler | — | Old integration economics assertions match 1:1 minion-denominated burns at new pin | integration | `npx hardhat test test/integration/GNUSAiIntegration.test.ts` | ✅ rework | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `yarn install` + commit `yarn.lock` (node_modules empty; no committed lockfile — installs currently float)
- [ ] `hardhat.config.ts` Solidity `0.8.9` → `0.8.19` (pragma floor of all 31 nested contracts at `61b7ca4`)
- [ ] Submodule pins bumped (`contracts/gnus-ai` → `61b7ca4`, `diamonds/GeniusDiamond` → `dfebdf0`) + `yarn clean && yarn compile` green BEFORE any facet edit
- [ ] `scripts/utils/GNUSLifecyclePolicyLinking.ts` ported from gnus-ai (mandatory — `GNUSERC1155MaxSupply` links the library)
- [ ] `diamonds/GeniusDiamond/geniusdiamond.config.json` replaced with gnus-ai's 2.6 config; callbacks dropped
- [ ] `diamonds/ProxyDiamond/proxydiamond.config.json` self-pointing init callback removed/reworked (breaks under D-04 warm-up)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Package-legitimacy sign-off on `@geniusventures/diamonds@1.3.4-gv` + `@geniusventures/hardhat-diamonds@1.1.15-gv.2` install | enabler | slopcheck [SUS] on both (age/downloads heuristics only); provenance is org-internal + CI-proven, but protocol requires human checkpoint before install | Review `01-RESEARCH.md` § Package Legitimacy Audit; confirm scope `@geniusventures` + versions against gnus-ai `package.json`; approve install |

*All phase behaviors otherwise have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
