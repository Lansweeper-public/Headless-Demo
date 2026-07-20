import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { lsRequest } from '../../../lib/lansweeper';
import {
  SOURCES_QUERY,
  ASSETS_SOURCE_QUERY,
  SCANNING_GROUPS_QUERY,
  SET_NETWORK_VISIBILITY,
  UNLINK_SOURCES,
} from '../../../graphql/queries';
import { useActiveSite } from '../../../store/activeSite';
import type { Source, SourceWithCount, ScanningGroup } from '../types';

interface AssetSourceRow {
  key: string;
  installationId?: string;
  sourceExternalId?: string;
}

async function fetchSources(siteId: string): Promise<Source[]> {
  const data = await lsRequest<{ orgSite: { sources: { items: Source[] } } }>(SOURCES_QUERY, { siteId });
  return data.orgSite.sources.items ?? [];
}

async function fetchAssetSourceRows(siteId: string): Promise<AssetSourceRow[]> {
  const all: AssetSourceRow[] = [];
  let cursor: string | undefined;
  let page: 'FIRST' | 'NEXT' = 'FIRST';
  while (true) {
    const variables: Record<string, unknown> = { siteId, limit: 500, page };
    if (cursor) variables.cursor = cursor;
    const data = await lsRequest<{
      orgSite: { assetResources: { items: AssetSourceRow[]; pagination?: { next?: string } } };
    }>(ASSETS_SOURCE_QUERY, variables);
    const res = data.orgSite.assetResources;
    all.push(...(res.items ?? []));
    cursor = res.pagination?.next;
    if (!cursor || (res.items?.length ?? 0) < 500) break;
    page = 'NEXT';
  }
  return all;
}

/** Match an asset to a source: installationId -> Source.id, or sourceExternalId -> Source.externalId. */
export function matchSource(
  asset: { installationId?: string; sourceExternalId?: string },
  sources: Source[]
): Source | undefined {
  return sources.find(
    (s) =>
      (!!asset.installationId && asset.installationId === s.id) ||
      (!!s.externalId && asset.sourceExternalId === s.externalId)
  );
}

export function useSources() {
  const siteId = useActiveSite((s) => s.siteId);
  return useQuery({
    queryKey: ['sources', siteId],
    enabled: !!siteId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchSources(siteId as string),
  });
}

/** Sources enriched with the number of assets correlated to each. */
export function useSourcesWithCounts() {
  const siteId = useActiveSite((s) => s.siteId);
  return useQuery({
    queryKey: ['sources-with-counts', siteId],
    enabled: !!siteId,
    staleTime: 30 * 1000,
    // A freshly installed agent's source appears asynchronously; refetch when the page mounts
    // so revisiting Sources picks it up (rather than serving a stale cached list).
    refetchOnMount: 'always',
    queryFn: async (): Promise<{ sources: SourceWithCount[]; uncorrelated: number; totalAssets: number }> => {
      const [sources, rows] = await Promise.all([
        fetchSources(siteId as string),
        fetchAssetSourceRows(siteId as string),
      ]);
      const matchedAssets = new Set<string>();
      const enriched: SourceWithCount[] = sources.map((s) => {
        let assetCount = 0;
        for (const r of rows) {
          if ((r.installationId && r.installationId === s.id) || (s.externalId && r.sourceExternalId === s.externalId)) {
            assetCount++;
            matchedAssets.add(r.key);
          }
        }
        return { ...s, assetCount };
      });
      return { sources: enriched, uncorrelated: rows.length - matchedAssets.size, totalAssets: rows.length };
    },
  });
}

/** Unlink (remove) a source from the site. */
export function useUnlinkSource() {
  const siteId = useActiveSite((s) => s.siteId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sourceId: string) => {
      const data = await lsRequest<{ orgSite: { unlink: (string | null)[] } }>(UNLINK_SOURCES, {
        siteId,
        sourceIds: [sourceId],
      });
      return data.orgSite.unlink ?? [];
    },
    // Remove the source from the cache directly. The backend source list is eventually
    // consistent, so an immediate refetch can still return the just-unlinked source; updating
    // the cache keeps it out of the view without racing that refetch.
    onSuccess: (_result, sourceId) => {
      qc.setQueryData<{ sources: SourceWithCount[]; uncorrelated: number; totalAssets: number }>(
        ['sources-with-counts', siteId],
        (old) => (old ? { ...old, sources: old.sources.filter((s) => s.id !== sourceId) } : old)
      );
      qc.setQueryData<Source[]>(['sources', siteId], (old) =>
        old ? old.filter((s) => s.id !== sourceId) : old
      );
    },
  });
}

export interface DefaultScanningGroup {
  id: string;
  enabled: boolean;
  maintenanceWindow?: string;
}

/** The site's default scanning group — where network visibility is toggled (Method 1). */
export function useDefaultScanningGroup() {
  const siteId = useActiveSite((s) => s.siteId);
  return useQuery({
    queryKey: ['scanning-groups', siteId],
    enabled: !!siteId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<DefaultScanningGroup | null> => {
      const data = await lsRequest<{ orgSite: { scanningGroups: ScanningGroup[] } }>(
        SCANNING_GROUPS_QUERY,
        { siteId }
      );
      const groups = data.orgSite.scanningGroups ?? [];
      const def = groups.find((g) => g.isDefault) ?? groups[0];
      return def
        ? { id: def.id, enabled: !!def.networkVisibility?.enabled, maintenanceWindow: def.maintenanceWindow }
        : null;
    },
  });
}

/**
 * updateScanningGroup requires a maintenanceWindow ({ fromHour, toHour }), but the API
 * returns it as a cron string. Derive the hour range from the cron's hour field so the
 * existing window is preserved when we only mean to toggle network visibility.
 */
function cronHourRange(cron?: string): { fromHour: number; toHour: number } {
  const hourField = (cron ?? '').trim().split(/\s+/)[1] ?? '*';
  const m = hourField.match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!m) return { fromHour: 0, toHour: 23 };
  const fromHour = Number(m[1]);
  return { fromHour, toHour: m[2] !== undefined ? Number(m[2]) : fromHour };
}

/** Enable/disable network visibility on a scanning group (the default one). */
export function useSetNetworkVisibility() {
  const siteId = useActiveSite((s) => s.siteId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupId,
      enabled,
      maintenanceWindow,
    }: {
      groupId: string;
      enabled: boolean;
      maintenanceWindow?: string;
    }) => {
      await lsRequest(SET_NETWORK_VISIBILITY, {
        siteId,
        groupId,
        scanningGroup: {
          networkVisibility: { enabled },
          maintenanceWindow: cronHourRange(maintenanceWindow),
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scanning-groups', siteId] }),
  });
}
