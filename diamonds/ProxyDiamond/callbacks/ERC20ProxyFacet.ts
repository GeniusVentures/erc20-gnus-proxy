import { ProxyDiamond } from "../../../typechain-types";
import {
  CallbackArgs,
} from "diamonds";
import hre from "hardhat";
import { loadDiamondContract } from '../../../scripts/utils/loadDiamondArtifact';

// export async function createXMPLToken(CallbackArgs: CallbackArgs) {
//   const { diamond } = CallbackArgs;

//   const networkName = diamond.networkName;
//   const chainID = diamond.chainId;
//   const deployInfo = diamond.getDeployedDiamondData();

//   console.log(`In ERC20ProxyFacet after Deploy function, chainID: ${chainID}`);
//   console.log(`Network name: ${networkName}`);
//   // Get the GeniusDiamond instance
//   const diamondName = diamond.diamondName;
//   const diamondAddress = deployInfo.DiamondAddress!;
//   const deployer = diamond.signer!;
//   const diamondArtifactName = `hardhat-diamond-abi/HardhatDiamondABI.sol:${diamondName}`;
//   const diamondArtifact = hre.artifacts.readArtifactSync(diamondArtifactName);
//   const diamondContract = loadDiamondContract(diamondAddress, diamondArtifact.abi, diamond.provider);
//   const deployerDiamondContract = diamondContract.connect(deployer);
//   await deployerDiamondContract.initializeERC20Proxy(
//     diamondAddress,
//     chainID,
//     "ExampleToken",
//     "XMPL"
//   );
// };
