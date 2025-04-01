// import { debug } from 'debug';
// import { expect, assert } from 'chai';
// import { ethers } from 'hardhat';
// import hre from 'hardhat';
// import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
// import { JsonRpcProvider } from '@ethersproject/providers';
// import { multichain } from 'hardhat-multichain';
// import { IERC20Upgradeable__factory } from '../../typechain-types';
// // import { getInterfaceID } from '../FacetSelectors';
// import { ProxyDiamond } from '../../typechain-types';
// import { DiamondDeployer, 
//   DiamondDeploymentManager, 
//   DeploymentInfo, 
//   INetworkDeployInfo 
// } from '@gnus.ai/diamonds';

// describe('Multichain Fork and Diamond Deployment Tests', async function () {
//   const log: debug.Debugger = debug('GNUSDeploy:log');
//   this.timeout(0); // Extend timeout to accommodate deployments
  
//   // Retrieves the providers from the Multichain plugin or an empty `chains` Map 
//   // for the default ethers provider
//   let chains = multichain.getProviders() || new Map<string, JsonRpcProvider>();
  
//   // Check the process.argv for the Hardhat network name
//   if (process.argv.includes('test-multichain')) {
//     const chainNames = process.argv[process.argv.indexOf('--chains') + 1].split(',');
//     if (chainNames.includes('hardhat')) {
//       chains = chains.set('hardhat', ethers.provider);
//     }
//     // default to hardhat if no chain is specified
//   } else if (process.argv.includes('test') || process.argv.includes('coverage')) {
//     chains = chains.set('hardhat', ethers.provider);
//   }
  
//   for (const [chainName, provider] of chains.entries()) { 
  
//     describe(`Testing ${chainName} chain and deployment`, async function () {
//       let deployment: INetworkDeployInfo | void | null;
//       let diamond: ProxyDiamond;
//       let upgrade: boolean | void;
//       let signers: SignerWithAddress[];
//       let signer0: string;
//       let signer1: string;
//       let signer2: string;
//       let signer0Diamond: ProxyDiamond;
//       let signer1Diamond: ProxyDiamond;
//       let signer2Diamond: ProxyDiamond;
//       let owner: string;
//       let ownerSigner: SignerWithAddress;
//       let ownerDiamond: ProxyDiamond;
//       let ethersMultichain: typeof ethers;
//       let snapshotId: string;
      
//       before(async function () {
//         // Create a new TestDeployer instance for the chain
//         // Note: The contractsPath must be formatted relative to the project root.
//         // If diamond contract is in contracts/subdirectory/Diamond.sol then the value
//         // should be:
//         // contractsPath: 'contracts/<diamond-contracts-subdirectory>'
//         // const diamondName = 'ProxyDiamond';
//         const diamondName = 'GeniusDiamond';
//         const deployConfig: DeploymentInfo = {
//           networkName: chainName,
//           chainId: (await provider.getNetwork()).chainId ?? 31337,
//           diamondName: diamondName,
//           provider: provider,
//           contractsPath: hre.config.diamonds?.[diamondName]?.facets_path ?? '',
//           deploymentsPath: hre.config.diamonds?.[diamondName]?.deployments_path ?? '',
//           facetsPath: '',
//         };
//         const deployer = await DiamondDeployer.getInstance(deployConfig);
//         deployment = await deployer.deploy();
//         expect(deployer).to.not.be.undefined;
//         upgrade = await deployer.upgrade();
//         expect(upgrade).to.be.true;
//         // Retrieve the deployed  Diamond contract
//         diamond = (await deployer.getDiamond()) as ProxyDiamond;    
//         if (!diamond) {
//           throw new Error(`diamond is null for chain ${chainName}`);
//         }
        
//         ethersMultichain = ethers;
//         ethersMultichain.provider = provider;
        
//         // Retrieve the signers for the chain
//         signers = await ethersMultichain.getSigners();
//         signer0 = signers[0].address;
//         signer1 = signers[1].address;
//         signer2 = signers[2].address;
//         signer0Diamond = diamond.connect(signers[0]);
//         signer1Diamond = diamond.connect(signers[1]);
//         signer2Diamond = diamond.connect(signers[2]);
        
//         // get the signer for the owner
//         owner = deployer.getDeployment()?.DeployerAddress || signer0;
//         ownerSigner = await ethersMultichain.getSigner(owner);
//         ownerDiamond = diamond.connect(ownerSigner);
//       });
      
//       beforeEach(async function () {
//         snapshotId = await provider.send('evm_snapshot', []);
//       });
        
//       afterEach(async () => {
//         await provider.send('evm_revert', [snapshotId]);
//       });       
          
//       it(`should ensure that ${chainName} chain object can be retrieved and reused`, async function () {
            
//         expect(provider).to.not.be.undefined;
//         // expect(deployment).to.be.true;
//         expect(upgrade).to.be.true;
        
//         expect(diamond).to.not.be.null;
        
//         const { chainId } = await provider.getNetwork();
//         expect(chainId).to.be.a('number');
        
//         // For some reason connection.url test has an error with hardhat chain when running 
//         // tests with `yarn test-multichain`. This does work with `npx test-multichain ...`
//         // expect(provider.connection.url).to.satisfy((url: string) => url.startsWith('http://'));
//       });
      
//       it(`should verify that ${chainName} diamond is deployed and we can get hardhat signers on ${chainName}`, async function () {
        
//         expect(signers).to.be.an('array');
//         expect(signers).to.have.lengthOf(20);
//         expect(signers[0]).to.be.instanceOf(SignerWithAddress);

//         expect(owner).to.not.be.undefined;
//         expect(owner).to.be.a('string');
//         // expect(owner).to.be.properAddress;
//         expect(ownerSigner).to.be.instanceOf(SignerWithAddress);
//       });
        
//       it(`should verify that ${chainName} providers are defined and have valid block numbers`, async function () {
//         log(`Checking chain provider for: ${chainName}`);
//         expect(provider).to.not.be.undefined;

//         const blockNumber = await ethersMultichain.provider.getBlockNumber();
//         log(`Block number for ${chainName}: ${blockNumber}`);
        
//         expect(blockNumber).to.be.a('number');
//         // Fails for hardhat because it defaults to 0.
//         if (chainName !== 'hardhat') {
//           expect(blockNumber).to.be.greaterThan(0);
//         }
        
//         // This isn't a perfect check, because it is trying to place the current block in 
//         // a range relative to the configured block number used for caching.
//         // The default of zero is to account for hardhat chain.  It also possible that no 
//         // block number is configured in the hardhat.config.js file which will always fetch
//         // the latest block number. This will also cause it to fail.
//         const configBlockNumber = hre.config.chainManager?.chains?.[chainName]?.blockNumber ?? 0;
//         expect(blockNumber).to.be.gte(configBlockNumber);
        
//         expect(blockNumber).to.be.lte(configBlockNumber + 500);
//       });
      
//       // it(`should verify ERC173 contract ownership on ${chainName}`, async function () {
//       //   // check if the owner is the deployer and transfer ownership to the deployer
//       //   const currentContractOwner = await ownerDiamond.owner();
//       //   expect(currentContractOwner.toLowerCase()).to.be.eq(await owner.toLowerCase());
//       // });


//       it(`should validate ERC165 interface compatibility on ${chainName}`, async function () {
//         // Test ERC165 interface compatibility
//         const supportsERC165 = await diamond?.supportsInterface('0x01ffc9a7');
//         expect(supportsERC165).to.be.true;

//         log(`Diamond deployed and validated on ${chainName}`);
//       });
      
//       // TODO - implement ERC165 SupportsInterface Initialization for ERC1155 and ERC20 interfaces 
//       // it(`should verify ERC165 supported interface for ERC1155 on ${chainName}`, async function () {
  
//       //   // Test ERC165 interface compatibility for ERC1155
//       //   const supportsERC1155 = await diamond?.supportsInterface('0xd9b67a26');
//       //   expect(supportsERC1155).to.be.true;
  
//       //   log(`ERC1155 interface validated on ${chainName}`);
//       // });
      
//       // it(`should verify ERC165 supported interface for ERC20 on ${chainName}`, async function () {
//       //   log(`Validating ERC20 interface on chain: ${chainName}`);
//       //   // Retrieve the deployed GNUS Diamond contract
//       //   const IERC20UpgradeableInterface = IERC20Upgradeable__factory.createInterface();
//       //   // Generate the ERC20 interface ID by XORing with the base interface ID.
//       //   const IERC20InterfaceID = getInterfaceID(IERC20UpgradeableInterface);
//       //   // Assert that the `diamond` contract supports the ERC20 interface.
//       //   assert(
//       //     await diamond?.supportsInterface(IERC20InterfaceID._hex),
//       //     "Doesn't support IERC20Upgradeable",
//       //   );
        
//       //   // Test ERC165 interface compatibility for ERC20 '0x37c8e2a0'
//       //   const supportsERC20 = await diamond?.supportsInterface(IERC20InterfaceID._hex);
//       //   expect(supportsERC20).to.be.true;

//       //   log(`ERC20 interface validated on ${chainName}`);
//       // });
      
//       // it(`should verify that MINTER Role is set on ${chainName}`, async () => {
//       //   console.log(`Verifying MINTER role on chain: ${chainName}`);
//       //   const ownershipFacet = await ethersMultichain.getContractAt('GeniusOwnershipFacet', diamond.address);
//       //   const minterRole = await diamond['MINTER_ROLE']();
//       //   // const deployerAddress = deployments[chainName]?.DeployerAddress ?? owner;
//       //   const owner = await ownershipFacet.connect(ownerSigner).owner();
//       //   const hasMinterRole = await ownershipFacet.hasRole(minterRole, owner);
//       //   expect(hasMinterRole).to.be.true;
//       // });
//     });  
//   }
// });
