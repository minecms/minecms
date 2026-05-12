import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(here, '..', 'template');

interface CliOptions {
  name: string | null;
  database: 'postgres' | 'mysql' | null;
  installDeps: boolean | null;
  yes: boolean;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  p.intro('  MineCMS · создание нового проекта');

  const projectName = opts.name ?? (await askProjectName(opts.yes));
  if (p.isCancel(projectName)) {
    p.cancel('Отменено.');
    process.exit(0);
  }
  if (!isValidName(projectName)) {
    p.cancel(`Имя «${projectName}» не подходит. Используй буквы, цифры, - и _.`);
    process.exit(1);
  }

  const targetDir = resolve(process.cwd(), projectName);
  await ensureFreshDir(targetDir, opts.yes);

  const database =
    opts.database ?? (opts.yes ? 'postgres' : ((await askDatabase()) as 'postgres' | 'mysql'));
  if (p.isCancel(database)) {
    p.cancel('Отменено.');
    process.exit(0);
  }

  const installDeps =
    opts.installDeps ?? (opts.yes ? true : ((await askInstall()) as boolean));
  if (p.isCancel(installDeps)) {
    p.cancel('Отменено.');
    process.exit(0);
  }

  const scaffoldSpinner = p.spinner();
  scaffoldSpinner.start('Создаю файлы проекта');
  await scaffold({ projectName, targetDir, database });
  scaffoldSpinner.stop(`Файлы готовы → ${targetDir}`);

  if (installDeps) {
    await runInstall(targetDir);
  }

  printNextSteps(projectName, installDeps);
}

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = { name: null, database: null, installDeps: null, yes: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === '--no-install' || arg === '--skip-install') {
      opts.installDeps = false;
      continue;
    }
    if (arg === '--install') {
      opts.installDeps = true;
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

function printHelp(): void {
  process.stdout.write(
    [
      '',
      'Использование:',
      '  pnpm create minecms [имя] [--postgres|--mysql] [--no-install] [-y]',
      '',
      'Опции:',
      '  --postgres, --pg   PostgreSQL (по умолчанию)',
      '  --mysql            MySQL вместо PostgreSQL',
      '  --no-install       Не запускать установку зависимостей',
      '  -y, --yes          Без вопросов, дефолты',
      '  -h, --help         Эта справка',
      '',
    ].join('\n'),
  );
}

async function askProjectName(yes: boolean): Promise<string | symbol> {
  if (yes) return 'my-minecms';
  return p.text({
    message: 'Как назовём проект?',
    placeholder: 'my-minecms',
    defaultValue: 'my-minecms',
    validate(value) {
      const name = value.trim() || 'my-minecms';
      if (!isValidName(name)) return 'Только буквы, цифры, - и _.';
      return undefined;
    },
  });
}

async function askDatabase(): Promise<string | symbol> {
  return p.select({
    message: 'Какая база данных?',
    options: [
      { value: 'postgres', label: 'PostgreSQL 16', hint: 'рекомендуется' },
      { value: 'mysql', label: 'MySQL 8' },
    ],
    initialValue: 'postgres',
  });
}

async function askInstall(): Promise<boolean | symbol> {
  return p.confirm({
    message: 'Установить зависимости сейчас?',
    initialValue: true,
  });
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
    p.cancel(`Папка ${dir} не пуста.`);
    process.exit(1);
  }
  const ok = await p.confirm({
    message: `Папка ${dir} не пуста. Затереть содержимое?`,
    initialValue: false,
  });
  if (p.isCancel(ok) || !ok) {
    p.cancel('Отменено.');
    process.exit(0);
  }
}

async function scaffold(args: {
  projectName: string;
  targetDir: string;
  database: 'postgres' | 'mysql';
}): Promise<void> {
  const { projectName, targetDir, database } = args;

  await cp(templateDir, targetDir, {
    recursive: true,
    force: true,
    filter: (src) => !src.endsWith('/node_modules') && !src.endsWith('.DS_Store'),
  });

  // _gitignore → .gitignore (npm не публикует .gitignore внутри пакетов).
  await renameIfExists(join(targetDir, '_gitignore'), join(targetDir, '.gitignore'));

  const sessionSecret = randomBytes(32).toString('hex');
  const databaseUrl =
    database === 'mysql'
      ? 'mysql://minecms:minecms@localhost:3307/minecms'
      : 'postgres://minecms:minecms@localhost:5433/minecms';

  await patchFile(join(targetDir, 'package.json'), (raw) =>
    raw.replace('"__NAME__"', JSON.stringify(projectName)),
  );

  await writeFile(
    join(targetDir, '.env'),
    [
      `# Сгенерировано create-minecms. Не коммить — секреты внутри.`,
      ``,
      `DATABASE_URL=${databaseUrl}`,
      `DATABASE_DRIVER=${database}`,
      `SESSION_SECRET=${sessionSecret}`,
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
      `DATABASE_DRIVER=${database}`,
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
  const spin = p.spinner();
  spin.start(`Ставлю зависимости через ${pm}`);
  await new Promise<void>((res, rej) => {
    const child = spawn(pm, ['install'], {
      cwd,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    child.on('error', rej);
    child.on('exit', (code) =>
      code === 0 ? res() : rej(new Error(`${pm} install завершился с кодом ${code}`)),
    );
  });
  spin.stop(`Зависимости установлены через ${pm}`);
}

function detectPackageManager(): 'pnpm' | 'npm' | 'yarn' {
  const ua = process.env.npm_config_user_agent ?? '';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  if (ua.startsWith('npm')) return 'npm';
  return 'pnpm';
}

function printNextSteps(projectName: string, installed: boolean): void {
  const lines = [
    `cd ${projectName}`,
    ...(installed ? [] : ['pnpm install']),
    'docker compose up -d',
    'pnpm dev',
  ];
  p.note(lines.join('\n'), 'Дальше');
  p.outro('Studio будет на http://localhost:3001/admin — токен установки подставится автоматически.');
}

main().catch((err) => {
  p.cancel(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
