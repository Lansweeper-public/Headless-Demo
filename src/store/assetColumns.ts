import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** All toggleable date columns on the ITAM table, in the order they should appear. */
export const DATE_COLUMN_KEYS = [
  'lastUpdated',
  'lastChanged',
  'lastSeen',
  'lastActiveScan',
  'lastLsAgent',
  'lastPerformanceScan',
  'lastIpScan',
  'lastScheduled',
] as const;

export type DateColumnKey = (typeof DATE_COLUMN_KEYS)[number];

/** Columns shown until the user customizes the selection. */
const DEFAULT_VISIBLE: DateColumnKey[] = ['lastUpdated', 'lastSeen'];

interface AssetColumnState {
  visibleDateColumns: DateColumnKey[];
  setVisibleDateColumns: (cols: DateColumnKey[]) => void;
}

/** Which date columns the ITAM table shows. Persisted so the choice survives a refresh. */
export const useAssetColumns = create<AssetColumnState>()(
  persist(
    (set) => ({
      visibleDateColumns: DEFAULT_VISIBLE,
      setVisibleDateColumns: (cols) =>
        // Keep the canonical column order regardless of the order they were picked.
        set({ visibleDateColumns: DATE_COLUMN_KEYS.filter((k) => cols.includes(k)) }),
    }),
    { name: 'ls-asset-date-columns' }
  )
);
