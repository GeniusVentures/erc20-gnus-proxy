/* eslint-disable @typescript-eslint/no-unused-vars */

import { debug } from "debug";
import { expect } from "chai";
import { ethers } from "hardhat";
import hre from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { JsonRpcProvider } from "ethers";
import { multichain } from "@geniusventures/hardhat-multichain";
import { getInterfaceID } from "../../scripts/utils/helpers";
import {
  LocalDiamondDeployer,
  LocalDiamondDeployerConfig,
} from "../../scripts/setup/LocalDiamondDeployer";
import { Diamond } from "@geniusventures/diamonds";
import {
  IERC20Upgradeable__factory,
  IDiamondCut__factory,
  IDiamondLoupe__factory,
} from "../../typechain-types";
import { loadDiamondContract } from "../../scripts/utils/loadDiamondArtifact";
import { GeniusDiamond } from "../../diamond-typechain-types/GeniusDiamond";
import { setupLifecyclePolicyLinking } from "../../scripts/utils/GNUSLifecyclePolicyLinking";
import * as fs from "fs";

/**
 * Minimal shape of the GeniusDiamond facet config this suite validates against
 * (the full schema is @geniusventures/diamonds DeployConfigSchema).
 */
interface FacetVersionConfigJson {
  deployInit?: string;
  upgradeInit?: string;
  fromVersions?: number[];
  deployInclude?: string[];
  deployExclude?: string[];
}

interface GeniusDiamondConfigJson {
  protocolVersion: number;
  protocolInitFacet?: string;
  facets: Record<
    string,
    { priority: number; versions: Record<string, FacetVersionConfigJson> }
  >;
}

const geniusDiamondConfig = JSON.parse(
  fs.readFileSync("diamonds/GeniusDiamond/geniusdiamond.config.json", "utf8"),
) as GeniusDiamondConfigJson;

/**
 * Latest (max numeric) version key configured for a facet — the version a fresh
 * deployment ships (BaseDeploymentStrategy deploys Math.max of the version keys).
 */
function latestVersionKey(
  versions: Record<string, FacetVersionConfigJson>,
): string {
  return Object.keys(versions).reduce((a, b) =>
    Number(b) > Number(a) ? b : a,
  );
}

describe("🧪 Multichain Fork and Diamond Deployment Tests", async function () {
  const diamondName = "GeniusDiamond";
  const log: debug.Debugger = debug(`GNUSDeploy:log:${diamondName}`);
  this.timeout(0); // Extended indefinitely for diamond deployment time

  const networkProviders =
    multichain.getProviders() || new Map<string, JsonRpcProvider>();

  if (process.argv.includes("test-multichain")) {
    const networkNames =
      process.argv[process.argv.indexOf("--chains") + 1].split(",");
    if (networkNames.includes("hardhat")) {
      networkProviders.set("hardhat", ethers.provider as any);
    }
  } else if (
    process.argv.includes("test") ||
    process.argv.includes("coverage")
  ) {
    networkProviders.set("hardhat", ethers.provider as any);
  }

  for (const [networkName, provider] of networkProviders.entries()) {
    describe(`🔗 Chain: ${networkName}  Diamond: ${diamondName}`, function () {
      let diamond: Diamond;
      let signers: SignerWithAddress[];
      let signer0: string;
      let signer1: string;
      let signer2: string;
      let owner: string;
      let ownerSigner: SignerWithAddress;
      let geniusDiamond: GeniusDiamond;
      let signer0Diamond: GeniusDiamond;
      let signer1Diamond: GeniusDiamond;
      let signer2Diamond: GeniusDiamond;
      let ownerDiamond: GeniusDiamond;

      let ethersMultichain: typeof ethers;
      let snapshotId: string;

      before(async function () {
        // Pitfall 1: GNUSNFTFactory (and every other GNUSLifecyclePolicy-linking
        // facet) cannot deploy through the diamonds framework without the library
        // linked — install the linker BEFORE the deployer builds any facet factory.
        await setupLifecyclePolicyLinking();
        const config = {
          diamondName: diamondName,
          networkName: networkName,
          provider: provider,
          chainId: (await provider.getNetwork()).chainId,
          writeDeployedDiamondData: false,
          configFilePath: `diamonds/GeniusDiamond/geniusdiamond.config.json`,
        } as unknown as LocalDiamondDeployerConfig;
        const diamondDeployer = await LocalDiamondDeployer.getInstance(config);
        await diamondDeployer.setVerbose(true);
        diamond = await diamondDeployer.getDiamondDeployed();
        const deployedDiamondData = diamond.getDeployedDiamondData();

        geniusDiamond = await loadDiamondContract<GeniusDiamond>(
          diamond,
          deployedDiamondData.DiamondAddress!,
        );
        ethersMultichain = ethers;
        ethersMultichain.provider = provider as any;

        // Retrieve the signers for the chain
        signers = await ethersMultichain.getSigners();
        signer0 = signers[0].address;
        signer1 = signers[1].address;
        signer2 = signers[2].address;
        signer0Diamond = geniusDiamond.connect(signers[0]);
        signer1Diamond = geniusDiamond.connect(signers[1]);
        signer2Diamond = geniusDiamond.connect(signers[2]);

        // get the signer for the owner

        owner = diamond.getDeployedDiamondData().DeployerAddress!;
        if (!owner) {
          diamond.setSigner(signers[0]);
          owner = signer0;
        }
        ownerSigner = await ethersMultichain.getSigner(owner);

        ownerDiamond = geniusDiamond.connect(ownerSigner);
      });

      beforeEach(async function () {
        snapshotId = await provider.send("evm_snapshot", []);
      });

      afterEach(async () => {
        await provider.send("evm_revert", [snapshotId]);
      });

      it(`should ensure that ${networkName} chain object can be retrieved and reused`, async function () {
        expect(provider).to.not.be.undefined;
        // expect(diamond).to.not.be.null;

        const chainId = (await provider.getNetwork()).chainId;
        expect(chainId).to.be.a("bigint");
      });

      it(`should verify that ${networkName} diamond is deployed and we can get hardhat signers on ${networkName}`, async function () {
        expect(signers).to.be.an("array");
        expect(signers).to.have.lengthOf(20);
        expect(signers[0]).to.be.instanceOf(SignerWithAddress);

        expect(owner).to.not.be.undefined;
        expect(owner).to.be.a("string");
        // expect(owner).to.be.properAddress;
        expect(ownerSigner).to.be.instanceOf(SignerWithAddress);
      });

      it(`should verify that ${networkName} providers are defined and have valid block numbers`, async function () {
        log(`Checking chain provider for: ${networkName}`);
        expect(provider).to.not.be.undefined;

        const blockNumber = await ethersMultichain.provider.getBlockNumber();
        log(`Block number for ${networkName}: ${blockNumber}`);

        expect(blockNumber).to.be.a("number");
        // Fails for hardhat because it defaults to 0.
        if (networkName !== "hardhat") {
          expect(blockNumber).to.be.greaterThan(0);
        }
        const configBlockNumber =
          hre.config.chainManager?.chains?.[networkName]?.blockNumber ?? 0;
        // The fork was created at or after the pinned block — the meaningful
        // invariant on every network.
        expect(blockNumber).to.be.gte(configBlockNumber);

        // The upper bound is only deterministic on the in-memory hardhat
        // chain (no pinned block, head starts at 0); on forked/live networks
        // the head advances past any fixed window, so a wall-clock upper
        // bound there is a time bomb, not a check.
        if (networkName === "hardhat") {
          expect(blockNumber).to.be.lte(configBlockNumber + 500);
        }
      });

      // it(`should verify ERC173 contract ownership on ${networkName}`, async function () {
      //   // check if the owner is the deployer and transfer ownership to the deployer
      //   const currentContractOwner = await ownerDiamond.owner();
      //   expect(currentContractOwner.toLowerCase()).to.be.eq(await owner.toLowerCase());
      // });

      it(`should verify that the owner has DEFAULT_ADMIN_ROLE on ${networkName}`, async function () {
        const DEFAULT_ADMIN_ROLE = await ownerDiamond.DEFAULT_ADMIN_ROLE();
        const hasAdminRole = await ownerDiamond.hasRole(
          DEFAULT_ADMIN_ROLE,
          owner,
        );
        expect(hasAdminRole).to.be.true;
        log(`Owner has DEFAULT_ADMIN_ROLE on ${networkName}`);
      });

      it(`should verify that the owner has UPGRADER_ROLE on ${networkName}`, async function () {
        const UPGRADER_ROLE = await ownerDiamond.UPGRADER_ROLE();
        const hasUpgraderRole = await ownerDiamond.hasRole(
          UPGRADER_ROLE,
          owner,
        );
        expect(hasUpgraderRole).to.be.true;
        log(`Owner has UPGRADER_ROLE on ${networkName}`);
      });

      it(`should verify that the owner has MINTER_ROLE on ${networkName}`, async function () {
        const MINTER_ROLE = await ownerDiamond.MINTER_ROLE();
        const hasMinterRole = await ownerDiamond.hasRole(MINTER_ROLE, owner);
        expect(hasMinterRole).to.be.true;
        log(`Owner has MINTER_ROLE on ${networkName}`);
      });

      it(`should validate ERC165 interface compatibility on ${networkName}`, async function () {
        // Test ERC165 interface compatibility
        const supportsERC165 =
          await ownerDiamond.supportsInterface("0x01ffc9a7");
        expect(supportsERC165).to.be.true;

        log(`Diamond deployed and validated on ${networkName}`);
      });

      it(`should validate IDiamondCut interface compatibility on ${networkName}`, async function () {
        // Test ERC165 interface compatibility
        const iDiamondCutInterface = IDiamondCut__factory.createInterface();
        // Generate the IDiamondCut interface ID by XORing with the base interface ID.
        const iDiamondCutInterfaceID = getInterfaceID(iDiamondCutInterface);
        // const supportsIDiamondCut = await proxyDiamond.supportsInterface('0x1f931c1c');
        const supportsERC165 = await ownerDiamond.supportsInterface(
          "0x" + iDiamondCutInterfaceID.toString(16).padStart(8, "0"),
        );
        expect(supportsERC165).to.be.true;

        log(`DiamondCut Facet interface support validated on ${networkName}`);
      });

      it(`should validate IDiamondLoupe interface compatibility on ${networkName}`, async function () {
        // Test ERC165 interface compatibility
        const iDiamondLoupeInterface = IDiamondLoupe__factory.createInterface();
        // Generate the IDiamondLoupe interface ID by XORing with the base interface ID.
        const iDiamondLoupeInterfaceID = getInterfaceID(iDiamondLoupeInterface);
        // const supportsIDiamondLoupe = await proxyDiamond.supportsInterface('0x48e3885f');
        const supportsERC165 = await ownerDiamond.supportsInterface(
          "0x" + iDiamondLoupeInterfaceID.toString(16).padStart(8, "0"),
        );
        expect(supportsERC165).to.be.true;
        log(`DiamondLoupe Facet interface support validated on ${networkName}`);
      });

      it(`should verify ERC165 supported interface for ERC20 on ${networkName}`, async function () {
        log(`Validating ERC20 interface on chain: ${networkName}`);
        const IERC20UpgradeableInterface =
          IERC20Upgradeable__factory.createInterface();
        // Generate the ERC20 interface ID by XORing with the base interface ID.
        const IERC20InterfaceID = getInterfaceID(IERC20UpgradeableInterface);
        // Assert that the `diamond` contract supports the ERC20 interface.
        // assert(
        //   await proxyDiamond?.supportsInterface(IERC20InterfaceID._hex),
        //   "Doesn't support IERC20Upgradeable",
        // );

        // Test ERC165 interface compatibility for ERC20 '0x37c8e2a0'
        // Test ERC165 interface compatibility for ERC20Upgradeable '0x36372b07'
        // const supportsERC20 = await proxyDiamond?.supportsInterface(IERC20InterfaceID.toString());

        const supportsERC20 =
          await ownerDiamond?.supportsInterface("0x36372b07");

        expect(supportsERC20).to.be.true;

        log(`ERC20 interface validated on ${networkName}`);
      });

      it(`should deploy exactly the 2.6 config facet set on ${networkName}`, async function () {
        const newDeployedFacets = diamond.getNewDeployedFacets();
        // DiamondCutFacet is deployed explicitly alongside the Diamond (recorded in
        // DeployedDiamondData.DeployedFacets, not in newDeployedFacets) — include
        // it in the comparison.
        const deployedFacetNames = [
          ...Object.keys(newDeployedFacets),
          "DiamondCutFacet",
        ].sort();
        const configFacetNames = Object.keys(geniusDiamondConfig.facets).sort();

        // Config-vs-deployed comparison: the deployed diamond carries exactly the
        // facets the 2.6 config registers — GeniusAI removed, 2.6 facets present.
        expect(deployedFacetNames).to.deep.equal(configFacetNames);
        expect(deployedFacetNames).to.not.include("GeniusAI");
        expect(deployedFacetNames).to.include.members([
          "GNUSBridgeAttestor",
          "GNUSTreasury",
          "GNUSRedeemAdapter",
          "GNUSLifecycle",
          "GNUSLifecycleMint",
          "GNUSLicensing",
          "GNUSLicensingPurchase",
        ]);
        expect(
          diamond.getDeployedDiamondData().DeployedFacets?.DiamondCutFacet
            ?.address,
        ).to.not.be.undefined;
      });

      it(`should deploy each facet at its latest configured version and priority on ${networkName}`, async function () {
        const newDeployedFacets = diamond.getNewDeployedFacets();
        for (const [facetName, deployedFacet] of Object.entries(
          newDeployedFacets,
        )) {
          const facetConfig = geniusDiamondConfig.facets[facetName];
          expect(facetConfig, `facet ${facetName} is not in the 2.6 config`).to
            .not.be.undefined;
          // A fresh deployment ships Math.max of each facet's configured version
          // keys (DiamondCutFacet is deployed outside this flow — version 0).
          const expectedVersion = Number(
            latestVersionKey(facetConfig.versions ?? {}),
          );
          expect(deployedFacet.version, facetName).to.equal(expectedVersion);
          expect(deployedFacet.priority, facetName).to.equal(
            facetConfig.priority,
          );
        }
      });

      it(`should record the 2.6 protocol version for the deployment on ${networkName}`, async function () {
        expect(geniusDiamondConfig.protocolVersion).to.equal(2.6);
        expect(diamond.getDeployedDiamondData().protocolVersion).to.equal(
          geniusDiamondConfig.protocolVersion,
        );
      });

      it(`should run the 2.6 deploy-init functions on ${networkName}`, async function () {
        const initializerRegistry = diamond.initializerRegistry;
        const expectedInits = new Map<string, string>();
        for (const [facetName, facetConfig] of Object.entries(
          geniusDiamondConfig.facets,
        )) {
          if (facetName === geniusDiamondConfig.protocolInitFacet) {
            continue;
          }
          const deployInit =
            facetConfig.versions?.[latestVersionKey(facetConfig.versions ?? {})]
              ?.deployInit;
          if (deployInit) {
            expectedInits.set(facetName, deployInit);
          }
        }

        expect(initializerRegistry.size).to.equal(expectedInits.size);
        for (const [facetName, initFunction] of expectedInits.entries()) {
          expect(initializerRegistry.get(facetName), facetName).to.equal(
            initFunction,
          );
        }

        // 2.6 shift spot checks
        expect(initializerRegistry.get("GNUSNFTFactory")).to.equal(
          "GNUSNFTFactory_Initialize230()",
        );
        expect(initializerRegistry.get("GNUSTreasury")).to.equal(
          "GNUSTreasury_Initialize260()",
        );
      });

      it(`should wire the protocol init facet through the diamond cut on ${networkName}`, async function () {
        const initFacetName = geniusDiamondConfig.protocolInitFacet!;
        // The protocol init facet runs via the diamondCut init calldata
        // (diamondInitialize250 at protocol version 2.6), not the registry.
        expect(diamond.initializerRegistry.has(initFacetName)).to.be.false;
        expect(
          geniusDiamondConfig.facets[initFacetName].versions?.["2.6"]
            ?.deployInit,
        ).to.equal("diamondInitialize250()");
        expect(diamond.getInitAddress()).to.equal(
          diamond.getNewDeployedFacets()[initFacetName].address,
        );
      });

      it(`should expose only deployInclude selectors for ERC1155ProxyOperator on ${networkName}`, async function () {
        const facetConfig = geniusDiamondConfig.facets.ERC1155ProxyOperator;
        const includeSignatures =
          facetConfig.versions?.[latestVersionKey(facetConfig.versions ?? {})]
            ?.deployInclude ?? [];
        const expectedSelectors = includeSignatures
          .map((sig) => ethers.id(sig).slice(0, 10))
          .sort();

        // The registry pass moves deployInclude selectors out of the in-memory
        // funcSelectors residue, so assert against the on-chain loupe instead.
        // (Array.from: the ethers v6 Result is a frozen Array subclass.)
        const facetAddress =
          diamond.getNewDeployedFacets().ERC1155ProxyOperator.address;
        const onChainSelectors = Array.from(
          await geniusDiamond.facetFunctionSelectors(facetAddress),
        ).sort();

        expect(onChainSelectors).to.deep.equal(expectedSelectors);
      });

      it(`should match on-chain loupe facets to the deployed config facets on ${networkName}`, async function () {
        const newDeployedFacets = diamond.getNewDeployedFacets();
        const loupeFacets = await geniusDiamond.facets();

        // Every configured facet is deployed as its own distinct on-chain facet
        // (the 18 versioned facets + the explicitly deployed DiamondCutFacet).
        expect(loupeFacets).to.have.lengthOf(
          Object.keys(geniusDiamondConfig.facets).length,
        );
        const loupeAddresses = new Set(
          loupeFacets.map((facet) => facet.facetAddress.toLowerCase()),
        );
        for (const [facetName, facet] of Object.entries(newDeployedFacets)) {
          expect(loupeAddresses.has(facet.address.toLowerCase()), facetName).to
            .be.true;
        }
      });
    });
  }
});
