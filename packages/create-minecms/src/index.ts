import { randomBytes } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(here, '..', 'template');

interface CliOptions {
  name: string | null;
  database: 'postgres' | 'mysql' | null;
  installDeps: boolean;
  yes: boolean;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  greet();

  const projectName = opts.name ?? (await askProjectName(opts.yes));
  if (!isValidName(projectName)) {
    fail(`Имя проекта «${projectName}» не подходит. Используй только буквы, цифры, -, _, без пробелов.`);
  }

  const targetDir = resolve(process.cwd(), projectName);
  await ensureFreshDir(targetDir, opts.yes);

  const database = opts.database ?? (await askDatabase(opts.yes));

  await scaffold({ projectName, targetDir, database });

  if (opts.installDeps) {
    await runInstall(targetDir);
  }

  printNextSteps(projectName, opts.installDeps);
}

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = { name: null, database: null, installDeps: true, yes: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === '--no-install' || arg === '--skip-install') {
      opts.installDeps = false;
      continue;
    }
    if (arg === '-y' || arg === '--yes') {
      opts.yes = true;
      continue;
    }
    if (arg === '--mysql') {
      opts.database = 'mysql';
      continue;
    }
    if (arg === '--postgres' || arg === '--pg') {
      opts.database = 'postgres';
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }
    if (!opts.name && !arg.startsWith('-')) {
      opts.name = arg;
    }
  }
  return opts;
}

function greet(): void {
  const banner = [
    '',
    '  MineCMS — opensource headless CMS на TypeScript',
    '  https://minecms.ru',
    '',
  ].join('\n');
  process.stdout.write(banner);
}

function printHelp(): void {
  process.stdout.write(
    [
      '',
      'Использование:',
      '  pnpm create minecms [имя] [--postgres|--mysql] [--no-install] [-y]',
      '',
      'Опции:',
      '  --postgres, --pg   Использовать PostgreSQL (по умолчанию)',
      '  --mysql            Использовать MySQL',
      '  --no-install       Не запускать установку зависимостей',
      '  -y, --yes          Не задавать вопросы, использовать дефолты',
      '  -h, --help         Эта справка',
      '',
    ].join('\n'),
  );
}

async function askProjectName(yes: boolean): Promise<string> {
  if (yes) return 'my-minecms';
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question('  Имя проекта (папка): ')).trim();
    return answer.length > 0 ? answer : 'my-minecms';
  } finally {
    rl.close();
  }
}

async function askDatabase(yes: boolean): Promise<'postgres' | 'mysql'> {
  if (yes) return 'postgres';
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question('  База данных [postgres/mysql] (postgres): ')).trim().toLowerCase();
    return answer === 'mysql' || answer === 'm' ? 'mysql' : 'postgres';
  } finally {
    rl.close();
  }
}

function isValidName(name: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,213}$/i.test(name);
}

async function ensureFreshDir(dir: string, yes: boolean): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
    return;
  }
  const entries = await readdir(dir);
  if (entries.length === 0) return;

  if (yes) {
    fail(`Папка ${dir} не пуста.`);
  }
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(`  Папка ${dir} не пуста. Продолжить и затереть содержимое? [y/N] `)).trim().toLowerCase();
    if (answer !== 'y' && answer !== 'yes') {
      fail('Отменено.');
    }
  } finally {
    rl.close();
  }
}

async function scaffold(args: {
  projectName: string;
  targetDir: string;
  database: 'postgres' | 'mysql';
}): Promise<void> {
  const { projectName, targetDir, database } = args;
  process.stdout.write(`\n  Создаю проект в ${targetDir}\n`);

  await cp(templateDir, targetDir, {
    recursive: true,
    force: true,
    filter: (src) => !src.endsWith('/node_modules') && !src.endsWith('.DS_Store'),
  });

  // Файлы вида `_gitignore`, `_env.example` нельзя положить в npm-пакет под
  // настоящими именами (.gitignore блокирует публикацию, .env вырезается
  // npmignore-эвристикой). После копирования переименовываем их обратно.
  await renameIfExists(join(targetDir, '_gitignore'), join(targetDir, '.gitignore'));
  await renameIfExists(join(targetDir, '_env.example'), join(targetDir, '.env.example'));

  const sessionSecret = randomBytes(32).toString('hex');
  const installToken = randomBytes(16).toString('hex');

  const databaseUrl =
    database === 'mysql'
      ? 'mysql://minecms:minecms@localhost:3307/minecms'
      : 'postgres://minecms:minecms@localhost:5433/minecms';
  const databaseDriver = database;

  await patchFile(join(targetDir, 'package.json'), (raw) =>
    raw.replace('"__NAME__"', JSON.stringify(projectName)),
  );

  await writeFile(
    join(targetDir, '.env'),
    [
      `# Сгенерировано create-minecms`,
      `# Не коммить этот файл — секреты внутри.`,
      ``,
      `DATABASE_URL=${databaseUrl}`,
      `DATABASE_DRIVER=${databaseDriver}`,
      `SESSION_SECRET=${sessionSecret}`,
      `INSTALL_TOKEN=${installToken}`,
      `HOST=0.0.0.0`,
      `PORT=3001`,
      `LOG_LEVEL=info`,
      `MINECMS_AUTO_MIGRATE=true`,
      `# CORS для публичного сайта (через запятую)`,
      `# MINECMS_CORS_ORIGINS=http://localhost:3000`,
      ``,
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    join(targetDir, '.env.example'),
    [
      `DATABASE_URL=${databaseUrl}`,
      `DATABASE_DRIVER=${databaseDriver}`,
      `SESSION_SECRET=replace-me-32-chars-minimum-replace-me`,
      `HOST=0.0.0.0`,
      `PORT=3001`,
      `LOG_LEVEL=info`,
      `MINECMS_AUTO_MIGRATE=true`,
      ``,
    ].join('\n'),
    'utf8',
  );

  await patchFile(join(targetDir, 'docker-compose.yml'), (raw) =>
    raw.replace('__DB_SERVICE__', database === 'mysql' ? mysqlService() : postgresService()),
  );

  if (database === 'mysql') {
    await patchFile(join(targetDir, 'minecms.config.ts'), (raw) =>
      raw.replace("driver: 'postgres'", "driver: 'mysql'"),
    );
  }

  // README с проектным именем
  await patchFile(join(targetDir, 'README.md'), (raw) => raw.replaceAll('__NAME__', projectName));
}

function postgresService(): string {
  return [
    'postgres:',
    '    image: postgres:16-alpine',
    '    restart: unless-stopped',
    '    environment:',
    '      POSTGRES_DB: minecms',
    '      POSTGRES_USER: minecms',
    '      POSTGRES_PASSWORD: minecms',
    '    ports:',
    '      - "5433:5432"',
    '    volumes:',
    '      - minecms-db:/var/lib/postgresql/data',
    '    healthcheck:',
    '      test: ["CMD-SHELL", "pg_isready -U minecms -d minecms"]',
    '      interval: 5s',
    '      retries: 10',
  ].join('\n');
}

function mysqlService(): string {
  return [
    'mysql:',
    '    image: mysql:8',
    '    restart: unless-stopped',
    '    environment:',
    '      MYSQL_DATABASE: minecms',
    '      MYSQL_USER: minecms',
    '      MYSQL_PASSWORD: minecms',
    '      MYSQL_ROOT_PASSWORD: root',
    '    ports:',
    '      - "3307:3306"',
    '    volumes:',
    '      - minecms-db:/var/lib/mysql',
    '    healthcheck:',
    '      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]',
    '      interval: 5s',
    '      retries: 10',
  ].join('\n');
}

async function patchFile(path: string, transform: (raw: string) => string): Promise<void> {
  const raw = await readFile(path, 'utf8');
  await writeFile(path, transform(raw), 'utf8');
}

async function renameIfExists(from: string, to: string): Promise<void> {
  if (!existsSync(from)) return;
  await rename(from, to);
}

async function runInstall(cwd: string): Promise<void> {
  const pm = detectPackageManager();
  process.stdout.write(`\n  Устанавливаю зависимости через ${pm}…\n\n`);
  await new Promise<void>((res, rej) => {
    const child = spawn(pm, ['install'], { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', rej);
    child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${pm} install завершился с кодом ${code}`))));
  });
}

function detectPackageManager(): 'pnpm' | 'npm' | 'yarn' {
  const ua = process.env.npm_config_user_agent ?? '';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  if (ua.startsWith('npm')) return 'npm';
  return 'pnpm';
}

function printNextSteps(projectName: string, installed: boolean): void {
  process.stdout.write(
    [
      '',
      '  Готово.',
      '',
      '  Дальше:',
      `    cd ${projectName}`,
      ...(installed ? [] : ['    pnpm install']),
      '    docker compose up -d   # поднять БД',
      '    pnpm dev               # сервер + Studio на http://localhost:3001/admin',
      '',
      '  При первом старте сервер выведет install-token в логе — открой',
      '  http://localhost:3001/admin/install и пройди визард.',
      '',
    ].join('\n'),
  );
}

function fail(msg: string): never {
  process.stderr.write(`\n  ✕ ${msg}\n\n`);
  process.exit(1);
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
