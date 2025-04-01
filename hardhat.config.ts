import * as dotenv from 'dotenv';

import { HardhatUserConfig, task } from 'hardhat/config';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import 'hardhat-diamond-abi';
import 'hardhat-abi-exporter';
import '@gnus.ai/hardhat-diamonds';
import '@typechain/hardhat';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-web3';
import 'solidity-coverage';
import 'hardhat-multichain';
// import './test/integration/setup/compileGNUSAI';

dotenv.config();

/*
 * Destructuring environment variables required for the configuration.
 * These variables are fetched from the `.env` file to avoid hardcoding sensitive data.
 * - HH_CHAIN_ID: Custom chain ID for the Hardhat network (default is 31337 if not set).
 * - DEPLOYER_PRIVATE_KEY: Private key of the deployer account.
 * - SEPOLIA_RPC: RPC URL for the Sepolia network.
 * - ETHEREUM_RPC: RPC URL for the Ethereum network.
 * - POLYGON_RPC: RPC URL for the Polygon network.
 * - AMOY_RPC: RPC URL for the Amoy network.
 * - ETH_BLOCK: Block number for the Ethereum network.
 * - POLY_BLOCK: Block number for the Polygon network.
 * - AMOY_BLOCK: Block number for the Amoy network.
 * - SEPOLIA_BLOCK: Block number for the Sepolia network.
 */
const { 
  HH_CHAIN_ID,
  DEPLOYER_PRIVATE_KEY, 
  SEPOLIA_RPC, 
  MAINNET_RPC,
  POLYGON_RPC,
  POLYGON_AMOY_RPC, 
  MAINNET_BLOCK,
  POLYGON_BLOCK,
  POLYGON_AMOY_BLOCK,
  SEPOLIA_BLOCK,
  BASE_RPC,
  BASE_BLOCK,
  BASE_SEPOLIA_RPC,
  BASE_SEPOLIA_BLOCK,
  BSC_RPC,
  BSC_BLOCK,
  BSC_TESTNET_RPC,
  BSC_TESTNET_BLOCK,
} = process.env;

// default blank RPC URLs will return an error. Must be configured in the .env file. 
export const mainnetUrl: string = MAINNET_RPC || ""; // Ethereum RPC URL
export const polyUrl: string = POLYGON_RPC || ""; // Polygon RPC URL
export const amoyUrl: string = POLYGON_AMOY_RPC || ""; // Amoy RPC URL
export const sepoliaUrl: string = SEPOLIA_RPC || ""; // Sepolia RPC URL
export const baseUrl: string = BASE_RPC || ""; // Base RPC URL
export const baseSepoliaUrl: string = BASE_SEPOLIA_RPC || ""; // Base Sepolia RPC URL
export const bscUrl: string = BSC_RPC || ""; // BSC RPC URL
export const bscTestnetUrl: string = BSC_TESTNET_RPC || ""; // BSC Testnet RPC URL
// These set default values as well so missing environment variables set default to latest block.
export const mainnetBlock: number = parseInt(MAINNET_BLOCK || "0"); // Ethereum block number
export const polyBlock: number = parseInt(POLYGON_BLOCK || "0"); // Polygon block number
export const amoyBlock: number = parseInt(POLYGON_AMOY_BLOCK || "0"); // Amoy block number
export const sepoliaBlock: number = parseInt(SEPOLIA_BLOCK || "0"); // Sepolia block number
export const baseBlock: number = parseInt(BASE_BLOCK || "0"); // Base block number
export const baseSepoliaBlock: number = parseInt(BASE_SEPOLIA_BLOCK || "0"); // Base Sepolia block number
export const bscBlock: number = parseInt(BSC_BLOCK || "0"); // BSC block number
export const bscTestnetBlock: number = parseInt(BSC_TESTNET_BLOCK || "0"); // BSC Testnet block number

let multichainTestHardhat = '';
// If this is a test-multichain task then we need to parse the --chains argument to get the chain names
if (process.argv.includes('test-multichain') && process.argv.includes('--chains')) {
  const chains = process.argv[process.argv.indexOf('--chains') + 1].split(',');
  if (chains.includes('hardhat') || chains.includes('localhost') || !chains) {
    multichainTestHardhat = 'http://localhost:8545';
  }
}
if (process.argv.includes('coverage')) {
  multichainTestHardhat = 'http://localhost:8555';
}
export const multichainHardhat = multichainTestHardhat;

// Prints the HH created accounts to the console
task('accounts', 'Prints the list of accounts', async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// filter out duplicate function signatures
function genSignature(name: string, inputs: Array<any>, type: string): string {
  return `${type} ${name}(${inputs.reduce((previous, key) => {
    const comma = previous.length ? ',' : '';
    return previous + comma + key.internalType;
  }, '')})`;
}

// Custom filtering of duplicate function signatures for hardhat-diamond-abi 
let proxyDiamondElements = new Set<string>();

function filterDupeProxyFunctions(
  abiElement: any,
  index: number,
  fullAbiL: any[],
  fullyQualifiedName: string,
) {
  if (['function', 'event'].includes(abiElement.type)) {
    const funcSignature = genSignature(abiElement.name, abiElement.inputs, abiElement.type);
    if (proxyDiamondElements.has(funcSignature)) {
      return false;
    }
    proxyDiamondElements.add(funcSignature);
  } else if (abiElement.type === 'fallback') {
    if (!fullyQualifiedName.match('ProxyDiamond.sol')) {
      return false;
    }
  }
  return true;
}

let geniusDiamondElements = new Set<string>();
function filterDupeGeniusFunctions(
  abiElement: any,
  index: number,
  fullAbiL: any[],
  fullyQualifiedName: string,
) {
  if (['function', 'event'].includes(abiElement.type)) {
    const funcSignature = genSignature(abiElement.name, abiElement.inputs, abiElement.type);
    if (geniusDiamondElements.has(funcSignature)) {
      return false;
    }
    geniusDiamondElements.add(funcSignature);
  } else if (abiElement.type === 'fallback') {
    if (!fullyQualifiedName.match('gnus-ai/GeniusDiamond.sol')) {
      return false;
     }
  }
  return true;
}

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.9',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  chainManager: {
    chains: {
      mainnet: {
        rpcUrl: mainnetUrl,
        blockNumber: mainnetBlock,
      }, 
      polygon: {
        rpcUrl: polyUrl,
        blockNumber: polyBlock,
      }, 
      sepolia: {
        rpcUrl: sepoliaUrl,
        blockNumber: sepoliaBlock,
        chainId: 11155111
      }, 
      polygon_amoy: {
        rpcUrl: amoyUrl,
        blockNumber: amoyBlock,
        chainId: 80002
      },
      hardhat: { 
        rpcUrl: multichainHardhat,
      },
      base: {
        rpcUrl: baseUrl,
        blockNumber: baseBlock,
      },
      base_sepolia: {
        rpcUrl: baseSepoliaUrl,
        blockNumber: baseSepoliaBlock,
      },
      bsc: {
        rpcUrl: bscUrl,
        blockNumber: bscBlock,
      },
      bsc_testnet: {
        rpcUrl: bscTestnetUrl,
        blockNumber: bscTestnetBlock,
      },
    },
  },
  networks: {
    hardhat: {
      forking: process.env.FORK_URL
          ? {
            url: process.env.FORK_URL,
            blockNumber: process.env.FORK_BLOCK_NUMBER
                ? parseInt(process.env.FORK_BLOCK_NUMBER)
                : undefined,
          }
          : undefined,
    },
    polygon: {
      url: `https://lb.drpc.org/ogrpc?network=polygon&dkey=${process.env.DRPC_API_KEY}`,
      chainId: 137,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    sepolia: {
      url: `https://nd-964-217-560.p2pify.com/${process.env.CHAINSTACK_ETH_TEST_API_KEY}`,
      chainId: 11155111,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      timeout: 100000,
    },
    arbitrum_sepolia: {
      url: `https://lb.drpc.org/ogrpc?network=arbitrum-sepolia&dkey=${process.env.DRPC_API_KEY}`,
      chainId: 421614,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    arbitrum: {
      url: `https://lb.drpc.org/ogrpc?network=arbitrum&dkey=${process.env.DRPC_API_KEY}`,
      chainId: 42161,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    base_sepolia: {
      url: `https://base-sepolia.core.chainstack.com/${process.env.CHAINSTACK_BASE_TEST_API_KEY}`,
      chainId: 84532,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    bsc_testnet: {
      url: `https://bsc-testnet.core.chainstack.com/${process.env.CHAINSTACK_BSC_TEST_API_KEY}`,
      chainId: 97,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    polygon_amoy: {
      url: `https://lb.drpc.org/ogrpc?network=polygon-amoy&dkey=${process.env.DRPC_API_KEY}`,
      chainId: 80002,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    local: {
      url: `http://127.0.0.1:8545`,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    mainnet: {
      url: `https://lb.drpc.org/ogrpc?network=ethereum=${process.env.DRPC_API_KEY}`,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    bsc: {
      url: `https://lb.drpc.org/ogrpc?network=bsc&dkey=${process.env.DRPC_API_KEY}`,
      chainId: 56,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    base: {
      url: `https://lb.drpc.org/ogrpc?network=base&dkey=${process.env.DRPC_API_KEY}`,
      chainId: 8453,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'USD',
  },
  etherscan: {
    apiKey: {
      goerli:
          process.env.ETHERSCAN_API_KEY !== undefined ? process.env.ETHERSCAN_API_KEY : '',
      polygonMumbai:
          process.env.POLYGONSCAN_API_KEY !== undefined
              ? process.env.POLYGONSCAN_API_KEY
              : '',
      polygon:
          process.env.POLYGONSCAN_API_KEY !== undefined
              ? process.env.POLYGONSCAN_API_KEY
              : '',
      polygon_amoy:
          process.env.POLYGONSCAN_API_KEY !== undefined
              ? process.env.POLYGONSCAN_API_KEY
              : '',
      sepolia: process.env.ETHERSCAN_API_KEY || '',
      mainnet: process.env.ETHERSCAN_API_KEY || '',
      bsc: process.env.BSCSCAN_API_KEY || '',
      bsc_testnet: process.env.BSCSCAN_API_KEY || '',
      arbitrum_sepolia: process.env.ARBITRUM_API_KEY || '',
      base_sepolia: process.env.BASESCAN_API_KEY || '',
      base: process.env.BASESCAN_API_KEY || '',
    },
    customChains: [
      // additional etherscan config
      {
        network: 'arbitrum_sepolia',
        chainId: 421614,
        urls: {
          apiURL: 'https://api-sepolia.arbiscan.io/api',
          browserURL: 'https://sepolia.arbiscan.io/',
        },
      },
      {
        network: 'base_sepolia',
        chainId: 84532,
        urls: {
          apiURL: 'https://api-sepolia.basescan.org/api',
          browserURL: 'https://sepolia.basescan.org/',
        },
      },
      {
        network: 'bsc_testnet',
        chainId: 97,
        urls: {
          apiURL: 'https://api-testnet.bscscan.com/api',
          browserURL: 'https://testnet.bscscan.com',
        },
      },
      {
        network: 'base',
        chainId: 8453,
        urls: {
          apiURL: 'https://api.basescan.org/api',
          browserURL: 'https://basescan.org',
        },
      },
      {
        network: 'polygon_amoy',
        chainId: 80002,
        urls: {
          apiURL: 'https://api-amoy.polygonscan.com/api',
          browserURL: 'https://amoy.polygonscan.com/',
        },
      },

    ],
  },
  abiExporter: {
    flat: true,
    spacing: 2,
    pretty: true,
  },
  diamonds: {
    'ProxyDiamond': {
      path: 'contracts/erc20-gnus-proxy',
      deployments_path: 'diamonds/',
      facets_path: 'contracts/erc20-gnus-proxy',
      include: [
        'ERC20ProxyFacet',
      ],
      exclude: [],
    },
    'GeniusDiamond': {
      path: 'contracts/gnus-ai-contracts',
      deployments_path: 'diamonds/',
      facets_path: 'contracts/gnus-ai/',
      include: [
        'ERC20TransferBatch',
        'ERC1155ProxyOperator',
        'GeniusOwnershipFacet',
        'GNUSNFTFactory',
        'GNUSBridge',
        'GeniusAI',
        'GNUSNFTCollectionName',
        'GNUSContractAssets'
      ],
      exclude: [],
    },
  },
  diamondAbi: [
    {    
      name: 'ProxyDiamond',
      strict: false,
      include: [
        'ERC20ProxyStorage',
        'ERC20ProxyFacet',
        'ProxyDiamond',
      ],
      exclude: [
        'gnus-ai/*',
        'hardhat-diamond-abi/.*',
      ],
      filter: filterDupeProxyFunctions,
    },
    { 
      name: 'GeniusDiamond',
      strict: false,
      include: [
        'gnus-ai/*',
        'GeniusDiamond',
      ],
      exclude: [
        'ProxyDiamond',
        'ERC20ProxyStorage',
        'ERC20ProxyFacet',
        'hardhat-diamond-abi/.*',
        'Migrations',
        'libEncryption',
        'gnus-ai/mocks/.*',
      ],
      filter: filterDupeGeniusFunctions,
    }
  ],
};

export default config;
