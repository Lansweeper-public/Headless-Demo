# Lansweeper Headless Demo (ITAM / ITSM)

A headless demo web app built on the Lansweeper **Platform API**. It shows an **Organization**
page that lists your sites; selecting a site opens a site-scoped UI:

- **ITAM**
  - **Assets** — searchable list with Last Updated / Last Seen, an asset **detail** page
    (hardware from `assetBasicInfo`/`assetCustom` + installed software), **create a new asset**,
    and **delete assets not seen in > 2 days**.
  - **Sources** — installations that scan assets, correlated to their assets, with a
    **network‑visibility** toggle (on the site's default scanning group).
- **ITSM** — a lightweight local **tickets** module that can link tickets to assets.

> The provisioning script that creates sites and installs the Windows IT Agent lives in
> [`scripts/`](./scripts/README.md) and is documented separately (it can run on a different machine).

## Requirements

- Node.js 18+ and npm.
- Lansweeper **organization** credentials (Platform API request form).

## Configuration

Copy the template and fill in your org credentials:

```bash
cp lansweeper.config.example.json lansweeper.config.json
```

```json
{
  "clientId": "your-organization-client-id",
  "clientSecret": "your-organization-client-secret",
  "organizationId": "your-organization-id",
  "apiBase": "https://api.lansweeper.com"
}
```

`lansweeper.config.json` is gitignored. Credentials are read **server‑side only** by the dev
server — they are never bundled into the browser.

## Run

```bash
npm install
npm run dev
```

Open the printed URL → the **Organization** page → pick a site.

## How it works

- **`vite.config.ts`** runs a small dev‑server proxy at `/api/v2/graphql`. The browser sends an
  `x-ls-site-id` header; the proxy mints/caches a **per‑site** Platform API token
  (`client_credentials`, auto‑refreshed before the 24h expiry) and forwards the request. Secrets
  never reach the client.
- The proxy also serves **`GET /api/sites`** for the Organization page.
- **`sites.json`** (gitignored) is the registry of sites the app can use — each entry holds a
  site's id + credentials. It is populated by the provisioning script (see `scripts/`).

> The Platform API has no "list sites" endpoint yet, so the demo lists sites from `sites.json`.
> When a `sites` query becomes available, swap the `/api/sites` implementation in
> `vite.config.ts` to call it instead of reading the file.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server (Organization page + per‑site proxy). |
| `npm run build` | Type‑check and build for production. |
| `npm run lint` | Lint. |
| `npm run preview` | Preview a production build (no dev proxy — for static preview only). |

> Built with React 19 + TypeScript + Vite + Ant Design + TanStack Query + Zustand.
