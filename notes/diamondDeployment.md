# Diamond Deployment

## Initial Deployments Summary
- Initialize new deployment info object to eventually be stored in deployments json).
- Deploy DiamondCutFacet and DiamondLoupeFacet contracts
- Deploy Diamond
- Initialize Diamond
    - DiamondCut, DiamondLoupe and Storage addresses
    - Users
    - ERC173 owner
    - ERC165 supported interfaces
- Get Facet deployment info object from individual Facet json files.
- Deploy all other Facets
- Add Facet Function Signatures to Diamond
- Initialize Facets

## Diamond Upgrades Summary
- Get existing deployment info object from deployments json
- Get Facet deployment info object from individual Facet json files.
- Extract version info from Facet deployment info object
- If version info is greater than existing version info then deploy new Facets
- Initialize Facets (or does this need to be done after the Diamond is updated?)
- Compare newly deployed facet function signatures info with existing deployment info function signatures
- Add/Replace/Remove Facet Function Signatures to Diamond