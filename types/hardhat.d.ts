// Type extensions for Hardhat
import '@nomiclabs/hardhat-ethers';

// Fix for ethereum-waffle compatibility issue  
import './ethereum-waffle-fix';

// Use the installed package types
import type { DiamondsPathsConfig } from '@gnus.ai/diamonds';
import type { HardhatDiamondsConfig } from '@gnus.ai/hardhat-diamonds'

declare module "hardhat/types/config" {
  export interface HardhatUserConfig {
    diamonds?: DiamondsPathsConfig;
  }

  export interface HardhatConfig {
    diamonds: DiamondsPathsConfig;
  }
}

declare module "hardhat/types/runtime" {
  interface HardhatRuntimeEnvironment {
    diamonds: HardhatDiamondsConfig; // Using any to avoid issues
  }
}
