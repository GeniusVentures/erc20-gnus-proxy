// import { Contract, BigNumber, EventFilter, ContractTransaction } from 'ethers';
// import hre, { ethers } from 'hardhat';
// import '@nomiclabs/hardhat-etherscan';
// import '@nomiclabs/hardhat-waffle';
// import '@typechain/hardhat';
// import 'hardhat-gas-reporter';
// import 'solidity-coverage';
// import '@nomiclabs/hardhat-ethers';
// import { getSelectors, Selectors, getInterfaceID } from '../scripts/FacetSelectors';
// import {
//   afterDeployCallbacks,
//   deployDiamondFacets,
//   deployFuncSelectors,
//   deployDiamond,
// } from '../scripts/deploy';
// import { ProxyDiamond } from '../typechain-types';
// import { iObjToString } from './iObjToString';
// import {
//   dc,
//   debuglog,
//   GNUS_TOKEN_ID,
//   assert,
//   expect,
//   toBN,
//   toWei,
//   INetworkDeployInfo,
//   FacetToDeployInfo, PreviousVersionRecord
// } from "../scripts/common";
// import { IERC20Upgradeable__factory } from '../typechain-types';
// import { IERC165Upgradeable__factory } from '../typechain-types';
// import { Facets, LoadFacetDeployments } from '../scripts/facets';
// import { deployments } from '../scripts/deployments';
// import util from 'util';
// import { debug } from 'debug';

// // other files suites to execute
// import * as ERC20ProxyFacetTests from './unit/ERC20ProxyFacet.test';

// const debugging = process.env.JB_IDE_HOST !== undefined;

// export async function logEvents(tx: ContractTransaction) {
//   const receipt = await tx.wait();

//   if (receipt.events) {
//     for (const event of receipt.events) {
//       debuglog(`Event ${event.event} with args ${event.args}`);
//     }
//   }
// }

// describe.only('Proxy Diamond DApp Testing', async function () {
//   let ProxyDiamond: ProxyDiamond;
//   let networkDeployedInfo: INetworkDeployInfo;
//   let previousDeployedVersions: PreviousVersionRecord;

//   if (debugging) {
//     debug.enable('.*:log');
//     debuglog.enabled = true;
//     debuglog.log = console.log.bind(console);
//     debuglog(
//       'Disabling timeout, enabling debuglog, because code was run in Jet Brains (probably debugging)',
//     );
//     this.timeout(0);
//   }

//   before(async function () {
//     await LoadFacetDeployments();

//     const deployer = (await ethers.getSigners())[0].address;

//     const networkName = hre.network.name;
//     if (!deployments[networkName]) {
//       deployments[networkName] = {
//         DiamondAddress: '',
//         DeployerAddress: deployer,
//         FacetDeployedInfo: {},
//       };
//     }
//     networkDeployedInfo = deployments[networkName];

//     await deployDiamond(networkDeployedInfo);

//     ProxyDiamond = dc.ProxyDiamond as ProxyDiamond;

//     debuglog('Diamond Deployed');

//     const IERC165UpgradeableInterface = IERC165Upgradeable__factory.createInterface();
//     const IERC20UpgradeableInterface = IERC20Upgradeable__factory.createInterface();
//     const IERC165InterfaceID = getInterfaceID(IERC165UpgradeableInterface);
//     // interface ID does not include base contract(s) functions.
//     const IERCInterfaceID = getInterfaceID(IERC20UpgradeableInterface).xor(
//       IERC165InterfaceID,
//     );
//     /* TODO: check ERC20?
//     assert(

//             await ProxyDiamond.supportsInterface(IERCInterfaceID._hex),
//           "Doesn't support IERC1155Upgradeable"
//         ); */

//     const deployInfoBeforeUpgraded: INetworkDeployInfo = JSON.parse(
//       JSON.stringify(networkDeployedInfo),
//     );

//     let facetsToDeploy: FacetToDeployInfo = Facets;
//     // do deployment of facets in 3 steps
//     await deployDiamondFacets(networkDeployedInfo, facetsToDeploy);
//     debuglog(`${util.inspect(networkDeployedInfo, { depth: null })}`);
//     const deployInfoWithOldFacet: INetworkDeployInfo = Object.assign(
//       JSON.parse(JSON.stringify(networkDeployedInfo)),
//     );
//     // isn't this bad?  Changing the keys of what we are iterating through?
//     for (const key in deployInfoWithOldFacet.FacetDeployedInfo) {
//       if (deployInfoBeforeUpgraded.FacetDeployedInfo[key])
//         deployInfoWithOldFacet.FacetDeployedInfo[key] =
//           deployInfoBeforeUpgraded.FacetDeployedInfo[key];

//       // Build the previousDeployedVersions in the same loop
//       const facetInfo = deployInfoWithOldFacet.FacetDeployedInfo[key];
//       if (facetInfo.version !== undefined) {
//         previousDeployedVersions[key] = facetInfo.version;
//       } else {
//         debuglog(`Facet ${key} does not have a version`);
//       }
//     }

//     await deployFuncSelectors(networkDeployedInfo, deployInfoWithOldFacet, facetsToDeploy);
//     debuglog(`${util.inspect(networkDeployedInfo, { depth: null })}`);

//     // this should be a null operation.
//     await deployFuncSelectors(networkDeployedInfo, deployInfoWithOldFacet, facetsToDeploy);

//     await afterDeployCallbacks(networkDeployedInfo, undefined, previousDeployedVersions);
//     debuglog(`${util.inspect(networkDeployedInfo, { depth: null })}`);

//     debuglog('Facets Deployed');
//   });

//   describe('Facet Cut Testing', async function () {
//     let tx;
//     let receipt;
//     let result: any;
//     const addresses: any[] = [];

//     it('should have same count of facets -- call to facetAddresses function', async () => {
//       const facetAddresses = await ProxyDiamond.facetAddresses();
//       for (const facetAddress of facetAddresses) {
//         addresses.push(facetAddress);
//       }
//       // DiamondCutFacet is deployed but doesn't have any facets deployed
//       assert.equal(
//         addresses.length + 1,
//         Object.keys(networkDeployedInfo.FacetDeployedInfo).length,
//       );
//     });

//     it('facets should have the right function selectors -- call to facetFunctionSelectors function', async () => {
//       let selectors = getSelectors(dc.DiamondCutFacet);
//       result = await ProxyDiamond.facetFunctionSelectors(addresses[0]);
//       assert.sameMembers(result, selectors.values);
//       selectors = getSelectors(dc.DiamondLoupeFacet);
//       result = await ProxyDiamond.facetFunctionSelectors(addresses[1]);
//       assert.sameMembers(result, selectors.values);
//       selectors = getSelectors(dc.GeniusOwnershipFacet);
//       const result2 = await ProxyDiamond.facetFunctionSelectors(addresses[2]);
//       assert.sameMembers(
//         result2,
//         selectors.values.filter((e) => !result.includes(e)),
//       );
//     });


//   });

//     after(() => {
//       ERC20ProxyFacetTests.suite();
//     });
// });
