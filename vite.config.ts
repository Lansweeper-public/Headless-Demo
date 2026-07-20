import { defineConfig, type Connect } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

interface SiteEntry { id: string; name?: string | null; clientId: string; clientSecret: string }
interface Registry { sites: SiteEntry[] }

// Minimal ZIP writer (STORE / no compression) — enough to bundle a couple of small files
// for download without pulling in a zip dependency.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (buf: Buffer): number => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const zipStore = (files: { name: string; data: Buffer }[]): Buffer => {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8')
    const crc = crc32(f.data)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0) // local file header signature
    header.writeUInt16LE(20, 4)         // version needed
    header.writeUInt16LE(0, 8)          // method: store
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(f.data.length, 18) // compressed size
    header.writeUInt32LE(f.data.length, 22) // uncompressed size
    header.writeUInt16LE(name.length, 26)
    local.push(header, name, f.data)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)     // central directory signature
    cd.writeUInt16LE(20, 4)             // version made by
    cd.writeUInt16LE(20, 6)             // version needed
    cd.writeUInt16LE(0, 10)             // method: store
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(f.data.length, 20)
    cd.writeUInt32LE(f.data.length, 24)
    cd.writeUInt16LE(name.length, 28)
    cd.writeUInt32LE(offset, 42)        // offset of local header
    central.push(cd, name)

    offset += header.length + name.length + f.data.length
  }
  const localBuf = Buffer.concat(local)
  const centralBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)      // end of central directory signature
  end.writeUInt16LE(files.length, 8)    // entries on this disk
  end.writeUInt16LE(files.length, 10)   // total entries
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(localBuf.length, 16) // central directory offset
  return Buffer.concat([localBuf, centralBuf, end])
}

interface OrgConfig { clientId?: string; clientSecret?: string; organizationId?: string; apiBase?: string }

// Shared config (org credentials + apiBase), also consumed by the provisioning script.
const readOrgConfig = (configPath: string): OrgConfig => {
  try {
    if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf8')) as OrgConfig
  } catch (e) {
    console.error('[ls] failed reading lansweeper.config.json:', (e as Error).message)
  }
  return {}
}

const apiBaseOf = (cfg: OrgConfig): string =>
  cfg.apiBase ? String(cfg.apiBase).replace(/\/+$/, '') : 'https://api.lansweeper.com'

export default defineConfig(() => {
  const registryPath = path.resolve(process.cwd(), 'sites.json')
  const orgConfig = readOrgConfig(path.resolve(process.cwd(), 'lansweeper.config.json'))
  const LS_API = apiBaseOf(orgConfig)
  const TOKEN_URL = `${LS_API}/api/v2/oauth/token`
  const GRAPHQL_URL = `${LS_API}/api/v2/graphql`

  // The org's full site list now comes from the `orgSites` query (see listSites), so the
  // registry is no longer the source of truth for WHICH sites exist. It is still an optional
  // cache of per-site secrets (written by scripts/Install-LansweeperItAgent.ps1): sites present
  // here mint tokens from their stored secret, while any other org site mints a token on demand
  // by rotating its credentials with the org token. Org credentials still can't read site data.
  const loadRegistry = (): Registry => {
    try {
      if (fs.existsSync(registryPath)) return JSON.parse(fs.readFileSync(registryPath, 'utf8')) as Registry
    } catch (e) {
      console.error('[ls] failed reading sites.json:', (e as Error).message)
    }
    return { sites: [] }
  }

  let registry = loadRegistry()
  const tokens = new Map<string, { token: string; exp: number }>()
  // Secrets minted on-demand via rotateOrgSiteCredentials for sites NOT in sites.json.
  // Kept in memory only (never persisted) so registered sites keep their existing secrets.
  const rotatedCreds = new Map<string, { clientId: string; clientSecret: string }>()

  const findSite = (siteId: string) => registry.sites.find((s) => s.id === siteId)

  // Exchange a client_credentials pair for an access token.
  const mintToken = async (clientId: string, clientSecret: string, label: string): Promise<{ token: string; exp: number }> => {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    })
    const data = (await res.json()) as { access_token?: string; expires_in?: number; errors?: unknown }
    if (!data.access_token) throw new Error(`Token mint failed for ${label}: ${JSON.stringify(data.errors ?? data)}`)
    return { token: data.access_token, exp: Date.now() + Number(data.expires_in ?? 86400) * 1000 }
  }

  const ensureToken = async (siteId: string): Promise<string> => {
    if (!siteId) throw new Error('Missing site id (x-ls-site-id header / siteId variable).')
    registry = loadRegistry() // pick up newly provisioned sites / rotated creds without a restart
    const cached = tokens.get(siteId)
    if (cached && cached.exp > Date.now() + 60_000) return cached.token

    // Prefer a stored secret (sites.json); only rotate for sites we have no secret for.
    const site = findSite(siteId)
    let creds = site
      ? { clientId: site.clientId, clientSecret: site.clientSecret }
      : rotatedCreds.get(siteId)
    if (!creds) {
      // Unregistered site: obtain a usable secret by rotating its credentials with the org token.
      // (The platform never returns an existing site secret, so rotation is the only path.)
      creds = await rotateSiteCredentials(siteId)
      rotatedCreds.set(siteId, creds)
    }

    const minted = await mintToken(creds.clientId, creds.clientSecret, `site ${siteId}`)
    tokens.set(siteId, minted)
    return minted.token
  }

  // Organization-scoped token (from lansweeper.config.json). Unlike per-site tokens it can
  // enumerate every site in the org (orgSites), read site metadata (orgSite.name), and rotate
  // site credentials, but it can NOT read site data (assets/sources) — those need a site token.
  let orgToken: { token: string; exp: number } | null = null
  const ensureOrgToken = async (): Promise<string> => {
    const { clientId, clientSecret } = orgConfig
    if (!clientId || !clientSecret) throw new Error('Missing organization credentials in lansweeper.config.json.')
    if (orgToken && orgToken.exp > Date.now() + 60_000) return orgToken.token
    orgToken = await mintToken(clientId, clientSecret, 'organization')
    return orgToken.token
  }

  // Rotate a site's API credentials to obtain a usable clientId/secret (org-token operation).
  // NOTE: this invalidates the site's previous API secret; agents authenticate with a linking
  // code (not the API secret), so scanning/reporting is unaffected.
  const rotateSiteCredentials = async (siteId: string): Promise<{ clientId: string; clientSecret: string }> => {
    if (!orgConfig.organizationId) throw new Error('Missing organizationId in lansweeper.config.json (needed to rotate site credentials).')
    const token = await ensureOrgToken()
    const j = await orgGraphql<{ data?: { organization?: { rotateOrgSiteCredentials?: { clientId: string; clientSecret: string } } }; errors?: unknown }>(
      token,
      'mutation($o: ID!, $s: ID!){ organization(id: $o){ rotateOrgSiteCredentials(id: $s){ clientId clientSecret } } }',
      { o: orgConfig.organizationId, s: siteId }
    )
    const c = j?.data?.organization?.rotateOrgSiteCredentials
    if (!c?.clientSecret) throw new Error(`Could not obtain credentials for site ${siteId}: ${JSON.stringify(j?.errors ?? j)}`)
    return c
  }

  const orgGraphql = async <T,>(token: string, query: string, variables: Record<string, unknown>): Promise<T> => {
    const r = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables }),
    })
    return (await r.json()) as T
  }

  // Enriched site list for the organization page (id + live name), short-cached.
  // `connected` = we hold a stored secret in sites.json (no rotation needed on open);
  // unregistered sites are still openable (a token is minted on demand via rotation).
  // `ok` = the site is healthy/openable (its metadata could be read with the org token).
  interface SiteInfo { id: string; name: string | null; region: string | null; createdAt: string | null; connected: boolean; ok: boolean }

  // orgSites returns every site the org owns (id/region/createdAt) but NOT the per-site secret.
  const ORG_SITES_QUERY = `
    query orgSites($id: ID!, $pagination: OrgSitesPaginationInput) {
      organization(id: $id) {
        orgSites(pagination: $pagination) {
          items { siteId region createdAt }
          pageInfo { hasNextPage }
        }
      }
    }`

  // Read a site's display name with the org token (works for any site in the org).
  // Returns whether the metadata query succeeded (a proxy for site health).
  const fetchSiteMeta = async (token: string, id: string): Promise<{ name: string | null; ok: boolean }> => {
    try {
      const j = await orgGraphql<{ data?: { orgSite?: { name?: string } }; errors?: unknown }>(
        token, 'query($id: ID!){ orgSite(id: $id){ name } }', { id }
      )
      if (j?.errors) return { name: null, ok: false }
      return { name: j?.data?.orgSite?.name ?? null, ok: true }
    } catch { return { name: null, ok: false } }
  }

  // Fallback for when org credentials are absent: list only the registry sites (legacy behavior).
  const listRegistrySites = async (): Promise<SiteInfo[]> => {
    const out: SiteInfo[] = []
    for (const s of registry.sites) {
      let name = s.name ?? null
      let ok = true
      try {
        const token = await ensureToken(s.id)
        const r = await fetch(GRAPHQL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ query: 'query($id: ID!){ orgSite(id: $id){ name } }', variables: { id: s.id } }),
        })
        const j = (await r.json()) as { data?: { orgSite?: { name?: string } } }
        name = j?.data?.orgSite?.name ?? name
      } catch {
        ok = false
      }
      out.push({ id: s.id, name, region: null, createdAt: null, connected: true, ok })
    }
    return out
  }

  let sitesCache: { at: number; data: SiteInfo[] } | null = null
  const listSites = async (): Promise<SiteInfo[]> => {
    if (sitesCache && Date.now() - sitesCache.at < 60_000) return sitesCache.data
    registry = loadRegistry() // pick up newly-provisioned sites / rotated creds without a restart
    const registered = new Set(registry.sites.map((s) => s.id))

    let out: SiteInfo[]
    try {
      const token = await ensureOrgToken()
      if (!orgConfig.organizationId) throw new Error('Missing organizationId in lansweeper.config.json.')

      // Page through every site in the org.
      const items: { siteId: string; region: string | null; createdAt: string | null }[] = []
      let offset = 0
      for (;;) {
        const j = await orgGraphql<{ data?: { organization?: { orgSites?: {
          items: { siteId: string; region: string | null; createdAt: string | null }[]
          pageInfo: { hasNextPage: boolean }
        } } }; errors?: unknown }>(token, ORG_SITES_QUERY, { id: orgConfig.organizationId, pagination: { limit: 500, offset } })
        const resp = j?.data?.organization?.orgSites
        if (!resp) throw new Error(`orgSites failed: ${JSON.stringify(j?.errors ?? j)}`)
        items.push(...resp.items)
        if (!resp.pageInfo.hasNextPage || resp.items.length === 0) break
        offset += resp.items.length
      }

      // Enrich each site with its live name (org token). Every listed site is openable:
      // registered ones use their stored secret, the rest rotate on demand when selected.
      out = await Promise.all(items.map(async (it): Promise<SiteInfo> => {
        const { name, ok } = await fetchSiteMeta(token, it.siteId)
        return { id: it.siteId, name, region: it.region, createdAt: it.createdAt, connected: registered.has(it.siteId), ok }
      }))
    } catch (e) {
      console.error('[ls] orgSites unavailable, falling back to registry:', (e as Error).message)
      out = await listRegistrySites()
    }

    sitesCache = { at: Date.now(), data: out }
    return out
  }

  const readBody = (req: Connect.IncomingMessage): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(Buffer.from(c)))
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
    })

  return {
    plugins: [
      react(),
      {
        name: 'lansweeper-multisite-proxy',
        configureServer(server) {
          // List the org's sites for the organization page (no secrets exposed).
          server.middlewares.use('/api/sites', (req, res, next) => {
            if (req.method !== 'GET') return next()
            listSites()
              .then((data) => {
                res.setHeader('content-type', 'application/json')
                res.end(JSON.stringify(data))
              })
              .catch((e: Error) => {
                res.statusCode = 500
                res.setHeader('content-type', 'application/json')
                res.end(JSON.stringify({ error: e.message }))
              })
          })

          // Create a new org site (createOrgSite needs the ORG token). Caches the returned
          // credentials in-memory so the new site is immediately operable without a rotation.
          server.middlewares.use('/api/create-site', (req, res, next) => {
            if (req.method !== 'POST') return next()
            ;(async () => {
              if (!orgConfig.organizationId) throw new Error('Missing organizationId in lansweeper.config.json.')
              const body = await readBody(req)
              let region = 'eu'
              try { region = String(JSON.parse(body.toString('utf8') || '{}').region || 'eu') } catch { /* default */ }
              if (region !== 'eu' && region !== 'us') throw new Error(`Invalid region '${region}' (expected 'eu' or 'us').`)
              const token = await ensureOrgToken()
              const j = await orgGraphql<{ data?: { organization?: { createOrgSite?: { id: string; clientId: string; clientSecret: string } } }; errors?: unknown }>(
                token,
                'mutation($o: ID!, $region: Region){ organization(id: $o){ createOrgSite(region: $region) { id clientId clientSecret } } }',
                { o: orgConfig.organizationId, region }
              )
              const site = j?.data?.organization?.createOrgSite
              if (!site?.id) throw new Error(`createOrgSite failed: ${JSON.stringify(j?.errors ?? j)}`)
              rotatedCreds.set(site.id, { clientId: site.clientId, clientSecret: site.clientSecret })
              sitesCache = null // so the next /api/sites includes the new site
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ id: site.id }))
            })().catch((e: Error) => {
              res.statusCode = 500
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ error: e.message }))
            })
          })

          // Delete an org site (deleteOrgSite needs the ORG token).
          server.middlewares.use('/api/delete-site', (req, res, next) => {
            if (req.method !== 'POST') return next()
            ;(async () => {
              if (!orgConfig.organizationId) throw new Error('Missing organizationId in lansweeper.config.json.')
              const body = await readBody(req)
              const siteId = (() => { try { return String(JSON.parse(body.toString('utf8') || '{}').siteId || '') } catch { return '' } })()
              if (!siteId) throw new Error('Missing siteId.')
              const token = await ensureOrgToken()
              const j = await orgGraphql<{ data?: { organization?: { deleteOrgSite?: string } }; errors?: unknown }>(
                token,
                'mutation($o: ID!, $s: ID!){ organization(id: $o){ deleteOrgSite(id: $s) } }',
                { o: orgConfig.organizationId, s: siteId }
              )
              if (j?.errors) throw new Error(`deleteOrgSite failed: ${JSON.stringify(j.errors)}`)
              tokens.delete(siteId)
              rotatedCreds.delete(siteId)
              sitesCache = null // so the next /api/sites reflects the removal
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ id: siteId }))
            })().catch((e: Error) => {
              res.statusCode = 500
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ error: e.message }))
            })
          })

          // Serve the agent install script for download (single source of truth: scripts/).
          server.middlewares.use('/api/install-script', (req, res, next) => {
            if (req.method !== 'GET') return next()
            try {
              const scriptPath = path.resolve(process.cwd(), 'scripts', 'Install-LansweeperItAgent.ps1')
              const body = fs.readFileSync(scriptPath)
              res.setHeader('content-type', 'application/octet-stream')
              res.setHeader('content-disposition', 'attachment; filename="Install-LansweeperItAgent.ps1"')
              res.end(body)
            } catch (e) {
              res.statusCode = 500
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ error: (e as Error).message }))
            }
          })

          // Download a per-site install bundle: the script + a prepared lansweeper-site.json
          // carrying a linking code, so the agent links to THIS site with no org creds needed.
          server.middlewares.use('/api/install-bundle', (req, res, next) => {
            if (req.method !== 'GET') return next()
            ;(async () => {
              const url = new URL(req.url ?? '', 'http://localhost')
              const siteId = url.searchParams.get('siteId') || ''
              if (!siteId) throw new Error('Missing siteId.')

              const token = await ensureToken(siteId)
              const codeResp = await orgGraphql<{ data?: { orgSite?: { linkingCode?: string } }; errors?: unknown }>(
                token, 'mutation($id: ID!){ orgSite(id: $id){ linkingCode } }', { id: siteId }
              )
              const linkingCode = codeResp?.data?.orgSite?.linkingCode
              if (!linkingCode) throw new Error(`Could not get a linking code: ${JSON.stringify(codeResp?.errors ?? codeResp)}`)

              let name: string | null = null
              try {
                const nameResp = await orgGraphql<{ data?: { orgSite?: { name?: string } } }>(
                  token, 'query($id: ID!){ orgSite(id: $id){ name } }', { id: siteId }
                )
                name = nameResp?.data?.orgSite?.name ?? null
              } catch { /* name is best-effort */ }

              const script = fs.readFileSync(path.resolve(process.cwd(), 'scripts', 'Install-LansweeperItAgent.ps1'))
              const siteConfig = Buffer.from(
                JSON.stringify({
                  siteId,
                  name,
                  integrationKey: siteId,
                  linkingCode,
                  apiBase: LS_API,
                  note: 'Downloaded from the Lansweeper headless demo. Keep this next to Install-LansweeperItAgent.ps1; running the script installs an agent linked to this site (no org credentials needed).',
                }, null, 2) + '\n',
                'utf8'
              )

              const zip = zipStore([
                { name: 'Install-LansweeperItAgent.ps1', data: script },
                { name: 'lansweeper-site.json', data: siteConfig },
              ])
              res.setHeader('content-type', 'application/zip')
              res.setHeader('content-disposition', `attachment; filename="lansweeper-agent-${siteId.slice(0, 8)}.zip"`)
              res.end(zip)
            })().catch((e: Error) => {
              res.statusCode = 500
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ error: e.message }))
            })
          })

          // Per-site GraphQL proxy: mint/cache a token for the selected site and forward.
          server.middlewares.use('/api/v2/graphql', (req, res, next) => {
            if (req.method !== 'POST') return next()
            ;(async () => {
              const body = await readBody(req)
              let siteId = (req.headers['x-ls-site-id'] as string) || ''
              if (!siteId) {
                try { siteId = JSON.parse(body.toString('utf8'))?.variables?.siteId || '' } catch { /* ignore */ }
              }
              const token = await ensureToken(siteId)
              const upstream = await fetch(GRAPHQL_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
                body,
              })
              const text = await upstream.text()
              res.statusCode = upstream.status
              res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json')
              res.end(text)
            })().catch((e: Error) => {
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ errors: [{ message: e.message }] }))
            })
          })

          console.log(`[ls] multi-site proxy ready (${registry.sites.length} site(s) in registry)`)
        },
        // Emit the agent install script into the production build so `/api/install-script`
        // resolves the same way it does via the dev middleware above (single source of truth).
        generateBundle() {
          const scriptPath = path.resolve(process.cwd(), 'scripts', 'Install-LansweeperItAgent.ps1')
          this.emitFile({
            type: 'asset',
            fileName: 'api/install-script',
            source: fs.readFileSync(scriptPath),
          })
        },
      },
    ],
  }
})
