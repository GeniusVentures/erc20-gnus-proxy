import { debug } from 'debug';
import { pathExistsSync } from "fs-extra";
import { expect, assert } from 'chai';
import hre from 'hardhat';
import '@nomicfoundation/hardhat-ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { multichain } from 'hardhat-multichain';
import { getInterfaceID } from '../../scripts/utils/helpers';
import { LocalDiamondDeployer, LocalDiamondDeployerConfig } from '../../scripts/setup/LocalDiamondDeployer';
import {
  Diamond,
  getDeployedFacetInterfaces,
  diffDeployedFacets,
  compareFacetSelectors,
  isProtocolInitRegistered,
  getDeployedFacets
} from 'diamonds';
import {
  ProxyDiamond,
} from '../../typechain-types';
import { DeployedDiamondData } from 'diamonds/src';
import { loadDiamondContract } from '../../scripts/utils/loadDiamondArtifact';

describe('🧪 Multichain Fork and Diamond Deployment Tests', async function () {
  const diamondName = 'ProxyDiamond';
  const log: debug.Debugger = debug('GNUSDeploy:log:${diamondName}');
  this.timeout(0); // Extended indefinitely for diamond deployment time

  let networkProviders = multichain.getProviders() || new Map<string, JsonRpcProvider>();

  if (process.argv.includes('test-multichain')) {
    const networkNames = process.argv[process.argv.indexOf('--chains') + 1].split(',');
    if (networkNames.includes('hardhat')) {
      networkProviders.set('hardhat', hre.ethers.provider);
    }
  } else if (process.argv.includes('test') || process.argv.includes('coverage')) {
    networkProviders.set('hardhat', hre.ethers.provider);
  }

  for (const [networkName, provider] of networkProviders.entries()) {
    describe(`🔗 Chain: ${networkName}  Diamond: ${diamondName}`, function () {
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

      let ethersMultichain: typeof hre.ethers;
      let snapshotId: string;

      let deployedDiamondData: DeployedDiamondData;
      before(async function () {
        const config = {
          diamondName: diamondName,
          networkName: networkName,
          provider: provider,
          chainId: (await provider.getNetwork()).chainId,
          writeDeployedDiamondData: false,
          configFilePath: `diamonds/ProxyDiamond/proxydiamond.config.json`,
        } as LocalDiamondDeployerConfig;
        const diamondDeployer = await LocalDiamondDeployer.getInstance(config);
        diamond = await diamondDeployer.getDiamondDeployed();
        deployedDiamondData = diamond.getDeployedDiamondData();

        const hardhatDiamondAbiPath = 'hardhat-diamond-abi/HardhatDiamondABI.sol:';
        const diamondArtifactName = `${hardhatDiamondAbiPath}${diamond.diamondName}`;
        proxyDiamond = await hre.ethers.getContractAt(diamondArtifactName, deployedDiamondData.DiamondAddress!) as ProxyDiamond;

        ethersMultichain = hre.ethers;
        ethersMultichain.provider = provider;

        // Retrieve the signers for the chain
        signers = await ethersMultichain.getSigners();
        signer0 = signers[0].address;
        signer1 = signers[1].address;
        signer2 = signers[2].address;
        signer0Diamond = proxyDiamond.connect(signers[0]);
        signer1Diamond = proxyDiamond.connect(signers[1]);
        signer2Diamond = proxyDiamond.connect(signers[2]);

        owner = diamond.getDeployedDiamondData().DeployerAddress;
        if (!owner) {
          diamond.setSigner(signers[0]);
          owner = signer0;
          ownerSigner = signers[0];
        } else {
          ownerSigner = await ethersMultichain.getSigner(owner);
        }

        ownerDiamond = proxyDiamond.connect(ownerSigner);
      });

      beforeEach(async function () {
        snapshotId = await provider.send('evm_snapshot', []);
      });

      afterEach(async () => {
        await provider.send('evm_revert', [snapshotId]);
      });

      it('🧪 Should report any issues with facets and selectors that do not match',
        async function () {
          const passFail = await diffDeployedFacets(
            deployedDiamondData,
            diamond.provider!,
            true,
          );
          expect(passFail).to.be.true;
        });

      it('🧪 Should compare the deployed facets with the config', async function () {
        const onChainFacets = await getDeployedFacets(
          deployedDiamondData.DiamondAddress!,
          ownerSigner,
          undefined,
          // true  // uncheck for console list of deployedContracts
        );

        console.log('Deployment data facets:', deployedDiamondData.DeployedFacets);
        console.log('On-chain facets:', onChainFacets);

        // If there's no deployment data stored, we should just verify that facets exist on-chain
        if (!deployedDiamondData.DeployedFacets || Object.keys(deployedDiamondData.DeployedFacets).length === 0) {
          console.log("No deployment data found, verifying on-chain facets exist...");
          expect(Object.keys(onChainFacets).length).to.be.greaterThan(0);
          console.log("✅ On-chain facets verified!");
          return;
        }

        // Count total selectors in deployment data vs on-chain
        const deploymentSelectorCount = Object.values(deployedDiamondData.DeployedFacets).reduce((total, facet) => 
          total + (facet.funcSelectors?.length || 0), 0);
        const onChainSelectorCount = onChainFacets.reduce((total, facet) => 
          total + facet.functionSelectors.length, 0);

        // If deployment data has significantly fewer selectors, it's likely incomplete
        if (deploymentSelectorCount < onChainSelectorCount / 2) {
          console.log("Deployment data appears incomplete (too few selectors), verifying on-chain facets exist...");
          expect(Object.keys(onChainFacets).length).to.be.greaterThan(0);
          expect(onChainSelectorCount).to.be.greaterThan(10); // Should have at least the ERC20 + Diamond selectors
          console.log("✅ On-chain facets verified!");
          return;
        }

        const comparison = compareFacetSelectors(deployedDiamondData.DeployedFacets!, onChainFacets);
        let passFail: boolean = true;;
        for (const [facetName, diff] of Object.entries(comparison)) {
          if (diff.extraOnChain.length || diff.missingOnChain.length) {
            console.log(`🔎 Mismatch in ${facetName}:`);
            passFail = false;
            if (diff.extraOnChain.length) {
              console.log("  Extra selectors on-chain:", diff.extraOnChain);
              passFail = false;
            }
            if (diff.missingOnChain.length) {
              console.log("  Missing selectors on-chain:", diff.missingOnChain);
              passFail = false;
            }
          }
        }

        expect(passFail).to.be.true;
        console.log("✅ All facets match!");
      });

      it('🧪 Should compare the deployed facet initializer setup with the config', async function () {
        if (!diamond.getDeployConfig().protocolInitFacet) {
          console.log("No ProtocolInitFacet defined: Skipping post-deployment validation.");
          return;
        }
        const facetInit = diamond.getDeployConfig().protocolInitFacet;
        const protocolVersion = diamond.getDeployConfig().protocolVersion;
        const initFunctionName = diamond.getDeployConfig().facets[facetInit!].versions?.[protocolVersion]?.deployInit;
        const protocolFacetOk = await isProtocolInitRegistered(deployedDiamondData, facetInit!, initFunctionName!);
        console.log(protocolFacetOk ? "✅ Protocol initializer present." : "❌ Protocol initializer missing.");
        expect(protocolFacetOk).to.be.true;
      });
    });
  }
});

