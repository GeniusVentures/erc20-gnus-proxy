// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { debug } from 'debug';
import { BaseContract } from 'ethers';
import hre, { ethers, network } from 'hardhat';
import { AdminClient } from '@openzeppelin/defender-admin-client';
import { Network } from '@openzeppelin/defender-base-client';
import {
  FacetInfo,
  getSelectors,
  getDeployedFuncSelectors,
  getSelector
} from "../scripts/FacetSelectors";
import {
  dc,
  INetworkDeployInfo,
  FacetToDeployInfo,
  AfterDeployInit,
  writeDeployedInfo,
  diamondCutFuncAbi,
  getSighash, PreviousVersionRecord
} from "../scripts/common";
import { DiamondCutFacet } from '../typechain-types/DiamondCutFacet';
import { IDiamondCut } from '../typechain-types/IDiamondCut';
import { deployments } from '../scripts/deployments';
import { Facets, LoadFacetDeployments } from '../scripts/facets';
import * as util from 'util';
import { getGasCost } from '../scripts/getgascost';
import { defenderSigners } from "./DefenderSigners";
import { ProxyDiamond } from "../typechain-types";

const log: debug.Debugger = debug('Deploy:log');
log.color = '159';


const GAS_LIMIT_PER_FACET = 60000;
const GAS_LIMIT_CUT_BASE = 100000;

const { FacetCutAction } = require('contracts-starter/scripts/libraries/diamond.js');

let client: AdminClient;

export async function deployDiamond(networkDeployInfo: INetworkDeployInfo) {
  const accounts = await ethers.getSigners();
  let diamondCutFacet;
  const contractOwner = accounts[0];

  if (networkDeployInfo.FacetDeployedInfo['DiamondCutFacet']?.address) {
    dc.DiamondCutFacet = await ethers.getContractAt(
      'DiamondCutFacet',
      networkDeployInfo.FacetDeployedInfo['DiamondCutFacet']?.address,
    );
  } else {
    // deploy DiamondCutFacet
    const DiamondCutFacet = await ethers.getContractFactory('DiamondCutFacet');
    diamondCutFacet = (await DiamondCutFacet.deploy()) as DiamondCutFacet;
    await diamondCutFacet.deployed();
    log(
      `DiamondCutFacet deployed: ${diamondCutFacet.deployTransaction.hash} tx_hash: ${diamondCutFacet.deployTransaction.hash}`,
    );
    dc.DiamondCutFacet = diamondCutFacet;
  }
  let diamond;
  if (!networkDeployInfo.DiamondAddress) {
    // deploy Diamond
    const Diamond = await ethers.getContractFactory(
      'contracts/ProxyDiamond.sol:ProxyDiamond',
    );
    diamond = await Diamond.deploy(contractOwner.address, dc.DiamondCutFacet.address);
    await diamond.deployed();
  } else {
    diamond = await ethers.getContractAt(
      'contracts/ProxyDiamond.sol:ProxyDiamond',
      networkDeployInfo.DiamondAddress,
    );
  }

  dc._ProxyDiamond = diamond;
  networkDeployInfo.DiamondAddress = diamond.address;

  dc.ProxyDiamond = (
    await ethers.getContractFactory('hardhat-diamond-abi/ProxyDiamond.sol:ProxyDiamond')
  ).attach(diamond.address);

  // update deployed info for DiamondCutFacet since Diamond contract constructor already adds DiamondCutFacet::diamondCut
  const funcSelectors = getSelectors(dc.DiamondCutFacet);
  networkDeployInfo.FacetDeployedInfo.DiamondCutFacet = {
    address: dc.DiamondCutFacet.address,
    tx_hash:
      dc.DiamondCutFacet.deployTransaction?.hash ||
      networkDeployInfo.FacetDeployedInfo['DiamondCutFacet'].tx_hash,
    version: 0.0,
    funcSelectors: funcSelectors.values,
  };

  log(`Diamond deployed ${diamond.address}`);
}

export async function deployFuncSelectors(
  networkDeployInfo: INetworkDeployInfo,
  oldNetworkDeployInfo: INetworkDeployInfo | undefined = undefined,
  facetsToDeploy: FacetToDeployInfo = Facets,
) {
  const cut: FacetInfo[] = [];
  const deployedFacets = networkDeployInfo.FacetDeployedInfo;
  const deployedFuncSelectors = await getDeployedFuncSelectors(
    oldNetworkDeployInfo || networkDeployInfo,
  );
  const registeredFunctionSignatures = new Set<string>();

  const facetsPriority = Object.keys(facetsToDeploy).sort(
    (a, b) => facetsToDeploy[a].priority - facetsToDeploy[b].priority,
  );
  let protocolUpgradeVersion = 0;
  const selectorsToBeRemoved: string[] = [];
  const facetNamesToBeRemoved: string[] = [];
  // delete old facets not included in deploy list and remove all deleted all functions
  for (const facetName of Object.keys(deployedFacets)) {
    if (!Object.keys(facetsToDeploy).includes(facetName)) {
      // should delete functions exist in diamond
      selectorsToBeRemoved.push(
        ...deployedFacets[facetName].funcSelectors?.filter((e) =>
          Object.keys(deployedFuncSelectors?.facets).includes(e),
        ),
      );
      facetNamesToBeRemoved.push(facetName);
      delete deployedFacets[facetName];
    }
  }
  if (selectorsToBeRemoved.length > 0)
    cut.push({
      facetAddress: ethers.constants.AddressZero,
      action: FacetCutAction.Remove,
      functionSelectors: selectorsToBeRemoved,
      name: facetNamesToBeRemoved.join(','),
    });

  for (const name of facetsPriority) {
    const facetDeployVersionInfo = facetsToDeploy[name];
    let facetVersions = ['0.0'];
    // sort version high to low
    if (facetDeployVersionInfo.versions) {
      facetVersions = Object.keys(facetDeployVersionInfo.versions).sort((a, b) => +b - +a);
    }

    const upgradeVersion = +facetVersions[0];
    protocolUpgradeVersion = Math.max(upgradeVersion, protocolUpgradeVersion);
    const facetDeployInfo = facetDeployVersionInfo.versions
      ? facetDeployVersionInfo.versions[upgradeVersion]
      : {};

    const deployedVersion =
      deployedFacets[name]?.version ?? (deployedFacets[name]?.tx_hash ? 0.0 : -1.0);

    const FacetContract = await ethers.getContractFactory(
      name,
      facetDeployVersionInfo.libraries
        ? {
            libraries: networkDeployInfo.ExternalLibraries,
          }
        : undefined,
    );
    const facet = FacetContract.attach(deployedFacets[name].address!);

    const facetNeedsUpgrade =
      !(name in deployedFuncSelectors.contractFacets) || upgradeVersion !== deployedVersion;
    dc[name] = facet;

    const origSelectors = getSelectors(facet).values;
    const includeSelectors: Set<String> | null = facetDeployInfo.deployInclude ? new Set(facetDeployInfo.deployInclude) : null;
    const newFuncSelectors = getSelectors(facet, registeredFunctionSignatures, includeSelectors).values;
    const removedSelectors = origSelectors.filter((v) => !newFuncSelectors.includes(v));
    if (removedSelectors.length) {
      log(`${name} removed ${removedSelectors.length} selectors: [${removedSelectors}]`);
    }
    let numFuncSelectorsCut = 0;
    // remove any function selectors from this facet that were previously deployed but no longer exist
    const deployedContractFacetsSelectors = deployedFuncSelectors.contractFacets[name];
    const deployedToRemove =
      deployedContractFacetsSelectors?.filter((v) => !newFuncSelectors.includes(v)) ?? [];
    // removing any previous deployed function selectors that were removed from this contract
    if (deployedToRemove.length) {
      cut.unshift({
        facetAddress: ethers.constants.AddressZero,
        action: FacetCutAction.Remove,
        functionSelectors: deployedToRemove,
        name: name,
      });
      numFuncSelectorsCut++;
    }

    if (newFuncSelectors.length) {
      let initFunc: string | undefined;
      let initFuncSelector: string | null = null;
      // if we are upgrading to a new version the upgradeInit function is called
      if (facetNeedsUpgrade) {
        if (facetDeployInfo.fromVersions?.includes(deployedVersion)) {
          initFunc = facetDeployInfo.upgradeInit;
        } else if (deployedVersion == -1) {   // check if we have deployed at all, if not this should be an init at this version
          initFunc = facetDeployInfo.deployInit;
        }
      } else {
         initFunc = facetDeployInfo.deployInit;
      }
      if (initFunc) {
        initFuncSelector = getSelector(facet, initFunc);
        log(`contract: ${facet.address}, initFuncSelector: ${initFuncSelector}`);
      }
      deployedFacets[name].funcSelectors = newFuncSelectors;
      const replaceFuncSelectors: string[] = [];
      const addFuncSelectors = newFuncSelectors.filter((v) => {
        if (v in deployedFuncSelectors.facets) {
          if (
            deployedFuncSelectors.facets[v].toLowerCase() !== facet.address.toLowerCase()
          ) {
            replaceFuncSelectors.push(v);
          }
          return false;
        } else {
          return true;
        }
      });

      if (replaceFuncSelectors.length) {
        cut.push({
          facetAddress: facet.address,
          action: FacetCutAction.Replace,
          functionSelectors: replaceFuncSelectors,
          name: name,
          initFunc: initFuncSelector,
        });
        numFuncSelectorsCut++;
      }

      if (addFuncSelectors.length) {
        cut.push({
          facetAddress: facet.address,
          action: FacetCutAction.Add,
          functionSelectors: addFuncSelectors,
          name: name,
          initFunc: initFuncSelector,
        });
        numFuncSelectorsCut++;
      }

      // add new registered function selector strings
      for (const funcSelector of newFuncSelectors) {
        registeredFunctionSignatures.add(funcSelector);
      }

      deployedFacets[name].funcSelectors = newFuncSelectors;
      deployedFacets[name].version = upgradeVersion;
    } else {
      delete deployedFuncSelectors.contractFacets[name];
      log(`Pruned all selectors from ${name}`);
    }

    if (numFuncSelectorsCut === 0) {
      log(
        `*** Skipping ${name} as there were no modifications to deployed facet function selectors`,
      );
    }
  }

  // upgrade diamond with facets
  const diamondCut = dc.ProxyDiamond as IDiamondCut;
  if (process.env.DEFENDER_DEPLOY_ON &&
      defenderSigners[network.name]) {
    log('Deploying contract on defender');
    client = new AdminClient({
      apiKey: process.env.DEFENDER_API_KEY || '',
      apiSecret: process.env.DEFENDER_API_SECRET || '',
    });
    const listedContracts = await client.listContracts();
    if (
      listedContracts.find(
        (e) => e.address.toLowerCase() === diamondCut.address.toLowerCase(),
      )
    ) {
      log('Diamond Contract was listed on defender');
    } else {
      const res = await client.addContract({
        address: diamondCut.address,
        abi: JSON.stringify(diamondCut.interface.fragments),
        network: hre.network.name as Network,
        name: 'Gnus.ai Diamond',
      });
      if (res.address) {
        log('Diamond Contract was listed on defender', res.address);
      }
    }
  }
  // remove cut info to replace functions
  const replacedFunctionSelectors = [];
  for (const facetCutInfo of cut) {
    if (facetCutInfo.action === FacetCutAction.Replace) {
      replacedFunctionSelectors.push(...facetCutInfo.functionSelectors);
    }
  }
  const upgradeCut = [];
  for (const facetCutInfo of cut) {
    if (facetCutInfo.action === FacetCutAction.Remove) {
      const newFunctionSelectors = [];
      for (const removedFuncSelector of facetCutInfo.functionSelectors) {
        if (!replacedFunctionSelectors.includes(removedFuncSelector))
          newFunctionSelectors.push(removedFuncSelector);
      }
      if (newFunctionSelectors.length === 0) {
        continue;
      } else {
        facetCutInfo.functionSelectors = newFunctionSelectors;
      }
    }
    upgradeCut.push(facetCutInfo);
  }

  log('');
  log('Diamond Cut:', upgradeCut);

  let functionCall: any = [];
  let initAddress = ethers.constants.AddressZero;

  try {
    let totalSelectors = 0;
    upgradeCut.forEach((e) => {
      totalSelectors += e.functionSelectors.length;
    });
    if (process.env.DEFENDER_DEPLOY_ON &&
        defenderSigners[network.name]) {
      const upgradeFunctionInputs:
        | string
        | boolean
        | (string | boolean)[]
        | (string | string[])[][] = [];
      upgradeCut.forEach((e) =>
        upgradeFunctionInputs.push([
          e.facetAddress,
          e.action.toString(),
          e.functionSelectors,
        ]),
      );
      // since this deployment does the diamond cut all at once, there is only on initialization functionCall
      const response = await client.createProposal({
        contract: {
          address: diamondCut.address,
          network: hre.network.name == 'polygon' ? 'matic' : (hre.network.name as Network),
        }, // Target contract
        title: `Update facet ${protocolUpgradeVersion}`, // Title of the proposal
        description: `Update facet`, // Description of the proposal
        type: 'custom', // Use 'custom' for custom admin actions
        functionInterface: diamondCutFuncAbi, // Function ABI
        functionInputs: [upgradeFunctionInputs, initAddress, functionCall], // Arguments to the function
        via: defenderSigners[network.name].via,
        viaType: defenderSigners[network.name].viaType,
      });
      log(`created proposal on defender ${response.proposalId} `);
    } else {
        const tx = await diamondCut.diamondCut(upgradeCut, initAddress, functionCall, {
          gasLimit: GAS_LIMIT_CUT_BASE + totalSelectors * GAS_LIMIT_PER_FACET,
        });
        log(`Diamond cut: tx hash: ${tx.hash}`);
        const receipt = await tx.wait();
        if (!receipt.status) {
          throw Error(`Diamond upgrade was failed: ${tx.hash}`);
        }
    }
  } catch (e) {
    log(`unable to cut facet: \n ${e}`);
  }
  for (const facetCutInfo of upgradeCut) {
    for (const facetModified of facetCutInfo.functionSelectors) {
      switch (facetCutInfo.action) {
        case FacetCutAction.Add:
        case FacetCutAction.Replace:
          deployedFuncSelectors.facets[facetModified] = facetCutInfo.facetAddress;
          break;
        case FacetCutAction.Remove:
          delete deployedFuncSelectors.facets[facetModified];
          break;
      }
    }
  }

  log('Diamond Facets cuts completed');
}

export async function afterDeployCallbacks(
  networkDeployInfo: INetworkDeployInfo,
  facetsToDeploy: FacetToDeployInfo = Facets,
  previousVersions: PreviousVersionRecord,
) {
  const signers = await ethers.getSigners();
  const owner = signers[0];
  const diamond = dc.ProxyDiamond as ProxyDiamond;
  const facetsPriority = Object.keys(facetsToDeploy).sort(
    (a, b) => facetsToDeploy[a].priority - facetsToDeploy[b].priority,
  );
  for (const name of facetsPriority) {
    const facetDeployVersionInfo = facetsToDeploy[name];
    let facetVersions = ['0.0'];
    // sort version high to low
    if (facetDeployVersionInfo.versions) {
      facetVersions = Object.keys(facetDeployVersionInfo.versions).sort((a, b) => +b - +a);
    }

    // since the initCall on facet cut function is only one function run through the init functions after deployment in order
    const deployedVersion = +facetVersions[0];
    const facetDeployInfo = facetDeployVersionInfo.versions
      ? facetDeployVersionInfo.versions[deployedVersion]
      : {};
    let previousVersion = previousVersions[name];

    let initFunction: keyof ProxyDiamond | undefined = undefined;
    if (facetDeployInfo.upgradeInit && (facetDeployInfo.fromVersions?.includes(previousVersion || -1))) {
      initFunction = facetDeployInfo.upgradeInit as keyof ProxyDiamond;
    } else if (previousVersion != deployedVersion) {
      initFunction = facetDeployInfo.deployInit as keyof ProxyDiamond;
    }

    log(`Facet: ${name}, Last Deployed Version: ${previousVersion}, Deployed Version: ${deployedVersion}`);

    if (initFunction) {
      const funcSelector = getSighash(`function ${initFunction}`);
      if (!funcSelector) {
        throw new Error("Function selector cannot be null or undefined");
      }

      log(`initFunction being called is ${initFunction}`);

      // Create a transaction object
      const tx = {
        to: diamond.address,
        data: funcSelector, // The 4-byte function selector
        gasLimit: ethers.utils.hexlify(1000000), // Adjust gas as necessary
      };
      try {
        const txResponse = await owner.sendTransaction(tx);
        log("Transaction hash:", txResponse.hash);
        await txResponse.wait();
        log("Transaction confirmed!");
      } catch (error) {
        log(`Error sending transaction: ${error}`);
      }
    }

    if (facetDeployInfo.callback && (previousVersion != deployedVersion)) {
      log(`callback function being called is ${facetDeployInfo.callback.name}`);

      const afterDeployCallback = facetDeployInfo.callback;
      try {
        await afterDeployCallback(networkDeployInfo);
      } catch (e) {
        log(`Failure in after deploy callbacks for ${name}: \n${e}`);
      }
    }
  }
}

export async function deployAndInitDiamondFacets(
  networkDeployInfo: INetworkDeployInfo,
  facetsToDeploy: FacetToDeployInfo = Facets
) {
  // Create the previousDeployedVersions record
  const previousDeployedVersions: PreviousVersionRecord = {};

  const deployInfoBeforeUpgraded: INetworkDeployInfo = JSON.parse(
    JSON.stringify(networkDeployInfo),
  );

  await deployDiamondFacets(networkDeployInfo, facetsToDeploy);
  const deployInfoWithOldFacet: INetworkDeployInfo = Object.assign(
    JSON.parse(JSON.stringify(networkDeployInfo)),
  );
  for (const key in deployInfoWithOldFacet.FacetDeployedInfo) {
    if (deployInfoBeforeUpgraded.FacetDeployedInfo[key])
      deployInfoWithOldFacet.FacetDeployedInfo[key] =
        deployInfoBeforeUpgraded.FacetDeployedInfo[key];

    // Build the previousDeployedVersions in the same loop
    const facetInfo = deployInfoWithOldFacet.FacetDeployedInfo[key];
    if (facetInfo.version !== undefined) {
      previousDeployedVersions[key] = facetInfo.version;
    } else {
      log(`Facet ${key} does not have a version`);
    }
  }
  await deployFuncSelectors(networkDeployInfo, deployInfoWithOldFacet, facetsToDeploy);
  await afterDeployCallbacks(networkDeployInfo, facetsToDeploy, previousDeployedVersions);
}

export async function deployDiamondFacets(
  networkDeployInfo: INetworkDeployInfo,
  facetsToDeploy: FacetToDeployInfo = Facets,
) {
  // deploy facets
  log('');
  log('Deploying facets');
  const deployedFacets = networkDeployInfo.FacetDeployedInfo;

  const facetsPriority = Object.keys(facetsToDeploy).sort(
    (a, b) => facetsToDeploy[a].priority - facetsToDeploy[b].priority,
  );
  for (const name of facetsPriority) {
    const facetDeployVersionInfo = facetsToDeploy[name];
    let facet: BaseContract;
    let facetVersions = ['0.0'];
    // sort version high to low, could be used for future upgrading from version X to version Y
    if (facetDeployVersionInfo.versions) {
      facetVersions = Object.keys(facetDeployVersionInfo.versions).sort((a, b) => +b - +a);
    }

    const upgradeVersion = +facetVersions[0];

    const deployedVersion =
      deployedFacets[name]?.version ?? (deployedFacets[name]?.tx_hash ? 0.0 : -1.0);
    const facetNeedsDeployment =
      !(name in deployedFacets) || deployedVersion != upgradeVersion;

    const externalLibraries = {} as any;
    if (networkDeployInfo.ExternalLibraries) {
      Object.keys(networkDeployInfo.ExternalLibraries)?.forEach((libraryName: string) => {
        if (facetDeployVersionInfo.libraries?.includes(libraryName))
          externalLibraries[libraryName] = networkDeployInfo.ExternalLibraries[libraryName];
      });
    }
    const FacetContract = await ethers.getContractFactory(
      name,
      facetDeployVersionInfo.libraries
        ? {
            libraries: externalLibraries,
          }
        : undefined,
    );

    if (facetNeedsDeployment) {
      log(`Deploying ${name} size: ${FacetContract.bytecode.length}`);
      try {
        // Get current gas price from the network
        const gasPrice = await ethers.provider.getGasPrice();
        log(`Current gas pice: ${gasPrice.toString()}`);
        facet = await FacetContract.deploy({
          gasPrice: gasPrice.mul(110).div(100),
        });
        await facet.deployed();
      } catch (e) {
        log(`Unable to deploy, continuing: ${e}`);
        continue;
      }
      deployedFacets[name] = {
        address: facet.address,
        tx_hash: facet.deployTransaction.hash,
        version: deployedVersion,
      };
      log(`${name} deployed: ${facet.address} tx_hash: ${facet.deployTransaction.hash}`);
    }
  }

  log('Completed Facet deployments\n');
}

export async function deployExternalLibraries(networkDeployedInfo: INetworkDeployInfo) {
  const innerVerifierContract = await ethers.getContractFactory('InnerVerifier');
  const innerVerifier = await innerVerifierContract.deploy();
  const burnVerifierContract = await ethers.getContractFactory('BurnVerifier', {
    libraries: {
      InnerVerifier: innerVerifier.address,
    },
  });
  const burnVerifier = await burnVerifierContract.deploy();
  const zetherVerifierContract = await ethers.getContractFactory('ZetherVerifier', {
    libraries: {
      InnerVerifier: innerVerifier.address,
    },
  });
  const zetherVerifier = await zetherVerifierContract.deploy();
  const LibEncryptionContract = await ethers.getContractFactory('libEncryption');
  const libEncryption = await LibEncryptionContract.deploy();
  networkDeployedInfo.ExternalLibraries = {};
  networkDeployedInfo.ExternalLibraries.BurnVerifier = burnVerifier.address;
  networkDeployedInfo.ExternalLibraries.ZetherVerifier = zetherVerifier.address;
  networkDeployedInfo.ExternalLibraries.libEncryption = libEncryption.address;
}

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  if (require.main === module) {
    debug.enable('.*:log');
    await LoadFacetDeployments();
    const deployer = (await ethers.getSigners())[0];

    log(`Deployer address: ${deployer.address}`);

    // Get the deployer's balance in wei
    const deployerBalance = await ethers.provider.getBalance(deployer.address);
    log(`Deployer balance (in ETH): ${ethers.utils.formatEther(deployerBalance)} ETH`);

    // Estimate the gas cost for the deployment (from getGasCost function)
    const estimatedGasCost = await getGasCost();
    log(`Estimated Gas Cost: ${estimatedGasCost} ETH`);

    // Convert estimated gas cost to wei for comparison
    const estimatedGasCostInWei = ethers.utils.parseUnits(estimatedGasCost, 'ether');

    if (hre.network.name === "hardhat") {
      hre.config.networks["hardhat"].loggingEnabled = true;
    }
    // Check if deployer has enough funds to cover gas costs
    if (deployerBalance.lt(estimatedGasCostInWei)) {
      throw new Error(`Not enough funds to deploy. Deployer balance: ${ethers.utils.formatEther(deployerBalance)} ETH, Required: ${estimatedGasCost} ETH`);
    }

    log(`Sufficient balance to deploy on ${network.name}`);


    const networkName = hre.network.name;
    if (!deployments[networkName]) {
      deployments[networkName] = {
        DiamondAddress: '',
        DeployerAddress: deployer.address,
        FacetDeployedInfo: {},
      };
    }
    const networkDeployedInfo = deployments[networkName];
    await deployDiamond(networkDeployedInfo);

    log(`Contract address deployed is ${networkDeployedInfo.DiamondAddress}`);
    // await deployExternalLibraries(networkDeployedInfo);
    await deployAndInitDiamondFacets(networkDeployedInfo);
    log(
      `Facets deployed to: ${
        (util.inspect(networkDeployedInfo.FacetDeployedInfo, { depth: null }))
      }`,
    );
    if (networkName !== 'hardhat') {
      writeDeployedInfo(deployments);
    }

  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  if (error instanceof Error) {
    console.error(`Deployment error: ${error.message}`);
  } else {
    console.error(`Unknown error occurred: ${error}`);
  }
  process.exitCode = 1;
});
