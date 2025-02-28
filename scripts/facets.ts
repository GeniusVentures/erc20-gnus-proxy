import { FacetToDeployInfo } from './common';
import { glob } from 'glob';

// ... (keep existing imports and types)

export const Facets: FacetToDeployInfo = {
  // ... (keep existing facets)
}

export async function LoadFacetDeployments() {
  const imports = glob.sync(`${__dirname}/facetdeployments/*.ts`);
  for (const file of imports) {
    const deployLoad = file.replace(__dirname, '.').replace('.ts', '');
    await import(deployLoad);
  }
}

