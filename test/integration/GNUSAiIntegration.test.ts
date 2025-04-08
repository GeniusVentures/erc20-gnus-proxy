import { expect, assert } from "chai";
// import { ethers } from "hardhat";
import hre from 'hardhat';
import { utils, BigNumber } from 'ethers';
import { debug } from 'debug';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { multichain } from 'hardhat-multichain';
import TestDeployer from '../setup/testDeployer';
import { deployments } from '../../scripts/deployments';
import { IERC20Upgradeable__factory } from '../../typechain-types';
import { getInterfaceID } from '../../scripts/FacetSelectors';
import { ProxyDiamond } from '../../typechain-types/';
import { ERC1155SupplyUpgradeable, ERC1155Upgradeable, ERC20ProxyFacet } from "../../typechain-types";
import { toWei, GNUS_TOKEN_ID, XMPL_TOKEN_ID, toBN } from "../../scripts/common";
import { iObjToString } from "../utils/iObjToString";
import { logEvents } from "../utils/logEvents";
import MultiChainTestDeployer from './gnus-ai/test/setup/multichainTestDeployer';
import { deployments as gnusDeployments } from './gnus-ai/scripts/deployments';
import { GeniusDiamond } from './gnus-ai/typechain-types';

describe('ERC20Proxy Tests', async function () {
  const log: debug.Debugger = debug('DiamondDeploy:log');
  this.timeout(0); // Extend timeout to accommodate deployments

  let chains = multichain.getProviders() || new Map<string, JsonRpcProvider>();

  // Check the process.argv for the Hardhat network name
  if (process.argv.includes('test-multichain')) {
    const chainNames = process.argv[process.argv.indexOf('--chains') + 1].split(',');
    if (chainNames.includes('hardhat')) {
      chains = chains.set('hardhat', hre.ethers.provider);

    }
  } else if (process.argv.includes('test') || process.argv.includes('coverage')) {
    chains = chains.set('hardhat', hre.ethers.provider);
  }

  for (const [chainName, provider] of chains.entries()) {

    describe(`ERC20Proxy Tests for ${chainName} chain`, async function () {

      let deployer: TestDeployer;
      let deployment: boolean | void;
      let upgrade: boolean | void;

      let gnusDeployer: MultiChainTestDeployer;
      let gnusDeployment: boolean | void;
      let gnusUpgrade: boolean | void;
      let gnusDiamond: GeniusDiamond;


      let gnusOwner: string;
      let gnusOwnerSigner: SignerWithAddress;
      let gnusOwnerDiamond: GeniusDiamond;

      let signer0GNUSDiamond: GeniusDiamond;
      let signer1GNUSDiamond: GeniusDiamond;
      let signer2GNUSDiamond: GeniusDiamond;

      let signers: SignerWithAddress[];
      let signer0: string;
      let signer1: string;
      let signer2: string;
      let signer0Diamond: ProxyDiamond;
      let signer1Diamond: ProxyDiamond;
      let signer2Diamond: ProxyDiamond;

      // get the signer for the owner
      let owner: string;
      let ownerSigner: SignerWithAddress;
      let diamond: ProxyDiamond;
      let ownerDiamond: ProxyDiamond;

      let ethersMultichain: typeof hre.ethers;
      let outerSnapshotId: string;
      let innerSnapshotId: string;

      // Used for NFTFactory tests
      const ParentNFTID: BigNumber = toBN(1);

      before(async function () {

        const deployConfig = {
          chainName: chainName,
          provider: provider,
        };

        ethersMultichain = hre.ethers;
        ethersMultichain.provider = provider;
        hre.ethers.provider = provider;

        // Deploy the GNUS Diamond contract
        gnusDeployer = await MultiChainTestDeployer.getInstance(deployConfig);
        deployment = await gnusDeployer.deploy();
        expect(deployment).to.be.true;
        upgrade = await gnusDeployer.upgrade();
        expect(upgrade).to.be.true;
        // Retrieve the deployed GNUS Diamond contract
        gnusDiamond = await gnusDeployer.getDiamond();
        if (!gnusDiamond) {
          throw new Error(`gnusDiamond is null for chain ${chainName}`);
        }

        // Deploy the ERC20Proxy Diamond contract
        deployer = await TestDeployer.getInstance(deployConfig);
        deployment = await deployer.deploy();
        expect(deployment).to.be.true;
        upgrade = await deployer.upgrade();
        expect(upgrade).to.be.true;
        // Retrieve the deployed Diamond contract
        diamond = await deployer.getDiamond();
        if (!diamond) {
          throw new Error(`diamond is null for chain ${chainName}`);
        }

        // This is used to set the contract at the point of full deployment of contracts
        // for both GNUS-ai and ERC20Proxy but before the creation of Tokens in the 
        // GNUS-ai Diamond contract.
        outerSnapshotId = await provider.send('evm_snapshot', []);

        // Retrieve the signers for the chain
        signers = await hre.ethers.getSigners();
        signer0 = signers[0].address;
        signer1 = signers[1].address;
        signer2 = signers[2].address;

        // Get the GNUS Diamond Contract address from the deployment in the node module
        const GNUSDiamondAddress = gnusDiamond.address;

        gnusOwner = gnusDeployments[chainName]?.DeployerAddress || signer0;
        gnusOwnerSigner = await ethersMultichain.getSigner(gnusOwner);
        gnusOwnerDiamond = gnusDiamond.connect(gnusOwnerSigner);

        signer0GNUSDiamond = gnusDiamond.connect(signers[0]);
        signer1GNUSDiamond = gnusDiamond.connect(signers[1]);
        signer2GNUSDiamond = gnusDiamond.connect(signers[2]);


        signer0Diamond = diamond.connect(signers[0]);
        signer1Diamond = diamond.connect(signers[1]);
        signer2Diamond = diamond.connect(signers[2]);

        // get the signer for the owner, if hardhat network use the signer0
        owner = deployments[chainName]?.DeployerAddress || signer0;
        ownerSigner = await ethersMultichain.getSigner(owner);
        ownerDiamond = diamond.connect(ownerSigner);

        // Get the chain ID
        const chainID = await ethersMultichain.provider.getNetwork().then(network => network.chainId);

      });


      beforeEach(async function () {
        innerSnapshotId = await provider.send('evm_snapshot', []);
      });

      afterEach(async () => {
        await provider.send('evm_revert', [innerSnapshotId]);
      });

      after(async () => {
        outerSnapshotId = await provider.send('evm_snapshot', []);
      });

      // These verify the GNUS Diamond contract is deployed properly so because
      // it is required by the integration tests.
      describe('GNUS Diamond Deployment and Upgrade Validation Tests', async function () {
        it(`should verify that GNUS diamond is deployed and we can get 
          hardhat signers on ${chainName}`, async function () {
          expect(gnusDiamond).to.not.be.null;
          if (chainName !== 'hardhat') {
            expect(gnusDiamond.address).to.be.eq(gnusDeployments[chainName].DiamondAddress);
          }
          expect(gnusOwner).to.not.be.undefined;
          expect(gnusOwner).to.be.a('string');
          // expect(gnusOowner).to.be.properAddress;
          expect(gnusOwnerSigner).to.be.instanceOf(SignerWithAddress);
        });

        it(`should verify ERC173 contract ownership on ${chainName}`, async function () {
          // check if the owner is the deployer and transfer ownership to the deployer
          const currentContractOwner = await gnusOwnerDiamond.owner();
          expect(currentContractOwner.toLowerCase()).to.be.eq(await owner.toLowerCase());
        });

        it(`should validate ERC165 interface compatibility on ${chainName}`, async function () {
          // Test ERC165 interface compatibility
          const supportsERC165 = await gnusDiamond?.supportsInterface('0x01ffc9a7');
          expect(supportsERC165).to.be.true;

          log(`Diamond deployed and validated on ${chainName}`);
        });

        it(`should verify ERC165 supported interface for ERC1155 on ${chainName}`, async function () {

          // Test ERC165 interface compatibility for ERC1155
          const supportsERC1155 = await gnusDiamond?.supportsInterface('0xd9b67a26');
          expect(supportsERC1155).to.be.true;

          log(`ERC1155 interface validated on ${chainName}`);
        });

        it(`should verify ERC165 supported interface for ERC20 on ${chainName}`, async function () {
          log(`Validating ERC20 interface on chain: ${chainName}`);
          // Retrieve the deployed GNUS Diamond contract
          const IERC20UpgradeableInterface = IERC20Upgradeable__factory.createInterface();
          // Generate the ERC20 interface ID by XORing with the base interface ID.
          const IERC20InterfaceID = getInterfaceID(IERC20UpgradeableInterface);
          // Assert that the `gnusDiamond` contract supports the ERC20 interface.
          assert(
            await gnusDiamond?.supportsInterface(IERC20InterfaceID._hex),
            "Doesn't support IERC20Upgradeable",
          );

          // Test ERC165 interface compatibility for ERC20 '0x37c8e2a0'
          const supportsERC20 = await gnusDiamond?.supportsInterface(IERC20InterfaceID._hex);
          expect(supportsERC20).to.be.true;

          log(`ERC20 interface validated on ${chainName}`);
        });

        it(`should verify that MINTER Role is set on ${chainName}`, async () => {
          console.log(`Verifying MINTER role on chain: ${chainName}`);
          const ownershipFacet = await ethersMultichain.getContractAt('GeniusOwnershipFacet', gnusDiamond.address);
          const minterRole = await gnusDiamond['MINTER_ROLE']();
          // const deployerAddress = deployments[chainName]?.DeployerAddress ?? owner;
          const owner = await ownershipFacet.connect(ownerSigner).owner();
          const hasMinterRole = await ownershipFacet.hasRole(minterRole, owner);
          expect(hasMinterRole).to.be.true;
        });

        // Test the ERC20Proxy Project integration with GNUS.ai Project
        it('should verify the ERC20Proxy has the TestToken', async function () {

        });
      });

      describe('NFTFactory Tests', async function () {
        // Test case to validate the burning of Tokens for NFT creation
        it('Testing NFT Factory that Example Tokens will burn for address 1', async () => {
          // Mint GNUS tokens to the second signer by the GNUS Contract Owner
          // This would be accomplished by purchasing GNUS in the real world.
          await gnusOwnerDiamond['mint(address,uint256)'](signer1, toWei(2000));

          // Test that Signer1 can burn 1000 GNUS tokens from their own account
          // TODO: This should be a test
          await signer1GNUSDiamond['burn(address,uint256,uint256)'](
            signer1,
            GNUS_TOKEN_ID,
            toWei(1000),
          );

          // Attempt to burn tokens again, expecting rejection due to lack of approval
          const tx = await expect(
            gnusOwnerDiamond['burn(address,uint256,uint256)'](
              signer1,
              GNUS_TOKEN_ID,
              toWei(1000),
            ),
          ).to.eventually.be.rejectedWith(Error, /ERC1155: caller is not owner nor approved/);

          // Log the transaction events for debugging
          // await logEvents(tx);

          // Verify the remaining balance of the signer after burning
          const amount = await signer1GNUSDiamond['balanceOf(address,uint256)'](
            signer1,
            GNUS_TOKEN_ID,
          );
          assert(
            amount.eq(toWei(1000)),
            `Address one should equal 1000, but equals ${utils.formatEther(amount)}`,
          );
        });

        // Test case to validate restrictions on minting GNUS tokens
        it('Testing NFT Factory to mint GNUS Token', async () => {
          // Attempt to mint GNUS tokens directly, expecting rejection due to factory restrictions
          await expect(
            gnusOwnerDiamond["mint(address,uint256,uint256,bytes)"](owner, GNUS_TOKEN_ID, toWei(2000), []),
          ).to.eventually.be.rejectedWith(
            Error,
            /Shouldn\'t mint GNUS tokens tokens, only deposit and withdraw/,
          );
        });

        // Test case to validate restrictions on NFT creation for unauthorized users
        it('Testing NFT Factory to create new token for non-creator nor admin', async () => {
          // Attempt to create an NFT as an unauthorized user, expecting rejection
          await expect(
            signer1GNUSDiamond.createNFT(
              GNUS_TOKEN_ID,
              'Addr1Token',
              'ADDR1',
              200,
              toWei(50000000 * 200),
              '',
            ),
          ).to.eventually.be.rejectedWith(
            Error,
            /Only Creators or Admins can create NFT child of GNUS/,
          );
        });

        // Test case to validate NFT creation functionality for authorized creators
        it('Testing NFT Factory to create new NFT & child NFTs for creator', async () => {
          // Grant the `CREATOR_ROLE` to the second signer
          await gnusOwnerDiamond.grantRole(utils.id('CREATOR_ROLE'), signer1);

          // Retrieve information about the GNUS NFT
          const GNUSNFTInfo = await signer1GNUSDiamond.getNFTInfo(GNUS_TOKEN_ID);

          // Generate a new parent NFT ID
          const newParentNFTID = GNUSNFTInfo.childCurIndex;

          // Create a new NFT with a specified exchange rate
          await signer1GNUSDiamond.createNFT(
            GNUS_TOKEN_ID,
            'TEST GAME',
            'TESTGAME',
            toBN(2.0), // Exchange rate: 2.0 tokens for 1 GNUS token
            toWei(50000000 * 2),
            '',
          );

          // Retrieve information about the newly created NFT
          let newNFTInfo = await signer1GNUSDiamond.getNFTInfo(newParentNFTID);
          debuglog(`NfTInfo ${iObjToString(newNFTInfo)}`);

          // Attempt to create multiple child NFTs with mismatched array lengths, expecting rejection
          await expect(
            signer1GNUSDiamond.createNFTs(
              newParentNFTID,
              ['TESTGAME:NFT1', 'TESTGAME:NFT2', 'TESTGAME:NFT3'],
              [],
              [],
              [100],
              [],
            ),
          ).to.eventually.be.rejectedWith(
            Error,
            /NFT creation array lengths, should be the same/,
          );

          // Create multiple child NFTs with valid parameters
          await signer1GNUSDiamond.createNFTs(
            newParentNFTID,
            ['TESTGAME:NFT1', 'TESTGAME:NFT2', 'TESTGAME:NFT3'],
            ['', '', ''], // Metadata URIs
            [1, 1, 1], // Exchange rates
            [100, 1, 1], // Supply limits
            ['https://www.gnus.ai', '', ''], // URLs
          );

          // Retrieve updated information about the parent NFT
          newNFTInfo = await signer1GNUSDiamond.getNFTInfo(newParentNFTID);
          assert(
            newNFTInfo.childCurIndex.eq(3),
            `Should have created 3 NFT's, but created ${newNFTInfo.childCurIndex.toString()}`,
          );
          debuglog(`NfTInfo ${iObjToString(newNFTInfo)}`);

          // Iterate through the created child NFTs and log their details
          // This is really just for debugging, could be removed.
          for (let i = 0; i < 3; i++) {
            const nftID = newParentNFTID.shl(128).or(i);
            const nftInfo = await signer1GNUSDiamond.getNFTInfo(nftID);
            debuglog(`nftInfo${i.toString()} ${iObjToString(nftInfo)}}`);
          }
        });

        // Test case to validate minting restrictions for unauthorized users
        it('Testing NFT Factory to mint child tokens of GNUS with address 2', async () => {
          // Attempt to mint child tokens as an unauthorized user, expecting rejection
          await expect(
            signer2GNUSDiamond['mint(address,uint256,uint256,bytes)'](
              signer2, // Recipient address
              ParentNFTID, // Parent NFT ID
              toWei(5), // Amount to mint
              [], // Additional data
            ),
          ).to.be.eventually.rejectedWith(Error, /Creator or Admin can only mint NFT/);
        });

        // Test case to validate successful minting of child NFTs by an authorized user
        it('Testing NFT Factory to mint child NFTS (tokens) of GNUS with address 1', async () => {
          // Retrieve the starting supply of GNUS tokens
          const startingSupply = await gnusDiamond['totalSupply(uint256)'](GNUS_TOKEN_ID);
          debuglog(`Starting GNUS Supply: ${utils.formatEther(startingSupply)}`);

          // Mint child NFTs using an authorized user
          const tx = await signer1GNUSDiamond['mint(address,uint256,uint256,bytes)'](
            signer2, // Recipient address
            ParentNFTID, // Parent NFT ID
            toWei(5), // Amount to mint
            [], // Additional data
          );

          // Log the transaction events for debugging
          await logEvents(tx);

          // Retrieve the ending supply of GNUS tokens
          const endingSupply = await gnusDiamond['totalSupply(uint256)'](GNUS_TOKEN_ID);

          // Calculate the burned supply as the difference between starting and ending supply
          const burntSupply = startingSupply.sub(endingSupply);

          // Assert that the burned supply matches the expected value based on the exchange rate
          assert(
            burntSupply.eq(toWei(5.0 * 2.0)), // Exchange rate: 2.0 GNUS burned per minted token
            `Burnt Supply should equal minted * exchange rate (5.0*2.0), but equals ${burntSupply.toString()}`,
          );

          // Log the total GNUS burned for debugging
          debuglog(`Total GNUS burned: ${utils.formatEther(burntSupply)}`);
        });


        // Test case to validate minting restrictions for unauthorized users
        it("Testing NFT Factory to mint child NFTs of Addr1 Token", async () => {
          // Calculate the child NFT ID based on the parent NFT ID
          const addr1childNFT1 = ParentNFTID.shl(128).or(0);

          // Attempt to mint child NFTs as an unauthorized user, expecting rejection
          await expect(
            signer2GNUSDiamond['mint(address,uint256,uint256,bytes)'](
              signer2, // Recipient address
              addr1childNFT1, // Child NFT ID
              toWei(5), // Amount to mint
              [], // Additional data
            ),
          ).to.be.eventually.rejectedWith(Error, /Creator or Admin can only mint NFT/);
        });

        // Test case to validate successful minting of multiple child NFTs by an authorized user
        it('Testing NFT Factory to mint child NFTs of Addr1 with address 1', async () => {
          // Calculate IDs for three child NFTs based on the parent NFT ID
          const addr1childNFT1 = ParentNFTID.shl(128).or(0);
          const addr1childNFT2 = ParentNFTID.shl(128).or(1);
          const addr1childNFT3 = ParentNFTID.shl(128).or(2);

          // Retrieve the starting supply of GNUS tokens
          const startingSupply = await gnusDiamond['totalSupply(uint256)'](GNUS_TOKEN_ID);
          debuglog(`Starting GNUS Supply: ${utils.formatEther(startingSupply)}`);

          // Attempt to mint more tokens than allowed, expecting rejection
          await expect(
            signer1GNUSDiamond['mintBatch(address,uint256[],uint256[],bytes)'](
              signer2, // Recipient address
              [addr1childNFT1, addr1childNFT2, addr1childNFT3], // Child NFT IDs
              [5, 100, 10], // Exceeding amounts
              [], // Additional data
            ),
          ).to.be.eventually.rejectedWith(Error, 'Max Supply for NFT would be exceeded');

          // Mint valid amounts for child NFTs
          const tx = await signer1GNUSDiamond['mintBatch(address,uint256[],uint256[],bytes)'](
            signer2, // Recipient address
            [addr1childNFT1, addr1childNFT2, addr1childNFT3], // Child NFT IDs
            [50, 1, 1], // Valid amounts
            [], // Additional data
          );

          // Log the transaction events for debugging
          await logEvents(tx);

          // Retrieve the ending supply of GNUS tokens
          const endingSupply = await gnusDiamond['totalSupply(uint256)'](GNUS_TOKEN_ID);

          // Calculate the burned supply as the difference between starting and ending supply
          const burntSupply = startingSupply.sub(endingSupply);
          debuglog(`Total GNUS burned: ${utils.formatEther(burntSupply)}`);

          // Iterate through the child NFTs to log their total supply
          // Only needed for troubleshooting.
          // for (let i = 0; i < 3; i++) {
          //   const nftID = ParentNFTID.shl(128).or(i);
          //   const totalSupply = await signer1GNUSDiamond['totalSupply(uint256)'](nftID);
          //   debuglog(`Total Supply for ParentNFT1:NFT${i + 1} ${totalSupply}`);
          // }

          // Retrieve and store symbols for the GNUS token and parent NFT
          const symbols: string[] = [];
          symbols.push((await gnusDiamond.getNFTInfo(GNUS_TOKEN_ID)).symbol);
          symbols.push((await gnusDiamond.getNFTInfo(ParentNFTID)).symbol);

          // Prepare arrays to query batch balances
          const addrs: string[] = [];
          const tokenIDs: BigNumber[] = [];

          // Fill the arrays with addresses and token IDs
          for (let i = 0; i < 3; i++) {
            addrs.push(signers[i].address);
            tokenIDs.push(GNUS_TOKEN_ID); // GNUS token
            addrs.push(signers[i].address);
            tokenIDs.push(ParentNFTID); // Parent NFT
            for (let j = 0; j < 3; j++) {
              addrs.push(signers[i].address);
              tokenIDs.push(ParentNFTID.shl(128).or(j)); // Child NFTs
            }
          }

          // Query batch balances for the prepared addresses and token IDs
          const ownedNFTs = await gnusDiamond.balanceOfBatch(addrs, tokenIDs);

          // Log the balances for each address and NFT
          ownedNFTs.forEach((bn, index) => {
            const addr = Math.floor(index / 5); // Determine address index
            const parentNFT = index % 5 ? 1 : 0; // Check if it's a parent NFT
            const childNFT = parentNFT ? Math.floor((index - 1) % 5) : 0; // Determine child NFT index
            debuglog(
              `Address ${addr} has ${parentNFT && childNFT ? bn.toNumber() : utils.formatEther(bn)
              } ${symbols[parentNFT]}::ChildNFT${childNFT} NFTs`,
            );
          });

          // TODO There is no test at the end of all this processing.  Its just a lot of logging.
        });
      });
    });
  }
});
