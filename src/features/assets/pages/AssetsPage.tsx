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
