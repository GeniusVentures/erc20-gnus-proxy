---
phase: 1
slug: erc-20-proxy-hardening
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-28
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `01-RESEARCH.md` § Validation Architecture. Task IDs bound to plans `01-01` … `01-06` (`*-PLAN.md`) on 2026-08-29 (`{plan}-{task}` naming; plan 01 = toolchain pins, 02 = lifecycle harness, 03 = facet hardening, 04 = unit suite, 05 = DEXFlow, 06 = rework + gate).

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

- After every task commit: Run `npx hardhat test test/unit/ERC20ProxyFacet.test.ts`
- After every plan wave: Run `npx hardhat test`
- Before `/gsd:verify-work`: Full suite green + `yarn compile` clean (diamond ABI regeneration included)
- Max feedback latency: ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T3 | 01 | 0 | enabler | T-1-07/08/09 | Reproducible install: `yarn.lock` committed; tree compiles at 0.8.19 on bumped pins + 2.6 config, both ABI generations green | build | `yarn install && yarn clean && yarn compile` | n/a | ⬜ pending |
| 02-T1 | 02 | 1 | enabler | T-1-05/11 | Linking harness ported (five exports, exact LIBRARY_FQN, no top-level hardhat import) and wired via `extendEnvironment` | build | `yarn compile` (loads config → lazy linker registers) | ❌ W0 gap | ⬜ pending |
| 02-T2 | 02 | 1 | enabler | T-1-05/10 | Library-linked facets deploy locally (no `UNLINKED_LIBRARY`) from the 2.6 config; A3 deployer decision recorded | deployment | `npx hardhat test test/deployment/GeniusDiamondDeployment.test.ts` | ✅ rework | ⬜ pending |
| 03-T3 | 03 | 1 | PROXY-01/02 | T-1-01..04/06/12 | Hardened facet compiles: `_allowances` in Layout (append-only), mirrored `_approve`/`_spendAllowance`, `initializer` one-shot, all four D-04 guards + warm-up; zero operator-plane calls | build | `npx hardhat compile` + facet grep gates | ✅ modify | ⬜ pending |
| 04-T2 | 04 | 2 | PROXY-02 | T-1-02/03 | Re-init reverts `Initializable: contract is already initialized`; init guards: zero address / id 0 / empty name/symbol revert; smoke test rejects EOA and wrong-ABI (self-pointing) target, tolerates unminted id | unit | `npx hardhat test test/unit/ERC20ProxyFacet.test.ts` | ✅ rewrite + ❌ new block | ⬜ pending |
| 04-T3 | 04 | 2 | PROXY-01 | T-1-04/12 | `approve` writes real mapping; `allowance` reads it back; no `setApprovalForAll` on ERC-20 surface (ABI-level + mock tripwire); finite-allowance decrement math; over-spend revert; zero-allowance rejection; `approve(max)` infinite (no decrement) | unit | `npx hardhat test test/unit/ERC20ProxyFacet.test.ts` | ✅ extend + ❌ new block | ⬜ pending |
| 05-T2 | 05 | 2 | PROXY-01 | T-1-04/12/13 | Criterion 5: allowance independent of operator approval (live pair, `ERC1155ProxyOperator` override in play, proxy holding `NFT_PROXY_OPERATOR_ROLE`); full DEX router flow on live pair | integration | `npx hardhat test test/integration/DEXFlow.test.ts` | ❌ new file | ⬜ pending |
| 06-T1 | 06 | 3 | enabler | T-1-14 | Old integration economics assertions match 1:1 minion-denominated burns at new pin (single-mint + mintBatch) | integration | `npx hardhat test test/integration/GNUSAiIntegration.test.ts` | ✅ rework | ⬜ pending |
| 06-T2 | 06 | 3 | enabler | T-1-10 | ProxyDiamond deployment suites aligned to callback-free config + hardened facet (zero `createXMPLToken` references) | deployment | `npx hardhat test test/deployment/ProxyDiamondDeployment.test.ts test/deployment/ProxyDiamondPostDeploymentComparison.test.ts` | ✅ rework | ⬜ pending |
| 06-T3 | 06 | 3 | PROXY-01/02 | T-1-15 | Phase gate: full suite green + clean compile + both diamond ABI regenerations, single pass | full | `yarn clean && yarn compile && npx hardhat test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Tasks 01-T1/01-T2 (renames + install checkpoint), 03-T1/03-T2 (storage append + allowance surface), 04-T1 (mock), and 05-T1 (fixture) are preparatory tasks whose proof is subsumed by the bound rows above (01-T3, 03-T3, 04-T2, 04-T3, 05-T2).*

---

## Wave 0 Requirements

- [ ] `yarn install` + commit `yarn.lock` (node_modules empty; no committed lockfile — installs currently float) — *→ 01-T3*
- [ ] `hardhat.config.ts` Solidity `0.8.9` → `0.8.19` (pragma floor of all 31 nested contracts at `61b7ca4`) — *→ 01-T1, proven at 01-T3*
- [ ] Submodule pins bumped (`contracts/gnus-ai` → `61b7ca4`, `diamonds/GeniusDiamond` → `dfebdf0`) + `yarn clean && yarn compile` green BEFORE any facet edit — *→ 01-T3*
- [ ] `scripts/utils/GNUSLifecyclePolicyLinking.ts` ported from gnus-ai (mandatory — `GNUSERC1155MaxSupply` links the library) — *→ 02-T1*
- [ ] `diamonds/GeniusDiamond/geniusdiamond.config.json` replaced with gnus-ai's 2.6 config; callbacks dropped — *→ 01-T3 (config + callbacks), validated at 02-T2*
- [ ] `diamonds/ProxyDiamond/proxydiamond.config.json` self-pointing init callback removed/reworked (breaks under D-04 warm-up) — *→ 01-T3*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Bound To |
|----------|-------------|------------|-------------------|----------|
| Package-legitimacy sign-off on `@geniusventures/diamonds@1.3.4-gv` + `@geniusventures/hardhat-diamonds@1.1.15-gv.2` install | enabler | slopcheck [SUS] on both (age/downloads heuristics only); provenance is org-internal + CI-proven, but protocol requires human checkpoint before install | Review `01-RESEARCH.md` § Package Legitimacy Audit; confirm scope `@geniusventures` + versions against gnus-ai `package.json`; approve install | 01-T2 (blocking checkpoint before `yarn install`) |

*All phase behaviors otherwise have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies *(the sole exception is 01-T2 — a blocking human gate by design, bound in Manual-Only Verifications)*
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references *(install, compiler, pins, linking harness, both configs — items 1-6 above; the remaining ❌ rows are Wave 1/2 test-surface work whose dependencies all land in Waves 0-1)*
- [x] No watch-mode flags
- [x] Feedback latency < 30s *(quick-run estimate; re-confirm at 01-T3 once node_modules exists)*
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (plans bound; execute via `/gsd:execute-phase`)
