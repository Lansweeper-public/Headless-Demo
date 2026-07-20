export const ASSET_RESOURCES_QUERY = `
  query GetAssets($siteId: ID!, $limit: Int!, $page: AssetsPage!, $cursor: ID, $filters: AssetsFilterGroupedInput) {
    orgSite(id: $siteId) {
      assetResources(
        assetPagination: { limit: $limit, page: $page, cursor: $cursor }
        fields: [
          "key",
          "assetBasicInfo.name",
          "assetBasicInfo.type",
          "assetCustom.stateName",
          "assetCustom.lastChanged",
          "assetBasicInfo.lastUpdated",
          "assetBasicInfo.lastSeen",
          "assetBasicInfo.lastActiveScan",
          "assetBasicInfo.lastLsAgent",
          "assetBasicInfo.lastPerformanceScan",
          "assetBasicInfo.lastIpScan",
          "assetBasicInfo.lastScheduled"
        ]
        filters: $filters
      ) {
        total
        pagination { limit current next page }
        items
      }
    }
  }
`;

// Single asset's hardware detail — assetBasicInfo + assetCustom, filtered by key.
export const ASSET_DETAIL_QUERY = `
  query GetAssetDetail($siteId: ID!, $key: String!) {
    orgSite(id: $siteId) {
      assetResources(
        assetPagination: { limit: 1, page: FIRST }
        fields: [
          "key", "installationId", "sourceExternalId",
          "assetBasicInfo.name", "assetBasicInfo.type", "assetBasicInfo.fqdn", "assetBasicInfo.domain",
          "assetBasicInfo.ipAddress", "assetBasicInfo.mac", "assetBasicInfo.userName", "assetBasicInfo.description",
          "assetBasicInfo.firstSeen", "assetBasicInfo.lastSeen",
          "assetCustom.stateName", "assetCustom.manufacturer", "assetCustom.model", "assetCustom.serialNumber",
          "assetCustom.location", "assetCustom.building", "assetCustom.department", "assetCustom.barCode",
          "assetCustom.purchaseDate", "assetCustom.warrantyDate", "assetCustom.comment",
          "softwares.name", "softwares.version", "softwares.publisher", "softwares.lastChanged"
        ]
        filters: { conjunction: OR, conditions: [{ operator: EQUAL, path: "key", value: $key }] }
      ) {
        items
      }
    }
  }
`;

// Sources (installations that discover/scan assets) for the site.
export const SOURCES_QUERY = `
  query GetSources($siteId: ID!) {
    orgSite(id: $siteId) {
      sources {
        total
        items {
          id
          externalId
          type
          state { value }
          createdAt
          discoveryComponents { id }
        }
      }
    }
  }
`;

// Unlink (remove) one or more sources from the site. Returns the unlinked source ids.
export const UNLINK_SOURCES = `
  mutation unlink($siteId: ID!, $sourceIds: [String!]!) {
    orgSite(id: $siteId) {
      unlink(sourceIds: $sourceIds)
    }
  }
`;

// Discovery components (scanners) for the site, with the RSA public key used to
// encrypt credentials client-side before they are sent to the platform.
export const DISCOVERY_COMPONENTS_QUERY = `
  query discoveryComponents($siteId: ID!) {
    orgSite(id: $siteId) {
      discoveryComponents(pagination: { limit: 200, page: FIRST }) {
        total
        items { id publicKey }
      }
    }
  }
`;

// Scanning credentials configured on the site. Sensitive fields are never returned —
// only non-sensitive `parameters` (e.g. login) and metadata.
export const DISCOVERY_CREDENTIALS_QUERY = `
  query discoveryCredentials($siteId: ID!) {
    orgSite(id: $siteId) {
      discoveryCredentials(pagination: { limit: 200, page: FIRST }) {
        total
        items {
          id
          name
          default
          types
          parameters { login snmpV3AuthType snmpV3Context snmpV3Protocol }
          discoveryComponentIds
        }
      }
    }
  }
`;

// Create a scanning credential. `cipherCredentials` carries the encrypted secrets
// (one entry per discovery component); `parameters` holds only non-sensitive fields.
export const CREATE_DISCOVERY_CREDENTIAL = `
  mutation createDiscoveryCredential($siteId: ID!, $credential: DiscoveryCredentialInput!) {
    orgSite(id: $siteId) {
      createDiscoveryCredential(credential: $credential) {
        id
        name
        default
        types
      }
    }
  }
`;

export const DELETE_DISCOVERY_CREDENTIAL = `
  mutation deleteDiscoveryCredential($siteId: ID!, $id: ID!) {
    orgSite(id: $siteId) {
      deleteDiscoveryCredential(id: $id)
    }
  }
`;

// Network visibility is controlled on the site's DEFAULT scanning group
// (one per site, created after the first source/agent is installed).
export const SCANNING_GROUPS_QUERY = `
  query scanningGroups($siteId: ID!) {
    orgSite(id: $siteId) {
      scanningGroups {
        id
        isDefault
        maintenanceWindow
        networkVisibility { enabled }
      }
    }
  }
`;

// Enable/disable network visibility on a scanning group (the default group).
export const SET_NETWORK_VISIBILITY = `
  mutation setNetworkVisibility($siteId: ID!, $groupId: ID!, $scanningGroup: ScanningGroupInput) {
    orgSite(id: $siteId) {
      updateScanningGroup(id: $groupId, scanningGroup: $scanningGroup) {
        id
        isDefault
        networkVisibility { enabled }
      }
    }
  }
`;

// Lightweight projection used to correlate assets to their source
// (installationId -> Source.id, sourceExternalId -> Source.externalId).
export const ASSETS_SOURCE_QUERY = `
  query GetAssetSources($siteId: ID!, $limit: Int!, $page: AssetsPage!, $cursor: ID) {
    orgSite(id: $siteId) {
      assetResources(
        assetPagination: { limit: $limit, page: $page, cursor: $cursor }
        fields: ["key", "installationId", "sourceExternalId"]
      ) {
        total
        pagination { next }
        items
      }
    }
  }
`;

// Delete assets by key (returns the deleted keys). Up to 1000 keys per call.
export const DELETE_ASSETS = `
  mutation deleteAssets($siteId: ID!, $keys: [String!]!) {
    orgSite(id: $siteId) {
      deleteAssets(keys: $keys)
    }
  }
`;

// Lookups for the create-asset form (typeKey / stateKey are required keys).
export const ASSET_TYPES_QUERY = `
  query assetTypeList($siteId: ID!) {
    orgSite(id: $siteId) {
      assetTypeList(onlyInUse: false) { name assetTypeKey }
    }
  }
`;

export const ASSET_STATES_QUERY = `
  query assetStates($siteId: ID!) {
    orgSite(id: $siteId) {
      assetStates { name assetStateKey }
    }
  }
`;

// Create a new asset. Requires assetBasicInfo.name + .typeKey and assetCustom.stateKey.
export const ADD_ASSET = `
  mutation addAsset($siteId: ID!, $input: AddAssetInput!) {
    orgSite(id: $siteId) {
      addAsset(input: $input) {
        assetBasicInfo { name type }
      }
    }
  }
`;
