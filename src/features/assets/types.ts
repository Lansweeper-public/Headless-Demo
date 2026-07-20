export interface Asset {
  key: string;
  assetBasicInfo: {
    name: string;
    type: string;
    lastUpdated?: string;
    lastSeen?: string;
    lastActiveScan?: string;
    lastLsAgent?: string;
    lastPerformanceScan?: string;
    lastIpScan?: string;
    lastScheduled?: string;
  };
  assetCustom: {
    stateName: string;
    lastChanged?: string;
  };
}

export interface AssetSnapshot {
  key: string;
  name: string;
  type: string;
  stateName: string;
}

export interface SoftwareItem {
  name?: string;
  version?: string;
  publisher?: string;
  lastChanged?: string;
}

export interface AssetDetail {
  key: string;
  installationId?: string;
  sourceExternalId?: string;
  assetBasicInfo?: Record<string, string | undefined>;
  assetCustom?: Record<string, string | undefined>;
  softwares?: SoftwareItem[];
}

export interface Source {
  id: string;
  externalId?: string;
  type?: string;
  state?: { value?: string };
  createdAt?: string;
  discoveryComponents?: { id: string }[];
}

export interface SourceWithCount extends Source {
  assetCount: number;
}

export interface ScanningGroup {
  id: string;
  isDefault?: boolean;
  maintenanceWindow?: string;
  networkVisibility?: { enabled?: boolean };
}
