// Elyxion Package Registry Configuration
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_REGISTRY = 'https://github.com/xyz-elyxion/packages';
const CONFIG_DIR = path.join(os.homedir(), '.elyx');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

class Registry {
  constructor(options = {}) {
    this.registry = options.registry || DEFAULT_REGISTRY;
    this.token = options.token || null;
    this.scope = options.scope || null;
  }

  static getConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      }
    } catch (err) {
      // Config doesn't exist or is invalid
    }
    return {};
  }

  static setConfig(key, value) {
    const config = Registry.getConfig();
    config[key] = value;
    
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  }

  static getRegistryUrl() {
    const config = Registry.getConfig();
    return config.registry || DEFAULT_REGISTRY;
  }

  static getToken() {
    const config = Registry.getConfig();
    return config.token || null;
  }

  static setToken(token) {
    Registry.setConfig('token', token);
  }

  static getAuthHeaders() {
    const token = Registry.getToken();
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Elyxion-Package-Manager/1.0.0'
    };
    
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }
    
    return headers;
  }

  // Convert GitHub URL to API URL
  static gitToApiUrl(gitUrl) {
    // Handle both SSH and HTTPS URLs
    // https://github.com/xyz-elyxion/packages -> https://api.github.com/repos/xyz-elyxion/packages
    // git@github.com:xyz-elyxion/packages.git -> https://api.github.com/repos/xyz-elyxion/packages
    
    let match = gitUrl.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
    if (match) {
      const [, owner, repo] = match;
      return `https://api.github.com/repos/${owner}/${repo}`;
    }
    
    throw new Error(`Invalid GitHub URL: ${gitUrl}`);
  }

  // Get raw content URL for a file
  static getRawUrl(owner, repo, path, branch = 'main') {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  }

  // Get package info URL
  static getPackageUrl(name) {
    const registry = Registry.getRegistryUrl();
    const match = registry.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
    
    if (match) {
      const [, owner, repo] = match;
      return `https://api.github.com/repos/${owner}/${repo}/contents/packages/${name}`;
    }
    
    throw new Error('Invalid registry URL');
  }
}

module.exports = { Registry, DEFAULT_REGISTRY };
