import { JsonRpcProvider } from "@ethersproject/providers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { debug } from "debug";
import { Diamond } from "diamonds";
import { ethers } from "hardhat";
import { multichain } from "hardhat-multichain";
import { ProxyDiamond } from "../../diamond-typechain-types/ProxyDiamond";
import {
  LocalDiamondDeployer,
  LocalDiamondDeployerConfig,
} from "../../scripts/setup/LocalDiamondDeployer";
import { getInterfaceID } from "../../scripts/utils/helpers";
import { loadDiamondContract } from "../../scripts/utils/loadDiamondArtifact";
import {
  IDiamondCut__factory,
  IDiamondLoupe__factory,
  IERC20Upgradeable__factory,
} from "../../typechain-types/";

describe("🧪 ERC20ProxyFacet Unit Tests", function () {
  const diamondName = "ProxyDiamond";
  const log: debug.Debugger = debug("GNUSDeploy:log:${diamondName}");
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
    describe(`🔗 Chain: ${networkName} 🔷 Diamond: ${diamondName}`, function () {
      let diamond: Diamond;
      let signers: SignerWithAddress[];
      let signer0: string;
      let signer1: string;
      let signer2: string;
      let owner: string;
      let ownerSigner: SignerWithAddress;
      let proxyDiamond: ProxyDiamond;
      let signer0Diamond: ProxyDiamond;
      let signer1Diamond: ProxyDiamond;
      let signer2Diamond: ProxyDiamond;
      let ownerDiamond: ProxyDiamond;

      let ethersMultichain: typeof ethers;
      let snapshotId: string;

      before(async function () {
        const config = {
          diamondName: diamondName,
          networkName: networkName,
          provider: provider,
          chainId: (await provider.getNetwork()).chainId,
          writeDeployedDiamondData: false,
          configFilePath: `diamonds/ProxyDiamond/proxydiamond.config.json`,
        } as LocalDiamondDeployerConfig;
        const diamondDeployer = await LocalDiamondDeployer.getInstance(config);
        diamond = await diamondDeployer.getDiamondDeployed();
        const deployInfo = diamond.getDeployedDiamondData();

        const hardhatDiamondAbiPath =
          "hardhat-diamond-abi/HardhatDiamondABI.sol:";
        const diamondArtifactName = `${hardhatDiamondAbiPath}${diamond.diamondName}`;
        proxyDiamond = await loadDiamondContract<ProxyDiamond>(
          diamond,
          deployInfo.DiamondAddress!,
        );

        ethersMultichain = ethers;
        ethersMultichain.provider = provider as any;

        // Retrieve the signers for the chain
        signers = await ethersMultichain.getSigners();
        signer0 = signers[0].address;
        signer1 = signers[1].address;
        signer2 = signers[2].address;
        signer0Diamond = proxyDiamond.connect(signers[0]);
        signer1Diamond = proxyDiamond.connect(signers[1]);
        signer2Diamond = proxyDiamond.connect(signers[2]);

        // get the signer for the owner
        owner = deployInfo.DeployerAddress!;
        if (!owner) {
          owner = signer0;
          ownerSigner = signers[0];
        } else {
          ownerSigner = await ethersMultichain.getSigner(owner);
        }
        ownerDiamond = proxyDiamond.connect(ownerSigner);
      });

      beforeEach(async function () {
        snapshotId = await provider.send("evm_snapshot", []);
      });

      afterEach(async () => {
        await provider.send("evm_revert", [snapshotId]);
      });

      describe("Diamond Interface Support Tests", function () {
        it("Should support IERC20Upgradeable interface", async () => {
          const IERC20UpgradeableInterface =
            IERC20Upgradeable__factory.createInterface();
          const IERC20InterfaceID = getInterfaceID(IERC20UpgradeableInterface);
          // Convert bigint to bytes4 hex string
          const interfaceIdHex =
            "0x" + IERC20InterfaceID.toString(16).padStart(8, "0");
          const supported =
            await proxyDiamond.supportsInterface(interfaceIdHex);
          expect(supported).to.be.true;
        });

        it("Should support IDiamondCut interface", async () => {
          const IDiamondCutInterface = IDiamondCut__factory.createInterface();
          const IDiamondCutInterfaceID = getInterfaceID(IDiamondCutInterface);
          // Convert bigint to bytes4 hex string
          const interfaceIdHex =
            "0x" + IDiamondCutInterfaceID.toString(16).padStart(8, "0");
          const supported =
            await proxyDiamond.supportsInterface(interfaceIdHex);
          expect(supported).to.be.true;
        });

        it("Should support IDiamondLoupe interface", async () => {
          const IDiamondLoupeInterface =
            IDiamondLoupe__factory.createInterface();
          const IDiamondLoupeInterfaceID = getInterfaceID(
            IDiamondLoupeInterface,
          );
          // Convert bigint to bytes4 hex string
          const interfaceIdHex =
            "0x" + IDiamondLoupeInterfaceID.toString(16).padStart(8, "0");
          const supported =
            await proxyDiamond.supportsInterface(interfaceIdHex);
          expect(supported).to.be.true;
        });
      });

      describe("DiamondLoupe Facet Tests", function () {
        it("Should return all facet addresses", async () => {
          const facetAddresses = await proxyDiamond.facetAddresses();
          expect(facetAddresses.length).to.be.greaterThan(0);
          console.log(`✅ Found ${facetAddresses.length} facets`);
        });

        it("Should return facet function selectors", async () => {
          const facetAddresses = await proxyDiamond.facetAddresses();
          for (const facetAddress of facetAddresses) {
            const selectors =
              await proxyDiamond.facetFunctionSelectors(facetAddress);
            expect(selectors.length).to.be.greaterThan(0);
            console.log(
              `  Facet ${facetAddress}: ${selectors.length} functions`,
            );
          }
        });

        it("Should return facet address for a specific selector", async () => {
          // Check for the 'name()' function selector (0x06fdde03)
          const nameSelector = "0x06fdde03";
          const facetAddr = await proxyDiamond.facetAddress(nameSelector);
          expect(facetAddr).to.not.equal(ethers.ZeroAddress);
          console.log(`✅ name() function is in facet: ${facetAddr}`);
        });

        it("Should return all facets with their selectors", async () => {
          const facets = await proxyDiamond.facets();
          expect(facets.length).to.be.greaterThan(0);
          let totalFunctions = 0;
          for (const facet of facets) {
            totalFunctions += facet.functionSelectors.length;
            console.log(
              `  Facet ${facet.facetAddress}: ${facet.functionSelectors.length} functions`,
            );
          }
          console.log(
            `✅ Total functions across all facets: ${totalFunctions}`,
          );
        });
      });

      describe("ERC20ProxyFacet Basic View Functions Tests", function () {
        it("Should return correct token name after initialization", async () => {
          const tokenName = await proxyDiamond.name();
          // After post-deployment initialization, name should be set
          expect(tokenName).to.equal("ExampleToken");
        });

        it("Should return correct token symbol after initialization", async () => {
          const tokenSymbol = await proxyDiamond.symbol();
          // After post-deployment initialization, symbol should be set
          expect(tokenSymbol).to.equal("XMPL");
        });

        it("Should return 18 decimals", async () => {
          const decimals = await proxyDiamond.decimals();
          expect(decimals).to.equal(18);
        });
      });

      describe("ERC20ProxyFacet State Query Tests (Uninitialized)", function () {
        it("Should revert when calling totalSupply before initialization", async () => {
          await expect(proxyDiamond.totalSupply()).to.be.reverted;
        });

        it("Should revert when calling balanceOf before initialization", async () => {
          await expect(proxyDiamond.balanceOf(signer0)).to.be.reverted;
        });

        it("Should revert when calling allowance before initialization", async () => {
          await expect(proxyDiamond.allowance(signer0, signer1)).to.be.reverted;
        });
      });

      describe("ERC20ProxyFacet Transfer Tests (Uninitialized)", function () {
        it("Should revert when calling transfer before initialization", async () => {
          const amount = ethers.parseEther("100");
          await expect(signer0Diamond.transfer(signer1, amount)).to.be.reverted;
        });

        it("Should revert when calling approve before initialization", async () => {
          const amount = ethers.parseEther("100");
          await expect(signer0Diamond.approve(signer1, amount)).to.be.reverted;
        });

        it("Should revert when calling transferFrom before initialization", async () => {
          const amount = ethers.parseEther("100");
          await expect(signer1Diamond.transferFrom(signer0, signer2, amount)).to
            .be.reverted;
        });
      });

      describe("ERC20ProxyFacet Initialization Tests", function () {
        it("Should only allow owner to initialize", async () => {
          // Try to initialize from non-owner (should fail)
          await expect(
            signer1Diamond.initializeERC20Proxy(
              ethers.ZeroAddress,
              1,
              "Test Token",
              "TEST",
            ),
          ).to.be.reverted;
        });

        it("Should allow owner to reinitialize (update configuration)", async () => {
          // The diamond is already initialized by the post-deployment callback
          // The owner can update the configuration (no initializer modifier)
          // This is by design for flexibility
          const nameBefore = await proxyDiamond.name();
          expect(nameBefore).to.equal("ExampleToken");

          // Owner can update (this is allowed by design)
          await ownerDiamond.initializeERC20Proxy(
            ethers.ZeroAddress,
            2,
            "New Token",
            "NEW",
          );

          const nameAfter = await proxyDiamond.name();
          expect(nameAfter).to.equal("New Token");
          const symbolAfter = await proxyDiamond.symbol();
          expect(symbolAfter).to.equal("NEW");
        });
      });

      describe("Complete ERC20 Function Coverage", function () {
        it("Should have all required ERC20 functions in the ABI", async () => {
          const contractInterface = proxyDiamond.interface;
          const requiredFunctions = [
            "name",
            "symbol",
            "decimals",
            "totalSupply",
            "balanceOf",
            "transfer",
            "approve",
            "allowance",
            "transferFrom",
          ];

          for (const funcName of requiredFunctions) {
            const func = contractInterface.getFunction(funcName as any);
            expect(func).to.not.be.null;
            expect(func).to.not.be.undefined;
            console.log(`✅ Function ${funcName} exists in ABI`);
          }
        });

        it("Should have initializeERC20Proxy function", async () => {
          const contractInterface = proxyDiamond.interface;
          const func = contractInterface.getFunction("initializeERC20Proxy");
          expect(func).to.not.be.null;
          expect(func).to.not.be.undefined;
          console.log("✅ Function initializeERC20Proxy exists in ABI");
        });
      });
    });
  }
});
