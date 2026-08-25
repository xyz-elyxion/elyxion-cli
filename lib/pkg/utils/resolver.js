// Elyxion Package Resolver
'use strict';

const { Registry } = require('./registry');
const http = require('./http');

class Resolver {
  constructor(options = {}) {
    this.registry = options.registry || Registry.getRegistryUrl();
    this.cache = new Map();
  }

  async getPackageInfo(name) {
    const url = this.registry + '/api/packages/' + encodeURIComponent(name);
    const res = await http.getJSON(url, Registry.getAuthHeaders());

    if (res.statusCode === 404) {
      return null;
    }
    if (res.statusCode !== 200 || !res.data) {
      throw new Error('Registry error (HTTP ' + res.statusCode + '): ' + (res.body || 'no response'));
    }
    return res.data;
  }

  async resolvePackage(name, version = 'latest') {
    // Check cache
    const cacheKey = `${name}@${version}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Parse package name
    const parsed = this.parsePackageName(name);

    // Get package info from registry
    const packageInfo = await this.getPackageInfo(parsed.name);

    if (!packageInfo) {
      throw new Error(`Package '${name}' not found in registry`);
    }

    // Resolve version
    const resolvedVersion = this.resolveVersion(packageInfo, version);

    const versionMeta = (packageInfo.versions && packageInfo.versions[resolvedVersion]) || {};

    const result = {
      name: parsed.name,
      version: resolvedVersion,
      description: versionMeta.description || packageInfo.description || '',
      main: versionMeta.main || 'index.js',
      dependencies: versionMeta.dependencies || {},
      repository: versionMeta.repository || null,
      tarball: (versionMeta.dist && versionMeta.dist.tarball) || null,
      shasum: (versionMeta.dist && versionMeta.dist.shasum) || null,
    };

    // Cache result
    this.cache.set(cacheKey, result);

    return result;
  }

  parsePackageName(name) {
    // Handle scoped packages (@scope/name)
    const match = name.match(/^(@[^@\/]+\/)?(.+)$/);
    if (!match) {
      throw new Error(`Invalid package name: ${name}`);
    }

    return {
      scope: match[1] || null,
      name: match[2]
    };
  }

  resolveVersion(packageInfo, version) {
    const distTags = packageInfo['dist-tags'] || {};

    if (version === 'latest' || version === '') {
      return distTags.latest || Object.keys(packageInfo.versions || {}).sort().pop() || '1.0.0';
    }

    // Exact version
    if (packageInfo.versions && packageInfo.versions[version]) {
      return version;
    }

    // Handle semver ranges (simplified: resolve to latest published)
    if (/^(\^|~|>=?|<=?)/.test(version)) {
      return distTags.latest || '1.0.0';
    }

    return version;
  }

  async resolveDependencies(name, version) {
    const pkg = await this.resolvePackage(name, version);
    const deps = [];

    if (pkg.dependencies) {
      for (const [depName, depVersion] of Object.entries(pkg.dependencies)) {
        const dep = await this.resolvePackage(depName, depVersion);
        deps.push(dep);

        // Recursively resolve sub-dependencies
        const subDeps = await this.resolveDependencies(depName, depVersion);
        deps.push(...subDeps);
      }
    }

    return deps;
  }
}

module.exports = { Resolver };
