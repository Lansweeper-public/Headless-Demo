import { Typography } from 'antd';
import { useSiteTickets } from '../../../store/tickets';
import { TicketTable } from '../components/TicketTable';

export function TicketsPage() {
  const tickets = useSiteTickets();

  return (
    <>
      <Typography.Title level={3}>Tickets</Typography.Title>
      <TicketTable tickets={tickets} />
    </>
  );
}
