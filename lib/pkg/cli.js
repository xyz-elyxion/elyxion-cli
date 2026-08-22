// Elyxion Package Manager (elyx) - CLI Entry Point
'use strict';

const { install } = require('./commands/install');
const { uninstall } = require('./commands/uninstall');
const { update } = require('./commands/update');
const { list } = require('./commands/list');
const { init } = require('./commands/init');
const { search } = require('./commands/search');
const { publish } = require('./commands/publish');
const { login } = require('./commands/login');
const { Registry } = require('./utils/registry');

const VERSION = '1.0.0';

const commands = {
  install,
  i: install,
  add: install,
  uninstall,
  remove: uninstall,
  rm: uninstall,
  update,
  upgrade: update,
  list,
  ls: list,
  init,
  search,
  find: search,
  publish,
  pub: publish,
  login
};

function printHelp() {
  console.log(`
\x1b[1mElyx - Elyxion Package Manager\x1b[0m v${VERSION}

Usage: elyx <command> [options]

Commands:
  \x1b[32minit\x1b[0m                    Initialize a new package
  \x1b[32minstall\x1b[0m, \x1b[32mi\x1b[0m, \x1b[32madd\x1b[0m        Install packages
  \x1b[32muninstall\x1b[0m, \x1b[32mrm\x1b[0m         Remove packages
  \x1b[32mupdate\x1b[0m                  Update packages
  \x1b[32mlist\x1b[0m, \x1b[32mls\x1b[0m               List installed packages
  \x1b[32msearch\x1b[0m, \x1b[32mfind\x1b[0m           Search for packages
  \x1b[32mpublish\x1b[0m, \x1b[32mpub\x1b[0m          Publish a package
  \x1b[32mlogin\x1b[0m                   Authenticate with GitHub
  \x1b[32mconfig\x1b[0m                  Manage configuration

Options:
  -g, --global              Install globally
  -D, --save-dev            Save to devDependencies
  --dry-run                 Preview without making changes
  -v, --version             Show version
  -h, --help                Show help

Registry: \x1b[36m${Registry.getRegistryUrl()}\x1b[0m

Examples:
  elyx init                      Create package.json
  elyx install lodash            Install lodash
  elyx install express@4.18.0    Install specific version
  elyx uninstall lodash          Remove lodash
  elyx search http               Search for http packages
  elyx publish                   Publish to registry
  elyx login                     Authenticate with GitHub
`);
}

function printConfigHelp() {
  console.log(`
\x1b[1mElyx Configuration\x1b[0m

Usage: elyx config <command> [key] [value]

Commands:
  elyx config list              List all config values
  elyx config get <key>         Get a config value
  elyx config set <key> <value> Set a config value

Config file: \x1b[36m~/.elyx/config.json\x1b[0m
`);
}

async function run(argv = process.argv.slice(2)) {
  // Handle no arguments
  if (argv.length === 0) {
    printHelp();
    return;
  }

  const command = argv[0];
  const args = argv.slice(1);

  // Handle version
  if (command === '-v' || command === '--version') {
    console.log(`elyx v${VERSION}`);
    return;
  }

  // Handle help
  if (command === '-h' || command === '--help') {
    printHelp();
    return;
  }

  // Handle config commands
  if (command === 'config') {
    handleConfig(args);
    return;
  }

  // Find command handler
  const handler = commands[command];
  
  if (!handler) {
    console.error(`\x1b[31mError:\x1b[0m Unknown command: ${command}`);
    console.log('Run `elyx --help` for available commands');
    process.exit(1);
  }

  // Execute command
  try {
    await handler(args);
  } catch (err) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

function handleConfig(args) {
  if (args.length === 0) {
    printConfigHelp();
    return;
  }

  const subCommand = args[0];

  switch (subCommand) {
    case 'list':
      console.log('\n\x1b[1mConfiguration:\x1b[0m\n');
      const config = Registry.getConfig();
      for (const [key, value] of Object.entries(config)) {
        const displayValue = key === 'token' ? '***' : value;
        console.log(`  ${key} = ${displayValue}`);
      }
      console.log('');
      break;

    case 'get':
      if (args.length < 2) {
        console.error('\x1b[31mError:\x1b[0m Please provide a key');
        return;
      }
      const value = Registry.getConfig()[args[1]];
      console.log(value !== undefined ? value : 'undefined');
      break;

    case 'set':
      if (args.length < 3) {
        console.error('\x1b[31mError:\x1b[0m Please provide key and value');
        return;
      }
      Registry.setConfig(args[1], args[2]);
      console.log(`\x1b[32m✓\x1b[0m ${args[1]} = ${args[2]}`);
      break;

    default:
      console.error(`\x1b[31mError:\x1b[0m Unknown config command: ${subCommand}`);
      printConfigHelp();
  }
}

module.exports = { run, commands };
