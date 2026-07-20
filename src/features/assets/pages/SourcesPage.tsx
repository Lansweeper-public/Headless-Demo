import { Typography, Card, Table, Tag, Space, Alert, Spin, Empty, Tooltip, Switch, Button, Dropdown, Popconfirm, message } from 'antd';
import { ClusterOutlined, EyeOutlined, DownloadOutlined, DisconnectOutlined, ReloadOutlined, WindowsOutlined, AppleOutlined, LinuxOutlined } from '@ant-design/icons';
import {
  useSourcesWithCounts,
  useDefaultScanningGroup,
  useSetNetworkVisibility,
  useUnlinkSource,
} from '../hooks/useSources';
import { ScanningCredentials } from '../components/ScanningCredentials';
import { useActiveSite } from '../../../store/activeSite';
import { ApiInfo } from '../../../components/ApiInfo';
import type { SourceWithCount } from '../types';

function NetworkVisibilityControl() {
  const { data: group, isLoading } = useDefaultScanningGroup();
  const setVisibility = useSetNetworkVisibility();

  const onToggle = (enabled: boolean) => {
    if (!group) return;
    setVisibility.mutate(
      { groupId: group.id, enabled, maintenanceWindow: group.maintenanceWindow },
      {
        onSuccess: () => message.success(`Network visibility ${enabled ? 'enabled' : 'disabled'}.`),
        onError: (e) => message.error((e as Error).message),
      }
    );
  };

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space align="start" style={{ justifyContent: 'space-between', width: '100%' }}>
        <Space direction="vertical" size={0}>
          <Typography.Text strong><Space size={6}><EyeOutlined />Network visibility <ApiInfo op="networkVisibility" /></Space></Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            When enabled, agents scan the local network for IP assets (set on the site&apos;s default scanning group).
          </Typography.Text>
        </Space>
        {isLoading ? (
          <Spin size="small" />
        ) : group ? (
          <Switch
            checked={group.enabled}
            loading={setVisibility.isPending}
            onChange={onToggle}
            checkedChildren="On"
            unCheckedChildren="Off"
          />
        ) : (
          <Tooltip title="A default scanning group is created after the first agent is installed.">
            <Switch disabled />
          </Tooltip>
        )}
      </Space>
    </Card>
  );
}

const TYPE_LABELS: Record<string, string> = {
  CLOUD: 'Cloud',
  IT: 'IT',
  IT_AGENT: 'IT Agent',
  MANUAL: 'Manual',
  NETWORK_DISCOVERY: 'Network Discovery',
  OT: 'OT',
};

const TYPE_COLORS: Record<string, string> = {
  CLOUD: 'geekblue',
  IT: 'blue',
  IT_AGENT: 'cyan',
  MANUAL: 'default',
  NETWORK_DISCOVERY: 'orange',
  OT: 'purple',
};

export function SourcesPage() {
  const { data, isLoading, isFetching, error, refetch } = useSourcesWithCounts();
  const siteId = useActiveSite((s) => s.siteId);
  const unlinkSource = useUnlinkSource();

  // The endpoint responds with a Content-Disposition attachment, so navigating to it
  // downloads the OS-specific bundle without leaving the page.
  const downloadBundle = (os: 'windows' | 'mac' | 'linux') => {
    if (!siteId) return;
    window.location.href = `/api/install-bundle?siteId=${encodeURIComponent(siteId)}&os=${os}`;
  };

  const columns = [
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (v: string) => <Tag color={TYPE_COLORS[v] || 'default'}>{TYPE_LABELS[v] || v || 'Unknown'}</Tag>,
    },
    {
      title: 'State',
      dataIndex: ['state', 'value'],
      key: 'state',
      render: (v?: string) => v || '-',
    },
    {
      title: 'Source ID',
      dataIndex: 'id',
      key: 'id',
      render: (v: string) => <Typography.Text code copyable={{ text: v }}>{v}</Typography.Text>,
    },
    {
      title: 'Discovery Components',
      key: 'dc',
      align: 'right' as const,
      render: (_: unknown, r: SourceWithCount) => r.discoveryComponents?.length ?? 0,
    },
    {
      title: 'Assets',
      dataIndex: 'assetCount',
      key: 'assetCount',
      align: 'right' as const,
      sorter: (a: SourceWithCount, b: SourceWithCount) => a.assetCount - b.assetCount,
      render: (v: number) => <Tag color={v ? 'green' : 'default'}>{v}</Tag>,
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v?: string) => (v ? new Date(v).toLocaleDateString() : '-'),
    },
    {
      title: <ApiInfo op="unlink" />,
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, r: SourceWithCount) => (
        <Popconfirm
          title="Unlink this source?"
          description="It will be removed from this site. This cannot be undone."
          okText="Unlink"
          okButtonProps={{ danger: true }}
          onConfirm={() =>
            unlinkSource.mutateAsync(r.id).then(
              () => message.success('Source unlinked.'),
              (e) => {
                message.error((e as Error).message);
                return Promise.reject(e);
              }
            )
          }
        >
          <Tooltip title="Unlink source">
            <Button type="text" danger size="small" icon={<DisconnectOutlined />} />
          </Tooltip>
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start" wrap>
        <Typography.Title level={3}>
          <Space><ClusterOutlined />Sources <ApiInfo op="sources" /></Space>
        </Typography.Title>
        <Space>
          <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()}>
            Refresh
          </Button>
          <Tooltip title="Downloads a ZIP with an OS-specific install script and a config pre-linked to this site — running it installs an agent that reports here.">
            <Dropdown
              trigger={['click']}
              disabled={!siteId}
              menu={{
                items: [
                  { key: 'windows', icon: <WindowsOutlined />, label: 'Windows' },
                  { key: 'mac', icon: <AppleOutlined />, label: 'macOS' },
                  { key: 'linux', icon: <LinuxOutlined />, label: 'Linux' },
                ],
                onClick: ({ key }) => downloadBundle(key as 'windows' | 'mac' | 'linux'),
              }}
            >
              <Button type="primary" icon={<DownloadOutlined />} disabled={!siteId}>
                Install a new source
              </Button>
            </Dropdown>
          </Tooltip>
          <ApiInfo op="linkingCode" />
        </Space>
      </Space>
      <Typography.Paragraph type="secondary">
        Installations that discover and scan assets. Assets are correlated to a source via the
        asset&apos;s <Typography.Text code>installationId</Typography.Text> (&rarr; Source&nbsp;ID).
      </Typography.Paragraph>

      <NetworkVisibilityControl />

      <ScanningCredentials />

      {error && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }} message="Failed to load sources" description={(error as Error)?.message || String(error)} />
      )}

      {data && data.uncorrelated > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <Tooltip title="These assets reference an installation that is not returned by the sources query (e.g. manually-created assets).">
              {`${data.uncorrelated} of ${data.totalAssets} assets are not correlated to a listed source.`}
            </Tooltip>
          }
        />
      )}

      <Card size="small">
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
        ) : (
          <Table
            dataSource={data?.sources || []}
            columns={columns}
            rowKey="id"
            size="middle"
            pagination={{ pageSize: 25, showTotal: (t) => `${t} sources` }}
            locale={{ emptyText: <Empty description="No sources on this site." /> }}
          />
        )}
      </Card>
    </>
  );
}
