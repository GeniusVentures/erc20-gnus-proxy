import {
  Diamond,
  DiamondDeployer,
  DeploymentManager,
  LocalDeploymentStrategy,
  FileDeploymentRepository,
  impersonateSigner,
  setEtherBalance,
  DiamondConfig,
  cutKey
} from '@gnus.ai/diamonds';
import { JsonRpcProvider } from '@ethersproject/providers';
import { ethers } from 'hardhat';
import hre from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { join } from 'path';
import '@gnus.ai/hardhat-diamonds';

const diamondMap: Map<string, DiamondDeployer> = new Map();

export class LocalDiamondDeployer {
  private static instances: Map<string, LocalDiamondDeployer> = new Map();
  private deployInProgress: boolean = false;
  private deployComplete: boolean = false;
  private diamond: Diamond | undefined;
  private verbose: boolean = false;

  private constructor(
    private networkName: string,
    private diamondName: string,
    private provider: JsonRpcProvider
  ) { }

  public static async getInstance(
    diamondName: string,
    networkName: string,
    provider: JsonRpcProvider
  ): Promise<LocalDiamondDeployer> {
    const key = await (cutKey(diamondName, networkName, (await provider.getNetwork()).chainId.toString()));
    if (!this.instances.has(key)) {
      const instance = new LocalDiamondDeployer(networkName, diamondName, provider);
      this.instances.set(key, instance);
    }
    return this.instances.get(key)!;
  }

  public async deployDiamond(): Promise<DiamondDeployer> {
    const chainId = (await this.provider.getNetwork()).chainId || 31337;
    const key = cutKey(this.diamondName, this.networkName, chainId.toString());
    if (this.deployComplete) {
      console.log(`Deployment already completed for ${this.diamondName} on ${this.networkName}-${chainId.toString()}`);
      return Promise.resolve(diamondMap.get(key)!);
    }
    else if (this.deployInProgress) {
      console.log(`Deployment already in progress for ${this.networkName}`);
      // Wait for the deployment to complete
      while (this.deployInProgress) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      return Promise.resolve(diamondMap.get(key)!);
    }
    this.deployInProgress = true;
    const [signer] = await ethers.getSigners();
    const diamondsConfig = hre.diamonds.getDiamondConfig(this.diamondName)!;
    const deploymentsPath = diamondsConfig.deploymentsPath;

    const config: DiamondConfig = {
      diamondName: this.diamondName,
      networkName: this.networkName,
      chainId: chainId,
      deploymentsPath,
      contractsPath: diamondsConfig.contractsPath,
      callbacksPath: join(deploymentsPath, this.diamondName, 'callbacks'),
      writeDeployedDiamondData: false
    };

    const repository = new FileDeploymentRepository(config);

    const deployedDiamondData = repository.loadDeployedDiamondData();
    let diamondSigner: SignerWithAddress;

    if (!deployedDiamondData.DeployerAddress) {
      diamondSigner = signer;
    } else {
      diamondSigner = await ethers.getSigner(deployedDiamondData.DeployerAddress);
      await impersonateSigner(deployedDiamondData.DeployerAddress);
      await setEtherBalance(deployedDiamondData.DeployerAddress, ethers.utils.parseEther('1'));
    }

    const diamond = new Diamond(config, repository);
    diamond.provider = this.provider;
    diamond.signer = diamondSigner;

    const strategy = new LocalDeploymentStrategy(this.verbose);
    const deployer = new DiamondDeployer(diamond, strategy);

    await deployer.deployDiamond();

    diamondMap.set(key, deployer);
    this.diamond = diamond;
    this.deployComplete = true;
    this.deployInProgress = false;

    return diamondMap.get(key)!;
  }

  public async getDiamond(): Promise<Diamond> {
    if (this.deployComplete && this.diamond) {
      return this.diamond;
    } else { }
    const deployer = await this.deployDiamond();
    return deployer.getDiamond();
  }
}
