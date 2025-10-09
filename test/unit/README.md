# ERC20ProxyFacet Unit Tests

This directory contains comprehensive unit tests for the ProxyDiamond contract, specifically focusing on the ERC20ProxyFacet functionality.

## Test Coverage

### Diamond Interface Support Tests (3 tests)
- ✅ Verifies IERC20Upgradeable interface support
-  Verifies IDiamondCut interface support  
- ✅ Verifies IDiamondLoupe interface support

### DiamondLoupe Facet Tests (4 tests)
- ✅ Returns all facet addresses (3 facets: DiamondCutFacet, DiamondLoupeFacet, ERC20ProxyFacet)
- ✅ Returns facet function selectors (16 total functions)
- ✅ Returns facet address for specific selector (e.g., `name()` function)
- ✅ Returns all facets with their selectors

### ERC20ProxyFacet Basic View Functions Tests (3 tests)
- ✅ Returns correct token name after initialization ("ExampleToken")
- ✅ Returns correct token symbol after initialization ("XMPL")
- ✅ Returns 18 decimals

### ERC20ProxyFacet State Query Tests (3 tests)
Tests that verify proper behavior when ERC1155 backing contract is not set:
- ✅ Reverts when calling `totalSupply()` before backing contract initialization
- ✅ Reverts when calling `balanceOf()` before backing contract initialization
- ✅ Reverts when calling `allowance()` before backing contract initialization

### ERC20ProxyFacet Transfer Tests (3 tests)
Tests that verify proper behavior when ERC1155 backing contract is not set:
- ✅ Reverts when calling `transfer()` before backing contract initialization
- ✅ Reverts when calling `approve()` before backing contract initialization
- ✅ Reverts when calling `transferFrom()` before backing contract initialization

### ERC20ProxyFacet Initialization Tests (2 tests)
- ✅ Only allows owner to call `initializeERC20Proxy()`
- ✅ Allows owner to reinitialize/update configuration (by design for flexibility)

### Complete ERC20 Function Coverage (2 tests)
- ✅ Verifies all required ERC20 functions exist in ABI:
  - `name()`, `symbol()`, `decimals()`
  - `totalSupply()`, `balanceOf()`
  - `transfer()`, `approve()`, `allowance()`, `transferFrom()`
- ✅ Verifies `initializeERC20Proxy()` function exists in ABI

## Total: 20 Passing Tests

## Key Findings

1. **ProxyDiamond Architecture**: The contract successfully implements the ERC-2535 Diamond Standard with 3 facets
2. **ERC20 Compatibility**: All ERC20 interface functions are properly deployed and accessible
3. **Interface Support**: Properly implements ERC165 for interface detection
4. **Access Control**: Only contract owner can initialize/update the ERC20 proxy configuration
5. **Flexible Configuration**: By design, the `initializeERC20Proxy` function can be called multiple times by the owner to update the backing ERC1155 contract and token metadata

## Running the Tests

```bash
# Run only the ERC20ProxyFacet unit tests
yarn test test/unit/ERC20ProxyFacet.test.ts

# Run all tests
yarn test
```

## Next Steps for Full Integration Testing

To test the full ERC20 proxy functionality (transfer, approve, etc.), you would need to:
1. Deploy a mock ERC1155 contract with minting capability
2. Initialize the ERC20ProxyFacet with the ERC1155 contract address
3. Mint ERC1155 tokens to test addresses
4. Test ERC20 proxy operations that delegate to the ERC1155 contract

This is covered in the integration tests (`test/integration/`).
