# Install-LansweeperItAgent.ps1

Windows PowerShell script that automates the Lansweeper **Platform API** quick‑start
(steps 2–6): mint an org token → create a new site **or pick an existing one from a list** →
mint a site token → get a linking code → install the Windows IT Agent.

This runs independently of the demo app (it can live on a different machine — e.g. the
customer endpoint where the agent is installed).

## Zero-config install (bundled site config)

The demo app's **Sources** page has an **Install a new source** button that downloads a ZIP
containing this script **plus a prepared `lansweeper-site.json`** for the site you're viewing.
That file carries a **linking code**, so when you extract both files into the same folder and
run the script, it skips provisioning entirely and installs an agent linked straight to that
site — **no organization credentials needed on the endpoint**. Delete/keep `lansweeper-site.json`
alongside the script; its presence is what triggers this path (override with `-SiteConfigPath`).

## Requirements

- Windows + PowerShell 5.1+.
- Lansweeper **organization** credentials (Platform API request form).
- **Administrator** is required only for step 6 (installing the agent); the script
  self‑elevates for that step. Provisioning (steps 2–5) does not need admin.

## Configuration

Put your org credentials in `lansweeper.config.json` **next to this script**:

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

`lansweeper.config.json` is gitignored. You can also override any value with parameters
(`-ClientId`, `-ClientSecret`, `-OrganizationId`, `-ApiBase`) or `LS_*` environment variables.

## Usage

Run it as a file (so paths resolve) from this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-LansweeperItAgent.ps1
```

Without `-Mode` it shows an interactive menu. Modes:

| Mode | What it does |
|------|--------------|
| **New** | `createOrgSite` → new site → linking code → (install agent) |
| **Existing** | Link the agent to an existing site. Interactively, **pick it from a numbered list** of the org's sites (via the `orgSites` query); or pass `-SiteId`. Site secrets can't be read back, so it **rotates** the site's credentials (or pass `-SiteClientId`/`-SiteClientSecret` to reuse known ones). |
| **Delete** | `deleteOrgSite` and exit. Interactively, pick the site from the same list; or pass `-SiteId`. |

### Examples

```powershell
# Interactive: create a new site or pick an existing one from a list, then optionally install
.\Install-LansweeperItAgent.ps1

# New site + install the IT Agent (self-elevates for the install)
.\Install-LansweeperItAgent.ps1 -Mode New

# Provision only (no install): create a site and print the linking code
.\Install-LansweeperItAgent.ps1 -Mode New -SkipInstall

# Link the agent to an existing site (rotates its credentials), no install.
# Omit -SiteId to pick from a list interactively.
.\Install-LansweeperItAgent.ps1 -Mode Existing -SiteId <siteId> -SkipInstall

# Delete a site (omit -SiteId to pick from a list interactively)
.\Install-LansweeperItAgent.ps1 -Mode Delete -SiteId <siteId>
```

## Key parameters

| Parameter | Default | Notes |
|-----------|---------|-------|
| `-Mode` | `Prompt` | `New` / `Existing` / `Delete` |
| `-SiteId` | — | `Existing` / `Delete`; omit it interactively to pick from a list |
| `-SkipInstall` | off | provision only (no agent install) |
| `-NoRegister` | off | don't write to `sites.json` |
| `-IntegrationKey` | site id | written to the agent config `integrationkey` |
| `-ConfigPath` | `lansweeper.config.json` next to the script | |
| `-WorkDir` | `%TEMP%\ls-it-agent` | installer + saved site details land here |

## Outputs

- Saves the provisioned site's id / credentials / linking code to
  `%TEMP%\ls-it-agent\site-credentials.json` (so its 24h site token can be re‑minted later).
- When run on the **same machine** as the demo, it also registers the site in the demo's
  `sites.json` (one folder up) so the Organization page lists it. Across machines this has no
  effect (the demo's registry isn't reachable) — use `-NoRegister` to skip it entirely.

## Step 6 — the IT Agent

Downloads the Windows IT Agent installer, verifies its SHA256, writes `installation.cfg` with
the linking code in `cloudtoken=`, and runs:

```
Lansweeper-IT-agent-discovery.exe --optionfile installation.cfg
```

The agent then scans the endpoint and reports assets to the site. (Per‑network scanning also
requires enabling **network visibility** on the site's scanning group — available in the demo's
Sources page, or via the `updateScanningGroup` mutation.)
