// Fix for ethereum-waffle compatibility issue
declare module "ethereum-waffle/dist/esm/src/ContractJSON" {
  // Re-export the correct type from the actual location
  export * from "ethereum-waffle/dist/esm/ContractJSON";
}
