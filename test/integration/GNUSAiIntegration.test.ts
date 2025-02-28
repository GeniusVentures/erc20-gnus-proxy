import { expect, assert } from "chai";
import { ethers } from "hardhat";
import hre from 'hardhat';
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
import { toWei, GNUS_TOKEN_ID } from "../../scripts/common";
import MultiChainTestDeployer from './gnus-ai/test/setup/multichainTestDeployer';
import { deployments as gnusDeployments } from './gnus-ai/scripts/deployments';
import { GeniusDiamond } from './gnus-ai/typechain-types/GeniusDiamond';

describe('ERC20Proxy Tests', async function () {
  const log: debug.Debugger = debug('DiamondDeploy:log');
  this.timeout(0); // Extend timeout to accommodate deployments
  
  let chains = multichain.getProviders() || new Map<string, JsonRpcProvider>();
  
  // Check the process.argv for the Hardhat network name
  if (process.argv.includes('test-multichain')) {
    const chainNames = process.argv[process.argv.indexOf('--chains') + 1].split(',');
    if (chainNames.includes('hardhat')) {
      chains = chains.set('hardhat', ethers.provider);
      
    }
  } else if (process.argv.includes('test') || process.argv.includes('coverage')) {
    chains = chains.set('hardhat', ethers.provider);
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
      
      let ethersMultichain: typeof ethers;
      let outerSnapshotId: string;
      let innerSnapshotId: string;
      
      before(async function () {
        
        const deployConfig = {
            chainName: chainName,
            provider: provider,
        };
        
                
        ethersMultichain = ethers;
        ethersMultichain.provider = provider;
        
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
        
        // Get the GNUS Diamond Contract address from the deployment in the node module
        const GNUSDiamondAddress = gnusDiamond.address; 

        gnusOwner = gnusDeployments[chainName]?.DeployerAddress || signer0;
        gnusOwnerSigner = await ethersMultichain.getSigner(gnusOwner);
        gnusOwnerDiamond = gnusDiamond.connect(gnusOwnerSigner);
        
        signer0GNUSDiamond = gnusDiamond.connect(signers[0]);
        signer1GNUSDiamond = gnusDiamond.connect(signers[1]);
        signer2GNUSDiamond = gnusDiamond.connect(signers[2]);
        
        // Retrieve the signers for the chain
        signers = await ethersMultichain.getSigners();
        signer0 = signers[0].address;
        signer1 = signers[1].address;
        signer2 = signers[2].address;
        
        signer0Diamond = diamond.connect(signers[0]);
        signer1Diamond = diamond.connect(signers[1]);
        signer2Diamond = diamond.connect(signers[2]);
        
        // get the signer for the owner, if hardhat network use the signer0
        owner = deployments[chainName]?.DeployerAddress || signer0;
        ownerSigner = await ethersMultichain.getSigner(owner);
        ownerDiamond = diamond.connect(ownerSigner);
        
        // Get the chain ID
        const chainID = await ethersMultichain.provider.getNetwork().then(network => network.chainId);
        
        // Initialize the ERC20Proxy Diamond contract with the GNUS Diamond contract address
        // await ownerDiamond.initializeERC20Proxy(
        //     GNUSDiamondAddress,
        //     chainID,
        //     "TestToken",
        //     "TST"
        // );
        
        // // Mint the TestToken on the ERC20Proxy Diamond contract
        // // await ownerDiamond.mint("TestToken", toWei(1000));
        
        // Create the TestToken on teh GNUS Diamond contract
        // await gnusOwnerDiamond.createNFT(
        //     "TestToken",
        //     "TST",
        //     18,
        //     toWei(1000000)
        // );
    
        // // Mint the TestToken on the GNUS Diamond contract
        // await ownerDiamond.mintERC20Token(
        //     "TestToken",
        //     toWei(1000)
        // );
        
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
    
      describe('GNUS Diamond Deployment and Upgrade Validation Tests', async function () {
        it(`should verify that ${chainName} diamond is deployed and we can get hardhat signers on ${chainName}`, async function () {
            expect(gnusDiamond).to.not.be.null;
            expect(gnusDiamond.address).to.be.eq(gnusDeployments[chainName].DiamondAddress);
            
            expect(gnusOwner).to.not.be.undefined;
            expect(gnusOwner).to.be.a('string');
            // expect(owner).to.be.properAddress;
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
      
      // Test that the ERC20Proxy can mint the TestToken on the GNUS.ai Diamond contract
      
    });
  }
});
