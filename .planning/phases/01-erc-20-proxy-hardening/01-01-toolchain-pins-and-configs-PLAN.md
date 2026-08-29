---
phase: 01-erc-20-proxy-hardening
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - package.json
  - yarn.lock
  - hardhat.config.ts
  - scripts/utils/loadDiamondArtifact.ts
  - scripts/setup/LocalDiamondDeployer.ts
  - scripts/setup/RPCDiamondDeployer.ts
  - scripts/deploy/rpc/verify-rpc.ts
  - scripts/deploy/rpc/upgrade-rpc.ts
  - scripts/deploy/rpc/status-rpc.ts
  - test/unit/ERC20ProxyFacet.test.ts
  - test/integration/GNUSAiIntegration.test.ts
  - test/deployment/GeniusDiamondDeployment.test.ts
  - test/deployment/ProxyDiamondDeployment.test.ts
  - test/deployment/ProxyDiamondPostDeploymentComparison.test.ts
  - diamonds/GeniusDiamond/geniusdiamond.config.json
  - diamonds/ProxyDiamond/proxydiamond.config.json
  - contracts/gnus-ai (submodule gitlink)
  - diamonds/GeniusDiamond (submodule gitlink)
files_deleted:
  - diamonds/GeniusDiamond/callbacks/ERC1155ProxyOperator.ts
  - diamonds/GeniusDiamond/callbacks/GNUSControl.ts
  - diamonds/ProxyDiamond/callbacks/ERC20ProxyFacet.ts
autonomous: false
requirements: [enabler]
user_setup:
  - service: npm registry (@geniusventures scope)
    why: "Two org-internal packages carry slopcheck [SUS] flags; protocol requires human sign-off before install"
    dashboard_config:
      - task: "Review 01-RESEARCH.md Package Legitimacy Audit; confirm scope + versions against ../gnus-ai/package.json"
        location: "npmjs.com/package/@geniusventures/diamonds and npmjs.com/package/@geniusventures/hardhat-diamonds"

must_haves:
  truths:
    - "yarn install resolves @geniusventures/diamonds@1.3.4-gv, @geniusventures/hardhat-diamonds@1.1.15-gv.2, and @geniusventures/hardhat-multichain@1.1.0-gv from the public npm registry"
    - "yarn clean && yarn compile is green with Solidity 0.8.19 against nested pin 61b7ca4 (proxy ^0.8.2 + nested ^0.8.19 + package ^0.8.0 all compile under one version)"
    - "Diamond ABI/typechain generation succeeds for both diamonds against the 2.6 config with zero GeniusAI references"
    - "yarn.lock is tracked in git; cache_hardhat/, openzeppelin-contracts-diamond/, openzeppelin-transpiler/, sushi-list/, package-lock.json remain untracked"
    - "No file outside diamonds/*/callbacks/ imports the unscoped diamonds / hardhat-diamonds / hardhat-multichain package names"
  artifacts:
    - path: "package.json"
      provides: "Pinned @geniusventures framework deps replacing floating GitHub deps"
      contains: "@geniusventures/diamonds"
    - path: "yarn.lock"
      provides: "Reproducible install (currently untracked)"
    - path: "diamonds/GeniusDiamond/geniusdiamond.config.json"
      provides: "2.6 facet config (wholesale copy from ../gnus-ai)"
      contains: "GNUSTreasury_Initialize260"
  key_links:
    - from: "hardhat.config.ts"
      to: "@geniusventures/hardhat-diamonds"
      via: "plugin import (line 7)"
      pattern: "import \"@geniusventures/hardhat-diamonds\""
    - from: "diamonds/GeniusDiamond/geniusdiamond.config.json"
      to: "contracts/gnus-ai @ 61b7ca4"
      via: "every facet named in config has a compiled artifact"
      pattern: "yarn compile exit 0"
---

<objective>
Wave 0 enabler: swap the floating GitHub framework dependencies for the pinned @geniusventures npm pair (plus hardhat-multichain), bump the compiler to 0.8.19, bump both nested submodule pins to the research-verified CI-green pairing (contracts/gnus-ai 7c0b237 -> 61b7ca4, diamonds/GeniusDiamond ba68c67 -> dfebdf0), and replace the GeniusDiamond facet config with gnus-ai's 2.6 config (dropping all deploy callbacks).

Purpose: every later plan compiles and deploys against a current GeniusDiamond; nothing else in the phase can run until this tree compiles.
Output: reproducible install, compiling tree at 0.8.19, callback-free diamond configs, tracked yarn.lock.

Scope note: files_modified intentionally lists 18 paths — 13 of them are single-line mechanical import renames atomically coupled to the package.json dependency swap. Splitting the renames from the swap would create a broken-tree window (imports resolving to packages no longer declared), so the swap ships as one plan despite exceeding the 15-file threshold.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-erc-20-proxy-hardening/01-RESEARCH.md (Standard Stack, Package Legitimacy Audit, Pitfalls 2/7/8, Validation Architecture Wave 0 Gaps)
@.planning/phases/01-erc-20-proxy-hardening/01-PATTERNS.md (sections: hardhat.config.ts, package.json + yarn.lock, geniusdiamond.config.json, proxydiamond.config.json)
@.planning/PROJECT.md (Constraints: Solidity 0.8.19, branch conventions, multi-repo protocol)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Branch, dependency swaps, import renames, compiler bump</name>
  <files>package.json, hardhat.config.ts, scripts/utils/loadDiamondArtifact.ts, scripts/setup/LocalDiamondDeployer.ts, scripts/setup/RPCDiamondDeployer.ts, scripts/deploy/rpc/verify-rpc.ts, scripts/deploy/rpc/upgrade-rpc.ts, scripts/deploy/rpc/status-rpc.ts, test/unit/ERC20ProxyFacet.test.ts, test/integration/GNUSAiIntegration.test.ts, test/deployment/GeniusDiamondDeployment.test.ts, test/deployment/ProxyDiamondDeployment.test.ts, test/deployment/ProxyDiamondPostDeploymentComparison.test.ts</files>
  <read_first>
  package.json (devDependencies lines 108, 121, 123; keep line 78 "@gnus.ai/contracts-upgradeable-diamond": "=4.5.0" UNTOUCHED)
  hardhat.config.ts (imports lines 7 and 9; solidity block lines 98-106)
  .planning/phases/01-erc-20-proxy-hardening/01-PATTERNS.md — sections "hardhat.config.ts" and "package.json + yarn.lock"
  </read_first>
  <action>
  Create branch gsd/phase-1-erc-20-proxy-hardening from develop (never commit to main). In package.json replace exactly three entries: "diamonds": "https://github.com/GeniusVentures/diamonds.git#develop" becomes "@geniusventures/diamonds": "1.3.4-gv"; "hardhat-diamonds": "https://github.com/GeniusVentures/hardhat-diamonds.git#develop" becomes "@geniusventures/hardhat-diamonds": "1.1.15-gv.2"; "hardhat-multichain": "https://github.com/GeniusVentures/hardhat-multichain#main" becomes "@geniusventures/hardhat-multichain": "1.1.0-gv" (per PATTERNS attention flag — the floating multichain dep imports break otherwise). Exact pins, no caret. Keep @gnus.ai/contracts-upgradeable-diamond at "=4.5.0" per D-locked research (do NOT bump to 4.9.1).
  Then rename imports mechanically across exactly these sites (verified inventory): hardhat.config.ts lines 7 and 9 (import "@geniusventures/hardhat-diamonds"; import "@geniusventures/hardhat-multichain"); scripts/utils/loadDiamondArtifact.ts line 1; scripts/setup/LocalDiamondDeployer.ts lines 14 and 16; scripts/setup/RPCDiamondDeployer.ts lines 13, 18, 19; scripts/deploy/rpc/verify-rpc.ts line 9; scripts/deploy/rpc/upgrade-rpc.ts line 9; scripts/deploy/rpc/status-rpc.ts line 8; test/unit/ERC20ProxyFacet.test.ts lines 5 and 7; test/integration/GNUSAiIntegration.test.ts lines 5 and 8; test/deployment/GeniusDiamondDeployment.test.ts lines 9 and 15; test/deployment/ProxyDiamondDeployment.test.ts lines 9 and 15; test/deployment/ProxyDiamondPostDeploymentComparison.test.ts lines 15 and 17. The bare names "diamonds", "hardhat-diamonds", "hardhat-multichain" become "@geniusventures/diamonds", "@geniusventures/hardhat-diamonds", "@geniusventures/hardhat-multichain".
  DO NOT rename imports in diamonds/*/callbacks/* (all three files are deleted in Task 3) or test-assets/** (stale RPC-fixture trees — explicitly out of scope this phase, recorded as non-work). Do not touch diamonds/GeniusDiamond/geniusdiamond-sepolia-v2.5-step1.config.json (historical sepolia artifact).
  In hardhat.config.ts change solidity.version from "0.8.9" to "0.8.19" (lines 98-99). Optimizer stays enabled with 1000 runs — it already mirrors gnus-ai. Nothing else in the config changes in this task (extendEnvironment wiring is Plan 02 Task 1).
  Do not run yarn install yet — the blocking checkpoint gates it.
  </action>
  <verify>
    <automated>! grep -rn 'from "diamonds"\|from "hardhat-diamonds"\|from "hardhat-multichain"\|import "hardhat-diamonds"\|import "hardhat-multichain"' hardhat.config.ts scripts/ test/ && grep -c '"@geniusventures/diamonds": "1.3.4-gv"' package.json && grep -c '"@geniusventures/hardhat-diamonds": "1.1.15-gv.2"' package.json && grep -c '"@geniusventures/hardhat-multichain": "1.1.0-gv"' package.json && grep -c '"=4.5.0"' package.json && grep -n 'version: "0.8.19"' hardhat.config.ts && git branch --show-current | grep -x "gsd/phase-1-erc-20-proxy-hardening"</automated>
  </verify>
  <acceptance_criteria>
  - Branch gsd/phase-1-erc-20-proxy-hardening exists and is checked out
  - Zero grep hits for unscoped diamonds/hardhat-diamonds/hardhat-multichain imports under hardhat.config.ts, scripts/, test/
  - package.json contains the three exact @geniusventures pins and still pins @gnus.ai/contracts-upgradeable-diamond at "=4.5.0"
  - hardhat.config.ts solidity.version is "0.8.19" with optimizer enabled, runs 1000
  - diamonds/*/callbacks/* and test-assets/** are untouched by this task
  </acceptance_criteria>
</task>

<task type="checkpoint:human-verify" gate="blocking-human">
  <what-built>package.json now declares @geniusventures/diamonds@1.3.4-gv, @geniusventures/hardhat-diamonds@1.1.15-gv.2, and @geniusventures/hardhat-multichain@1.1.0-gv in place of floating GitHub deps. Nothing has been installed yet — this checkpoint gates the install per the Package Legitimacy Audit (both diamond packages carry slopcheck [SUS] verdicts: 12 days old, 614/377 weekly downloads).</what-built>
  <how-to-verify>
  1. Read the "Package Legitimacy Audit" section of .planning/phases/01-erc-20-proxy-hardening/01-RESEARCH.md.
  2. Confirm provenance: both packages publish from github.com/GeniusVentures/diamonds and github.com/GeniusVentures/hardhat-diamonds — the same sources this repo already consumed via git URLs; the exact versions are pinned by gnus-ai develop whose CI (tests + security-audit) is green on this pairing as of 2026-08-28.
  3. Spot-check the registry: npmjs.com/package/@geniusventures/diamonds (version 1.3.4-gv) and npmjs.com/package/@geniusventures/hardhat-diamonds (version 1.1.15-gv.2). The third swap, @geniusventures/hardhat-multichain@1.1.0-gv, is same-scope — give it a glance in the same pass.
  4. Confirm no postinstall scripts: the audit verified scripts.postinstall is absent on both packages.
  5. On approval, execution proceeds to Task 3 (yarn install).
  </how-to-verify>
  <resume-signal>Type "approved" to proceed with the install, or describe concerns to halt</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Install, submodule pin bumps, 2.6 config replacement, callbacks drop, compile proof</name>
  <files>yarn.lock, diamonds/GeniusDiamond/geniusdiamond.config.json, diamonds/ProxyDiamond/proxydiamond.config.json, contracts/gnus-ai (gitlink), diamonds/GeniusDiamond (gitlink)</files>
  <read_first>
  ../gnus-ai/diamonds/GeniusDiamond/geniusdiamond.config.json (the 2.6 replacement source — copy wholesale)
  diamonds/ProxyDiamond/proxydiamond.config.json (callbacks block to remove, lines 16-25 region)
  .planning/phases/01-erc-20-proxy-hardening/01-RESEARCH.md — Pitfall 3 (self-pointing callback), State of the Art (GeniusAI removed at new pin)
  </read_first>
  <action>
  Run yarn install. Stage yarn.lock with git add yarn.lock (it is currently untracked — this closes the reproducibility gap, Pitfall 7).
  Bump the nested submodules: git -C contracts/gnus-ai fetch origin then git -C contracts/gnus-ai checkout 61b7ca4; git -C diamonds/GeniusDiamond fetch origin then git -C diamonds/GeniusDiamond checkout dfebdf0. Stage both gitlinks with git add contracts/gnus-ai diamonds/GeniusDiamond. Verify ancestry is what research claims (61b7ca4 descends from d731384) only if the checkout errors.
  Replace diamonds/GeniusDiamond/geniusdiamond.config.json with the wholesale copy of ../gnus-ai/diamonds/GeniusDiamond/geniusdiamond.config.json — do not patch the 2.5 file; GeniusAI is deleted at the new pin so patching is not viable. Delete diamonds/GeniusDiamond/callbacks/ entirely (ERC1155ProxyOperator.ts, GNUSControl.ts — the 2.6 config declares zero callbacks and those files import the nonexistent @gnus.ai/diamonds package). Delete diamonds/ProxyDiamond/callbacks/ERC20ProxyFacet.ts (createXMPLToken encodes the self-pointing init that D-04's warm-up call reverts on) and remove the callbacks array from the ERC20ProxyFacet "0.0" version entry in diamonds/ProxyDiamond/proxydiamond.config.json so the entry reads versions "0.0" with an empty object; leave protocolVersion, priorities, and the DiamondCutFacet/DiamondLoupeFacet entries untouched.
  Then prove the tree: yarn clean && yarn compile must exit 0. This runs hardhat compile (all nested contracts at ^0.8.19 under the single 0.8.19 config), then diamond:generate-proxy-abi-typechain and diamond:generate-gnus-abi-typechain against the new configs. If compilation fails with a pragma error, re-check the 0.8.19 config edit; if ABI generation fails on a missing facet artifact, re-check the 2.6 copy is byte-identical to the gnus-ai source.
  NEVER git add cache_hardhat/, openzeppelin-contracts-diamond/, openzeppelin-transpiler/, sushi-list/, package-lock.json, coverage/, coverage.json — untracked local artifacts that stay untracked. Commit message scope: chore(hardening): pin toolchain and bump nested submodules.
  </action>
  <verify>
    <automated>git -C contracts/gnus-ai rev-parse --short=7 HEAD | grep -x 61b7ca4 && git -C diamonds/GeniusDiamond rev-parse --short HEAD | grep -x dfebdf0 && grep -c "GNUSTreasury_Initialize260" diamonds/GeniusDiamond/geniusdiamond.config.json && ! grep -rq "GeniusAI" diamonds/GeniusDiamond/geniusdiamond.config.json && ! grep -q "callbacks" diamonds/ProxyDiamond/proxydiamond.config.json && test ! -f diamonds/ProxyDiamond/callbacks/ERC20ProxyFacet.ts && test ! -f diamonds/GeniusDiamond/callbacks/ERC1155ProxyOperator.ts && git ls-files --error-unmatch yarn.lock && yarn clean && yarn compile</automated>
  </verify>
  <acceptance_criteria>
  - contracts/gnus-ai HEAD is exactly 61b7ca4; diamonds/GeniusDiamond HEAD is exactly dfebdf0; both gitlinks staged in this repo
  - diamonds/GeniusDiamond/geniusdiamond.config.json is the 2.6 config (contains GNUSTreasury_Initialize260, zero GeniusAI references, zero callback keys); both callbacks directories no longer contain the three listed files
  - diamonds/ProxyDiamond/proxydiamond.config.json has no callbacks key anywhere
  - yarn.lock is tracked by git; yarn clean && yarn compile exits 0 (compilation + both diamond ABI/typechain generations)
  - Untracked local artifacts (cache_hardhat/, openzeppelin-*, sushi-list/, package-lock.json) are absent from the git index
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| npm registry -> node_modules | Third-party-origin packages enter the build; two are org-internal but young/low-download ([SUS]) |
| git remotes -> submodule working trees | Nested contract source changes wholesale at the new pins (the code that will be tested and shaped) |
| hardhat config -> compiler | Compiler version determines which pragma-gated contract semantics apply |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-1-05 | Tampering/Elevation (supply chain) | @geniusventures/diamonds@1.3.4-gv, @geniusventures/hardhat-diamonds@1.1.15-gv.2 installs | mitigate | Blocking checkpoint:human-verify (Task 2) before install per Package Legitimacy Audit; exact version pins (no ranges); registry provenance cross-checked against gnus-ai's CI-green package.json |
| T-1-07 | Tampering (reproducibility) | Floating GitHub #develop deps + untracked yarn.lock | mitigate | Replace floats with pinned npm versions; commit yarn.lock (Pitfall 7); yarn clean before compile proof |
| T-1-08 | Tampering | Submodule pin drift (nested pins move independently of this repo) | mitigate | Pin exact commits 61b7ca4 / dfebdf0 (verified gitlinks of gnus-ai develop, CI-green 2026-08-28); stage gitlinks in this repo; outer TokenContracts pin-bump recorded as follow-through |
| T-1-09 | Denial of Service | Dead config references (GeniusAI deleted at new pin) breaking deploys | mitigate | Wholesale 2.6 config replacement + callback deletion verified by grep gates and the compile+ABI-generation run |
</threat_model>

<verification>
- yarn clean && yarn compile exits 0 — proves 0.8.19 single-compiler build over proxy + nested 61b7ca4 tree + @gnus.ai package, and both diamond ABI generations against the 2.6 config
- git submodule state shows 61b7ca4 / dfebdf0 with no drift markers
- git status shows yarn.lock tracked and none of the forbidden artifacts staged
</verification>

<success_criteria>
- Reproducible install (pinned deps + committed lockfile)
- Tree compiles green at 0.8.19 on the bumped pins before any facet edit (VALIDATION Wave 0 requirement)
- Diamond configs are callback-free and GeniusAI-free
- Human sign-off on the [SUS] package installs is recorded before installation
</success_criteria>

<output>
Create .planning/phases/01-erc-20-proxy-hardening/01-01-SUMMARY.md when done
</output>
