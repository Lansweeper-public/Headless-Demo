import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Card, Descriptions, Tag, Button, Space, Modal, Empty, message } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTicketStore } from '../../../store/tickets';

const STATUS_COLORS: Record<string, string> = {
  Open: 'blue',
  'In Progress': 'orange',
  Resolved: 'green',
  Closed: 'default',
};

const PRIORITY_COLORS: Record<string, string> = {
  Low: 'default',
  Medium: 'gold',
  High: 'orange',
  Critical: 'red',
};

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
        <Button icon={<EditOutlined />} onClick={() => navigate(`/tickets/${id}/edit`)}>
          Edit
        </Button>
        <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
          Delete
        </Button>
      </Space>
      <Card>
        <Typography.Title level={4}>{ticket.title}</Typography.Title>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="Status">
            <Tag color={STATUS_COLORS[ticket.status]}>{ticket.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Priority">
            <Tag color={PRIORITY_COLORS[ticket.priority]}>{ticket.priority}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Created">
            {new Date(ticket.createdAt).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="Updated">
            {new Date(ticket.updatedAt).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="Description" span={2}>
            {ticket.description}
          </Descriptions.Item>
        </Descriptions>
      </Card>
      {ticket.linkedAsset && (
        <Card title="Linked Asset" style={{ marginTop: 16 }}>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="Name">{ticket.linkedAsset.name}</Descriptions.Item>
            <Descriptions.Item label="Type">{ticket.linkedAsset.type}</Descriptions.Item>
            <Descriptions.Item label="State">
              {ticket.linkedAsset.stateName || '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </>
  );
}
