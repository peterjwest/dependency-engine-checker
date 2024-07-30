import fs from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from "zod";
import { minVersion, satisfies, Range } from 'semver';
import { Dictionary } from 'lodash';
import util from  'util';

import { getRangeListIntersection, getUniqueRanges } from './range';

util.inspect.defaultOptions.depth = null;

const Engines = z.object({
  node: z.string(),
});
type Engines = z.infer<typeof Engines>;

const Package = z.object({
  engines: z.optional(Engines),
  dev: z.optional(z.literal(true)),
});
type Package = z.infer<typeof Package>;

const PnpmLock = z.object({
  devDependencies: z.optional(z.record(z.string(), Package)),
  packages: z.optional(z.record(z.string(), Package)),
});
type PnpmLock = z.infer<typeof PnpmLock>;

const PackageJson = z.object({
  engines: z.optional(z.object({ node: z.optional(z.string()) })),
});
type PackageJson = z.infer<typeof PackageJson>;

(async () => {
  const packageJson = PackageJson.parse(JSON.parse(await fs.readFile('package.json', 'utf8')));
  const lockFile = PnpmLock.parse(parse(await fs.readFile('pnpm-lock.yaml', 'utf8')));

  const nodeEngine = packageJson?.engines?.node;

  const minNodeVersion = nodeEngine && minVersion(new Range(nodeEngine));
  if (!minNodeVersion) {
    console.log('Valid Node version/range not specified in package.json');
    return;
  }
  console.log(`Minimum Node version ${minNodeVersion.version} specified in package.json`);

  const nodeConstraints: Dictionary<string> = {};

  for (const packageName in lockFile.devDependencies) {
    const dependency = lockFile.devDependencies[packageName];
    if (dependency.engines) nodeConstraints[packageName] = dependency.engines.node;
  }

  for (const packageName in lockFile.packages) {
    const dependency = lockFile.packages[packageName];
    if (dependency.engines) nodeConstraints[packageName] = dependency.engines.node;
  }

  const errors = [];
  for (const packageName in nodeConstraints) {
    if (!satisfies(minNodeVersion, nodeConstraints[packageName])) {
      errors.push({ packageName, constraint: nodeConstraints[packageName] });
    }
  }

  const ranges = getUniqueRanges(Object.values(nodeConstraints));
  const intersected = getRangeListIntersection(ranges);

  if (errors.length) {
    console.error('Dependency errors found:');
    for (const error of errors) {
      console.error(`- Package ${error.packageName} requires Node version ${error.constraint}`);
    }
  } else {
    console.log('No errors found');
  }

  const minimumVersion = minVersion(intersected);
  if (minimumVersion) {
    console.error(`Minimum Node version from dependencies ${minimumVersion.version}`);
  } else {
    console.error(`No compatible minimum Node version in dependencies!`);
  }

  if (errors.length) process.exit(1);

})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
