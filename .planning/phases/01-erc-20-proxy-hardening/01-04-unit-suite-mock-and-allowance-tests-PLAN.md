---
phase: 01-erc-20-proxy-hardening
plan: 04
type: execute
wave: 2
depends_on: ["01-02", "01-03"]
files_modified:
  - contracts/erc20-gnus-proxy/mocks/MockERC1155Supply.sol
  - test/unit/ERC20ProxyFacet.test.ts
autonomous: true
requirements: [PROXY-01, PROXY-02]

must_haves:
  truths:
    - "The unit suite deploys the proxy against a minimal local ERC-1155 mock (no GeniusDiamond, no callback) and initializes explicitly"
    - "A second initializeERC20Proxy call reverts with Initializable: contract is already initialized (the old re-init-success test is gone)"
    - "The finite-allowance state machine is exhaustively tested: set/read, decrement on spend, over-spend revert, zero-allowance rejection, max-allowance no-decrement, direct overwrite"
    - "Every D-04 guard has a reverting test, and the warm-up accepts a valid-but-unminted child id while rejecting a dead EOA and a wrong-ABI (self-pointing) target"
    - "setApprovalForAll is provably absent from the aggregated proxy ABI, and the mock's operator-plane functions revert if ever touched"
  artifacts:
    - path: "contracts/erc20-gnus-proxy/mocks/MockERC1155Supply.sol"
      provides: "minimal ERC1155Supply-subset mock with reverting operator plane"
      contains: "totalSupply"
    - path: "test/unit/ERC20ProxyFacet.test.ts"
      provides: "reworked fixture + allowance state machine + guard block + flipped re-init test"
      contains: "Initializable: contract is already initialized"
  key_links:
    - from: "test/unit/ERC20ProxyFacet.test.ts before()"
      to: "contracts/erc20-gnus-proxy/mocks/MockERC1155Supply.sol"
      via: "explicit initializeERC20Proxy(mockAddress, childTokenId, ...) after ProxyDiamond deploy"
      pattern: "initializeERC20Proxy"
    - from: "test/unit/ERC20ProxyFacet.test.ts"
      to: "ERC20ProxyFacet allowance internals"
      via: "state-machine assertions on allowance() before/after transferFrom"
      pattern: "insufficient allowance"
---

<objective>
Rework and extend test/unit/ERC20ProxyFacet.test.ts into the D-05 unit half: a mock-based fixture replacing the deleted self-pointing callback, the flipped re-init test, the D-04 guard block, and the exhaustive finite-allowance state machine.

Purpose: proves PROXY-01/PROXY-02 behavior at unit depth with fast, diamond-independent tests; the integration half (criterion 5) is Plan 05.
Output: green unit suite covering every D-04 guard string and every allowance transition.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-erc-20-proxy-hardening/01-CONTEXT.md (D-04, D-05)
@.planning/phases/01-erc-20-proxy-hardening/01-RESEARCH.md (Pitfalls 3/4, Validation Architecture PROXY rows)
@.planning/phases/01-erc-20-proxy-hardening/01-PATTERNS.md (sections: mocks/, test/unit/ERC20ProxyFacet.test.ts — scaffold-keep list, flip target, extend points)
@.planning/phases/01-erc-20-proxy-hardening/01-03-facet-allowance-and-init-hardening-PLAN.md (the exact revert strings to assert)
</context>

<tasks>

<task type="auto">
  <name>Task 1: MockERC1155Supply — minimal ERC-1155 mock with a reverting operator plane</name>
  <files>contracts/erc20-gnus-proxy/mocks/MockERC1155Supply.sol</files>
  <read_first>
  ../gnus-ai/contracts/mocks/MockERC20.sol (the org mock convention: standalone contract, no OZ inheritance, @title/@dev NatSpec header, plain requires)
  contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol lines 67-93, 101-103, 124-130 (the exact ERC-1155 subset the facet calls: totalSupply(uint256), balanceOf(address,uint256), safeTransferFrom(address,address,uint256,uint256,bytes))
  </read_first>
  <action>
  Create contracts/erc20-gnus-proxy/mocks/MockERC1155Supply.sol — a standalone contract (no parent contracts, no OZ imports), roughly 40 lines, styled after MockERC20.sol (MIT SPDX header, pragma solidity ^0.8.2, @title MockERC1155Supply NatSpec header). State: mapping(uint256 => mapping(address => uint256)) for balances and mapping(uint256 => uint256) for supplies, both private. Surface exactly what the facet touches plus a test helper: totalSupply(uint256 id) external view returns the supply mapping (returns 0 for unminted ids — a pure mapping read); balanceOf(address account, uint256 id) external view returns the balance; safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata) public with balance bookkeeping requiring sufficient balance with revert string "MockERC1155Supply: insufficient balance" and updating both sides (no approval check inside the mock — the proxy's own allowance logic is the system under test); mint(address account, uint256 id, uint256 amount) external test helper incrementing balance and supply.
  Implement the operator plane to REVERT: setApprovalForAll(address, bool) and isApprovedForAll(address, address) external view both revert with "MockERC1155Supply: operator plane must not be touched". Rationale (planner decision on the PATTERNS discretion): any facet call reaching the operator plane now fails loudly, making "no setApprovalForAll on the ERC-20 surface" executable behavior rather than only an ABI inspection.
  No ERC-20 surface (no approve/allowance), no ERC-165. Keep double-quote/2-space repo style irrelevant here (Solidity) — follow MockERC20.sol layout conventions.
  Commit scope: test(hardening): minimal ERC1155 mock with reverting operator plane.
  </action>
  <verify>
    <automated>grep -q "contract MockERC1155Supply" contracts/erc20-gnus-proxy/mocks/MockERC1155Supply.sol && grep -c "MockERC1155Supply: operator plane must not be touched" contracts/erc20-gnus-proxy/mocks/MockERC1155Supply.sol && ! grep -q "function approve" contracts/erc20-gnus-proxy/mocks/MockERC1155Supply.sol && npx hardhat compile</automated>
  </verify>
  <acceptance_criteria>
  - Mock compiles; exposes totalSupply(uint256), balanceOf(address,uint256), safeTransferFrom with bookkeeping, mint helper
  - setApprovalForAll/isApprovedForAll revert with the distinctive string; mock has no ERC-20 approve function
  - totalSupply returns 0 for unminted ids (pure read — no revert, required by the D-04 warm-up tolerance test)
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Fixture rework, uninitialized-test rework, flipped re-init test, D-04 guard block</name>
  <files>test/unit/ERC20ProxyFacet.test.ts</files>
  <read_first>
  test/unit/ERC20ProxyFacet.test.ts lines 21-110 (scaffold to keep: timeout(0), multichain bootstrap, LocalDiamondDeployer config with configFilePath "diamonds/ProxyDiamond/proxydiamond.config.json" and writeDeployedDiamondData false, loadDiamondContract, signer wiring, evm_snapshot/evm_revert isolation)
  test/unit/ERC20ProxyFacet.test.ts lines 195-243 (name/symbol assertions + the two "Uninitialized" describes), lines 258-277 (the re-init test to flip)
  .planning/phases/01-erc-20-proxy-hardening/01-PATTERNS.md — section "test/unit/ERC20ProxyFacet.test.ts" (fixture consequence of the callback drop)
  .planning/phases/01-erc-20-proxy-hardening/01-02-SUMMARY.md (A3 outcome — fixture import must follow it)
  </read_first>
  <action>
  Rework the fixture: in before(), after the ProxyDiamond deploys, deploy MockERC1155Supply and hold a pre-init snapshot. Structure the init lifecycle so guard tests run against UNINITIALIZED state and the main suite runs against initialized state: capture a snapshot id immediately after diamond deploy (before any init), then call ownerDiamond.initializeERC20Proxy(mockAddress, 1, "ExampleToken", "XMPL") — keep the historical name/symbol values so existing assertions at lines 195-205 survive unchanged (childTokenId 1). Tests needing uninitialized state evm_revert to the pre-init snapshot first (reverting init attempts leave state untouched, so consecutive guard tests chain safely off the same snapshot); restore/init ordering must place any SUCCESSFUL init (the unminted-id tolerance case) last within its describe or re-deploy, because a successful init arms the one-shot gate. If the Plan 01-02 SUMMARY records a migration to the framework-shipped deployer (A3 fallback), the unit fixture's LocalDiamondDeployer import migrates identically in this task — ship exactly one deployer implementation across all suites.
  Rework the two "Uninitialized" describes (lines 213-243) to the deterministic post-hardening behaviors — the old tests passed for the wrong reason (self-pointing target lacked the selector): totalSupply() and balanceOf() before init reject (staticcall to the zero address returns empty returndata — assert broad promise rejection, not a specific revert string); allowance() before init returns 0n (proxy-local zero-initialized mapping — the new correct semantic); approve() before init succeeds as a local write with allowance() reflecting it; transferFrom() before init reverts with "ERC20: insufficient allowance" (allowance gate fires before the ERC-1155 leg — keeps the revert intent). Replace the transfer()-before-init test: a CALL to the zero address succeeds silently in the EVM, so the old revert expectation is no longer achievable — remove that single test and record the rationale in the SUMMARY (an initialized-guard on transfer is outside locked D-01..D-05 scope; D-04's warm-up plus one-shot init are the locked protections).
  Flip the re-init test (lines 258-277): rename to expect revert; assert await expect(ownerDiamond.initializeERC20Proxy(ethers.ZeroAddress, 2, "New Token", "NEW")) is revertedWith("Initializable: contract is already initialized") — note the initializer gate fires before the D-04 guards, so even a zero-address payload hits the Initializable string; also assert name()/symbol() are unchanged after the failed attempt.
  Add a new "Initialization Guard Tests" describe asserting each D-04 guard from the uninitialized snapshot: zero ERC-1155 address reverts "ERC20Proxy: ERC1155 contract cannot be zero address"; childTokenId 0 (valid mock address) reverts "ERC20Proxy: child token ID cannot be zero"; empty name reverts "ERC20Proxy: name cannot be empty"; empty symbol reverts "ERC20Proxy: symbol cannot be empty"; warm-up rejections — an EOA target (pass signer1.address) rejects, and a wrong-ABI target rejects (pass the ProxyDiamond's own address: its ERC-20 facet exposes totalSupply() with no uint256 arg, so the totalSupply(uint256) selector misses — this is exactly the old self-pointing configuration); warm-up tolerance — initializing against the mock with a valid but UNMINTED child id (e.g. 7, never minted) SUCCEEDS and arms the gate (run last / on fresh instance). Follow existing style: double quotes, emoji describe prefixes, ethers v6 API (ethers.ZeroAddress, ethers.parseEther).
  Commit scope: test(hardening): unit fixture on mock, flipped re-init, D-04 guards.
  </action>
  <verify>
    <automated>grep -c "Initializable: contract is already initialized" test/unit/ERC20ProxyFacet.test.ts && grep -c "ERC20Proxy: child token ID cannot be zero" test/unit/ERC20ProxyFacet.test.ts && ! grep -q "Should allow owner to reinitialize" test/unit/ERC20ProxyFacet.test.ts && npx hardhat test test/unit/ERC20ProxyFacet.test.ts</automated>
  </verify>
  <acceptance_criteria>
  - Suite green; fixture initializes explicitly against the mock (no callback reliance — callback was deleted in Plan 01)
  - No test named "Should allow owner to reinitialize" survives; the flipped test asserts the exact Initializable revert string and post-failure state immutability
  - All four D-04 guard strings asserted; EOA and self-pointing warm-up rejections covered; unminted-id init tolerance covered
  - SUMMARY documents the transfer()-before-init removal rationale and the uninitialized-behavior rework
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Finite-allowance state machine + ABI negative assertion</name>
  <files>test/unit/ERC20ProxyFacet.test.ts</files>
  <read_first>
  test/unit/ERC20ProxyFacet.test.ts lines 280-310 (the ABI-coverage test to extend)
  .planning/phases/01-erc-20-proxy-hardening/01-CONTEXT.md D-01/D-02 (the exact semantics under test — including direct overwrite and max-allowance infinity)
  </read_first>
  <action>
  Add a new "Allowance State Machine Tests" describe (initialized fixture; fund the owner via the mock's mint helper so the ERC-1155 leg can succeed): approve(spender, n) then allowance(owner, spender) equals n, and the Approval event carries (owner, spender, n); transferFrom by the spender moves n tokens (assert mock-side balances via proxyDiamond.balanceOf before/after) and leaves allowance at zero; over-spend — approve(spender, n) then transferFrom(spender, n plus 1) — reverts with "ERC20: insufficient allowance" and moves nothing; zero-allowance rejection — transferFrom with no prior approve reverts with the same string; direct overwrite — approve n then approve m leaves allowance at m with no zero-first requirement (D-02 explicitly rejects the USDT rule); infinite allowance — approve(spender, MaxUint256 via ethers.MaxUint256), transferFrom an amount, assert allowance still equals ethers.MaxUint256 (never decremented) and a second transferFrom still succeeds; Approval is emitted on the finite decrement path (event assertion after a finite spend).
  Extend the ABI-coverage describe (lines 280-310) with a negative assertion: reading proxyDiamond.interface.getFunction("setApprovalForAll") must throw — assert via expect(() => contractInterface.getFunction("setApprovalForAll")).to.throw() or an equivalent fragments check — proving the function is absent from the aggregated ABI. The mock's reverting operator plane already guarantees runtime non-use: every passing transfer/approve test in this suite doubles as proof the facet never touches setApprovalForAll/isApprovedForAll.
  Commit scope: test(hardening): exhaustive finite-allowance state machine per D-05.
  </action>
  <verify>
    <automated>grep -c "ERC20: insufficient allowance" test/unit/ERC20ProxyFacet.test.ts && grep -c "MaxUint256" test/unit/ERC20ProxyFacet.test.ts && grep -c "setApprovalForAll" test/unit/ERC20ProxyFacet.test.ts && npx hardhat test test/unit/ERC20ProxyFacet.test.ts</automated>
  </verify>
  <acceptance_criteria>
  - Suite green covering: set/read, decrement-to-zero, over-spend revert, zero-allowance rejection, direct overwrite, max-allowance no-decrement across two spends, Approval-on-decrement event
  - setApprovalForAll appears in the test file ONLY inside the negative ABI-absence assertion (the operator plane is otherwise untouched — mock would revert)
  - All seven ROADMAP criterion-1/2/3 unit behaviors observable in this suite
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| test fixture -> facet | Tests drive the hardened surface directly, including its revert contracts |
| mock -> facet expectations | The mock deliberately reverts on the operator plane — a tripwire, not a trust boundary |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-1-02 | Elevation (re-init hijack regression) | unit suite | mitigate | Flipped test pins the Initializable revert string — any future reintroduction of re-init fails CI |
| T-1-03 | Tampering (bad init target regression) | unit suite | mitigate | Guard block pins all four guard strings plus warm-up rejection of EOA and wrong-ABI targets; unminted-id tolerance prevents over-blocking |
| T-1-04 | Elevation (operator-plane bypass regression) | unit suite + mock | mitigate | Mock operator plane reverts on touch; ABI negative assertion pins setApprovalForAll absence — both regression tripwires |
| T-1-12 | Tampering (infinite-allowance semantics drift) | unit suite | mitigate | MaxUint256 no-decrement test across two spends pins the D-02 contract |
</threat_model>

<verification>
- npx hardhat test test/unit/ERC20ProxyFacet.test.ts green after each task (quick-run sampling per VALIDATION)
- The suite is the automated proof for VALIDATION rows: approve/allowance real mapping, state machine, re-init flip, guard block
</verification>

<success_criteria>
- D-05 unit half complete: exhaustive finite-allowance state machine + guards + flip, all green
- Every D-04 revert string asserted verbatim (they were fixed in Plan 03 Task 3)
- No test continues to assert the old vulnerable behaviors
</success_criteria>

<output>
Create .planning/phases/01-erc-20-proxy-hardening/01-04-SUMMARY.md when done (record the transfer-before-init removal and uninitialized rework rationale)
</output>
