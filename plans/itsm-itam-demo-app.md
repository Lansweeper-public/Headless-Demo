# Plan: ITSM/ITAM Demo Web Application

**Created:** 2026-06-15 | **Status:** Draft | **Effort:** L | **Branch:** main

## Summary

Build a greenfield demo web application mimicking an ITSM SaaS tool with two sections: an ITAM asset inventory (read-only, populated from the Lansweeper Platform API `assetResources` endpoint) and an ITSM ticket management system (CRUD, localStorage-backed). Tickets can be linked to assets by searching and selecting from the ITAM inventory.

## Architecture Context

- **Stack:** React 19 + Vite + TypeScript + Ant Design 5 + Zustand + TanStack Query + graphql-request
- **Data flow:** Assets are NOT pre-fetched. User searches for assets via `assetResources` query with `LIKE` filters on `assetBasicInfo.name`. Results cached per search term in TanStack Query. Tickets stored in Zustand with `persist` middleware (localStorage).
- **Asset fields:** Only 3 displayed: `assetBasicInfo.name`, `assetBasicInfo.type`, `assetCustom.stateName` (plus `key` for identity)
- **Asset-ticket link:** Ticket stores a snapshot of the linked asset (key, name, type, stateName) at link time. No live API call needed on ticket detail view.
- **Routing:** React Router v7, history API. Routes: `/assets`, `/tickets`, `/tickets/new`, `/tickets/:id`, `/tickets/:id/edit`
- **API pagination:** Cursor-based (`FIRST`/`NEXT` + opaque cursor string), max 500 items/page, max 30 field paths per query
- **Project location:** `/Users/diegopacini/LS Integrations Projects/Headless Demo Project`

## Research Findings

- Lansweeper `assetResources` returns flat JSON objects keyed by dotted field paths (e.g., `"assetBasicInfo.name"`)
- `total` field can only be requested on `FIRST` page calls
- Max 30 field paths per query, max 100 filter conditions, max 500 items/page
- Rate limits: 150 req/min, 2000 req/hour
- 17 filterable fields available (name, type, ipAddress, mac, domain, fqdn, serialNumber, manufacturer, model, stateName, location, department, warrantyDate, purchaseDate, key, installKey, userDomain)
- `LIKE` operator available for substring matching on string fields
- Ant Design's `Table`, `Select` (with `showSearch`), `Tag`, `Form`, `Drawer`, and `Layout` components map directly to ITSM UI patterns

## Security Considerations

- Bearer token stored in `.env.local` (gitignored), injected at build time via `VITE_LS_TOKEN`
- Token is client-side visible in network requests — acceptable for demo, not production
- localStorage readable by same-origin scripts — acceptable for demo ticket data

## Performance Considerations

- Assets fetched on-demand per search query, not bulk-loaded; debounce search input (300ms) to avoid excessive API calls
- TanStack Query caches results per search term with `staleTime: 5min`
- Ant Design tree-shaking via ES module imports keeps bundle reasonable
- Zustand persist writes on every mutation — negligible for demo ticket volumes

## Steps

### Step 1: Scaffold project and install dependencies
- **Implement:** Project root — Vite scaffold, dependency installation, folder structure
- **Code:**
```bash
cd "/Users/diegopacini/LS Integrations Projects/Headless Demo Project"
npm create vite@latest . -- --template react-ts
npm install antd @ant-design/icons react-router-dom @tanstack/react-query graphql-request graphql zustand
npm install -D @tanstack/react-query-devtools
```
- **Validation:** `npm run dev` starts without errors

### Step 2: Create project structure and env config
- **Implement:** Create feature folders and env file
- **Code:**
```
src/
  features/
    assets/
      components/
      hooks/
      pages/
      types.ts
    tickets/
      components/
      hooks/
      pages/
      types.ts
  components/          # Shared: AppLayout, Sidebar, StatusTag
  lib/
    lansweeper.ts      # GraphQL client
  store/
    tickets.ts         # Zustand store
  graphql/
    queries.ts         # GQL query strings
  App.tsx
  main.tsx
.env.local             # VITE_LS_TOKEN, VITE_LS_SITE_ID
```
```typescript
// .env.local
VITE_LS_SITE_ID=0bfe97a2-168c-4220-bdf5-15e6f885805b
VITE_LS_TOKEN=eyJhbGciOiJSUzUxMiIs...
```
- **Validation:** Folder structure exists, env vars accessible via `import.meta.env`

### Step 3: App shell with layout and routing
- **Implement:** `src/App.tsx`, `src/components/AppLayout.tsx`, `src/components/Sidebar.tsx`
- **Code:**
```tsx
// src/components/AppLayout.tsx
import { Layout, Menu } from 'antd';
import { LaptopOutlined, FileTextOutlined } from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

const { Sider, Content, Header } = Layout;

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedKey = location.pathname.startsWith('/tickets') ? 'tickets' : 'assets';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={220}>
        <div style={{ padding: '16px', color: '#fff', fontSize: 18, fontWeight: 600 }}>
          IT Service Desk
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={[
            { key: 'assets', icon: <LaptopOutlined />, label: 'Assets (ITAM)' },
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
```
```tsx
// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { AppLayout } from './components/AppLayout';
import { AssetsPage } from './features/assets/pages/AssetsPage';
import { TicketsPage } from './features/tickets/pages/TicketsPage';
import { TicketDetailPage } from './features/tickets/pages/TicketDetailPage';
import { TicketFormPage } from './features/tickets/pages/TicketFormPage';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={{ token: { colorPrimary: '#1677ff' } }}>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/assets" replace />} />
              <Route path="/assets" element={<AssetsPage />} />
              <Route path="/tickets" element={<TicketsPage />} />
              <Route path="/tickets/new" element={<TicketFormPage />} />
              <Route path="/tickets/:id" element={<TicketDetailPage />} />
              <Route path="/tickets/:id/edit" element={<TicketFormPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
```
- **Visual -- requires human verification:** Sidebar renders with dark theme, menu items navigate correctly
- **Validation:** Dev server shows layout with sidebar and content area

### Step 4: Lansweeper GraphQL client and search-driven asset hook
- **Implement:** `src/lib/lansweeper.ts`, `src/graphql/queries.ts`, `src/features/assets/types.ts`, `src/features/assets/hooks/useAssetSearch.ts`
- **Code:**
```typescript
// src/lib/lansweeper.ts
import { GraphQLClient } from 'graphql-request';

export const lansweeperClient = new GraphQLClient(
  'https://api.lansweeper.com/api/v2/graphql',
  { headers: { Authorization: `Bearer ${import.meta.env.VITE_LS_TOKEN}` } }
);
```
```typescript
// src/graphql/queries.ts
export const SEARCH_ASSETS_QUERY = `
  query SearchAssets($siteId: ID!, $limit: Int!, $page: AssetPaginationPage!, $cursor: String, $filters: AssetFilterGroupInput) {
    site(id: $siteId) {
      assetResources(
        assetPagination: { limit: $limit, page: $page, cursor: $cursor }
        fields: [
          "key",
          "assetBasicInfo.name",
          "assetBasicInfo.type",
          "assetCustom.stateName"
        ]
        filters: $filters
      ) {
        total
        pagination { limit current next page }
        items
      }
    }
  }
`;
```
```typescript
// src/features/assets/types.ts
export interface Asset {
  key: string;
  "assetBasicInfo.name": string;
  "assetBasicInfo.type": string;
  "assetCustom.stateName": string;
}

export interface AssetSnapshot {
  key: string;
  name: string;
  type: string;
  stateName: string;
}
```
```typescript
// src/features/assets/hooks/useAssetSearch.ts
import { useQuery } from '@tanstack/react-query';
import { lansweeperClient } from '../../../lib/lansweeper';
import { SEARCH_ASSETS_QUERY } from '../../../graphql/queries';
import type { Asset } from '../types';

const SITE_ID = import.meta.env.VITE_LS_SITE_ID;

export function useAssetSearch(searchTerm: string) {
  return useQuery({
    queryKey: ['assets', 'search', searchTerm],
    enabled: searchTerm.length >= 2,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const filters = {
        conjunction: 'OR',
        conditions: [
          { operator: 'LIKE', path: 'assetBasicInfo.name', value: searchTerm },
          { operator: 'LIKE', path: 'assetBasicInfo.type', value: searchTerm },
          { operator: 'LIKE', path: 'assetCustom.stateName', value: searchTerm },
        ],
      };

      const data: any = await lansweeperClient.request(SEARCH_ASSETS_QUERY, {
        siteId: SITE_ID,
        limit: 50,
        page: 'FIRST',
        cursor: null,
        filters,
      });

      return {
        items: data.site.assetResources.items as Asset[],
        total: data.site.assetResources.total as number,
        nextCursor: data.site.assetResources.pagination.next as string | null,
      };
    },
  });
}
```
- **Constraint:** `enabled: searchTerm.length >= 2` prevents API calls on empty/single-char input
- **Validation:** Call `useAssetSearch("windows")` in a test component, verify API returns filtered results

### Step 5: ITAM Assets page with search-driven table
- **Implement:** `src/features/assets/pages/AssetsPage.tsx`, `src/features/assets/components/AssetTable.tsx`
- **Code:**
```tsx
// src/features/assets/components/AssetTable.tsx
import { Table, Input, Tag, Space, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useState, useCallback } from 'react';
import { useAssetSearch } from '../hooks/useAssetSearch';
import type { Asset } from '../types';

const TYPE_COLORS: Record<string, string> = {
  Windows: 'blue', Linux: 'green', Mac: 'purple',
  'Network Device': 'orange', Mobile: 'cyan',
};
const STATE_COLORS: Record<string, string> = {
  Active: 'green', 'Non-active': 'default', Spare: 'gold',
};

let debounceTimer: ReturnType<typeof setTimeout>;

export function AssetTable() {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const { data, isLoading, isFetching, error } = useAssetSearch(debouncedTerm);

  const handleSearch = useCallback((value: string) => {
    setSearchInput(value);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => setDebouncedTerm(value), 300);
  }, []);

  const columns = [
    { title: 'Name', dataIndex: 'assetBasicInfo.name', sorter: (a: Asset, b: Asset) =>
        (a["assetBasicInfo.name"] || '').localeCompare(b["assetBasicInfo.name"] || '') },
    { title: 'Type', dataIndex: 'assetBasicInfo.type',
      render: (v: string) => <Tag color={TYPE_COLORS[v] || 'default'}>{v || '-'}</Tag> },
    { title: 'State', dataIndex: 'assetCustom.stateName',
      render: (v: string) => <Tag color={STATE_COLORS[v] || 'default'}>{v || '-'}</Tag> },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Input
        placeholder="Search assets by name, type, or state (min 2 characters)..."
        prefix={<SearchOutlined />}
        value={searchInput}
        onChange={e => handleSearch(e.target.value)}
        allowClear
        style={{ maxWidth: 500 }}
      />
      {!debouncedTerm && (
        <Typography.Text type="secondary">
          Enter a search term to find assets from Lansweeper.
        </Typography.Text>
      )}
      {error && (
        <Typography.Text type="danger">Failed to search assets. Check your API token.</Typography.Text>
      )}
      {debouncedTerm.length >= 2 && (
        <Table
          dataSource={data?.items || []}
          columns={columns}
          rowKey="key"
          loading={isLoading || isFetching}
          pagination={{ pageSize: 25, showSizeChanger: true,
            showTotal: () => data?.total != null ? `${data.total} results` : '' }}
          size="middle"
          locale={{ emptyText: 'No assets found for this search.' }}
        />
      )}
    </Space>
  );
}
```
```tsx
// src/features/assets/pages/AssetsPage.tsx
import { Typography } from 'antd';
import { AssetTable } from '../components/AssetTable';

export function AssetsPage() {
  return (
    <>
      <Typography.Title level={3}>IT Asset Inventory</Typography.Title>
      <AssetTable />
    </>
  );
}
```
- **Visual -- requires human verification:** Page starts with empty search prompt, typing 2+ chars triggers API search, results show 3 columns (Name, Type, State) with colored tags
- **Validation:** Navigate to `/assets`, type "windows", table shows filtered results from the API

### Step 6: Ticket types and Zustand store
- **Implement:** `src/features/tickets/types.ts`, `src/store/tickets.ts`
- **Code:**
```typescript
// src/features/tickets/types.ts
import type { AssetSnapshot } from '../assets/types';

export type TicketStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  linkedAsset: AssetSnapshot | null;
  createdAt: string;
  updatedAt: string;
}
```
```typescript
// src/store/tickets.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Ticket, TicketStatus, TicketPriority } from '../features/tickets/types';
import type { AssetSnapshot } from '../features/assets/types'; // { key, name, type, stateName }

interface TicketInput {
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  linkedAsset: AssetSnapshot | null;
}

interface TicketStore {
  tickets: Ticket[];
  createTicket: (input: TicketInput) => Ticket;
  updateTicket: (id: string, updates: Partial<TicketInput>) => void;
  deleteTicket: (id: string) => void;
  getTicket: (id: string) => Ticket | undefined;
}

export const useTicketStore = create<TicketStore>()(
  persist(
    (set, get) => ({
      tickets: [],
      createTicket: (input) => {
        const now = new Date().toISOString();
        const ticket: Ticket = {
          ...input,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ tickets: [ticket, ...s.tickets] }));
        return ticket;
      },
      updateTicket: (id, updates) => set((s) => ({
        tickets: s.tickets.map(t =>
          t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
        ),
      })),
      deleteTicket: (id) => set((s) => ({
        tickets: s.tickets.filter(t => t.id !== id),
      })),
      getTicket: (id) => get().tickets.find(t => t.id === id),
    }),
    { name: 'itsm-demo-tickets' }
  )
);
```
- **Validation:** In browser console: `useTicketStore.getState().createTicket({...})` persists to localStorage

### Step 7: ITSM Ticket List page
- **Implement:** `src/features/tickets/pages/TicketsPage.tsx`, `src/features/tickets/components/TicketTable.tsx`
- **Code:**
```tsx
// src/features/tickets/components/TicketTable.tsx
import { Table, Tag, Space, Button, Select } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import type { Ticket, TicketStatus, TicketPriority } from '../types';

const STATUS_COLORS: Record<TicketStatus, string> = {
  Open: 'blue', 'In Progress': 'orange', Resolved: 'green', Closed: 'default',
};
const PRIORITY_COLORS: Record<TicketPriority, string> = {
  Low: 'default', Medium: 'gold', High: 'orange', Critical: 'red',
};

export function TicketTable({ tickets }: { tickets: Ticket[] }) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'All'>('All');

  const filtered = statusFilter === 'All'
    ? tickets
    : tickets.filter(t => t.status === statusFilter);

  const columns = [
    { title: 'Title', dataIndex: 'title', ellipsis: true,
      render: (v: string, r: Ticket) => <a onClick={() => navigate(`/tickets/${r.id}`)}>{v}</a> },
    { title: 'Status', dataIndex: 'status',
      render: (v: TicketStatus) => <Tag color={STATUS_COLORS[v]}>{v}</Tag> },
    { title: 'Priority', dataIndex: 'priority',
      render: (v: TicketPriority) => <Tag color={PRIORITY_COLORS[v]}>{v}</Tag> },
    { title: 'Linked Asset', dataIndex: ['linkedAsset', 'name'],
      render: (v: string) => v || '-' },
    { title: 'Created', dataIndex: 'createdAt',
      render: (v: string) => new Date(v).toLocaleDateString(),
      sorter: (a: Ticket, b: Ticket) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      defaultSortOrder: 'descend' as const },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/tickets/new')}>
          New Ticket
        </Button>
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 160 }}
          options={[
            { value: 'All', label: 'All Statuses' },
            { value: 'Open', label: 'Open' },
            { value: 'In Progress', label: 'In Progress' },
            { value: 'Resolved', label: 'Resolved' },
            { value: 'Closed', label: 'Closed' },
          ]}
        />
      </Space>
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 20, showTotal: t => `${t} tickets` }}
        size="middle"
        locale={{ emptyText: 'No tickets yet. Create your first ticket!' }}
      />
    </Space>
  );
}
```
- **Visual -- requires human verification:** Ticket table with status/priority tags, filter dropdown, "New Ticket" button, empty state message
- **Validation:** Navigate to `/tickets`, see empty state, filter works

### Step 8: Ticket Create/Edit form with asset linking
- **Implement:** `src/features/tickets/pages/TicketFormPage.tsx`, `src/features/tickets/components/AssetLinkSelect.tsx`
- **Depends on:** Step 4 (useAssetSearch hook), Step 6 (ticket store)
- **Code:**
```tsx
// src/features/tickets/components/AssetLinkSelect.tsx
import { Select } from 'antd';
import { useState, useCallback, useRef } from 'react';
import { useAssetSearch } from '../../assets/hooks/useAssetSearch';
import type { Asset, AssetSnapshot } from '../../assets/types';

function toSnapshot(asset: Asset): AssetSnapshot {
  return {
    key: asset.key,
    name: asset["assetBasicInfo.name"],
    type: asset["assetBasicInfo.type"],
    stateName: asset["assetCustom.stateName"],
  };
}

interface Props {
  value?: AssetSnapshot | null;
  onChange?: (snapshot: AssetSnapshot | null) => void;
}

export function AssetLinkSelect({ value, onChange }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const { data, isLoading, isFetching } = useAssetSearch(searchTerm);
  const assetsRef = useRef<Asset[]>([]);
  if (data?.items) assetsRef.current = data.items;

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const handleSearch = useCallback((val: string) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchTerm(val), 300);
  }, []);

  const options = (assetsRef.current || []).map(a => ({
    value: a.key,
    label: `${a["assetBasicInfo.name"]} (${a["assetBasicInfo.type"]} - ${a["assetCustom.stateName"] || 'unknown'})`,
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
        if (!key) { onChange?.(null); return; }
        const match = assetsRef.current.find(a => a.key === key);
        if (match) onChange?.(toSnapshot(match));
      }}
      filterOption={false}
      notFoundContent={searchTerm.length < 2 ? 'Type at least 2 characters' : 'No assets found'}
      options={options}
      style={{ width: '100%' }}
    />
  );
}
```
```tsx
// src/features/tickets/pages/TicketFormPage.tsx
import { Form, Input, Select, Button, Card, Typography, Space, message } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { useTicketStore } from '../../../store/tickets';
import { AssetLinkSelect } from '../components/AssetLinkSelect';
import type { TicketStatus, TicketPriority } from '../types';

export function TicketFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { createTicket, updateTicket, getTicket } = useTicketStore();
  const existing = id ? getTicket(id) : undefined;
  const isEdit = !!existing;
  const [form] = Form.useForm();

  const onFinish = (values: any) => {
    if (isEdit) {
      updateTicket(id!, values);
      message.success('Ticket updated');
      navigate(`/tickets/${id}`);
    } else {
      const ticket = createTicket({
        ...values,
        status: values.status || 'Open',
        priority: values.priority || 'Medium',
      });
      message.success('Ticket created');
      navigate(`/tickets/${ticket.id}`);
    }
  };

  return (
    <>
      <Typography.Title level={3}>{isEdit ? 'Edit Ticket' : 'New Ticket'}</Typography.Title>
      <Card style={{ maxWidth: 700 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={existing || { status: 'Open', priority: 'Medium', linkedAsset: null }}
        >
          <Form.Item name="title" label="Title" rules={[{ required: true, max: 200 }]}>
            <Input placeholder="Brief summary of the issue" />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder="Describe the issue in detail" />
          </Form.Item>
          <Space size="large">
            <Form.Item name="status" label="Status">
              <Select style={{ width: 160 }} options={
                ['Open', 'In Progress', 'Resolved', 'Closed'].map(s => ({ value: s, label: s }))
              } />
            </Form.Item>
            <Form.Item name="priority" label="Priority">
              <Select style={{ width: 160 }} options={
                ['Low', 'Medium', 'High', 'Critical'].map(p => ({ value: p, label: p }))
              } />
            </Form.Item>
          </Space>
          <Form.Item name="linkedAsset" label="Linked Asset">
            <AssetLinkSelect />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">{isEdit ? 'Update' : 'Create'} Ticket</Button>
            <Button onClick={() => navigate(-1)}>Cancel</Button>
          </Space>
        </Form>
      </Card>
    </>
  );
}
```
- **Visual -- requires human verification:** Form renders correctly, asset search dropdown shows real assets, form validation works
- **Validation:** Create a ticket with a linked asset, verify it appears in the ticket list

### Step 9: Ticket Detail page with delete
- **Implement:** `src/features/tickets/pages/TicketDetailPage.tsx`
- **Depends on:** Step 6 (ticket store)
- **Code:**
```tsx
// src/features/tickets/pages/TicketDetailPage.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Card, Descriptions, Tag, Button, Space, Modal, Empty, message } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTicketStore } from '../../../store/tickets';

export function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getTicket, deleteTicket } = useTicketStore();
  const ticket = getTicket(id!);

  if (!ticket) return <Empty description="Ticket not found" />;

  const handleDelete = () => {
    Modal.confirm({
      title: 'Delete this ticket?',
      content: 'This action cannot be undone.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: () => {
        deleteTicket(ticket.id);
        message.success('Ticket deleted');
        navigate('/tickets');
      },
    });
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<EditOutlined />} onClick={() => navigate(`/tickets/${id}/edit`)}>Edit</Button>
        <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>Delete</Button>
      </Space>
      <Card>
        <Typography.Title level={4}>{ticket.title}</Typography.Title>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="Status"><Tag>{ticket.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="Priority"><Tag>{ticket.priority}</Tag></Descriptions.Item>
          <Descriptions.Item label="Created">{new Date(ticket.createdAt).toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="Updated">{new Date(ticket.updatedAt).toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="Description" span={2}>{ticket.description}</Descriptions.Item>
        </Descriptions>
      </Card>
      {ticket.linkedAsset && (
        <Card title="Linked Asset" style={{ marginTop: 16 }}>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="Name">{ticket.linkedAsset.name}</Descriptions.Item>
            <Descriptions.Item label="Type">{ticket.linkedAsset.type}</Descriptions.Item>
            <Descriptions.Item label="State">{ticket.linkedAsset.stateName || '-'}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </>
  );
}
```
- **Visual -- requires human verification:** Detail page shows ticket fields, linked asset card, edit/delete buttons, delete confirmation modal
- **Validation:** Navigate to `/tickets/:id`, see full details, delete with confirmation

### Step 10: Polish -- theme, empty states, loading states
- **Implement:** Fine-tune Ant Design theme, add loading skeletons, handle API error states gracefully, add a 404 catch-all route
- **Code:**
```tsx
// In App.tsx ConfigProvider, refine theme:
theme={{
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 6,
    fontSize: 14,
  },
}}
```
- **Visual -- requires human verification:** Loading skeletons display during API fetch, error alerts are styled, empty states have call-to-action text, overall UI looks like a professional ITSM tool
- **Validation:** Full manual walkthrough: load assets, create ticket, link asset, view detail, edit, delete

## Acceptance Criteria

- [ ] ITAM: Search-driven asset table — user types a query, API returns filtered results showing Name, Type, State
- [ ] ITAM: No data loaded until user searches (min 2 characters, 300ms debounce)
- [ ] ITSM: Can create, view, edit, and delete tickets
- [ ] Asset linking: Can search and select an asset when creating/editing a ticket (same search-driven API approach)
- [ ] Ticket detail shows linked asset snapshot (name, type, stateName)
- [ ] Tickets persist across browser refresh (localStorage)
- [ ] Error states shown for API failures
- [ ] Empty states shown for no tickets / no search results
- [ ] Delete ticket requires confirmation
- [ ] App looks like a professional ITSM SaaS tool (Ant Design themed)

## Checklist (non-TDD cleanup)

- [ ] No leaked tokens in committed code (`.env.local` is gitignored)
- [ ] Lint clean
- [ ] Console free of warnings/errors
