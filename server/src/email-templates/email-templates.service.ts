import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { EmailTemplatesConfig } from './email-templates.config';
import { GitSyncService } from './git-sync.service';
import {
  TemplateFolder,
  assertTemplateName,
  htmlStem,
  parseArchiveFile,
  parseVersionFile,
  TEMPLATE_NAME,
  within,
} from './template-name';

export interface LiveTemplate {
  name: string;
  hasText: boolean;
  htmlBytes: number;
  textBytes: number | null;
  modifiedAt: string;
}

export interface StoredTemplate extends LiveTemplate {
  /** The file name, with extension — what the versions and archive routes take. */
  file: string;
  /** When it was versioned or archived; null for a hand-archived file with no stamp. */
  epoch: number | null;
}

export interface TemplateContent {
  folder: TemplateFolder;
  file: string;
  name: string;
  html: string;
  text: string | null;
  modifiedAt: string;
}

export interface SaveResult {
  created: boolean;
  /** The version file the previous live copy became, when there was one. */
  versioned: string | null;
  item: LiveTemplate;
}

/**
 * The file store: `<venture>/live`, `versions`, `archive`.
 *
 * Every rule the user set is here and nowhere else:
 * - saving over a live template first copies it to `versions/<epoch>-<name>`;
 * - archiving moves it to `archive/Archive-<name>` (`Archive-<epoch>-<name>`
 *   when that name is already taken);
 * - a `.txt` twin follows its `.html` everywhere.
 *
 * Writes go to a temp file then `rename`, so a reader never sees half a
 * template. Every mutation ends by queueing a git commit.
 */
@Injectable()
export class EmailTemplatesService {
  constructor(
    private readonly config: EmailTemplatesConfig,
    private readonly git: GitSyncService,
  ) {}

  dir(folder: TemplateFolder): string {
    return path.join(this.config.ventureDir, folder);
  }

  async listLive(): Promise<LiveTemplate[]> {
    const dir = this.dir('live');
    const items: LiveTemplate[] = [];
    for (const file of await this.readdir(dir)) {
      const name = htmlStem(file);
      if (!name || !TEMPLATE_NAME.test(name)) continue;
      items.push(await this.summarize(dir, name));
    }
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  async listVersions(): Promise<StoredTemplate[]> {
    return this.listStored('versions', (file) => {
      try {
        const { epoch, name } = parseVersionFile(file);
        return { epoch, name };
      } catch {
        return null;
      }
    });
  }

  async listArchive(): Promise<StoredTemplate[]> {
    return this.listStored('archive', (file) => {
      try {
        return parseArchiveFile(file);
      } catch {
        return null;
      }
    });
  }

  async read(folder: TemplateFolder, file: string): Promise<TemplateContent> {
    const stem = this.stemFor(folder, file);
    const dir = this.dir(folder);
    const htmlPath = within(dir, `${stem}.html`);
    const html = await fs.readFile(htmlPath, 'utf8').catch(() => null);
    if (html === null) throw new NotFoundException(`No template '${file}' in ${folder}`);
    const text = await fs.readFile(within(dir, `${stem}.txt`), 'utf8').catch(() => null);
    const stat = await fs.stat(htmlPath);
    return {
      folder,
      file: `${stem}.html`,
      name: folder === 'live' ? stem : folder === 'versions' ? parseVersionFile(`${stem}.html`).name : parseArchiveFile(`${stem}.html`).name,
      html,
      text,
      modifiedAt: stat.mtime.toISOString(),
    };
  }

  /** Create or replace a live template. The old live copy, if any, is versioned first. */
  async save(rawName: string, body: { html: string; text?: string | null }): Promise<SaveResult> {
    const name = assertTemplateName(rawName);
    const live = this.dir('live');
    const htmlPath = within(live, `${name}.html`);
    const textPath = within(live, `${name}.txt`);
    const existed = await exists(htmlPath);

    let versioned: string | null = null;
    if (existed) versioned = await this.versionLive(name);

    await writeAtomic(htmlPath, body.html);
    if (typeof body.text === 'string' && body.text.length) {
      await writeAtomic(textPath, body.text);
    } else {
      await fs.rm(textPath, { force: true });
    }

    void this.git.commit(`${existed ? 'update' : 'create'} ${name}`);
    return { created: !existed, versioned, item: await this.summarize(live, name) };
  }

  /** Moves live templates to the archive. Unknown names are reported, not fatal. */
  async archive(rawNames: string[]): Promise<{ archived: { name: string; file: string }[]; missing: string[] }> {
    const archived: { name: string; file: string }[] = [];
    const missing: string[] = [];
    const live = this.dir('live');
    const archiveDir = this.dir('archive');
    for (const raw of rawNames) {
      const name = assertTemplateName(raw);
      const htmlPath = within(live, `${name}.html`);
      if (!(await exists(htmlPath))) {
        missing.push(name);
        continue;
      }
      let stem = `Archive-${name}`;
      if (await exists(within(archiveDir, `${stem}.html`))) stem = `Archive-${Date.now()}-${name}`;
      await fs.rename(htmlPath, within(archiveDir, `${stem}.html`));
      await moveIfExists(within(live, `${name}.txt`), within(archiveDir, `${stem}.txt`));
      archived.push({ name, file: `${stem}.html` });
    }
    if (archived.length) {
      void this.git.commit(`archive ${archived.map((a) => a.name).join(', ')}`);
    }
    return { archived, missing };
  }

  /** Copies a version back over live. The current live copy is versioned first. */
  async restore(file: string): Promise<SaveResult> {
    const { name } = parseVersionFile(file);
    const versions = this.dir('versions');
    const stem = htmlStem(file)!;
    const srcHtml = within(versions, `${stem}.html`);
    if (!(await exists(srcHtml))) throw new NotFoundException(`No version '${file}'`);
    const live = this.dir('live');
    const existed = await exists(within(live, `${name}.html`));
    const versioned = existed ? await this.versionLive(name) : null;
    await fs.copyFile(srcHtml, within(live, `${name}.html`));
    const srcText = within(versions, `${stem}.txt`);
    if (await exists(srcText)) await fs.copyFile(srcText, within(live, `${name}.txt`));
    else await fs.rm(within(live, `${name}.txt`), { force: true });
    void this.git.commit(`restore ${name} from ${file}`);
    return { created: !existed, versioned, item: await this.summarize(live, name) };
  }

  async deleteStored(folder: 'versions' | 'archive', file: string): Promise<void> {
    const stem = this.stemFor(folder, file);
    const dir = this.dir(folder);
    const htmlPath = within(dir, `${stem}.html`);
    if (!(await exists(htmlPath))) throw new NotFoundException(`No '${file}' in ${folder}`);
    await fs.rm(htmlPath, { force: true });
    await fs.rm(within(dir, `${stem}.txt`), { force: true });
    void this.git.commit(`delete ${folder}/${file}`);
  }

  async status(): Promise<{ venture: string; live: number; versions: number; archive: number; gitSync: boolean }> {
    const [live, versions, archive] = await Promise.all([this.listLive(), this.listVersions(), this.listArchive()]);
    return {
      venture: this.config.venture,
      live: live.length,
      versions: versions.length,
      archive: archive.length,
      gitSync: this.git.enabled,
    };
  }

  // ---------------------------------------------------------------------------

  /** Copies live `<name>` to `versions/<epoch>-<name>` and returns that file name. */
  private async versionLive(name: string): Promise<string> {
    const live = this.dir('live');
    const versions = this.dir('versions');
    let epoch = Date.now();
    while (await exists(within(versions, `${epoch}-${name}.html`))) epoch += 1;
    const stem = `${epoch}-${name}`;
    await fs.copyFile(within(live, `${name}.html`), within(versions, `${stem}.html`));
    const text = within(live, `${name}.txt`);
    if (await exists(text)) await fs.copyFile(text, within(versions, `${stem}.txt`));
    return `${stem}.html`;
  }

  private stemFor(folder: TemplateFolder, file: string): string {
    if (folder === 'live') return assertTemplateName(htmlStem(file) ?? file);
    if (folder === 'versions') parseVersionFile(file);
    else parseArchiveFile(file);
    return htmlStem(file)!;
  }

  private async listStored(
    folder: 'versions' | 'archive',
    parse: (file: string) => { epoch: number | null; name: string } | null,
  ): Promise<StoredTemplate[]> {
    const dir = this.dir(folder);
    const items: StoredTemplate[] = [];
    for (const file of await this.readdir(dir)) {
      const parsed = parse(file);
      if (!parsed) continue;
      const base = await this.summarize(dir, htmlStem(file)!);
      items.push({ ...base, name: parsed.name, file, epoch: parsed.epoch });
    }
    return items.sort((a, b) => (b.epoch ?? 0) - (a.epoch ?? 0) || a.name.localeCompare(b.name));
  }

  private async summarize(dir: string, stem: string): Promise<LiveTemplate> {
    const html = await fs.stat(within(dir, `${stem}.html`));
    const text = await fs.stat(within(dir, `${stem}.txt`)).catch(() => null);
    return {
      name: stem,
      hasText: text !== null,
      htmlBytes: html.size,
      textBytes: text ? text.size : null,
      modifiedAt: html.mtime.toISOString(),
    };
  }

  private async readdir(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') throw new ConflictException(`Folder ${dir} is missing from the templates checkout`);
      throw error;
    });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  }
}

async function exists(file: string): Promise<boolean> {
  return fs
    .access(file)
    .then(() => true)
    .catch(() => false);
}

async function moveIfExists(from: string, to: string): Promise<void> {
  if (await exists(from)) await fs.rename(from, to);
}

async function writeAtomic(file: string, content: string): Promise<void> {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, content, { encoding: 'utf8', mode: 0o644 });
  await fs.rename(tmp, file);
}
