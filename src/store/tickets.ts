import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Ticket, TicketStatus, TicketPriority } from '../features/tickets/types';
import type { AssetSnapshot } from '../features/assets/types';
import { useActiveSite } from './activeSite';

interface TicketInput {
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  linkedAsset: AssetSnapshot | null;
}

interface TicketStore {
  // Tickets are scoped per site so each site has its own list.
  ticketsBySite: Record<string, Ticket[]>;
  createTicket: (input: TicketInput) => Ticket;
  updateTicket: (id: string, updates: Partial<TicketInput>) => void;
  deleteTicket: (id: string) => void;
  getTicket: (id: string) => Ticket | undefined;
}

const currentSiteId = (): string | undefined => useActiveSite.getState().siteId;

export const useTicketStore = create<TicketStore>()(
  persist(
    (set, get) => ({
      ticketsBySite: {},
      createTicket: (input) => {
        const siteId = currentSiteId();
        if (!siteId) throw new Error('No active site selected.');
        const now = new Date().toISOString();
        const ticket: Ticket = {
          ...input,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({
          ticketsBySite: { ...s.ticketsBySite, [siteId]: [ticket, ...(s.ticketsBySite[siteId] ?? [])] },
        }));
        return ticket;
      },
      updateTicket: (id, updates) =>
        set((s) => {
          const siteId = currentSiteId();
          if (!siteId) return s;
          const list = s.ticketsBySite[siteId] ?? [];
          return {
            ticketsBySite: {
              ...s.ticketsBySite,
              [siteId]: list.map((t) =>
                t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
              ),
            },
          };
        }),
      deleteTicket: (id) =>
        set((s) => {
          const siteId = currentSiteId();
          if (!siteId) return s;
          const list = s.ticketsBySite[siteId] ?? [];
          return { ticketsBySite: { ...s.ticketsBySite, [siteId]: list.filter((t) => t.id !== id) } };
        }),
      getTicket: (id) => {
        const siteId = currentSiteId();
        if (!siteId) return undefined;
        return (get().ticketsBySite[siteId] ?? []).find((t) => t.id === id);
      },
    }),
    {
      name: 'itsm-demo-tickets',
      version: 1,
      // v0 stored a single global `tickets` array (shared across sites); drop it on upgrade.
      migrate: () => ({ ticketsBySite: {} }),
    }
  )
);

// Stable empty reference so the selector doesn't return a new array on every render.
const EMPTY_TICKETS: Ticket[] = [];

/** The active site's tickets — reactive to both the ticket store and the active-site selection. */
export function useSiteTickets(): Ticket[] {
  const siteId = useActiveSite((s) => s.siteId);
  return useTicketStore((s) => (siteId ? s.ticketsBySite[siteId] ?? EMPTY_TICKETS : EMPTY_TICKETS));
}
