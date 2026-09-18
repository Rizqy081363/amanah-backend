#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dir, '../..');

function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!existsSync(filePath)) return result;

  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let val = match[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

const exampleEnv = parseEnvFile(resolve(repoRoot, '.env.example'));
const localEnv = parseEnvFile(resolve(repoRoot, '.env'));

function getInfraValue(name: string, fallback: string): string {
  const fromProcess = process.env[name];
  if (fromProcess && fromProcess.trim()) return fromProcess.trim();
  const fromLocal = localEnv[name];
  if (fromLocal && fromLocal.trim()) return fromLocal.trim();
  const fromExample = exampleEnv[name];
  if (fromExample && fromExample.trim()) return fromExample.trim();
  return fallback;
}

function detectComposeCommand(): { command: string; prefixArgs: string[] } {
  const tryPlugin = spawnSync('docker', ['compose', 'version'], {
    stdio: 'ignore',
  });
  if (tryPlugin.status === 0) {
    return { command: 'docker', prefixArgs: ['compose'] };
  }

  const tryStandalone = spawnSync('docker-compose', ['version'], {
    stdio: 'ignore',
  });
  if (tryStandalone.status === 0) {
    return { command: 'docker-compose', prefixArgs: [] };
  }

  throw new Error(
    'Docker Compose was not found. Please install Docker Desktop or ensure docker compose / docker-compose is on PATH.',
  );
}

function runCompose(
  args: string[],
  extraEnv: Record<string, string> = {},
): Promise<number> {
  const { command, prefixArgs } = detectComposeCommand();
  const fullArgs = [...prefixArgs, ...args];

  return new Promise((resolve, reject) => {
    const child = spawn(command, fullArgs, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => resolve(code ?? 0));
  });
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(300);

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, '127.0.0.1');
  });
}

async function getRunningContainerIds(): Promise<string[]> {
  try {
    const { command, prefixArgs } = detectComposeCommand();
    const result = spawnSync(command, [...prefixArgs, 'ps', '-q'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    if (result.status === 0 && result.stdout) {
      return result.stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } catch {
    // Ignore errors when checking existing containers
  }
  return [];
}

async function handleUp(build: boolean, skipPortCheck: boolean) {
  const apiHostPort = parseInt(getInfraValue('API_HOST_PORT', '3001'), 10);
  const postgresHostPort = parseInt(
    getInfraValue('POSTGRES_HOST_PORT', '5433'),
    10,
  );
  const redisHostPort = parseInt(
    getInfraValue('REDIS_HOST_PORT', '6379'),
    10,
  );
  const smtpHostPort = parseInt(getInfraValue('SMTP_HOST_PORT', '1025'), 10);
  const mailpitHostPort = parseInt(
    getInfraValue('MAILPIT_HOST_PORT', '8025'),
    10,
  );
  const adminerHostPort = parseInt(
    getInfraValue('ADMINER_HOST_PORT', '8080'),
    10,
  );

  const portsToCheck = [
    { name: 'API_HOST_PORT', port: apiHostPort },
    { name: 'POSTGRES_HOST_PORT', port: postgresHostPort },
    { name: 'REDIS_HOST_PORT', port: redisHostPort },
    { name: 'SMTP_HOST_PORT', port: smtpHostPort },
    { name: 'MAILPIT_HOST_PORT', port: mailpitHostPort },
    { name: 'ADMINER_HOST_PORT', port: adminerHostPort },
  ];

  if (!skipPortCheck) {
    const runningContainers = await getRunningContainerIds();
    // Only check ports if containers are not already running for this project
    if (runningContainers.length === 0) {
      const conflicts: string[] = [];
      for (const item of portsToCheck) {
        const inUse = await isPortInUse(item.port);
        if (inUse) {
          conflicts.push(`${item.name}=${item.port}`);
        }
      }

      if (conflicts.length > 0) {
        console.error(
          '\n================================================================================',
        );
        console.error(' [Amanah Infra] HOST PORT CONFLICT DETECTED');
        console.error(
          '--------------------------------------------------------------------------------',
        );
        console.error(
          'The following host ports are already in use by another process:',
        );
        for (const conflict of conflicts) {
          console.error(`  - ${conflict}`);
        }
        console.error(
          '\nTo resolve this gracefully without editing Docker compose files:',
        );
        console.error('1. Open or create your local .env file');
        console.error(
          '2. Change the conflicting variable to an available port number, for example:',
        );
        for (const conflict of conflicts) {
          const [varName, portStr] = conflict.split('=');
          const altPort = parseInt(portStr, 10) + 10000;
          console.error(`     ${varName}=${altPort}`);
        }
        console.error('3. Rerun: bun run infra:up');
        console.error(
          '================================================================================\n',
        );
        process.exit(1);
      }
    }
  }

  // Gracefully synchronize default URLs when API port or Mailpit port is customized
  const extraEnv: Record<string, string> = {};
  const currentBackendDomain = getInfraValue(
    'BACKEND_DOMAIN',
    `http://localhost:${apiHostPort}`,
  );
  const currentBetterAuthUrl = getInfraValue(
    'BETTER_AUTH_URL',
    `http://localhost:${apiHostPort}`,
  );
  const currentE2eBaseUrl = getInfraValue(
    'E2E_BASE_URL',
    `http://localhost:${apiHostPort}`,
  );
  const currentE2eMailpit = getInfraValue(
    'E2E_MAILPIT_BASE_URL',
    `http://localhost:${mailpitHostPort}`,
  );

  extraEnv.BACKEND_DOMAIN = currentBackendDomain;
  extraEnv.BETTER_AUTH_URL = currentBetterAuthUrl;
  extraEnv.E2E_BASE_URL = currentE2eBaseUrl;
  extraEnv.E2E_MAILPIT_BASE_URL = currentE2eMailpit;

  console.log('[Amanah Infra] Starting containers...');
  const composeArgs = ['up', '-d'];
  if (build) {
    composeArgs.push('--build');
  }

  const exitCode = await runCompose(composeArgs, extraEnv);
  if (exitCode !== 0) {
    console.error(`[Amanah Infra] Docker compose exited with code ${exitCode}`);
    process.exit(exitCode);
  }

  console.log(
    `[Amanah Infra] Waiting for API readiness at http://localhost:${apiHostPort}/health/ready ...`,
  );
  const timeoutSeconds = parseInt(
    getInfraValue('WAIT_TIMEOUT_SECONDS', '60'),
    10,
  );
  const deadline = Date.now() + timeoutSeconds * 1000;
  let isReady = false;
  let lastError = '';

  while (Date.now() < deadline) {
    try {
      const resp = await fetch(
        `http://127.0.0.1:${apiHostPort}/health/ready`,
        { signal: AbortSignal.timeout(4000) },
      );
      if (resp.ok) {
        const body = (await resp.json()) as { status?: string };
        if (body?.status === 'up') {
          isReady = true;
          break;
        }
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!isReady) {
    console.error(
      `\n[Amanah Infra] ERROR: API did not become ready within ${timeoutSeconds}s. Last error: ${lastError}`,
    );
    console.error(
      'Check logs with: bun run infra:logs or docker-compose logs api',
    );
    process.exit(1);
  }

  console.log(
    '\n================================================================================',
  );
  console.log(' [Amanah Infra] Stack is UP and HEALTHY');
  console.log(
    '--------------------------------------------------------------------------------',
  );
  console.log(` - REST API Base URL : http://localhost:${apiHostPort}`);
  console.log(` - Swagger API Docs  : http://localhost:${apiHostPort}/docs`);
  console.log(
    ` - Health Readiness  : http://localhost:${apiHostPort}/health/ready`,
  );
  console.log(` - Mailpit Web UI    : http://localhost:${mailpitHostPort}`);
  console.log(` - Mailpit SMTP Port : localhost:${smtpHostPort}`);
  console.log(` - Adminer DB UI     : http://localhost:${adminerHostPort}`);
  console.log(` - PostgreSQL Host   : localhost:${postgresHostPort}`);
  console.log(` - Redis Host        : localhost:${redisHostPort}`);
  console.log(
    '================================================================================\n',
  );
}

async function handleDown(volumes: boolean) {
  const args = ['down'];
  if (volumes) args.push('-v');
  const code = await runCompose(args);
  process.exit(code);
}

async function handlePs() {
  const code = await runCompose(['ps']);
  process.exit(code);
}

async function handleLogs(service?: string) {
  const args = ['logs', '-f'];
  if (service) args.push(service);
  else args.push('api');
  const code = await runCompose(args);
  process.exit(code);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'up';

  switch (command) {
    case 'up': {
      const build = args.includes('--build') || args.includes('-b');
      const skipPortCheck = args.includes('--skip-port-check');
      await handleUp(build, skipPortCheck);
      break;
    }
    case 'down': {
      const volumes = args.includes('-v') || args.includes('--volumes');
      await handleDown(volumes);
      break;
    }
    case 'ps':
    case 'status': {
      await handlePs();
      break;
    }
    case 'logs': {
      const service = args.find((a) => a !== 'logs' && !a.startsWith('-'));
      await handleLogs(service);
      break;
    }
    default: {
      console.log(`Usage: bun ./scripts/infra/infra.ts [up|down|ps|logs] [options]

Commands:
  up       Start infrastructure containers (with port conflict preflight and health check)
  down     Stop and remove containers
  ps       Show status of containers
  logs     Follow logs (defaults to api container)

Options:
  --build, -b            Rebuild container images on up
  --skip-port-check      Bypass host port conflict preflight check
  -v, --volumes          Remove named volumes on down
`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('[Amanah Infra] Fatal error:', err);
  process.exit(1);
});
