# Phase 1: ERC-20 Proxy Hardening — Pattern Map

**Mapped:** 2026-08-29
**Scope:** erc20-gnus-proxy repo — proxy facet hardening (PROXY-01/02) + nested-pin harness migration (enabler).
**Files analyzed:** 12 (2 Solidity modifies, 1 new mock, 1 new TS script, 4 config modifies/replaces, 4 test files extend/new/rework)
**Analogs found:** 12 / 12 (3 are cross-repo ports from `../gnus-ai`, verified readable at the target pins)

> Repo-relative paths below are rooted at `erc20-gnus-proxy/`. Paths prefixed `../gnus-ai/` are the sibling repo (develop, nested contracts checked out at the target pin `61b7ca4`) — read-only port sources.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol` (MODIFY) | facet (Solidity contract) | state CRUD (mapping writes) + request-response (init) | `../gnus-ai/contracts/gnus-ai/GNUSBridge.sol:385-410, 506-516, 531-555` (D-02 mirror source) + the file itself (NatSpec/ordering conventions) | exact |
| `contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol` (MODIFY) | storage library | state (append-only Layout) | itself (existing Layout + `layout()` idiom); mapping shape mirrors `ERC20Storage.layout()._allowances` in the @gnus.ai package | exact |
| `contracts/erc20-gnus-proxy/mocks/` (NEW, likely) | test contract (mock) | CRUD (in-memory balances/supply) | `../gnus-ai/contracts/mocks/MockERC20.sol` (mock style analog — no ERC1155 mock exists in either repo) | role-match |
| `scripts/utils/GNUSLifecyclePolicyLinking.ts` (NEW) | harness utility (factory interceptor) | event-driven (monkey-patch on `getContractFactory`) | `../gnus-ai/scripts/utils/GNUSLifecyclePolicyLinking.ts` — direct port | exact |
| `hardhat.config.ts` (MODIFY) | config | n/a | `../gnus-ai/hardhat.config.ts:11-29` (lazy linker wiring), `:153-160` (0.8.19 block) | exact |
| `package.json` + committed `yarn.lock` (MODIFY + NEW) | config | n/a | `../gnus-ai/package.json:110-115` (npm pins) | exact |
| `diamonds/GeniusDiamond/geniusdiamond.config.json` (REPLACE) | config | static facet registration | `../gnus-ai/diamonds/GeniusDiamond/geniusdiamond.config.json` — wholesale copy (2.6) | exact |
| `diamonds/ProxyDiamond/proxydiamond.config.json` (MODIFY) | config | static facet registration | itself — delete the `callbacks` block (lines 20-22) | exact |
| `test/unit/ERC20ProxyFacet.test.ts` (EXTEND + FLIP) | unit test | state CRUD assertions | itself (scaffold survives) + `../gnus-ai/test/unit/ERC1155ProxyOperator.test.ts:29-74` (fixture/rework model) | exact |
| `test/integration/DEXFlow.test.ts` (NEW) | integration test | request-response (router approve→transferFrom flow) | `test/integration/GNUSAiIntegration.test.ts` (scaffold) + `../gnus-ai/test/unit/ERC1155ProxyOperator.test.ts:29-58, 312-352` (roles + child creation) | exact (composite) |
| `test/integration/GNUSAiIntegration.test.ts` (REWORK) | integration test | state assertions (burn math) | `../gnus-ai/test/unit/ERC1155ProxyOperator.test.ts:312-352` (1:1 minion-denominated burn pattern) | exact |
| `test/deployment/*` (REWORK) | deployment test | config-driven assertions | itself — scaffold unchanged, only config-consumed content shifts | exact |

Submodule pin bumps (`contracts/gnus-ai` → `61b7ca4`, `diamonds/GeniusDiamond` → `dfebdf0`) are git operations — no code analog.

---

## Pattern Assignments

### `contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol` (facet, MODIFY)

**Primary analog:** `../gnus-ai/contracts/gnus-ai/GNUSBridge.sol` (D-02 mirror — locked, no design freedom) for the allowance internals; **the file itself** for NatSpec/revert-string/ordering conventions.

**Conventions to preserve** (from the existing facet — do not restyle while editing):
- File header: `// SPDX-License-Identifier: MIT` + `pragma solidity ^0.8.2;` (compiles under the new 0.8.19 config; do not bump the pragma unless compile forces it).
- Contract-level `@title` / `@dev` NatSpec block (lines 11-14); per-function `@notice` + `@param` + `@return` blocks.
- Function ordering: init → views (`name`, `symbol`, `decimals`, `totalSupply`, `balanceOf`) → `transfer` → `allowance` → `approve` → `transferFrom` → modifier at bottom. Place `_approve`/`_spendAllowance` internals after `transferFrom`, before the modifier (mirrors GNUSBridge's external→internal ordering at :506-555).
- Revert-string style: facet-local guards use a contract-prefixed string (existing: `"ERC20Proxy: transfer caller is not approved"` line 126, `"Only Contract Owner allowed"` line 136). The mirrored OZ internals keep their exact OZ strings (below) — D-02 requires semantics identical to the reference, and identical strings aid debugger parity.

**D-02 core pattern — copy verbatim, substitute the storage home** (GNUSBridge.sol:531-555, read at pin `61b7ca4`):
```solidity
function _approve(address owner, address spender, uint256 amount) internal virtual {
    require(owner != address(0), "ERC20: approve from the zero address");
    require(spender != address(0), "ERC20: approve to the zero address");

    ERC20Storage.layout()._allowances[owner][spender] = amount;   // proxy: ERC20ProxyStorage.layout()._allowances
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
```

**External surface to mirror** (GNUSBridge.sol:385-410, 506-516):
```solidity
function allowance(address owner, address spender) public view virtual override returns (uint256) {
    return ERC20Storage.layout()._allowances[owner][spender];    // proxy: read own Layout
}
function approve(address spender, uint256 amount) public virtual override returns (bool) {
    address owner = _msgSender();                                 // proxy: msg.sender (no _msgSender here)
    _approve(owner, spender, amount);
    return true;
}
function transferFrom(address from, address to, uint256 amount) external virtual override returns (bool) {
    address spender = _msgSender();                               // proxy: msg.sender
    _spendAllowance(from, spender, amount);
    _safeTransferFrom(from, to, GNUS_TOKEN_ID, amount, "");       // proxy: l.erc1155Contract.safeTransferFrom(from, to, l.childTokenId, amount, "")
    emit Transfer(from, to, amount);
    return true;
}
```
**Delta:** the proxy has no `_msgSender()` and no `_safeTransferFrom` internal — substitute `msg.sender` and the existing `l.erc1155Contract.safeTransferFrom(...)` call (facet lines 88-93, 124-130 show the existing call shape). GNUSBridge also exposes `increaseAllowance`/`decreaseAllowance` (:424-456) — NOT required by D-01/D-02; add only if the planner wants surface parity (breaking-change note applies either way).

**D-03 one-shot init — the enabler already in the codebase** (`contracts/erc20-gnus-proxy/ProxyDiamond.sol:24-33`):
```solidity
constructor(address _contractOwner, address _diamondCutFacet) initializer payable
    Diamond(_contractOwner, _diamondCutFacet) {
    __ERC165Storage_init();
    ...
    InitializableStorage.layout()._initialized = false;   // line 32 — re-arms the gate for the FACET's init
}
```
This reset is what makes `initializer` on `initializeERC20Proxy` usable: the facet's modifier reads the same diamond-storage slot, currently `_initialized == false`. Verified revert string in `@gnus.ai/contracts-upgradeable-diamond@4.5.0`: `"Initializable: contract is already initialized"`.

**Delta / cleanup in the init function** (facet lines 25-37):
- Modifier-order quirk: `) onlyOwnerRole external {` (line 30) — modifier before visibility. Adding `initializer` gives `) initializer onlyOwnerRole external {`; keep the existing order style rather than reordering unrelated syntax.
- The body currently ALSO calls `LibDiamond.enforceIsContractOwner()` (line 31) — redundant with the modifier. Minimal-change philosophy: leave as-is or drop the duplicate check in the same edit; do not restyle.
- D-04 guards + warm-up insert BEFORE the struct writes (sketch in `01-RESEARCH.md` §3): `require(_erc1155Address != address(0))`, `require(_childTokenId != 0)`, non-empty name/symbol, then assign `l.erc1155Contract = ERC1155SupplyUpgradeable(_erc1155Address); l.erc1155Contract.totalSupply(_childTokenId);` before committing `childTokenId`/`name`/`symbol`.
- **Vestigial import:** `ERC20Storage` (line 6) has exactly one grep hit — the import itself. D-01 puts `_allowances` in `ERC20ProxyStorage.Layout`, so this import stays dead; remove it in the same commit (or it becomes the "split storage home" anti-pattern RESEARCH warns about).

---

### `contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol` (storage library, MODIFY)

**Primary analog:** the file itself (idiom preserved); mapping shape from the package's `ERC20Storage`.

**Existing pattern** (lines 10-37):
```solidity
library ERC20ProxyStorage {
    /// @dev Storage position of the ERC20 proxy data.
    bytes32 constant ERC20_PROXY_STORAGE_POSITION = keccak256("erc20.proxy.storage");

    struct Layout {
        ERC1155SupplyUpgradeable erc1155Contract;
        uint256 childTokenId;
        string name;
        string symbol;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 position = ERC20_PROXY_STORAGE_POSITION;
        assembly { l.slot := position }
    }
}
```

**D-01 append — copy the struct with one new field, LAST** (nothing else in the file changes):
```solidity
struct Layout {
    ERC1155SupplyUpgradeable erc1155Contract;  // existing
    uint256 childTokenId;                      // existing
    string name;                               // existing
    string symbol;                             // existing
    mapping(address => mapping(address => uint256)) _allowances;  // NEW — D-01, appended last
}
```
**Delta:** update the struct's NatSpec `@param` list (lines 14-20) to add `_allowances`. Keep the `keccak256("erc20.proxy.storage")` slot constant untouched — storage-slot compatibility (append-only rule).

---

### `contracts/erc20-gnus-proxy/mocks/` (NEW mock, likely)

**Primary analog (style):** `../gnus-ai/contracts/mocks/MockERC20.sol` (66 lines) — the org's mock convention. **No ERC1155 mock exists in either repo** (verified: grep for `ERC1155` across `../gnus-ai/contracts/mocks/` hits only `MockRedeemCaller.sol`, unrelated).

**Mock conventions from MockERC20.sol** (lines 1-28):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

/**
 * @title MockERC20
 * @dev Simple mock ERC20 token for testing purposes
 */
contract MockERC20 {
    ...plain state, events, constructor args, no inheritance from OZ...
```
- Standalone contract, NO parent contracts — a mock is a hand-rolled minimal ABI surface, not an OZ subclass.
- `Mock` prefix, `@title`/`@dev` NatSpec header, constructor takes config (name/symbol/decimals).
- Plain `require(..., "...")` reverts, events declared inline.

**What the new mock needs (the ERC1155Supply subset this facet actually calls — see facet lines 69, 79, 90, 102, 112, 127):**
- `totalSupply(uint256) returns (uint256)` — the D-04 warm-up target; must be a pure mapping read returning 0 for unminted ids.
- `balanceOf(address, uint256) returns (uint256)`.
- `safeTransferFrom(address, address, uint256, uint256, bytes)` — with balance bookkeeping so unit `transfer`/`transferFrom` tests can assert amounts moved.
- Optional sharpening (planner discretion): implement `setApprovalForAll`/`isApprovedForAll` that REVERT — any call reaching them proves the facet still touches the operator plane (criterion "no `setApprovalForAll` on the ERC-20 surface" becomes executable, not just ABI-inspectable).
- **Delta vs analog:** token-id dimension everywhere (mapping `(uint256 => address => uint256)` balances + `(uint256 => uint256)` supply), and no `approve`/`allowance`/ERC-20 surface at all.

---

### `scripts/utils/GNUSLifecyclePolicyLinking.ts` (NEW — direct port)

**Primary analog:** `../gnus-ai/scripts/utils/GNUSLifecyclePolicyLinking.ts` (249 lines, read in full — port essentially verbatim).

**What to copy unchanged (the load-bearing parts):**
- The module header comment block (lines 1-57) explaining WHY the monkey-patch exists — hardhat-ethers `collectLibrariesAndLink` ignores pre-linked bytecode; the framework calls `getContractFactory(name, {signer})` with no `libraries` option.
- **CONFIG-LOAD SAFETY (lines 42-45):** the module must NOT `import ... from 'hardhat'` at top level (LIB_IMPORTED_FROM_THE_CONFIG). Runtime HRE access only via `runtimeHre()` lazy `require` or an explicit `hre` parameter.
- Per-network library-address cache (`linkedLibraryAddressByChainKey`, lines 59-66, WR-05) — a single address breaks multichain processes.
- All five exports: `deployAndLinkLifecyclePolicy`, `deployAndLinkLifecyclePolicyWithSigner`, `installLifecyclePolicyLinker`, `installLazyLifecyclePolicyLinker`, `setupLifecyclePolicyLinking` (lines 104-248). Both installers share one module-level state block.

**Deltas when porting:**
- **Code style:** gnus-ai uses single quotes + tabs; this repo uses double quotes + 2-space (see `.prettierrc.json`, every file in `scripts/utils/`). Port the logic, reformat to this repo's style (lint-staged runs prettier on commit anyway).
- Keep the `LIBRARY_FQN = 'contracts/gnus-ai/GNUSLifecyclePolicy.sol:GNUSLifecyclePolicy'` string EXACT — it must match the artifact path of the nested submodule's library at the new pin (identical path at `61b7ca4`, verified).
- gnus-ai's header references its own phase numbers (13-04/13-05/13-06) — trim or reword the provenance comments; do not import those phase references into this repo.

---

### `hardhat.config.ts` (config, MODIFY)

**Primary analog:** `../gnus-ai/hardhat.config.ts` for the two changed blocks.

**Change 1 — Solidity version** (this repo lines 98-106 → gnus-ai :153-160):
```typescript
solidity: {
  version: "0.8.19",           // was "0.8.9"
  settings: {
    optimizer: { enabled: true, runs: 1000 },
  },
},
```
Optimizer settings already match gnus-ai — only the version string changes.

**Change 2 — lazy linker wiring** (gnus-ai :11, :14, :28-30):
```typescript
import { extendEnvironment, HardhatUserConfig, task } from "hardhat/config";
import { installLazyLifecyclePolicyLinker } from "./scripts/utils/GNUSLifecyclePolicyLinking";

extendEnvironment((hre) => {
  installLazyLifecyclePolicyLinker(hre);
});
```
**Delta:** this repo's config already imports from `"hardhat/config"` (line 10) and uses double quotes — merge the import rather than adding a duplicate. Place `extendEnvironment` near the top after imports, before the task/config definitions, matching gnus-ai's placement.

Everything else in this repo's config (chainManager, networks, etherscan, `diamonds.paths` with `contractsPath: "contracts/gnus-ai"`) stays — the nested contracts path is unchanged by the pin bump.

---

### `package.json` + `yarn.lock` (config, MODIFY + NEW)

**Primary analog:** `../gnus-ai/package.json` dependency block.

**Swap (this repo lines 108, 121):**
```jsonc
// remove:
"diamonds": "https://github.com/GeniusVentures/diamonds.git#develop",
"hardhat-diamonds": "https://github.com/GeniusVentures/hardhat-diamonds.git#develop",
// add:
"@geniusventures/diamonds": "1.3.4-gv",
"@geniusventures/hardhat-diamonds": "1.1.15-gv.2",
```
(gnus-ai package.json:110, :113 — exact pins, no `^`.)

**Import-path fallout to flag for the planner:** `import { Diamond } from "diamonds"` (unit test line 5, integration test line 5, callback line 3) and `import "hardhat-diamonds"` (hardhat.config.ts line 7) become `@geniusventures/diamonds` / `@geniusventures/hardhat-diamonds`. Mechanical rename across the import sites.

**Adjacent observation (research mandated only the two swaps — planner attention):** gnus-ai also pins `"@geniusventures/hardhat-multichain": "1.1.0-gv"` (:114) where this repo floats `"hardhat-multichain": "https://github.com/GeniusVentures/hardhat-multichain#main"` (line 123). The local `LocalDiamondDeployer` and all three test dirs import `multichain` from `hardhat-multichain`. If the floating dep breaks against the new framework, this is the third swap; decide in Wave 0, not mid-phase.

**yarn.lock:** regenerate via `yarn install`, then `git add yarn.lock` (currently untracked — the reproducibility gap, Pitfall 7). Do NOT commit `cache_hardhat/`, `openzeppelin-contracts-diamond/`, `openzeppelin-transpiler/`, `sushi-list/`, `package-lock.json` (untracked local artifacts).

---

### `diamonds/GeniusDiamond/geniusdiamond.config.json` (config, REPLACE)

**Primary analog:** `../gnus-ai/diamonds/GeniusDiamond/geniusdiamond.config.json` (205 lines, 2.6) — **wholesale copy, not a patch**.

**Why replace-not-patch (the deltas that make patching impossible):**
| Aspect | This repo (2.5) | gnus-ai (2.6) |
|---|---|---|
| `protocolVersion` | 2.5 | 2.6 |
| `GeniusAI` facet | present (priority 70, `GeniusAI_Initialize()`) | **REMOVED — contract deleted at new pin; a config referencing it fails** |
| `GNUSBridge` priority | 120, version `0.0` only | 115, versions `0.0`/`2.5`/`2.6` with `fromVersions` chains |
| New facets | — | `GNUSBridgeAttestor`(116), `GNUSTreasury`(117, `GNUSTreasury_Initialize260()`, `upgradeInit: ""`), `GNUSRedeemAdapter`(118), `GNUSLifecycle`(119), `GNUSLifecycleMint`(121), `GNUSLicensing`(122), `GNUSLicensingPurchase`(123) |
| `ERC1155ProxyOperator` | `callbacks: ["setNFTProxyRoleForOpenSea"]` | callbacks dropped; `deployInclude: [isApprovedForAll, totalSupply, creators]` |
| `GNUSControl` | `callbacks: ["registerProtocolVersionChainId"]` | callbacks dropped |
| `GNUSNFTFactory` | versions `0.0`, `2.3` | adds `2.6` key (`GNUSNFTFactory_Initialize230()`) |

**Copy guidance:** take gnus-ai's file verbatim (both files were read this session; formatting/keys identical apart from content). Then delete this repo's `diamonds/GeniusDiamond/callbacks/` (`ERC1155ProxyOperator.ts`, `GNUSControl.ts`) — the 2.6 config has zero `callbacks` keys, and those files import the nonexistent `@gnus.ai/diamonds` package name (dead code per RESEARCH "Deprecated").

---

### `diamonds/ProxyDiamond/proxydiamond.config.json` (config, MODIFY)

**Primary analog:** itself — this is a deletion, not a port.

**Remove the callbacks block** (lines 16-25) so the facet entry becomes:
```json
"ERC20ProxyFacet": {
  "priority": 40,
  "versions": {
    "0.0": {}
  }
}
```
**Consequence:** `diamonds/ProxyDiamond/callbacks/ERC20ProxyFacet.ts` (`createXMPLToken`, 26 lines) becomes unreferenced — delete it, or keep it unused only if the planner wants an explicit-init example in-repo (not recommended; it encodes the broken self-pointing pattern, lines 20-25: `initializeERC20Proxy(diamondAddress, chainID, ...)` — the diamond pointing at itself as the ERC-1155 target, which D-04's `totalSupply` warm-up reverts on because the ERC-20 facet exposes `totalSupply()` with no `uint256` arg).

**Fixture consequence (Pitfall 3/4 linkage):** unit tests currently rely on the callback for initialized state — `name() === "ExampleToken"`, `symbol() === "XMPL"` (unit test lines 195-205) and the re-init test's premise "already initialized by the post-deployment callback" (line 259). After the callback is dropped, the unit `before()` must deploy the mock and call `initializeERC20Proxy` explicitly (or snapshot before init for the uninit tests).

---

### `test/unit/ERC20ProxyFacet.test.ts` (test, EXTEND + FLIP)

**Primary analog:** itself for the scaffold; `../gnus-ai/test/unit/ERC1155ProxyOperator.test.ts:29-74` for the reworked fixture shape.

**Scaffold to keep verbatim** (lines 21-110):
- `this.timeout(0)` (line 24), multichain provider bootstrap (lines 26-40), per-chain `describe` loop (line 42).
- `before()`: `LocalDiamondDeployer.getInstance(config)` with `configFilePath: "diamonds/ProxyDiamond/proxydiamond.config.json"`, `writeDeployedDiamondData: false` (lines 60-70); `loadDiamondContract<ProxyDiamond>` (76-79); signer/owner wiring (85-101).
- Snapshot isolation: `beforeEach` `evm_snapshot` / `afterEach` `evm_revert` (lines 104-110).

**Rework — the "Uninitialized" tests pass for the wrong reason today** (lines 213-243): the callback initializes against the ProxyDiamond ITSELF, so `totalSupply()`/`balanceOf()`/`allowance()` revert because the self-target has no `totalSupply(uint256)` selector — not because state is uninitialized. After the rework: deploy the mock in `before()`, keep an init-less diamond state for these tests (snapshot before init, or init inside a later `beforeEach`/first test), then assert the same intent (revert before init).

**FLIP target — the re-init test** (lines 258-277):
```typescript
it("Should allow owner to reinitialize (update configuration)", async () => {   // ← becomes: reverts
```
Rewrite to expect the D-03 gate: `await expect(ownerDiamond.initializeERC20Proxy(...)).to.be.revertedWith("Initializable: contract is already initialized")` (exact string verified in `@gnus.ai/...@4.5.0` Initializable.sol).

**EXTEND points:**
- Allowance state machine (new describe block): `approve(spender, n)` → `allowance === n`; `transferFrom` decrements; over-spend reverts `"ERC20: insufficient allowance"`; zero-allowance revert; `approve(MaxUint256)` then `transferFrom` leaves allowance at max (D-02 infinite rule).
- ABI-coverage test (lines 280-310): extend the `requiredFunctions` loop's sibling with a negative assertion — `proxyDiamond.interface.getFunction("setApprovalForAll")` must be **absent** (`expect(() => contractInterface.getFunction("setApprovalForAll")).to.throw()` or check `interface.fragments`).
- Init-guard block (D-04): zero address, `childTokenId = 0`, empty name/symbol each revert; warm-up rejects an EOA/dead target and a wrong-ABI contract (mock variant that omits `totalSupply(uint256)` or reverts in it).

**Style notes:** this repo's tests use double quotes, emoji describe prefixes (`"🧪 ..."`), `ethers.ZeroAddress` / `ethers.parseEther` (v6 API). gnus-ai's test style differs (single quotes, tabs) — copy its STRUCTURE, not its formatting.

---

### `test/integration/DEXFlow.test.ts` (test, NEW)

**Primary analogs (composite):**
1. `test/integration/GNUSAiIntegration.test.ts` (this repo) — outer/inner double-snapshot scaffold, GeniusDiamond deployment, NFTFactory fixture.
2. `../gnus-ai/test/unit/ERC1155ProxyOperator.test.ts:29-58, 312-352` — lifecycle linking + role grants + 1:1 child creation at the new pin (the verified-current patterns).

**Scaffold from GNUSAiIntegration.test.ts** (lines 21-128): same describe scaffolding/timeout(0)/multichain bootstrap; `before()` deploys GeniusDiamond via `LocalDiamondDeployer` with `configFilePath: "diamonds/GeniusDiamond/geniusdiamond.config.json"` (lines 70-87); `outerSnapshotId` after deploy, `innerSnapshotId` per test (lines 113, 118-128).

**NEW for this suite — the additions the model lacks:**
- **Lifecycle linking FIRST** (gnus-ai pattern, ERC1155ProxyOperator.test.ts:29-31): `await setupLifecyclePolicyLinking();` at the top of `before()`, BEFORE any `LocalDiamondDeployer.getInstance(...)` — without it the GeniusDiamond deploy throws on `GNUSNFTFactory`'s library link (Pitfall 1).
- **Second diamond in the same fixture:** deploy ProxyDiamond the same way (unit test's config shape, lines 61-70), then `initializeERC20Proxy(geniusDiamondAddress, childTokenId, "DEX Test Token", "DEXT")`.
- **Operator role grant** (Pitfall 6) — compute the role the gnus-ai way rather than reading the getter (the `NFT_PROXY_OPERATOR_ROLE()` public constant on `ERC1155ProxyOperator.sol:19` is not guaranteed to be in the aggregated diamond ABI; `deployInclude` only lists three functions):
```typescript
const NFT_PROXY_OPERATOR_ROLE = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("NFT_PROXY_OPERATOR_ROLE"));
// diamond owner:
await geniusDiamond.grantRole(NFT_PROXY_OPERATOR_ROLE, proxyDiamondAddress);
```
- **Child token creation at the new pin** (gnus-ai ERC1155ProxyOperator.test.ts:312-352, the authoritative pattern): grant `CREATOR_ROLE` + `MINTER_ROLE` to owner (:54-58); `createNFT(0, "DEX Test", "DEXT", 2, 100, "")` — exchangeRate is a plain number, display-only (:321-329); fund the creator with GNUS via `mint(address,uint256)` — **plain minion-denominated amount, not parseEther** (:337); mint the child via the 4-arg factory path `mint(address,uint256,uint256,bytes)` which burns creator GNUS 1:1 (:342-347); child supply asserts 1:1 (:350-351). No time-travel needed (create+mint run back-to-back in gnus-ai's tests).
- **D-05 assertion sequence** (from CONTEXT D-05): holder `approve(router, n)` → `transferFrom` moves tokens → `allowance` decreased by n → second over-spend reverts → zero-allowance rejection → `setApprovalForAll(user, router-or-anyone, true)` on the DIAMOND leaves `proxy.allowance(user, spender)` unchanged (criterion 5 — strongest while the proxy itself holds `NFT_PROXY_OPERATOR_ROLE`, so `isApprovedForAll(user, proxy) === true` for all users yet grants no ERC-20 allowance) → `approve(MaxUint256)` + `transferFrom` leaves allowance at max.
- **Reuse this repo's helpers:** `toWei`/`GNUS_TOKEN_ID` from `../../scripts/common` (as GNUSAiIntegration.test.ts:10 does), `logEvents`, `iObjToString`, `loadDiamondContract`. But note child-mint amounts at the new pin are minion-denominated plain numbers — do not `toWei` the child leg (only the GNUS funding leg, if minting whole GNUS).

---

### `test/integration/GNUSAiIntegration.test.ts` (test, REWORK)

**Primary analog:** `../gnus-ai/test/unit/ERC1155ProxyOperator.test.ts:312-352` (1:1 burn math pattern).

**The wrong assertion to fix** (lines 403-407):
```typescript
assert(
  burntSupply === toWei(5.0 * 2.0),  // exchange-rate math — WRONG at new pin (Phase 9 changed to 1:1)
```
Rework to 1:1 minion-denominated: mint child amount `n` (plain number), creator's GNUS burn equals `n` — model on gnus-ai's test (fund creator with `mintAmount` at :337, 4-arg mint at :342-347, supply check at :350-351). The batch-mint test's burn expectation (lines 457-476) needs the same treatment.

**Scaffold survives unchanged:** describe loops, before()/snapshots (lines 21-128), role-grant + mint beforeEach (lines 212-248), revert-message assertions (they use `rejectedWith(Error, /.../)` regex style — keep). Watch for revert-string drift at the new pin (e.g. `"Only Creators or Admins can create NFT child of GNUS"` line 322 may have changed wording; run once against the bumped pin before editing assertions).

---

### `test/deployment/*` (tests, REWORK)

**Primary analog:** themselves — `test/deployment/GeniusDiamondDeployment.test.ts` (246 lines), `ProxyDiamondDeployment.test.ts` (227), `ProxyDiamondPostDeploymentComparison.test.ts` (229) all follow the identical scaffold: same multichain describe loop, `configFilePath: "diamonds/GeniusDiamond/geniusdiamond.config.json"` (GeniusDiamondDeployment.test.ts:70), `LocalDiamondDeployer.getInstance(config)` (:72).

**Copy guidance:** change only what the 2.6 config changes — facet lists/counts, init-function expectations, and (per Pitfall 1) add `setupLifecyclePolicyLinking()` to `before()` for the GeniusDiamond suite. The config-vs-deployed comparison logic pattern is exactly what validates the 2.6 replacement.

---

## Shared Patterns

### Deployment scaffold (all test dirs)
**Source:** `test/unit/ERC20ProxyFacet.test.ts:21-110` (this repo's canonical version)
**Apply to:** DEXFlow.test.ts (new), any reworked suite.
Multichain provider bootstrap → `LocalDiamondDeployer.getInstance(config)` → `loadDiamondContract<T>` → signers/owner wiring → `evm_snapshot`/`evm_revert` isolation → `this.timeout(0)`. **Signature divergence (A3 open question):** this repo's local copy is `scripts/setup/LocalDiamondDeployer.ts:86` `getInstance(config)` (defaults provider/networkName/chainId internally, line 89-100); the framework-shipped one used by gnus-ai is `getInstance(hre, config)` from `@geniusventures/hardhat-diamonds/dist/utils` (gnus-ai test :1-4, :41-42). Try the local copy first (smallest diff); if the 2.6 config keys don't pass through, migrate imports in the same harness task — do not ship both.

### Lifecycle library linking (every GeniusDiamond-deploying process)
**Source:** `../gnus-ai/scripts/utils/GNUSLifecyclePolicyLinking.ts` + gnus-ai hardhat.config.ts:28-30 + gnus-ai test :29-31
**Apply to:** hardhat.config.ts, all four test files' `before()` hooks.
Eager path for tests: `await setupLifecyclePolicyLinking()` before `getInstance`. Lazy path for every other process: `extendEnvironment((hre) => installLazyLifecyclePolicyLinker(hre))` in hardhat.config.ts. Both share the per-network cache; no top-level `import 'hardhat'`.

### Role handling
**Source:** `../gnus-ai/test/unit/ERC1155ProxyOperator.test.ts:22-26, 54-58`
**Apply to:** DEXFlow.test.ts, GNUSAiIntegration rework.
Compute role constants client-side: `hre.ethers.keccak256(hre.ethers.toUtf8Bytes("NFT_PROXY_OPERATOR_ROLE"))`; grant via `geniusDiamond.grantRole(role, addr)` from the owner signer. Do not rely on the `NFT_PROXY_OPERATOR_ROLE()` getter being in the aggregated ABI.

### Diamond storage append-only
**Source:** `contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol:10-37`
**Apply to:** the `_allowances` append (D-01). New `Layout` fields only at the end; the keccak-derived slot constant never changes.

### One-shot init gate
**Source:** `@gnus.ai/contracts-upgradeable-diamond/proxy/utils/Initializable.sol` (already imported, facet line 4) + `ProxyDiamond.sol:32` constructor reset
**Apply to:** `initializeERC20Proxy` (D-03). Add `initializer` to the modifier list; the revert string for tests is `"Initializable: contract is already initialized"`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `contracts/erc20-gnus-proxy/mocks/` ERC1155 mock | test contract | CRUD | No ERC1155 mock exists in either repo; `MockERC20.sol` supplies the style only — the id-parameterized surface is new code (RESEARCH §Open Questions 2 recommends the ~40-line minimal mock) |

Everything else has an exact analog (several are verbatim ports from `../gnus-ai`, verified readable at the target pins this session).

---

## Metadata

**Analog search scope:** `erc20-gnus-proxy/{contracts,test,scripts,diamonds,hardhat.config.ts,package.json}` + sibling `gnus-ai/{contracts/gnus-ai,contracts/mocks,scripts/utils,test/unit,diamonds/GeniusDiamond,hardhat.config.ts,package.json}` (sibling nested contracts confirmed at pin `61b7ca4`).
**Files read in full:** ERC20ProxyFacet.sol, ERC20ProxyStorage.sol, ProxyDiamond.sol, GNUSBridge.sol (targeted :370-556), GNUSLifecyclePolicyLinking.ts, hardhat.config.ts (both), package.json (both), all 4 test files (3 fully + gnus-ai ProxyOperator test targeted), both GeniusDiamond configs, proxydiamond.config.json, ProxyDiamond callback, LocalDiamondDeployer.ts (targeted :86-150), MockERC20.sol.
**Conventions reference:** `../gnus-ai/.planning/milestones/v1.0-phases/11-erc-20-proxy-hardening/11-PATTERNS.md` (the same phase executed diamond-side — header/format template).
**Pattern extraction date:** 2026-08-29
