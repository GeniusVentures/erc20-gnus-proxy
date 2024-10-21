// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@gnus.ai/contracts-upgradeable-diamond/proxy/utils/Initializable.sol";
import "@gnus.ai/contracts-upgradeable-diamond/token/ERC20/IERC20Upgradeable.sol";
import "@gnus.ai/contracts-upgradeable-diamond/token/ERC20/ERC20Storage.sol";
import "@gnus.ai/contracts-upgradeable-diamond/token/ERC1155/IERC1155Upgradeable.sol";
import "./ProxyDiamond.sol";
import "./ERC20ProxyStorage.sol";

contract ERC20ProxyFacet is Initializable, IERC20Upgradeable {
    using ERC20ProxyStorage for ERC20ProxyStorage.Layout;

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

    function name() external view returns (string memory) {
        return ERC20ProxyStorage.layout().name;
    }

    function symbol() external view returns (string memory) {
        return ERC20ProxyStorage.layout().symbol;
    }

    function decimals() external pure returns (uint8) {
        return 18;
    }

    function totalSupply() public view override returns (uint256) {
        ERC20ProxyStorage.Layout storage l = ERC20ProxyStorage.layout();
        return l.erc1155Contract.totalSupply(l.childTokenId);
    }

    function balanceOf(address account) public view override returns (uint256) {
        ERC20ProxyStorage.Layout storage l = ERC20ProxyStorage.layout();
        return l.erc1155Contract.balanceOf(account, l.childTokenId);
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        ERC20ProxyStorage.Layout storage l = ERC20ProxyStorage.layout();
        l.erc1155Contract.safeTransferFrom(msg.sender, recipient, l.childTokenId, amount, "");
        emit Transfer(msg.sender, recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) public view override returns (uint256) {
        return ERC20ProxyStorage.layout().erc1155Contract.isApprovedForAll(owner, spender) ? type(uint256).max : 0;
    }

    function approve(address spender, uint256 amount) public override returns (bool) {
        ERC20ProxyStorage.layout().erc1155Contract.setApprovalForAll(spender, amount > 0);
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
        ERC20ProxyStorage.Layout storage l = ERC20ProxyStorage.layout();
        require(l.erc1155Contract.isApprovedForAll(sender, msg.sender), "ERC20Proxy: transfer caller is not approved");
        l.erc1155Contract.safeTransferFrom(sender, recipient, l.childTokenId, amount, "");
        emit Transfer(sender, recipient, amount);
        return true;
    }

    modifier onlyOwnerRole {
        require(LibDiamond.diamondStorage().contractOwner == msg.sender, "Only Contract Owner allowed");
        _;
    }
}