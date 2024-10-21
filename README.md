# Proxy ERC20 Tokens to GNUS.AI NFT contracts with payment channels

* [Overview](#overview)
* [Solidity Version](#solidity-version)
* [Test and Deploy Locally](#test-and-deploy-locally)

## Overview
This is a proxy contract sample to map ERC20 smart contract into ERC1155 contract on GNUS.ai smart contracts cross-chain

GNUS.AI Smart contract includes NFT creation and minting with a Payment channel that is a generalized payment network that supports efficient off-chain token transfer with the Genius Token on on-chain ethereum. 
These contracts use Diamond Storage/Facets to split the contracts into deployable pieces and for upgradeability.


## Solidity Version
Solidity `^0.8.4` or above is required to compile these smart contracts

## Test And Deploy Locally using hardhat and typescript
1. Install node >= v12: [https://nodejs.org](https://nodejs.org).
2. Go to erc20-gnus-proxy's root directory. 
3. Install the node dependencies in the local node_modules folder. 
<pre>
yarn
</pre> 
4. Compiling the contracts
<pre>
yarn run compile 
</pre>

5. Compiling and testing the contracts
<pre>
yarn run test
</pre>



