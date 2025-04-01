# Diamond Deployment

## Original Deployment Architecture

### Deployment From testDeployer and previous deployment scripts

1. Determine Network and if Hardhat Fork or Test Network and get deployer address(Signer.0)
    1. (Done in the Constructor)
2. LoadFacetDeployments? (This may not be required at this point but inside deployDiamond)
3. Impersonate if in Hardhat Fork or Test Network and is existing deployment
4. [Deploy Diamond](#deploy-diamond) which includes the DiamondCutfacet (in fact this must come first)
    1. This is run for existing Deployments (on forks) as well, may not be needed.
5. Assign diamond from dc.Diamond as typechain `<diamondName>Diamond` type
6. Store the current deployInfo as "beforeUpgraded" (This should be done in constructor if it is needed in later or in Upgrade)
7. FacetsToDeploy from Facets object
8. [deployDiamondFacets](#deploydiamondfacets)
9. [deployAndInitDiamondFacets](#deploy-and-init-diamond-facets)

#### Deploy Diamond

1. Determines state of deployment (new or existing)
    1. If existing deployment, setup with existing deployment info
    2. If new deployment, setup with new deployment info
2. getNetwork Info from provider.getNetwork() (only needed for chainId and log)
3. Deploy and 'getContract' for DiamondCutFacet
    1. Existing deployment assign dc.DiamondCutFacet to ethers.getContractAt('DiamondCutFacet', diamondCutFacetAddress)
    2. New Deployment first getContractFactory, then deploy and await deployment, then assign dc.DiamondCutFacet to deployment
4. Deploy Diamond
    1. Existing deployment assign dc.Diamond to ethers.getContractAt('Diamond', diamondAddress)
    2. New Deployment first getContractFactory, then deploy and assign it to diamond and await deployment.
5. set the networkDeployInfo.DiamondAddress based on the diamond returned from deploy() or getContractAt()
6. We now assign dc._Diamond to the deployed objects (i.e. getContractAt() or deploy())
7. We attach dc.Diamond to the contract factory object from hardhat-diamond-abi using the diamond.address.
8. We get the function selectors and put all the acquired info into the networkDeployInfo object. However, this does not do anything. It is not returned or used in any way.

#### deployDiamondFacets

1. Takes in (networkDeployInfo: INetworkDeployInfo,  facetsToDeploy: FacetToDeployInfo = Facets)
2. Order facets by deployment priority
3. Iterate through the facetsPriority list
    1. facet as a BaseContract and default facetVersions = 0
    2. Sort facet versions from highest to lowest
    3. Add one to the deployedVersion which supposedly creates the `upgradeVersion`
    4. Determine the deployed version or mark as undeployed (-1.0)
    5. Boolean Check if the facetNeedsDeployment name is not in deployedFacets or deployedVersion != upgradeVersion (NOTE: this might need to be !>= rather than !=) but the `upgradeVersion` is not a great way to do this.
    6. getExternalLibraries from the deployInfo
    7. Create Contract Factory for the factory with the externalLibraries (checks if the contractOwner is missing?)
    8. If the FacetNeedsDeployment then try-catch deploy the facet and assign it to the facet object
        1. getGasPrice and multiply it by 110% (x110/100) (Is there a better way to figure out the gas price)

#### deployAndInitDiamondFacets

NOTE: This should really only be InitDiamondFacets since deployment is a separate process. Easier in an object.
Steps 1-4 Prepare the deployInfoWithOldFacet object which is passed to the deployFuncSelectors function and the PreviousDeployedVersions object which is passed to the afterDeployCallbacks function.

1. Takes in (networkDeployInfo: INetworkDeployInfo,  facetsToDeploy: FacetToDeployInfo = Facets)
2. deployDiamondFacets (again?)
3. Deep copy network deploy info to new 'before upgrade'  object
4. Iterate over deployed facets to reconcile their deployment history (NOTE: is this really working? It seems like the netowrkDeployInfo would be the same for both the before and after)
    1. Build a record of previousDeployedVersions for future upgrades
5. deployFuncSelectors
6. afterDeployCallbacks

#### deployFuncSelectors

This is the diamondCutFacet Process.  Accepts the deployInfo, OldNetworkDeployInfo (aka deployInfoWithOldFacets), the facetsToDeploy list = Facets.

1. Retrieve deployed facets info from deployInfo
2. create a new Set to track the registered function signatures to prevent duplication
3. Determine facet deployment priority based on configured priorities (redundant in new context)
4. Empty Variables to track the protocolUpgradeVersion, selectorsToBeRemoved and facetNamesToBeRemoved
5. Loop through deployed facets to identify facets and selectors to be removed
    1. Collect selectors to remove for facets not in the new deployment list
    2. Push these to facetNameToBeRemoved
    3. delete deployedFacets list to reset before moving out of scope?
6. If there are selectors to be removed add a remove operation to the facet `cut` list
7. Loop through the facets based on priority
    1. Sort facet Versions from highest to lowest
    2. Add one to the deployedVersion which supposedly creates the `upgradeVersion`
    3. Determine the deployed version or mark as undeployed (-1.0)
    4. Load the facetContract using its name and linked libraries if applicable
    5. Attach the facetContract to the deployed address
    6. Determine if the facet needs an upgrade based on version comparison or missing selectors
    7. Store the facet instance globally for future reference in the dc object
    8. Retrieve selectors for teh facet and filter them based on deployment inclusion rules
    9. Retrieve selectors from previously deployed contract for the current facet
    10. Add a remove operation to the facet cut for selectors that are no longer included !!! AGAIN????
8. Connect the diamondCut contract to the contract owner
9. If Defender deployment is enabled and a signer is configured for the current network
10. Prepare the function selectors for replacement replaceFunctionSelectors
11. Prepare the list of operations (facet cuts) for the diamond upgrade upgradeCut
12. Execute the diamond cut
13. based on contractOwner being known??? tx diamondCut.diamondCut(upgradeCut, ethers.constants.AddressZero, '0x', { gasLimit: XXX })

#### afterDeployCallbacks

Note: this is basically the initializer for all newly deployed facets.

1. get the Diamond from the dc.Diamond object
2. LoadFacetDeployment again. Won't be needed in an object where this is loaded in the constructor
3. Sort the facetsPriority again.
4. Loop through each facet based on priority again
    1. sort facet versions from highest to lowest again
    2. Add one to the deployedVersion which supposedly creates the `upgradeVersion` this time called `deployedVersion`
    3. Retrieve the previous version of the facet from deployment records
    4. Determine the initialization function to call based on the facet version (upgrade or deployInit)
    5. Call the initialization function on the facet contract if one has been defined
    6. if a callback is defined for the facet version change, execute it

5. Initialize Diamond
    1. DiamondCut, DiamondLoupe and Storage addresses
    2. Access Control (roles)
    3. ERC173 Diamond Ownership
    4. ERC165 Supported Interfaces
6. Get Facet deployment info object from individual Facet json files.
7. Deploy all other Facets
8. Add Facet Function Signatures to Diamond
9. Initialize Facets

## Module Architecture Deployment Architecture

### DiamondDeployer

#### DiamondDeployer Comparison with original testDeployer

[x] 1. Determine Network and if Hardhat Fork or Test Network and get deployer address(Signer.0)
     [x] 1. (Done in the Constructor)
[O] 2. LoadFacetDeployments? (This may not be required at this point but inside deployDiamond)
[O] 3. Impersonate if in Hardhat Fork or Test Network and is existing deployment
[X] 4. [Deploy Diamond](#deploy-diamond) which includes the DiamondCutfacet (in fact this must come first)
    [O] 1. This is run for existing Deployments (on forks) as well, may not be needed.
[O] 5. Assign diamond from dc.Diamond as typechain `<diamondName>Diamond` type
    - This is not required because we are using an object
[] 6. Store the current deployInfo as "beforeUpgraded" (This should be done in constructor if it is needed in later or in Upgrade)
[] 7. FacetsToDeploy from Facets object
[] 8. [deployDiamondFacets](#deploydiamondfacets)
        - This is the deployment and diamondCuts
[] 9. [deployAndInitDiamondFacets](#deployandinitdiamondfacets)

#### DiamondDeployer::deploy()

1. Determine state of deployment (new or existing)
    1. If existing deployment, setup with existing deployment info return the deployment info object
    2. If new deployment, setup with new deployment info
2. Set Instance DeploymentInProgress true
3. If the diamond is already deployed then impersonate and fund the deployer info.
4. Call the deployDiamond process via the manager.
5. After the diamond is deployed, update our local state.
6. Deploy (or upgrade) facets. Use Facets object (or a tailored FacetToDeployInfo) as desired.
7. Perform the diamond cut (if needed) to bind new selectors.
8. Load the deployed diamond contract via typechain after the deployment (for getDiamond())

### DiamondDeploymentManager::DeployDiamond

#### Comparison with original deployDiamond

[] 1. Determines state of deployment (new or existing)
    [] 1. If existing deployment, setup with existing deployment info
    [] 2. If new deployment, setup with new deployment info
[] 2. getNetwork Info from provider.getNetwork() (only needed for chainId and log)
[] 3. Deploy and 'getContract' for DiamondCutFacet
    [] 1. Existing deployment assign dc.DiamondCutFacet to ethers.getContractAt('DiamondCutFacet', diamondCutFacetAddress)
    [] 2. New Deployment first getContractFactory, then deploy and await deployment, then assign dc.DiamondCutFacet to deployment
[] 4. Deploy Diamond
    [] 1. Existing deployment assign dc.Diamond to ethers.getContractAt('Diamond', diamondAddress)
    [] 2. New Deployment first getContractFactory, then deploy and assign it to diamond and await deployment.
[] 5. set the networkDeployInfo.DiamondAddress based on the diamond returned from deploy() or getContractAt()
[] 6. We now assign dc._Diamond to the deployed objects (i.e. getContractAt() or deploy())
[] 7. We attach dc.Diamond to the contract factory object from hardhat-diamond-abi using the diamond.address.
[] 8. We get the function selectors and put all the acquired info into the networkDeployInfo object. However, this does not do anything. It is not returned or used in any way.

####

1. Deploy DiamondCutFacet
2. Deploy DiamondLoupeFacet contracts
3. Deploy Diamond
4. Initialize Diamond
    1. DiamondCut, DiamondLoupe and Storage addresses
    2. Initial Access Control Roles Assignments
    3. ERC173 Diamond Ownership
    4. ERC165 Supported Interfaces
5. Get Facet deployment info object from individual Facet json files.
6. Deploy all other Facets
7. Add Facet Function Signatures to Diamond
8. Initialize Facets

## Diamond Upgrades Summary

- Get existing deployment info object from deployments json for network and diamondName
- Load Facet deployment info object from individual Facet json files.
- Extract version info from Facet deployment info object
- If version info is greater than existing version info then deploy new Facets
- Initialize Facets (or does this need to be done after the DiamondCutFacet/Funcselector is updated?)
- Compare newly deployed facet function signatures info with existing deployment info function signatures
- Add/Replace/Remove Facet Function Signatures to Diamond

### Load Facet Deployments

## Deployment Architecture used for ChatGPT

### Deployment From testDeployer and previous deployment scripts

1. Determine if the Network is a Hardhat Fork that has a previous deployment file in which case this should be an upgrade.
2. If it is a new deployment we get the Hardhat address for Signer.0, one of the supplied Hardhat accounts used for testing.
3. Setup with new, empty  deployment info
4. We getContractFactory, then deploy and await deployment of the Diamond Contract
5. We getContractFactory, then deploy and await deployment of the DiamondCutFacet Contract
6. Set the Deploy Info Diamond Address and DiamondCutFacet Address and other info based on the diamond returned from deploy() or getContractAt()

#### Deploy the Diamond Facets

1. Get the Facets configuration from the Facets configuration file
2. Order facets by deployment priority, which is defined in the Facets configuration file
3. Iterate through the prioritized facets list (for each we do the following)

This part of the process is fairly complex and it is best expressed in the code.  The same process is used for upgrades and new deployments.  The only difference is that the upgrade process uses the existing deployment info to determine what facets are already deployed and what selectors are already in use.

```typescript
let protocolUpgradeVersion = 0;
const selectorsToBeRemoved: string[] = []; // Track selectors to be removed
const facetNamesToBeRemoved: string[] = []; // Track facet names to be removed
// This should be necessary with a fresh install, as with a new chain or non-forked hardhat locally.
// Loop through deployed facets to identify facets and selectors no longer in the deployment list
for (const facetName of Object.keys(deployedFacets)) {
  if (!Object.keys(facetsToDeploy).includes(facetName)) {
    // Collect selectors to remove for facets not in the new deployment list
    selectorsToBeRemoved.push(
      ...(deployedFacets[facetName].funcSelectors?.filter((e) =>
        Object.keys(deployedFuncSelectors?.facets).includes(e),
      ) || []),
    );
    // Add facet name to the removal list and delete from deployed facets
    facetNamesToBeRemoved.push(facetName);
    delete deployedFacets[facetName];
  }
}

// If there are selectors to be removed, add a remove operation to the facet cut
if (selectorsToBeRemoved.length > 0)
  cut.push({
    facetAddress: ethers.constants.AddressZero, // Address zero indicates removal
    action: FacetCutAction.Remove,
    functionSelectors: selectorsToBeRemoved,
    name: facetNamesToBeRemoved.join(','),
  });

// Loop through facets based on deployment priority
for (const name of facetsPriority) {
  const facetDeployVersionInfo = facetsToDeploy[name];
  let facetVersions = ['0.0']; // Default to version 0.0 if no versions are provided

  // Sort facet versions from highest to lowest
  if (facetDeployVersionInfo.versions) {
    facetVersions = Object.keys(facetDeployVersionInfo.versions).sort((a, b) => +b - +a);
  }

  // Determine the upgrade version for the current facet
  const upgradeVersion = +facetVersions[0];
  protocolUpgradeVersion = Math.max(upgradeVersion, protocolUpgradeVersion); // Update protocol version if higher
  const facetDeployInfo = facetDeployVersionInfo.versions
    ? facetDeployVersionInfo.versions[upgradeVersion]
    : {};

  // Determine the deployed version of the facet
  const deployedVersion =
    deployedFacets[name]?.version ?? (deployedFacets[name]?.tx_hash ? 0.0 : -1.0);

  // Load the facet contract using its name and linked libraries if applicable
  const FacetContract = await ethers.getContractFactory(
    name,
    facetDeployVersionInfo.libraries
      ? {
          libraries: networkDeployInfo.ExternalLibraries,
        }
      : undefined,
  );
  // TODO investigate: Duplicate definition of TransferBatch (TransferBatch(address,address,address[],uint256[]), TransferBatch(address,address,address,uint256[],uint256[]))
  // attach the facet contract to the deployed address
  const facet = FacetContract.attach(deployedFacets[name].address!);

  // Determine if the facet needs an upgrade based on version comparison or missing selectors
  const facetNeedsUpgrade = !(name in deployedFuncSelectors.contractFacets) || upgradeVersion !== deployedVersion;
  dc[name] = facet; // Store the facet instance globally for future reference

  // Retrieve selectors for the facet and filter them based on deployment inclusion rules
  const origSelectors = getSelectors(facet).values;
  const includeSelectors: Set<String> | null = facetDeployInfo.deployInclude ? new Set(facetDeployInfo.deployInclude) : null;
  const newFuncSelectors = getSelectors(facet, registeredFunctionSignatures, includeSelectors).values;
  const removedSelectors = origSelectors.filter((v) => !newFuncSelectors.includes(v));
  let numFuncSelectorsCut = 0; // Counter for selectors removed, added, or replaced

  // Retrieve selectors from the previously deployed contract for the current facet
  const deployedContractFacetsSelectors = deployedFuncSelectors.contractFacets[name];
  const deployedToRemove =
    deployedContractFacetsSelectors?.filter((v) => !newFuncSelectors.includes(v)) ?? [];

  // Add a remove operation to the facet cut for selectors that are no longer included
  if (deployedToRemove.length) {
    cut.unshift({
      facetAddress: ethers.constants.AddressZero, // Address zero indicates removal
      action: FacetCutAction.Remove,
      functionSelectors: deployedToRemove,
      name: name,
    });
    numFuncSelectorsCut++;
  }    if (newFuncSelectors.length) {
    let initFunc: string | undefined; // Variable to store the name of the initialization function (if any)
    let initFuncSelector: string | null = null; // Variable to store the selector for the initialization function

    // Determine if we need to call an upgrade or deploy initialization function
    if (facetNeedsUpgrade) {
      // Check if the deployed version is in the list of versions that require an upgrade
      if (facetDeployInfo.fromVersions?.includes(deployedVersion)) {
        initFunc = facetDeployInfo.upgradeInit; // Set the upgrade initialization function
      } else if (deployedVersion == -1) {
        // If the facet was never deployed before, set the deploy initialization function
        initFunc = facetDeployInfo.deployInit;
      }
    } else {
        // If no upgrade is needed, use the deploy initialization function (if defined)
        initFunc = facetDeployInfo.deployInit;
    }
    // Retrieve the selector for the initialization function (if defined)
    if (initFunc) {
      initFuncSelector = getSelector(facet, initFunc);
    }
    // get the current chainID and print it to the console.
    // Update the deployment information for the facet with the new function selectors
    deployedFacets[name].funcSelectors = newFuncSelectors;
    const replaceFuncSelectors: string[] = []; // Track selectors that need to be replaced
    const addFuncSelectors = newFuncSelectors.filter((v) => {
      if (v in deployedFuncSelectors.facets) {
        // If the selector exists but is associated with a different facet address, mark it for replacement
        if (
          deployedFuncSelectors.facets[v].toLowerCase() !== facet.address.toLowerCase()
        ) {
          replaceFuncSelectors.push(v);
        }
        return false; // Exclude selectors already deployed
      } else {
        return true; // Include new selectors
      }
    });

    // Add a replace operation to the facet cut for selectors that need to be updated
    if (replaceFuncSelectors.length) {
      cut.push({
        facetAddress: facet.address, // Address of the facet containing the updated selectors
        action: FacetCutAction.Replace, // Replace operation
        functionSelectors: replaceFuncSelectors, // List of selectors to replace
        name: name, // Facet name
        initFunc: initFuncSelector, // Initialization function selector (if any)
      });
      numFuncSelectorsCut++; // Increment the counter for function selectors modified
    }

    // Add an add operation to the facet cut for new selectors
    if (addFuncSelectors.length) {
      cut.push({
        facetAddress: facet.address, // Address of the facet containing the new selectors
        action: FacetCutAction.Add, // Add operation
        functionSelectors: addFuncSelectors, // List of selectors to add
        name: name, // Facet name
        initFunc: initFuncSelector, // Initialization function selector (if any)
      });
      numFuncSelectorsCut++; // Increment the counter for function selectors modified
    }
    // Register the new function selectors to prevent duplication in future deployments
    for (const funcSelector of newFuncSelectors) {
      registeredFunctionSignatures.add(funcSelector);
    }
    // Update the facet deployment information with the new selectors and version
    deployedFacets[name].funcSelectors = newFuncSelectors;
    deployedFacets[name].version = upgradeVersion;
  } else {
    // If there are no new selectors, remove the facet from the deployed function selectors
    delete deployedFuncSelectors.contractFacets[name];
  }
}
  ```

### deploy Function Selectors to the Diamond

1. Retrieve deployed facets info from deployInfo
2. create a new Set to track the registered function signatures to prevent duplication
3. Determine facet deployment priority based on configured priorities (redundant in new context)
4. Empty Variables to track the protocolUpgradeVersion, selectorsToBeRemoved and facetNamesToBeRemoved
5. Loop through deployed facets to identify facets and selectors to be removed
    1. Collect selectors to remove for facets not in the new deployment list
    2. Push these to facetNameToBeRemoved
    3. delete deployedFacets list to reset before moving out of scope?
6. If there are selectors to be removed add a remove operation to the facet `cut` list
7. Loop through the facets based on priority
    1. Sort facet Versions from highest to lowest
    2. Add one to the deployedVersion which supposedly creates the `upgradeVersion`
    3. Determine the deployed version or mark as undeployed (-1.0)
    4. Load the facetContract using its name and linked libraries if applicable
    5. Attach the facetContract to the deployed address
    6. Determine if the facet needs an upgrade based on version comparison or missing selectors
    7. Store the facet instance globally for future reference in the dc object
    8. Retrieve selectors for teh facet and filter them based on deployment inclusion rules
    9. Retrieve selectors from previously deployed contract for the current facet
    10. Add a remove operation to the facet cut for selectors that are no longer included !!! AGAIN????
8. Connect the diamondCut contract to the contract owner
9.  If Defender deployment is enabled and a signer is configured for the current network
10. Prepare the function selectors for replacement replaceFunctionSelectors
11. Prepare the list of operations (facet cuts) for the diamond upgrade upgradeCut
12. Execute the diamond cut
13. based on contractOwner being known??? tx diamondCut.diamondCut(upgradeCut, ethers.constants.AddressZero, '0x', { gasLimit: XXX })

14. Loop through each facet based on priority again
15. sort facet versions from highest to lowest again
16. Retrieve the previous version of the facet from deployment records
17. Determine the initialization function to call in the contract based on the facet version (upgrade or deployInit)
18. Call the initialization function on the facet contract if one has been defined
19. If a callback is defined for the facet version, execute it