// // This is not currently in use. Because 

// import { debug } from 'debug';
// import { expect, assert } from 'chai';
// import { ethers } from 'hardhat';
// import hre from 'hardhat';
// import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
// import { JsonRpcProvider } from '@ethersproject/providers';
// import { multichain } from 'hardhat-multichain';
// import MultiChainTestDeployer from '../gnus-ai/test/setup/multichainTestDeployer';
// import { deployments } from '../gnus-ai/scripts/deployments';
// import { GeniusDiamond } from '../../../typechain-types';

// // Deploys the GNUS Diamond contract to multiple chains
// export async function GNUSMultichainDeployer()  {
//   const log: debug.Debugger = debug('GNUSDeploy:log');
  
//   let chains = multichain.getProviders() || new Map<string, JsonRpcProvider>();
  
//   // Check the process.argv for the Hardhat network name
//   if (process.argv.includes('test-multichain')) {
//     const chainNames = process.argv[process.argv.indexOf('--chains') + 1].split(',');
//     if (chainNames.includes('hardhat')) {
//       chains = chains.set('hardhat', ethers.provider);
//     }
//   } else if (process.argv.includes('test') || process.argv.includes('coverage')) {
//     chains = chains.set('hardhat', ethers.provider);
//   }
  
//   for (const [chainName, provider] of chains.entries()) { 
  
//     let deployer: MultiChainTestDeployer;
//     let deployment: boolean | void;
//     let upgrade: boolean | void;

//     let gnusDiamond: GeniusDiamond;
        
//     const deployConfig = {
//         chainName: chainName,
//         provider: provider,
//     };
//     deployer = await MultiChainTestDeployer.getInstance(deployConfig);
//     deployment = await deployer.deploy();
//     expect(deployment).to.be.true;
//     upgrade = await deployer.upgrade();
//     expect(upgrade).to.be.true;
//     // Retrieve the deployed GNUS Diamond contract
//     gnusDiamond = await deployer.getDiamond();    
//     if (!gnusDiamond) {
//         throw new Error(`gnusDiamond is null for chain ${chainName}`);
//     }
//   }
// }
