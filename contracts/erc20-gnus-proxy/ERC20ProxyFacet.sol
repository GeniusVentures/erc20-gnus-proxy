// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@gnus.ai/contracts-upgradeable-diamond/proxy/utils/Initializable.sol";
import "@gnus.ai/contracts-upgradeable-diamond/token/ERC20/IERC20Upgradeable.sol";
import "@gnus.ai/contracts-upgradeable-diamond/token/ERC20/ERC20Storage.sol";
import "@gnus.ai/contracts-upgradeable-diamond/token/ERC1155/IERC1155Upgradeable.sol";
import "./ProxyDiamond.sol";
import "./ERC20ProxyStorage.sol";

/**
 * @title ERC20ProxyFacet
 * @dev Implementation of the ERC20 Proxy Facet using the Diamond Standard.
 */
contract ERC20ProxyFacet is Initializable, IERC20Upgradeable {
    using ERC20ProxyStorage for ERC20ProxyStorage.Layout;

    /**
     * @notice Initializes the ERC20 Proxy with the given parameters.
     * @param _erc1155Address The address of the ERC1155 contract.
     * @param _childTokenId The ID of the child token in the ERC1155 contract.
     * @param _name The name of the ERC20 token.
     * @param _symbol The symbol of the ERC20 token.
     */
    function initializeERC20Proxy(
        address _erc1155Address,
        uint256 _childTokenId,
        string memory _name,
        string memory _symbol
    ) onlyOwnerRole external {
        LibDiamond.enforceIsContractOwner();
        ERC20ProxyStorage.Layout storage l = ERC20ProxyStorage.layout();
        l.erc1155Contract = ERC1155SupplyUpgradeable(_erc1155Address);
        l.childTokenId = _childTokenId;
        l.name = _name;
        l.symbol = _symbol;
    }

    /**
     * @notice Returns the name of the token.
     * @return The name of the token.
     */
    function name() external view returns (string memory) {
        return ERC20ProxyStorage.layout().name;
    }

    /**
     * @notice Returns the symbol of the token.
     * @return The symbol of the token.
     */
    function symbol() external view returns (string memory) {
        return ERC20ProxyStorage.layout().symbol;
    }

    /**
     * @notice Returns the number of decimals used to get its user representation.
     * @return The number of decimals.
     */
    function decimals() external pure returns (uint8) {
        return 18;
    }

    /**
     * @notice Returns the total supply of the token.
     * @return The total supply of the token.
     */
    function totalSupply() public view override returns (uint256) {
        ERC20ProxyStorage.Layout storage l = ERC20ProxyStorage.layout();
        return l.erc1155Contract.totalSupply(l.childTokenId);
    }

    /**
     * @notice Returns the balance of the specified address.
     * @param account The address to query the balance of.
     * @return The balance of the specified address.
     */
    function balanceOf(address account) public view override returns (uint256) {
        ERC20ProxyStorage.Layout storage l = ERC20ProxyStorage.layout();
        return l.erc1155Contract.balanceOf(account, l.childTokenId);
    }

    /**
     * @notice Transfers tokens to a specified address.
     * @param recipient The address to transfer to.
     * @param amount The amount to be transferred.
     * @return A boolean that indicates if the operation was successful.
     */
    function transfer(address recipient, uint256 amount) public override returns (bool) {
        ERC20ProxyStorage.Layout storage l = ERC20ProxyStorage.layout();
        l.erc1155Contract.safeTransferFrom(msg.sender, recipient, l.childTokenId, amount, "");
        emit Transfer(msg.sender, recipient, amount);
        return true;
    }

    /**
     * @notice Returns the amount of tokens that an owner allowed to a spender.
     * @param owner The address which owns the funds.
     * @param spender The address which will spend the funds.
     * @return The amount of tokens still available for the spender.
     */
    function allowance(address owner, address spender) public view override returns (uint256) {
        return ERC20ProxyStorage.layout().erc1155Contract.isApprovedForAll(owner, spender) ? type(uint256).max : 0;
    }

    /**
     * @notice Approves the passed address to spend the specified amount of tokens on behalf of msg.sender.
     * @param spender The address which will spend the funds.
     * @param amount The amount of tokens to be spent.
     * @return A boolean that indicates if the operation was successful.
     */
    function approve(address spender, uint256 amount) public override returns (bool) {
        ERC20ProxyStorage.layout().erc1155Contract.setApprovalForAll(spender, amount > 0);
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /**
     * @notice Transfers tokens from one address to another.
     * @param sender The address which you want to send tokens from.
     * @param recipient The address which you want to transfer to.
     * @param amount The amount of tokens to be transferred.
     * @return A boolean that indicates if the operation was successful.
     */
    function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
        ERC20ProxyStorage.Layout storage l = ERC20ProxyStorage.layout();
        require(l.erc1155Contract.isApprovedForAll(sender, msg.sender), "ERC20Proxy: transfer caller is not approved");
        l.erc1155Contract.safeTransferFrom(sender, recipient, l.childTokenId, amount, "");
        emit Transfer(sender, recipient, amount);
        return true;
    }

    /**
     * @dev Modifier to make a function callable only by the contract owner.
     */
    modifier onlyOwnerRole {
        require(LibDiamond.diamondStorage().contractOwner == msg.sender, "Only Contract Owner allowed");
        _;
    }
}