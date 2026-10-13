import { Injectable } from '@nestjs/common';
import { summarizeKinds } from './email-kinds';
import type { EmailKindSummary } from './email-kinds.types';
import { EmailTemplatesConfig } from './email-templates.config';
import { EMAIL_KINDS } from './kinds';

/**
 * The email event registry as the service plane serves it. GENERIC — copied
 * verbatim; the list itself is `kinds.ts`.
 */
@Injectable()
export class EmailKindsService {
  constructor(private readonly config: EmailTemplatesConfig) {}

  list(): Promise<EmailKindSummary[]> {
    return summarizeKinds(this.config.ventureDir, EMAIL_KINDS);
  }
}
