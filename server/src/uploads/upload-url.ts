/**
 * The browser's path to an uploaded image.
 *
 * nginx serves this API under `/api` on the site's own origin and strips the
 * prefix, so `UploadsController`'s `/uploads/:id` is `/api/uploads/:id` to a
 * visitor. Relative on purpose — same origin in the dev box, behind the Vite
 * proxy and in production alike. Emails are the one place that needs an
 * absolute URL, and they build it from `PUBLIC_SITE_URL`.
 */
export const uploadUrl = (id: string): string => `/api/uploads/${id}`;
