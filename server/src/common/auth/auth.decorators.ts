import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ADMIN_ONLY_KEY = 'auth:adminOnly';

/**
 * No session required.
 *
 * The guard still reads the cookie on a public route and attaches
 * `request.user` when there is one — so `GET /auth/me` can answer, and an
 * admin can preview a page they have switched off — it just never refuses.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Admins of this application only.
 *
 * "Admin" is MAP's decision, read from the token: `roles` resolved for this
 * application contains `admin`, or `global_admin` is true. There is no local
 * admin table and no way to become one here.
 */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY_KEY, true);
