import { BaseContract, BigNumber, Contract, ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';
import { debug } from 'debug';
import * as chai from 'chai';
import { ERC1155SupplyUpgradeable } from "../typechain-types";


export const assert = chai.assert;
export const expect = chai.expect;
import chaiAsPromised from 'chai-as-promised';
import { Fragment } from '@ethersproject/abi';
import fs from 'fs';
import util from 'util';
import { CreateProposalRequest } from "@openzeppelin/defender-admin-client";
import { JsonRpcProvider } from '@ethersproject/providers';

chai.use(chaiAsPromised);

declare global {
  export var debuglog: debug.Debugger;
}

global.debuglog = debug('UnitTest:log');
global.debuglog.color = '158';

export const debuglog = global.debuglog;

export const toBN = BigNumber.from;
export const GNUS_TOKEN_ID = toBN(0);
export const XMPL_TOKEN_ID = toBN(1234567890);

export interface IFacetDeployedInfo {
  address?: string;
  tx_hash?: string;
  funcSelectors?: string[];
  verified?: boolean;
  version?: number;
}

export type FacetDeployedInfo = Record<string, IFacetDeployedInfo>;

// map Facet Selectors to contract address string
export interface IDeployedFacetSelectors {
  facets: Record<string, string>;
}

// map contract name to array of FacetSignature strings
export interface IDeployedContractFacetSelectors {
  contractFacets: Record<string, string[]>;
}

export type FacetSelectorsDeployed = IDeployedFacetSelectors &
  IDeployedContractFacetSelectors;

export interface INetworkDeployInfo {
  DiamondAddress: string;
  DeployerAddress: string;
  FacetDeployedInfo: FacetDeployedInfo;
  ExternalLibraries?: any;
  protocolVersion?: number;
  provider?: JsonRpcProvider;
  networkName?: string;
}

export type AfterDeployInit = (
  networkDeployInfo: INetworkDeployInfo,
) => Promise<void | boolean>;

export interface IVersionInfo {
  fromVersions?: number[];
  deployInit?: string;          // init for when not upgrading and first deployment
  upgradeInit?: string;   // upgradeInit if version is upgrading from previous version
  deployInclude?: string[];
  callback?: AfterDeployInit;
}

export type VersionRecord = Record<number, IVersionInfo>;

export interface IFacetToDeployInfo {
  priority: number;
  versions?: VersionRecord;
  libraries?: string[];
}

export type FacetToDeployInfo = Record<string, IFacetToDeployInfo>;

export type PreviousVersionRecord = Record<string, number>;

export function toWei(value: number | string): BigNumber {
  return ethers.utils.parseEther(value.toString());
}

export function getSighash(funcSig: string): string {
  return ethers.utils.Interface.getSighash(Fragment.fromString(funcSig));
}

export function writeDeployedInfo(deployments: { [key: string]: INetworkDeployInfo }) {
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

export type DeployedContracts = Record<string, BaseContract>;

export const dc: DeployedContracts = {};

export const diamondCutFuncAbi = {
  inputs: [
    {
      components: [
        {
          name: 'facetAddress',
          type: 'address',
        },
        {
          name: 'action',
          type: 'uint8',
        },
        {
          name: 'functionSelectors',
          type: 'bytes4[]',
        },
      ],
      name: '_diamondCut',
      type: 'tuple[]',
    },
    {
      name: '_init',
      type: 'address',
    },
    {
      name: '_calldata',
      type: 'bytes',
    },
  ],
  name: 'diamondCut',
};

export interface IDefenderViaInfo {
  via: CreateProposalRequest['via'],
  viaType: CreateProposalRequest['viaType'];
}

export function createPreviousVersionRecordWithMap(facetInfo: FacetDeployedInfo): PreviousVersionRecord {
  const previousVersionRecord: PreviousVersionRecord = {};

  // Using Object.entries() to get key-value pairs and then mapping over them
  Object.entries(facetInfo).map(([facetName, info]) => {
    if (info.version !== undefined) {
      previousVersionRecord[facetName] = info.version;
    } else {
      console.warn(`Facet ${facetName} does not have a version`);
    }
  });

  return previousVersionRecord;
}


export interface ERC20ProxyStorageLayout {
  erc1155Contract: ERC1155SupplyUpgradeable;
  childTokenId: BigNumber;
  name: string;
  symbol: string;
}

export interface ERC20ProxyStorage extends Contract {
  layout(): Promise<ERC20ProxyStorageLayout>;
  initializeERC20Proxy(
    erc1155Address: string,
    childTokenId: BigNumber,
    name: string,
    symbol: string
  ): Promise<ContractTransaction>;
  name(): Promise<string>;
  symbol(): Promise<string>;
  decimals(): Promise<number>;
  totalSupply(): Promise<BigNumber>;
  balanceOf(account: string): Promise<BigNumber>;
  transfer(recipient: string, amount: BigNumber): Promise<ContractTransaction>;
  approve(spender: string, amount: BigNumber): Promise<ContractTransaction>;
  allowance(owner: string, spender: string): Promise<BigNumber>;
  transferFrom(
    sender: string,
    recipient: string,
    amount: BigNumber
  ): Promise<ContractTransaction>;
}