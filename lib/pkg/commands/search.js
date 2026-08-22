// Elyxion Package Manager - Search Command
'use strict';

const { Resolver } = require('../utils/resolver');
const { Registry } = require('../utils/registry');

async function search(args) {
  if (args.length === 0) {
    console.error('\x1b[31mError:\x1b[0m Please provide a search query');
    console.log('\nUsage: elyx search <query>');
    process.exit(1);
  }

  const query = args.join(' ').toLowerCase();
  const registryUrl = Registry.getRegistryUrl();
  const match = registryUrl.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);

  if (!match) {
    console.error('\x1b[31mError:\x1b[0m Invalid registry URL');
    process.exit(1);
  }

  const [, owner, repo] = match;
  const resolver = new Resolver();

  console.log(`\n\x1b[36mSearching for "${query}"...\x1b[0m\n`);

  try {
    // Get list of packages from GitHub
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/packages`;
    const packages = await resolver.fetch(apiUrl);

    if (!Array.isArray(packages)) {
      console.log('\x1b[33mNo packages found\x1b[0m');
      return;
    }

    const results = packages.filter(pkg => {
      const name = pkg.name.toLowerCase();
      return name.includes(query);
    });

    if (results.length === 0) {
      console.log('\x1b[33mNo packages found\x1b[0m');
      return;
    }

    console.log(`\x1b[1mFound ${results.length} packages:\x1b[0m\n`);

    for (const pkg of results) {
      try {
        const pkgUrl = Registry.getRawUrl(owner, repo, `packages/${pkg.name}/package.json`);
        const pkgInfo = await resolver.fetch(pkgUrl);
        
        console.log(`  \x1b[32m${pkgInfo.name || pkg.name}\x1b[0m@${pkgInfo.version || '1.0.0'}`);
        if (pkgInfo.description) {
          console.log(`    ${pkgInfo.description}`);
        }
        console.log('');
      } catch {
        console.log(`  \x1b[32m${pkg.name}\x1b[0m`);
        console.log('');
      }
    }
  } catch (err) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

module.exports = { search };
