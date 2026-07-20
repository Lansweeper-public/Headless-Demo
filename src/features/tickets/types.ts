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
