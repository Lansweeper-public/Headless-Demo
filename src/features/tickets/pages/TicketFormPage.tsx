import { Form, Input, Select, Button, Card, Typography, Space, message } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { useTicketStore } from '../../../store/tickets';
import { AssetLinkSelect } from '../components/AssetLinkSelect';
import type { TicketStatus, TicketPriority } from '../types';
import type { AssetSnapshot } from '../../assets/types';

interface TicketFormValues {
  title: string;
  description: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  linkedAsset: AssetSnapshot | null;
}

export function TicketFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { createTicket, updateTicket, getTicket } = useTicketStore();
  const existing = id ? getTicket(id) : undefined;
  const isEdit = !!existing;
  const [form] = Form.useForm();

  const onFinish = (values: TicketFormValues) => {
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
              <Select
                style={{ width: 160 }}
                options={['Open', 'In Progress', 'Resolved', 'Closed'].map((s) => ({
                  value: s,
                  label: s,
                }))}
              />
            </Form.Item>
            <Form.Item name="priority" label="Priority">
              <Select
                style={{ width: 160 }}
                options={['Low', 'Medium', 'High', 'Critical'].map((p) => ({
                  value: p,
                  label: p,
                }))}
              />
            </Form.Item>
          </Space>
          <Form.Item name="linkedAsset" label="Linked Asset">
            <AssetLinkSelect />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              {isEdit ? 'Update' : 'Create'} Ticket
            </Button>
            <Button onClick={() => navigate(-1)}>Cancel</Button>
          </Space>
        </Form>
      </Card>
    </>
  );
}
