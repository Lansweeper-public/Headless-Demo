import { Table, Tag, Space, Button, Select } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import type { Ticket, TicketStatus, TicketPriority } from '../types';

const STATUS_COLORS: Record<TicketStatus, string> = {
  Open: 'blue',
  'In Progress': 'orange',
  Resolved: 'green',
  Closed: 'default',
};

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  Low: 'default',
  Medium: 'gold',
  High: 'orange',
  Critical: 'red',
};

export function TicketTable({ tickets }: { tickets: Ticket[] }) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'All'>('All');

  const filtered =
    statusFilter === 'All' ? tickets : tickets.filter((t) => t.status === statusFilter);

  const columns = [
    {
      title: 'Title',
      dataIndex: 'title',
      ellipsis: true,
      render: (v: string, r: Ticket) => (
        <a onClick={() => navigate(`/tickets/${r.id}`)}>{v}</a>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (v: TicketStatus) => <Tag color={STATUS_COLORS[v]}>{v}</Tag>,
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      render: (v: TicketPriority) => <Tag color={PRIORITY_COLORS[v]}>{v}</Tag>,
    },
    {
      title: 'Linked Asset',
      dataIndex: ['linkedAsset', 'name'],
      render: (v: string) => v || '-',
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      render: (v: string) => new Date(v).toLocaleDateString(),
      sorter: (a: Ticket, b: Ticket) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      defaultSortOrder: 'descend' as const,
    },
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
        pagination={{ pageSize: 20, showTotal: (t) => `${t} tickets` }}
        size="middle"
        locale={{ emptyText: 'No tickets yet. Create your first ticket!' }}
      />
    </Space>
  );
}
