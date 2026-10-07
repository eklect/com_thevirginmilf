import { api } from './client';

/** A key this site issued to another server. Mirrors `ApiClientSummary` on the server. */
export interface ApiClient {
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

export interface ApiClientListResponse {
  items: ApiClient[];
  /** Every scope a key may carry, for the create form. */
  scopes: string[];
}

/** The staff side — `/api/admin/api-clients`, admins only. */
export const adminApiClients = {
  list: () => api.get<ApiClientListResponse>('/api/admin/api-clients'),
  /** The secret comes back exactly once. */
  create: (input: { name: string; scopes: string[] }) =>
    api.post<{ item: ApiClient; secret: string }>('/api/admin/api-clients', input),
  revoke: async (id: string) => (await api.delete<{ item: ApiClient }>(`/api/admin/api-clients/${id}`)).item,
};
