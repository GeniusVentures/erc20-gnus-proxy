import { ProxyDiamond } from "../../../typechain-types";
import {
  CallbackArgs,
  IDeployConfig,
  Diamond
} from "@gnus.ai/diamonds";

function getGNUSAIDiamondAddresses() { }

function callbackCreateXMPLToken(CallbackArgs) {
  const { initConfig: IDeployConfig, deployInfo: INetworkDeployInfo } = CallbackArgs;
  let GNUSAIContractAddress;
  // GNUSAIContractAddress = GNUSAIContractAddresses[initConfig.networkName];

  // if (GNUSAIContractAddress) {
  //   const proxyDiamond = initConfig.diamondName as ProxyDiamond;
  //   await proxyDiamond.initializeERC20Proxy(
  //     GNUSAIContractAddress,
  //     chainID,
  //     "ExampleToken",
  //     "XMPL"
  //   );
  // } else {
  //   debuglog(`No GNUS.ai ERC1155 contract address found for network: ${networkName}`);
  // }
};
