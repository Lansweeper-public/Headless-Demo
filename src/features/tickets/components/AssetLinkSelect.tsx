import { Select } from 'antd';
import { useState, useCallback, useRef } from 'react';
import { useAssets } from '../../assets/hooks/useAssets';
import type { Asset, AssetSnapshot } from '../../assets/types';

function toSnapshot(asset: Asset): AssetSnapshot {
  return {
    key: asset.key,
    name: asset.assetBasicInfo?.name || '',
    type: asset.assetBasicInfo?.type || '',
    stateName: asset.assetCustom?.stateName || '',
  };
}

interface Props {
  value?: AssetSnapshot | null;
  onChange?: (snapshot: AssetSnapshot | null) => void;
}

export function AssetLinkSelect({ value, onChange }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const { data, isLoading, isFetching } = useAssets(searchTerm);
  const assets = data?.items ?? [];

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearch = useCallback((val: string) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchTerm(val), 300);
  }, []);

  const options = assets.map((a) => ({
    value: a.key,
    label: `${a.assetBasicInfo?.name || '?'} (${a.assetBasicInfo?.type || '?'} - ${a.assetCustom?.stateName || 'unknown'})`,
  }));

  return (
    <Select
      showSearch
      allowClear
      placeholder="Type to search assets..."
      loading={isLoading || isFetching}
      value={value?.key || undefined}
      onSearch={handleSearch}
      onChange={(key) => {
        if (!key) {
          onChange?.(null);
          return;
        }
        const match = assets.find((a) => a.key === key);
        if (match) onChange?.(toSnapshot(match));
      }}
      filterOption={false}
      notFoundContent={isLoading ? 'Loading...' : 'No assets found'}
      options={options}
      style={{ width: '100%' }}
    />
  );
}
