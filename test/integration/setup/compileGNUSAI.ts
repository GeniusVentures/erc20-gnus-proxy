import { task } from 'hardhat/config';
import { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } from 'hardhat/builtin-tasks/task-names';
import path from 'path';
import fs from 'fs';

task(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS, async (_, __, runSuper) => {
  const sources = await runSuper();

  // Add additional directories to the sources array
  const additionalSources = [
    // path.join(__dirname, '../contracts'),
    path.join(__dirname, '../gnus-ai/contracts'),
    // Add more directories as needed
  ];

  for (const dir of additionalSources) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((file) => file.endsWith('.sol'));
      for (const file of files) {
        sources.push(path.join(dir, file));
      }
    }
  }

  return sources;
});