import { IFacetsToDeploy } from '@gnus.ai/diamonds';
import { glob } from 'glob';

// ... (keep existing imports and types)

export const Facets: IFacetsToDeploy = {
  // ... (keep existing facets)
  // To modify the facets
  // MyFacet: {
  //   contract: 'MyFacet',
  //   priority: 10,
  //   versions: {
  //     1: {
  //       deployInit: 'initMyFacet
  //     }
  //   }
  // },
  // [facetName: string]: {
  //   priority: number;
  //   libraries?: string[];
  //   versions?: {
  //     [versionNumber: number]: {
  //       deployInit?: string;
  //       upgradeInit?: string;
  //       fromVersions?: number[];
  //       callback?: AfterDeployInit;
  //       deployInclude?: string[];
  //     }; 
  //   };
  // },
}

// Load all facet deployments from the facetdeployments directory
// TODO: the __dirname should be set in hardhat.config.ts
export async function LoadFacetDeployments() {
  console.log(`directory: ${__dirname}`);
  const imports = glob.sync(`${__dirname}/facetdeployments/*.ts`);
  for (const file of imports) {
    const deployLoad = file.replace(__dirname, '.').replace('.ts', '');
    await import(deployLoad);
  }
}

