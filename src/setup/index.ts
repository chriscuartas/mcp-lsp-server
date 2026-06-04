import { existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const LANGUAGE_SERVERS = [
  {
    language: 'PHP',
    extensions: ['php'],
    command: ['intelephense', '--stdio'],
    checkCmd: 'intelephense',
    installCmd: 'npm install -g intelephense',
  },
  {
    language: 'TypeScript/JavaScript',
    extensions: ['ts', 'tsx', 'js', 'jsx'],
    command: ['typescript-language-server', '--stdio'],
    checkCmd: 'typescript-language-server',
    installCmd: 'npm install -g typescript-language-server typescript',
  },
  {
    language: 'Python',
    extensions: ['py'],
    command: ['pylsp'],
    checkCmd: 'pylsp',
    installCmd: 'pip install python-lsp-server',
  },
];

function isInstalled(cmd: string): boolean {
  try {
    execSync(`where ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    try {
      execSync(`which ${cmd}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

function scanExtensions(dir: string, depth = 3): Set<string> {
  const found = new Set<string>();
  const ignored = new Set(['node_modules', '.git', 'vendor', 'dist', '__pycache__', '.cache']);

  function walk(current: string, currentDepth: number): void {
    if (currentDepth > depth) return;
    try {
      const entries = readdirSync(current);
      for (const entry of entries) {
        if (ignored.has(entry)) continue;
        const fullPath = join(current, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath, currentDepth + 1);
          } else {
            const ext = extname(entry).replace('.', '').toLowerCase();
            if (ext) found.add(ext);
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  walk(dir, 0);
  return found;
}

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  const cwd = process.cwd();
  console.log(`\nmcp-lsp Setup Wizard\nScanning: ${cwd}\n`);

  const foundExts = scanExtensions(cwd);
  const detected = LANGUAGE_SERVERS.filter((ls) =>
    ls.extensions.some((ext) => foundExts.has(ext))
  );

  if (detected.length === 0) {
    console.log('No supported languages detected in this directory.');
    process.exit(0);
  }

  console.log('Detected languages:\n');
  console.log(
    `${'Language'.padEnd(25)} ${'Server'.padEnd(35)} ${'Installed?'.padEnd(12)} Install command`
  );
  console.log('-'.repeat(90));

  for (const ls of detected) {
    const installed = isInstalled(ls.checkCmd);
    console.log(
      `${ls.language.padEnd(25)} ${ls.command[0]!.padEnd(35)} ${(installed ? '✓ yes' : '✗ no').padEnd(12)} ${installed ? '' : ls.installCmd}`
    );
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('');

  const answer = await prompt(rl, 'Include all detected servers in config? [Y/n] ');
  rl.close();

  const includeAll = answer.trim().toLowerCase() !== 'n';
  const servers = includeAll ? detected : detected.filter((ls) => isInstalled(ls.checkCmd));

  const configDir = join(cwd, '.claude');
  const configPath = join(configDir, 'mcp-lsp.json');

  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

  const configContent = {
    servers: servers.map((ls) => ({
      extensions: ls.extensions,
      command: ls.command,
      rootDir: cwd,
    })),
  };

  writeFileSync(configPath, JSON.stringify(configContent, null, 2));
  console.log(`\nConfig written to: ${configPath}`);

  const distIndexPath = join(cwd, 'dist', 'index.js');
  console.log('\nOr add this to ~/.claude/settings.json under "mcpServers":\n');
  console.log(
    JSON.stringify(
      {
        'mcp-lsp': {
          command: 'node',
          args: [distIndexPath],
        },
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
