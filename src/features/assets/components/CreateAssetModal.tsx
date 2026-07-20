import { Modal, Form, Input, Select, Space, message } from 'antd';
import { useAssetTypes, useAssetStates, useAddAsset, type NewAssetInput } from '../hooks/useAssets';
import { ApiInfo } from '../../../components/ApiInfo';

export function CreateAssetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<NewAssetInput>();
  const { data: types, isLoading: typesLoading } = useAssetTypes();
  const { data: states, isLoading: statesLoading } = useAssetStates();
  const addAsset = useAddAsset();

  const handleOk = async () => {
    const values = await form.validateFields();
    try {
      const created = await addAsset.mutateAsync(values);
      message.success(`Created asset "${created?.assetBasicInfo?.name ?? values.name}".`);
      form.resetFields();
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Modal
      title={<Space>Create new asset <ApiInfo op="addAsset" /></Space>}
      open={open}
      onOk={handleOk}
      onCancel={() => { form.resetFields(); onClose(); }}
      okText="Create"
      confirmLoading={addAsset.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }, { max: 80 }]}>
          <Input placeholder="e.g. WEB-SERVER-01" autoFocus />
        </Form.Item>

        <Form.Item name="typeKey" label="Type" rules={[{ required: true, message: 'Type is required' }]}>
          <Select
            showSearch
            loading={typesLoading}
            placeholder="Select an asset type"
            optionFilterProp="label"
            options={(types ?? []).map((t) => ({ label: t.name, value: t.assetTypeKey }))}
          />
        </Form.Item>

        <Form.Item name="stateKey" label="State" rules={[{ required: true, message: 'State is required' }]}>
          <Select
            showSearch
            loading={statesLoading}
            placeholder="Select a state"
            optionFilterProp="label"
            options={(states ?? []).map((s) => ({ label: s.name, value: s.assetStateKey }))}
          />
        </Form.Item>

        <Form.Item
          name="ipAddress"
          label="IP Address"
          rules={[{ pattern: /^(\d{1,3}\.){3}\d{1,3}$/, message: 'Enter a valid IPv4 address' }]}
        >
          <Input placeholder="(optional) e.g. 192.168.1.10" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
