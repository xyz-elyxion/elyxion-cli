// Elyxion Package Manager - Publish Command
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { Registry } = require('../utils/registry');
const { URL } = require('url');

async function publish(args) {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  
  // Check if package.json exists
  if (!fs.existsSync(packageJsonPath)) {
    console.error('\x1b[31mError:\x1b[0m No package.json found');
    console.log('Run `elyx init` first to create a package');
    process.exit(1);
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  
  if (!packageJson.name) {
    console.error('\x1b[31mError:\x1b[0m package.json must have a name');
    process.exit(1);
  }

  console.log(`\n\x1b[36mPublishing ${packageJson.name}@${packageJson.version}...\x1b[0m\n`);

  // Check for token
  const token = Registry.getToken();
  if (!token && !args.includes('--dry-run')) {
    console.error('\x1b[31mError:\x1b[0m Not authenticated');
    console.log('Run `elyx login` first to authenticate');
    process.exit(1);
  }

  try {
    // Get registry info
    const registryUrl = Registry.getRegistryUrl();
    const match = registryUrl.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);

    if (!match) {
      throw new Error('Invalid registry URL');
    }

    const [, owner, repo] = match;

    if (args.includes('--dry-run')) {
      console.log('\x1b[33mDry run - no changes will be made\x1b[0m\n');
      console.log('Package details:');
      console.log(`  Name: ${packageJson.name}`);
      console.log(`  Version: ${packageJson.version}`);
      console.log(`  Description: ${packageJson.description || 'none'}`);
      console.log(`\nRegistry: ${registryUrl}`);
      console.log(`Target: packages/${packageJson.name}/`);
      return;
    }

    // Create/update package on GitHub
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/packages/${packageJson.name}`;
    
    // Check if package exists
    let sha = null;
    try {
      const existing = await fetchGitHub(apiUrl, token);
      sha = existing.sha;
    } catch {
      // Package doesn't exist yet
    }

    // Create/update package.json
    const content = Buffer.from(JSON.stringify(packageJson, null, 2)).toString('base64');
    
    const data = {
      message: `Publish ${packageJson.name}@${packageJson.version}`,
      content: content
    };
    
    if (sha) {
      data.sha = sha;
    }

    await putGitHub(apiUrl, data, token);

    console.log('\x1b[32m✓\x1b[0m Package published successfully!\n');
    console.log(`  ${owner}/${repo}/packages/${packageJson.name}`);
    console.log(`  \x1b[36melyx install ${packageJson.name}\x1b[0m\n`);

  } catch (err) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

function fetchGitHub(url, token) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Elyxion-Package-Manager/1.0.0'
    };
    
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else if (res.statusCode === 404) {
          reject(new Error('Not found'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

function putGitHub(url, data, token) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Elyxion-Package-Manager/1.0.0',
      'Content-Type': 'application/json'
    };
    
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    const urlObj = new URL(url);
    
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'PUT',
      headers
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

module.exports = { publish };
