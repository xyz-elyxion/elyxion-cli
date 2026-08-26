// Elyxion Package Manager - Init Command
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const WEBSITE_FLAGS = ['-website', '--website'];
const DISCORD_FLAGS = ['-discord', '--discord'];

async function init(args) {
  // `elyx init -website` — scaffold a website-framework project
  if (args.some((arg) => WEBSITE_FLAGS.includes(arg))) {
    scaffoldWebsite(process.cwd(), args.includes('--force'));
    return;
  }

  // `elyx init -discord` — scaffold a discord-framework bot project
  if (args.some((arg) => DISCORD_FLAGS.includes(arg))) {
    scaffoldDiscord(process.cwd(), args.includes('--force'));
    return;
  }

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

// Scaffold a website-framework project (the same structure the
// elyxion-website CLI creates with `create <name>`).
function scaffoldWebsite(target, force) {
  const name = path.basename(path.resolve(target)) || 'elyxion-site';

  const write = (rel, content) => {
    const file = path.join(target, rel);
    if (fs.existsSync(file) && !force) {
      console.log(`\x1b[33mSkipped:\x1b[0m ${rel} already exists`);
      return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    console.log(`\x1b[32m✓\x1b[0m created ${rel}`);
  };

  console.log('\n\x1b[36mWebsite framework initialization\x1b[0m\n');

  write('package.json', JSON.stringify({
    name: name,
    version: '0.1.0',
    description: '',
    main: 'app.js',
    dependencies: { 'elyxion-website': '^0.1.0' }
  }, null, 2));

  write('app.js', EXAMPLE_APP);

  fs.mkdirSync(path.join(target, 'public'), { recursive: true });
  write('public/style.css', '');

  write('README.md', [
    '# ' + name,
    '',
    'Built with the Elyxion Website Framework (server-side HTML, styled with shadcn/ui).',
    '',
    '## Install',
    'First make the framework available to require():',
    '```bash',
    'elyx install elyxion-website   # or clone the framework repo next to this project',
    '```',
    '',
    '## Run',
    '```bash',
    'elyxion app.js',
    '```',
    '',
    '## Structure',
    '- `app.js` — application entry point',
    '- `public/` — static assets (CSS, images, etc.)',
    ''
  ].join('\n'));

  console.log('\n\x1b[32m✓\x1b[0m Website project initialized at ' + path.resolve(target));
  console.log('  Run: elyxion app.js\n');
}

// Scaffold a discord-framework bot project (the same structure the
// elyxion-discord CLI creates with `create <name>`).
function scaffoldDiscord(target, force) {
  const name = path.basename(path.resolve(target)) || 'elyxion-bot';

  const write = (rel, content) => {
    const file = path.join(target, rel);
    if (fs.existsSync(file) && !force) {
      console.log(`\x1b[33mSkipped:\x1b[0m ${rel} already exists`);
      return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    console.log(`\x1b[32m✓\x1b[0m created ${rel}`);
  };

  console.log('\n\x1b[36mDiscord framework initialization\x1b[0m\n');

  write('package.json', JSON.stringify({
    name: name,
    version: '0.1.0',
    description: '',
    main: 'bot.js',
    dependencies: { 'elyxion-discord': '^0.1.0' }
  }, null, 2));

  write('bot.js', EXAMPLE_BOT);

  fs.mkdirSync(path.join(target, 'commands'), { recursive: true });
  write('commands/ping.js', EXAMPLE_PING);

  write('.env.example', [
    '# Discord bot token — create one at https://discord.com/developers/applications',
    'DISCORD_TOKEN=your-bot-token-here',
    '',
    '# Optional command prefix (defaults to !)',
    'PREFIX=!'
  ].join('\n'));

  write('README.md', [
    '# ' + name,
    '',
    'A Discord bot built with the Elyxion Discord Framework — zero dependencies,',
    'running on the Elyxion runtime.',
    '',
    '## Install',
    'First make the framework available to require():',
    '```bash',
    'elyx install elyxion-discord   # or clone the framework repo next to this project',
    '```',
    '',
    '## Setup',
    'Copy `.env.example` to `.env` and set your bot token (bot.js loads it for you).',
    '',
    '## Run',
    '```bash',
    'elyxion bot.js',
    '```',
    '',
    '## Structure',
    '- `bot.js` — the bot entry point (commands, events, login)',
    '- `commands/` — one file per command',
    ''
  ].join('\n'));

  console.log('\n\x1b[32m✓\x1b[0m Discord project initialized at ' + path.resolve(target));
  console.log('  Copy .env.example to .env, add your token, then: elyxion bot.js\n');
}

const EXAMPLE_BOT = [
  "'use strict';",
  '',
  "const { loadEnv } = require('elyxion-discord');",
  'loadEnv(); // read .env if present (no dependencies)',
  '',
  "const { createBot, Embed } = require('elyxion-discord');",
  '',
  'const bot = createBot({',
  "  prefix: process.env.PREFIX || '!',",
  "  token: process.env.DISCORD_TOKEN || ''",
  '});',
  '',
  "const ping = require('./commands/ping');",
  "bot.command('ping', ping.run, ping.options);",
  '',
  "bot.command('embed', (ctx) => {",
  '  const embed = new Embed()',
  "    .setTitle('Hello from Elyxion')",
  "    .setDescription('A Discord bot running on the Elyxion runtime.')",
  "    .setColor('#8b5cf6')",
  "    .addField('Runtime', 'Elyxion — no Node.js required', true)",
  "    .addField('Framework', 'elyxion-discord', true)",
  "    .setFooter('Built with elyxion-discord');",
  '  ctx.reply({ embeds: [embed.toJSON()] });',
  "}, { description: 'Sends an embed' });",
  '',
  "bot.on('ready', (user) => {",
  "  console.log('  ⚡ Logged in as ' + user.username + ' (' + user.id + ')');",
  "  console.log('     Commands: !ping, !embed');",
  "  console.log('');",
  '});',
  '',
  "bot.on('error', (err) => console.error('Bot error: ' + err.message));",
  '',
  "module.exports = { start: (opts) => bot.login().then(() => bot.connect()) };",
  ''
].join('\n');

const EXAMPLE_PING = [
  "'use strict';",
  '',
  '// Example command. Add more files here and register them in bot.js:',
  "//   const myCmd = require('./commands/mycmd');",
  "//   bot.command('mycmd', myCmd.run, myCmd.options);",
  '',
  'module.exports = {',
  "  options: { description: 'Replies with pong', usage: 'ping' },",
  '  run: (ctx) => {',
  "    ctx.reply('pong!');",
  '  }',
  '};',
  ''
].join('\n');

const EXAMPLE_APP = [
  "'use strict';",
  '',
  "const { createSite, Router, page } = require('elyxion-website');",
  "const { button, badge, card, cardHeader, cardTitle, cardDescription, cardContent } = require('elyxion-website/components');",
  '',
  'const app = createSite();',
  '',
  'app.get(\'/\', (req, res) => {',
  '  const body = [',
  '    \'<div class="container py-16 text-center">\' +',
  "    badge({ variant: 'outline' }, 'Elyxion Website') +",
  "    require('elyxion-website/components/typography').h1('Hello, world') +",
  "    require('elyxion-website/components/typography').lead('Built with the Elyxion Website Framework — styled with shadcn/ui.') +",
  "    '<div class=\"flex items-center justify-center gap-4 mt-8\">' +",
  '    button({}, \'Get Started\') +',
  "    button({ variant: 'outline', href: 'https://github.com/xyz-elyxion/elyxion-cli' }, 'GitHub') +",
  "    '</div>' +",
  "    '</div>'",
  '  ].join(\'\');',
  '  res.html(page({ title: \'Hello\', body }));',
  '});',
  '',
  'module.exports = { start: (opts) => app.listen(opts.port) };',
  ''
].join('\n');

module.exports = { init };