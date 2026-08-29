import { JsonRpcProvider } from "@ethersproject/providers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { debug } from "debug";
import { Diamond } from "@geniusventures/diamonds";
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
        // this role grant every proxy transferFrom reverts inside the DIAMOND,
        // not the facet. With it, isApprovedForAll(user, proxy) is true for
        // ALL users: the strongest arrangement under which criterion 5
        // (operator approval must not grant ERC-20 allowance) must still hold.
        await ownerGeniusDiamond.grantRole(
          NFT_PROXY_OPERATOR_ROLE,
          proxyDiamondAddress,
        );

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
    });
  }
});
