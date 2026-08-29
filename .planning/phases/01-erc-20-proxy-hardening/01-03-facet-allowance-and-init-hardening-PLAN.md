---
phase: 01-erc-20-proxy-hardening
plan: 03
type: execute
wave: 1
depends_on: ["01-01"]
files_modified:
  - contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol
  - contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol
autonomous: true
requirements: [PROXY-01, PROXY-02]

must_haves:
  truths:
    - "approve(spender, amount) writes a proxy-local amount-specific allowance and emits Approval; allowance(owner, spender) reads that exact value back"
    - "transferFrom spends via _spendAllowance: finite allowances decrement with an Approval event on the decrement, over-spend reverts ERC20: insufficient allowance, approve(type(uint256).max) is infinite and never decremented"
    - "Nothing on the approve/allowance/transferFrom path calls setApprovalForAll or isApprovedForAll"
    - "initializeERC20Proxy is one-shot: a second call reverts Initializable: contract is already initialized"
    - "Init rejects zero ERC-1155 address, childTokenId 0, empty name, empty symbol, and dead/wrong-ABI targets (totalSupply(uint256) warm-up) BEFORE any state commits"
    - "ERC20ProxyStorage.Layout gains _allowances as the LAST field; the keccak256 storage-position constant is untouched"
  artifacts:
    - path: "contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol"
      provides: "append-only _allowances mapping home (D-01)"
      contains: "_allowances"
    - path: "contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol"
      provides: "D-02 allowance internals + D-03/D-04 one-shot guarded init"
      contains: "_spendAllowance"
  key_links:
    - from: "contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol"
      to: "contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol"
      via: "ERC20ProxyStorage.layout()._allowances reads/writes"
      pattern: "ERC20ProxyStorage\\.layout\\(\\)\\._allowances"
    - from: "contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol"
      to: "@gnus.ai/contracts-upgradeable-diamond Initializable"
      via: "initializer modifier on initializeERC20Proxy"
      pattern: "initializer"
---

<objective>
Implement the hardening locked by D-01..D-04: append the _allowances mapping to ERC20ProxyStorage.Layout, mirror GNUSBridge's _approve/_spendAllowance internals exactly (D-02), and make initializeERC20Proxy one-shot with static guards plus the totalSupply(uint256) warm-up smoke test.

Purpose: this is the security-critical surface change — PROXY-01 removes the operator-approval allowance bypass, PROXY-02 closes the re-init config hijack.
Output: hardened facet + storage compiling clean under 0.8.19; tests come in Plans 04/05.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-erc-20-proxy-hardening/01-CONTEXT.md (D-01..D-04 — locked, non-negotiable)
@.planning/phases/01-erc-20-proxy-hardening/01-RESEARCH.md (Code Examples 1-3, Security Domain, Don't Hand-Roll)
@.planning/phases/01-erc-20-proxy-hardening/01-PATTERNS.md (sections: ERC20ProxyFacet.sol, ERC20ProxyStorage.sol — verbatim mirror sources and ordering conventions)
</context>

<tasks>

<task type="auto">
  <name>Task 1: D-01 storage append + vestigial import removal</name>
  <files>contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol, contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol</files>
  <read_first>
  contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol (full, 38 lines)
  contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol (line 6 — the vestigial ERC20Storage import)
  .planning/phases/01-erc-20-proxy-hardening/01-PATTERNS.md — section "ERC20ProxyStorage.sol" (the append sketch)
  </read_first>
  <action>
  In contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol append the field mapping(address => mapping(address => uint256)) _allowances; as the LAST member of struct Layout, after symbol — strictly append-only per D-01 (existing fields erc1155Contract, childTokenId, name, symbol keep their declaration order and slots). Update the struct NatSpec block to document _allowances as the amount-specific ERC-20 approvals. Do NOT touch the ERC20_PROXY_STORAGE_POSITION constant (keccak256("erc20.proxy.storage")) or the layout() function — storage-slot compatibility.
  In contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol delete the vestigial import of ERC20Storage from "@gnus.ai/contracts-upgradeable-diamond/token/ERC20/ERC20Storage.sol" (line 6; exactly one grep hit in the file today — the import itself). D-01 puts _allowances in ERC20ProxyStorage.Layout; leaving the import invites the split-storage-home anti-pattern RESEARCH warns about. Nothing else in this task.
  Commit scope: feat(hardening): append _allowances to proxy storage layout.
  </action>
  <verify>
    <automated>grep -q "mapping(address => mapping(address => uint256)) _allowances;" contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol && ! grep -q "ERC20Storage" contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol && grep -q "keccak256(\"erc20.proxy.storage\")" contracts/erc20-gnus-proxy/ERC20ProxyStorage.sol && npx hardhat compile</automated>
  </verify>
  <acceptance_criteria>
  - _allowances is declared in Layout after symbol (append-only verified by declaration order)
  - Storage-position constant unchanged
  - Zero references to ERC20Storage remain in the facet
  - npx hardhat compile exits 0
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: D-02 real allowance surface — mirror GNUSBridge internals</name>
  <files>contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol</files>
  <read_first>
  ../gnus-ai/contracts/gnus-ai/GNUSBridge.sol lines 385-412 (external allowance/approve surface), 506-516 (transferFrom), 531-555 (_approve/_spendAllowance — the verbatim mirror source at pin 61b7ca4)
  contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol lines 88-130 (existing transfer/allowance/approve/transferFrom to rework)
  .planning/phases/01-erc-20-proxy-hardening/01-PATTERNS.md — section "ERC20ProxyFacet.sol" (conventions to preserve + the exact delta substitutions)
  </read_first>
  <action>
  Rework the allowance surface of contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol per D-02. Add two internal functions mirroring GNUSBridge.sol:531-555 verbatim, with exactly one substitution each: _approve writes ERC20ProxyStorage.layout()._allowances[owner][spender] instead of the ERC20Storage path, keeping the exact OZ revert strings "ERC20: approve from the zero address" and "ERC20: approve to the zero address" and emitting Approval(owner, spender, amount). _spendAllowance reads the current allowance via the allowance() view; if it differs from type(uint256).max it requires current >= amount with "ERC20: insufficient allowance" and calls _approve inside unchecked block with current minus amount — the decrement therefore emits Approval, exactly as the reference does.
  Replace the external functions: allowance(owner, spender) returns ERC20ProxyStorage.layout()._allowances[owner][spender] — the isApprovedForAll ternary at line 102 is deleted. approve(spender, amount) calls _approve(msg.sender, spender, amount) and returns true — the manual Approval emit at line 113 is removed (the emit now lives inside _approve, single emission) and the setApprovalForAll call at line 112 is deleted. transferFrom(sender, recipient, amount) calls _spendAllowance(sender, msg.sender, amount) BEFORE the ERC-1155 leg, then keeps the existing l.erc1155Contract.safeTransferFrom(sender, recipient, l.childTokenId, amount, "") call and the Transfer emit — the require on isApprovedForAll at line 126 (string "ERC20Proxy: transfer caller is not approved") is deleted outright. There is no _msgSender() in this facet: use msg.sender everywhere the reference used it.
  DO NOT add increaseAllowance/decreaseAllowance — explicitly not required by D-01/D-02. DO NOT add a USDT-style approve-to-zero-first rule — direct overwrite is the locked D-02 semantics. Place _approve and _spendAllowance after transferFrom and before the onlyOwnerRole modifier, mirroring GNUSBridge's external-then-internal ordering. Preserve existing NatSpec per-function blocks; update their wording only where behavior changed.
  Commit scope: feat(hardening): real amount-specific ERC-20 allowances per D-01/D-02.
  </action>
  <verify>
    <automated>! grep -q "setApprovalForAll" contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol && ! grep -q "isApprovedForAll" contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol && grep -c "ERC20: insufficient allowance" contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol && grep -c "ERC20: approve from the zero address" contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol && grep -c "_spendAllowance" contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol && npx hardhat compile</automated>
  </verify>
  <acceptance_criteria>
  - Zero occurrences of setApprovalForAll or isApprovedForAll anywhere in the facet (grep-clean — the structural removal of the bypass)
  - _approve and _spendAllowance present as internal functions with the exact OZ revert strings and Approval-on-decrement behavior
  - transferFrom spends allowance before the ERC-1155 leg; allowance/approve read/write only ERC20ProxyStorage.layout()._allowances
  - npx hardhat compile exits 0
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: D-03 one-shot init + D-04 guards and warm-up smoke test</name>
  <files>contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol</files>
  <read_first>
  contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol lines 25-37 (initializeERC20Proxy to rework)
  contracts/erc20-gnus-proxy/ProxyDiamond.sol lines 24-33 (constructor resets InitializableStorage._initialized — the verified enabler for the facet-level initializer modifier)
  ../gnus-ai/node_modules/@gnus.ai/contracts-upgradeable-diamond/proxy/utils/Initializable.sol (revert string semantics; if the path differs at this repo's install, find it under node_modules/@gnus.ai/contracts-upgradeable-diamond)
  .planning/phases/01-erc-20-proxy-hardening/01-RESEARCH.md — Code Example 3 (init sketch) and PROXY-02 research row
  </read_first>
  <action>
  Rework initializeERC20Proxy in contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol. Add the initializer modifier to the modifier list keeping the file's existing modifier-before-visibility ordering: the signature closes as ) initializer onlyOwnerRole external { — the Initializable gate is now the one-shot lock (D-03); second calls revert with "Initializable: contract is already initialized" (package-defined string; ProxyDiamond.sol line 32 re-arms the gate in the constructor so the facet's first init passes).
  Insert the D-04 static guards at the top of the body with these exact facet-prefixed revert strings (planner-fixed so tests assert them verbatim): require(_erc1155Address != address(0), "ERC20Proxy: ERC1155 contract cannot be zero address"); require(_childTokenId != 0, "ERC20Proxy: child token ID cannot be zero"); require(bytes(_name).length > 0, "ERC20Proxy: name cannot be empty"); require(bytes(_symbol).length > 0, "ERC20Proxy: symbol cannot be empty").
  Then the D-04 functional smoke test BEFORE committing the remaining writes: assign l.erc1155Contract = ERC1155SupplyUpgradeable(_erc1155Address); and call l.erc1155Contract.totalSupply(_childTokenId); discarding the result — a live-contract/ABI proof (a dead EOA returns empty returndata and a wrong-ABI target reverts on the selector). Only after the warm-up succeeds, commit l.childTokenId, l.name, l.symbol. Any guard or warm-up failure reverts the whole transaction, so no partial state lands.
  Leave the existing body-level LibDiamond.enforceIsContractOwner() call (line 31) untouched — redundant with the modifier but harmless, and removing it is outside minimal-diff scope. Do NOT add an ERC-165 supportsInterface gate (explicitly rejected by D-04). Do not restyle unrelated syntax. Update the function NatSpec to document one-shot semantics and the guards.
  Commit scope: feat(hardening): one-shot guarded initialization per D-03/D-04.
  </action>
  <verify>
    <automated>grep -q "initializer onlyOwnerRole external" contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol && grep -c "ERC20Proxy: ERC1155 contract cannot be zero address" contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol && grep -c "ERC20Proxy: child token ID cannot be zero" contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol && grep -c "ERC20Proxy: name cannot be empty" contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol && grep -c "ERC20Proxy: symbol cannot be empty" contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol && grep -q "totalSupply(_childTokenId)" contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol && ! grep -q "supportsInterface" contracts/erc20-gnus-proxy/ERC20ProxyFacet.sol && npx hardhat compile</automated>
  </verify>
  <acceptance_criteria>
  - initializeERC20Proxy carries the initializer modifier (verified enabler: ProxyDiamond constructor reset)
  - All four static guards present with the exact revert strings above, ordered before the warm-up
  - The totalSupply(_childTokenId) warm-up executes before the childTokenId/name/symbol writes commit
  - No supportsInterface anywhere in the facet
  - npx hardhat compile exits 0
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| ERC-20 caller -> facet | Anyone can call approve/allowance/transferFrom; only the diamond owner can call init |
| facet -> GeniusDiamond (ERC-1155) | The facet makes external calls to the configured erc1155Contract (safeTransferFrom at transfer time, totalSupply at init time) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-1-04 | Elevation (allowance bypass via operator approval — the OLD vulnerability) | approve/allowance/transferFrom | mitigate | Structurally removed: no isApprovedForAll/setApprovalForAll anywhere in the facet (grep gate); allowance state is proxy-local and amount-specific (D-01) |
| T-1-02 | Elevation (re-init config hijack) | initializeERC20Proxy | mitigate | initializer modifier (D-03) + onlyOwnerRole; tested by the flipped unit test in Plan 04 |
| T-1-03 | Tampering (wrong/malicious ERC-1155 target at init) | initializeERC20Proxy | mitigate | D-04 static guards + totalSupply(uint256) warm-up before writes commit; ERC-165 rejected as gate (no interface ID for the ERC1155Supply extension; loupe false-negatives) |
| T-1-01 | Tampering/Elevation (SWC-114 approval race) | approve | accept | D-02 locked: industry-standard trade-off identical to OZ/USDC (direct overwrite, no USDT zero-first rule); documented acceptance — do NOT "fix" |
| T-1-06 | Tampering (storage collision on upgrade) | ERC20ProxyStorage.Layout | mitigate | Append-only field addition; keccak-derived slot constant unchanged; new mapping occupies fresh slots after the existing fields |
| T-1-12 | Tampering (infinite-allowance surprise) | _spendAllowance | mitigate | Mirror the reference exactly: type(uint256).max never decrements — the OZ-standard integrator expectation, tested in Plans 04/05 |
</threat_model>

<verification>
- npx hardhat compile after each task (all three tasks are compile-provable)
- Grep gates proving structural removal of the operator-approval path and presence of every guard string
- Behavioral proof is delegated to Plan 04 (unit) and Plan 05 (integration) per D-05 — this plan delivers the compiling hardened surface
</verification>

<success_criteria>
- All four D-01..D-04 decisions implemented exactly as locked (no semantic drift from the GNUSBridge reference)
- Facet compiles clean; no operator-plane calls on the ERC-20 path; init one-shot and guarded
- Revert strings fixed and documented so Plans 04/05 can assert them verbatim
</success_criteria>

<output>
Create .planning/phases/01-erc-20-proxy-hardening/01-03-SUMMARY.md when done
</output>
