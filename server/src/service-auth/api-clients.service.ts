import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Repository } from 'typeorm';
import { ApiClientEntity } from './api-client.entity';
import { ServiceScope } from './scopes';

/** What the admin screen and the guard see. Never the secret or its hash. */
export interface ApiClientSummary {
  id: string;
  name: string;
  clientId: string;
  secretLast4: string;
  scopes: string[];
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
}

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

/** How often `last_used_at` is written for one busy key. */
const TOUCH_INTERVAL_MS = 60_000;

/**
 * The keys this venture issues to other servers.
 *
 * `ak_` and `sk_` are MAP's prefixes for the same two things, kept so a key
 * reads the same whichever app printed it. The secret is 32 random bytes; the
 * hash is a plain SHA-256 because the input already has 256 bits of entropy
 * and a slow hash would only slow the guard.
 */
@Injectable()
export class ApiClientsService {
  private readonly lastTouched = new Map<string, number>();

  constructor(
    @InjectRepository(ApiClientEntity)
    private readonly repo: Repository<ApiClientEntity>,
  ) {}

  async list(): Promise<ApiClientSummary[]> {
    const rows = await this.repo.find({ order: { createdAt: 'DESC' } });
    return rows.map(summarize);
  }

  /** Returns the summary AND the secret — the one time anyone sees it. */
  async create(
    name: string,
    scopes: ServiceScope[],
    createdBy: string,
  ): Promise<{ item: ApiClientSummary; secret: string }> {
    const clientId = `ak_${randomBytes(6).toString('hex')}`;
    const secret = `sk_${randomBytes(32).toString('hex')}`;
    const row = this.repo.create({
      id: randomUUID(),
      name: name.trim(),
      clientId,
      secretHash: sha256(secret),
      secretLast4: secret.slice(-4),
      scopes: Array.from(new Set(scopes)),
      createdBy,
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
    });
    const saved = await this.repo.save(row);
    return { item: summarize(saved), secret };
  }

  async revoke(id: string, revokedBy: string): Promise<ApiClientSummary> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No such API key');
    if (!row.revokedAt) {
      row.revokedAt = new Date();
      row.revokedBy = revokedBy;
      await this.repo.save(row);
    }
    return summarize(row);
  }

  /**
   * The row for a presented id + secret, or `null`. A revoked key is `null`
   * too: it must not mint, however correct its secret.
   */
  async authenticate(clientId: string, secret: string): Promise<ApiClientEntity | null> {
    const row = await this.repo.findOne({ where: { clientId } });
    if (!row || row.revokedAt) return null;
    return equals(row.secretHash, sha256(secret)) ? row : null;
  }

  /** The row behind a token's `sub`, revoked or not — the guard decides. */
  findByClientId(clientId: string): Promise<ApiClientEntity | null> {
    return this.repo.findOne({ where: { clientId } });
  }

  /** Records use, at most once a minute per key, and never blocks a request. */
  touchLastUsed(id: string): void {
    const now = Date.now();
    const last = this.lastTouched.get(id) ?? 0;
    if (now - last < TOUCH_INTERVAL_MS) return;
    this.lastTouched.set(id, now);
    void this.repo.update(id, { lastUsedAt: new Date(now) }).catch(() => undefined);
  }
}

export function summarize(row: ApiClientEntity): ApiClientSummary {
  return {
    id: row.id,
    name: row.name,
    clientId: row.clientId,
    secretLast4: row.secretLast4,
    scopes: row.scopes ?? [],
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    revokedBy: row.revokedBy,
  };
}

/** Constant-time, and does not throw on a length mismatch (see service-key.guard.ts). */
function equals(expected: string, presented: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(presented, 'utf8');
  return timingSafeEqual(b, a.length === b.length ? a : b) && a.length === b.length;
}
