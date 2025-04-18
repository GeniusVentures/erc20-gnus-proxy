import { ethers } from "hardhat";
import { utils, BigNumber } from "ethers";

export function getInterfaceID(contractInterface: utils.Interface) {
  let interfaceID: BigNumber = ethers.constants.Zero;
  const functions: string[] = Object.keys(contractInterface.functions);
  for (let i = 0; i < functions.length; i++) {
    interfaceID = interfaceID.xor(contractInterface.getSighash(functions[i]));
  }

  return interfaceID;
}

// export function getInterfaceID(iface: utils.Interface): string {
//   const selectors = Object.keys(iface.functions).map(fn =>
//     iface.getSighash(fn)
//   );

//   let interfaceId = ethers.BigNumber.from(0);

//   for (const selector of selectors) {
//     interfaceId = interfaceId.xor(ethers.BigNumber.from(selector));
//   }

//   return interfaceId.toHexString();
// }

export function toWei(value: number | string): BigNumber {
  return ethers.utils.parseEther(value.toString());
}