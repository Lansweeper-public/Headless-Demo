import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ActiveSiteState {
  siteId?: string;
  siteName?: string;
  setSite: (siteId: string, siteName?: string) => void;
  clear: () => void;
}

/** The site the user is currently viewing. Persisted so a refresh keeps the selection. */
export const useActiveSite = create<ActiveSiteState>()(
  persist(
    (set) => ({
      siteId: undefined,
      siteName: undefined,
      setSite: (siteId, siteName) => set({ siteId, siteName }),
      clear: () => set({ siteId: undefined, siteName: undefined }),
    }),
    { name: 'ls-active-site' }
  )
);
