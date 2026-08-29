# Phase 1: ERC-20 Proxy Hardening - Research

**Researched:** 2026-08-28
**Domain:** Solidity diamond facets (ERC-20 proxy hardening) + nested-submodule dependency migration + Hardhat deployment-harness rework
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
Copied verbatim from `.planning/phases/01-erc-20-proxy-hardening/01-CONTEXT.md` `## Implementation Decisions`:

- **D-01:** `_allowances` mapping (`mapping(address => mapping(address => uint256))`) appended to `ERC20ProxyStorage.Layout` — append-only, AFTER the existing four fields. `approve(spender, amount)` writes the mapping and emits `Approval`; `allowance(owner, spender)` reads it; `transferFrom()` spends via `_spendAllowance()`. No `setApprovalForAll` anywhere on the ERC-20 surface. *(Carried from gnus-ai 11-CONTEXT D-10/D-11.)*
- **D-02:** **Match the reference implementation exactly** — mirror `GNUSBridge.sol` `_approve` (line 531) / `_spendAllowance` (line 547): `approve(type(uint256).max)` is infinite and NEVER decremented in `transferFrom`; direct overwrite allowed (zero-address checks only, no USDT-style "approve to 0 first" rule); `Approval` emitted on decrement. Rationale: byte-for-byte OpenZeppelin-standard router behavior, and identical semantics with the diamond-side facade means one allowance mental model across both ERC-20 surfaces. The SWC-114 approval race is accepted as the industry-standard trade-off (same as OZ, USDC).
- **D-03:** `initializeERC20Proxy` becomes one-shot via the already-imported `Initializable` `initializer` modifier; `childTokenId`, `erc1155Contract`, `name`, `symbol` are all write-once. *(Carried from gnus-ai 11-CONTEXT D-12.)*
- **D-04:** **Static guards + functional smoke test** at init — `require(_erc1155Address != address(0))`, `require(_childTokenId != 0)` (id 0 is GNUS itself; proxying it creates a second competing ERC-20 face), non-empty `name`/`symbol`, plus a warm-up call `l.erc1155Contract.totalSupply(_childTokenId)` BEFORE committing the writes (proves the target is a live contract speaking the exact ABI this facet depends on; unminted child ids still pass since ERC1155Supply returns 0). ERC-165 `supportsInterface` was REJECTED as the gate: no interface ID exists for the `ERC1155Supply` extension this facet actually calls, and diamond loupe aggregation can false-negative.
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

### Deferred Ideas (OUT OF SCOPE)
- ERC-165 `supportsInterface` gate — layer ON TOP of the static guards only if the proxy is ever pointed at third-party ERC-1155s beyond GeniusDiamond.
- Repo hygiene observed at bootstrap (`coverage/`, `coverage.json` committed at repo root; stale diamond-abi commit messages) — carried from 11-CONTEXT deferred; not in Phase 1 scope.
- Proxy diamond upgrade governance (who can diamondCut ProxyDiamond) — out of scope; no live proxy deployments documented.

None of these block Phase 1.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROXY-01 | Real amount-specific ERC-20 allowances — `_allowances` mapping in proxy storage; `approve(spender, amount)` sets a real allowance (NOT `setApprovalForAll`); `allowance()` returns the real value | Reference implementation captured verbatim from `GNUSBridge.sol:531-555` (Code Examples §1); storage append slot math verified (existing Layout occupies slots 0-2 of the keccak-derived base slot; mapping append is safe); `Initializable`/`ERC20Storage` package paths confirmed present in `@gnus.ai/contracts-upgradeable-diamond@4.5.0` |
| PROXY-02 | Immutable proxy configuration — `initializeERC20Proxy` one-shot; `childTokenId`, `erc1155Contract`, `name`, `symbol` write-once | `Initializable.initializer` modifier semantics verified in package source (revert string `"Initializable: contract is already initialized"`, diamond-storage-based, facet-safe); `ERC1155SupplyUpgradeable.totalSupply(uint256)` verified to be a pure mapping read returning 0 for unminted ids (D-04 smoke test is safe for valid-but-unminted child ids) |
| *(enabler, not a requirement ID)* | Bump nested `contracts/gnus-ai` pin ≥ `d731384`; bump `diamonds/GeniusDiamond` to match current gnus-ai | Exact targets identified and verified: `61b7ca4` (contracts) + `dfebdf0` (GeniusDiamond tooling) = gnus-ai develop gitlinks, CI-green 2026-08-28; full harness delta catalogued (compiler, config, library linking, callbacks, fixtures) |

**Note on PROXY-04:** ROADMAP/CONTEXT mention "PROXY-04" as the pin-bump enabler, but this repo's PROJECT.md defines only PROXY-01/02/03 (03 shipped in gnus-ai). Parent REQUIREMENTS.md owns PROXY-04. Treat the pin bump as in-scope enabler work with no local requirement ID.
</phase_requirements>

## Summary

The allowance/init design (D-01..D-05) is fully specified and needed no further research — the reference `_approve`/`_spendAllowance` code is captured below verbatim from `GNUSBridge.sol:531-555` at the target pin, and every claim D-04 relies on (`initializer` revert behavior, `totalSupply` returning 0 for unminted ids) was verified in the `@gnus.ai/contracts-upgradeable-diamond@4.5.0` package source. The real unknowns were the pin bump, and they are now resolved.

**Pin bump targets (verified):** Current gnus-ai `develop` (HEAD `ba23f8a`) pins `contracts/gnus-ai` at **`61b7ca4`** (2026-08-26, tip of gnus-ai-contracts develop; `d731384` confirmed an ancestor) and `diamonds/GeniusDiamond` at **`dfebdf0`**. gnus-ai develop CI is green on that exact pairing as of 2026-08-28 (`tests` + `security-audit` workflows succeeded via `gh run list`). This pairing is the recommended bump target — it is the newest thing that is *proven*, satisfying "floor `d731384`, leaning latest stable."

**The bump forces a larger harness delta than the ROADMAP hints, all now catalogued:** (1) pragma drift — all 31 contracts at `61b7ca4` require `^0.8.19` while this repo compiles a single `0.8.9`; the proxy's own `^0.8.2` pragmas compile fine under 0.8.19, so a single-version bump to `0.8.19` (which PROJECT.md already mandates) satisfies everything; (2) **GNUSLifecyclePolicy library linking is mandatory** — `GNUSNFTFactory`, `GNUSBridge`, and `ERC20TransferBatch` all inherit `GNUSERC1155MaxSupply`, which compile-time-links the library; gnus-ai's monkey-patch harness (`scripts/utils/GNUSLifecyclePolicyLinking.ts`) must be ported or no GeniusDiamond can deploy locally at the new pin, regardless of facet subset; (3) the deployment framework itself drifted — this repo floats `diamonds#develop`/`hardhat-diamonds#develop` GitHub deps (lockfile-pinned to 1.0.0-era commits, untracked lockfile) while gnus-ai now uses published `@geniusventures/diamonds@1.3.4-gv` + `@geniusventures/hardhat-diamonds@1.1.15-gv.2` — adopting the pinned npm pair is strongly recommended; (4) economics assertions in the existing integration test are wrong against the new pin (Phase 9 changed mint burn math from exchange-rate-based to 1:1 minion-denominated); (5) D-03/D-04 break the current unit-test fixture (the deploy callback initializes the proxy against *itself* with a dummy ID, and an existing test asserts re-initialization *works* — the exact vulnerability being fixed).

**Primary recommendation:** Pin `contracts/gnus-ai` → `61b7ca4`, `diamonds/GeniusDiamond` → `dfebdf0`; bump `hardhat.config.ts` solidity `0.8.9` → `0.8.19`; swap the floating GitHub framework deps for `@geniusventures/diamonds@1.3.4-gv` + `@geniusventures/hardhat-diamonds@1.1.15-gv.2`; port `GNUSLifecyclePolicyLinking.ts`; replace `diamonds/GeniusDiamond/geniusdiamond.config.json` with gnus-ai's 2.6 config and drop the local deploy callbacks; then implement D-01..D-04 with the tests in D-05.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| ERC-20 allowance state (`_allowances`) | ProxyDiamond facet (ERC20ProxyStorage.Layout) | — | D-01 locked: proxy-local storage; the diamond never learns about ERC-20 allowances |
| Allowance spending rules (`_spendAllowance`) | ERC20ProxyFacet (internal) | — | Mirror of GNUSBridge internals; pure facet logic, no external calls |
| Underlying token custody/movement | GeniusDiamond (ERC-1155 `safeTransferFrom`) | — | Proxy delegates via `l.erc1155Contract.safeTransferFrom`; operator = proxy address |
| Proxy→diamond transfer authorization | GeniusDiamond `ERC1155ProxyOperator` (NFT_PROXY_OPERATOR_ROLE or per-user operator approval) | — | Mechanical prerequisite: the diamond must see the proxy as an approved operator for the ERC-1155 leg to succeed; this is orthogonal to ERC-20 allowance and must NOT be read by the facet |
| One-shot init gate | ERC20ProxyFacet (`initializer` modifier, InitializableStorage) | — | D-03: facet-level, diamond-storage-based |
| Init smoke test (`totalSupply` warm-up) | ERC20ProxyFacet → GeniusDiamond ERC1155ProxyOperator facet | — | D-04: single external call proving liveness + ABI before committing writes |
| Child token creation for tests | Test harness (createNFT + 4-arg mint, 1:1 GNUS burn) | — | gnus-ai test pattern verified at new pin |
| Deployment orchestration | `diamonds` framework (LocalDiamondDeployer) + hardhat config + facet config JSON | — | Existing pattern; framework version bump recommended |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@gnus.ai/contracts-upgradeable-diamond` | **=4.5.0 (KEEP — do not bump)** | `Initializable`, `IERC20Upgradeable`, `ERC20Storage`, `ERC1155SupplyUpgradeable` | Already pinned `=4.5.0` in this repo; gnus-ai uses `4.5.0` with the exact new pin (proven pairing, CI green). npm latest is 4.9.1 but gnus-ai deliberately stays on 4.5.0 — diverging from gnus-ai here recreates the drift this phase is eliminating [VERIFIED: package.json of both repos + npm registry] |
| `@geniusventures/diamonds` | **1.3.4-gv** (replace floating `diamonds@github#develop`) | Diamond deployment framework (Diamond, DiamondDeployer, LocalDeploymentStrategy, FileDeploymentRepository) | Exact version gnus-ai develop pins; publishes from the same GitHub repo (`GeniusVentures/diamonds`) this repo already consumes at an older commit; required to deploy the 2.6 facet config [VERIFIED: npm registry + gnus-ai package.json] — [WARNING: slopcheck flagged as suspicious (12 days old, 614 downloads) — org-internal package; planner adds checkpoint:human-verify before install] |
| `@geniusventures/hardhat-diamonds` | **1.1.15-gv.2** (replace floating `hardhat-diamonds@github#develop`) | Hardhat plugin: diamond paths config, `diamond:generate-abi-typechain` task, ships `LocalDiamondDeployer`/`loadDiamondContract` in `dist/utils` | Exact version gnus-ai develop pins [VERIFIED: npm registry + gnus-ai package.json] — [WARNING: slopcheck flagged as suspicious (12 days old, 377 downloads) — org-internal package; planner adds checkpoint:human-verify before install] |
| `contracts-starter` | GitHub `mudgen/diamond-2-hardhat.git` (KEEP) | `Diamond.sol`, `DiamondCutFacet`, `DiamondLoupeFacet`, `LibDiamond` — imported by BOTH pins' scaffolds | Unchanged between pins; both old and new nested contracts import the same paths [VERIFIED: grep of both pins + package.json] |
| Solidity compiler | **0.8.19** (bump from 0.8.9) | Single compiler for proxy + nested contracts | All 31 nested contracts at `61b7ca4` are `pragma solidity ^0.8.19`; proxy contracts are `^0.8.2` and the @gnus.ai package is `^0.8.0` — both compile under 0.8.19; gnus-ai compiles the same tree at 0.8.19, optimizer 1000 runs [VERIFIED: pragma grep both pins + gnus-ai hardhat.config.ts] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| hardhat | ^2.26.2 (KEEP) | Build/test runner | gnus-ai pins 2.26.5 — same 2.x line, compatible with the new plugin [VERIFIED: both package.json] |
| ethers | ^6.4.0 (KEEP) | Contract interaction | Tests already use v6 API (`ethers.ZeroAddress`, `parseEther`) |
| yarn | 4.9.4 (packageManager, KEEP) | Install/lockfile | Matches gnus-ai; Node 24 compatible |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bump pins to `61b7ca4`/`dfebdf0` (gnus-ai develop gitlinks) | Pin exactly `d731384` (the floor) | `d731384` is the redeem commit (2026-08-20); it lacks Phase 15 fixes (epoch narrowing guard, attestor skeleton). Develop tip is CI-proven and is "what current gnus-ai uses" per the discretion grant. Use `d731384` only if the full 2.6 facet config proves unstable locally — it still satisfies the floor |
| Copy gnus-ai's full 2.6 facet config | Curate a minimal facet subset (Cut/Loupe/Ownership/NFTFactory/ProxyOperator/Control/Bridge/Treasury/Init) | Minimal subset deploys faster but diverges from what gnus-ai CI proves, and the lifecycle-library linking harness is required EITHER way (NFTFactory links it). Recommend full copy; it is the tested object |
| Port gnus-ai's `GNUSLifecyclePolicyLinking.ts` | Use framework-shipped deployer only, exclude linking facets | NOT VIABLE: GNUSNFTFactory (indispensable for child token creation) inherits the linking base. Port is mandatory |
| Keep floating GitHub framework deps | (status quo) | yarn.lock is UNTRACKED — installs float on #develop heads; the lockfile pins 1.0.0-era commits (c84b230 / 517c1c5) far behind 1.3.4-gv. Status quo = unproven pairing against the 2.6 config (`upgradeInit: ""` semantics, fromVersions handling). Pinned npm pair eliminates the class of unknowns |

**Installation:**
```bash
# in package.json devDependencies — replace:
#   "diamonds": "https://github.com/GeniusVentures/diamonds.git#develop",
#   "hardhat-diamonds": "https://github.com/GeniusVentures/hardhat-diamonds.git#develop",
# with:
#   "@geniusventures/diamonds": "1.3.4-gv",
#   "@geniusventures/hardhat-diamonds": "1.1.15-gv.2",
yarn install            # node_modules is currently EMPTY — install is a Wave 0 task
git add yarn.lock       # commit the lockfile (currently untracked — reproducibility gap)
```

**Version verification (run this session):** `@geniusventures/diamonds` → 1.3.4-gv (npm registry, modified 2026-08-28); `@geniusventures/hardhat-diamonds` → 1.1.15-gv.2 (npm registry, modified 2026-08-17); `@gnus.ai/contracts-upgradeable-diamond` → 4.9.1 latest / 4.5.0 pinned in both repos (registry modified 2023-06-11 — stable).

## Package Legitimacy Audit

> slopcheck 0.6.1 installed and run this session. No postinstall scripts on any audited package (`npm view <pkg> scripts.postinstall` → none).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@gnus.ai/contracts-upgradeable-diamond` | npm | ~3 yrs (4.5.0 era) | 189/wk | github.com/GeniusVentures/openzeppelin-contracts-diamond | [OK] | Approved — already installed at =4.5.0, no change |
| `@geniusventures/diamonds` | npm | 12 days (1.3.4-gv) | 614/wk | github.com/GeniusVentures/diamonds | [SUS] | Approved with warning — org-internal package; same GitHub source this repo already consumes via git URL; exact version pinned by gnus-ai develop (CI green). Planner MUST add `checkpoint:human-verify` before install |
| `@geniusventures/hardhat-diamonds` | npm | 12 days (1.1.15-gv.2) | 377/wk | github.com/GeniusVentures/hardhat-diamonds | [SUS] | Approved with warning — same rationale as above. Planner MUST add `checkpoint:human-verify` before install |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `@geniusventures/diamonds`, `@geniusventures/hardhat-diamonds` — both are the user's own org's packages (the [SUS] verdict is purely age/download heuristics; provenance is the strongest possible: same org, same source repo as existing deps, exact version validated by gnus-ai CI on 2026-08-28). Checkpoint before install regardless, per protocol.

## Architecture Patterns

### System Architecture Diagram

Post-hardening runtime flow (what the DEXFlow test exercises):

```
                 DEX ROUTER (regular signer in tests)
                        │
                        │ 1. approve(spender, amt)   ── ERC-20 surface, writes proxy-local
                        ▼                            _allowances[owner][spender] (D-01)
              ┌──────────────────┐
              │   ProxyDiamond   │  (facet: ERC20ProxyFacet)
              │                  │
              │ _allowances ─────┼─► allowance(owner,spender) view reads local mapping
              │                  │
              │ 2. transferFrom(from,to,amt)                        │
              │    ├─ _spendAllowance(from, msg.sender, amt)        │ D-02:
              │    │    max? skip decrement : require(≥) + _approve │ infinite-allowance,
              │    │                                              │ Approval on decrement
              │    └─ l.erc1155Contract.safeTransferFrom(...) ──────┼──┐
              └──────────────────┘                                   │ operator = PROXY addr
                        ▲                                            ▼
                        │Initialize (one-shot, D-03/D-04)  ┌────────────────────┐
                        │ guards: addr≠0, id≠0, name/symbol │   GeniusDiamond    │
                        │ smoke: totalSupply(childId) ─────►│ ERC1155ProxyOperator
                        └───────────────────────────────────│ isApprovedForAll():│
                                                           │  true if operator  │
                                                           │  holds role, else  │
                                                           │  _operatorApprovals│
                                                           │ totalSupply(id)    │
                                                           │ safeTransferFrom   │
                                                           │ (ERC-1155 leg)     │
                                                           └────────────────────┘
```

The hardening decouples the two approval planes: ERC-20 allowance (proxy-local, amount-specific) vs ERC-1155 operator approval (diamond-side, all-or-nothing). Criterion 5 = proving changes to the right plane never grant the left plane.

### Recommended Project Structure
```
contracts/
├── erc20-gnus-proxy/
│   ├── ERC20ProxyFacet.sol        # MODIFY: approve/allowance/transferFrom + one-shot init
│   ├── ERC20ProxyStorage.sol      # MODIFY: append _allowances mapping (D-01)
│   ├── ProxyDiamond.sol           # untouched
│   └── mocks/                     # NEW (optional): minimal ERC1155Supply mock for unit tests
├── gnus-ai/                       # SUBMODULE BUMP: 7c0b237 → 61b7ca4
diamonds/
├── ProxyDiamond/
│   ├── proxydiamond.config.json   # MODIFY: drop createXMPLToken callback (or rework it)
│   └── callbacks/ERC20ProxyFacet.ts  # rework/delete — self-pointing init breaks under D-04
└── GeniusDiamond/                 # SUBMODULE-ADJACENT CONFIG: pin ba68c67 → dfebdf0
    ├── geniusdiamond.config.json  # REPLACE with gnus-ai's 2.6 config
    └── callbacks/                 # drop (gnus-ai's 2.6 config uses no callbacks)
scripts/
└── utils/
    └── GNUSLifecyclePolicyLinking.ts  # NEW: port from gnus-ai (mandatory — see Pitfall 1)
test/
├── unit/ERC20ProxyFacet.test.ts   # EXTEND + FLIP one test (see Pitfall 6)
├── integration/DEXFlow.test.ts    # NEW (D-05)
└── deployment/                    # update configs the suites read; assertions mostly survive
```

### Pattern 1: Append-only diamond storage extension (D-01)
**What:** Add `mapping(address => mapping(address => uint256)) _allowances;` as the LAST field of `ERC20ProxyStorage.Layout`. Struct fields occupy sequential slots from the keccak-derived base slot; appending preserves existing field slots for any deployed proxy.
**When to use:** Always, for facet storage evolution on a diamond.
**Example:** See Code Examples §2.

### Pattern 2: Reference-mirroring internals (D-02)
**What:** Copy `_approve`/`_spendAllowance` bodies from `GNUSBridge.sol:531-555` into the facet as internal functions operating on `ERC20ProxyStorage.layout()._allowances`.
**When to use:** Locked by D-02 — no design freedom; semantics must match the diamond-side facade exactly.
**Example:** See Code Examples §1.

### Pattern 3: Library-linked facet deployment (from gnus-ai, mandatory after bump)
**What:** `GNUSERC1155MaxSupply` (base of NFTFactory/Bridge/TransferBatch) compile-time-links `GNUSLifecyclePolicy`. Hardhat requires the `libraries` option whenever an artifact declares `linkReferences`; the diamonds framework calls `getContractFactory(name, {signer})` with no libraries. gnus-ai solves this by deploying the library once per process and monkey-patching `ethers.getContractFactory` to inject `libraries: { 'contracts/gnus-ai/GNUSLifecyclePolicy.sol:GNUSLifecyclePolicy': address }` for artifacts that link it.
**When to use:** ANY local GeniusDiamond deployment at pin ≥ lifecycle introduction (Phase 13) — including a minimal facet subset.
**Example:** Port `../gnus-ai/scripts/utils/GNUSLifecyclePolicyLinking.ts` (deploy-and-patch + lazy installer; per-network cache). Source: [VERIFIED: gnus-ai repo at develop, read this session].

### Pattern 4: Fresh-deploy config keyed by protocolVersion
**What:** `geniusdiamond.config.json` declares `protocolVersion: 2.6`; the framework selects each facet's highest version key ≤ protocolVersion for a fresh deploy and runs its `deployInit`. gnus-ai's 2.6 config (read this session, see Code Examples §4) deploys cleanly on local hardhat — proven by gnus-ai CI.
**When to use:** Replacing this repo's 2.5 config wholesale.

### Anti-Patterns to Avoid
- **Reading operator approval in ERC-20 code paths:** the whole vulnerability. Post-hardening, nothing on the approve/allowance/transferFrom path may call `isApprovedForAll`.
- **USDT-style "approve to zero first":** explicitly rejected by D-02 — direct overwrite.
- **Splitting allowance storage between `ERC20ProxyStorage.Layout` and `ERC20Storage.layout()`:** pick ONE home (D-01 locks the Layout append). Note the facet's existing `ERC20Storage` import (line 6) is currently vestigial (1 grep hit = the import itself).
- **Committing `cache_hardhat/`, `openzeppelin-contracts-diamond/`, `openzeppelin-transpiler/`, `sushi-list/`, `package-lock.json`** — untracked local artifacts present in the working tree; keep them out of the phase commits (npm-protocol artifacts from the @gnus.ai package build).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Infinite-allowance + decrement semantics | Custom allowance math | Copy `GNUSBridge._approve`/`_spendAllowance` verbatim (D-02) | Edge cases (max-value skip, underflow-safe unchecked subtract, Approval-on-decrement) are exactly what router integrators expect; any deviation reintroduces the footgun |
| Re-initialization guard | Custom `initialized` bool in Layout | `Initializable.initializer` modifier (already imported) | Diamond-storage-based (`InitializableStorage.layout()`), facet-context-safe, standard revert string; a second storage field would waste a slot and duplicate a proven gate |
| Diamond deployment orchestration | Patching the old floating `diamonds#develop` framework | `@geniusventures/diamonds@1.3.4-gv` + port gnus-ai's linking harness | gnus-ai already solved the 2.6-config + library-linking problems this bump creates; their solution is CI-proven |
| Library linking for lifecycle facets | Pre-linking artifact bytecode manually | The `getContractFactory` monkey-patch from `GNUSLifecyclePolicyLinking.ts` | hardhat-ethers `collectLibrariesAndLink` ignores manually pre-linked bytecode (documented in gnus-ai's harness header) |
| DEX router in tests | Forking mainnet / deploying Uniswap | Regular signer doing approve+transferFrom (D-05) | A router IS approve+transferFrom; fork infra adds deps and flakiness for zero additional proof |

**Key insight:** Every hard problem in this phase was already solved once in gnus-ai (reference allowance internals, init guards tested at scale, library-linking harness, 2.6 deploy config). The phase is largely a *porting* exercise; original design work is confined to the D-04 guard set and the DEXFlow assertions.

## Runtime State Inventory

> Included because the pin bump is a dependency migration (submodule pins + stale deployment fixtures), not because of any string rename.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | No databases. On-chain proxy deployments: PROJECT.md states "no live deployments documented" [VERIFIED: PROJECT.md Out of Scope] | None — storage append is safe by design; confirm before ship that no undocumented proxy deployment exists |
| Live service config | `diamonds/*/deployments/*.json` (local 31337 stubs: 127-byte `geniusdiamond-hardhat-31337.json`, `proxydiamond-hardhat-31337.json`) + `test-assets/deployments-test/**` (old-pin facet addresses for RPC flows, dated Jun 6) | Local tests deploy fresh with `writeDeployedDiamondData: false` — stubs need no migration. RPC-script fixtures are stale after the bump; regenerate only if RPC deploy scripts are exercised (out of D-05 scope) |
| OS-registered state | None — verified by scope (no cron/launchd/service registrations in this repo) | None |
| Secrets/env vars | `.env` consumed by hardhat config (RPC URLs/keys) — not needed for local hardhat tests; gnus-ai recently REMOVED its `.env` placeholder for hermetic tests (commit `44b2c75`) | Ensure local tests run without `.env` (D-05 pattern uses `networkProviders.set("hardhat", ...)`) |
| Build artifacts | `node_modules/` EMPTY (0 entries); `cache_hardhat/` inside nested submodule (untracked); root `openzeppelin-contracts-diamond/`, `openzeppelin-transpiler/`, `sushi-list/`, `package-lock.json`, `yarn.lock` all untracked | `yarn install` is a Wave 0 task; commit `yarn.lock` (repo has NO committed lockfile — installs float); do NOT commit the other untracked artifacts |

**The canonical question — after every file is updated, what still carries old state?** The submodule gitlinks in THIS repo's index (bumped via `git add contracts/gnus-ai`), then the OUTER TokenContracts repo's gitlink to this submodule (per multi-repo protocol: commit here first, then pin-bump outer). Plus `artifacts/`, `cache/`, `diamond-abi/`, `typechain-types/`, `diamond-typechain-types/` — cleared by `yarn clean` (package.json script) before recompile.

## Common Pitfalls

### Pitfall 1: GeniusDiamond deployment fails with unresolved library link after bump
**What goes wrong:** `getContractFactory('GNUSNFTFactory')` (and Bridge/TransferBatch) throws because artifacts declare `linkReferences` to `GNUSLifecyclePolicy`.
**Why it happens:** `GNUSERC1155MaxSupply` (their shared base since gnus-ai Phase 13) calls the library; hardhat-ethers requires the `libraries` option; the diamonds framework never passes it.
**How to avoid:** Port `GNUSLifecyclePolicyLinking.ts` and run `setupLifecyclePolicyLinking()` (or the lazy `installLazyLifecyclePolicyLinker(hre)` from hardhat.config, as gnus-ai does) BEFORE `LocalDiamondDeployer.getInstance()`. Mandatory even for a minimal facet subset.
**Warning signs:** "trying to deploy a library link reference without libraries" / `UNLINKED_LIBRARY` in facet bytecode.

### Pitfall 2: Compile fails after bump — pragma mismatch
**What goes wrong:** Hardhat reports the nested contracts' `^0.8.19` pragma matches no configured compiler.
**Why it happens:** This repo compiles a single `0.8.9` (hardhat.config.ts line ~168) — a fact PROJECT.md's "Solidity 0.8.19" constraint obscures; the actual config was never aligned.
**How to avoid:** Change `solidity.version` to `"0.8.19"` (single version — proxy `^0.8.2` and package `^0.8.0` both compile under it; mirrors gnus-ai's exact settings: 0.8.19, optimizer enabled, 1000 runs).
**Warning signs:** Any `HH*)` compile error mentioning version pragma.

### Pitfall 3: D-04 smoke test breaks the unit fixture
**What goes wrong:** `createXMPLToken` callback (diamonds/ProxyDiamond/callbacks/ERC20ProxyFacet.ts:20-25) calls `initializeERC20Proxy(diamondAddress /* the ProxyDiamond itself */, chainID, "ExampleToken", "XMPL")`. The D-04 warm-up call executes `totalSupply(uint256)` on the ProxyDiamond — no such selector exists on the ERC-20 facet → callback reverts → deployment fails.
**Why it happens:** The old init had zero validation, so self-pointing dummy config "worked".
**How to avoid:** Either (a) drop the callback from `proxydiamond.config.json` and initialize explicitly in test setup against a real/mock ERC-1155 target, or (b) point the callback at a mock ERC1155 deployed in the callback. Option (a) is cleaner; note `childTokenId = chainID` also violates the `!= 0` guard when chainId is 31337? No — 31337 ≠ 0 passes; the failure is purely the warm-up call. Also `erc1155Contract` zero-address guard would pass (diamondAddress ≠ 0).
**Warning signs:** Unit `before()` hook timeout/revert during ProxyDiamond deploy.

### Pitfall 4: Existing unit test asserts the vulnerability
**What goes wrong:** `test/unit/ERC20ProxyFacet.test.ts:258-277` "Should allow owner to reinitialize (update configuration)" expects re-init to SUCCEED — under D-03 it must revert with "Initializable: contract is already initialized".
**How to avoid:** Flip that test in the same commit as the D-03 modifier. Also the "Uninitialized" revert tests (lines 213-243) rely on revert-on-uninit calls to `erc1155Contract` — with a mock target they still revert via the mock path; keep their intent (revert before init) not their exact mechanism.
**Warning signs:** Any test named "reinitialize" surviving code review.

### Pitfall 5: Stale economics assertions in GNUSAiIntegration.test.ts
**What goes wrong:** Old test asserts exchange-rate burn math (`burntSupply === toWei(5.0 * 2.0)`, line ~404). Phase 9 changed child mint to 1:1 minion-denominated GNUS burn — gnus-ai's current tests mint with plain numbers (`mintAmount = 10`, not `parseEther`) and expect 1:1 burns.
**How to avoid:** When reworking the integration suite for the new pin, update burn-math expectations to 1:1 and use minion-denominated amounts for child mints; `createNFT`'s exchRate param is stored display-only.
**Warning signs:** Burn assertions off by exactly the exchange-rate factor.

### Pitfall 6: Missing NFT_PROXY_OPERATOR_ROLE grant in DEXFlow fixture
**What goes wrong:** `proxy.transferFrom` passes the local allowance check, then `safeTransferFrom` on the diamond reverts "caller is not owner nor approved" — because the DIAMOND sees operator = the ProxyDiamond address, and nobody approved it.
**Why it happens:** The ERC-20 fix removes the diamond-side check from the facet, but the underlying ERC-1155 transfer still needs operator rights for the PROXY itself.
**How to avoid:** In the DEXFlow fixture, grant `NFT_PROXY_OPERATOR_ROLE` (public constant on ERC1155ProxyOperator, readable via the diamond) to the ProxyDiamond address from the diamond owner, OR have users `setApprovalForAll(proxy, true)` on the diamond. The role grant matches production intent ("gas-free listings") and makes `isApprovedForAll(user, proxy)` true for ALL users — which is precisely the state under which criterion 5 (operator approval must NOT grant ERC-20 allowance) is strongest.
**Warning signs:** Integration transferFrom reverting inside the diamond, not the facet.

### Pitfall 7: Untracked lockfile / empty node_modules
**What goes wrong:** Fresh clone or CI install resolves `#develop` heads to different commits than the developer's machine; nothing is reproducible. Current working tree: `yarn.lock` present but untracked, `node_modules/` empty.
**How to avoid:** Commit the regenerated `yarn.lock` in this phase; replace GitHub-protocol deps with the pinned npm pair (also removes SSH-to-GitHub requirements from installs).
**Warning signs:** `yarn install` pulling different `diamonds` commits across machines.

### Pitfall 8: `upgradeInit: ""` and multi-version keys in the old framework
**What goes wrong:** If the floating old framework (lockfile-pinned to 1.0.0-era commit c84b230) is kept and fed gnus-ai's 2.6 config, empty-string `upgradeInit`, `GNUSTreasury_Initialize260`, and attestor/licensing entries exercise framework code paths the old version never ran.
**How to avoid:** Adopt framework 1.3.4-gv / 1.1.15-gv.2 (the pairing that CI-proves this config).
**Warning signs:** Config parsing errors, facets silently skipped, init not invoked.

## Code Examples

### 1. D-02 reference internals — mirror these exactly
```solidity
// Source: ../gnus-ai/contracts/gnus-ai/GNUSBridge.sol lines 531-555 at pin 61b7ca4
// [VERIFIED: read this session — copy-adapt into ERC20ProxyFacet, substituting
//  ERC20ProxyStorage.layout()._allowances for ERC20Storage.layout()._allowances]
function _approve(address owner, address spender, uint256 amount) internal virtual {
    require(owner != address(0), "ERC20: approve from the zero address");
    require(spender != address(0), "ERC20: approve to the zero address");

    ERC20Storage.layout()._allowances[owner][spender] = amount;
    emit Approval(owner, spender, amount);
}

function _spendAllowance(address owner, address spender, uint256 amount) internal virtual {
    uint256 currentAllowance = allowance(owner, spender);
    if (currentAllowance != type(uint256).max) {
        require(currentAllowance >= amount, "ERC20: insufficient allowance");
        unchecked {
            _approve(owner, spender, currentAllowance - amount);
        }
    }
}
// External surface to mirror (GNUSBridge:385-412):
//   allowance(owner,spender) view → reads the mapping
//   approve(spender,amount)      → _approve(_msgSender(), spender, amount); return true
// transferFrom (GNUSBridge:506-516): _spendAllowance(from, msg.sender, amount) THEN the
// ERC-1155 transfer, then emit Transfer(from, to, amount).
```

### 2. D-01 storage append
```solidity
// contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol — append ONLY at the end
struct Layout {
    ERC1155SupplyUpgradeable erc1155Contract;  // slot 0 (existing)
    uint256 childTokenId;                      // slot 1 (existing)
    string name;                               // slot 2+ (existing)
    string symbol;                             //        (existing)
    mapping(address => mapping(address => uint256)) _allowances;  // NEW — D-01, appended last
}
```

### 3. D-03/D-04 init sketch (shape only — planner finalizes revert strings)
```solidity
// Shape derived from locked D-03/D-04 + verified Initializable semantics
// (revert string: "Initializable: contract is already initialized", diamond-storage-based)
function initializeERC20Proxy(
    address _erc1155Address,
    uint256 _childTokenId,
    string memory _name,
    string memory _symbol
) external initializer onlyOwnerRole {
    // D-04 static guards
    // require(_erc1155Address != address(0));      // exact string = planner discretion
    // require(_childTokenId != 0);                 // id 0 is GNUS itself
    // require(bytes(_name).length > 0); require(bytes(_symbol).length > 0);
    ERC20ProxyStorage.Layout storage l = ERC20ProxyStorage.layout();
    // D-04 warm-up BEFORE committing writes — proves live contract + ABI.
    // Verified: totalSupply(uint256) is a pure mapping read returning 0 for
    // unminted ids (ERC1155SupplyUpgradeable.sol:32-34 in @gnus.ai/...@4.5.0),
    // so valid-but-unminted child ids pass the gate.
    // l.erc1155Contract = ERC1155SupplyUpgradeable(_erc1155Address);
    // l.erc1155Contract.totalSupply(_childTokenId);
    // ...then commit childTokenId/name/symbol writes
}
```

### 4. gnus-ai's 2.6 facet config (the replacement source)
```
Source: ../gnus-ai/diamonds/GeniusDiamond/geniusdiamond.config.json (read this session)
protocolVersion: 2.6; facets (priority): DiamondCutFacet(10), DiamondLoupeFacet(20),
GeniusOwnershipFacet(30), GNUSNFTFactory(40 — deployInit GNUSNFTFactory_Initialize230()
at 2.6), ERC1155ProxyOperator(45 — deployInclude: isApprovedForAll/totalSupply/creators),
GNUSWithdrawLimiter(120→listed at 0.0), ERC20TransferBatch(90), GNUSNFTCollectionName(80),
GNUSContractAssets(100), GNUSControl(110), GNUSBridge(115), GNUSBridgeAttestor(116),
GNUSTreasury(117 — deployInit GNUSTreasury_Initialize260()), GNUSRedeemAdapter(118),
GNUSLifecycle(119), GNUSLifecycleMint(121), GNUSLicensing(122), GNUSLicensingPurchase(123),
DiamondInitFacet(130 — deployInit diamondInitialize250()).
All *_Initialize* functions verified present at 61b7ca4 (grep hit lines: DiamondInitFacet:43,
GNUSNFTFactory:24/41, GNUSControl:56, GNUSTreasury:157). NOTE: GeniusAI facet NO LONGER EXISTS
at the new pin (GeniusAI.sol/GeniusAIStorage.sol removed) — this repo's current 2.5 config
references it and MUST be replaced, not patched.
```

### 5. DEXFlow fixture skeleton (integration)
```typescript
// Modeled on test/integration/GNUSAiIntegration.test.ts (verified pattern) +
// gnus-ai ERC1155ProxyOperator.test.ts child-creation pattern (verified at new pin):
// 1. Deploy GeniusDiamond via LocalDiamondDeployer (lifecycle linking installed first!)
// 2. Deploy ProxyDiamond; grant NFT_PROXY_OPERATOR_ROLE to proxy address (diamond owner)
// 3. createNFT(0, "DEX Test", "DEXT", 2, 100, "")  → childTokenId (mintable immediately,
//    no time-travel needed — verified: gnus-ai tests create+mint with no evm time ops)
// 4. mint(address,uint256) GNUS to creator (MINTER_ROLE; deployer has it via
//    DiamondInitFacet init), then 4-arg mint(address,uint256,uint256,bytes) child tokens
//    to holder — burns creator GNUS 1:1 (minion-denominated: plain numbers OK)
// 5. initializeERC20Proxy(geniusDiamondAddress, childTokenId, name, symbol)
// 6. D-05 assertions: approve→transferFrom→decreasing allowance; zero-allowance revert;
//    setApprovalForAll on the DIAMOND does not change proxy.allowance();
//    NFT_PROXY_OPERATOR_ROLE holder (the proxy itself) still needs ERC-20 allowance;
//    approve(max) → transferFrom leaves allowance at max (no decrement)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| This repo: allowance via diamond `isApprovedForAll` (all-or-nothing) | Proxy-local `_allowances` mapping | This phase (locked D-01/D-02) | DEX-safe; matches diamond facade semantics |
| gnus-ai-contracts at `7c0b237` (Oct 2024 — actually dated 2025-05-17 in git, "NatSpec" commit) | `61b7ca4` (2026-08-26, develop tip) | gnus-ai Phases 9-15 | +15 contract files (treasury/lifecycle/licensing/attestor/redeem/withdraw-limiter), −GeniusAI; all `^0.8.19` |
| Child-token mint: exchange-rate burn math | 1:1 minion-denominated conversion (Phase 9 D1) | gnus-ai Phase 9 | Old integration test burn assertions are wrong at new pin |
| ERC-20 facade on diamond: inherited OZ-style | GNUSBridge `_approve`/`_spendAllowance` (the D-02 reference) | gnus-ai Phase 11 | The reference this phase mirrors |
| Deployment framework: floating GitHub `#develop` deps | Published `@geniusventures/*` npm packages (1.3.4-gv / 1.1.15-gv.2) | gnus-ai commit `44b2c75` era ("hermetic rpc tests + diamonds 1.3.4-gv") | This repo should follow (recommended) |
| GeniusDiamond protocolVersion 2.5 config | 2.6 config (attestor/treasury/redeem/lifecycle/licensing keyed at 2.6) | gnus-ai Phase 15 | Config replacement required; NOTE project memory: never bump past 2.6 (2.6 itself undeployed on-chain — fine for local test deploys) |

**Deprecated/outdated:**
- `GeniusAI`/`GeniusAIStorage` contracts — REMOVED at new pin; any config or import referencing them fails.
- `@gnus.ai/diamonds` package name — appears in this repo's `diamonds/GeniusDiamond/callbacks/*.ts` imports but is NOT in package.json (dead code in fully-commented-out callbacks; delete the callbacks when replacing the config).
- ethers v5 API remnants in callbacks (`hre.ethers.utils.id`) — this repo is ethers v6.

## Assumptions Log

> Claims tagged `[ASSUMED]` in this research. None are design-loadbearing; all are execution-time verifications.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A single 0.8.19 compiler config compiles this repo's entire tree (proxy `^0.8.2`, package `^0.8.0`, contracts-starter) without other pragma surprises — not executed this session (node_modules empty) | Standard Stack / Pitfall 2 | Low: gnus-ai compiles the same package + starter at 0.8.19. A stray low-pragma file here would need a multi-compiler override |
| A2 | `yarn install` succeeds on this machine for the swapped deps (public npm scope, HTTPS GitHub dep for contracts-starter) | Package Legitimacy Audit / Pitfall 7 | Low: all packages verified on public npm registry; only network/credentials could block |
| A3 | The 2.6 config's fresh-local-deploy behavior in THIS repo matches gnus-ai's (same framework + same nested pin) — the one untested variable is this repo's local `LocalDiamondDeployer` copy if it is kept instead of the framework-shipped one | Pattern 4 / Pitfall 8 | Medium: this repo's copy has a different `getInstance(config)` signature than the framework's `getInstance(hre, config)`; planner must either adapt the copy (verify config keys pass through) or migrate tests to the framework's deployer (as gnus-ai's tests do) |
| A4 | RPC-deploy fixtures (`test-assets/deployments-test/**`) do not gate the D-05 suites — local tests deploy fresh with `writeDeployedDiamondData: false` | Runtime State Inventory | Low: verified in test source; only the RPC script flows would need regenerated fixtures |

## Open Questions

1. **Keep the local `LocalDiamondDeployer` copy or migrate to the framework-shipped one?**
   - What we know: gnus-ai's tests import `LocalDiamondDeployer`/`loadDiamondContract` from `@geniusventures/hardhat-diamonds/dist/utils` with `getInstance(hre, {diamondName, network})`. This repo has a local copy (multichain-provider aware, `getInstance(config)`) used by all three test dirs.
   - What's unclear: whether the local copy passes the 2.6 config keys through unmodified under the old call signature (A3).
   - Recommendation: try the local copy first (smallest diff); if the framework version is needed, migrate in the same harness task. Do not ship both.
2. **Unit-test ERC-1155 target: minimal mock vs real GeniusDiamond?**
   - What we know: D-04 requires a live, ABI-correct target at init; the deploy callback's self-pointing init no longer works (Pitfall 3). gnus-ai's `contracts/mocks/` pattern exists but lives in the gnus-ai repo (not the submodule) — copying is a new file here.
   - Recommendation: a ~40-line mock ERC1155 in `contracts/erc20-gnus-proxy/mocks/` keeps unit tests fast and diamond-independent (matches the unit/integration split in D-05); the real pair is exercised in DEXFlow.
3. **Does the phase regenerate RPC deployment fixtures?**
   - Recommendation: no (out of D-05 scope; fixtures are stale-but-unused by local suites). Note it in the plan as explicit non-work.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | hardhat 2.26, yarn 4 | ✓ | v24.13.0 | — |
| yarn | installs | ✓ | 4.9.4 (matches packageManager) | — |
| node_modules | ALL build/test work | ✗ EMPTY (0 entries) | — | `yarn install` — Wave 0 task |
| git access to github.com:GeniusVentures/gnus-ai-contracts.git (SSH) | submodule fetch of 61b7ca4 | ✓ (submodule already cloned at old pin; fetch needed) | — | HTTPS remote if SSH blocked |
| git access to GeniusVentures/diamonds.git | diamonds/GeniusDiamond pin dfebdf0 | ✓ (already cloned) | — | — |
| npm registry (@geniusventures scope) | framework swap | ✓ (verified: 1.3.4-gv, 1.1.15-gv.2 published) | — | keep GitHub deps (not recommended) |
| gh CLI (authed) | CI-status verification only (research-time) | ✓ | used this session | — |
| slither/semgrep/snyk | `security-check` script | not probed | — | Not required for this phase's scope (GSD code review is the project's pre-PR gate) |

**Missing dependencies with no fallback:** none blocking — `yarn install` + submodule fetch cover everything.
**Missing dependencies with fallback:** none.

## Validation Architecture

> `.planning/config.json` absent in this repo → `workflow.nyquist_validation` treated as ENABLED. Test-surface enumeration below per D-05.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Hardhat 2.26.x + Mocha/Chai (`@nomicfoundation/hardhat-toolbox`), chai-as-promised, snapshot isolation via `evm_snapshot`/`evm_revert` |
| Config file | `hardhat.config.ts` (no .mocharc; per-suite `this.timeout(0)`) |
| Quick run command | `npx hardhat test test/unit/ERC20ProxyFacet.test.ts` |
| Full suite command | `npx hardhat test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROXY-01 | `approve` writes real mapping; `allowance` reads it back | unit | `npx hardhat test test/unit/ERC20ProxyFacet.test.ts` | ✅ extend |
| PROXY-01 | Finite-allowance decrement math; over-spend revert; zero-allowance rejection | unit | same file — NEW describe block | ❌ Wave 1 (D-05) |
| PROXY-01 | `approve(max)` infinite — no decrement on spend | unit + integration | unit block + `npx hardhat test test/integration/DEXFlow.test.ts` | ❌ Wave 1 (D-05) |
| PROXY-01 | No `setApprovalForAll` on ERC-20 surface (ABI-level) | unit | same file — extend ABI-coverage test (assert function absent) | ✅ extend |
| PROXY-01/02 | Criterion 5: allowance independent of operator approval (live pair, NFT_PROXY_OPERATOR_ROLE override in play) | integration | `npx hardhat test test/integration/DEXFlow.test.ts` | ❌ Wave 1 (D-05) — the pin bump's proof |
| PROXY-02 | Re-init reverts (`Initializable: contract is already initialized`) | unit | same file — FLIP existing re-init test | ✅ rewrite (Pitfall 4) |
| PROXY-02 | Init guards: zero address / id 0 / empty name/symbol revert; smoke-test rejects non-contract/wrong-ABI target | unit | same file — NEW guard block | ❌ Wave 1 (D-04) |
| enabler | GeniusDiamond deploys from bumped pin (roles, loupe, config-vs-deployed compare) | deployment | `npx hardhat test test/deployment/GeniusDiamondDeployment.test.ts test/deployment/ProxyDiamondPostDeploymentComparison.test.ts` | ✅ rework configs |
| enabler | Old-pin economics assertions updated (1:1 burn) | integration | `npx hardhat test test/integration/GNUSAiIntegration.test.ts` | ✅ rework (Pitfall 5) |

### Sampling Rate
- **Per task commit:** `npx hardhat test test/unit/ERC20ProxyFacet.test.ts` (fast, snapshot-isolated)
- **Per wave merge:** `npx hardhat test` (full: unit + integration + deployment)
- **Phase gate:** full suite green + `yarn compile` clean (diamond ABI regeneration included) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `yarn install` + commit `yarn.lock` (node_modules empty; no committed lockfile)
- [ ] Solidity 0.8.9 → 0.8.19 in `hardhat.config.ts` (Pitfall 2)
- [ ] Submodule pins bumped + `yarn clean && yarn compile` proving the tree compiles before any facet edits
- [ ] `scripts/utils/GNUSLifecyclePolicyLinking.ts` port (Pitfall 1) — needed by every GeniusDiamond-deploying suite
- [ ] `diamonds/GeniusDiamond/geniusdiamond.config.json` → 2.6 replacement; callbacks dropped
- [ ] `diamonds/ProxyDiamond/proxydiamond.config.json` callback removal/rework (Pitfall 3)

## Security Domain

> `security_enforcement` not present in config → enabled. Scoped to this phase's actual attack surface (an ERC-20 facet + init).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A — no user auth; owner check via `LibDiamond` ownership only |
| V3 Session Management | no | N/A |
| V4 Access Control | yes | `onlyOwnerRole` (existing `LibDiamond.diamondStorage().contractOwner == msg.sender`) gates init; one-shot `initializer` removes repeat-call attack (PROXY-02) |
| V5 Input Validation | yes | D-04 static guards (`require` on address/id/strings) + allowance-spend `require` (mirror of reference) — Solidity native reverts, no schema layer |
| V6 Cryptography | no | No primitives used; keccak256 storage-position idiom only (standard diamond pattern) |

### Known Threat Patterns for {Solidity ERC-20 facet on diamond}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Approval race (SWC-114) | Tampering/Elevation | ACCEPTED per D-02 (industry standard: OZ/USDC behavior) — documented trade-off, do not "fix" with USDT-style zero-first rule |
| Re-initialization / config hijack | Elevation | PROXY-02: `initializer` modifier + owner check (currently the open vulnerability this phase closes) |
| Malicious/wrong ERC-1155 target at init | Tampering | D-04: zero-address guard + `totalSupply` warm-up call proving live ABI before committing writes |
| Infinite-allowance surprise spend | Tampering | OZ-standard semantics mirrored exactly (max = never decremented) — integrator expectation, tested in D-05 |
| Allowance bypass via operator approval (the old vulnerability) | Elevation | Removed structurally: no `isApprovedForAll` reads on the ERC-20 path; criterion 5 proves independence |
| Storage slot collision on upgrade | Tampering | Append-only Layout (D-01); slot derived from keccak256("erc20.proxy.storage") — unchanged |

## Sources

### Primary (HIGH confidence)
- Local repository inspection (this session): `contracts/erc20-gnus-proxy/*.sol`, `diamonds/*/` configs + callbacks, `scripts/setup/LocalDiamondDeployer.ts`, all four test files, `package.json`, `hardhat.config.ts`, `.gitmodules`, `git submodule status`
- Sibling gnus-ai repo at develop (`ba23f8a`): `git submodule status` (gitlinks `61b7ca4` / `dfebdf0` verified clean-checked-out), `contracts/gnus-ai/**` at `61b7ca4` (GNUSBridge.sol:531-555, ERC1155ProxyOperator.sol, pragma/import greps, facet/init function greps), `diamonds/GeniusDiamond/geniusdiamond.config.json` (2.6), `scripts/utils/GNUSLifecyclePolicyLinking.ts`, `test/unit/ERC1155ProxyOperator.test.ts` + `ERC20TransferBatch.test.ts` (current child-creation/mint patterns), `hardhat.config.ts` (0.8.19), `package.json` (@geniusventures pins)
- Git object verification: `merge-base --is-ancestor d731384 61b7ca4` → true; commit dates (`7c0b237` = 2025-05-17 "NatSpec"; `d731384` = 2026-08-20; `61b7ca4` = 2026-08-26)
- Package source: `@gnus.ai/contracts-upgradeable-diamond@4.5.0` in gnus-ai node_modules (Initializable.sol revert strings; ERC1155SupplyUpgradeable.sol:32-34 totalSupply mapping read; pragma `^0.8.0`)
- npm registry (this session): `npm view` for `@geniusventures/diamonds` (1.3.4-gv), `@geniusventures/hardhat-diamonds` (1.1.15-gv.2), `@gnus.ai/contracts-upgradeable-diamond` (4.9.1 latest)
- GitHub Actions via `gh run list -R GeniusVentures/gnus-ai -b develop`: tests + security-audit **success** on the exact recommended pairing, 2026-08-28
- slopcheck 0.6.1 executed on the three packages (1 OK, 2 SUS — see audit table)

### Secondary (MEDIUM confidence)
- None — all findings trace to primary sources above

### Tertiary (LOW confidence)
- None used

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version claim verified against both repos' package.json and the npm registry this session
- Architecture: HIGH — reference implementation, storage layout, and framework behavior read from source at the exact target pins
- Pitfalls: HIGH — each pitfall traced to a specific file/line or verified mechanism (library linking documented in gnus-ai's harness header; CI-green pairing covers the residual risk)
- Pin bump targets: HIGH — gitlinks verified via `git submodule status` (clean, no drift markers), ancestry floor verified, CI green on 2026-08-28

**Research date:** 2026-08-28
**Valid until:** 2026-09-27 (stable domain; gnus-ai develop moves fast — re-verify gitlinks if the bump slips >2 weeks)
