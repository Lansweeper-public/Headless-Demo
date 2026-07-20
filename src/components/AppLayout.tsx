import { Layout, Menu, Typography, Button, Tooltip } from 'antd';
import { LaptopOutlined, FileTextOutlined, ClusterOutlined, SwapOutlined } from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useActiveSite } from '../store/activeSite';
import { Logo } from './Logo';

const { Sider, Content } = Layout;

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const siteName = useActiveSite((s) => s.siteName);
  const siteId = useActiveSite((s) => s.siteId);
  const clear = useActiveSite((s) => s.clear);

  const selectedKey = location.pathname.startsWith('/tickets')
    ? 'tickets'
    : location.pathname.startsWith('/sources')
      ? 'sources'
      : 'assets';

  const switchSite = () => {
    clear();
    navigate('/');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={220}>
        <div style={{ padding: '16px 20px 4px', display: 'flex' }}>
          <Logo height={30} />
        </div>
        <div style={{ padding: '4px 20px 16px', color: '#fff' }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>IT Service Desk</div>
          <Tooltip title={siteId}>
            <Typography.Text style={{ color: '#8c8c8c', fontSize: 12 }} ellipsis>
              {siteName || siteId || '—'}
            </Typography.Text>
          </Tooltip>
          <div style={{ marginTop: 10 }}>
            <Button size="small" icon={<SwapOutlined />} onClick={switchSite} block>
              Switch site
            </Button>
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={[
            { key: 'assets', icon: <LaptopOutlined />, label: 'Assets (ITAM)' },
            { key: 'sources', icon: <ClusterOutlined />, label: 'Sources (ITAM)' },
            { key: 'tickets', icon: <FileTextOutlined />, label: 'Tickets (ITSM)' },
          ]}
          onClick={({ key }) => navigate(`/${key}`)}
        />
      </Sider>
      <Layout>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
