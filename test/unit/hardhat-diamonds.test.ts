import { task } from "hardhat/config";

task("print-diamonds", "Prints the diamonds configuration").setAction(async (_, hre) => {
  console.log(hre.diamonds?.getDiamondsConfig());
});