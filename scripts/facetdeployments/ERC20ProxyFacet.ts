import { ProxyDiamond } from "../../typechain-types";
import { dc, debuglog, INetworkDeployInfo, AfterDeployInit, getSighash } from "../common";
import { Facets } from "../facets";
import hre from "hardhat";

const GNUSAIContractAddresses: {[key: string]: string } = {
    mumbai: "",
    localhost: "0x207Fa8Df3a17D96Ca7EA4f2893fcdCb78a304101",
};

const afterDeploy: AfterDeployInit = async (networkDeployInfo: INetworkDeployInfo) => {
    const chainID = hre.network.config.chainId || 1;

    const networkName = hre.network.name;

    // allow OpenSea Proxy Operator
    if (networkName in GNUSAIContractAddresses) {
        const proxyDiamond = dc.ProxyDiamond as ProxyDiamond;
        await proxyDiamond.initializeERC20Proxy(
            GNUSAIContractAddresses[networkName],
            1,
            "TestToken",
            "TST");
    } else {
        debuglog(`No GNUS.ai ERC1155 contract address found for network: ${networkName}`);
    }
}

Facets.ERC20ProxyFacet = {
    priority: 20,
    versions: {
        0.0: {
            callback: afterDeploy
        },
    }
};
