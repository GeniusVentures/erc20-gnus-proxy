
import { ERC1155SupplyUpgradeable, ERC1155Upgradeable, ERC20ProxyFacet } from "../../typechain-types";
import { toWei, GNUS_TOKEN_ID } from "../../scripts/common";

import { debug } from 'debug';
import { pathExistsSync } from "fs-extra";
import { expect, assert } from 'chai';
import { ethers } from 'hardhat';
import hre from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { multichain } from 'hardhat-multichain';
import { getInterfaceID } from '../../scripts/utils/helpers';
import { LocalDiamondDeployer, LocalDiamondDeployerConfig } from '../../scripts/setup/LocalDiamondDeployer';
import { Diamond, deleteDeployInfo } from '@gnus.ai/diamonds';
import {
  ProxyDiamond,
  IERC20Upgradeable__factory,
  IDiamondCut__factory,
  IDiamondLoupe__factory
} from '../../typechain-types/';

describe('🧪 Multichain Fork and Diamond Deployment Tests', async function () {
  const diamondName = 'ProxyDiamond';
  const log: debug.Debugger = debug('GNUSDeploy:log:${diamondName}');
  this.timeout(0); // Extended indefinitely for diamond deployment time

  let networkProviders = multichain.getProviders() || new Map<string, JsonRpcProvider>();

  if (process.argv.includes('test-multichain')) {
    const networkNames = process.argv[process.argv.indexOf('--chains') + 1].split(',');
    if (networkNames.includes('hardhat')) {
      networkProviders.set('hardhat', ethers.provider);
    }
  } else if (process.argv.includes('test') || process.argv.includes('coverage')) {
    networkProviders.set('hardhat', ethers.provider);
  }

  for (const [networkName, provider] of networkProviders.entries()) {
    describe(`🔗 Chain: ${networkName} 🔷 Diamond: ${diamondName}`, function () {
      let diamond: Diamond;
      let signers: SignerWithAddress[];
      let signer0: string;
      let signer1: string;
      let signer2: string;
      let owner: string;
      let ownerSigner: SignerWithAddress;
      let proxyDiamond: ProxyDiamond;
      let signer0Diamond: ProxyDiamond;
      let signer1Diamond: ProxyDiamond;
      let signer2Diamond: ProxyDiamond;
      let ownerDiamond: ProxyDiamond;

      let ethersMultichain: typeof ethers;
      let snapshotId: string;

      before(async function () {
        const config = {
          diamondName: diamondName,
          networkName: networkName,
          provider: provider,
          // chainId: (await provider.getNetwork()).chainId,
          // writeDeployedDiamondData: false,
          // configFilePath: `diamonds/GeniusDiamond/proxydiamond.config.json`,
        } as LocalDiamondDeployerConfig;
        const diamondDeployer = await LocalDiamondDeployer.getInstance(config);
        diamond = await diamondDeployer.getDiamondDeployed();
        const deployInfo = diamond.getDeployedDiamondData();

        const hardhatDiamondAbiPath = 'hardhat-diamond-abi/HardhatDiamondABI.sol:';
        const diamondArtifactName = `${hardhatDiamondAbiPath}${diamond.diamondName}`;
        proxyDiamond = await ethers.getContractAt(diamondArtifactName, deployInfo.DiamondAddress!) as ProxyDiamond;

        ethersMultichain = ethers;
        ethersMultichain.provider = provider;

        // Retrieve the signers for the chain
        signers = await ethersMultichain.getSigners();
        signer0 = signers[0].address;
        signer1 = signers[1].address;
        signer2 = signers[2].address;
        signer0Diamond = proxyDiamond.connect(signers[0]);
        signer1Diamond = proxyDiamond.connect(signers[1]);
        signer2Diamond = proxyDiamond.connect(signers[2]);

        // get the signer for the owner
        owner = deployInfo.DeployerAddress;  //  this will be = signer0 for hardhat;
        ownerSigner = await ethersMultichain.getSigner(owner);
        ownerDiamond = proxyDiamond.connect(ownerSigner);
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
          await proxyDiamond.supportsInterface(IERC20InterfaceID._hex),
          "Doesn't support IERC20Upgradeable",
        );
      });

      it('Testing Proxy ERC20 transfer', async () => {
        const tokenSupply = await proxyDiamond.totalSupply();
        assert(
          tokenSupply.eq(toWei(900_000)),
          `Token Supply should be 900,000, but is ${ethers.utils.formatEther(tokenSupply)}`,
        );

        let ownerSupply = await proxyDiamond.balanceOf(owner);
        assert(
          ownerSupply.eq(toWei(0)),
          `Owner balanceOf should be 0, but is ${ethers.utils.formatEther(ownerSupply)}`,
        );

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
      });
    });
  }
});
