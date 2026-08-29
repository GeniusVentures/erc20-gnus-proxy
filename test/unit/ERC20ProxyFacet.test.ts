import { JsonRpcProvider } from "@ethersproject/providers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { debug } from "debug";
import { Diamond } from "@geniusventures/diamonds";
import { ethers } from "hardhat";
import { multichain } from "@geniusventures/hardhat-multichain";
import { ProxyDiamond } from "../../diamond-typechain-types/ProxyDiamond";
import {
  LocalDiamondDeployer,
  LocalDiamondDeployerConfig,
} from "../../scripts/setup/LocalDiamondDeployer";
import { setupLifecyclePolicyLinking } from "../../scripts/utils/GNUSLifecyclePolicyLinking";
import { getInterfaceID } from "../../scripts/utils/helpers";
import { loadDiamondContract } from "../../scripts/utils/loadDiamondArtifact";
import {
  IDiamondCut__factory,
  IDiamondLoupe__factory,
  IERC20Upgradeable__factory,
  MockERC1155Supply,
  MockERC1155Supply__factory,
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
      let mockToken: MockERC1155Supply;
      let mockAddress: string;
      let diamondAddress: string;
      // Pool of root snapshots captured immediately after the mock deploy,
      // before initialization. Hardhat's evm_revert CONSUMES the snapshot it
      // reverts to (and can invalidate snapshots taken after a revert), so
      // re-arming after each rewind is unreliable — instead each uninit-state
      // test consumes exactly one pre-allocated root snapshot.
      const PRE_INIT_SNAPSHOT_POOL_SIZE = 20;
      let preInitSnapshots: string[] = [];

      let ethersMultichain: typeof ethers;
      let snapshotId: string;

      // Rewind the chain to the pre-init deployment state, consuming one
      // pooled root snapshot.
      async function rewindToPreInit(): Promise<void> {
        const snapshotToConsume = preInitSnapshots.pop();
        if (snapshotToConsume === undefined) {
          throw new Error("Pre-init snapshot pool exhausted");
        }
        await provider.send("evm_revert", [snapshotToConsume]);
      }

      // Return the fixture to the canonical initialized state for the rest of
      // the suite: rewind (disarms the one-shot init gate) + re-initialize.
      async function restoreInitializedFixture(): Promise<void> {
        await rewindToPreInit();
        await ownerDiamond.initializeERC20Proxy(
          mockAddress,
          1,
          "ExampleToken",
          "XMPL",
        );
      }

      before(async function () {
        await setupLifecyclePolicyLinking();
        const config = {
          diamondName: diamondName,
          networkName: networkName,
          provider: provider,
          chainId: (await provider.getNetwork()).chainId,
          writeDeployedDiamondData: false,
          configFilePath: `diamonds/ProxyDiamond/proxydiamond.config.json`,
        } as unknown as LocalDiamondDeployerConfig;
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
        diamondAddress = deployInfo.DiamondAddress!;

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

        // Deploy the local ERC-1155 mock (no GeniusDiamond, no callback) and
        // hold a pool of pre-init snapshots: uninitialized-state tests each
        // rewind by consuming one.
        mockToken = await new MockERC1155Supply__factory(ownerSigner).deploy();
        await mockToken.waitForDeployment();
        mockAddress = await mockToken.getAddress();
        for (let i = 0; i < PRE_INIT_SNAPSHOT_POOL_SIZE; i++) {
          preInitSnapshots.push(await provider.send("evm_snapshot", []));
        }

        // Explicit initialization (the self-pointing post-deployment callback
        // was deleted in this phase's config work)
        await ownerDiamond.initializeERC20Proxy(
          mockAddress,
          1,
          "ExampleToken",
          "XMPL",
        );
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
          const supported = await proxyDiamond.supportsInterface(interfaceIdHex);
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
          const supported = await proxyDiamond.supportsInterface(interfaceIdHex);
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
          // After explicit initialization against the mock, name should be set
          expect(tokenName).to.equal("ExampleToken");
        });

        it("Should return correct token symbol after initialization", async () => {
          const tokenSymbol = await proxyDiamond.symbol();
          // After explicit initialization against the mock, symbol should be set
          expect(tokenSymbol).to.equal("XMPL");
        });

        it("Should return 18 decimals", async () => {
          const decimals = await proxyDiamond.decimals();
          expect(decimals).to.equal(18);
        });
      });

      describe("ERC20ProxyFacet State Query Tests (Uninitialized)", function () {
        beforeEach(async function () {
          await rewindToPreInit();
        });

        after(async function () {
          await restoreInitializedFixture();
        });

        it("Should reject totalSupply before initialization (call to the zero address)", async () => {
          // Pre-init the ERC-1155 target is the zero address: the staticcall
          // returns empty returndata, so the return-data decode fails. Assert
          // broad promise rejection, not a specific revert string.
          await expect(proxyDiamond.totalSupply()).to.be.rejected;
        });

        it("Should reject balanceOf before initialization (call to the zero address)", async () => {
          await expect(proxyDiamond.balanceOf(signer0)).to.be.rejected;
        });

        it("Should return zero allowance before initialization (proxy-local mapping)", async () => {
          // The allowance mapping is proxy-local and zero-initialized: reading
          // it before init is well-defined and returns 0.
          expect(await proxyDiamond.allowance(signer0, signer1)).to.equal(0n);
        });

        it("Should succeed on approve before initialization as a proxy-local write", async () => {
          const amount = ethers.parseEther("100");
          // approve writes only the proxy-local mapping — it succeeds before
          // init and allowance() reflects the write.
          await signer0Diamond.approve(signer1, amount);
          expect(await proxyDiamond.allowance(signer0, signer1)).to.equal(
            amount,
          );
        });
      });

      describe("ERC20ProxyFacet TransferFrom Tests (Uninitialized)", function () {
        beforeEach(async function () {
          await rewindToPreInit();
        });

        after(async function () {
          await restoreInitializedFixture();
        });

        it("Should revert transferFrom before initialization with insufficient allowance", async () => {
          const amount = ethers.parseEther("100");
          // The proxy-local allowance gate fires before the ERC-1155 leg, so
          // the transfer attempt reverts on the allowance check.
          await expect(
            signer1Diamond.transferFrom(signer0, signer2, amount),
          ).to.be.revertedWith("ERC20: insufficient allowance");
        });
      });

      describe("ERC20ProxyFacet Initialization Tests", function () {
        it("Should revert on re-initialization (one-shot initializer gate)", async () => {
          const nameBefore = await proxyDiamond.name();
          expect(nameBefore).to.equal("ExampleToken");

          // The initializer gate fires before the D-04 guards, so even a
          // zero-address payload hits the Initializable string.
          await expect(
            ownerDiamond.initializeERC20Proxy(
              ethers.ZeroAddress,
              2,
              "New Token",
              "NEW",
            ),
          ).to.be.revertedWith("Initializable: contract is already initialized");

          // Configuration is immutable: the failed attempt changed nothing.
          const nameAfter = await proxyDiamond.name();
          expect(nameAfter).to.equal("ExampleToken");
          const symbolAfter = await proxyDiamond.symbol();
          expect(symbolAfter).to.equal("XMPL");
        });
      });

      describe("ERC20ProxyFacet Allowance State Machine Tests", function () {
        const childTokenId = 1;

        it("Should set and read a finite allowance with an Approval event", async () => {
          const amount = ethers.parseEther("42");
          await expect(signer0Diamond.approve(signer1, amount))
            .to.emit(proxyDiamond, "Approval")
            .withArgs(signer0, signer1, amount);
          expect(await proxyDiamond.allowance(signer0, signer1)).to.equal(
            amount,
          );
        });

        it("Should decrement allowance to zero on a full spend and move the tokens", async () => {
          const amount = ethers.parseEther("10");
          await mockToken.mint(signer0, childTokenId, amount);
          await signer0Diamond.approve(signer1, amount);

          const fromBefore = await proxyDiamond.balanceOf(signer0);
          const toBefore = await proxyDiamond.balanceOf(signer2);
          await signer1Diamond.transferFrom(signer0, signer2, amount);

          expect(await proxyDiamond.allowance(signer0, signer1)).to.equal(0n);
          expect(await proxyDiamond.balanceOf(signer0)).to.equal(
            fromBefore - amount,
          );
          expect(await proxyDiamond.balanceOf(signer2)).to.equal(
            toBefore + amount,
          );
        });

        it("Should emit Approval on the finite decrement path", async () => {
          const amount = ethers.parseEther("10");
          const spend = ethers.parseEther("4");
          await mockToken.mint(signer0, childTokenId, amount);
          await signer0Diamond.approve(signer1, amount);

          await expect(signer1Diamond.transferFrom(signer0, signer2, spend))
            .to.emit(proxyDiamond, "Approval")
            .withArgs(signer0, signer1, amount - spend);
          expect(await proxyDiamond.allowance(signer0, signer1)).to.equal(
            amount - spend,
          );
        });

        it("Should revert on over-spend and move nothing", async () => {
          const amount = ethers.parseEther("10");
          await mockToken.mint(signer0, childTokenId, amount);
          await signer0Diamond.approve(signer1, amount);

          const fromBefore = await proxyDiamond.balanceOf(signer0);
          await expect(
            signer1Diamond.transferFrom(signer0, signer2, amount + 1n),
          ).to.be.revertedWith("ERC20: insufficient allowance");
          // A failed spend leaves both the allowance and the balances intact.
          expect(await proxyDiamond.allowance(signer0, signer1)).to.equal(
            amount,
          );
          expect(await proxyDiamond.balanceOf(signer0)).to.equal(fromBefore);
        });

        it("Should reject a spend with no prior approval (zero allowance)", async () => {
          const amount = ethers.parseEther("10");
          await mockToken.mint(signer0, childTokenId, amount);
          await expect(
            signer1Diamond.transferFrom(signer0, signer2, amount),
          ).to.be.revertedWith("ERC20: insufficient allowance");
        });

        it("Should directly overwrite an allowance without a zero-first step", async () => {
          // D-02 explicitly rejects the USDT-style approve-to-zero-first rule.
          await signer0Diamond.approve(signer1, ethers.parseEther("10"));
          await signer0Diamond.approve(signer1, ethers.parseEther("20"));
          expect(await proxyDiamond.allowance(signer0, signer1)).to.equal(
            ethers.parseEther("20"),
          );
        });

        it("Should never decrement a MaxUint256 allowance across two spends", async () => {
          const amount = ethers.parseEther("10");
          await mockToken.mint(signer0, childTokenId, amount * 2n);
          await signer0Diamond.approve(signer1, ethers.MaxUint256);

          await signer1Diamond.transferFrom(signer0, signer2, amount);
          expect(await proxyDiamond.allowance(signer0, signer1)).to.equal(
            ethers.MaxUint256,
          );

          // The infinite allowance survives a second spend unchanged.
          await signer1Diamond.transferFrom(signer0, signer2, amount);
          expect(await proxyDiamond.allowance(signer0, signer1)).to.equal(
            ethers.MaxUint256,
          );
          expect(await proxyDiamond.balanceOf(signer2)).to.equal(amount * 2n);
        });
      });

      describe("ERC20ProxyFacet Initialization Guard Tests", function () {
        beforeEach(async function () {
          // Every guard test starts from the uninitialized state.
          await rewindToPreInit();
        });

        after(async function () {
          await restoreInitializedFixture();
        });

        it("Should reject a zero ERC-1155 contract address", async () => {
          await expect(
            ownerDiamond.initializeERC20Proxy(
              ethers.ZeroAddress,
              1,
              "ExampleToken",
              "XMPL",
            ),
          ).to.be.revertedWith(
            "ERC20Proxy: ERC1155 contract cannot be zero address",
          );
        });

        it("Should reject a child token ID of zero", async () => {
          await expect(
            ownerDiamond.initializeERC20Proxy(
              mockAddress,
              0,
              "ExampleToken",
              "XMPL",
            ),
          ).to.be.revertedWith("ERC20Proxy: child token ID cannot be zero");
        });

        it("Should reject an empty name", async () => {
          await expect(
            ownerDiamond.initializeERC20Proxy(mockAddress, 1, "", "XMPL"),
          ).to.be.revertedWith("ERC20Proxy: name cannot be empty");
        });

        it("Should reject an empty symbol", async () => {
          await expect(
            ownerDiamond.initializeERC20Proxy(mockAddress, 1, "ExampleToken", ""),
          ).to.be.revertedWith("ERC20Proxy: symbol cannot be empty");
        });

        it("Should reject an EOA ERC-1155 target (warm-up call fails)", async () => {
          // The totalSupply(uint256) warm-up against an EOA returns empty
          // returndata, so the return-data decode reverts.
          await expect(
            ownerDiamond.initializeERC20Proxy(
              signer1,
              1,
              "ExampleToken",
              "XMPL",
            ),
          ).to.be.reverted;
        });

        it("Should reject a wrong-ABI ERC-1155 target (warm-up call fails)", async () => {
          // The ProxyDiamond's own ERC-20 facet exposes totalSupply() with no
          // uint256 argument, so the totalSupply(uint256) selector misses —
          // exactly the old self-pointing configuration.
          await expect(
            ownerDiamond.initializeERC20Proxy(
              diamondAddress,
              1,
              "ExampleToken",
              "XMPL",
            ),
          ).to.be.reverted;
        });

        it("Should only allow the contract owner to initialize", async () => {
          // From the uninitialized state the initializer gate passes and the
          // owner check is what reverts for a non-owner caller.
          await expect(
            signer1Diamond.initializeERC20Proxy(
              mockAddress,
              1,
              "ExampleToken",
              "XMPL",
            ),
          ).to.be.revertedWith("Only Contract Owner allowed");
        });

        it("Should tolerate a valid-but-unminted child token ID", async () => {
          // ERC1155Supply.totalSupply(id) is a pure mapping read returning 0
          // for unminted ids, so the warm-up accepts id 7 (never minted) and
          // initialization commits. This test runs last: its successful init
          // arms the one-shot gate (the after() hook restores the fixture).
          await ownerDiamond.initializeERC20Proxy(
            mockAddress,
            7,
            "Unminted Token",
            "UNMT",
          );
          expect(await proxyDiamond.name()).to.equal("Unminted Token");
          expect(await proxyDiamond.totalSupply()).to.equal(0n);
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

        it("Should NOT expose setApprovalForAll on the ERC-20 surface", async () => {
          // The operator plane is structurally absent from the aggregated
          // proxy ABI. The mock's reverting setApprovalForAll/isApprovedForAll
          // double as runtime tripwires: every passing transfer/approve test
          // above also proves the facet never touches the operator plane.
          // (Absence check via getFunction: ethers v6 does not reliably throw
          // for a missing name on this version, so normalize both outcomes.)
          const contractInterface = proxyDiamond.interface;
          let operatorPlaneFunction: unknown = "present";
          try {
            operatorPlaneFunction = contractInterface.getFunction(
              "setApprovalForAll" as any,
            );
          } catch {
            operatorPlaneFunction = undefined;
          }
          // null (this ethers version) and undefined (newer) both mean absent.
          expect(operatorPlaneFunction).to.not.be.ok;
        });
      });
    });
  }
});
