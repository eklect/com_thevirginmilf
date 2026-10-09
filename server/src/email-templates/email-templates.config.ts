import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { VENTURE } from '../common/venture';

/** 5 MiB, like blog covers; below nginx's `max_body_size` so the app answers, not nginx. */
const DEFAULT_IMAGE_MAX_BYTES = 5_242_880;

/**
 * Where this venture's email templates live, and whether edits are pushed.
 *
 * The root is the `muccico_email_templates` checkout — a git submodule at
 * `server/email_templates`, so `<cwd>/email_templates` in both the dev box
 * (cwd `/var/www/<site>/api`) and production (cwd `…/api/server`). The venture
 * folder inside it is `common/venture.ts`'s constant. Deliberately
 * INSIDE the application directory, which is the opposite of `STORAGE_ROOT`'s
 * rule: these files are meant to be in git, and the submodule is how they get
 * there. Do not route this through `readStorageConfig`.
 *
 * Boots only if `<root>/<venture>/live` exists. A missing submodule (a clone
 * without `--recurse-submodules`) is a setup error worth failing on, not a
 * reason to serve an empty editor.
 */
@Injectable()
export class EmailTemplatesConfig {
  private readonly logger = new Logger(EmailTemplatesConfig.name);

  /** The templates repo checkout. */
  readonly root: string;
  /** This venture's folder name inside it — `com_simplicourt`. */
  readonly venture: string;
  /** `<root>/<venture>`. */
  readonly ventureDir: string;
  readonly imageMaxBytes: number;
  /** Absolute base of the public image URLs: `https://simplicourt.com/api`. */
  readonly publicApiBase: string;
  /**
   * When set, the asset host the image URLs are built on —
   * `https://cdn.mucciandco.com/<alias>`. Unset (the dev box), this API
   * serves them itself at `<publicApiBase>/email-images/<stem>`.
   */
  readonly imageBaseUrl: string | null;

  readonly gitSync: boolean;
  readonly gitSshKey: string | null;
  readonly gitBranch: string;
  readonly gitAuthorName: string;
  readonly gitAuthorEmail: string;

  constructor(config: ConfigService) {
    const str = (name: string, fallback = '') => (config.get<string>(name) ?? '').trim() || fallback;
    const flag = (name: string) => str(name).toLowerCase() === 'true';

    this.root = path.resolve(str('EMAIL_TEMPLATES_ROOT', path.join(process.cwd(), 'email_templates')));
    this.venture = str('EMAIL_TEMPLATES_VENTURE', VENTURE);
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(this.venture)) {
      throw new Error(`EMAIL_TEMPLATES_VENTURE '${this.venture}' is not a venture folder name`);
    }
    this.ventureDir = path.join(this.root, this.venture);
    if (!existsSync(path.join(this.ventureDir, 'live'))) {
      throw new Error(
        `Email templates folder ${this.ventureDir}/live does not exist. The templates repo is a ` +
          'git submodule at server/email_templates — run `git submodule update --init`, or set ' +
          'EMAIL_TEMPLATES_ROOT / EMAIL_TEMPLATES_VENTURE.',
      );
    }

    const max = Number(str('EMAIL_TEMPLATES_IMAGE_MAX_BYTES'));
    this.imageMaxBytes = Number.isInteger(max) && max > 0 ? max : DEFAULT_IMAGE_MAX_BYTES;

    const site = str('PUBLIC_SITE_URL').replace(/\/+$/, '');
    this.publicApiBase = str('EMAIL_TEMPLATES_PUBLIC_API_BASE', `${site}/api`).replace(/\/+$/, '');
    this.imageBaseUrl = str('EMAIL_TEMPLATES_IMAGE_BASE_URL').replace(/\/+$/, '') || null;

    this.gitSync = flag('EMAIL_TEMPLATES_GIT_SYNC');
    this.gitSshKey = str('EMAIL_TEMPLATES_GIT_SSH_KEY') || null;
    this.gitBranch = str('EMAIL_TEMPLATES_GIT_BRANCH', 'master');
    this.gitAuthorName = str('EMAIL_TEMPLATES_GIT_AUTHOR', `${this.venture} email templates`);
    this.gitAuthorEmail = str('EMAIL_TEMPLATES_GIT_EMAIL', `no-reply@${this.venture}.invalid`);

    if (this.gitSync && !existsSync(path.join(this.root, '.git'))) {
      throw new Error(
        `EMAIL_TEMPLATES_GIT_SYNC=true but ${this.root} is not a git checkout this process can ` +
          'use. On the dev box the submodule’s .git points outside the mount: set it false there.',
      );
    }
    if (!this.gitSync) {
      this.logger.warn(
        'EMAIL_TEMPLATES_GIT_SYNC is off — template edits are written to disk and not committed.',
      );
    }
  }
}
