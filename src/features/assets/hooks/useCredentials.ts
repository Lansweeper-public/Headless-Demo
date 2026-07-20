import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { lsRequest } from '../../../lib/lansweeper';
import {
  DISCOVERY_COMPONENTS_QUERY,
  DISCOVERY_CREDENTIALS_QUERY,
  CREATE_DISCOVERY_CREDENTIAL,
  DELETE_DISCOVERY_CREDENTIAL,
} from '../../../graphql/queries';
import { useActiveSite } from '../../../store/activeSite';
import { encryptCredential, type DiscoveryComponent } from '../lib/credentialCrypto';

export type DiscoveryCredentialType = 'Windows' | 'Ssh' | 'SshCertificate' | 'SnmpV1' | 'SnmpV2' | 'SnmpV3';

export interface DiscoveryCredential {
  id: string;
  name: string;
  default: boolean;
  types: DiscoveryCredentialType[];
  parameters?: {
    login?: string;
    snmpV3AuthType?: string;
    snmpV3Context?: string;
    snmpV3Protocol?: string;
  };
  discoveryComponentIds?: string[];
}

export interface CredentialParameters {
  login?: string;
  snmpV3AuthType?: string;
  snmpV3Context?: string;
  snmpV3Protocol?: string;
}

export interface CreateCredentialInput {
  name: string;
  isDefault: boolean;
  type: DiscoveryCredentialType;
  /** Sensitive fields (login/password/etc.) — encrypted client-side, never sent in the clear. */
  secret: Record<string, string>;
  /** Non-sensitive fields stored alongside the credential. */
  parameters?: CredentialParameters;
}

/** List the site's scanning credentials (secrets are never returned by the API). */
export function useDiscoveryCredentials() {
  const siteId = useActiveSite((s) => s.siteId);
  return useQuery({
    queryKey: ['discovery-credentials', siteId],
    enabled: !!siteId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const data = await lsRequest<{ orgSite: { discoveryCredentials: { total: number; items: DiscoveryCredential[] } } }>(
        DISCOVERY_CREDENTIALS_QUERY,
        { siteId }
      );
      return data.orgSite.discoveryCredentials.items ?? [];
    },
  });
}

/** Create a scanning credential: fetch component public keys, encrypt, then submit. */
export function useCreateCredential() {
  const siteId = useActiveSite((s) => s.siteId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCredentialInput) => {
      const componentsData = await lsRequest<{
        orgSite: { discoveryComponents: { items: DiscoveryComponent[] } };
      }>(DISCOVERY_COMPONENTS_QUERY, { siteId });
      const components = componentsData.orgSite.discoveryComponents.items ?? [];
      if (!components.length) {
        throw new Error('This site has no discovery components yet. Install a scanning agent first.');
      }

      const cipherCredentials = await encryptCredential(input.secret, components);

      const credential = {
        name: input.name,
        default: input.isDefault,
        types: [input.type],
        cipherCredentials,
        ...(input.parameters ? { parameters: input.parameters } : {}),
      };

      const data = await lsRequest<{ orgSite: { createDiscoveryCredential: DiscoveryCredential } }>(
        CREATE_DISCOVERY_CREDENTIAL,
        { siteId, credential }
      );
      return data.orgSite.createDiscoveryCredential;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discovery-credentials', siteId] }),
  });
}

/** Delete a scanning credential by id. */
export function useDeleteCredential() {
  const siteId = useActiveSite((s) => s.siteId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const data = await lsRequest<{ orgSite: { deleteDiscoveryCredential: string } }>(
        DELETE_DISCOVERY_CREDENTIAL,
        { siteId, id }
      );
      return data.orgSite.deleteDiscoveryCredential;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discovery-credentials', siteId] }),
  });
}
