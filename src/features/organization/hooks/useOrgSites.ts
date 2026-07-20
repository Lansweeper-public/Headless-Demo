import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface OrgSite {
  id: string;
  name: string | null;
  /** Live in the org's site list AND we hold local credentials to operate on it. */
  connected: boolean;
  /** Connected and a per-site token could be minted (site data is reachable). */
  ok: boolean;
  region: string | null;
  createdAt: string | null;
}

/**
 * Lists every site in the organization from the dev server's /api/sites endpoint,
 * which is backed by the platform `orgSites` query. Sites without local credentials
 * are still listed but flagged `connected: false`.
 */
export function useOrgSites() {
  return useQuery({
    queryKey: ['org-sites'],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<OrgSite[]> => {
      const res = await fetch('/api/sites');
      if (!res.ok) throw new Error(`Failed to load sites (${res.status})`);
      return (await res.json()) as OrgSite[];
    },
  });
}

export type SiteRegion = 'eu' | 'us';

/** Create a new site in the organization (createOrgSite) in the given region, then refresh. */
export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (region: SiteRegion): Promise<{ id: string }> => {
      const res = await fetch('/api/create-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `Failed to create site (${res.status})`);
      return body as { id: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-sites'] }),
  });
}

/** Delete a site from the organization (deleteOrgSite), then remove it from the list. */
export function useDeleteSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (siteId: string): Promise<{ id: string }> => {
      const res = await fetch('/api/delete-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `Failed to delete site (${res.status})`);
      return body as { id: string };
    },
    // Drop it from the cache directly: the org site list is eventually consistent, so an
    // immediate refetch can still include the just-deleted site.
    onSuccess: (_result, siteId) =>
      qc.setQueryData<OrgSite[]>(['org-sites'], (old) => (old ? old.filter((s) => s.id !== siteId) : old)),
  });
}
