import { JsonRpcProvider } from "@ethersproject/providers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { debug } from "debug";
import { Diamond } from "@geniusventures/diamonds";
import { MaxUint256 } from "ethers";
import { ethers } from "hardhat";
import { multichain } from "@geniusventures/hardhat-multichain";
import { GeniusDiamond } from "../../diamond-typechain-types/GeniusDiamond";
import { ProxyDiamond } from "../../diamond-typechain-types/ProxyDiamond";
import { GNUS_TOKEN_ID } from "../../scripts/common";
import {
  LocalDiamondDeployer,
  LocalDiamondDeployerConfig,
} from "../../scripts/setup/LocalDiamondDeployer";
import { setupLifecyclePolicyLinking } from "../../scripts/utils/GNUSLifecyclePolicyLinking";
import { loadDiamondContract } from "../../scripts/utils/loadDiamondArtifact";

describe("🧪 DEXFlow Integration Tests (D-05 Router Pattern)", async function () {
  const diamondName = "GeniusDiamond";
  const log: debug.Debugger = debug("GNUSDeploy:log:DEXFlow");
  this.timeout(0); // Extended indefinitely for diamond deployment time

  const networkProviders =
    multichain.getProviders() || new Map<string, JsonRpcProvider>();

  if (process.argv.includes("test-multichain")) {
    const networkNames =
      process.argv[process.argv.indexOf("--chains") + 1].split(",");
    if (networkNames.includes("hardhat")) {
      networkProviders.set("hardhat", ethers.provider as any);
    }
  } else if (
    process.argv.includes("test") ||
    process.argv.includes("coverage")
  ) {
    networkProviders.set("hardhat", ethers.provider as any);
  }

  for (const [networkName, provider] of networkProviders.entries()) {
    describe(`🔗 Chain: ${networkName} 🔷 Diamond pair: GeniusDiamond + ProxyDiamond`, function () {
      let geniusDeployerDiamond: Diamond;
      let proxyDeployerDiamond: Diamond;
      let signers: SignerWithAddress[];
      let ownerSigner: SignerWithAddress;
      let holder: SignerWithAddress;
      let router: SignerWithAddress;
      let recipient: SignerWithAddress;
      let freshSpender: SignerWithAddress;
      let geniusDiamond: GeniusDiamond;
      let proxyDiamond: ProxyDiamond;
      let ownerGeniusDiamond: GeniusDiamond;
      let holderGeniusDiamond: GeniusDiamond;
      let ownerProxyDiamond: ProxyDiamond;
      let holderProxyDiamond: ProxyDiamond;
      let routerProxyDiamond: ProxyDiamond;
      let freshSpenderProxyDiamond: ProxyDiamond;
      let geniusDiamondAddress: string;
      let proxyDiamondAddress: string;
      let childTokenId: bigint;

      let ethersMultichain: typeof ethers;
      let outerSnapshotId: string;
      let innerSnapshotId: string;

      // Roles are computed client-side (keccak256 of the UTF-8 name) because
      // the NFT_PROXY_OPERATOR_ROLE getter is NOT guaranteed to be in the
      // aggregated diamond ABI — the 2.6 config's deployInclude list for
      // ERC1155ProxyOperator contains only isApprovedForAll/totalSupply/creators.
      const NFT_PROXY_OPERATOR_ROLE = ethers.keccak256(
        ethers.toUtf8Bytes("NFT_PROXY_OPERATOR_ROLE"),
      );
      const CREATOR_ROLE = ethers.keccak256(
        ethers.toUtf8Bytes("CREATOR_ROLE"),
      );
      const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));

      // Phase 9 minion-denominated semantics: child-token amounts are plain
      // BigInt counts, never parseEther/toWei. The 4-arg factory mint burns the
      // creator's GNUS 1:1, so the creator is funded with the mint amount plus
      // headroom for any bridge-fee residue.
      const CHILD_MAX_SUPPLY = 1000000n;
      const CHILD_MINT_AMOUNT = 1000000n;
      const GNUS_FUND_AMOUNT = CHILD_MINT_AMOUNT * 2n;

      before(async function () {
        // 01-02 harness: MUST be the first statement, before any
        // LocalDiamondDeployer.getInstance — the GeniusDiamond deploy throws
        // on GNUSNFTFactory's GNUSLifecyclePolicy library link otherwise.
        await setupLifecyclePolicyLinking();

        const geniusConfig = {
          diamondName: "GeniusDiamond",
          networkName: networkName,
          provider: provider,
          chainId: (await provider.getNetwork()).chainId,
          writeDeployedDiamondData: false,
          configFilePath: "diamonds/GeniusDiamond/geniusdiamond.config.json",
        } as unknown as LocalDiamondDeployerConfig;
        const geniusDeployer =
          await LocalDiamondDeployer.getInstance(geniusConfig);
        geniusDeployerDiamond = await geniusDeployer.getDiamondDeployed();
        const geniusDeployInfo =
          geniusDeployerDiamond.getDeployedDiamondData();
        geniusDiamondAddress = geniusDeployInfo.DiamondAddress!;

        const proxyConfig = {
          diamondName: "ProxyDiamond",
          networkName: networkName,
          provider: provider,
          chainId: (await provider.getNetwork()).chainId,
          writeDeployedDiamondData: false,
          configFilePath: "diamonds/ProxyDiamond/proxydiamond.config.json",
          // This suite initializes its own ProxyDiamond instance. Without a
          // distinct deployer key it would share the process-wide
          // (ProxyDiamond, network, chainId) cache entry with the unit suite,
          // whose before() would then hit "Initializable: contract is already
          // initialized" in the full-suite run.
          localDiamondDeployerKey: "dexflow-proxy",
        } as unknown as LocalDiamondDeployerConfig;
        const proxyDeployer =
          await LocalDiamondDeployer.getInstance(proxyConfig);
        proxyDeployerDiamond = await proxyDeployer.getDiamondDeployed();
        const proxyDeployInfo = proxyDeployerDiamond.getDeployedDiamondData();
        proxyDiamondAddress = proxyDeployInfo.DiamondAddress!;

        geniusDiamond = await loadDiamondContract<GeniusDiamond>(
          geniusDeployerDiamond,
          geniusDiamondAddress,
        );
        proxyDiamond = await loadDiamondContract<ProxyDiamond>(
          proxyDeployerDiamond,
          proxyDiamondAddress,
        );

        ethersMultichain = ethers;
        ethersMultichain.provider = provider as any;
        signers = await ethersMultichain.getSigners();

        // Both diamonds deploy fresh from signer0 on the local network; honor
        // a recorded DeployerAddress when deployment data supplies one.
        const geniusOwner = geniusDeployInfo.DeployerAddress || signers[0].address;
        const proxyOwner = proxyDeployInfo.DeployerAddress || signers[0].address;
        const geniusOwnerSigner = await ethersMultichain.getSigner(geniusOwner);
        const proxyOwnerSigner = await ethersMultichain.getSigner(proxyOwner);

        ownerSigner = geniusOwnerSigner;
        holder = signers[1];
        router = signers[2];
        recipient = signers[3];
        freshSpender = signers[4];

        ownerGeniusDiamond = geniusDiamond.connect(geniusOwnerSigner);
        holderGeniusDiamond = geniusDiamond.connect(holder);
        ownerProxyDiamond = proxyDiamond.connect(proxyOwnerSigner);
        holderProxyDiamond = proxyDiamond.connect(holder);
        routerProxyDiamond = proxyDiamond.connect(router);
        freshSpenderProxyDiamond = proxyDiamond.connect(freshSpender);

        // Creation and minting roles for the owner signer (the NFT creator).
        await ownerGeniusDiamond.grantRole(MINTER_ROLE, geniusOwner);
        await ownerGeniusDiamond.grantRole(CREATOR_ROLE, geniusOwner);

        // The next direct child of GNUS (parent 0) is (0 << 128) | childCurIndex —
        // read the pre-creation index so the child id is captured from chain
        // state (createNFT assigns newTokenID = (parentID << 128) | childCurIndex++).
        const gnusNftInfo = await geniusDiamond.getNFTInfo(GNUS_TOKEN_ID);
        childTokenId = gnusNftInfo.childCurIndex;

        // exchangeRate is display-only at this pin (Phase 9: the factory mint
        // burns 1:1); maxSupply is a plain minion-denominated count.
        await ownerGeniusDiamond.createNFT(
          GNUS_TOKEN_ID,
          "DEX Test",
          "DEXT",
          2,
          CHILD_MAX_SUPPLY,
          "0x",
        );

        // Fund the creator with GNUS (plain minion-denominated BigInt), then
        // mint the child token to the holder through the production 4-arg
        // factory path, which burns the creator's GNUS 1:1.
        await ownerGeniusDiamond["mint(address,uint256)"](
          geniusOwner,
          GNUS_FUND_AMOUNT,
        );
        await ownerGeniusDiamond["mint(address,uint256,uint256,bytes)"](
          holder.address,
          childTokenId,
          CHILD_MINT_AMOUNT,
          "0x",
        );

        // Pitfall 6: the proxy is the operator on the ERC-1155 leg — without
        // the role grant every proxy transferFrom reverts inside the DIAMOND,
        // not the facet. With the role, isApprovedForAll(user, proxy) reads
        // true for ALL users: the strongest arrangement under which criterion
        // 5 (operator approval must not grant ERC-20 allowance) must still hold.
        await ownerGeniusDiamond.grantRole(
          NFT_PROXY_OPERATOR_ROLE,
          proxyDiamondAddress,
        );

        // Pitfall 6, second half: safeTransferFrom's internal operator check
        // reads the base ERC1155 _operatorApprovals mapping — the diamond-cut
        // isApprovedForAll override answers the external view selector only,
        // it does not intercept the transfer facet's internal call (gnus-ai's
        // own suite pairs the role with an explicit approval for this reason).
        // The holder must therefore approve the proxy itself on the diamond.
        // This is also the exact configuration under which the pre-hardening
        // facet was exploitable: operator approval present, allowance absent.
        await holderGeniusDiamond.setApprovalForAll(proxyDiamondAddress, true);

        // Wire the proxy to the live diamond. The D-04 warm-up
        // (totalSupply(uint256) on the child id) passes against the live pair,
        // or this call reverts.
        await ownerProxyDiamond.initializeERC20Proxy(
          geniusDiamondAddress,
          childTokenId,
          "DEX Test Token",
          "DEXT",
        );

        outerSnapshotId = await provider.send("evm_snapshot", []);
      });

      beforeEach(async function () {
        innerSnapshotId = await provider.send("evm_snapshot", []);
      });

      afterEach(async () => {
        await provider.send("evm_revert", [innerSnapshotId]);
      });

      after(async () => {
        await provider.send("evm_revert", [outerSnapshotId]);
      });

      describe("📦 DEXFlow Fixture: Live Pair Wiring", function () {
        it("Should deploy both diamonds and wire the proxy to the live child token", async () => {
          expect(geniusDiamondAddress).to.be.a("string").and.to.not.be.empty;
          expect(proxyDiamondAddress).to.be.a("string").and.to.not.be.empty;
          expect(proxyDiamondAddress.toLowerCase()).to.not.equal(
            geniusDiamondAddress.toLowerCase(),
          );

          // One-shot init committed against the live diamond (D-04 warm-up
          // passed), so the ERC-20 metadata reads back over the ERC-1155 leg.
          expect(await proxyDiamond.name()).to.equal("DEX Test Token");
          expect(await proxyDiamond.symbol()).to.equal("DEXT");
          expect(await proxyDiamond.decimals()).to.equal(18n);
          expect(await proxyDiamond.totalSupply()).to.equal(CHILD_MINT_AMOUNT);
          expect(await proxyDiamond.balanceOf(holder.address)).to.equal(
            CHILD_MINT_AMOUNT,
          );
        });

        it("Should grant NFT_PROXY_OPERATOR_ROLE with universal ERC-1155 operator approval to the proxy", async () => {
          expect(
            await geniusDiamond.hasRole(
              NFT_PROXY_OPERATOR_ROLE,
              proxyDiamondAddress,
            ),
          ).to.be.true;

          // The ERC1155ProxyOperator override makes isApprovedForAll(user, proxy)
          // true for every user without any per-user approval.
          expect(
            await geniusDiamond.isApprovedForAll(
              holder.address,
              proxyDiamondAddress,
            ),
          ).to.be.true;

          // The child token really lives on the diamond (ERC-1155 overload
          // selectors), matching what the proxy reports.
          expect(
            await geniusDiamond["totalSupply(uint256)"](childTokenId),
          ).to.equal(CHILD_MINT_AMOUNT);
          expect(
            await geniusDiamond["balanceOf(address,uint256)"](
              holder.address,
              childTokenId,
            ),
          ).to.equal(CHILD_MINT_AMOUNT);
        });
      });

      describe("🔁 DEX Router Pattern (D-05)", function () {
        // A DEX router is just approve + transferFrom from a plain signer —
        // no fork infrastructure, no extra dependencies.
        const APPROVE_AMOUNT = 1000n;
        const SPEND_AMOUNT = 400n;

        it("1) holder approve(router, n) records exactly n spendable allowance", async () => {
          await expect(
            holderProxyDiamond.approve(router.address, APPROVE_AMOUNT),
          )
            .to.emit(proxyDiamond, "Approval")
            .withArgs(holder.address, router.address, APPROVE_AMOUNT);
          expect(
            await proxyDiamond.allowance(holder.address, router.address),
          ).to.equal(APPROVE_AMOUNT);
        });

        it("2) router transferFrom moves child tokens through the proxy and zeroes the allowance", async () => {
          await holderProxyDiamond.approve(router.address, SPEND_AMOUNT);
          const holderBefore = await proxyDiamond.balanceOf(holder.address);
          const recipientBefore = await proxyDiamond.balanceOf(
            recipient.address,
          );

          await routerProxyDiamond.transferFrom(
            holder.address,
            recipient.address,
            SPEND_AMOUNT,
          );

          expect(await proxyDiamond.balanceOf(holder.address)).to.equal(
            holderBefore - SPEND_AMOUNT,
          );
          expect(await proxyDiamond.balanceOf(recipient.address)).to.equal(
            recipientBefore + SPEND_AMOUNT,
          );
          // The allowance is consumed down to zero by the full spend.
          expect(
            await proxyDiamond.allowance(holder.address, router.address),
          ).to.equal(0n);
          // The moved balance is the live diamond's ERC-1155 balance — the
          // transfer really rode the operator role, not a proxy-local ledger.
          expect(
            await geniusDiamond["balanceOf(address,uint256)"](
              recipient.address,
              childTokenId,
            ),
          ).to.equal(recipientBefore + SPEND_AMOUNT);
        });

        it("3) partial spends leave the exact finite remainder (decreasing allowance)", async () => {
          const approved = 1000n;
          const firstSpend = 300n;
          const secondSpend = 450n;
          await holderProxyDiamond.approve(router.address, approved);

          await routerProxyDiamond.transferFrom(
            holder.address,
            recipient.address,
            firstSpend,
          );
          expect(
            await proxyDiamond.allowance(holder.address, router.address),
          ).to.equal(approved - firstSpend);

          await expect(
            routerProxyDiamond.transferFrom(
              holder.address,
              recipient.address,
              secondSpend,
            ),
          )
            .to.emit(proxyDiamond, "Approval")
            .withArgs(
              holder.address,
              router.address,
              approved - firstSpend - secondSpend,
            );
          expect(
            await proxyDiamond.allowance(holder.address, router.address),
          ).to.equal(approved - firstSpend - secondSpend);
        });

        it("4) over-spend reverts with ERC20: insufficient allowance and moves nothing", async () => {
          await holderProxyDiamond.approve(router.address, APPROVE_AMOUNT);
          const holderBefore = await proxyDiamond.balanceOf(holder.address);

          await expect(
            routerProxyDiamond.transferFrom(
              holder.address,
              recipient.address,
              APPROVE_AMOUNT + 1n,
            ),
          ).to.be.revertedWith("ERC20: insufficient allowance");

          // The failed spend leaves both the allowance and the balances intact.
          expect(
            await proxyDiamond.allowance(holder.address, router.address),
          ).to.equal(APPROVE_AMOUNT);
          expect(await proxyDiamond.balanceOf(holder.address)).to.equal(
            holderBefore,
          );
        });

        it("5) a spender with no approve is rejected (zero-allowance rejection)", async () => {
          expect(
            await proxyDiamond.allowance(holder.address, freshSpender.address),
          ).to.equal(0n);
          await expect(
            freshSpenderProxyDiamond.transferFrom(
              holder.address,
              recipient.address,
              1n,
            ),
          ).to.be.revertedWith("ERC20: insufficient allowance");
        });

        it("6) criterion 5: setApprovalForAll neither grants nor is required for ERC-20 allowance", async () => {
          // Direction B first, on pristine state: the router has NO operator
          // approval on the ERC-1155 plane, yet a real ERC-20 allowance spends
          // fine — the proxy's own operator rights (role + the holder's
          // setApprovalForAll(proxy)) cover the ERC-1155 leg, so operator
          // approval for the ROUTER is not required for ERC-20 spending.
          expect(
            await geniusDiamond.isApprovedForAll(
              holder.address,
              router.address,
            ),
          ).to.be.false;
          await holderProxyDiamond.approve(router.address, SPEND_AMOUNT);
          const holderBefore = await proxyDiamond.balanceOf(holder.address);
          await routerProxyDiamond.transferFrom(
            holder.address,
            recipient.address,
            SPEND_AMOUNT,
          );
          expect(await proxyDiamond.balanceOf(holder.address)).to.equal(
            holderBefore - SPEND_AMOUNT,
          );

          // Direction A: operator approval on the ERC-1155 plane — for the
          // router, and (re-affirmed) for the proxy itself — grants zero
          // ERC-20 allowance. This is the exact state the pre-hardening facet
          // was exploitable in: operator approval present, allowance absent.
          await holderGeniusDiamond.setApprovalForAll(router.address, true);
          await holderGeniusDiamond.setApprovalForAll(
            proxyDiamondAddress,
            true,
          );
          expect(
            await geniusDiamond.isApprovedForAll(
              holder.address,
              router.address,
            ),
          ).to.be.true;
          expect(
            await geniusDiamond.isApprovedForAll(
              holder.address,
              proxyDiamondAddress,
            ),
          ).to.be.true;

          // The allowance was consumed by the real spend above and the
          // operator approvals did NOT replenish or create any of it.
          expect(
            await proxyDiamond.allowance(holder.address, router.address),
          ).to.equal(0n);
          expect(
            await proxyDiamond.allowance(holder.address, proxyDiamondAddress),
          ).to.equal(0n);
          await expect(
            routerProxyDiamond.transferFrom(
              holder.address,
              recipient.address,
              1n,
            ),
          ).to.be.revertedWith("ERC20: insufficient allowance");
        });

        it("7) approve(MaxUint256) is infinite: no decrement across two spends", async () => {
          const firstSpend = 250n;
          const secondSpend = 125n;
          await holderProxyDiamond.approve(router.address, MaxUint256);
          const recipientBefore = await proxyDiamond.balanceOf(
            recipient.address,
          );

          await routerProxyDiamond.transferFrom(
            holder.address,
            recipient.address,
            firstSpend,
          );
          // type(uint256).max is never decremented (D-02 / T-1-12).
          expect(
            await proxyDiamond.allowance(holder.address, router.address),
          ).to.equal(MaxUint256);

          await routerProxyDiamond.transferFrom(
            holder.address,
            recipient.address,
            secondSpend,
          );
          expect(
            await proxyDiamond.allowance(holder.address, router.address),
          ).to.equal(MaxUint256);
          expect(await proxyDiamond.balanceOf(recipient.address)).to.equal(
            recipientBefore + firstSpend + secondSpend,
          );
        });
      });
    });
  }
});
