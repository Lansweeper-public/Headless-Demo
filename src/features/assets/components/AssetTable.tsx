import { Table, Input, Tag, Space, Typography, Button, Modal, message, Popover, Checkbox } from 'antd';
import { SearchOutlined, DeleteOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import { useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssets, useDeleteAssets } from '../hooks/useAssets';
import { CreateAssetModal } from './CreateAssetModal';
import { useAssetColumns, DATE_COLUMN_KEYS, type DateColumnKey } from '../../../store/assetColumns';
import { ApiInfo } from '../../../components/ApiInfo';
import type { Asset } from '../types';

const TYPE_COLORS: Record<string, string> = {
  Windows: 'blue',
  Linux: 'green',
  Mac: 'purple',
  Android: 'lime',
  'Network Device': 'orange',
  Mobile: 'cyan',
};

const STATE_COLORS: Record<string, string> = {
  Active: 'green',
  'Non-active': 'default',
  Spare: 'gold',
};

const STALE_DAYS = 2;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

const fmtDate = (v?: string) => (v ? new Date(v).toLocaleString() : '-');

/** Title + value accessor for each toggleable date column. */
const DATE_COLUMN_META: Record<DateColumnKey, { title: string; get: (a: Asset) => string | undefined }> = {
  lastUpdated: { title: 'Last Updated', get: (a) => a.assetBasicInfo?.lastUpdated },
  lastChanged: { title: 'Last Changed', get: (a) => a.assetCustom?.lastChanged },
  lastSeen: { title: 'Last Seen', get: (a) => a.assetBasicInfo?.lastSeen },
  lastActiveScan: { title: 'Last Active Scan', get: (a) => a.assetBasicInfo?.lastActiveScan },
  lastLsAgent: { title: 'Last LS Agent', get: (a) => a.assetBasicInfo?.lastLsAgent },
  lastPerformanceScan: { title: 'Last Performance Scan', get: (a) => a.assetBasicInfo?.lastPerformanceScan },
  lastIpScan: { title: 'Last IP Scan', get: (a) => a.assetBasicInfo?.lastIpScan },
  lastScheduled: { title: 'Last Scheduled', get: (a) => a.assetBasicInfo?.lastScheduled },
};

export function AssetTable() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const { data, isLoading, isFetching, error } = useAssets(debouncedTerm);
  const deleteAssets = useDeleteAssets();
  const [createOpen, setCreateOpen] = useState(false);
  const visibleDateColumns = useAssetColumns((s) => s.visibleDateColumns);
  const setVisibleDateColumns = useAssetColumns((s) => s.setVisibleDateColumns);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearch = useCallback((value: string) => {
    setSearchInput(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedTerm(value), 300);
  }, []);

  const items = data?.items ?? [];
  // Staleness threshold captured once at mount (Date.now() is impure — keep it out of render).
  const [cutoff] = useState(() => Date.now() - STALE_MS);
  const staleKeys = items
    .filter((a) => a.assetBasicInfo?.lastSeen && new Date(a.assetBasicInfo.lastSeen).getTime() < cutoff)
    .map((a) => a.key);

  const confirmDeleteStale = () => {
    if (!staleKeys.length) {
      message.info(`No assets last seen more than ${STALE_DAYS} days ago.`);
      return;
    }
    Modal.confirm({
      title: `Delete ${staleKeys.length} stale asset${staleKeys.length > 1 ? 's' : ''}?`,
      content: `This permanently deletes every asset last seen more than ${STALE_DAYS} days ago. This cannot be undone.`,
      okText: `Delete ${staleKeys.length}`,
      okButtonProps: { danger: true },
      onOk: () =>
        deleteAssets.mutateAsync(staleKeys).then(
          (n) => message.success(`Deleted ${n} asset${n === 1 ? '' : 's'}.`),
          (e) => {
            message.error((e as Error).message);
            return Promise.reject(e);
          }
        ),
    });
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: ['assetBasicInfo', 'name'],
      sorter: (a: Asset, b: Asset) =>
        (a.assetBasicInfo?.name || '').localeCompare(b.assetBasicInfo?.name || ''),
    },
    {
      title: 'Type',
      dataIndex: ['assetBasicInfo', 'type'],
      render: (v: string) => <Tag color={TYPE_COLORS[v] || 'default'}>{v || '-'}</Tag>,
    },
    {
      title: 'State',
      dataIndex: ['assetCustom', 'stateName'],
      render: (v: string) => <Tag color={STATE_COLORS[v] || 'default'}>{v || '-'}</Tag>,
    },
    // Date columns are user-selectable; render them in canonical order, skipping hidden ones.
    ...visibleDateColumns.map((key) => {
      const meta = DATE_COLUMN_META[key];
      return {
        title: meta.title,
        key,
        defaultSortOrder: key === 'lastSeen' ? ('ascend' as const) : undefined,
        sorter: (a: Asset, b: Asset) =>
          new Date(meta.get(a) || 0).getTime() - new Date(meta.get(b) || 0).getTime(),
        render: (_: unknown, record: Asset): ReactNode => {
          const v = meta.get(record);
          if (key === 'lastSeen') {
            const stale = v ? new Date(v).getTime() < cutoff : false;
            return <span style={{ color: stale ? '#cf1322' : undefined }}>{fmtDate(v)}</span>;
          }
          return fmtDate(v);
        },
      };
    }),
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Space>
          <Input
            placeholder="Search assets by name, type, or state..."
            prefix={<SearchOutlined />}
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            allowClear
            style={{ maxWidth: 500, width: 360 }}
          />
          <ApiInfo op="assets" />
        </Space>
        <Space>
          <Popover
            trigger="click"
            placement="bottomRight"
            title="Date columns"
            content={
              <Checkbox.Group
                value={visibleDateColumns}
                onChange={(vals) => setVisibleDateColumns(vals as DateColumnKey[])}
                options={DATE_COLUMN_KEYS.map((key) => ({ label: DATE_COLUMN_META[key].title, value: key }))}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              />
            }
          >
            <Button icon={<SettingOutlined />}>Columns</Button>
          </Popover>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            New asset
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            loading={deleteAssets.isPending}
            disabled={!staleKeys.length}
            onClick={confirmDeleteStale}
          >
            Delete stale (&gt;{STALE_DAYS}d){staleKeys.length ? ` · ${staleKeys.length}` : ''}
          </Button>
          <ApiInfo op="deleteAssets" />
        </Space>
      </Space>
      <CreateAssetModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {error && (
        <Typography.Text type="danger">
          Failed to load assets: {(error as Error)?.message || String(error)}
        </Typography.Text>
      )}
      <Table
        dataSource={items}
        columns={columns}
        rowKey="key"
        loading={isLoading || isFetching || deleteAssets.isPending}
        onRow={(record: Asset) => ({
          onClick: () => navigate(`/assets/${encodeURIComponent(record.key)}`),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          pageSize: 25,
          showSizeChanger: true,
          showTotal: (t) => `${t} assets`,
        }}
        size="middle"
        locale={{ emptyText: 'No assets found.' }}
      />
    </Space>
  );
}
