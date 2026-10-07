import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { EmailTemplatesConfig } from './email-templates.config';

const run = promisify(execFile);

/**
 * Commits and pushes this venture's folder of the templates repo after every
 * change — in production. The repo is the record, and a deploy that refreshes
 * the submodule must never lose an edit somebody made through the app.
 *
 * - Serialised through one promise chain: git is not re-entrant on a working
 *   tree, and two saves a second apart would otherwise race `commit`.
 * - `pull --rebase --autostash` before `push`: every venture pushes to the same
 *   branch, each to its own folder, so a rebase never conflicts; `autostash`
 *   covers a write that lands between `add` and `pull`.
 * - One retry on a rejected push (somebody else pushed in between).
 * - A failure is logged and swallowed. The HTTP write already succeeded — the
 *   file is on disk — and the next change's sync will carry this one with it.
 *
 * The process has no git identity, no HOME and only this key: everything git
 * needs is in the env built here. Off in the dev box (`EMAIL_TEMPLATES_GIT_SYNC`
 * false): the submodule's `.git` there is a gitfile pointing outside the mount,
 * and the developer commits from the host.
 */
@Injectable()
export class GitSyncService {
  private readonly logger = new Logger(GitSyncService.name);
  private chain: Promise<void> = Promise.resolve();
  private readonly env: NodeJS.ProcessEnv;

  constructor(private readonly config: EmailTemplatesConfig) {
    const home = path.join(os.tmpdir(), `home-email-templates-${process.getuid?.() ?? 'app'}`);
    try {
      mkdirSync(home, { recursive: true, mode: 0o700 });
    } catch {
      /* best effort; git only needs it for its own config lookups */
    }
    const ssh = config.gitSshKey
      ? `ssh -i ${config.gitSshKey} -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/etc/ssh/ssh_known_hosts`
      : 'ssh';
    this.env = {
      PATH: process.env.PATH,
      HOME: home,
      GIT_SSH_COMMAND: ssh,
      GIT_AUTHOR_NAME: config.gitAuthorName,
      GIT_AUTHOR_EMAIL: config.gitAuthorEmail,
      GIT_COMMITTER_NAME: config.gitAuthorName,
      GIT_COMMITTER_EMAIL: config.gitAuthorEmail,
      GIT_TERMINAL_PROMPT: '0',
    };
  }

  get enabled(): boolean {
    return this.config.gitSync;
  }

  /** Queues a commit of everything under this venture's folder. Resolves when it has run. */
  commit(message: string): Promise<void> {
    if (!this.config.gitSync) return Promise.resolve();
    this.chain = this.chain
      .then(() => this.sync(message))
      .catch((error: unknown) => {
        this.logger.error(
          `Template sync failed (${message}): ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    return this.chain;
  }

  private async sync(message: string): Promise<void> {
    const folder = `${this.config.venture}/`;
    await this.git('add', '-A', '--', folder);
    const { stdout } = await this.git('status', '--porcelain', '--', folder);
    if (!stdout.trim()) return;
    await this.git('commit', '-q', '-m', `${this.config.venture}: ${message}`);

    const branch = this.config.gitBranch;
    try {
      await this.pushWithRebase(branch);
    } catch (first) {
      this.logger.warn(
        `Push rejected, retrying once: ${first instanceof Error ? first.message : String(first)}`,
      );
      await this.pushWithRebase(branch);
    }
    this.logger.log(`Pushed: ${message}`);
  }

  private async pushWithRebase(branch: string): Promise<void> {
    await this.git('pull', '--rebase', '--autostash', '-q', 'origin', branch);
    await this.git('push', '-q', 'origin', `HEAD:${branch}`);
  }

  private git(...args: string[]) {
    return run('git', ['-C', this.config.root, ...args], {
      env: this.env,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
  }
}
