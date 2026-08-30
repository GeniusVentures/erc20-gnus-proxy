---
phase: 1
slug: erc-20-proxy-hardening
status: verified
threats_open: 0
asvs_level: 1
created: 2026-08-29
---

# Phase 1 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (all six PLANs carried `<threat_model>` blocks); classifications closed against 01-VERIFICATION.md (passed 6/6), the 87/0 test suite, and 01-REVIEW-FIX.md (14/14 findings fixed).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| npm registry → node_modules | Third-party-origin packages enter the build; two are org-internal but young/low-download ([SUS] at planning) | Build tooling + diamond deployment code |
| git remotes → submodule working trees | Nested contract source changes wholesale at pinned commits (61b7ca4 / dfebdf0) | Tested/shaped contract source |
| hardhat config → compiler | Compiler version (0.8.19) determines pragma-gated contract semantics | Compiled bytecode semantics |
| test harness → nested gnus-ai contracts | Suite deploys and exercises third-party (nested submodule) contract code locally | Local test deployments |
| monkey-patched getContractFactory → ethers | Factory interceptor redirects library linking — build-integrity-critical hook | Linked facet bytecode |
| ERC-20 caller → facet | Anyone can call approve/allowance/transferFrom; only the diamond owner can call init | Public ERC-20 surface + one-shot init |
| facet → GeniusDiamond (ERC-1155) | Facet calls configured erc1155Contract (safeTransferFrom at transfer, totalSupply at init) | Child-token custody leg |
| router signer → ProxyDiamond ERC-20 surface | Untrusted-integrator stand-in exercising the public allowance API | Allowance spend authority |
| stale assertions → new-pin contract behavior | Test expectations are the specification; wrong economics assertions mask real regressions | Specification truth |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-1-01 | Tampering/Elevation (SWC-114 approval race) | approve | accept | D-02 locked: industry-standard trade-off identical to OZ/USDC (direct overwrite, no zero-first rule) — see Accepted Risks Log | closed |
| T-1-02 | Elevation (re-init config hijack) | initializeERC20Proxy | mitigate | `initializer` modifier (D-03) + `onlyOwnerRole`; flipped unit test pins `Initializable: contract is already initialized` (ERC20ProxyFacet.test.ts) | closed |
| T-1-03 | Tampering (wrong/malicious ERC-1155 target at init) | initializeERC20Proxy | mitigate | D-04 static guards (zero address / id 0 / empty name/symbol) + `totalSupply(childTokenId)` warm-up before writes; unit tests pin all guard strings + EOA/wrong-ABI rejection + unminted-id tolerance | closed |
| T-1-04 | Elevation (allowance bypass via operator approval — the OLD vulnerability) | approve/allowance/transferFrom | mitigate | Structurally removed: no `isApprovedForAll`/`setApprovalForAll` in facet or aggregated ABI (grep gates + ABI negative assertion); mock operator plane reverts on touch; DEXFlow criterion-5 proves independence live (incl. `NFT_PROXY_OPERATOR_ROLE` override in play) | closed |
| T-1-05 | Tampering/Elevation (supply chain) | @geniusventures package installs | mitigate | Blocking checkpoint:human-verify executed 2026-08-29 (user approved after Package Legitimacy Audit); exact version pins (no ranges); provenance cross-checked against gnus-ai CI-green pairing; no postinstall scripts | closed |
| T-1-06 | Tampering (storage collision on upgrade) | ERC20ProxyStorage.Layout | mitigate | Append-only `_allowances` after existing four fields; keccak slot constant untouched (VERIFICATION.md evidence 1) | closed |
| T-1-07 | Tampering (reproducibility) | Floating GitHub deps + lockfile | mitigate | Pinned npm versions committed; yarn.lock committed; `yarn clean && yarn compile` proof green | closed |
| T-1-08 | Tampering | Submodule pin drift | mitigate | Exact gitlinks 61b7ca4 / dfebdf0 staged in this repo (submodule status verified in VERIFICATION.md evidence 6); outer TokenContracts pin-bump recorded as follow-through | closed |
| T-1-09 | Denial of Service | Dead config references (GeniusAI deleted at new pin) | mitigate | Wholesale 2.6 config replacement + callback deletion; grep gates + compile/ABI-regeneration runs green | closed |
| T-1-10 | Tampering (config/deploy drift) | Deployment suites | mitigate | Config-vs-deployed loupe comparison assertions kept in both deployment suites (17/17 GeniusDiamond, 7/3 ProxyDiamond suites green) | closed |
| T-1-11 | Tampering | Config-load order | mitigate | Grep gate: no top-level `hardhat` import in GNUSLifecyclePolicyLinking.ts (lazy extendEnvironment installer); compile proof loads config through it | closed |
| T-1-12 | Tampering (infinite-allowance surprise) | _spendAllowance | mitigate | `type(uint256).max` never decrements — mirrored byte-for-byte from GNUSBridge.sol:531-560 (review-verified character-identical); pinned by unit no-decrement test across two spends + DEXFlow live-pair max-allowance test | closed |
| T-1-13 | Elevation (misconfigured role grant masking a facet bug) | DEXFlow fixture role grant | mitigate | `NFT_PROXY_OPERATOR_ROLE` granted to the PROXY only (client-side keccak constant), never the router; revert-origin assertions pin where reverts occur; criterion-5 passes in the exact pre-hardening exploit configuration | closed |
| T-1-14 | Repudiation/Tampering (specification drift) | GNUSAiIntegration burn assertions | mitigate | 1:1 minion-denominated rule re-derived from gnus-ai's current tests; run-first-then-edit captured real revert strings; suite 15/15 green | closed |
| T-1-15 | Denial of Service (gate integrity) | Phase gate | mitigate | Single-pass `yarn clean && yarn compile && npx hardhat test` green (87/0 after review fixes); forbidden-artifact index check keeps repo reproducible | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-1-01 | SWC-114 approval race accepted: D-02 mandates byte-identical OpenZeppelin-standard semantics (approve(max) infinite, direct overwrite) for router compatibility — same trade-off as OZ/USDC/USDT-era tokens reversed; decided in discuss-phase 2026-08-28, locked in CONTEXT D-02 | User (discuss-phase selection) | 2026-08-28 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-29 | 15 | 15 | 0 | execute-phase orchestrator (plan-time register; classifications closed against VERIFICATION/REVIEW-FIX evidence; workflow short-circuit — no retroactive auditor scan required) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter
