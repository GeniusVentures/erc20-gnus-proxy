import { ethers, network } from 'hardhat';
import { dc, assert, expect, toWei, GNUS_TOKEN_ID, debuglog } from '../scripts/common';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ProxyDiamond } from '../typechain-types';
import { getInterfaceID } from '../scripts/FacetSelectors';
import { IERC20Upgradeable__factory } from '../typechain-types';
import { deployments } from '../scripts/deployments';

export function suite() {
  describe('Proxy ERC20 -> GNUS.ai Testing', async function () {
    let signers: SignerWithAddress[];
    let owner: string;
    let pdAddr1: ProxyDiamond;
    const proxyDiamond = dc.ProxyDiamond as ProxyDiamond;

    before(async () => {
      signers = await ethers.getSigners();
      owner = signers[0].address;
      pdAddr1 = await proxyDiamond.connect(signers[1]);
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
      const tokenSupply = await proxyDiamond['totalSupply()']();
      assert(
          tokenSupply.eq(toWei(900_000)),
          `Token Supply should be 900,000, but is ${ethers.utils.formatEther(tokenSupply)}`,
      );

      let ownerSupply = await proxyDiamond['balanceOf(address)'](owner);
      assert(
          ownerSupply.eq(toWei(0)),
          `Owner balanceOf should be 0, but is ${ethers.utils.formatEther(ownerSupply)}`,
      );
      
      /* TODO: replace with Creator role, etc.
      const minterRole = await proxyDiamond['MINTER_ROLE']();
      const ownershipFacet = await ethers.getContractAt(
          'GeniusOwnershipFacet',
          proxyDiamond.address,
      );
      expect(await ownershipFacet.hasRole(minterRole, owner)).to.be.eq(true);
      await proxyDiamond['mint(address,uint256)'](owner, toWei(150));
      ownerSupply = await proxyDiamond['balanceOf(address)'](owner);
      assert(
          ownerSupply.eq(toWei(150)),
          `Owner balanceOf should be > 150, but is ${ethers.utils.formatEther(ownerSupply)}`,
      );

      await proxyDiamond.transfer(signers[3].address, toWei(150));
      */
    });

    /* TODO: await creator being able to mint
    it('Testing GNUS transferFrom & approval', async () => {
      const gdAddr3 = await proxyDiamond.connect(signers[3]);
      const gdAddr4 = await proxyDiamond.connect(signers[4]);
      const addr3 = signers[3].address;
      const addr4 = signers[4].address;

      await gdAddr3.approve(owner, toWei(50));

      await expect(
          gdAddr4.transferFrom(addr3, owner, toWei(50)),
      ).to.eventually.be.rejectedWith(Error, /ERC20: insufficient allowance/);

      await proxyDiamond.transferFrom(addr3, addr4, toWei(25));
      await proxyDiamond.transferFrom(addr3, owner, toWei(25));

      await expect(
          proxyDiamond.transferFrom(addr3, owner, toWei(1)),
      ).to.eventually.be.rejectedWith(Error, /ERC20: insufficient allowance/);

      // approve a contract (EscrowAIJob) to receive ERC20 (GNUS), will be lost, but that's OK
      await gdAddr3.setApprovalForAll(owner, true);

      // allow owner to transfer on behalf of addrs in E
      const escrowAIContractAddress = dc.EscrowAIJob.address;
      await expect(
          proxyDiamond.safeTransferFrom(
              addr3,
              escrowAIContractAddress,
              GNUS_TOKEN_ID,
              toWei(1),
              [],
          ),
      ).to.eventually.be.rejectedWith(
          Error,
          /ERC1155: transfer to non ERC1155Receiver implementer/,
      );

      // remove approval for owner to transfer ERC1155 tokens
      await gdAddr3.setApprovalForAll(owner, false);

      // ERC20 approvate 50 more tokens
      await gdAddr3.approve(owner, toWei(50));

      // this should work, because ERC20 doesn't check ERC1155 interfaces
      await proxyDiamond.transferFrom(addr3, escrowAIContractAddress, toWei(1));
    });

     */
  });
}
