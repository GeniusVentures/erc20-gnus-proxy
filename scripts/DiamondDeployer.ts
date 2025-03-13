import { ethers } from "hardhat";
import { JsonRpcProvider } from "@ethersproject/providers";
import { Signer } from "ethers";
import { assert } from "chai";
import { ProxyDiamond } from "../typechain-types";
import { deployments } from "./proxy_diamond_deployment/diamondeployments";
import { Facets, LoadFacetDeployments } from "./LoadFacetDeployments";
import { DiamondDeploymentManager, DeploymentInfo,  INetworkDeployInfo, IFacetsToDeployInfo, IDeployments} from "./DiamondDeploymentManager";

class TestDeployer {
  private static instances: Map<string, TestDeployer> = new Map();
  private networkName: string;
  private diamondName: string;
  private deploymentKey: string;
  private provider: JsonRpcProvider;
  private deployInfo: INetworkDeployInfo | null = null;
  private deployInProgress = false;
  private upgradeInProgress = false;
  private deployCompleted = false;
  private upgradeCompleted = false;
  private diamond!: ProxyDiamond;
  private deployer: Signer;
  private ethers = ethers;
  private chainId: number;

  private manager: DiamondDeploymentManager;

  private constructor(config: DeploymentInfo) {
    let initialDeployInfo: INetworkDeployInfo;
    this.networkName = config.networkName;
    this.chainId = config.chainId;
    this.diamondName = config.diamondName;
    this.provider = config.provider;
    // Setup the ethers provider on multichain
    this.ethers.provider = this.provider;
    // Establish deployer from current deployments info or signer 0
    const existingDeployInfo = deployments[this.networkName];
    if (!existingDeployInfo) {
      console.log("No existing deployment info found for", this.networkName);
      this.deployer = this.provider.getSigner(0);
      // Create a new DiamondDeploymentManager instance for this chain (multiton)
      initialDeployInfo = {
        DiamondAddress: "",
        DeployerAddress: "",
        FacetDeployedInfo: {
          "DiamondCutFacet": {
            address: "",
            tx_hash: "",
          },
          "DiamondLoupeFacet": {
            address: "",
            tx_hash: "",
          }
        }
      };
    } else {
      console.log("Existing deployment info found for", this.networkName);
      this.deployer = this.provider.getSigner(existingDeployInfo.DeployerAddress);
      initialDeployInfo = existingDeployInfo;
    }
    config.deployer = this.deployer;
    this.deployInfo = initialDeployInfo;
    this.deploymentKey = this.networkName + this.diamondName;
    this.manager = DiamondDeploymentManager.getInstance(
      config,
      initialDeployInfo
    );
  }

  static getInstance(deploymentInfo: DeploymentInfo): TestDeployer {
    const chainId = deploymentInfo.chainId.toString();
    const _deploymentKey = this.normalizeDeploymentKey(chainId, deploymentInfo.diamondName);
    if (!this.instances.has(_deploymentKey)) {
      this.instances.set(_deploymentKey, new TestDeployer(deploymentInfo));
    }
    return this.instances.get(_deploymentKey)!;
  }

  // TODO this would probably be better in a utility class
  private static normalizeDeploymentKey(networkName: string, diamondName: string): string {
    return networkName.toLowerCase() + "-" + diamondName.toLowerCase();
  }

  // The new deploy() now delegates to the DiamondDeploymentManager instance.
  async deploy(): Promise<boolean> {
    if (this.deployCompleted) {
      console.log(`Deployment already completed for ${this.networkName}`);
      return true;
    }
    if (this.deployInProgress || this.upgradeInProgress) {
      console.log(`Operation already in progress for ${this.networkName}`);
      while (this.deployInProgress || this.upgradeInProgress) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      return true;
    }
    else if (this.upgradeInProgress) {
      console.log(`Upgrade in progress for ${this.networkName}`);
      while (this.upgradeInProgress) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      return true;
     }
 
    this.deployInProgress = true;
    try {
      // Load existing facet deployment files into Facets object.
      // TODO: Implement LoadFacetDeployments() function locally and record facet deployments to json file.
      await LoadFacetDeployments();

      // If the diamond is already deployed then update the provider and deployer info.
      if (this.deployInfo!.DiamondAddress) {
        console.log("Diamond already deployed. Reusing deployment info.");
        // TODO: Only for hardhat/forked local networks.  This could be a callback or optional. Otherwise a gas estimator and account balance check for the deployer on chain.
        // Impersonate the deployer and fund their account
        await this.impersonateAndFundAccount(await this.deployer.getAddress());
      }

      // Call the deployDiamond process via the manager.
      await this.manager.deployDiamond();

      // After the diamond is deployed, update our local state.
      this.deployInfo = this.manager.getDeploymentInfo();
      console.log("Diamond deployed at:", this.deployInfo.DiamondAddress);

      // Deploy (or upgrade) facets. Use Facets object (or a tailored FacetToDeployInfo) as desired.
      const facetsToDeploy: IFacetsToDeployInfo = Facets;
      await this.manager.deployFacets(facetsToDeploy);

      // Perform the diamond cut (if needed) to bind new selectors.
      // Here we use an empty diamondCut for simplicity.
      await this.manager.performDiamondCut([], "0x0000000000000000000000000000000000000000", "0x");

      // Load the deployed diamond contract via typechain after the deployment.
      if (!this.deployInfo!.DiamondAddress) {
        throw new Error("DiamondAddress is undefined");
      }
      this.diamond = (await ethers.getContractAt(
        "hardhat-diamond-abi/HardhatDiamondABI.sol:ProxyDiamond",
        this.deployInfo!.DiamondAddress
      )) as ProxyDiamond;
      console.log("Deployed diamond attached with address:", this.diamond.address);

      this.deployCompleted = true;
      return true;
    } catch (error) {
      console.error(`Deployment failed for ${this.networkName}:`, error);
      throw error;
    } finally {
      this.deployInProgress = false;
    }
  }

  // The new upgrade() method delegates to the manager as well.
  async upgrade(): Promise<boolean> {
    if (this.upgradeCompleted) {
      console.log(`Upgrade already completed for ${this.networkName}`);
      return true;
    }
    if (this.deployInProgress) {
      console.log(`Deployment in progress for ${this.networkName}, waiting to upgrade.`);
      while (this.deployInProgress) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (this.upgradeInProgress) {
      console.log(`Upgrade already in progress for ${this.networkName}`);
      while (this.upgradeInProgress) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      return true;
    }
    this.upgradeInProgress = true;
    try {
      console.log(`Starting upgrade for ${this.networkName}`);
      // Ensure diamond deployment exists before upgrade.
      if (!this.deployInfo || !this.deployInfo.DiamondAddress) {
        console.log("Diamond not deployed. Running deployment first.");
        await this.deploy();
      }
      // Here you could optionally perform pre-upgrade checks, impersonate accounts, etc.
      // For example, funding the deployer account:
      await this.impersonateAndFundAccount(this.deployInfo!.DeployerAddress);

      // Delegate upgrade logic to the manager (this could include new facet deployments, diamondCut calls, etc.)
      // For an example upgrade call, you might redeploy facets and perform a diamondCut.
      const facetsToDeploy: IFacetsToDeployInfo = Facets; // or use updated facets info
      await this.manager.deployFacets(facetsToDeploy);
      // Re-use performDiamondCut as needed here...
      await this.manager.performDiamondCut([], "0x0000000000000000000000000000000000000000", "0x");

      console.log(`Upgrade completed for ${this.networkName}`);
      this.upgradeCompleted = true;
      return true;
    } catch (error) {
      console.error(`Upgrade failed for ${this.networkName}:`, error);
      throw error;
    } finally {
      this.upgradeInProgress = false;
    }
  }

  // Helper: Impersonate and fund deployer account on Hardhat, if necessary.
  async impersonateAndFundAccount(deployerAddress: string): Promise<Signer> {
    try {
      await this.provider.send("hardhat_impersonateAccount", [deployerAddress]);
      const deployer = this.provider.getSigner(deployerAddress);
      await this.provider.send("hardhat_setBalance", [deployerAddress, "0x56BC75E2D63100000"]);
      return deployer;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Impersonation and funding failed for ${deployerAddress}: ${error.message}`);
      } else {
        console.error(`Impersonation and funding failed for ${deployerAddress}: ${String(error)}`);
      }
      throw error;
    }
  }

  getDiamond(): ProxyDiamond {
    return this.diamond;
  }
}

export default TestDeployer;
