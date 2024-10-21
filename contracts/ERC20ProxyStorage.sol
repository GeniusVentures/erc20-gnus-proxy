// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@gnus.ai/contracts-upgradeable-diamond/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";

library ERC20ProxyStorage {
    bytes32 constant ERC20_PROXY_STORAGE_POSITION = keccak256("erc20.proxy.storage");

    struct Layout {
        ERC1155SupplyUpgradeable erc1155Contract;
        uint256 childTokenId;
        string name;
        string symbol;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 position = ERC20_PROXY_STORAGE_POSITION;
        assembly {
            l.slot := position
        }
    }
}