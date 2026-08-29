---
phase: 01-erc-20-proxy-hardening
plan: 05
type: execute
wave: 2
depends_on: ["01-02", "01-03"]
files_modified:
  - test/integration/DEXFlow.test.ts
autonomous: true
requirements: [PROXY-01]

must_haves:
  truths:
    - "A DEX-style router (regular signer) runs approve -> transferFrom against the live GeniusDiamond+ProxyDiamond pair from the bumped nested submodule"
    - "Finite allowance decreases correctly across spends; over-spend and zero-allowance revert with ERC20: insufficient allowance"
    - "setApprovalForAll on the diamond does NOT grant or spend ERC-20 allowance, even while the proxy itself holds NFT_PROXY_OPERATOR_ROLE (criterion 5 — the phase's acceptance lynchpin)"
    - "approve(MaxUint256) survives transferFrom with no decrement, live-pair edition"
  artifacts:
    - path: "test/integration/DEXFlow.test.ts"
      provides: "D-05 integration suite — full router pattern against the live pair"
      contains: "NFT_PROXY_OPERATOR_ROLE"
  key_links:
    - from: "test/integration/DEXFlow.test.ts before()"
      to: "scripts/utils/GNUSLifecyclePolicyLinking.ts"
      via: "await setupLifecyclePolicyLinking() before LocalDiamondDeployer.getInstance"
      pattern: "setupLifecyclePolicyLinking"
    - from: "test/integration/DEXFlow.test.ts"
      to: "diamonds/GeniusDiamond/geniusdiamond.config.json"
      via: "LocalDiamondDeployer configFilePath 2.6 config"
      pattern: "geniusdiamond\\.config\\.json"
    - from: "proxy fixture"
      to: "GeniusDiamond ERC1155ProxyOperator"
      via: "owner grants NFT_PROXY_OPERATOR_ROLE (client-side keccak256) to the proxy address"
      pattern: "grantRole"
---

<objective>
Build test/integration/DEXFlow.test.ts per D-05: the full router pattern against the live GeniusDiamond+ProxyDiamond pair deployed from the bumped nested submodule — including the criterion-5 proof (allowance independent of operator approval) that is only observable with both contracts live, because the nested ERC1155ProxyOperator overrides isApprovedForAll.

Purpose: this suite is simultaneously the PROXY-01 acceptance test and the pin-bump enabler's proof of work (the harness rework is validated by this suite running at all).
Output: green DEXFlow suite covering the complete D-05 assertion sequence.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-erc-20-proxy-hardening/01-CONTEXT.md (D-05 — the assertion sequence, verbatim)
@.planning/phases/01-erc-20-proxy-hardening/01-RESEARCH.md (Pitfall 6, Code Example 5, architecture diagram)
@.planning/phases/01-erc-20-proxy-hardening/01-PATTERNS.md (section "test/integration/DEXFlow.test.ts" — composite analogs, role computation, child-creation pattern)
@.planning/phases/01-erc-20-proxy-hardening/01-02-lifecycle-linking-and-deploy-harness-PLAN.md (SUMMARY — the A3 deployer decision this fixture must follow)
</context>

<tasks>

<task type="auto">
  <name>Task 1: DEXFlow fixture — live pair, roles, child token, proxy init</name>
  <files>test/integration/DEXFlow.test.ts</files>
  <read_first>
  test/integration/GNUSAiIntegration.test.ts lines 1-128 (the scaffold to model: describe loops, timeout(0), multichain bootstrap, LocalDiamondDeployer config shape, outer/inner double-snapshot)
  test/unit/ERC20ProxyFacet.test.ts lines 60-79 (the ProxyDiamond deployer config — configFilePath "diamonds/ProxyDiamond/proxydiamond.config.json")
  ../gnus-ai/test/unit/ERC1155ProxyOperator.test.ts lines 22-58 (role constants + grants) and 312-352 (child creation + 1:1 minion-denominated mint at the new pin)
  scripts/common.ts (GNUS_TOKEN_ID, toWei helpers to reuse)
  </read_first>
  <action>
  Create test/integration/DEXFlow.test.ts modeled on GNUSAiIntegration.test.ts's scaffold (describe scaffolding, this.timeout(0), multichain provider bootstrap, double snapshot: outerSnapshotId after deploys, innerSnapshotId per test via evm_snapshot/evm_revert). Use the deployer implementation recorded in the Plan 02 SUMMARY (A3 outcome) — do not introduce a second variant.
  In before(): FIRST call await setupLifecyclePolicyLinking() (import from "../../scripts/utils/GNUSLifecyclePolicyLinking") — before any LocalDiamondDeployer.getInstance, or the GeniusDiamond deploy throws on GNUSNFTFactory's library link. Deploy the GeniusDiamond (configFilePath "diamonds/GeniusDiamond/geniusdiamond.config.json", writeDeployedDiamondData false) and the ProxyDiamond (configFilePath "diamonds/ProxyDiamond/proxydiamond.config.json", writeDeployedDiamondData false) in the same fixture.
  Wire roles and assets: compute role constants client-side — ethers.keccak256(ethers.toUtf8Bytes("NFT_PROXY_OPERATOR_ROLE")), same for "CREATOR_ROLE" and "MINTER_ROLE" — because the NFT_PROXY_OPERATOR_ROLE getter is not guaranteed to be in the aggregated ABI (2.6 config deployInclude lists only isApprovedForAll/totalSupply/creators). Grant CREATOR_ROLE and MINTER_ROLE to the owner signer. Create the child token: createNFT(0, "DEX Test", "DEXT", 2, 100, "0x") and capture childTokenId from the result (exchangeRate 2 is display-only; no time-travel needed — create+mint run back-to-back in gnus-ai's tests). Fund the creator with GNUS via mint(address, uint256) using a PLAIN minion-denominated amount (a plain BigInt such as 1000000n — NOT parseEther/toWei; Phase 9 semantics), then mint child tokens to the holder via the 4-arg mint(address, uint256, uint256, bytes) path which burns creator GNUS 1:1. Grant NFT_PROXY_OPERATOR_ROLE to the ProxyDiamond address from the diamond owner — this is the mechanical prerequisite for the ERC-1155 leg (Pitfall 6) and, deliberately, the strongest arrangement for criterion 5: with the role held, isApprovedForAll(user, proxy) is true for ALL users, yet must grant zero ERC-20 allowance.
  Finally initialize the proxy: ownerDiamond.initializeERC20Proxy(geniusDiamondAddress, childTokenId, "DEX Test Token", "DEXT") — the D-04 warm-up passes because the live diamond answers totalSupply(uint256).
  Commit scope: test(hardening): DEXFlow live-pair fixture per D-05.
  </action>
  <verify>
    <automated>test -f test/integration/DEXFlow.test.ts && grep -c "setupLifecyclePolicyLinking" test/integration/DEXFlow.test.ts && grep -c "NFT_PROXY_OPERATOR_ROLE" test/integration/DEXFlow.test.ts && grep -c "initializeERC20Proxy" test/integration/DEXFlow.test.ts && npx hardhat test test/integration/DEXFlow.test.ts</automated>
  </verify>
  <acceptance_criteria>
  - Fixture deploys both diamonds from the 2.6 config at 61b7ca4 with lifecycle linking installed first (no UNLINKED_LIBRARY)
  - Child token created and minted with 1:1 minion-denominated GNUS burn (no parseEther on the child leg)
  - NFT_PROXY_OPERATOR_ROLE granted to the proxy address; roles computed client-side via keccak256
  - Proxy initialized against the live diamond; suite runs to completion (assertions land in Task 2 — Task 1 may carry a minimal placeholder happy-path assert)
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: D-05 assertion sequence — router flow, criterion 5, max-allowance infinity</name>
  <files>test/integration/DEXFlow.test.ts</files>
  <read_first>
  .planning/phases/01-erc-20-proxy-hardening/01-CONTEXT.md D-05 (the required sequence — this task implements it verbatim)
  .planning/phases/01-erc-20-proxy-hardening/01-RESEARCH.md Pitfall 6 (why transferFrom fails without the role grant — and why the failure must appear inside the diamond, not the facet, if misconfigured)
  </read_first>
  <action>
  Implement the D-05 assertion sequence against the fixture (router = a regular signer; a router is just approve+transferFrom — no fork infra, no new deps). Use the inner per-test snapshot so each test starts from the funded, initialized state.
  Sequence: (1) holder approve(router, n) then allowance(holder, router) equals n; (2) router transferFrom(holder, recipient, n) moves n child tokens (verify via proxyDiamond.balanceOf on holder and recipient) and allowance decreases to zero; (3) decreasing-allowance arithmetic — approve a larger finite amount, spend part, assert the remainder exactly; (4) over-spend reverts with "ERC20: insufficient allowance" and moves nothing; (5) zero-allowance rejection — a fresh spender with no approve reverts with the same string; (6) criterion 5 — on the DIAMOND call setApprovalForAll(holder, router, true) (and separately for the proxy address), then assert proxyDiamond.allowance(holder, router) is unchanged/zero and an unapproved transferFrom STILL reverts with "ERC20: insufficient allowance" — operator approval on the ERC-1155 plane grants nothing on the ERC-20 plane, proven live with the role override in play; (7) max-allowance — approve(router, ethers.MaxUint256), transferFrom a finite amount, assert allowance remains ethers.MaxUint256 (no decrement), then spend again successfully; (8) the ERC-1155 leg itself keeps working — the successful transferFrom spends are only possible because the proxy holds NFT_PROXY_OPERATOR_ROLE, so steps 2/3/7 simultaneously prove the operator plumbing and its non-interference with allowance accounting.
  Style: double quotes, emoji describe prefixes, ethers v6 API, chai expect; reuse toWei/GNUS_TOKEN_ID from ../../scripts/common only for GNUS-denominated legs if needed (never for child-leg amounts).
  Commit scope: test(hardening): DEXFlow D-05 assertion sequence incl. criterion 5.
  </action>
  <verify>
    <automated>grep -c "ERC20: insufficient allowance" test/integration/DEXFlow.test.ts && grep -c "setApprovalForAll" test/integration/DEXFlow.test.ts && grep -c "MaxUint256" test/integration/DEXFlow.test.ts && npx hardhat test test/integration/DEXFlow.test.ts</automated>
  </verify>
  <acceptance_criteria>
  - Suite green; all seven D-05 sequence elements present as separate its
  - Criterion 5 asserted in both directions: setApprovalForAll neither grants spendable ERC-20 allowance nor is required for it, with the proxy holding the operator role
  - MaxUint256 allowance provably infinite across two spends on the live pair
  - Over-spend/zero-allowance reverts carry the exact OZ string
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| router signer -> ProxyDiamond ERC-20 surface | Untrusted-integrator stand-in exercising the public allowance API |
| ProxyDiamond -> GeniusDiamond ERC-1155 leg | The proxy acts as operator via the role grant; the diamond enforces its own operator rules |
| test -> nested submodule contracts | Live-pair testing executes the bumped third-party contract code |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-1-04 | Elevation (allowance/operator-plane conflation — the old vulnerability) | DEXFlow criterion-5 tests | mitigate | Live-pair proof that ERC-1155 operator approval (including the NFT_PROXY_OPERATOR_ROLE override making isApprovedForAll universally true) never grants or spends ERC-20 allowance |
| T-1-13 | Elevation (misconfigured production role grant masking a facet bug) | fixture role grant | mitigate | The role grant is to the PROXY (mechanical ERC-1155 prerequisite), never to the router; if transferFrom reverts inside the diamond rather than the facet, Pitfall 6 says the fixture is wrong — assertion strings pin where the revert must occur |
| T-1-12 | Tampering (infinite-allowance drift on live pair) | max-allowance test | mitigate | Two-spend no-decrement assertion pins D-02 semantics end-to-end |
</threat_model>

<verification>
- npx hardhat test test/integration/DEXFlow.test.ts green — VALIDATION's criterion-5 row and the pin-bump enabler proof
- A failing run whose revert originates inside the diamond (not the facet) indicates a fixture role problem per Pitfall 6 — fix the fixture, never the facet
</verification>

<success_criteria>
- ROADMAP criterion 5 (allowance independent of operator approval) proven on the live bumped pair
- The full DEX-style approve -> transferFrom flow tested: decreasing allowance, zero-allowance rejection, max-allowance no-decrement
- Suite doubles as proof the deployment-harness rework (Plans 01/02) actually yields a deployable current GeniusDiamond
</success_criteria>

<output>
Create .planning/phases/01-erc-20-proxy-hardening/01-05-SUMMARY.md when done
</output>
