// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@gnus.ai/contracts-upgradeable-diamond/token/ERC20/IERC20Upgradeable.sol";
import "@gnus.ai/contracts-upgradeable-diamond/utils/introspection/ERC165StorageUpgradeable.sol";
import "contracts-starter/contracts/Diamond.sol";
import "contracts-starter/contracts/facets/DiamondCutFacet.sol";
import "contracts-starter/contracts/facets/DiamondLoupeFacet.sol";
import "contracts-starter/contracts/libraries/LibDiamond.sol";

/**
 * @title ProxyDiamond
 * @dev Implementation of a Diamond proxy contract using the Diamond Standard.
 */
contract ProxyDiamond is Diamond, ERC165StorageUpgradeable {

    using LibDiamond for LibDiamond.DiamondStorage;

    /**
     * @dev Initializes the ProxyDiamond contract.
     * @param _contractOwner The address of the contract owner.
     * @param _diamondCutFacet The address of the DiamondCutFacet contract.
     */
    constructor(address _contractOwner, address _diamondCutFacet) initializer payable
    Diamond(_contractOwner, _diamondCutFacet) {
        __ERC165Storage_init();
        // This is so that any contract deployment watchers will be able to check interfaces on deployment
        _registerInterface(type(IERC20Upgradeable).interfaceId);
        _registerInterface(type(IERC165Upgradeable).interfaceId);
        _registerInterface(type(IDiamondCut).interfaceId);
        _registerInterface(type(IDiamondLoupe).interfaceId);
        InitializableStorage.layout()._initialized = false;
    }

    /**
     * @notice Checks if the contract supports a given interface.
     * @param interfaceId The interface identifier, as specified in ERC-165.
     * @return True if the contract supports the given interface, false otherwise.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return super.supportsInterface(interfaceId) ||
            LibDiamond.diamondStorage().supportedInterfaces[interfaceId];
    }

}
