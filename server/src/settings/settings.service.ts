import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { PageSettingEntity } from './page-setting.entity';
import {
  isNestablePageKey,
  isPageKey,
  isSiteSettingKey,
  PageKey,
  SITE_SETTING_KEYS,
  SiteSettingKey,
} from './settings.keys';
import { SiteSettingEntity } from './site-setting.entity';

export type SiteSettings = Record<SiteSettingKey, string>;

export interface PageSetting {
  key: PageKey;
  enabled: boolean;
  navLabel: string;
  /** The page this hangs under in the nav, or `null` at the top level. */
  parentKey: PageKey | null;
  /** Position among its siblings — within one parent, not across the nav. */
  sortOrder: number;
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(SiteSettingEntity)
    private readonly settings: Repository<SiteSettingEntity>,
    @InjectRepository(PageSettingEntity)
    private readonly pages: Repository<PageSettingEntity>,
  ) {}

  // ---------- site settings ----------

  /** Every key, with `''` for anything unset, so the client never sees `undefined`. */
  async all(): Promise<SiteSettings> {
    const rows = await this.settings.find();
    const byKey = new Map(rows.map((row) => [row.key, row.value ?? '']));
    const result = {} as SiteSettings;
    for (const key of SITE_SETTING_KEYS) result[key] = byKey.get(key) ?? '';
    return result;
  }

  /** The most recent change across every key. */
  async lastUpdated(): Promise<Date | null> {
    const row = await this.settings.findOne({
      where: {},
      order: { updatedAt: 'DESC' },
    });
    return row?.updatedAt ?? null;
  }

  /** Partial write. An unknown key is a 400, not a new row. */
  async update(patch: Record<string, string>): Promise<SiteSettings> {
    const unknown = Object.keys(patch).filter((key) => !isSiteSettingKey(key));
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown setting${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`,
      );
    }
    await this.settings.save(
      Object.entries(patch).map(([key, value]) =>
        this.settings.create({ key, value: value.trim() }),
      ),
    );
    return this.all();
  }

  // ---------- page toggles ----------

  async pageSettings(): Promise<PageSetting[]> {
    const rows = await this.pages.find({ order: { sortOrder: 'ASC' } });
    const known = new Set(rows.filter((row) => isPageKey(row.key)).map((row) => row.key));
    return rows
      .filter((row) => isPageKey(row.key))
      .map((row) => ({
        key: row.key as PageKey,
        enabled: Boolean(row.enabled),
        navLabel: row.navLabel,
        // A parent pointing at a key this build no longer has reads as no
        // parent at all. The alternative is a sub page that vanishes from the
        // nav with nothing on the admin screen to explain it.
        parentKey:
          row.parentKey && known.has(row.parentKey) ? (row.parentKey as PageKey) : null,
        sortOrder: row.sortOrder,
      }));
  }

  async isPageEnabled(key: PageKey): Promise<boolean> {
    const row = await this.pages.findOne({ where: { key } });
    // A page with no row is a page the seed has not reached; it stays open
    // rather than vanishing, because the admin cannot re-enable what they
    // cannot see.
    return row ? Boolean(row.enabled) : true;
  }

  async setPage(
    key: string,
    patch: {
      enabled?: boolean;
      navLabel?: string;
      sortOrder?: number;
      parentKey?: string | null;
    },
  ): Promise<PageSetting[]> {
    if (!isPageKey(key)) throw new BadRequestException(`Unknown page: ${key}`);
    if (key === 'home' && patch.enabled === false) {
      throw new BadRequestException('The home page cannot be switched off.');
    }
    const row =
      (await this.pages.findOne({ where: { key } })) ??
      this.pages.create({ key, enabled: true, navLabel: key, sortOrder: 0, parentKey: null });

    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    if (patch.navLabel !== undefined) row.navLabel = patch.navLabel.trim();
    if (patch.sortOrder !== undefined) row.sortOrder = patch.sortOrder;

    if (patch.parentKey !== undefined) {
      const parentKey = patch.parentKey === null || patch.parentKey === '' ? null : patch.parentKey;
      await this.assertCanReparent(key, parentKey);
      const moved = parentKey !== row.parentKey;
      row.parentKey = parentKey;
      // A page arriving among new siblings goes to the end of them. Keeping
      // its old number would drop it into an arbitrary slot in a list it has
      // never been in, and `sort_order` carries no unique index to stop two
      // rows sharing a place.
      if (moved && patch.sortOrder === undefined) {
        row.sortOrder = await this.nextSortOrder(parentKey, key);
      }
    }

    await this.pages.save(row);
    return this.pageSettings();
  }

  /**
   * The rules that keep the nav one level deep and honest.
   *
   * Every one of them is a case where the write would otherwise be accepted
   * and then quietly do nothing, or produce a nav nobody could navigate.
   */
  private async assertCanReparent(key: PageKey, parentKey: string | null): Promise<void> {
    const children = await this.pages.count({ where: { parentKey: key } });

    if (parentKey === null) return;

    if (!isPageKey(parentKey)) {
      throw new BadRequestException(`Unknown page: ${parentKey}`);
    }
    if (parentKey === key) {
      throw new BadRequestException('A page cannot be its own parent.');
    }
    if (!isNestablePageKey(key) || !isNestablePageKey(parentKey)) {
      throw new BadRequestException(
        'Home, Privacy, Sign up and Account are not in the main navigation, so they cannot be a parent or a sub page.',
      );
    }
    if (children > 0) {
      throw new BadRequestException(
        `This page has ${children} sub page${children > 1 ? 's' : ''} of its own. Move ${children > 1 ? 'those' : 'that one'} out first — the navigation is only one level deep.`,
      );
    }
    const parent = await this.pages.findOne({ where: { key: parentKey } });
    if (parent?.parentKey) {
      throw new BadRequestException(
        'That page is already a sub page. The navigation is only one level deep.',
      );
    }
  }

  /** Last place among one parent's children, ignoring the page being moved. */
  private async nextSortOrder(parentKey: string | null, exclude: string): Promise<number> {
    // `IsNull()`, not `null`: TypeORM reads a bare `null` in a `where` as
    // "no condition on this column" and would match every row.
    const siblings = await this.pages.find({
      where: { parentKey: parentKey === null ? IsNull() : parentKey },
    });
    const taken = siblings.filter((row) => row.key !== exclude).map((row) => row.sortOrder);
    return taken.length ? Math.max(...taken) + 1 : 0;
  }
}
