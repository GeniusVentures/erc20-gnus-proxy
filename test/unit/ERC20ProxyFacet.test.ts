import { expect, assert } from "chai";
import { ethers } from "hardhat";
import hre from 'hardhat';
import { debug } from 'debug';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { multichain } from 'hardhat-multichain';
import TestDeployer from '../setup/testDeployer';
import { deployments } from '../../scripts/deployments';
import { IERC20Upgradeable__factory } from '../../typechain-types';
import { getInterfaceID } from '../../scripts/FacetSelectors';
import { ProxyDiamond } from '../../typechain-types/';
import { ERC1155SupplyUpgradeable, ERC1155Upgradeable, ERC20ProxyFacet } from "../../typechain-types";
import { toWei, GNUS_TOKEN_ID } from "../../scripts/common";

describe('ERC20Proxy Tests', async function () {
  const log: debug.Debugger = debug('DiamondDeploy:log');
  this.timeout(0); // Extend timeout to accommodate deployments
  
  let chains = multichain.getProviders() || new Map<string, JsonRpcProvider>();
  
  // Check the process.argv for the Hardhat network name
  if (process.argv.includes('test-multichain')) {
    const chainNames = process.argv[process.argv.indexOf('--chains') + 1].split(',');
    if (chainNames.includes('hardhat')) {
      chains = chains.set('hardhat', ethers.provider);
      
    }
  } else if (process.argv.includes('test') || process.argv.includes('coverage')) {
    chains = chains.set('hardhat', ethers.provider);
  }
  
  for (const [chainName, provider] of chains.entries()) { 
  
    describe(`ERC20Proxy Tests for ${chainName} chain`, async function () {
      let deployer: TestDeployer;
      let deployment: boolean | void;
      let upgrade: boolean | void;
      let signers: SignerWithAddress[];
      let signer0: string;
      let signer1: string;
      let signer2: string;
      let signer0Diamond: ProxyDiamond;
      let signer1Diamond: ProxyDiamond;
      let signer2Diamond: ProxyDiamond;
      // get the signer for the owner
      let owner: string;
      let ownerSigner: SignerWithAddress;
      let ownerDiamond: ProxyDiamond;
      let diamond: ProxyDiamond;
      
      let ethersMultichain: typeof ethers;
      let snapshotId: string;
      
      before(async function () {
        const deployConfig = {
          chainName: chainName,
          provider: provider,
        };
        deployer = await TestDeployer.getInstance(deployConfig);
        deployment = await deployer.deploy();
        expect(deployment).to.be.true;
        upgrade = await deployer.upgrade();
        expect(upgrade).to.be.true;
        // Retrieve the deployed Diamond contract
        diamond = await deployer.getDiamond();    
        if (!diamond) {
          throw new Error(`diamond is null for chain ${chainName}`);
        }
        
        ethersMultichain = ethers;
        ethersMultichain.provider = provider;
        
        // Retrieve the signers for the chain
        signers = await ethersMultichain.getSigners();
        signer0 = signers[0].address;
        signer1 = signers[1].address;
        signer2 = signers[2].address;
        signer0Diamond = diamond.connect(signers[0]);
        signer1Diamond = diamond.connect(signers[1]);
        signer2Diamond = diamond.connect(signers[2]);
        
        // get the signer for the owner
        owner = deployments[chainName]?.DeployerAddress || signer0;
        ownerSigner = await ethersMultichain.getSigner(owner);
        ownerDiamond = diamond.connect(ownerSigner);
      });
      
      beforeEach(async function () {
        snapshotId = await provider.send('evm_snapshot', []);
      });
        
      afterEach(async () => {
        await provider.send('evm_revert', [snapshotId]);
      });

      it('Testing Proxy ERC20 interface is supported', async () => {
        const IERC20UpgradeableInterface = IERC20Upgradeable__factory.createInterface();
        // interface ID does not include base contract(s) functions.
        const IERC20InterfaceID = getInterfaceID(IERC20UpgradeableInterface);
        assert(
            await diamond.supportsInterface(IERC20InterfaceID._hex),
            "Doesn't support IERC20Upgradeable",
        );
      });

      // it('Testing Proxy ERC20 transfer', async () => {
      //   const tokenSupply = await diamond['totalSupply()']();
      //   assert(
      //       tokenSupply.eq(toWei(900_000)),
      //       `Token Supply should be 900,000, but is ${ethers.utils.formatEther(tokenSupply)}`,
      //   );

      //   let ownerSupply = await diamond['balanceOf(address)'](owner);
      //   assert(
      //       ownerSupply.eq(toWei(0)),
      //       `Owner balanceOf should be 0, but is ${ethers.utils.formatEther(ownerSupply)}`,
      //   );
        
        // TODO: replace with Creator role, etc.
        // const creatorRole = await diamond.creator_role();
        // const ownershipFacet = await ethers.getContractAt(
        //     'GeniusOwnershipFacet', // TODO: replace with actual contract name
        //     diamond.address,
        // );
        // expect(await ownershipFacet.hasRole(creatorRole, owner)).to.be.eq(true);
        // await diamond['mint(address,uint256)'](owner, toWei(150));
        // ownerSupply = await diamond['balanceOf(address)'](owner);
        // assert(
        //     ownerSupply.eq(toWei(150)),
        //     `Owner balanceOf should be > 150, but is ${ethers.utils.formatEther(ownerSupply)}`,
        // );
        // TODO: this should be a test, expct or assert, or be removed
        // await diamond.transfer(signer1, toWei(150));
        
      // });

      // TODO: await creator being able to mint
      // it('Testing Proxy transferFrom & approval', async () => {
      //   await signer2Diamond.approve(owner, toWei(50));

      //   await expect(
      //       signer2Diamond.transferFrom(signer1, owner, toWei(50)),
      //   ).to.eventually.be.rejectedWith(Error, /ERC20: insufficient allowance/);

      //   await diamond.transferFrom(signer1, signer2, toWei(25));
      //   await diamond.transferFrom(signer1, owner, toWei(25));

      //   await expect(
      //       diamond.transferFrom(signer1, owner, toWei(1)),
      //   ).to.eventually.be.rejectedWith(Error, /ERC20: insufficient allowance/);

      //   // approve a contract (EscrowAIJob) to receive ERC20 (GNUS), will be lost, but that's OK
      //   await signer1Diamond.setApprovalForAll(owner, true);

      //   // allow owner to transfer on behalf of addrs in E
      //   const escrowAIContractAddress = dc.EscrowAIJob.address;
      //   await expect(
      //       diamond.safeTransferFrom(
      //           signer1,
      //           escrowAIContractAddress,
      //           GNUS_TOKEN_ID,
      //           toWei(1),
      //           [],
      //       ),
      //   ).to.eventually.be.rejectedWith(
      //       Error,
      //       /ERC1155: transfer to non ERC1155Receiver implementer/,
      //   );

      //   // remove approval for owner to transfer ERC1155 tokens
      //   await signer1Diamond.setApprovalForAll(owner, false);

      //   // ERC20 approvate 50 more tokens
      //   await signer1Diamond.approve(owner, toWei(50));

      //   // this should work, because ERC20 doesn't check ERC1155 interfaces
      //   await diamond.transferFrom(signer1, escrowAIContractAddress, toWei(1));
      // });
    });
  }
});
