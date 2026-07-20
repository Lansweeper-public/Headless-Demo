<#
.SYNOPSIS
    Lansweeper Platform API quick-start automation (Windows): provision/select a site and
    (optionally) install the IT Agent. Implements steps 2-6 of the quick-start.

.DESCRIPTION
    Modes (choose interactively, or pass -Mode):
      New       Create a brand-new org site (createOrgSite), then linking code, then install agent.
      Existing  Link the agent to an EXISTING site. Interactively, pick it from a list of the org's
                sites (via the orgSites query); or pass -SiteId. Since site secrets can't be read
                back, the script rotates the site credentials (rotateOrgSiteCredentials) to get
                usable creds (or pass -SiteClientId/-SiteClientSecret to reuse known creds).
      Delete    Delete a site (deleteOrgSite) and exit. Interactively, pick it from the same list.

    For New/Existing it registers the site (id + credentials) in the demo's sites.json so the
    organization page lists it, and saves a copy under %TEMP%. Use -NoRegister to skip.

    Platform API flow (https://developer.lansweeper.com/docs/platform-api/get-started/quick-start):
      [2] org token  -> [3] create/select site -> [4] site token -> [5] linking code -> [6] install agent.

.NOTES
    Credentials are read from lansweeper.config.json next to this script (gitignored) by
    default; override with -ClientId/-ClientSecret/-OrganizationId or LS_* env vars. Step 6
    (install) needs Administrator; the script self-elevates just for that step.

.EXAMPLE
    .\Install-LansweeperItAgent.ps1                      # interactive menu
.EXAMPLE
    .\Install-LansweeperItAgent.ps1 -Mode New            # new site + install agent
.EXAMPLE
    .\Install-LansweeperItAgent.ps1 -Mode Existing -SiteId <id> -SkipInstall
.EXAMPLE
    .\Install-LansweeperItAgent.ps1 -Mode Delete -SiteId <id>
#>
[CmdletBinding()]
param(
    # --- Organization credentials. Read from lansweeper.config.json (next to this script)
    #     by default; override with these params or LS_* environment variables. ---
    [string]$ClientId       = $(if ($env:LS_CLIENT_ID)       { $env:LS_CLIENT_ID }       else { '' }),
    [string]$ClientSecret   = $(if ($env:LS_CLIENT_SECRET)   { $env:LS_CLIENT_SECRET }   else { '' }),
    [string]$OrganizationId = $(if ($env:LS_ORGANIZATION_ID) { $env:LS_ORGANIZATION_ID } else { '' }),

    [ValidateSet('Prompt', 'New', 'Existing', 'Delete')]
    [string]$Mode = 'Prompt',

    [string]$SiteId           = '',   # Existing/Delete
    [string]$SiteClientId     = '',   # Existing (optional; else we rotate)
    [string]$SiteClientSecret = '',   # Existing (optional; else we rotate)
    [switch]$Rotate,                  # force rotating existing-site creds even if provided

    [string]$IntegrationKey = '',     # agent cfg integrationkey; defaults to the site id
    [string]$ApiBase = $(if ($env:LS_API_BASE) { $env:LS_API_BASE } else { '' }),
    [string]$ConfigPath = '',         # defaults to lansweeper.config.json next to the script
    [string]$SiteConfigPath = '',     # optional bundled site config (lansweeper-site.json next to the script)
    [string]$WorkDir = '',            # defaults to %TEMP%\ls-it-agent (resolved below)

    # --- Demo app integration (the site registry the org page reads) ---
    [string]$RegistryPath = '',       # defaults to <project>\sites.json (resolved below)
    [switch]$RegisterSite,            # force add/update this site in sites.json
    [switch]$NoRegister,              # never touch sites.json

    [switch]$SkipInstall,             # provision/select only; don't install the agent

    # --- internal: used by self-elevation to run ONLY step 6 ---
    [switch]$InstallOnly,
    [string]$LinkingCode = ''
)

$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

# Resolve paths defensively: $PSScriptRoot / $PSCommandPath are empty when the script
# isn't launched via -File / .\ (e.g. pasted into the console), which makes Join-Path throw.
$ScriptDir  = if ($PSScriptRoot) { $PSScriptRoot }
              elseif ($PSCommandPath) { Split-Path -Parent $PSCommandPath }
              else { $null }
$projectDir = if ($ScriptDir) { Split-Path -Parent $ScriptDir } else { (Get-Location).Path }
# Config lives NEXT TO the script (script + demo may run on separate machines).
if (-not $ConfigPath) {
    $cfgDir = if ($ScriptDir) { $ScriptDir } else { (Get-Location).Path }
    $ConfigPath = Join-Path $cfgDir 'lansweeper.config.json'
}
# sites.json registry only matters when the script runs alongside the demo (same machine).
if (-not $RegistryPath) { $RegistryPath = Join-Path $projectDir 'sites.json' }
if (-not $WorkDir) {
    $tmpRoot = if ($env:TEMP) { $env:TEMP } else { (Get-Location).Path }
    $WorkDir = Join-Path $tmpRoot 'ls-it-agent'
}

# Load organization credentials from the JSON config file when not supplied via params/env.
if (Test-Path $ConfigPath) {
    try { $cfg = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json }
    catch { throw "Invalid JSON in `"$ConfigPath`": $($_.Exception.Message)" }
    if (-not $ClientId)       { $ClientId       = [string]$cfg.clientId }
    if (-not $ClientSecret)   { $ClientSecret   = [string]$cfg.clientSecret }
    if (-not $OrganizationId) { $OrganizationId = [string]$cfg.organizationId }
    if (-not $ApiBase)        { $ApiBase        = [string]$cfg.apiBase }
}
if (-not $ApiBase) { $ApiBase = 'https://api.lansweeper.com' }

# Optional bundled site config, downloaded alongside the script from the demo's Sources page.
# When present it carries a linking code for a specific site, so the agent links to THAT site
# directly — no org credentials and no provisioning/site-selection needed.
if (-not $SiteConfigPath) {
    $siteCfgDir = if ($ScriptDir) { $ScriptDir } else { (Get-Location).Path }
    $SiteConfigPath = Join-Path $siteCfgDir 'lansweeper-site.json'
}
$prepared = $false
$siteName = $null
if (-not $InstallOnly -and (Test-Path $SiteConfigPath)) {
    try { $siteCfg = Get-Content -Raw -Path $SiteConfigPath | ConvertFrom-Json }
    catch { throw "Invalid JSON in `"$SiteConfigPath`": $($_.Exception.Message)" }
    if ($siteCfg.linkingCode) {
        $prepared    = $true
        $LinkingCode = [string]$siteCfg.linkingCode
        if (-not $SiteId)         { $SiteId = [string]$siteCfg.siteId }
        if (-not $IntegrationKey) { $IntegrationKey = [string]$siteCfg.integrationKey }
        if (-not $IntegrationKey) { $IntegrationKey = [string]$siteCfg.siteId }
        $siteName = [string]$siteCfg.name
    }
}

if (-not $InstallOnly -and -not $prepared -and (-not $ClientId -or -not $ClientSecret -or -not $OrganizationId)) {
    throw "Missing organization credentials. Copy lansweeper.config.example.json to lansweeper.config.json and fill it in (or pass -ClientId/-ClientSecret/-OrganizationId). Looked in: `"$ConfigPath`"."
}

$TokenUrl   = "$ApiBase/api/v2/oauth/token"
$GraphqlUrl = "$ApiBase/api/v2/graphql"

function Get-LsToken {
    param([string]$Id, [string]$Secret)
    $body = @{ client_id = $Id; client_secret = $Secret; grant_type = 'client_credentials' } | ConvertTo-Json
    $resp = Invoke-RestMethod -Method Post -Uri $script:TokenUrl -ContentType 'application/json' -Body $body
    if (-not $resp.access_token) { throw "Token request failed: $($resp | ConvertTo-Json -Depth 6)" }
    return $resp.access_token
}

function Invoke-LsGraphql {
    param([string]$Token, [string]$Query, [hashtable]$Variables)
    $payload = @{ query = $Query; variables = $Variables } | ConvertTo-Json -Depth 8
    $resp = Invoke-RestMethod -Method Post -Uri $script:GraphqlUrl -ContentType 'application/json' `
        -Headers @{ Authorization = "Bearer $Token" } -Body $payload
    if ($resp.errors) { throw "GraphQL error: $($resp.errors | ConvertTo-Json -Depth 8)" }
    return $resp.data
}

function Test-IsAdmin {
    return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}

function Resolve-Guid {
    # Trim quotes/whitespace and validate as a UUID; throws a clear error otherwise.
    param([string]$Value, [string]$Label)
    $v = ($Value -replace '^[\s"'']+|[\s"'']+$', '')
    $g = [guid]::Empty
    if (-not [guid]::TryParse($v, [ref]$g)) {
        throw "$Label '$Value' is not a valid UUID (expected e.g. 0bfe97a2-168c-4220-bdf5-15e6f885805b)."
    }
    return $v
}

function Get-OrgSites {
    # List every site in the org via the orgSites query, enriched with each site's name.
    param([string]$Token, [string]$OrganizationId)
    $q = 'query orgSites($id: ID!, $pagination: OrgSitesPaginationInput) { organization(id: $id) { orgSites(pagination: $pagination) { items { siteId region createdAt } pageInfo { hasNextPage } } } }'
    $all = @()
    $offset = 0
    do {
        $resp = (Invoke-LsGraphql -Token $Token -Query $q -Variables @{ id = $OrganizationId; pagination = @{ limit = 500; offset = $offset } }).organization.orgSites
        $items = @($resp.items)
        foreach ($it in $items) {
            $name = $null
            try { $name = (Invoke-LsGraphql -Token $Token -Query 'query($id: ID!){ orgSite(id: $id){ name } }' -Variables @{ id = $it.siteId }).orgSite.name } catch {}
            $all += [pscustomobject]@{ siteId = $it.siteId; name = $name; region = $it.region; createdAt = $it.createdAt }
        }
        $offset += $items.Count
    } while ($resp.pageInfo.hasNextPage -and $items.Count -gt 0)
    return , $all
}

function Select-OrgSite {
    # Print a numbered list of the org's sites and return the chosen site id (or $null if none).
    param([string]$Token, [string]$OrganizationId, [string]$Prompt = 'Select a site (number)')
    Write-Host '      Fetching existing sites...' -ForegroundColor Cyan
    $sites = @(Get-OrgSites -Token $Token -OrganizationId $OrganizationId)
    if ($sites.Count -eq 0) { return $null }
    Write-Host ''
    for ($i = 0; $i -lt $sites.Count; $i++) {
        $s = $sites[$i]
        $label = if ($s.name) { $s.name } else { '(unnamed)' }
        Write-Host ("  {0}) {1}  [{2}]  {3}" -f ($i + 1), $label, $s.siteId, $s.region)
    }
    Write-Host ''
    $sel = Read-Host $Prompt
    $idx = 0
    if (-not [int]::TryParse($sel, [ref]$idx) -or $idx -lt 1 -or $idx -gt $sites.Count) {
        throw "Invalid selection '$sel' (expected a number between 1 and $($sites.Count))."
    }
    return $sites[$idx - 1].siteId
}

function Update-Registry {
    param([string]$Path, [string]$SiteId, [string]$Name, [string]$ClientId, [string]$ClientSecret)
    $registry = $null
    if (Test-Path $Path) { try { $registry = Get-Content -Raw -Path $Path | ConvertFrom-Json } catch {} }
    $sites = @()
    if ($registry -and $registry.sites) { $sites = @($registry.sites | Where-Object { $_.id -ne $SiteId }) }
    $sites += [pscustomobject]@{ id = $SiteId; name = $Name; clientId = $ClientId; clientSecret = $ClientSecret }
    [pscustomobject]@{ sites = $sites } | ConvertTo-Json -Depth 6 | Set-Content -Path $Path -Encoding UTF8
    Write-Host "      Registered site in $Path (the org page will list it; refresh the page)." -ForegroundColor Green
}

function Install-Agent {
    param([string]$LinkingCode, [string]$IntegrationKey, [string]$WorkDir)
    if (-not (Test-IsAdmin)) { throw 'Agent install needs Administrator.' }
    Write-Host '[6/6] Downloading + installing the Windows IT Agent...' -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
    $exePath = Join-Path $WorkDir 'Lansweeper-IT-agent-discovery.exe'
    $cfgPath = Join-Path $WorkDir 'installation.cfg'

    Invoke-WebRequest -Uri 'https://download.lansweeper.com/partners/windows/it-agent-discovery/latest' -OutFile $exePath
    Write-Host "      Downloaded installer -> $exePath"
    try {
        $hashResp = Invoke-RestMethod -Uri 'https://download.lansweeper.com/partners/windows/it-agent-discovery-hash/latest'
        $expected = ([regex]::Match([string]$hashResp, '[A-Fa-f0-9]{64}')).Value
        $actual   = (Get-FileHash -Algorithm SHA256 -Path $exePath).Hash
        if ($expected -and $actual -ine $expected) { throw "Installer SHA256 mismatch. expected=$expected actual=$actual" }
        if ($expected) { Write-Host '      SHA256 verified.' -ForegroundColor Green }
    } catch {
        if ($_.Exception.Message -like '*mismatch*') { throw }
        Write-Host "      Hash check skipped: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    @"
mode=unattended
accepteula=1
path=C:\Program Files\Lansweeper IT Agent Discovery
cloudtoken=$LinkingCode
integrationkey=$IntegrationKey
#proxyserver=myproxyserver.domain.local
#proxyport=8080
"@ | Set-Content -Path $cfgPath -Encoding ASCII
    Write-Host "      Wrote config -> $cfgPath"
    & $exePath --optionfile $cfgPath
    Write-Host "      Installer exit code: $LASTEXITCODE"
    Write-Host 'Done. IT Agent installation invoked.' -ForegroundColor Green
}

function Invoke-AgentInstall {
    # Install the agent, self-elevating (UAC) for just the install step if we're not admin.
    param([string]$LinkingCode, [string]$IntegrationKey, [string]$WorkDir)
    if (Test-IsAdmin) {
        Install-Agent -LinkingCode $LinkingCode -IntegrationKey $IntegrationKey -WorkDir $WorkDir
    } else {
        if (-not $PSCommandPath) {
            throw "Can't self-elevate because the script path is unknown (run it as a file: powershell -ExecutionPolicy Bypass -File .\Install-LansweeperItAgent.ps1). Re-run from an elevated PowerShell to install, or use -SkipInstall."
        }
        Write-Host 'Step 6 needs Administrator. Relaunching elevated for the install only (accept UAC)...' -ForegroundColor Yellow
        $argList = @('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"",
                     '-InstallOnly', '-LinkingCode', "`"$LinkingCode`"", '-IntegrationKey', "`"$IntegrationKey`"", '-WorkDir', "`"$WorkDir`"")
        try { Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList }
        catch { throw "Could not elevate: $($_.Exception.Message). Re-run step 6 from an Administrator PowerShell, or use -SkipInstall." }
    }
}

# ============================ MAIN ============================

# Elevated relaunch path: do ONLY step 6, using the linking code passed in (no secrets needed).
if ($InstallOnly) {
    if (-not $LinkingCode) { throw '-InstallOnly requires -LinkingCode.' }
    Install-Agent -LinkingCode $LinkingCode -IntegrationKey $IntegrationKey -WorkDir $WorkDir
    return
}

# Bundled site config path: a linking code was downloaded with the script from the demo's
# Sources page, so link the agent straight to that site (no org token / provisioning needed).
if ($prepared) {
    $label = if ($siteName) { "'$siteName' [$SiteId]" } else { "[$SiteId]" }
    Write-Host "Using bundled site config -> linking the agent to site $label." -ForegroundColor Cyan
    if (-not $IntegrationKey) { $IntegrationKey = $SiteId }
    if ($SkipInstall) { Write-Host 'Bundled config loaded (-SkipInstall; agent not installed).' -ForegroundColor Yellow; return }
    Invoke-AgentInstall -LinkingCode $LinkingCode -IntegrationKey $IntegrationKey -WorkDir $WorkDir
    return
}

$interactive = ($Mode -eq 'Prompt')
if ($interactive) {
    Write-Host ''
    Write-Host 'Lansweeper site provisioning' -ForegroundColor Cyan
    Write-Host '  1) Create a NEW site to link the agent to'
    Write-Host '  2) Link the agent to an EXISTING site (pick from a list; rotates its credentials)'
    Write-Host '  3) Delete a site'
    switch (Read-Host 'Select 1, 2 or 3') {
        '1' { $Mode = 'New' }
        '2' { $Mode = 'Existing' }
        '3' { $Mode = 'Delete' }
        default { throw 'Invalid selection.' }
    }
}

if (-not $ClientSecret) { throw 'ClientSecret is empty. Pass -ClientSecret or set $env:LS_CLIENT_SECRET.' }
$OrganizationId = Resolve-Guid -Value $OrganizationId -Label 'OrganizationId'

# Step 2: organization token (needed for New, Delete, and Existing-with-rotate).
Write-Host '[2/6] Requesting organization token...' -ForegroundColor Cyan
$orgToken = Get-LsToken -Id $ClientId -Secret $ClientSecret

# ---- Delete mode: short-circuit ----
if ($Mode -eq 'Delete') {
    if (-not $SiteId -and $interactive) {
        $SiteId = Select-OrgSite -Token $orgToken -OrganizationId $OrganizationId -Prompt 'Select the site to DELETE (number)'
        if (-not $SiteId) { throw 'This organization has no sites to delete.' }
    }
    if (-not $SiteId) { throw 'Delete mode requires -SiteId.' }
    $SiteId = Resolve-Guid -Value $SiteId -Label 'SiteId'
    $q = 'mutation deleteOrgSite($organizationId: ID!, $siteId: ID!) { organization(id: $organizationId) { deleteOrgSite(id: $siteId) } }'
    $r = Invoke-LsGraphql -Token $orgToken -Query $q -Variables @{ organizationId = $OrganizationId; siteId = $SiteId }
    Write-Host "Deleted site $SiteId (response: $($r.organization.deleteOrgSite))." -ForegroundColor Green
    return
}

# ---- New / Existing: obtain site id + site credentials ----
if ($Mode -eq 'New') {
    Write-Host '[3/6] Creating a new org site (createOrgSite)...' -ForegroundColor Cyan
    $q = 'mutation createOrgSite($organizationId: ID!) { organization(id: $organizationId) { createOrgSite { id clientId clientSecret } } }'
    $s = (Invoke-LsGraphql -Token $orgToken -Query $q -Variables @{ organizationId = $OrganizationId }).organization.createOrgSite
    $SiteId = $s.id; $SiteClientId = $s.clientId; $SiteClientSecret = $s.clientSecret
    Write-Host "      New site id: $SiteId"
}
else {
    # Existing
    if (-not $SiteId -and $interactive) {
        $SiteId = Select-OrgSite -Token $orgToken -OrganizationId $OrganizationId -Prompt 'Select the site to link the agent to (number)'
        if (-not $SiteId) { throw 'This organization has no sites yet. Re-run and choose "Create a NEW site to link the agent to".' }
    }
    if (-not $SiteId) { throw 'Existing mode requires -SiteId.' }
    $SiteId = Resolve-Guid -Value $SiteId -Label 'SiteId'

    if ($SiteClientId -and $SiteClientSecret -and -not $Rotate) {
        Write-Host "[3/6] Using provided credentials for existing site $SiteId." -ForegroundColor Cyan
    } else {
        Write-Host "[3/6] Rotating credentials for existing site $SiteId..." -ForegroundColor Cyan
        $q = 'mutation rotate($organizationId: ID!, $siteId: ID!) { organization(id: $organizationId) { rotateOrgSiteCredentials(id: $siteId) { clientId clientSecret } } }'
        $c = (Invoke-LsGraphql -Token $orgToken -Query $q -Variables @{ organizationId = $OrganizationId; siteId = $SiteId }).organization.rotateOrgSiteCredentials
        $SiteClientId = $c.clientId; $SiteClientSecret = $c.clientSecret
        Write-Host '      Credentials rotated.'
    }
}

# Step 4: site token
Write-Host '[4/6] Requesting site token...' -ForegroundColor Cyan
$siteToken = Get-LsToken -Id $SiteClientId -Secret $SiteClientSecret

# Step 5: linking code
Write-Host '[5/6] Requesting linking code...' -ForegroundColor Cyan
$q = 'mutation getLinkingCode($siteId: ID!) { orgSite(id: $siteId) { linkingCode } }'
$LinkingCode = (Invoke-LsGraphql -Token $siteToken -Query $q -Variables @{ siteId = $SiteId }).orgSite.linkingCode
if (-not $LinkingCode) { throw 'getLinkingCode did not return a linkingCode.' }
Write-Host "      Linking code: $LinkingCode"

if (-not $IntegrationKey) { $IntegrationKey = $SiteId }

# Fetch the site's friendly name (best-effort) for display in the org page.
$siteName = $null
try { $siteName = (Invoke-LsGraphql -Token $siteToken -Query 'query($id: ID!){ orgSite(id: $id){ name } }' -Variables @{ id = $SiteId }).orgSite.name } catch {}

# Persist provisioned site (for re-minting the 24h site token later).
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
$siteFile = Join-Path $WorkDir 'site-credentials.json'
[pscustomobject]@{ organizationId = $OrganizationId; siteId = $SiteId; name = $siteName; clientId = $SiteClientId; clientSecret = $SiteClientSecret; linkingCode = $LinkingCode; integrationKey = $IntegrationKey; createdAt = (Get-Date).ToString('o') } |
    ConvertTo-Json | Set-Content -Path $siteFile -Encoding UTF8
Write-Host "      Saved site details to $siteFile"

# Register the site in sites.json so the demo app's organization page lists it.
$doRegister = $true
if     ($NoRegister)   { $doRegister = $false }
elseif ($RegisterSite) { $doRegister = $true }
elseif ($interactive)  { $doRegister = ((Read-Host 'Add this site to the demo app site list (sites.json)? (Y/n)') -notmatch '^[Nn]') }
if ($doRegister) { Update-Registry -Path $RegistryPath -SiteId $SiteId -Name $siteName -ClientId $SiteClientId -ClientSecret $SiteClientSecret }

# Step 6: install the agent (skip if requested).
if ($SkipInstall) { Write-Host 'Provisioning complete (-SkipInstall; agent not installed).' -ForegroundColor Yellow; return }
if ($interactive -and ((Read-Host 'Install the Windows IT Agent now? (Y/n)') -match '^[Nn]')) {
    Write-Host 'Skipping agent install.' -ForegroundColor Yellow; return
}

Invoke-AgentInstall -LinkingCode $LinkingCode -IntegrationKey $IntegrationKey -WorkDir $WorkDir
