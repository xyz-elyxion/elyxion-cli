// Elyxion Package Manager - Init Command
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function init(args) {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  
  // Check if package.json already exists
  if (fs.existsSync(packageJsonPath) && !args.includes('--force')) {
    console.error('\x1b[33mWarning:\x1b[0m package.json already exists');
    console.log('Use --force to overwrite');
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise((resolve) => {
    rl.question(prompt, resolve);
  });

  try {
    console.log('\n\x1b[36mPackage initialization\x1b[0m\n');
    
    const name = await question('Package name: ');
    const version = await question('Version (1.0.0): ') || '1.0.0';
    const description = await question('Description: ');
    const main = await question('Main entry point (index.js): ') || 'index.js';
    const author = await question('Author: ');
    const license = await question('License (MIT): ') || 'MIT';

    rl.close();

    const packageJson = {
      name: name,
      version: version,
      description: description,
      main: main,
      author: author,
      license: license,
      scripts: {
        start: 'elyxion ' + main,
        test: 'echo "No tests specified"'
      },
      keywords: [],
      dependencies: {},
      devDependencies: {}
    };

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    
    console.log('\n\x1b[32m✓\x1b[0m package.json created\n');
    
  } catch (err) {
    rl.close();
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

module.exports = { init };
