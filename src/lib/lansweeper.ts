import { GraphQLClient } from 'graphql-request';

// The Vite dev proxy mints a per-site Bearer token server-side based on the
// `x-ls-site-id` header, so the client never holds tokens or secrets.
const client = new GraphQLClient(`${window.location.origin}/api/v2/graphql`);

/**
 * Run a GraphQL request scoped to a site. The site is taken from `variables.siteId`
 * and forwarded as the `x-ls-site-id` header so the proxy uses that site's token.
 */
export async function lsRequest<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const siteId = variables.siteId as string | undefined;
  return client.request<T>(query, variables, siteId ? { 'x-ls-site-id': siteId } : undefined);
}
