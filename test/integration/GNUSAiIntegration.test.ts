import { JsonRpcProvider } from "@ethersproject/providers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { assert, expect } from "chai";
import { debug } from "debug";
import { DeployedDiamondData, Diamond } from "@geniusventures/diamonds";
import { formatEther, id } from "ethers";
import { ethers } from "hardhat";
import { multichain } from "@geniusventures/hardhat-multichain";
import { GeniusDiamond } from "../../diamond-typechain-types/GeniusDiamond";
import { GNUS_TOKEN_ID, toWei } from "../../scripts/common";
import {
  LocalDiamondDeployer,
  LocalDiamondDeployerConfig,
} from "../../scripts/setup/LocalDiamondDeployer";
import { getInterfaceID } from "../../scripts/utils/helpers";
import { iObjToString } from "../../scripts/utils/iObjToString";
import { loadDiamondContract } from "../../scripts/utils/loadDiamondArtifact";
import { logEvents } from "../../scripts/utils/logEvents";
import { IERC20Upgradeable__factory } from "../../typechain-types";

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
      let geniusOwner: string;
      let ownerGeniusSigner: SignerWithAddress;
      let geniusDiamond: GeniusDiamond;
      // let signer0Diamond: GeniusDiamond;
      let signer1Diamond: GeniusDiamond;
      let signer2Diamond: GeniusDiamond;
      let ownerGeniusDiamond: GeniusDiamond;

      let ethersMultichain: typeof ethers;
      let outerSnapshotId: string;
      let innerSnapshotId: string;
      let deployedDiamondData: DeployedDiamondData;
      // Used for NFTFactory tests
      let ParentNFTID: bigint;

      // Debug logging function
      const debuglog = (message: string) => {
        if (process.env.DEBUG) {
          console.log(message);
        }
      };
      before(async function () {
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
        deployedDiamondData = diamond.getDeployedDiamondData();

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
        // signer0Diamond = geniusDiamond.connect(signers[0]);
        signer1Diamond = geniusDiamond.connect(signers[1]);
        signer2Diamond = geniusDiamond.connect(signers[2]);

        // get the signer for the geniusOwner

        geniusOwner = diamond.getDeployedDiamondData().DeployerAddress!;
        if (!geniusOwner) {
          diamond.setSigner(signers[0]);
          geniusOwner = signer0;
          ownerGeniusSigner;
        }
        ownerGeniusSigner = await ethersMultichain.getSigner(geniusOwner);

        ownerGeniusDiamond = geniusDiamond.connect(ownerGeniusSigner);

        outerSnapshotId = await provider.send("evm_snapshot", []);
      });

      // Get the chain ID

      beforeEach(async function () {
        innerSnapshotId = await provider.send("evm_snapshot", []);
      });

      afterEach(async () => {
        await provider.send("evm_revert", [innerSnapshotId]);
      });

      after(async () => {
        await provider.send("evm_revert", [outerSnapshotId]);
      });

      // These verify the GNUS Diamond contract is deployed properly so because
      // it is required by the integration tests.
      describe("GNUS Diamond Deployment and Upgrade Validation Tests", async function () {
        it(`should verify that GNUS diamond is deployed and we can get 
          hardhat signers on ${networkName}`, async function () {
          expect(geniusDiamond).to.not.be.null;
          if (networkName !== "hardhat") {
            expect(geniusDiamond.getAddress()).to.be.eq(
              deployedDiamondData.DiamondAddress,
            );
          }
          expect(geniusOwner).to.not.be.undefined;
          expect(geniusOwner).to.be.a("string");
          expect(ownerGeniusSigner).to.be.instanceOf(SignerWithAddress);
        });

        it(`should verify ERC173 contract ownership on ${networkName}`, async function () {
          // check if the owner is the deployer and transfer ownership to the deployer
          const currentContractOwner = await ownerGeniusDiamond.owner();
          expect(currentContractOwner.toLowerCase()).to.be.eq(
            await geniusOwner.toLowerCase(),
          );
        });

        it(`should validate ERC165 interface compatibility on ${networkName}`, async function () {
          // Test ERC165 interface compatibility
          const supportsERC165 =
            await geniusDiamond?.supportsInterface("0x01ffc9a7");
          expect(supportsERC165).to.be.true;

          log(`Diamond deployed and validated on ${networkName}`);
        });

        it(`should verify ERC165 supported interface for ERC1155 on ${networkName}`, async function () {
          // Test ERC165 interface compatibility for ERC1155
          const supportsERC1155 =
            await geniusDiamond?.supportsInterface("0xd9b67a26");
          expect(supportsERC1155).to.be.true;

          log(`ERC1155 interface validated on ${networkName}`);
        });

        it(`should verify ERC165 supported interface for ERC20 on ${networkName}`, async function () {
          log(`Validating ERC20 interface on chain: ${networkName}`);
          // Retrieve the deployed GNUS Diamond contract
          const IERC20UpgradeableInterface =
            IERC20Upgradeable__factory.createInterface();
          // Generate the ERC20 interface ID by XORing with the base interface ID.
          const IERC20InterfaceID = getInterfaceID(IERC20UpgradeableInterface);
          // Assert that the `GeniusDiamond` contract supports the ERC20 interface.
          assert(
            await geniusDiamond.supportsInterface(
              "0x" + IERC20InterfaceID.toString(16).padStart(8, "0"),
            ),
            "Doesn't support IERC20Upgradeable",
          );

          // Test ERC165 interface compatibility for ERC20 '0x37c8e2a0'
          const supportsERC20 = await geniusDiamond.supportsInterface(
            "0x" + IERC20InterfaceID.toString(16).padStart(8, "0"),
          );
          expect(supportsERC20).to.be.true;

          log(`ERC20 interface validated on ${networkName}`);
        });

        it(`should verify that MINTER Role is set on ${networkName}`, async () => {
          console.log(`Verifying MINTER role on chain: ${networkName}`);
          const ownershipFacet = await ethersMultichain.getContractAt(
            "GeniusOwnershipFacet",
            await geniusDiamond.getAddress(),
          );
          const minterRole = await geniusDiamond["MINTER_ROLE"]();
          const owner = await ownershipFacet.connect(ownerGeniusSigner).owner();
          const hasMinterRole = await ownershipFacet.hasRole(minterRole, owner);
          expect(hasMinterRole).to.be.true;
        });

        // Test the ERC20Proxy Project integration with GNUS.ai Project
        it("should verify the GeniusDiamond carries the ERC-1155 surface the ERC20Proxy targets", async function () {
          // ERC20ProxyFacet's D-04 warm-up and balance leg call exactly these
          // ERC-1155 overloads on its target contract, so this deployment can
          // back a proxy only if it answers both for the GNUS token id.
          // (Full proxy wiring against a live child token — totalSupply()/
          // balanceOf() parity through a deployed ProxyDiamond — is covered by
          // the DEXFlow "Live Pair Wiring" suite.)
          const gnusTotalSupply = await geniusDiamond["totalSupply(uint256)"](
            GNUS_TOKEN_ID,
          );
          const ownerBalance = await geniusDiamond["balanceOf(address,uint256)"](
            geniusOwner,
            GNUS_TOKEN_ID,
          );
          expect(gnusTotalSupply).to.be.a("bigint");
          expect(ownerBalance).to.be.a("bigint");
          expect(ownerBalance).to.be.at.most(gnusTotalSupply);
        });
      });

      describe("NFTFactory Tests", async function () {
        beforeEach(async function () {
          // Grant the `CREATOR_ROLE` to the second signer for NFT creation
          await ownerGeniusDiamond.grantRole(id("CREATOR_ROLE"), signer1);

          // Mint sufficient GNUS tokens for testing
          await ownerGeniusDiamond["mint(address,uint256)"](
            signer1,
            toWei(1000),
          );

          // Retrieve information about the GNUS NFT
          const GNUSNFTInfo = await signer1Diamond.getNFTInfo(GNUS_TOKEN_ID);

          // Generate a new parent NFT ID and store it for subsequent tests
          ParentNFTID = GNUSNFTInfo.childCurIndex;

          // Create a new NFT with a specified exchange rate
          await signer1Diamond.createNFT(
            GNUS_TOKEN_ID,
            "TEST GAME",
            "TESTGAME",
            2.0, // Exchange rate (display-only at the new pin — no burn multiplication)
            toWei(50000000 * 2),
            "",
          );

          // Create multiple child NFTs with valid parameters
          await signer1Diamond.createNFTs(
            ParentNFTID,
            ["TESTGAME:NFT1", "TESTGAME:NFT2", "TESTGAME:NFT3"],
            ["", "", ""], // Metadata URIs
            [1, 1, 1], // Exchange rates
            [100, 1, 1], // Supply limits
            ["https://www.gnus.ai", "", ""], // URLs
          );
        });

        // Test case to validate the burning of Tokens for NFT creation
        it("Testing NFT Factory that Example Tokens will burn for address 1", async () => {
          // Mint GNUS tokens to the second signer by the GNUS Contract Owner
          // This would be accomplished by purchasing GNUS in the real world.
          await ownerGeniusDiamond["mint(address,uint256)"](
            signer1,
            toWei(2000),
          );

          // Test that Signer1 can burn 1000 GNUS tokens from their own account
          // TODO: This should be a test
          await signer1Diamond["burn(address,uint256,uint256)"](
            signer1,
            GNUS_TOKEN_ID,
            toWei(1000),
          );

          // Attempt to burn tokens again, expecting rejection due to lack of approval
          await expect(
            ownerGeniusDiamond["burn(address,uint256,uint256)"](
              signer1,
              GNUS_TOKEN_ID,
              toWei(1000),
            ),
          ).to.eventually.be.rejectedWith(
            Error,
            /ERC1155: caller is not owner nor approved/,
          );

          // Verify the remaining balance of the signer after burning
          const amount = await signer1Diamond["balanceOf(address,uint256)"](
            signer1,
            GNUS_TOKEN_ID,
          );
          // Should have 2000 remaining: 1000 from beforeEach + 2000 from this test - 1000 burned = 2000
          assert.equal(
            amount.toString(),
            toWei(2000).toString(),
            `Address one should equal 2000, but equals ${formatEther(amount)}`,
          );
        });

        // Test case to validate restrictions on minting GNUS tokens
        it("Testing NFT Factory to mint GNUS Token", async () => {
          // Attempt to mint GNUS tokens directly, expecting rejection due to factory restrictions
          await expect(
            ownerGeniusDiamond["mint(address,uint256,uint256,bytes)"](
              geniusOwner,
              GNUS_TOKEN_ID,
              toWei(2000),
              "0x",
            ),
          ).to.eventually.be.rejectedWith(
            Error,
            /Shouldn\'t mint GNUS tokens tokens, only deposit and withdraw/,
          );
        });

        // Test case to validate restrictions on NFT creation for unauthorized users
        it("Testing NFT Factory to create new token for non-creator nor admin", async () => {
          // Attempt to create an NFT as an unauthorized user (signer2), expecting rejection
          await expect(
            signer2Diamond.createNFT(
              GNUS_TOKEN_ID,
              "Addr1Token",
              "ADDR1",
              200,
              toWei(50000000 * 200),
              "",
            ),
          ).to.eventually.be.rejectedWith(
            Error,
            /Only Creators or Admins can create NFT child of GNUS/,
          );
        });

        // Test case to validate NFT creation functionality for authorized creators
        it("Testing NFT Factory to create new NFT & child NFTs for creator", async () => {
          // Verify that the NFT was created in beforeEach
          const newNFTInfo = await signer1Diamond.getNFTInfo(ParentNFTID);
          assert(
            newNFTInfo.childCurIndex === 3n,
            `Should have created 3 NFT's, but created ${newNFTInfo.childCurIndex.toString()}`,
          );
          debuglog(`NfTInfo ${iObjToString(newNFTInfo)}`);

          // Attempt to create multiple child NFTs with mismatched array lengths, expecting rejection
          await expect(
            signer1Diamond.createNFTs(
              ParentNFTID,
              ["TESTGAME:NFT4", "TESTGAME:NFT5", "TESTGAME:NFT6"],
              [],
              [],
              [100],
              [],
            ),
          ).to.eventually.be.rejectedWith(
            Error,
            /NFT creation array lengths, should be the same/,
          );

          // Iterate through the created child NFTs and log their details
          // This is really just for debugging, could be removed.
          for (let i = 0; i < 3; i++) {
            const nftID = (ParentNFTID << 128n) | BigInt(i);
            const nftInfo = await signer1Diamond.getNFTInfo(nftID);
            debuglog(`nftInfo${i.toString()} ${iObjToString(nftInfo)}}`);
          }
        });

        // Test case to validate minting restrictions for unauthorized users
        it("Testing NFT Factory to mint child tokens of GNUS with address 2", async () => {
          // Attempt to mint child tokens as an unauthorized user, expecting rejection
          await expect(
            signer2Diamond["mint(address,uint256,uint256,bytes)"](
              signer2, // Recipient address
              ParentNFTID, // Parent NFT ID
              toWei(5), // Amount to mint
              "0x", // Additional data
            ),
          ).to.be.eventually.rejectedWith(
            Error,
            /Creator or Admin can only mint NFT/,
          );
        });

        // Test case to validate successful minting of child NFTs by an authorized user
        it("Testing NFT Factory to mint child NFTS (tokens) of GNUS with address 1", async () => {
          // Retrieve the starting supply of GNUS tokens
          const startingSupply =
            await geniusDiamond["totalSupply(uint256)"](GNUS_TOKEN_ID);
          debuglog(`Starting GNUS Supply: ${formatEther(startingSupply)}`);

          // Mint child NFTs using an authorized user
          const tx = await signer1Diamond[
            "mint(address,uint256,uint256,bytes)"
          ](
            signer2, // Recipient address
            ParentNFTID, // Parent NFT ID
            toWei(5), // Amount to mint
            "0x", // Additional data
          );

          // Log the transaction events for debugging
          await logEvents(tx);

          // Retrieve the ending supply of GNUS tokens
          const endingSupply =
            await geniusDiamond["totalSupply(uint256)"](GNUS_TOKEN_ID);

          // Calculate the burned supply as the difference between starting and ending supply
          const burntSupply = startingSupply - endingSupply;

          // Assert that the burned supply matches the minted child amount 1:1.
          // Phase 9 D1 at pin 61b7ca4: the 4-arg factory mint burns the caller's
          // GNUS minion-denominated 1:1 — the minted amount (toWei(5)) is burned
          // exactly. exchangeRate is stored display-only; no multiplication.
          assert(
            burntSupply === toWei(5.0), // 1:1 — burn equals the minted child amount
            `Burnt Supply should equal the minted child amount 1:1 (5.0), but equals ${burntSupply.toString()}`,
          );

          // Log the total GNUS burned for debugging
          debuglog(`Total GNUS burned: ${formatEther(burntSupply)}`);
        });

        // Test case to validate minting restrictions for unauthorized users
        it("Testing NFT Factory to mint child NFTs of Addr1 Token", async () => {
          // Calculate the child NFT ID based on the parent NFT ID
          const addr1childNFT1 = (ParentNFTID << 128n) | 0n;

          // Attempt to mint child NFTs as an unauthorized user, expecting rejection
          await expect(
            signer2Diamond["mint(address,uint256,uint256,bytes)"](
              signer2, // Recipient address
              addr1childNFT1, // Child NFT ID
              toWei(5), // Amount to mint
              "0x", // Additional data
            ),
          ).to.be.eventually.rejectedWith(
            Error,
            /Creator or Admin can only mint NFT/,
          );
        });

        // Test case to validate successful minting of multiple child NFTs by an authorized user
        it("Testing NFT Factory to mintBatch child NFTs of GNUS with address 1 (1:1)", async () => {
          // Phase 9 D6 depth gate at the new pin (GNUSNFTFactory.beforeMint):
          // factory mint/mintBatch only accepts DIRECT children of GNUS
          // ((id >> 128) == GNUS_TOKEN_ID); deeper descendants revert with
          // "Direct children only; use convert() for descendants" and must be
          // issued via GNUSTreasury.convert. The old grandchildren-of-Addr1
          // batch is therefore unmintable — this test now batches three fresh
          // direct children of GNUS created here with the same supply limits.
          const firstBatchChildID = (
            await signer1Diamond.getNFTInfo(GNUS_TOKEN_ID)
          ).childCurIndex;
          await signer1Diamond.createNFTs(
            GNUS_TOKEN_ID,
            ["TESTGAME:BATCH1", "TESTGAME:BATCH2", "TESTGAME:BATCH3"],
            ["", "", ""], // Metadata URIs
            [1, 1, 1], // Exchange rates (display-only at the new pin)
            [100, 1, 1], // Supply limits
            ["", "", ""], // URLs
          );
          const addr1childNFT1 = firstBatchChildID;
          const addr1childNFT2 = firstBatchChildID + 1n;
          const addr1childNFT3 = firstBatchChildID + 2n;

          // Retrieve the starting supply of GNUS tokens (read after the
          // createNFTs above — creation performs no burns, but this keeps the
          // delta scoped to the mintBatch itself)
          const startingSupply =
            await geniusDiamond["totalSupply(uint256)"](GNUS_TOKEN_ID);
          debuglog(`Starting GNUS Supply: ${formatEther(startingSupply)}`);

          // Attempt to mint more tokens than allowed, expecting rejection
          await expect(
            signer1Diamond["mintBatch(address,uint256[],uint256[],bytes)"](
              signer2, // Recipient address
              [addr1childNFT1, addr1childNFT2, addr1childNFT3], // Child NFT IDs
              [5, 100, 10], // Exceeding amounts
              "0x", // Additional data
            ),
          ).to.be.eventually.rejectedWith(
            Error,
            "Max Supply for NFT would be exceeded",
          );

          // Mint valid amounts for child NFTs
          const tx = await signer1Diamond[
            "mintBatch(address,uint256[],uint256[],bytes)"
          ](
            signer2, // Recipient address
            [addr1childNFT1, addr1childNFT2, addr1childNFT3], // Child NFT IDs
            [50, 1, 1], // Valid amounts
            "0x", // Additional data
          );

          // Log the transaction events for debugging
          await logEvents(tx);

          // Retrieve the ending supply of GNUS tokens
          const endingSupply =
            await geniusDiamond["totalSupply(uint256)"](GNUS_TOKEN_ID);

          // Calculate the burned supply as the difference between starting and ending supply
          const burntSupply = startingSupply - endingSupply;
          debuglog(`Total GNUS burned: ${burntSupply.toString()}`);

          // Assert the 1:1 burn rule (Phase 9 D1): the burn equals the total
          // child amount minted (50 + 1 + 1 = 52 minions, plain
          // minion-denominated), no exchange-rate multiplication anywhere.
          assert(
            burntSupply === 52n,
            `Burnt Supply should equal the minted child amounts 1:1 (52), but equals ${burntSupply.toString()}`,
          );

          // Verify the recipient received exactly the minted amounts
          const batchAmounts = [50, 1, 1];
          const recipientBalances = await geniusDiamond.balanceOfBatch(
            [signer2, signer2, signer2],
            [addr1childNFT1, addr1childNFT2, addr1childNFT3],
          );
          recipientBalances.forEach((balance, index) => {
            assert(
              balance === BigInt(batchAmounts[index]),
              `Recipient balance for child ${index} should equal ${batchAmounts[index]}, but equals ${balance.toString()}`,
            );
          });
        });
      });
    });
  }
});
