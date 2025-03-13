import { ethers } from "hardhat";
import { JsonRpcProvider } from "@ethersproject/providers";
import { Signer, ContractFactory, BigNumber, Contract } from "ethers";
import { AdminClient } from "@openzeppelin/defender-admin-client";
import { Network } from "@openzeppelin/defender-base-client";
import debug from "debug";
import * as fs from "fs";
import * as util from "util";
import { glob } from 'glob';
import { readFileSync } from "fs";
import { join, resolve } from "path";

export interface IDeployments {
  [networkName: string]: INetworkDeployInfo;
}

/**
 * Interface for the deployments on various blockchain networks info.
 */
export interface INetworkDeployInfo {
  DiamondAddress?: string;
  DeployerAddress: string;
  FacetDeployedInfo: {
    [facetName: string]: {
      address: string;
      tx_hash: string;
      version?: number;
      funcSelectors?: string[];
    };
  };
  ExternalLibraries?: { [key: string]: string };
  protocolVersion?: number;
}

export interface DeploymentInfo {
  diamondName: string;
  contractsPath: string;
  provider: JsonRpcProvider;
  networkName: string;
  chainId: number;
  deployer?: Signer;
}

/**
 * Interface describing the structure of facets to deploy and their metadata.
 */
export interface IFacetsToDeploy {
  [facetName: string]: {
    priority: number;
    libraries?: string[];
    versions?: {
      [versionNumber: number]: {
        deployInit?: string;
        upgradeInit?: string;
        fromVersions?: number[];
        callback?: (info: INetworkDeployInfo) => Promise<boolean>;
        deployInclude?: string[];
      };
    };
  };
}

interface FacetVersion {
  deployInit?: string;
  upgradeInit?: string;
  fromVersions?: number[];
}

interface FacetInfo {
  priority: number;
  versions?: Record<string, FacetVersion>;  // Versions can have dynamic keys
}

type FacetsDeployment = Record<string, FacetInfo>;  // Object with facet names as keys

/**
 * Type for the diamond cut “action”.
 */
export enum FacetCutAction {
  Add,
  Replace,
  Remove
}

/**
 * Type for capturing the needed data to perform a diamond upgrade.
 */
export interface FacetDeploymentInfo {
  facetAddress: string;
  action: FacetCutAction;
  functionSelectors: string[];
  name: string;
  initFunc?: string | null;
}

export interface IAfterDeployInit {
  (networkDeployInfo: INetworkDeployInfo): Promise<boolean>;
}


export function writeDeployedInfo(deployments: { [key: string]: INetworkDeployInfo }) {
  // TODO Configure the path in hardhat.config.ts
  let deploymentData = "";
  
  fs.writeFileSync(
    'scripts/deployments.ts',
    `\nimport { INetworkDeployInfo } from "../scripts/common";\n` +
      `export const deployments: { [key: string]: INetworkDeployInfo } = ${util.inspect(
        deployments,
        { depth: null },
      )};\n`,
    'utf8',
  );
}

/**
 * Interface for globally tracking function selectors that have already been deployed.
 */
export interface IDeployedFuncSelectors {
  facets: { [selector: string]: string };
  contractFacets: { [facetName: string]: string[] };
}

/**
 * A simple debug logger.
 */
const log = debug("DiamondDeploymentManager:log");

/**
 * Multiton class for each network or chain. 
 * An instance manages deployment, upgrades, and interaction with the Diamond Proxy.
 */
export class DiamondDeploymentManager {
  public static instances: Map<string, DiamondDeploymentManager> = new Map();

  // In-memory store of the Diamond address etc. for the current instance.
  private deploymentInfo: INetworkDeployInfo;
  private networkName: string;
  private diamondName: string;
  private deploymentKey: string;
  private deployer: Signer | undefined;
  private defenderClient: AdminClient | undefined;
  private ethers = ethers;
  private deployerAddress: string | undefined;
  private contractsPath: string;
  private constructor(config: DeploymentInfo, deployInfo: INetworkDeployInfo) {
    this.diamondName = config.diamondName;
    this.contractsPath = config.contractsPath;
    this.networkName = config.networkName;
    this.deployer = config.deployer;
    this.deploymentKey = config.networkName.toLowerCase + "-" + config.diamondName.toLowerCase;
    this.deploymentInfo = deployInfo;
    this.ethers.provider = config.provider;
    log(`Multiton instance of DiamondDeploymentManager created on ${this.networkName} for ${this.diamondName}`);
  }

  /**
   * Retrieves a deployment manager for a specific key (e.g., chain name).
   * Creates it if not already present.
   */
  public static getInstance(
    config: DeploymentInfo,
    deployInfo: INetworkDeployInfo,
  ): DiamondDeploymentManager {
    const _chainId = config.chainId;
    const _diamondName = config.diamondName;
    const _deploymentKey = this.normalizeDeploymentKey(_chainId.toString(), _diamondName);
    if (!DiamondDeploymentManager.instances.has(_deploymentKey)) {
      DiamondDeploymentManager.instances.set(
        _deploymentKey,
        new DiamondDeploymentManager(config, deployInfo)
      );
    }
    return DiamondDeploymentManager.instances.get(_deploymentKey)!;
  }
  
  // TODO this would probably be better in a utility class, it is used in TestDeployer.ts
  private static normalizeDeploymentKey(chainId: string, diamondName: string): string {
    return chainId.toLowerCase() + "-" + diamondName.toLowerCase();
  }

  /**
   * Sets up the deployer address for the current instance.
   */
  private async setupDeployerAddress(): Promise<void> {
    if (!this.deployer) throw new Error("Deployer not resolved");
    this.deployerAddress = await this.deployer.getAddress();
    if (this.deploymentInfo.DeployerAddress !== this.deployerAddress) {
      this.deploymentInfo.DeployerAddress = this.deployerAddress;
    }
  }

  /**
   * Deploy the DiamondCutFacet and the Diamond itself. Update local deployment info.
   */
  public async deployDiamond(): Promise<void> {
    if (!this.deployer) throw new Error("Deployer not resolved");
    await this.setupDeployerAddress();

    log(`🚀Deploying Diamond: {$this.diamondName}...`);

    const diamondCutFacetKey = "DiamondCutFacet";
    if (!this.deploymentInfo.FacetDeployedInfo[diamondCutFacetKey]?.address) {
      const DiamondCutFacet = await this.ethers.getContractFactory(
        "DiamondCutFacet",
        this.deployer
      );
      const facet = await DiamondCutFacet.deploy();
      await facet.deployed();
      this.deploymentInfo.FacetDeployedInfo[diamondCutFacetKey] = {
        address: facet.address,
        tx_hash: facet.deployTransaction.hash,
        version: 0.0,
        funcSelectors: [] // TODO: update with selectors?
      };
      log(`DiamondCutFacet deployed at ${facet.address}`);
    }

    //Check if Diamond is deployed
    if (!this.deploymentInfo.DiamondAddress) {
      const diamondPath = `${this.contractsPath}/${this.diamondName}.sol:${this.diamondName}`;
      const DiamondFactory = await this.ethers.getContractFactory(
        diamondPath,
        this.deployer
      );
      const contractOwnerAddress = await this.deployer.getAddress();
      const diamond = await DiamondFactory.deploy(
        contractOwnerAddress,
        this.deploymentInfo.FacetDeployedInfo[diamondCutFacetKey]?.address
      );
      await diamond.deployed();
      this.deploymentInfo.DiamondAddress = diamond.address;
      log(`Diamond deployed at ${diamond.address}`);
    } else {
       log(`Diamond already deployed at ${this.deploymentInfo.DiamondAddress}`);
    }
  }

  /**
   * Deploy facets that are not yet present or need an upgrade. 
   */
  public async deployFacets(facetsToDeploy: IFacetsToDeploy): Promise<void> {
    !this.deployerAddress ? this.setupDeployerAddress() : null;
    if (!this.deployer) throw new Error("Signer not resolved");
    log("Deploying (or upgrading) Facets...");

    // Sort facets by priority
    const facetsPriority = Object.keys(facetsToDeploy).sort(
      (a, b) => facetsToDeploy[a].priority - facetsToDeploy[b].priority
    );

    for (const facetName of facetsPriority) {
      const existing = this.deploymentInfo.FacetDeployedInfo[facetName];
      const facetData = facetsToDeploy[facetName];
      const versions = facetData.versions
        ? Object.keys(facetData.versions).map((v) => +v).sort((a, b) => b - a)
        : [0.0];

      const highestVersion = versions[0];
      const deployedVersion =
        existing?.version ?? (existing?.tx_hash ? 0.0 : -1.0);

      // If out of date or missing
      if (deployedVersion !== highestVersion) {
        const externalLibs: any = {};
        if (this.deploymentInfo.ExternalLibraries && facetData.libraries) {
          for (const lib of facetData.libraries) {
            externalLibs[lib] = this.deploymentInfo.ExternalLibraries[lib];
          }
        }
        const FacetCF: ContractFactory = await this.ethers.getContractFactory(
          facetName,
          {
            signer: this.deployer,
            libraries: externalLibs
          }
        );

        log(`Deploying ${facetName} version ${highestVersion}...`);
        const facetContract = await FacetCF.deploy();
        await facetContract.deployed();

        this.deploymentInfo.FacetDeployedInfo[facetName] = {
          address: facetContract.address,
          tx_hash: facetContract.deployTransaction.hash,
          version: highestVersion,
          funcSelectors: [] // Later updated in a diamondCut step
        };
        log(`${facetName} deployed at ${facetContract.address}`);
      } else {
        log(`${facetName} up to date (version ${deployedVersion}).`);
      }
    }
  }

  /**
   * Perform the diamondCut operation to add/replace/remove facet selectors on the Diamond.
   */
  public async performDiamondCut(
    facetCuts: FacetDeploymentInfo[],
    initAddress: string,
    initData: string
  ): Promise<void> {
    await this.setupDeployerAddress();
    if (!this.deployer) throw new Error("Signer not resolved");
    const diamondAddress = this.deploymentInfo.DiamondAddress;
    if (!diamondAddress) throw new Error("No diamond address found");

    // Get the diamondCut function from the already-deployed diamond ABI
    const diamond = await this.ethers.getContractAt("IDiamondCut", diamondAddress, this.deployer);
    log("Performing diamondCut...");
    const tx = await diamond.diamondCut(facetCuts, initAddress, initData);
    const receipt = await tx.wait();
    if (!receipt.status) {
      throw new Error(`Diamond upgrade failed: ${tx.hash}`);
    }
    log(`diamondCut transaction executed. Hash: ${tx.hash}`);
  }

  /**
   * Method for generating function selectors from a contract.
   * This replaces some functionality from FacetSelectors.ts.
   */
  public async getSelectors(contractAddress: string): Promise<string[]> {
    // TODO: replace the dummy array.
    return ["0x12345678"];
  }

  /**
   * Optional: call after deployment to initialize or upgrade via some function on the diamond.
   */
  public async callInitFunction(facetAddress: string, initSig: string): Promise<void> {
    if (!this.deployer) throw new Error("Signer not resolved");
    log(`Calling init function on facet ${facetAddress}, sig ${initSig}`);
    // Send a raw transaction
    const tx = await this.deployer.sendTransaction({
      to: this.deploymentInfo.DiamondAddress,
      data: initSig // e.g., the encoded function signature + arguments
    });
    await tx.wait();
    log("Initialization function call completed.");
  }

  /**
   * Configure Defender for this manager.
   */
  public configureDefender(apiKey: string, apiSecret: string): void {
    this.defenderClient = new AdminClient({
      apiKey: apiKey,
      apiSecret: apiSecret
    });
    log("Defender client configured.");
  }

  /**
   * Method showing to create a proposal to OpenZeppelin Defender
   * executing the diamondCut.
   */
  public async proposeDiamondCutToDefender(
    facetCuts: FacetDeploymentInfo[],
    initAddress: string,
    initData: string
  ): Promise<void> {
    if (!this.defenderClient) {
      throw new Error("Defender client not configured. Call configureDefender first.");
    }
    if (!this.deploymentInfo.DiamondAddress) {
      throw new Error("No diamond address found.");
    }

    // Convert the facetCuts data into an array suitable for your diamondCut function ABI
    const diamondCutFunctionInputs: any[] = [];
    for (const info of facetCuts) {
      diamondCutFunctionInputs.push([info.facetAddress, info.action, info.functionSelectors]);
    }

    const response = await this.defenderClient.createProposal({
      contract: {
        address: this.deploymentInfo.DiamondAddress,
        network: this.ethers.provider.network.name as Network
      },
      title: "Diamond Cut Proposal",
      description: "Propose an upgrade to diamond facets",
      type: "custom",
      functionInterface: {
        name: "diamondCut",
        inputs: [
          {
            name: "_diamondCut",
            type: "tuple[]"
          },
          {
            name: "_init",
            type: "address"
          },
          {
            name: "_calldata",
            type: "bytes"
          }
        ],
      },
      functionInputs: [diamondCutFunctionInputs, initAddress, initData],
      via: "<YOUR_DEFENDER_RELAY_ADDRESS>",
      viaType: "Safe" // or Defender Relay, etc.
    });

    log(`Defender proposal created: ${response.proposalId}`);
  }
  
  /**
   * Import individual Facet Deployment files
   */
  public async loadFacetsToDeploy(facetDeploymentsPath: string): Promise<void> {
    const imports = glob.sync(join(__dirname, facetDeploymentsPath, '*.ts'));
    for (const file of imports) {
      const deployLoad = file.replace(__dirname, '.').replace('.ts', '');
      await import(deployLoad);
    }
  }
  
  /**
   * Set Facet Deployments
   */
  public loadFacetDeployments(facetsDeploymentsPath: string): FacetsDeployment {
    // Resolve the absolute path relative to the TypeScript project root
    const absolutePath = resolve(__dirname, facetsDeploymentsPath, 'facets.json');

    // Read and parse JSON
    const jsonData = readFileSync(absolutePath, 'utf-8');
    const facetsDeployments: FacetsDeployment = JSON.parse(jsonData);

    return facetsDeployments;
  }
  
  /**
   * Retrieve the current deployment info for saving or logging.
   */
  public getDeploymentInfo(): INetworkDeployInfo {
    return this.deploymentInfo;
  }
}