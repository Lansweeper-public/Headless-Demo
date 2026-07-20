// Central registry describing which Lansweeper Platform API operation backs each piece of the
// demo UI. Surfaced via the <ApiInfo> icon so viewers can see the exact query/mutation, an
// example, and a link to the official docs.

const DOCS = 'https://developer.lansweeper.com/docs/platform-api';

export interface ApiInfoEntry {
  title: string;
  description: string;
  query: string;
  docUrl: string;
}

export const API_INFO = {
  orgSites: {
    title: 'organization.orgSites (query)',
    description: 'Lists every site in the organization. Used to populate this page.',
    docUrl: `${DOCS}/reference/orgsites/`,
    query: `query orgSites($id: ID!) {
  organization(id: $id) {
    orgSites(pagination: { limit: 500, offset: 0 }) {
      items { siteId region createdAt }
      pageInfo { total hasNextPage }
    }
  }
}`,
  },
  createSite: {
    title: 'createOrgSite (mutation)',
    description: 'Creates a new site in the organization, in the chosen region (EU or US).',
    docUrl: `${DOCS}/reference/createorgsite/`,
    query: `mutation createOrgSite($organizationId: ID!, $region: Region) {
  organization(id: $organizationId) {
    createOrgSite(region: $region) { id clientId clientSecret }
  }
}`,
  },
  deleteSite: {
    title: 'deleteOrgSite (mutation)',
    description: 'Permanently deletes a site from the organization.',
    docUrl: `${DOCS}/reference/deleteorgsite/`,
    query: `mutation deleteOrgSite($organizationId: ID!, $siteId: ID!) {
  organization(id: $organizationId) {
    deleteOrgSite(id: $siteId)
  }
}`,
  },
  assets: {
    title: 'orgSite.assetResources (query)',
    description: "Retrieves the site's assets. Field paths select which properties to return; results are paginated with a cursor.",
    docUrl: `${DOCS}/reference/assetresources/`,
    query: `query GetAssets($siteId: ID!) {
  orgSite(id: $siteId) {
    assetResources(
      assetPagination: { limit: 500, page: FIRST }
      fields: ["key", "assetBasicInfo.name", "assetBasicInfo.type", "assetCustom.stateName"]
    ) {
      total
      pagination { next }
      items
    }
  }
}`,
  },
  assetDetail: {
    title: 'orgSite.assetResources (query, single asset)',
    description: 'Fetches one asset (hardware + installed software) by filtering assetResources on its key.',
    docUrl: `${DOCS}/reference/assetresources/`,
    query: `query GetAssetDetail($siteId: ID!, $key: String!) {
  orgSite(id: $siteId) {
    assetResources(
      assetPagination: { limit: 1, page: FIRST }
      fields: ["key", "assetBasicInfo.name", "softwares.name", "softwares.version"]
      filters: { conjunction: OR, conditions: [{ operator: EQUAL, path: "key", value: $key }] }
    ) { items }
  }
}`,
  },
  addAsset: {
    title: 'addAsset (mutation)',
    description: 'Creates a new asset on the site. Requires a name + type key and a state key.',
    docUrl: `${DOCS}/reference/addasset/`,
    query: `mutation addAsset($siteId: ID!, $input: AddAssetInput!) {
  orgSite(id: $siteId) {
    addAsset(input: $input) { assetBasicInfo { name type } }
  }
}

# type/state options come from assetTypeList & assetStates`,
  },
  deleteAssets: {
    title: 'deleteAssets (mutation)',
    description: 'Deletes assets by key (up to 500 per call). Returns the deleted keys.',
    docUrl: `${DOCS}/reference/deleteassets/`,
    query: `mutation deleteAssets($siteId: ID!, $keys: [String!]!) {
  orgSite(id: $siteId) {
    deleteAssets(keys: $keys)
  }
}`,
  },
  sources: {
    title: 'orgSite.sources (query)',
    description: 'Lists the installations (agents/integrations) that discover and scan assets for the site.',
    docUrl: `${DOCS}/reference/sources/`,
    query: `query GetSources($siteId: ID!) {
  orgSite(id: $siteId) {
    sources {
      total
      items { id externalId type state { value } createdAt discoveryComponents { id } }
    }
  }
}`,
  },
  unlink: {
    title: 'orgSite.unlink (mutation)',
    description: 'Removes one or more sources (and their scanned data association) from the site.',
    docUrl: `${DOCS}/reference/unlink/`,
    query: `mutation unlink($siteId: ID!, $sourceIds: [String!]!) {
  orgSite(id: $siteId) {
    unlink(sourceIds: $sourceIds)
  }
}`,
  },
  networkVisibility: {
    title: 'orgSite.updateScanningGroup (mutation)',
    description: "Toggles network visibility on the site's default scanning group, so agents scan the local network for IP assets.",
    docUrl: `${DOCS}/guides/enable-network-visibility/`,
    query: `mutation setNetworkVisibility($siteId: ID!, $groupId: ID!, $scanningGroup: ScanningGroupInput) {
  orgSite(id: $siteId) {
    updateScanningGroup(id: $groupId, scanningGroup: $scanningGroup) {
      id networkVisibility { enabled }
    }
  }
}`,
  },
  credentials: {
    title: 'discoveryCredentials & createDiscoveryCredential',
    description: 'Lists scanning credentials and creates new ones. Secrets are encrypted per discovery component (AES-GCM + RSA-OAEP) in the browser before sending — the API never returns them.',
    docUrl: `${DOCS}/guides/manage-credentials/`,
    query: `# 1. get component public keys
query { orgSite(id: $siteId) { discoveryComponents(pagination: {limit: 200, page: FIRST}) { items { id publicKey } } } }

# 2. create the credential with encrypted secrets
mutation createDiscoveryCredential($siteId: ID!, $credential: DiscoveryCredentialInput!) {
  orgSite(id: $siteId) {
    createDiscoveryCredential(credential: $credential) { id name types }
  }
}`,
  },
  linkingCode: {
    title: 'orgSite.linkingCode (mutation)',
    description: 'Returns a linking code (cloudtoken) that ties a newly installed IT Agent to this site. Bundled into the downloaded config so the agent reports here.',
    docUrl: `${DOCS}/reference/linkingcode/`,
    query: `mutation getLinkingCode($siteId: ID!) {
  orgSite(id: $siteId) {
    linkingCode
  }
}`,
  },
} as const satisfies Record<string, ApiInfoEntry>;

export type ApiInfoId = keyof typeof API_INFO;
