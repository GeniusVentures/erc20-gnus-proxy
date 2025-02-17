// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@gnus.ai/contracts-upgradeable-diamond/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";

/**
 * @title ERC20ProxyStorage
 * @dev Library for managing the storage layout of the ERC20 Proxy.
 */
library ERC20ProxyStorage {
    /// @dev Storage position of the ERC20 proxy data.
    bytes32 constant ERC20_PROXY_STORAGE_POSITION = keccak256("erc20.proxy.storage");

    /**
     * @dev Structure to store the ERC20 proxy data.
     * @param erc1155Contract The ERC1155 contract instance.
     * @param childTokenId The ID of the child token in the ERC1155 contract.
     * @param name The name of the ERC20 token.
     * @param symbol The symbol of the ERC20 token.
     */
    struct Layout {
        ERC1155SupplyUpgradeable erc1155Contract;
        uint256 childTokenId;
        string name;
        string symbol;
    }

    /**
     * @notice Returns the storage layout of the ERC20 proxy.
     * @return l The storage layout of the ERC20 proxy.
     */
    function layout() internal pure returns (Layout storage l) {
        bytes32 position = ERC20_PROXY_STORAGE_POSITION;
        assembly {
            l.slot := position
        }
    }
}