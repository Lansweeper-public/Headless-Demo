import { Popover, Typography } from 'antd';
import { InfoCircleOutlined, ApiOutlined } from '@ant-design/icons';
import { API_INFO, type ApiInfoId } from './apiOperations';

/**
 * Small info icon that reveals which Lansweeper Platform API operation powers a piece of the UI,
 * with an example query/mutation and a link to the docs. Purely educational (demo aid).
 */
export function ApiInfo({ op }: { op: ApiInfoId }) {
  const info = API_INFO[op];

  const content = (
    <div style={{ maxWidth: 480 }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        {info.description}
      </Typography.Paragraph>
      <pre
        style={{
          background: '#0d1117',
          color: '#e6edf3',
          padding: 12,
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.5,
          overflowX: 'auto',
          margin: 0,
        }}
      >
        <code>{info.query.trim()}</code>
      </pre>
      <div style={{ marginTop: 8 }}>
        <a href={info.docUrl} target="_blank" rel="noreferrer">
          Lansweeper documentation ↗
        </a>
      </div>
    </div>
  );

  return (
    <Popover
      title={
        <span>
          <ApiOutlined style={{ marginRight: 6 }} />
          {info.title}
        </span>
      }
      content={content}
      trigger="click"
      placement="bottomLeft"
    >
      <InfoCircleOutlined
        style={{ color: '#8c8c8c', cursor: 'pointer', fontSize: 14 }}
        onClick={(e) => e.stopPropagation()}
        aria-label="Which Platform API is used"
      />
    </Popover>
  );
}
