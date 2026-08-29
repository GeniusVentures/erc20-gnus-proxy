// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

/**
 * @title MockERC1155Supply
 * @dev Minimal ERC-1155 subset for ERC20ProxyFacet unit tests: exactly the functions
 * the facet calls on its ERC-1155 target, plus a mint helper. The operator plane
 * (setApprovalForAll/isApprovedForAll) REVERTS by design — the proxy must never
 * touch it, so any call reaching it fails loudly as a regression tripwire.
 */
contract MockERC1155Supply {
    mapping(uint256 => mapping(address => uint256)) private _balances;
    mapping(uint256 => uint256) private _supplies;

    function totalSupply(uint256 id) external view returns (uint256) {
        return _supplies[id];
    }

    function balanceOf(address account, uint256 id) external view returns (uint256) {
        return _balances[id][account];
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata
    ) external {
        // No approval check: the proxy's own allowance logic is the system under test.
        require(_balances[id][from] >= amount, "MockERC1155Supply: insufficient balance");
        _balances[id][from] -= amount;
        _balances[id][to] += amount;
    }

    function mint(address account, uint256 id, uint256 amount) external {
        _balances[id][account] += amount;
        _supplies[id] += amount;
    }

    function setApprovalForAll(address, bool) external pure {
        revert("MockERC1155Supply: operator plane must not be touched");
    }

    function isApprovedForAll(address, address) external pure {
        revert("MockERC1155Supply: operator plane must not be touched");
    }
}
