---
phase: 01-erc-20-proxy-hardening
plan: 02
type: execute
wave: 1
depends_on: ["01-01"]
files_modified:
  - scripts/utils/GNUSLifecyclePolicyLinking.ts
  - hardhat.config.ts
  - test/deployment/GeniusDiamondDeployment.test.ts
autonomous: true
requirements: [enabler]

must_haves:
  truths:
    - "A local GeniusDiamond deploys from the 2.6 config at pin 61b7ca4 without UNLINKED_LIBRARY errors (lifecycle library linked automatically)"
    - "The linking harness never imports 'hardhat' at module top level (config-load safe)"
    - "Exactly one LocalDiamondDeployer implementation is used by the suite (local copy or framework-shipped — never both)"
  artifacts:
    - path: "scripts/utils/GNUSLifecyclePolicyLinking.ts"
      provides: "deploy-and-link + getContractFactory monkey-patch harness (five exports)"
      contains: "LIBRARY_FQN"
    - path: "test/deployment/GeniusDiamondDeployment.test.ts"
      provides: "2.6-config deployment validation suite"
      contains: "setupLifecyclePolicyLinking"
  key_links:
    - from: "hardhat.config.ts"
      to: "scripts/utils/GNUSLifecyclePolicyLinking.ts"
      via: "extendEnvironment(installLazyLifecyclePolicyLinker)"
      pattern: "installLazyLifecyclePolicyLinker"
    - from: "test/deployment/GeniusDiamondDeployment.test.ts before()"
      to: "LocalDiamondDeployer"
      via: "setupLifecyclePolicyLinking() called BEFORE getInstance"
      pattern: "setupLifecyclePolicyLinking"
---

<objective>
Port gnus-ai's GNUSLifecyclePolicy library-linking harness (mandatory at pin 61b7ca4 — GNUSNFTFactory/GNUSBridge/ERC20TransferBatch compile-time-link GNUSLifecyclePolicy and the diamonds framework never passes a libraries option) and prove a local GeniusDiamond deploys from the 2.6 config.

Purpose: every GeniusDiamond-deploying suite (DEXFlow, integration rework) depends on this harness; Pitfall 1 makes it mandatory even for a minimal facet subset.
Output: ported linking utility wired into hardhat.config.ts, green GeniusDiamondDeployment suite, resolved A3 deployer decision.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-erc-20-proxy-hardening/01-RESEARCH.md (Pattern 3, Pitfall 1, Pitfall 8, Open Question 1/A3)
@.planning/phases/01-erc-20-proxy-hardening/01-PATTERNS.md (sections: GNUSLifecyclePolicyLinking.ts, test/deployment/*, Shared Patterns "Lifecycle library linking" and "Deployment scaffold")
@.planning/phases/01-erc-20-proxy-hardening/01-01-toolchain-pins-and-configs-PLAN.md (SUMMARY of plan 01, once written — the 2.6 config and pins this plan validates)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Port GNUSLifecyclePolicyLinking.ts and wire the lazy installer</name>
  <files>scripts/utils/GNUSLifecyclePolicyLinking.ts, hardhat.config.ts</files>
  <read_first>
  ../gnus-ai/scripts/utils/GNUSLifecyclePolicyLinking.ts (249 lines — read in full; the port source)
  hardhat.config.ts (import block lines 1-11; place wiring after imports, before the task definition at line 86)
  .prettierrc.json (this repo's double-quote / 2-space style for the reformat)
  </read_first>
  <action>
  Create scripts/utils/GNUSLifecyclePolicyLinking.ts as a port of ../gnus-ai/scripts/utils/GNUSLifecyclePolicyLinking.ts. Port the logic verbatim with these exact constraints: keep the module-header comment block explaining WHY the monkey-patch exists (hardhat-ethers collectLibrariesAndLink ignores pre-linked bytecode; the diamonds framework calls getContractFactory(name, {signer}) with no libraries option) — trim gnus-ai's phase-number references (13-04/13-05/13-06) from the provenance comments. Keep the string constant LIBRARY_FQN exactly "contracts/gnus-ai/GNUSLifecyclePolicy.sol:GNUSLifecyclePolicy" — it must match the nested submodule artifact path at 61b7ca4. The module MUST NOT contain any top-level import from "hardhat" (LIB_IMPORTED_FROM_THE_CONFIG guard); runtime HRE access only via the lazy pattern or an explicit hre parameter, exactly as the source does. Keep the per-network library-address cache (single module-level state shared by both installers). Preserve all five exports with identical names and signatures: deployAndLinkLifecyclePolicy, deployAndLinkLifecyclePolicyWithSigner, installLifecyclePolicyLinker, installLazyLifecyclePolicyLinker, setupLifecyclePolicyLinking. Reformat to this repo's style (double quotes, 2-space indent) — the port keeps logic, adopts local style.
  Wire it in hardhat.config.ts: merge extendEnvironment into the existing import from "hardhat/config" (line 10 already imports HardhatUserConfig and task), add the import of installLazyLifecyclePolicyLinker from "./scripts/utils/GNUSLifecyclePolicyLinking", and register extendEnvironment((hre) => { installLazyLifecyclePolicyLinker(hre); }) after the import/dotenv block and before the first task definition — matching gnus-ai's placement. Change nothing else in the config.
  Verify with yarn compile — loading the config executes the extendEnvironment registration (lazy: no deployment happens at compile time) and proves config-load safety.
  </action>
  <verify>
    <automated>grep -c "export" scripts/utils/GNUSLifecyclePolicyLinking.ts && ! grep -q 'from "hardhat"' scripts/utils/GNUSLifecyclePolicyLinking.ts && ! grep -q "require(\"hardhat\")" scripts/utils/GNUSLifecyclePolicyLinking.ts && grep -c "contracts/gnus-ai/GNUSLifecyclePolicy.sol:GNUSLifecyclePolicy" scripts/utils/GNUSLifecyclePolicyLinking.ts && grep -c "installLazyLifecyclePolicyLinker" hardhat.config.ts && grep -c "extendEnvironment" hardhat.config.ts && yarn compile</automated>
  </verify>
  <acceptance_criteria>
  - scripts/utils/GNUSLifecyclePolicyLinking.ts exists with all five named exports and the exact LIBRARY_FQN string
  - Zero top-level hardhat imports/requires in the module (config-load safe)
  - hardhat.config.ts registers the lazy linker via extendEnvironment and still compiles/loads (yarn compile exit 0)
  - File is formatted per repo style (prettier clean on commit via lint-staged)
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: GeniusDiamond deployment suite on the 2.6 config + A3 deployer decision</name>
  <files>test/deployment/GeniusDiamondDeployment.test.ts</files>
  <read_first>
  test/deployment/GeniusDiamondDeployment.test.ts (full — scaffold survives; assertions on facet lists/counts/init functions shift)
  ../gnus-ai/test/unit/ERC1155ProxyOperator.test.ts lines 1-74 (the framework deployer + linking + role-grant pattern at the new pin)
  scripts/setup/LocalDiamondDeployer.ts lines 86-150 (the local getInstance(config) signature — the A3 first choice)
  diamonds/GeniusDiamond/geniusdiamond.config.json (the 2.6 config this suite now consumes — facet names, priorities, deployInit functions)
  </read_first>
  <action>
  Rework test/deployment/GeniusDiamondDeployment.test.ts to deploy from the 2.6 config at the new pin. Add "import { setupLifecyclePolicyLinking } from "../../scripts/utils/GNUSLifecyclePolicyLinking";" and call await setupLifecyclePolicyLinking() as the FIRST statement of the before() hook, BEFORE LocalDiamondDeployer.getInstance(...) — without it GNUSNFTFactory's library link throws (Pitfall 1).
  A3 decision (planner-resolved policy, execute it): try the LOCAL deployer first — keep the existing import from "../../scripts/setup/LocalDiamondDeployer" and its getInstance(config) call shape (smallest diff). If and only if the suite fails because the local copy cannot pass the 2.6 config keys through or its @geniusventures/diamonds imports no longer resolve at 1.3.4-gv (runtime undefined exports such as cutKey, or config keys silently dropped), migrate THIS suite's import to the framework-shipped deployer from "@geniusventures/hardhat-diamonds/dist/utils" with the getInstance(hre, { diamondName, network }) signature as gnus-ai's tests use. Ship exactly one deployer implementation across the suite — never both. Record the outcome (local copy kept, or migrated, and the failure signature that forced migration) in the plan SUMMARY; if migrated, note that Plans 04/05/06 fixtures must follow the same import.
  Update the assertions the 2.6 config changes: facet name lists and counts (GeniusAI is gone; GNUSBridgeAttestor, GNUSTreasury, GNUSRedeemAdapter, GNUSLifecycle, GNUSLifecycleMint, GNUSLicensing, GNUSLicensingPurchase are new; priorities shifted per the config), and init-function expectations (GNUSNFTFactory_Initialize230, GNUSTreasury_Initialize260, diamondInitialize250). Keep the config-vs-deployed comparison logic pattern — it is exactly what validates the 2.6 replacement. Do not add new describes beyond what assertion alignment requires.
  Commit scope: test(hardening): geniusdiamond deployment suite on 2.6 config.
  </action>
  <verify>
    <automated>grep -c "setupLifecyclePolicyLinking" test/deployment/GeniusDiamondDeployment.test.ts && npx hardhat test test/deployment/GeniusDiamondDeployment.test.ts</automated>
  </verify>
  <acceptance_criteria>
  - Suite passes green against the 2.6 config at pin 61b7ca4
  - No UNLINKED_LIBRARY / linkReferences error anywhere in the run output
  - setupLifecyclePolicyLinking() is called before LocalDiamondDeployer.getInstance in before()
  - Exactly one deployer implementation is imported (local copy or framework — grep shows no suite importing both)
  - SUMMARY records the A3 outcome and, if migrated, the failure signature observed
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| test harness -> nested gnus-ai contracts | The suite deploys and exercises third-party (nested submodule) contract code locally |
| monkey-patched getContractFactory -> ethers | A factory interceptor redirects library linking — a build-integrity-critical hook |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-1-05 | Tampering (build integrity) | Library linking monkey-patch | mitigate | Port the gnus-ai harness verbatim (logic) — the CI-proven implementation; LIBRARY_FQN must match the artifact path exactly (grep gate); wrong FQN silently skips linking and surfaces as UNLINKED_LIBRARY at deploy, caught by the suite |
| T-1-10 | Denial of Service | 2.6 config drift vs deployed facets | mitigate | Keep the config-vs-deployed comparison assertions — the suite's core purpose is detecting exactly this drift |
| T-1-11 | Tampering | Config-load order (top-level hardhat import) | mitigate | Grep gate: no top-level hardhat import in the ported module (LIB_IMPORTED_FROM_THE_CONFIG would break every hardhat invocation) |
</threat_model>

<verification>
- npx hardhat test test/deployment/GeniusDiamondDeployment.test.ts green — the VALIDATION row proving library-linked facets deploy locally
- yarn compile green after the hardhat.config.ts wiring change
</verification>

<success_criteria>
- Lifecycle harness ported and wired; every later GeniusDiamond-deploying suite can call setupLifecyclePolicyLinking()
- A3 open question closed with one deployer implementation shipped
- Deployment suite validates the 2.6 config against the actually-deployed diamond
</success_criteria>

<output>
Create .planning/phases/01-erc-20-proxy-hardening/01-02-SUMMARY.md when done (must record the A3 deployer decision)
</output>
