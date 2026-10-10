# Anthropic OSS Scanner threat model — GNUS ERC-20 proxy

## Scope

`erc20-gnus-proxy` maps an ERC-20-compatible surface to GNUS.ai's hierarchical ERC-1155 / diamond contracts, and includes a payment-channel-related contract surface. It uses diamond facets and supports upgrades. The Solidity code in `contracts/erc20-gnus-proxy`, along with pinned `contracts/gnus-ai` and `diamonds/GeniusDiamond` public submodules, matters more than generated TypeScript artifacts or third-party libraries.

## Trust boundaries and security goals

Treat token callers, approval recipients, non-standard token contracts, ERC-1155 receiver hooks, diamond initialization/upgrade transactions, bridge data, and all public calldata as untrusted.

- A caller cannot redeem, withdraw, mint, or transfer tokens that they do not own or have permission to spend.
- Amount conversions and proxy accounting cannot create unbacked token balances, corrupt allowances, or bypass supply limits.
- No unauthorized diamond facet update, role grant, proxy init/reinit, asset rescue, pause change, or upgrade.
- External calls and ERC-1155 receiver callbacks cannot reenter in a way that skips accounting, authorization, or limit checks.
- Payment-channel state transitions, chain/domain assumptions, signatures, nonces, cancellation/settlement, and replay protection preserve balances.
- Failures and fee-on-transfer or non-standard ERC-20 behavior cannot silently mis-credit balances.

## Severity

**Critical:** permissionless draining, minting unbacked balances, seizing privileged roles/diamond upgrades, or an exploitable cross-chain replay with large financial impact.

**High:** a reliable unauthorized transfer/burn, material fund lock, exploit of an initializer or signature domain/nonce, or reentrancy that affects balances.

**Medium:** bounded service denial, economic griefing, or issues that need unusual token behavior or elevated user permissions.

**Low:** hardening suggestions without a reachable loss or exploit. Report a precise test, affected code and line, exploit preconditions, impact, and a minimal patch. Do not claim a theoretical risk is a confirmed exploit.

## How to reproduce

The image leaves `/src`, `node_modules`, cached Solidity compilers, generated ABI/TypeChain data and local tests in place. For offline local testing:

```bash
cd /src
yarn hardhat test --no-compile test/unit/ERC20ProxyFacet.test.ts
```

Use the Hardhat in-memory chain. Do not run external network forks, deploy to chains, seek keys or RPC credentials, or publish exploit descriptions. Do not report flaws in vendored dependencies unless a proxy-specific reachable path makes them exploitable. Send findings privately to `admin@gnus.ai`.
