import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying ERC20ProxyFacet with the account:', deployer.address);

  const ERC20ProxyFacet = await ethers.getContractFactory('ERC20ProxyFacet');
  const erc20ProxyFacet = await ERC20ProxyFacet.deploy();

  await erc20ProxyFacet.deployed();

  console.log('ERC20ProxyFacet deployed to:', erc20ProxyFacet.address);

  // Note: You'll need to manually add this facet to your Diamond contract
  console.log('Remember to add this facet to your Diamond contract!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
