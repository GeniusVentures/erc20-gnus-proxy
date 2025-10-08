import {
  CallbackArgs,
} from "diamonds";
import hre from "hardhat";
import { loadDiamondContract } from '../../../scripts/utils/loadDiamondArtifact';
import { ProxyDiamond } from '../../../diamond-typechain-types/ProxyDiamond';

export async function createXMPLToken(CallbackArgs: CallbackArgs) {
  const { diamond } = CallbackArgs;

  const networkName = diamond.networkName;
  const chainID = diamond.chainId;
  const deployInfo = diamond.getDeployedDiamondData();

  console.log(`In ERC20ProxyFacet after Deploy function, chainID: ${chainID}`);
  console.log(`Network name: ${networkName}`);
  // Get the GeniusDiamond instance
  const diamondAddress = deployInfo.DiamondAddress!;
  const diamondContract = await loadDiamondContract<ProxyDiamond>(diamond, diamondAddress);
  await diamondContract.initializeERC20Proxy(
    diamondAddress,
    chainID,
    "ExampleToken",
    "XMPL"
  );
};
