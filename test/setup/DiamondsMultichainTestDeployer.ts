import {
  Diamond,
  DiamondDeployer,
  DeploymentManager,
  FacetCallbackManager,
  LocalDeploymentStrategy,
  FileDeploymentRepository
} from '@gnus.ai/diamonds';

import { DiamondConfig } from '@gnus.ai/diamonds';
import path from 'path';
import { JsonRpcProvider } from '@ethersproject/providers';
import hre, { ethers } from 'hardhat';

const diamondMap = new Map<string, DeploymentManager>();

export async function getOrDeployDiamond(chainName: string, diamondName: string, multichainProvider: JsonRpcProvider): Promise<DeploymentManager> {

  const key = `${chainName}:${diamondName}`;
  if (diamondMap.has(key)) return diamondMap.get(key)!;

  const diamondsConfig = hre.config.diamonds?.paths[diamondName];
  const [signer] = await ethers.getSigners();
  let config: DiamondConfig = {
    diamondName: diamondName,
    networkName: chainName,
    chainId: multichainProvider.network.chainId,
    deploymentsPath: diamondsConfig.deploymentsPath || 'diamonds',
    contractsPath: diamondsConfig.contractsPath || 'contracts',
    callbacksPath: diamondsConfig.callbacksPath || 'callbacks'
  };

  // Set the network on config
  config.diamondName = diamondName;
  config.networkName = chainName;
  config.chainId = multichainProvider.network.chainId! || 31337;

  const repository = new FileDeploymentRepository();
  const diamond = new Diamond(config, repository);
  if (!diamond.getDeployInfo().DeployerAddress) {
    diamond.deployer = signer;
  } else {
    diamond.deployer = await ethers.getSigner(diamond.getDeployInfo().DeployerAddress);
  }
  diamond.provider = multichainProvider;

  const strategy = new LocalDeploymentStrategy();
  const deployer = new DiamondDeployer(diamond, strategy);

  const callbackManager = FacetCallbackManager.getInstance(
    diamond.diamondName,
    path.join(diamond.deploymentsPath, diamond.diamondName, 'facetCallbacks')
  );

  const manager = new DeploymentManager(diamond, deployer, callbackManager);
  await manager.deployAll();

  diamondMap.set(key, manager);
  return manager;
}