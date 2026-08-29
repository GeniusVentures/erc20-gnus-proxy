/**
 * GNUSLifecyclePolicy library linking harness.
 *
 * Ported from the gnus-ai repo (scripts/utils/GNUSLifecyclePolicyLinking.ts — the
 * CI-proven implementation) and reformatted to this repo's style; provenance notes
 * referencing the original repo's phase/review tracking were trimmed. The logic is
 * unchanged.
 *
 * GNUSLifecyclePolicy is a compile-time-linked Solidity `library` with `public`
 * functions: every facet that calls it (GNUSNFTFactory, and the GNUSERC1155MaxSupply
 * base surface inherited by GNUSLifecycleMint / GNUSLifecycle / GNUSRedeemAdapter /
 * GNUSBridge / GNUSTreasury / ERC20TransferBatch) carries a DELEGATECALL stub to the
 * library's fixed pure-code address. The library is NOT a diamond facet and is NOT
 * registered in geniusdiamond.config.json.
 *
 * The GeniusVentures diamonds deployment framework creates facet factories via
 * `ethers.getContractFactory(name, { signer })` with NO `libraries` wiring, and
 * hardhat-ethers `collectLibrariesAndLink` REQUIRES the `libraries` option whenever an
 * artifact declares `linkReferences` — it does NOT honor manually pre-linked artifact
 * bytecode. So a facet that links GNUSLifecyclePolicy cannot deploy through the
 * unmodified framework.
 *
 * This helper resolves that OUTSIDE the framework, in the test/deployment harness:
 *
 *   1. `deployAndLinkLifecyclePolicy()` deploys the GNUSLifecyclePolicy pure-code
 *      contract once per process (idempotent) and returns its address.
 *   2. `installLifecyclePolicyLinker(libraryAddress)` monkey-patches
 *      `ethers.getContractFactory` so that any contract whose artifact declares a link
 *      reference to GNUSLifecyclePolicy is created with
 *      `libraries: { "contracts/gnus-ai/GNUSLifecyclePolicy.sol:GNUSLifecyclePolicy": address }`
 *      injected — transparent to the diamonds framework, which keeps calling
 *      `getContractFactory(name, { signer })` exactly as before.
 *
 * Mocha path: both steps run in the test `before` hook BEFORE
 * `LocalDiamondDeployer.getInstance(...)` via `setupLifecyclePolicyLinking()`.
 *
 * Lazy path: processes that deploy the diamond IN-PROCESS via the framework's
 * DeploymentManager never run a per-suite `before` hook, so the eager installer above
 * is never called there. `installLazyLifecyclePolicyLinker(hre)` closes that gap: it
 * installs the SAME monkey-patch in lazy mode (deploy-on-first-use, cached per
 * process) and is wired from hardhat.config.ts via `extendEnvironment`, so EVERY
 * hardhat process carries the linker. The two installers share one module-level state
 * block: whichever runs first installs the patch; the per-suite eager deploy then
 * reuses the cached library address for that network (no double-deploy, no
 * double-patch). The cache is keyed PER NETWORK — a process that touches multiple
 * networks gets one library deployment per chain, never a cross-chain stale address
 * baked into linked bytecode.
 *
 * CONFIG-LOAD SAFETY: this module must NOT import the "hardhat" entry at the top
 * level — hardhat.config.ts imports it during config loading, and the "hardhat" entry
 * throws LIB_IMPORTED_FROM_THE_CONFIG when the HRE is not yet constructed. All runtime
 * access goes through a lazily required HRE (or an explicit hre parameter).
 *
 * PRODUCTION COVERAGE: every hardhat process — including the production RPC deploy /
 * Safe-proposal entry points (scripts/deploy/rpc/*.ts load the "hardhat" entry, which
 * loads hardhat.config.ts and installs the lazy linker via extendEnvironment) — gets
 * the patch. The production strategies create facet factories through
 * `hardhat.ethers.getContractFactory(name, { signer })` (@geniusventures/diamonds
 * BaseDeploymentStrategy), which the patch intercepts; when a signer rides along, the
 * lazy library deploy uses IT (deployAndLinkLifecyclePolicyWithSigner) so the library
 * lands on the RPC target network, not the HRE default.
 *
 * The monkey-patch is process-local and reversible (recompiling/regenerating
 * typechain is unaffected); it does NOT touch the compile pipeline or the diamonds
 * config.
 */

const LIBRARY_NAME = "GNUSLifecyclePolicy";
const LIBRARY_FQN =
  "contracts/gnus-ai/GNUSLifecyclePolicy.sol:GNUSLifecyclePolicy";
// Held in a constant so the lazy runtime require below carries no "hardhat"
// import/require literal at module scope (see CONFIG-LOAD SAFETY above).
const HARDHAT_MODULE = "hardhat";

// The library address cache is keyed PER NETWORK (chain id). A single module-level
// address broke any process that touches two networks (test-multichain, RPC entry
// points iterating networks): the library deployed on chain A was baked into facet
// bytecode "linked" on chain B — a DELEGATECALL stub targeting an address with no code.
const linkedLibraryAddressByChainKey = new Map<string, string>();
let linkerInstalled = false;

/**
 * Resolve the cache key for a network. Prefers the signer's provider (production
 * path — the library must land where the intercepted signer broadcasts), then the
 * HRE's configured network (chainId when set, else the network name for chain-id-less
 * local configs).
 * @param signer Optional explicit signer whose provider identifies the target network.
 * @param hre Optional explicit HRE; defaults to the runtime HRE.
 * @returns A stable per-network cache key.
 */
async function chainKey(signer?: any, hre?: any): Promise<string> {
  if (signer?.provider) {
    const net = await signer.provider.getNetwork();
    return `chain-${net.chainId.toString()}`;
  }
  const env = hre ?? runtimeHre();
  const chainId = env.network?.config?.chainId;
  return chainId !== undefined && chainId !== null
    ? `chain-${chainId.toString()}`
    : `net-${env.network?.name ?? "default"}`;
}

/**
 * Lazily resolve the constructed HRE at RUNTIME (never at module load).
 * @returns The initialized HardhatRuntimeEnvironment.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
function runtimeHre(): any {
  return require(HARDHAT_MODULE);
}

/**
 * Deploy GNUSLifecyclePolicy once per process (idempotent) and return its address.
 * @param hre Optional explicit HRE (config/extendEnvironment path); defaults to the
 *   runtime HRE.
 * @returns The deployed library address (lowercase hex).
 */
export async function deployAndLinkLifecyclePolicy(hre?: any): Promise<string> {
  const env = hre ?? runtimeHre();
  const key = await chainKey(undefined, env);
  const cached = linkedLibraryAddressByChainKey.get(key);
  if (cached) {
    return cached;
  }
  const [deployer] = await env.ethers.getSigners();
  const factory = await env.ethers.getContractFactory(LIBRARY_NAME, deployer);
  const library = await factory.deploy();
  await library.waitForDeployment();
  const address = (await library.getAddress()).toLowerCase();
  linkedLibraryAddressByChainKey.set(key, address);
  return address;
}

/**
 * Deploy GNUSLifecyclePolicy once per process using an EXPLICIT signer (production
 * path). The production RPC deploy flow (RPCDiamondDeployer → @geniusventures/diamonds
 * BaseDeploymentStrategy) requests facet factories as `getContractFactory(name,
 * { signer })` with the raw RPC wallet — the lazy linker honors that signer here so
 * the library deployment is broadcast on the target network, not the HRE default
 * network.
 * @param signer The signer intercepted from the factory request (RPC wallet / Safe
 *   proposer).
 * @returns The deployed library address (lowercase hex).
 */
export async function deployAndLinkLifecyclePolicyWithSigner(
  signer: any,
): Promise<string> {
  const key = await chainKey(signer);
  const cached = linkedLibraryAddressByChainKey.get(key);
  if (cached) {
    return cached;
  }
  const env = runtimeHre();
  const factory = await env.ethers.getContractFactory(LIBRARY_NAME, signer);
  const library = await factory.deploy();
  await library.waitForDeployment();
  const address = (await library.getAddress()).toLowerCase();
  linkedLibraryAddressByChainKey.set(key, address);
  return address;
}

/**
 * Shared patch installer. When `lazyDeploy` is true and a linking artifact is
 * requested before the library has been deployed, the library is deployed on the spot
 * against `hre.network` and cached for the rest of the process (the in-process
 * deployment path). When false, the caller must have run
 * `deployAndLinkLifecyclePolicy()` first (the mocha path).
 * @param hre The HRE whose `ethers.getContractFactory` is patched.
 * @param lazyDeploy Deploy the library on first linking-factory request when true.
 */
function patchGetContractFactory(hre: any, lazyDeploy: boolean): void {
  if (linkerInstalled) {
    return;
  }
  linkerInstalled = true;

  const ethersRef: any = hre.ethers;
  const original = ethersRef.getContractFactory.bind(ethersRef);
  // Forward the FULL argument list: hardhat-ethers exposes a 3-argument
  // overload getContractFactory(abi, bytecode, signer); a two-parameter
  // replacement would rebind `bytecode` as `opts` and silently drop the
  // signer, deploying ABI-form factories from the default account.
  ethersRef.getContractFactory = async (...args: any[]) => {
    const nameOrAbi = args[0];
    if (typeof nameOrAbi === "string") {
      let opts = args[1];
      let artifact: any;
      try {
        artifact = await hre.artifacts.readArtifact(nameOrAbi);
      } catch {
        artifact = undefined;
      }
      if (artifact) {
        const needsLib = Object.values(artifact.linkReferences ?? {}).some(
          (byFile: any) => Object.keys(byFile ?? {}).includes(LIBRARY_NAME),
        );
        if (needsLib) {
          const isSigner =
            opts && typeof opts === "object" && "provider" in opts;
          const signer = isSigner ? opts : opts?.signer;
          // The cache is per network (chain id) — a miss on the CURRENT network's
          // key falls through to a fresh deploy even when another network is cached.
          const key = await chainKey(signer, hre);
          let libraryAddress = linkedLibraryAddressByChainKey.get(key);
          if (!libraryAddress) {
            if (!lazyDeploy) {
              throw new Error(
                `${LIBRARY_NAME} linker installed without a deployed library address — ` +
                  "call deployAndLinkLifecyclePolicy() first",
              );
            }
            // When the intercepted factory call carries an explicit signer
            // (production path — RPCDiamondDeployer / SafeProposer strategy pass
            // the RPC wallet as { signer }), deploy the library WITH THAT SIGNER so
            // it lands on the target network. Falling back to
            // hre.ethers.getSigners() would deploy against whatever network the
            // HRE defaults to and link production facet bytecode against a library
            // address that does not exist on the target chain.
            if (signer) {
              libraryAddress =
                await deployAndLinkLifecyclePolicyWithSigner(signer);
            } else {
              libraryAddress = await deployAndLinkLifecyclePolicy(hre);
            }
          }
          const base = typeof opts === "object" && !isSigner ? opts : {};
          opts = {
            ...base,
            signer,
            libraries: {
              ...(base.libraries ?? {}),
              [LIBRARY_FQN]: libraryAddress,
            },
          };
          args[1] = opts;
        }
      }
    }
    return original(...args);
  };
}

/**
 * Monkey-patch `ethers.getContractFactory` to inject the GNUSLifecyclePolicy library
 * address into any factory whose artifact links the library. Idempotent. Call AFTER
 * `deployAndLinkLifecyclePolicy()` and BEFORE `LocalDiamondDeployer.getInstance(...)`.
 * @param libraryAddress The deployed GNUSLifecyclePolicy address.
 * @param hre Optional explicit HRE; defaults to the runtime HRE.
 */
export async function installLifecyclePolicyLinker(
  libraryAddress: string,
  hre?: any,
): Promise<void> {
  const key = await chainKey(undefined, hre);
  const existing = linkedLibraryAddressByChainKey.get(key);
  linkedLibraryAddressByChainKey.set(
    key,
    (existing ?? libraryAddress).toLowerCase(),
  );
  patchGetContractFactory(hre ?? runtimeHre(), false);
}

/**
 * Lazy-mode installer for processes that never run a per-suite `before` hook
 * (in-process DeploymentManager deployments): installs the SAME patch in lazy mode so
 * the deployment links GNUSLifecyclePolicy without any per-suite wiring. Wired from
 * hardhat.config.ts via `extendEnvironment`. Idempotent and compatible with the
 * per-suite `setupLifecyclePolicyLinking()` — whichever runs first installs the patch;
 * both share the module-level per-network library address cache.
 * @param hre The HRE provided by `extendEnvironment`.
 */
export function installLazyLifecyclePolicyLinker(hre: any): void {
  patchGetContractFactory(hre, true);
}

/**
 * Convenience: deploy the library AND install the linker in one call. Use in test
 * `before` hooks before deploying the diamond.
 * @returns The deployed library address.
 */
export async function setupLifecyclePolicyLinking(): Promise<string> {
  const address = await deployAndLinkLifecyclePolicy();
  await installLifecyclePolicyLinker(address);
  return address;
}
