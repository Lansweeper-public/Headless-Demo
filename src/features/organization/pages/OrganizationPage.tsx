import { useNavigate } from 'react-router-dom';
import { Typography, Card, Row, Col, Tag, Empty, Spin, Alert, Space, Tooltip, Button, Dropdown, Popconfirm, message } from 'antd';
import { ClusterOutlined, RightOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useOrgSites, useCreateSite, useDeleteSite, type SiteRegion } from '../hooks/useOrgSites';
import { useActiveSite } from '../../../store/activeSite';
import { Logo } from '../../../components/Logo';
import { ApiInfo } from '../../../components/ApiInfo';

export function OrganizationPage() {
  const navigate = useNavigate();
  const setSite = useActiveSite((s) => s.setSite);
  const { data: sites, isLoading, error } = useOrgSites();
  const createSite = useCreateSite();
  const deleteSite = useDeleteSite();

  const open = (id: string, name: string | null) => {
    setSite(id, name ?? undefined);
    navigate('/assets');
  };

  const handleCreate = (region: SiteRegion) =>
    createSite.mutateAsync(region).then(
      () => message.success(`New site created in ${region.toUpperCase()}.`),
      (e) => message.error((e as Error).message)
    );

  const handleDelete = (id: string) =>
    deleteSite.mutateAsync(id).then(
      () => message.success('Site deleted.'),
      (e) => message.error((e as Error).message)
    );

  return (
    <div style={{ maxWidth: 1000, margin: '48px auto', padding: '0 24px' }}>
      <div style={{ background: '#001529', borderRadius: 12, padding: '32px 36px', marginBottom: 24 }}>
        <Logo height={80} />
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <Typography.Title level={2} style={{ color: '#fff', margin: '24px 0 4px' }}>
              <Space><ClusterOutlined />Organization <ApiInfo op="orgSites" /></Space>
            </Typography.Title>
            <Typography.Paragraph style={{ color: 'rgba(255,255,255,0.65)', margin: 0 }}>
              Select a site to manage its assets, sources, and tickets.
            </Typography.Paragraph>
          </div>
          <Space>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'eu', label: 'EU region' },
                  { key: 'us', label: 'US region' },
                ],
                onClick: ({ key }) => handleCreate(key as SiteRegion),
              }}
            >
              <Button type="primary" icon={<PlusOutlined />} loading={createSite.isPending}>
                Create site
              </Button>
            </Dropdown>
            <ApiInfo op="createSite" />
          </Space>
        </div>
      </div>

      {error && <Alert type="error" showIcon message="Failed to load sites" description={(error as Error).message} />}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 64 }}><Spin size="large" /></div>
      ) : !sites?.length ? (
        <Empty description="No sites in this organization yet. Provision one with scripts/Install-LansweeperItAgent.ps1." />
      ) : (
        <Row gutter={[16, 16]}>
          {sites.map((site) => (
            <Col xs={24} sm={12} lg={8} key={site.id}>
              <Card
                hoverable={site.ok}
                onClick={() => site.ok && open(site.id, site.name)}
                style={{ height: '100%', opacity: site.ok ? 1 : 0.6 }}
                title={
                  <Space wrap>
                    <span>{site.name || 'Unnamed site'}</span>
                    {!site.ok ? (
                      <Tag color="error">unreachable</Tag>
                    ) : site.connected ? (
                      <Tag color="success">connected</Tag>
                    ) : (
                      <Tooltip title="No local credentials — a site token is minted on demand when you open it.">
                        <Tag color="processing">auto-connect</Tag>
                      </Tooltip>
                    )}
                  </Space>
                }
                extra={
                  <Space size={4} onClick={(e) => e.stopPropagation()}>
                    <Popconfirm
                      title="Delete this site?"
                      description={<span>This permanently deletes the site and its data. <ApiInfo op="deleteSite" /></span>}
                      okText="Delete"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => handleDelete(site.id)}
                    >
                      <Tooltip title="Delete site">
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                      </Tooltip>
                    </Popconfirm>
                    {site.ok && <RightOutlined />}
                  </Space>
                }
              >
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Typography.Text type="secondary" copyable={{ text: site.id }} style={{ fontSize: 12 }}>
                    {site.id}
                  </Typography.Text>
                  <Space size={4} wrap>
                    {site.region && <Tag>{site.region.toUpperCase()}</Tag>}
                    {site.createdAt && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        created {new Date(site.createdAt).toLocaleDateString()}
                      </Typography.Text>
                    )}
                  </Space>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
