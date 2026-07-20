import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { lsRequest } from '../../../lib/lansweeper';
import {
  ASSET_RESOURCES_QUERY,
  DELETE_ASSETS,
  ASSET_TYPES_QUERY,
  ASSET_STATES_QUERY,
  ADD_ASSET,
} from '../../../graphql/queries';
import { useActiveSite } from '../../../store/activeSite';
import type { Asset } from '../types';

export interface NewAssetInput {
  name: string;
  typeKey: string;
  stateKey: string;
  ipAddress?: string;
}

/** Asset types for the create form (label + key). */
export function useAssetTypes() {
  const siteId = useActiveSite((s) => s.siteId);
  return useQuery({
    queryKey: ['asset-types', siteId],
    enabled: !!siteId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const data = await lsRequest<{ orgSite: { assetTypeList: { name: string; assetTypeKey: string }[] } }>(
        ASSET_TYPES_QUERY,
        { siteId }
      );
      return data.orgSite.assetTypeList ?? [];
    },
  });
}

/** Asset states for the create form (label + key). */
export function useAssetStates() {
  const siteId = useActiveSite((s) => s.siteId);
  return useQuery({
    queryKey: ['asset-states', siteId],
    enabled: !!siteId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const data = await lsRequest<{ orgSite: { assetStates: { name: string; assetStateKey: string }[] } }>(
        ASSET_STATES_QUERY,
        { siteId }
      );
      return data.orgSite.assetStates ?? [];
    },
  });
}

/** Create a new asset. */
export function useAddAsset() {
  const siteId = useActiveSite((s) => s.siteId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vals: NewAssetInput) => {
      const input: {
        assetBasicInfo: { name: { value: string }; typeKey: { value: string }; ipAddress?: string };
        assetCustom: { stateKey: { value: string } };
      } = {
        assetBasicInfo: { name: { value: vals.name }, typeKey: { value: vals.typeKey } },
        assetCustom: { stateKey: { value: vals.stateKey } },
      };
      if (vals.ipAddress) input.assetBasicInfo.ipAddress = vals.ipAddress;
      const data = await lsRequest<{ orgSite: { addAsset: { assetBasicInfo: { name: string; type: string } } } }>(
        ADD_ASSET,
        { siteId, input }
      );
      return data.orgSite.addAsset;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', siteId] }),
  });
}

const DELETE_BATCH = 500; // deleteAssets accepts up to 500 keys per call

/** Delete assets by key (chunked to the API's 1000-per-call limit). */
export function useDeleteAssets() {
  const siteId = useActiveSite((s) => s.siteId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (keys: string[]) => {
      let deleted = 0;
      for (let i = 0; i < keys.length; i += DELETE_BATCH) {
        const batch = keys.slice(i, i + DELETE_BATCH);
        const data = await lsRequest<{ orgSite: { deleteAssets: string[] } }>(DELETE_ASSETS, { siteId, keys: batch });
        deleted += (data?.orgSite?.deleteAssets ?? []).length;
      }
      return deleted;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', siteId] }),
  });
}

export function useAssets(searchTerm = '') {
  const siteId = useActiveSite((s) => s.siteId);

  return useQuery({
    queryKey: ['assets', siteId, searchTerm],
    enabled: !!siteId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const filters = searchTerm.length >= 2
        ? {
            conjunction: 'OR',
            conditions: [
              { operator: 'LIKE', path: 'assetBasicInfo.name', value: searchTerm },
              { operator: 'LIKE', path: 'assetBasicInfo.type', value: searchTerm },
              { operator: 'LIKE', path: 'assetCustom.stateName', value: searchTerm },
            ],
          }
        : undefined;

      const allItems: Asset[] = [];
      let cursor: string | undefined;
      let page: 'FIRST' | 'NEXT' = 'FIRST';
      let total = 0;

      while (true) {
        const variables: Record<string, unknown> = { siteId, limit: 500, page };
        if (cursor) variables.cursor = cursor;
        if (filters) variables.filters = filters;

        const data = await lsRequest<{
          orgSite: { assetResources: { total: number; items: Asset[]; pagination: { next?: string } } };
        }>(ASSET_RESOURCES_QUERY, variables);

        const resources = data.orgSite.assetResources;
        allItems.push(...resources.items);

        if (page === 'FIRST') total = resources.total;

        if (allItems.length >= total || resources.items.length < 500) break;

        cursor = resources.pagination.next;
        if (!cursor) break;
        page = 'NEXT';
      }

      return { items: allItems, total };
    },
  });
}
