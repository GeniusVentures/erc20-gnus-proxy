import { ProxyDiamond } from "../../typechain-types";
import { dc, debuglog, INetworkDeployInfo, AfterDeployInit, getSighash } from "../common";
import { Facets } from "../facets";
// import { ethers } from "hardhat";
// import { JsonRpcProvider } from "@ethersproject/providers";
// import { multichain } from "hardhat-multichain";

const GNUSAIContractAddresses: { [key: string]: string } = {
  sepolia: "0x910bAa33DeB0D614Aa9d80e38b7f0BF87549c2fC",
  localhost: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
};

const afterDeploy: AfterDeployInit = async (networkDeployInfo: INetworkDeployInfo) => {
  let networkName = networkDeployInfo.networkName || 'localhost';
  let chainID = networkDeployInfo.provider?.network.chainId || 1;
  let GNUSAIContractAddress;
  if (networkDeployInfo.networkName == 'hardhat') {
    networkName = 'localhost';
    // let chains = multichain.getProviders() || new Map<string, JsonRpcProvider>();
    // if (process.argv.includes('test-multichain')) {
    //   const chainNames = process.argv[process.argv.indexOf('--chains') + 1].split(',');
    //   if (chainNames.includes('hardhat')) {
    //     chains = chains.set('hardhat', ethers.provider);
    //   }
    // } else if (process.argv.includes('test') || process.argv.includes('coverage')) {
    //   chains = chains.set('hardhat', ethers.provider);
    // }
    // const chainInfo = {
    //   chainName: 'hardhat',
    //   provider: ethers.provider,
    // };
    // const { default: MultiChainTestDeployer } = await import("@gnus-ai/gnus-ai/test/setup/multichainTestDeployer");
    // const gnusDeployer = await MultiChainTestDeployer.getInstance(chainInfo);
    // GNUSAIContractAddresses[networkName] = gnusDeployer.getDiamond().address;
  //   } else {
    // const { deployments: gnusDeployments } = await import("@gnus-ai/gnus-ai/scripts/deployments");
    // const gnusDeployment = gnusDeployments;
    // const GNUSAIContractAddress = gnusDeployment[networkName].DiamondAddress;
    // GNUSAIContractAddresses[networkName] = GNUSAIContractAddress;
    }
    GNUSAIContractAddress = GNUSAIContractAddresses[networkName];

  if (GNUSAIContractAddress) {
    const proxyDiamond = dc.ProxyDiamond as ProxyDiamond;
    await proxyDiamond.initializeERC20Proxy(
      GNUSAIContractAddress,
      chainID,
      "ExampleToken",
      "XMPL"
    );
  } else {
    debuglog(`No GNUS.ai ERC1155 contract address found for network: ${networkName}`);
  }
};

Facets.ERC20ProxyFacet = {
  priority: 20,
  versions: {
    0.0: {
      callback: afterDeploy,
    },
  },
};
