// Elyxion Package Manager - Publish Command
'use strict';

const fs = require('fs');
const path = require('path');
const { Registry } = require('../utils/registry');
const http = require('../utils/http');

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
  if (!packageJson.version) {
    console.error('\x1b[31mError:\x1b[0m package.json must have a version (e.g. "1.0.0")');
    process.exit(1);
  }

  const registryUrl = Registry.getRegistryUrl();
  console.log(`\n\x1b[36mPublishing ${packageJson.name}@${packageJson.version}...\x1b[0m\n`);
  console.log('  Registry: ' + registryUrl);

  // Check for token
  const token = Registry.getToken();
  if (!token && !args.includes('--dry-run')) {
    console.error('\x1b[31mError:\x1b[0m Not authenticated');
    console.log('Run `elyx login` first to authenticate');
    process.exit(1);
  }

  // Collect an optional README
  let readme = null;
  for (const readmeName of ['README.md', 'readme.md', 'README']) {
    const readmePath = path.join(process.cwd(), readmeName);
    if (fs.existsSync(readmePath)) {
      readme = fs.readFileSync(readmePath, 'utf-8');
      break;
    }
  }

  if (args.includes('--dry-run')) {
    console.log('\n\x1b[33mDry run - no changes will be made\x1b[0m\n');
    console.log('Package details:');
    console.log(`  Name: ${packageJson.name}`);
    console.log(`  Version: ${packageJson.version}`);
    console.log(`  Description: ${packageJson.description || 'none'}`);
    console.log(`  Main: ${packageJson.main || 'index.js'}`);
    console.log(`  Dependencies: ${Object.keys(packageJson.dependencies || {}).length}`);
    console.log(`  README: ${readme ? 'attached' : 'none'}`);
    console.log(`\nTarget: ${registryUrl}/api/packages`);
    return;
  }

  try {
    const res = await http.postJSON(
      registryUrl + '/api/packages',
      { package: packageJson, readme },
      { Authorization: 'Bearer ' + token }
    );

    if (res.statusCode === 201) {
      console.log('\n\x1b[32m✓\x1b[0m Package published successfully!\n');
      console.log(`  ${registryUrl}/api/packages/${res.data.name}`);
      console.log(`  \x1b[36melyx install ${res.data.name}\x1b[0m\n`);
    } else if (res.statusCode === 401) {
      console.error('\n\x1b[31mError:\x1b[0m Not authenticated or session expired');
      console.log('Run `elyx login` again');
      process.exit(1);
    } else {
      console.error('\n\x1b[31mError:\x1b[0m ' + ((res.data && res.data.error) || ('Publish failed (HTTP ' + res.statusCode + ')')));
      process.exit(1);
    }
  } catch (err) {
    console.error('\n\x1b[31mError:\x1b[0m ' + err.message);
    process.exit(1);
  }
}

module.exports = { publish };
