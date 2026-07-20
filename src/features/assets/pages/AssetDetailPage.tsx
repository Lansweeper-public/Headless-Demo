import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography,
  Card,
  Descriptions,
  Table,
  Tag,
  Button,
  Space,
  Spin,
  Empty,
  Alert,
} from 'antd';
import { ArrowLeftOutlined, LaptopOutlined, AppstoreOutlined } from '@ant-design/icons';
import { useAssetDetail } from '../hooks/useAssetDetail';
import { useSources, matchSource } from '../hooks/useSources';
import { ApiInfo } from '../../../components/ApiInfo';
import type { SoftwareItem } from '../types';

const SOURCE_TYPE_LABELS: Record<string, string> = {
  CLOUD: 'Cloud',
  IT: 'IT',
  IT_AGENT: 'IT Agent',
  MANUAL: 'Manual',
  NETWORK_DISCOVERY: 'Network Discovery',
  OT: 'OT',
};

const HW_BASIC_LABELS: Record<string, string> = {
  type: 'Type',
  fqdn: 'FQDN',
  domain: 'Domain',
  ipAddress: 'IP Address',
  mac: 'MAC Address',
  userName: 'User',
  description: 'Description',
  firstSeen: 'First Seen',
  lastSeen: 'Last Seen',
};

const HW_CUSTOM_LABELS: Record<string, string> = {
  stateName: 'State',
  manufacturer: 'Manufacturer',
  model: 'Model',
  serialNumber: 'Serial Number',
  location: 'Location',
  building: 'Building',
  department: 'Department',
  barCode: 'Bar Code',
  purchaseDate: 'Purchase Date',
  warrantyDate: 'Warranty Date',
  comment: 'Comment',
};

function rows(source: Record<string, string | undefined> | undefined, labels: Record<string, string>) {
  if (!source) return [];
  return Object.entries(labels)
    .filter(([k]) => source[k] != null && source[k] !== '')
    .map(([k, label]) => ({ label, value: source[k] as string }));
}

export function AssetDetailPage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const assetKey = key ? decodeURIComponent(key) : undefined;
  const { data: asset, isLoading, error } = useAssetDetail(assetKey);
  const { data: sources } = useSources();

  const back = (
    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/assets')} style={{ marginBottom: 16 }}>
      Back to assets
    </Button>
  );

  if (isLoading) {
    return (
      <>
        {back}
        <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
      </>
    );
  }

  if (error) {
    return (
      <>
        {back}
        <Alert type="error" showIcon message="Failed to load asset" description={(error as Error)?.message || String(error)} />
      </>
    );
  }

  if (!asset) {
    return (
      <>
        {back}
        <Empty description="Asset not found" />
      </>
    );
  }

  const basic = asset.assetBasicInfo ?? {};
  const matchedSource = matchSource(asset, sources ?? []);
  const sourceValue = matchedSource
    ? `${SOURCE_TYPE_LABELS[matchedSource.type ?? ''] ?? matchedSource.type ?? 'Source'} · ${matchedSource.id}`
    : asset.installationId
      ? `Installation ${asset.installationId} (not a listed source)`
      : undefined;
  const hwRows = [
    ...(sourceValue ? [{ label: 'Source', value: sourceValue }] : []),
    ...rows(asset.assetBasicInfo, HW_BASIC_LABELS),
    ...rows(asset.assetCustom, HW_CUSTOM_LABELS),
  ];
  const software = asset.softwares ?? [];

  const softwareColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name', sorter: (a: SoftwareItem, b: SoftwareItem) => (a.name || '').localeCompare(b.name || '') },
    { title: 'Version', dataIndex: 'version', key: 'version' },
    { title: 'Publisher', dataIndex: 'publisher', key: 'publisher' },
    {
      title: 'Last Changed',
      dataIndex: 'lastChanged',
      key: 'lastChanged',
      render: (v?: string) => (v ? new Date(v).toLocaleDateString() : '-'),
    },
  ];

  return (
    <>
      {back}
      <Space align="center" style={{ marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {basic.name || assetKey}
        </Typography.Title>
        {basic.type && <Tag color="blue">{basic.type}</Tag>}
        <ApiInfo op="assetDetail" />
      </Space>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card title={<Space><LaptopOutlined />Hardware</Space>} size="small">
          {hwRows.length ? (
            <Descriptions column={2} bordered size="small">
              {hwRows.map((r) => (
                <Descriptions.Item key={r.label} label={r.label}>{r.value}</Descriptions.Item>
              ))}
            </Descriptions>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No hardware details" />
          )}
        </Card>

        <Card
          title={<Space><AppstoreOutlined />Software</Space>}
          size="small"
          extra={<Typography.Text type="secondary">{software.length} installed</Typography.Text>}
        >
          <Table
            dataSource={software}
            columns={softwareColumns}
            rowKey={(r) => `${r.name}-${r.version}`}
            size="small"
            pagination={software.length > 10 ? { pageSize: 10, showTotal: (t) => `${t} items` } : false}
            locale={{ emptyText: 'No software reported for this asset.' }}
          />
        </Card>
      </Space>
    </>
  );
}
