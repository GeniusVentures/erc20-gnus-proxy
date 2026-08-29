---
phase: 01-erc-20-proxy-hardening
plan: 01
subsystem: infra
tags: [solidity-0.8.19, hardhat, yarn, "@geniusventures/diamonds", diamond-proxy, submodules, npm-pins]

# Dependency graph
requires: []
provides:
  - "Pinned @geniusventures framework deps (diamonds 1.3.4-gv, hardhat-diamonds 1.1.15-gv.2, hardhat-multichain 1.1.0-gv) with committed yarn.lock"
  - "Compiling tree at Solidity 0.8.19 against nested pins contracts/gnus-ai@61b7ca4 + diamonds/GeniusDiamond@dfebdf0"
  - "2.6 GeniusDiamond facet config (zero GeniusAI, zero callbacks) + callback-free proxydiamond.config.json"
  - "Working diamond ABI/typechain generation for both diamonds (GeniusDiamond: 19 facets / 116 functions)"
affects: [01-02-deployment-harness, 01-03-erc20-allowances, 01-04-init-guards, 01-05-dexflow-integration, 01-06-regression, all Phase 1 plans]

# Tech tracking
tech-stack:
  added:
    - "@geniusventures/diamonds@1.3.4-gv (npm pin, replaces GitHub #develop float)"
    - "@geniusventures/hardhat-diamonds@1.1.15-gv.2 (npm pin, replaces GitHub #develop float)"
    - "@geniusventures/hardhat-multichain@1.1.0-gv (npm pin, replaces GitHub #main float)"
  patterns:
    - "Exact version pins (no carets) mirroring gnus-ai develop's CI-green pairing"
    - "Wholesale config delivery via submodule gitlink bump (dfebdf0 ships the 2.6 config)"
    - "Glob-free clean script (rm -rf <dirs>) — globbed contents abort on an unbuilt tree"

key-files:
  created: []
  modified:
    - package.json
    - yarn.lock
    - hardhat.config.ts
    - diamonds/ProxyDiamond/proxydiamond.config.json
    - contracts/gnus-ai (gitlink 61b7ca4)
    - diamonds/GeniusDiamond (gitlink dfebdf0)
    - "scripts/utils/loadDiamondArtifact.ts + 2 setup + 3 rpc deploy scripts (import renames)"
    - "5 test files (import renames)"

key-decisions:
  - "Blocked installs honored: user approved the three [SUS]-flagged @geniusventures packages before yarn install ran"
  - "GeniusDiamond 2.6 config + callbacks removal delivered by the dfebdf0 gitlink itself — byte-identical to ../gnus-ai source, no parent-repo copy needed"
  - "Clean script de-globbed (Rule 3) to unblock clean-compile on an unbuilt tree and the husky pre-commit hook"
  - "@gnus.ai/contracts-upgradeable-diamond stays at =4.5.0 per D-locked research"

patterns-established:
  - "Pinned-exact-version org deps over floating GitHub protocol (reproducible installs, no SSH requirement)"
  - "rm -rf on directory names (never globbed contents) for clean scripts in this repo"

requirements-completed: [enabler]

# Metrics
duration: 8min (Task 3 continuation session; Task 1 executed in a prior session)
completed: 2026-08-29
---

# Phase 1 Plan 1: Toolchain Pins and Configs Summary

**Pinned @geniusventures npm toolchain (3 packages), Solidity 0.8.19, and nested submodule pins 61b7ca4/dfebdf0 with a callback-free 2.6 diamond config — proven by a green `yarn clean && yarn compile` (19-facet GeniusDiamond ABI) and a committed yarn.lock.**

## Performance

- **Duration:** ~8 min (Task 3 continuation; Task 1 ran in the prior session that stopped at the install checkpoint)
- **Started:** 2026-08-29T20:25:09Z (continuation session)
- **Completed:** 2026-08-29T20:33:14Z
- **Tasks:** 3 (2 auto + 1 approved checkpoint)
- **Files modified:** 18 paths + 3 callback files removed (2 of the deletions delivered inside the submodule pin)

## Accomplishments
- Replaced floating GitHub-protocol framework deps with the exact @geniusventures npm pins gnus-ai develop CI-proves; yarn.lock regenerated and committed (reproducibility gap closed, Pitfall 7)
- Bumped nested pins: contracts/gnus-ai 7c0b237 → 61b7ca4 and diamonds/GeniusDiamond ba68c67 → dfebdf0, both staged as gitlinks
- GeniusDiamond facet config is now the 2.6 config (GNUSTreasury_Initialize260 present, zero GeniusAI references, zero callbacks); ProxyDiamond config has no callbacks key and the self-pointing ERC20ProxyFacet callback file is deleted (Pitfall 3 root removed)
- Compile proof: `yarn clean && yarn compile` exit 0 — full nested tree at 0.8.19, both diamond ABI/typechain generations green (GeniusDiamond: 116 functions / 42 events / 3 errors / 19 facets; ProxyDiamond ABI 10.8 KB)

## Task Commits

Each task was committed atomically:

1. **Task 1: Branch, dependency swaps, import renames, compiler bump** - `d481848` (chore)
2. **Task 2: Package legitimacy checkpoint** - approved by user (no commit; gate record below)
3. **Task 3: Install, submodule pin bumps, 2.6 config replacement, callbacks drop, compile proof** - `15b0104` (chore)

**Plan metadata:** (recorded by this summary commit)

## Checkpoint Approval Record (Task 2)

Task 2 was a `checkpoint:human-verify` with `gate="blocking-human"` gating `yarn install` of the two slopcheck [SUS]-flagged packages (threat T-1-05). The user reviewed the Package Legitimacy Audit and responded **"approved"**, authorizing installs of `@geniusventures/diamonds@1.3.4-gv`, `@geniusventures/hardhat-diamonds@1.1.15-gv.2`, and `@geniusventures/hardhat-multichain@1.1.0-gv`. Install then proceeded in Task 3 with no substitution or retry of package names. Human sign-off on the [SUS] installs is therefore recorded before installation, as the plan's success criteria required.

## Files Created/Modified
- `package.json` - three @geniusventures exact pins (Task 1); glob-free clean script (Task 3, Rule 3)
- `yarn.lock` - regenerated with the pinned npm resolution (GitHub c84b230 floats dropped), committed
- `hardhat.config.ts` - scoped plugin imports; solidity.version 0.8.19 (optimizer unchanged: enabled, 1000 runs)
- `diamonds/ProxyDiamond/proxydiamond.config.json` - ERC20ProxyFacet versions["0.0"] is now an empty object; no callbacks key anywhere
- `contracts/gnus-ai` - gitlink 61b7ca4
- `diamonds/GeniusDiamond` - gitlink dfebdf0 (ships the 2.6 geniusdiamond.config.json and removes its callbacks/)
- `diamonds/ProxyDiamond/callbacks/ERC20ProxyFacet.ts` - deleted
- 11 script/test files - mechanical `@geniusventures/*` import renames (Task 1)

## Decisions Made
- Kept `@gnus.ai/contracts-upgradeable-diamond` at `=4.5.0` (D-locked research; explicitly not bumped to 4.9.1)
- Accepted the submodule-topology reality (see Deviation 2) rather than forcing parent-repo copies of files that live inside the GeniusDiamond submodule
- Fixed the clean script at the root cause instead of seeding sentinel files or bypassing hooks

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Clean script glob aborts on an unbuilt tree**
- **Found during:** Task 3 (compile proof)
- **Issue:** `yarn clean` runs `rm -rf artifacts/* cache/* ...`; the shell yarn uses to execute scripts hard-fails with `No matches found` when any glob has zero matches, so clean (and the husky pre-commit `clean-compile` hook) can never run on a tree that has not been built at least once
- **Fix:** De-globbed the script to `rm -rf artifacts cache diamond-abi typechain-types diamond-typechain-types` — the exact pattern this repo's own `diamonds-clean` script already uses; `rm -rf` on absent paths exits 0 in every shell and hardhat/typechain recreate the dirs
- **Files modified:** package.json (line 9)
- **Verification:** `yarn clean && yarn compile` exit 0 (run three times, including inside the pre-commit hook of the Task 3 commit)
- **Committed in:** 15b0104 (part of Task 3 commit)

---

### Plan-vs-reality facts (pre-flagged by prior session)

**2. yarn.lock was already tracked in this repo**
- The plan (and Pitfall 7) described yarn.lock as untracked; that applied to the parent TokenContracts repo. Task 3 still regenerated it with the new pins and committed it — same end state, no surgery needed.

**3. GeniusDiamond config + callbacks live inside the submodule, not this repo**
- The plan's files_modified/files_deleted listed `diamonds/GeniusDiamond/geniusdiamond.config.json` and the two GeniusDiamond callback files as repo files. In fact `diamonds/GeniusDiamond` is entirely a submodule gitlink; those paths are inside its tree. The dfebdf0 pin bump delivers both changes: its committed config is byte-identical to `../gnus-ai`'s 2.6 source (verified with cmp/diff), and its tree contains zero callback files (checkout removed `diamonds/GeniusDiamond/callbacks/` from disk). All plan verification gates pass unchanged; the "wholesale copy" step was a no-op cp of identical bytes.

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking) + 2 plan-assumption corrections (no code impact)
**Impact on plan:** All end-state acceptance criteria met exactly; the Rule 3 fix was required for the verify gate and the hooks-enabled commit. No scope creep.

## Issues Encountered
- `yarn install` reported YN0086 peer-dependency warnings (pre-existing dependency-set property; install and all builds green) — no action needed for this plan
- The ABI generator logs `Facet callbacks path "diamonds/GeniusDiamond/callbacks" does not exist` as a Warning — expected post-deletion state, generation succeeds

## Deferred Issues (out of scope, discovered during execution)
- `typechain-types/` is not gitignored while its sibling build outputs (artifacts/, diamond-abi/, diamond-typechain-types/) are — fresh clones will show it as untracked noise; left untouched
- `.yarn/install-state.gz` is tracked in git and now shows modified after installs — machine-specific state probably should not be tracked; left unstaged, untouched
- `test-assets/**` still contains unscoped `diamonds`/`hardhat-diamonds` imports (explicitly declared non-work for this phase by the plan)

## User Setup Required
None remaining - the npm-registry gate (Task 2) was approved and consumed during install.

## Known Stubs
None - no stubbed or placeholder code in this plan's changes.

## Next Phase Readiness
- Wave 0 enabler complete: every later Phase 1 plan compiles and deploys against the pinned, CI-green toolchain
- Deployment-harness rework (Plan 02) can proceed immediately: lifecycle-policy linking (Pitfall 1) and the LocalDiamondDeployer signature question (A3) are the first items it will hit
- Unit tests are expected to fail as-shipped until Plans 02-04 land (the callback that initialized the ProxyDiamond fixture is gone by design — Pitfall 3/4); this is the planned state, not a regression

## Self-Check: PASSED

- Commit d481848 (Task 1) found on gsd/phase-1-erc-20-proxy-hardening
- Commit 15b0104 (Task 3) found on gsd/phase-1-erc-20-proxy-hardening
- Submodule HEADs verified: contracts/gnus-ai = 61b7ca4, diamonds/GeniusDiamond = dfebdf0
- yarn.lock tracked (git ls-files), compile gate green

---
*Phase: 01-erc-20-proxy-hardening*
*Completed: 2026-08-29*
