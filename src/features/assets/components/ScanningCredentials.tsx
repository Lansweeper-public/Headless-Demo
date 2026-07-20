import { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Typography,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Popconfirm,
  Alert,
  message,
} from 'antd';
import { KeyOutlined, PlusOutlined, DeleteOutlined, LockOutlined } from '@ant-design/icons';
import { ApiInfo } from '../../../components/ApiInfo';
import {
  useDiscoveryCredentials,
  useCreateCredential,
  useDeleteCredential,
  type DiscoveryCredential,
  type DiscoveryCredentialType,
  type CredentialParameters,
} from '../hooks/useCredentials';

const TYPE_OPTIONS: { value: DiscoveryCredentialType; label: string }[] = [
  { value: 'Windows', label: 'Windows' },
  { value: 'Ssh', label: 'SSH' },
  { value: 'SshCertificate', label: 'SSH Certificate' },
  { value: 'SnmpV1', label: 'SNMP v1' },
  { value: 'SnmpV2', label: 'SNMP v2' },
  { value: 'SnmpV3', label: 'SNMP v3' },
];

const TYPE_LABELS: Record<DiscoveryCredentialType, string> = {
  Windows: 'Windows',
  Ssh: 'SSH',
  SshCertificate: 'SSH Certificate',
  SnmpV1: 'SNMP v1',
  SnmpV2: 'SNMP v2',
  SnmpV3: 'SNMP v3',
};

type CredField = 'login' | 'password' | 'sshKey' | 'passphrase' | 'privacyPassword' | 'authType' | 'protocol' | 'context';

// Which form fields each credential type exposes (mirrors the platform's per-type payloads).
const TYPE_FIELDS: Record<DiscoveryCredentialType, CredField[]> = {
  Windows: ['login', 'password'],
  Ssh: ['login', 'password'],
  SshCertificate: ['login', 'sshKey', 'passphrase'],
  SnmpV1: ['password'],
  SnmpV2: ['password'],
  SnmpV3: ['login', 'password', 'privacyPassword', 'authType', 'protocol', 'context'],
};

const SNMP_AUTH_TYPES = ['None', 'MD5', 'SHA1', 'SHA256', 'SHA384', 'SHA512'];
const SNMP_PROTOCOLS = ['None', 'DES', 'AES128', 'AES192', 'AES256', 'TripleDES'];

interface CredFormValues {
  name: string;
  type: DiscoveryCredentialType;
  isDefault?: boolean;
  login?: string;
  password?: string;
  sshKey?: string;
  passphrase?: string;
  privacyPassword?: string;
  authType?: string;
  protocol?: string;
  context?: string;
}

/** Build the encrypted `secret` payload + non-sensitive `parameters` for a credential type. */
function buildPayload(v: CredFormValues): { secret: Record<string, string>; parameters?: CredentialParameters } {
  const s = (x?: string) => x ?? '';
  switch (v.type) {
    case 'Windows':
    case 'Ssh':
      return { secret: { login: s(v.login), password: s(v.password) }, parameters: { login: s(v.login) } };
    case 'SshCertificate':
      return {
        secret: { login: s(v.login), sshKey: s(v.sshKey), passphrase: s(v.passphrase) },
        parameters: { login: s(v.login) },
      };
    case 'SnmpV1':
    case 'SnmpV2':
      return { secret: { password: s(v.password) } };
    case 'SnmpV3':
      return {
        secret: {
          login: s(v.login),
          password: s(v.password),
          privacyPassword: s(v.privacyPassword),
          protocol: v.protocol ?? 'None',
          context: s(v.context),
          authType: v.authType ?? 'None',
        },
        parameters: {
          login: s(v.login),
          snmpV3AuthType: v.authType ?? 'None',
          snmpV3Context: s(v.context),
          snmpV3Protocol: v.protocol ?? 'None',
        },
      };
  }
}

function CredentialFields({ type }: { type: DiscoveryCredentialType }) {
  const fields = TYPE_FIELDS[type];
  return (
    <>
      {fields.includes('login') && (
        <Form.Item name="login" label="Login" rules={[{ required: true }]}>
          <Input placeholder={type === 'Windows' ? 'DOMAIN\\username' : 'username'} autoComplete="off" />
        </Form.Item>
      )}
      {fields.includes('password') && (
        <Form.Item name="password" label="Password" rules={[{ required: true }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      )}
      {fields.includes('sshKey') && (
        <Form.Item name="sshKey" label="SSH private key" rules={[{ required: true }]}>
          <Input.TextArea rows={4} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" autoComplete="off" />
        </Form.Item>
      )}
      {fields.includes('passphrase') && (
        <Form.Item name="passphrase" label="Key passphrase (optional)">
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      )}
      {fields.includes('privacyPassword') && (
        <Form.Item name="privacyPassword" label="Privacy password (optional)">
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      )}
      {fields.includes('authType') && (
        <Form.Item name="authType" label="Auth type" initialValue="None">
          <Select options={SNMP_AUTH_TYPES.map((v) => ({ value: v, label: v }))} />
        </Form.Item>
      )}
      {fields.includes('protocol') && (
        <Form.Item name="protocol" label="Privacy protocol" initialValue="None">
          <Select options={SNMP_PROTOCOLS.map((v) => ({ value: v, label: v }))} />
        </Form.Item>
      )}
      {fields.includes('context') && (
        <Form.Item name="context" label="Context (optional)">
          <Input autoComplete="off" />
        </Form.Item>
      )}
    </>
  );
}

export function ScanningCredentials() {
  const { data: credentials, isLoading, error } = useDiscoveryCredentials();
  const createCredential = useCreateCredential();
  const deleteCredential = useDeleteCredential();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<CredFormValues>();
  const type = Form.useWatch('type', form) ?? 'Windows';

  const handleCreate = async () => {
    const values = await form.validateFields();
    const { secret, parameters } = buildPayload(values);
    try {
      await createCredential.mutateAsync({
        name: values.name,
        isDefault: !!values.isDefault,
        type: values.type,
        secret,
        parameters,
      });
      message.success(`Credential "${values.name}" saved.`);
      form.resetFields();
      setOpen(false);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, r: DiscoveryCredential) => (
        <Space>
          {v}
          {r.default && <Tag color="blue">default</Tag>}
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'types',
      key: 'types',
      render: (types: DiscoveryCredentialType[]) => (
        <Space size={4} wrap>
          {(types ?? []).map((t) => (
            <Tag key={t}>{TYPE_LABELS[t] ?? t}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Login',
      key: 'login',
      render: (_: unknown, r: DiscoveryCredential) => r.parameters?.login || '-',
    },
    {
      title: '',
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, r: DiscoveryCredential) => (
        <Popconfirm
          title="Delete this credential?"
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={() =>
            deleteCredential.mutateAsync(r.id).then(
              () => message.success('Credential deleted.'),
              (e) => {
                message.error((e as Error).message);
                return Promise.reject(e);
              }
            )
          }
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      title={<Space><KeyOutlined />Scanning credentials <ApiInfo op="credentials" /></Space>}
      extra={
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Add credential
        </Button>
      }
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        Credentials the scanner uses to authenticate to assets. Secrets are encrypted in your browser
        (per discovery component) before being sent, and are never returned by the API.
      </Typography.Paragraph>

      {error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message="Failed to load credentials"
          description={(error as Error)?.message || String(error)}
        />
      )}

      <Table
        dataSource={credentials || []}
        columns={columns}
        rowKey="id"
        size="small"
        loading={isLoading}
        pagination={false}
        locale={{ emptyText: 'No scanning credentials yet.' }}
      />

      <Modal
        title="Add scanning credential"
        open={open}
        onOk={handleCreate}
        onCancel={() => { form.resetFields(); setOpen(false); }}
        okText="Save credential"
        confirmLoading={createCredential.isPending}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          icon={<LockOutlined />}
          style={{ marginBottom: 16 }}
          message="Secrets are encrypted locally (AES-GCM + RSA-OAEP) before leaving this browser."
        />
        <Form form={form} layout="vertical" initialValues={{ type: 'Windows', isDefault: false }} preserve={false}>
          <Form.Item name="name" label="Name" rules={[{ required: true, max: 200 }]}>
            <Input placeholder="e.g. Windows Domain Admin" autoComplete="off" />
          </Form.Item>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
          <CredentialFields type={type} />
          <Form.Item name="isDefault" label="Use as a default credential during scanning" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
