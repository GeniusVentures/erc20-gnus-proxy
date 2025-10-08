import { ContractTransactionResponse } from "ethers";

export async function logEvents(
  tx: ContractTransactionResponse,
): Promise<void> {
  const receipt = await tx.wait();

  if (receipt?.logs) {
    for (const log of receipt.logs) {
      console.log(`Log: ${JSON.stringify(log)}`);
    }
  }
}
