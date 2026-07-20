import { useQuery } from '@tanstack/react-query';
import { lsRequest } from '../../../lib/lansweeper';
import { ASSET_DETAIL_QUERY } from '../../../graphql/queries';
import { useActiveSite } from '../../../store/activeSite';
import type { AssetDetail } from '../types';

/**
 * Detail for a single asset: hardware (assetBasicInfo + assetCustom) and the
 * asset's installed software (the per-asset `softwares` field on assetResources).
 */
export function useAssetDetail(key: string | undefined) {
  const siteId = useActiveSite((s) => s.siteId);
  return useQuery({
    queryKey: ['asset-detail', siteId, key],
    enabled: !!key && !!siteId,
    queryFn: async () => {
      const data = await lsRequest<{ orgSite: { assetResources: { items: AssetDetail[] } } }>(
        ASSET_DETAIL_QUERY,
        { siteId, key }
      );
      const items = data.orgSite.assetResources.items ?? [];
      return items[0] ?? null;
    },
  });
}
