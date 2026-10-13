// GENERIC — copied verbatim into every venture backend.
//
// `npm run email-templates:seed [-- --dry-run] [-- --force]`
//
// Writes `live/<kind>.html` + `.txt` for every kind in `EMAIL_KINDS` that has
// no live pair yet, from the built-in TypeScript template with `{{placeholder}}`
// tokens in place of values. Needs no database and no Nest app: it resolves the
// venture folder the same way `EmailTemplatesConfig` does (EMAIL_TEMPLATES_ROOT,
// default `<cwd>/email_templates`; EMAIL_TEMPLATES_VENTURE, default VENTURE).
//
//   --dry-run   list what would be written, write nothing
//   --force     overwrite existing live files (each is in git, so recoverable)
import 'dotenv/config';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { VENTURE } from '../common/venture';
import { seedLiveTemplates } from '../email-templates/email-kinds';
import { EMAIL_KINDS } from '../email-templates/kinds';

async function main(): Promise<number> {
  const args = new Set(process.argv.slice(2));
  const unknown = [...args].filter(
    (arg) => arg !== '--force' && arg !== '--dry-run',
  );
  if (unknown.length) {
    console.error(
      `Unknown option(s): ${unknown.join(' ')}. Use --dry-run and/or --force.`,
    );
    return 2;
  }
  const env = (name: string, fallback: string) =>
    (process.env[name] ?? '').trim() || fallback;
  const root = path.resolve(
    env('EMAIL_TEMPLATES_ROOT', path.join(process.cwd(), 'email_templates')),
  );
  const venture = env('EMAIL_TEMPLATES_VENTURE', VENTURE);
  const ventureDir = path.join(root, venture);
  if (!existsSync(path.join(ventureDir, 'live'))) {
    console.error(
      `${ventureDir}/live does not exist — run \`git submodule update --init\`, or set EMAIL_TEMPLATES_ROOT.`,
    );
    return 1;
  }

  const dryRun = args.has('--dry-run');
  const results = await seedLiveTemplates(ventureDir, EMAIL_KINDS, {
    force: args.has('--force'),
    dryRun,
  });
  console.log(`${dryRun ? '[dry run] ' : ''}${ventureDir}/live`);
  for (const { kind, action } of results) {
    const note =
      action === 'partial'
        ? ' (only one of .html/.txt exists — use --force to replace both)'
        : '';
    console.log(`  ${action.padEnd(15)} ${kind}${note}`);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
