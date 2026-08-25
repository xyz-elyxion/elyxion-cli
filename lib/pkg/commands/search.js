// Elyxion Package Manager - Search Command
'use strict';

const { Registry } = require('../utils/registry');
const http = require('../utils/http');

async function search(args) {
  if (args.length === 0) {
    console.error('\x1b[31mError:\x1b[0m Please provide a search query');
    console.log('\nUsage: elyx search <query>');
    process.exit(1);
  }

  const query = args.join(' ').trim();
  const registryUrl = Registry.getRegistryUrl();

  console.log(`\n\x1b[36mSearching for "${query}"...\x1b[0m\n`);

  try {
    const res = await http.getJSON(
      registryUrl + '/api/search?q=' + encodeURIComponent(query),
      Registry.getAuthHeaders()
    );

    if (res.statusCode === 400) {
      console.log('\x1b[33mPlease provide a search query\x1b[0m');
      return;
    }

    const results = (res.data && res.data.packages) || [];

    if (results.length === 0) {
      console.log('\x1b[33mNo packages found\x1b[0m');
      console.log('  Publish your own with \x1b[36melyx publish\x1b[0m\n');
      return;
    }

    console.log(`\x1b[1mFound ${results.length} package${results.length === 1 ? '' : 's'}:\x1b[0m\n`);

    for (const pkg of results) {
      console.log(`  \x1b[32m${pkg.name}\x1b[0m@${pkg.latest || '1.0.0'}`);
      if (pkg.description) {
        console.log(`    ${pkg.description}`);
      }
      console.log(`    owner: ${pkg.owner}  |  \x1b[36melyx install ${pkg.name}\x1b[0m`);
      console.log('');
    }
  } catch (err) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

module.exports = { search };
