// Elyxion Package Resolver
'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { Registry } = require('./registry');

class Resolver {
  constructor(options = {}) {
    this.registry = options.registry || Registry.getRegistryUrl();
    this.cache = new Map();
  }

  async fetch(url) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const headers = Registry.getAuthHeaders();
      
      const req = client.get(url, { headers }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data);
            }
          } else if (res.statusCode === 404) {
            reject(new Error(`Not found: ${url}`));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });
      
      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  async fetchContent(url) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const headers = Registry.getAuthHeaders();
      
      const req = client.get(url, { headers }, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.fetchContent(res.headers.location).then(resolve).catch(reject);
        }
        
        const chunks = [];
        
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve(buffer);
        });
      });
      
      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
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
    
    const result = {
      name: parsed.name,
      version: resolvedVersion,
      description: packageInfo.description || '',
      main: packageInfo.main || 'index.js',
      dependencies: packageInfo.dependencies || {},
      repository: packageInfo.repository || null,
      tarball: packageInfo.dist?.tarball || null,
      shasum: packageInfo.dist?.shasum || null
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

  async getPackageInfo(name) {
    const registryUrl = this.registry;
    const match = registryUrl.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
    
    if (!match) {
      throw new Error('Invalid registry URL');
    }

    const [, owner, repo] = match;
    
    try {
      // Try to get package.json from GitHub
      const url = Registry.getRawUrl(owner, repo, `packages/${name}/package.json`);
      return await this.fetch(url);
    } catch (err) {
      // Try alternative locations
      try {
        const url = Registry.getRawUrl(owner, repo, `${name}/package.json`);
        return await this.fetch(url);
      } catch {
        return null;
      }
    }
  }

  resolveVersion(packageInfo, version) {
    if (version === 'latest') {
      return packageInfo.version || '1.0.0';
    }
    
    // Handle semver ranges
    if (version.startsWith('^') || version.startsWith('~') || version.startsWith('>') || version.startsWith('<')) {
      // Simplified: just return the base version
      return packageInfo.version || '1.0.0';
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
