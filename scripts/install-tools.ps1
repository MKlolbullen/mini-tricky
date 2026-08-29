#Requires -Version 5.1
<#
  install-tools.ps1 - Windows bootstrap for mini-tricky's security tool catalog.

  Generated from backend/src/main.py::_generate_install_script_ps1. Regenerate:
    Invoke-WebRequest 'http://localhost:8000/api/tools/install-script?format=ps1' -OutFile scripts/install-tools.ps1

  Idempotent: each tool is guarded by Get-Command, so re-running only installs
  what is missing. The runtime detects the Windows package manager (winget /
  scoop / choco), bootstraps the language toolchains it needs (go / pipx /
  cargo / npm / gem), never aborts on a single failure, and prints a summary.

  OPSEC / metadata minimisation:
    * Opts out of tool telemetry (dotnet, PowerShell, Go, pip version-check,
      npm fund/audit) and runs non-interactively.
    * Emits NO host metadata: no username, hostname, or machine details are
      collected, logged, or transmitted; output stays on this console and no
      resolved home path is printed.
    * Installs still fetch packages from their public sources (Go module proxy,
      PyPI, crates.io, npm, winget) - route through a proxy/VPN if the mere
      fact of those download requests is sensitive.

  Flags: -DryRun  -Only <method>  -SkipPrereqs  -Help
#>
[CmdletBinding()]
param(
  [switch]$DryRun,
  [string]$Only = "",
  [switch]$SkipPrereqs,
  [switch]$Help
)

$ErrorActionPreference = 'Continue'
$ProgressPreference    = 'SilentlyContinue'

# ---- OPSEC: opt out of tool telemetry; transmit no host metadata ----
$env:DOTNET_CLI_TELEMETRY_OPTOUT   = '1'
$env:POWERSHELL_TELEMETRY_OPTOUT   = '1'
$env:GOTELEMETRY                   = 'off'
$env:PIP_DISABLE_PIP_VERSION_CHECK = '1'
$env:PYTHONDONTWRITEBYTECODE       = '1'
$env:npm_config_fund               = 'false'
$env:npm_config_audit              = 'false'

$MtHome = if ($env:MINI_TRICKY_HOME) { $env:MINI_TRICKY_HOME } else { Join-Path $HOME '.mini-tricky' }
$MtSrc  = Join-Path $MtHome 'src'
# Make freshly installed tools discoverable within this session.
foreach ($p in @((Join-Path $HOME 'go\bin'), (Join-Path $HOME '.local\bin'), (Join-Path $HOME '.cargo\bin'))) {
  if ((Test-Path $p) -and ($env:PATH -notlike "*$p*")) { $env:PATH = "$env:PATH;$p" }
}

function MtLog  { param([string]$m) Write-Host "[install-tools] $m" -ForegroundColor Cyan }
function MtWarn { param([string]$m) Write-Host "[install-tools] $m" -ForegroundColor Yellow }
function Have   { param([string]$b) $null -ne (Get-Command $b -ErrorAction SilentlyContinue) }
function PyExe  { if (Have 'python') { 'python' } elseif (Have 'python3') { 'python3' } else { '' } }

$script:Ok = @(); $script:Present = @(); $script:Src = @(); $script:Fail = @(); $script:Manual = @()
$script:LastRc = 0
function MtSkip { param([string]$n,[string]$p) Write-Host "[install-tools] $n already installed at $p" -ForegroundColor DarkGray; $script:Present += $n }

if ($Help) {
  Write-Host "Usage: install-tools.ps1 [-DryRun] [-Only <method>] [-SkipPrereqs] [-Help]"
  Write-Host "  -DryRun        print what would be installed, do nothing"
  Write-Host "  -Only <method> only one method: go pip pipx cargo npm gem winget scoop choco manual"
  Write-Host "  -SkipPrereqs   do not attempt to install missing language toolchains"
  exit 0
}

$script:WinPM = ""
function DetectPM {
  if ($script:WinPM) { return }
  if     (Have 'winget') { $script:WinPM = 'winget' }
  elseif (Have 'scoop')  { $script:WinPM = 'scoop'  }
  elseif (Have 'choco')  { $script:WinPM = 'choco'  }
  else                   { $script:WinPM = 'none'   }
}
function BootstrapTool {
  param([string]$WingetId,[string]$ScoopId,[string]$ChocoId)
  DetectPM
  switch ($script:WinPM) {
    'winget' { & winget install --id $WingetId --exact --silent --disable-interactivity --accept-source-agreements --accept-package-agreements; return ($LASTEXITCODE -eq 0) }
    'scoop'  { & scoop install $ScoopId; return ($LASTEXITCODE -eq 0) }
    'choco'  { & choco install $ChocoId -y --no-progress --limit-output; return ($LASTEXITCODE -eq 0) }
    default  { return $false }
  }
}

function EnsureGo    { if (Have 'go')    { return $true } if ($SkipPrereqs) { return $false } MtLog 'bootstrapping Go toolchain'; [void](BootstrapTool 'GoLang.Go' 'go' 'golang'); return (Have 'go') }
function EnsureCargo { if (Have 'cargo') { return $true } if ($SkipPrereqs) { return $false } MtLog 'bootstrapping Rust/cargo';  [void](BootstrapTool 'Rustlang.Rustup' 'rustup' 'rust'); return (Have 'cargo') }
function EnsureNpm   { if (Have 'npm')   { return $true } if ($SkipPrereqs) { return $false } MtLog 'bootstrapping Node/npm';    [void](BootstrapTool 'OpenJS.NodeJS' 'nodejs' 'nodejs'); return (Have 'npm') }
function EnsureGem   { if (Have 'gem')   { return $true } if ($SkipPrereqs) { return $false } MtLog 'bootstrapping Ruby/gem';    [void](BootstrapTool 'RubyInstallerTeam.Ruby' 'ruby' 'ruby'); return (Have 'gem') }
function EnsurePy    { if (PyExe)        { return $true } if ($SkipPrereqs) { return $false } MtLog 'bootstrapping Python';       [void](BootstrapTool 'Python.Python.3.12' 'python' 'python'); return [bool](PyExe) }
function EnsurePipx {
  if (Have 'pipx') { return $true }
  if ($SkipPrereqs) { return $false }
  if (-not (PyExe)) { [void](EnsurePy) }
  $py = PyExe
  if (-not $py) { return $false }
  MtLog 'bootstrapping pipx'
  & $py -m pip install --user pipx *> $null
  $env:PATH = "$env:PATH;" + (Join-Path $HOME '.local\bin')
  if (Have 'pipx') { & pipx ensurepath *> $null; return $true }
  return $false
}

function MtPip {
  param([string]$spec)
  if (EnsurePipx) {
    & pipx install $spec *> $null
    if ($LASTEXITCODE -eq 0) { return $true }
  }
  $py = PyExe
  if (-not $py) { return $false }
  $env:PATH = "$env:PATH;" + (Join-Path $HOME '.local\bin')
  & $py -m pip install --user $spec *> $null
  if ($LASTEXITCODE -eq 0) { return $true }
  & $py -m pip install --user --break-system-packages $spec *> $null
  if ($LASTEXITCODE -eq 0) { return $true }
  return $false
}

function MtInstall {
  param([string]$method,[string]$payload)
  if ($Only -and ($Only -ne $method)) { return }
  if ($DryRun) { Write-Host "   (dry-run $method) $payload" -ForegroundColor DarkGray; return }
  $script:LastRc = 0
  try {
    switch ($method) {
      'go'     { if (EnsureGo)    { & go install $payload;    $script:LastRc = $LASTEXITCODE } else { $script:LastRc = 1 } }
      'pip'    { if (MtPip $payload) { $script:LastRc = 0 } else { $script:LastRc = 1 } }
      'pipx'   { if (EnsurePipx)  { & pipx install $payload;  $script:LastRc = $LASTEXITCODE } else { $script:LastRc = 1 } }
      'cargo'  { if (EnsureCargo) { & cargo install $payload; $script:LastRc = $LASTEXITCODE } else { $script:LastRc = 1 } }
      'npm'    { if (EnsureNpm)   { & npm install -g $payload; $script:LastRc = $LASTEXITCODE } else { $script:LastRc = 1 } }
      'gem'    { if (EnsureGem)   { & gem install $payload;   $script:LastRc = $LASTEXITCODE } else { $script:LastRc = 1 } }
      'winget' { if (Have 'winget') { & winget install --id $payload --exact --silent --disable-interactivity --accept-source-agreements --accept-package-agreements; $script:LastRc = $LASTEXITCODE } else { MtWarn 'winget not available'; $script:LastRc = 1 } }
      'scoop'  { if (Have 'scoop')  { & scoop install $payload; $script:LastRc = $LASTEXITCODE } else { MtWarn 'scoop not available'; $script:LastRc = 1 } }
      'choco'  { if (Have 'choco')  { & choco install $payload -y --no-progress --limit-output; $script:LastRc = $LASTEXITCODE } else { MtWarn 'choco not available'; $script:LastRc = 1 } }
      'manual' { Write-Host "   manual: $payload" -ForegroundColor Yellow; $script:LastRc = 0 }
      default  { $script:LastRc = 0 }
    }
  } catch {
    $script:LastRc = 1
  }
}

function MtRecord {
  param([string]$name,[string]$bin,[string]$method)
  if ($Only -and ($Only -ne $method)) { return }
  if ($DryRun) { return }
  if (Have $bin) { $script:Ok += $name }
  elseif ($method -eq 'manual') { $script:Manual += "$name ($bin)" }
  elseif (($script:LastRc -eq 0) -and ($method -in @('winget','scoop','choco'))) { $script:Src += "$name ($bin)" }
  else { $script:Fail += "$name ($bin)"; MtWarn "could not install $name ($bin)" }
}

function MtSummary {
  Write-Host ""
  MtLog "-------- summary --------"
  MtLog ("installed now: {0}    already present: {1}" -f $script:Ok.Count, $script:Present.Count)
  if ($script:Src.Count -gt 0) {
    MtLog "installed via package manager (verify on PATH after a new shell):"
    $script:Src | ForEach-Object { Write-Host "   - $_" }
  }
  if ($script:Manual.Count -gt 0) {
    MtLog "manual - no safe Windows automation (often easiest under WSL):"
    $script:Manual | ForEach-Object { Write-Host "   - $_" }
  }
  if ($script:Fail.Count -gt 0) {
    MtWarn ("failed: {0}" -f $script:Fail.Count)
    $script:Fail | ForEach-Object { Write-Host "   - $_" }
  }
  MtLog 'PATH hint: add $HOME\go\bin, $HOME\.local\bin, and $HOME\.cargo\bin, then restart your shell'
}

# ---- API -----------------------------------------------------
if (Have 'kr') {
  MtSkip 'Kiterunner' (Get-Command 'kr').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Kiterunner (kr)'
  MtInstall 'go' 'github.com/assetnote/kiterunner/cmd/kr@latest'
  MtRecord 'Kiterunner' 'kr' 'go'
}

if (Have 'APIFuzzer') {
  MtSkip 'APIFuzzer' (Get-Command 'APIFuzzer').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing APIFuzzer (APIFuzzer)'
  MtInstall 'pip' 'APIFuzzer'
  MtRecord 'APIFuzzer' 'APIFuzzer' 'pip'
}

if (Have 'oasdiff') {
  MtSkip 'OpenAPI Diff' (Get-Command 'oasdiff').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing OpenAPI Diff (oasdiff)'
  MtInstall 'go' 'github.com/tufin/oasdiff@latest'
  MtRecord 'OpenAPI Diff' 'oasdiff' 'go'
}

if (Have 'restler') {
  MtSkip 'RESTler' (Get-Command 'restler').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing RESTler (restler)'
  MtInstall 'pip' 'restler-fuzzer'
  MtRecord 'RESTler' 'restler' 'pip'
}

if (Have 'graphw00f') {
  MtSkip 'graphw00f' (Get-Command 'graphw00f').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing graphw00f (graphw00f)'
  MtInstall 'pip' 'graphw00f'
  MtRecord 'graphw00f' 'graphw00f' 'pip'
}

if (Have 'graphql-cop') {
  MtSkip 'GraphQL Cop' (Get-Command 'graphql-cop').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing GraphQL Cop (graphql-cop)'
  MtInstall 'pip' 'graphql-cop'
  MtRecord 'GraphQL Cop' 'graphql-cop' 'pip'
}

if (Have 'clairvoyance') {
  MtSkip 'Clairvoyance' (Get-Command 'clairvoyance').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Clairvoyance (clairvoyance)'
  MtInstall 'pip' 'clairvoyance'
  MtRecord 'Clairvoyance' 'clairvoyance' 'pip'
}

if (Have 'jwt_tool') {
  MtSkip 'JWT Tool' (Get-Command 'jwt_tool').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing JWT Tool (jwt_tool)'
  MtInstall 'pip' 'jwt_tool'
  MtRecord 'JWT Tool' 'jwt_tool' 'pip'
}

# ---- Archive -------------------------------------------------
if (Have 'gau') {
  MtSkip 'GAU' (Get-Command 'gau').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing GAU (gau)'
  MtInstall 'go' 'github.com/lc/gau/v2/cmd/gau@latest'
  MtRecord 'GAU' 'gau' 'go'
}

if (Have 'waymore') {
  MtSkip 'Waymore' (Get-Command 'waymore').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Waymore (waymore)'
  MtInstall 'pip' 'waymore'
  MtRecord 'Waymore' 'waymore' 'pip'
}

# ---- CORS ----------------------------------------------------
if (Have 'cors_scan') {
  MtSkip 'CORScanner' (Get-Command 'cors_scan').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing CORScanner (cors_scan)'
  MtInstall 'pip' 'CORScanner'
  MtRecord 'CORScanner' 'cors_scan' 'pip'
}

if (Have 'crlfuzz') {
  MtSkip 'CRLFuzz' (Get-Command 'crlfuzz').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing CRLFuzz (crlfuzz)'
  MtInstall 'go' 'github.com/dwisiswant0/crlfuzz/cmd/crlfuzz@latest'
  MtRecord 'CRLFuzz' 'crlfuzz' 'go'
}

# ---- CSRF ----------------------------------------------------
if (Have 'xsrfprobe') {
  MtSkip 'XSRFProbe' (Get-Command 'xsrfprobe').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing XSRFProbe (xsrfprobe)'
  MtInstall 'pip' 'xsrfprobe'
  MtRecord 'XSRFProbe' 'xsrfprobe' 'pip'
}

# ---- Cloud ---------------------------------------------------
if (Have 's3scanner') {
  MtSkip 'S3Scanner' (Get-Command 's3scanner').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing S3Scanner (s3scanner)'
  MtInstall 'pip' 's3scanner'
  MtRecord 'S3Scanner' 's3scanner' 'pip'
}

if (Have 'cloud_enum') {
  MtSkip 'Cloud Enum' (Get-Command 'cloud_enum').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Cloud Enum (cloud_enum)'
  MtInstall 'pip' 'cloud_enum'
  MtRecord 'Cloud Enum' 'cloud_enum' 'pip'
}

if (Have 'prowler') {
  MtSkip 'Prowler' (Get-Command 'prowler').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Prowler (prowler)'
  MtInstall 'pip' 'prowler'
  MtRecord 'Prowler' 'prowler' 'pip'
}

if (Have 'scout') {
  MtSkip 'ScoutSuite' (Get-Command 'scout').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing ScoutSuite (scout)'
  MtInstall 'pip' 'scoutsuite'
  MtRecord 'ScoutSuite' 'scout' 'pip'
}

if (Have 'cloudsploit') {
  MtSkip 'CloudSploit' (Get-Command 'cloudsploit').Source
} elseif (-not $Only -or $Only -eq 'npm') {
  MtLog 'Installing CloudSploit (cloudsploit)'
  MtInstall 'npm' 'cloudsploit'
  MtRecord 'CloudSploit' 'cloudsploit' 'npm'
}

if (Have 'gcpbucketbrute') {
  MtSkip 'GCPBucketBrute' (Get-Command 'gcpbucketbrute').Source
} elseif (-not $Only -or $Only -eq 'pipx') {
  MtLog 'Installing GCPBucketBrute (gcpbucketbrute)'
  MtInstall 'pipx' 'gcpbucketbrute'
  MtRecord 'GCPBucketBrute' 'gcpbucketbrute' 'pipx'
}

# ---- Crawling ------------------------------------------------
if (Have 'katana') {
  MtSkip 'Katana' (Get-Command 'katana').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Katana (katana)'
  MtInstall 'go' 'github.com/projectdiscovery/katana/cmd/katana@latest'
  MtRecord 'Katana' 'katana' 'go'
}

if (Have 'gospider') {
  MtSkip 'GoSpider' (Get-Command 'gospider').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing GoSpider (gospider)'
  MtInstall 'go' 'github.com/jaeles-project/gospider@latest'
  MtRecord 'GoSpider' 'gospider' 'go'
}

if (Have 'hakrawler') {
  MtSkip 'Hakrawler' (Get-Command 'hakrawler').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Hakrawler (hakrawler)'
  MtInstall 'go' 'github.com/hakluke/hakrawler@latest'
  MtRecord 'Hakrawler' 'hakrawler' 'go'
}

if (Have 'waybackurls') {
  MtSkip 'Waybackurls' (Get-Command 'waybackurls').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Waybackurls (waybackurls)'
  MtInstall 'go' 'github.com/tomnomnom/waybackurls@latest'
  MtRecord 'Waybackurls' 'waybackurls' 'go'
}

if (Have 'cariddi') {
  MtSkip 'Cariddi' (Get-Command 'cariddi').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Cariddi (cariddi)'
  MtInstall 'go' 'github.com/edoardottt/cariddi/cmd/cariddi@latest'
  MtRecord 'Cariddi' 'cariddi' 'go'
}

if (Have 'crawlergo') {
  MtSkip 'crawlergo' (Get-Command 'crawlergo').Source
} elseif (-not $Only -or $Only -eq 'manual') {
  MtLog 'Installing crawlergo (crawlergo)'
  MtInstall 'manual' 'download a release from https://github.com/Qianlitp/crawlergo/releases'
  MtRecord 'crawlergo' 'crawlergo' 'manual'
}

# ---- Enumeration ---------------------------------------------
if (Have 'gobuster') {
  MtSkip 'Gobuster' (Get-Command 'gobuster').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Gobuster (gobuster)'
  MtInstall 'go' 'github.com/OJ/gobuster/v3@latest'
  MtRecord 'Gobuster' 'gobuster' 'go'
}

if (Have 'dirsearch') {
  MtSkip 'Dirsearch' (Get-Command 'dirsearch').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Dirsearch (dirsearch)'
  MtInstall 'pip' 'dirsearch'
  MtRecord 'Dirsearch' 'dirsearch' 'pip'
}

if (Have 'feroxbuster') {
  MtSkip 'Feroxbuster' (Get-Command 'feroxbuster').Source
} elseif (-not $Only -or $Only -eq 'cargo') {
  MtLog 'Installing Feroxbuster (feroxbuster)'
  MtInstall 'cargo' 'feroxbuster'
  MtRecord 'Feroxbuster' 'feroxbuster' 'cargo'
}

if (Have 'wfuzz') {
  MtSkip 'Wfuzz' (Get-Command 'wfuzz').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Wfuzz (wfuzz)'
  MtInstall 'pip' 'wfuzz'
  MtRecord 'Wfuzz' 'wfuzz' 'pip'
}

if (Have 'cmseek') {
  MtSkip 'CMSeeK' (Get-Command 'cmseek').Source
} elseif (-not $Only -or $Only -eq 'manual') {
  MtLog 'Installing CMSeeK (cmseek)'
  MtInstall 'manual' 'git clone https://github.com/Tuhinshubhra/CMSeeK && pip install -r CMSeeK/requirements.txt'
  MtRecord 'CMSeeK' 'cmseek' 'manual'
}

if (Have 'nomore403') {
  MtSkip 'nomore403' (Get-Command 'nomore403').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing nomore403 (nomore403)'
  MtInstall 'go' 'github.com/devploit/nomore403@latest'
  MtRecord 'nomore403' 'nomore403' 'go'
}

if (Have 'dirb') {
  MtSkip 'Dirb' (Get-Command 'dirb').Source
} elseif (-not $Only -or $Only -eq 'manual') {
  MtLog 'Installing Dirb (dirb)'
  MtInstall 'manual' 'apt install dirb  # or brew install dirb'
  MtRecord 'Dirb' 'dirb' 'manual'
}

if (Have 'shortscan') {
  MtSkip 'Shortscan' (Get-Command 'shortscan').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Shortscan (shortscan)'
  MtInstall 'go' 'github.com/bitquark/shortscan/cmd/shortscan@latest'
  MtRecord 'Shortscan' 'shortscan' 'go'
}

if (Have 'dirhunt') {
  MtSkip 'Dirhunt' (Get-Command 'dirhunt').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Dirhunt (dirhunt)'
  MtInstall 'pip' 'dirhunt'
  MtRecord 'Dirhunt' 'dirhunt' 'pip'
}

if (Have 'byp4xx') {
  MtSkip 'byp4xx' (Get-Command 'byp4xx').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing byp4xx (byp4xx)'
  MtInstall 'go' 'github.com/lobuhi/byp4xx@latest'
  MtRecord 'byp4xx' 'byp4xx' 'go'
}

# ---- Fuzzing -------------------------------------------------
if (Have 'ffuf') {
  MtSkip 'FFUF' (Get-Command 'ffuf').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing FFUF (ffuf)'
  MtInstall 'go' 'github.com/ffuf/ffuf/v2@latest'
  MtRecord 'FFUF' 'ffuf' 'go'
}

# ---- Headers -------------------------------------------------
if (Have 'shcheck') {
  MtSkip 'Shcheck' (Get-Command 'shcheck').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Shcheck (shcheck)'
  MtInstall 'pip' 'shcheck'
  MtRecord 'Shcheck' 'shcheck' 'pip'
}

if (Have 'hakcheckurl') {
  MtSkip 'Hakcheckurl' (Get-Command 'hakcheckurl').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Hakcheckurl (hakcheckurl)'
  MtInstall 'go' 'github.com/hakluke/hakcheckurl@latest'
  MtRecord 'Hakcheckurl' 'hakcheckurl' 'go'
}

# ---- JSAnalysis ----------------------------------------------
if (Have 'linkfinder') {
  MtSkip 'LinkFinder' (Get-Command 'linkfinder').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing LinkFinder (linkfinder)'
  MtInstall 'pip' 'linkfinder'
  MtRecord 'LinkFinder' 'linkfinder' 'pip'
}

if (Have 'SecretFinder') {
  MtSkip 'SecretFinder' (Get-Command 'SecretFinder').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing SecretFinder (SecretFinder)'
  MtInstall 'pip' 'SecretFinder'
  MtRecord 'SecretFinder' 'SecretFinder' 'pip'
}

if (Have 'getJS') {
  MtSkip 'GetJS' (Get-Command 'getJS').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing GetJS (getJS)'
  MtInstall 'go' 'github.com/003random/getJS/v2@latest'
  MtRecord 'GetJS' 'getJS' 'go'
}

if (Have 'subjs') {
  MtSkip 'SubJS' (Get-Command 'subjs').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing SubJS (subjs)'
  MtInstall 'go' 'github.com/lc/subjs@latest'
  MtRecord 'SubJS' 'subjs' 'go'
}

if (Have 'jsluice') {
  MtSkip 'jsluice' (Get-Command 'jsluice').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing jsluice (jsluice)'
  MtInstall 'go' 'github.com/BishopFox/jsluice/cmd/jsluice@latest'
  MtRecord 'jsluice' 'jsluice' 'go'
}

if (Have 'mantra') {
  MtSkip 'Mantra' (Get-Command 'mantra').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Mantra (mantra)'
  MtInstall 'go' 'github.com/MrEmpy/mantra@latest'
  MtRecord 'Mantra' 'mantra' 'go'
}

if (Have 'xnLinkFinder') {
  MtSkip 'xnLinkFinder' (Get-Command 'xnLinkFinder').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing xnLinkFinder (xnLinkFinder)'
  MtInstall 'pip' 'xnLinkFinder'
  MtRecord 'xnLinkFinder' 'xnLinkFinder' 'pip'
}

# ---- Kubernetes ----------------------------------------------
if (Have 'kube-hunter') {
  MtSkip 'kube-hunter' (Get-Command 'kube-hunter').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing kube-hunter (kube-hunter)'
  MtInstall 'pip' 'kube-hunter'
  MtRecord 'kube-hunter' 'kube-hunter' 'pip'
}

if (Have 'kube-bench') {
  MtSkip 'kube-bench' (Get-Command 'kube-bench').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing kube-bench (kube-bench)'
  MtInstall 'go' 'github.com/aquasecurity/kube-bench@latest'
  MtRecord 'kube-bench' 'kube-bench' 'go'
}

if (Have 'kubeaudit') {
  MtSkip 'kubeaudit' (Get-Command 'kubeaudit').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing kubeaudit (kubeaudit)'
  MtInstall 'go' 'github.com/Shopify/kubeaudit@latest'
  MtRecord 'kubeaudit' 'kubeaudit' 'go'
}

if (Have 'trivy') {
  MtSkip 'Trivy' (Get-Command 'trivy').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Trivy (trivy)'
  MtInstall 'go' 'github.com/aquasecurity/trivy/cmd/trivy@latest'
  MtRecord 'Trivy' 'trivy' 'go'
}

if (Have 'kubeletctl') {
  MtSkip 'kubeletctl' (Get-Command 'kubeletctl').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing kubeletctl (kubeletctl)'
  MtInstall 'go' 'github.com/cyberark/kubeletctl@latest'
  MtRecord 'kubeletctl' 'kubeletctl' 'go'
}

if (Have 'popeye') {
  MtSkip 'Popeye' (Get-Command 'popeye').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Popeye (popeye)'
  MtInstall 'go' 'github.com/derailed/popeye@latest'
  MtRecord 'Popeye' 'popeye' 'go'
}

# ---- Network -------------------------------------------------
if (Have 'nmap') {
  MtSkip 'Nmap' (Get-Command 'nmap').Source
} elseif (-not $Only -or $Only -eq 'winget') {
  MtLog 'Installing Nmap (nmap)'
  MtInstall 'winget' 'Insecure.Nmap'
  MtRecord 'Nmap' 'nmap' 'winget'
}

if (Have 'masscan') {
  MtSkip 'Masscan' (Get-Command 'masscan').Source
} elseif (-not $Only -or $Only -eq 'manual') {
  MtLog 'Installing Masscan (masscan)'
  MtInstall 'manual' 'apt install masscan  # or brew install masscan'
  MtRecord 'Masscan' 'masscan' 'manual'
}

if (Have 'naabu') {
  MtSkip 'Naabu' (Get-Command 'naabu').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Naabu (naabu)'
  MtInstall 'go' 'github.com/projectdiscovery/naabu/v2/cmd/naabu@latest'
  MtRecord 'Naabu' 'naabu' 'go'
}

if (Have 'rustscan') {
  MtSkip 'RustScan' (Get-Command 'rustscan').Source
} elseif (-not $Only -or $Only -eq 'cargo') {
  MtLog 'Installing RustScan (rustscan)'
  MtInstall 'cargo' 'rustscan'
  MtRecord 'RustScan' 'rustscan' 'cargo'
}

if (Have 'testssl.sh') {
  MtSkip 'testssl.sh' (Get-Command 'testssl.sh').Source
} elseif (-not $Only -or $Only -eq 'manual') {
  MtLog 'Installing testssl.sh (testssl.sh)'
  MtInstall 'manual' 'git clone https://github.com/drwetter/testssl.sh.git'
  MtRecord 'testssl.sh' 'testssl.sh' 'manual'
}

if (Have 'sslscan') {
  MtSkip 'SSLScan' (Get-Command 'sslscan').Source
} elseif (-not $Only -or $Only -eq 'manual') {
  MtLog 'Installing SSLScan (sslscan)'
  MtInstall 'manual' 'apt install sslscan  # or brew install sslscan'
  MtRecord 'SSLScan' 'sslscan' 'manual'
}

if (Have 'mapcidr') {
  MtSkip 'MapCIDR' (Get-Command 'mapcidr').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing MapCIDR (mapcidr)'
  MtInstall 'go' 'github.com/projectdiscovery/mapcidr/cmd/mapcidr@latest'
  MtRecord 'MapCIDR' 'mapcidr' 'go'
}

if (Have 'cdncheck') {
  MtSkip 'CDNCheck' (Get-Command 'cdncheck').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing CDNCheck (cdncheck)'
  MtInstall 'go' 'github.com/projectdiscovery/cdncheck/cmd/cdncheck@latest'
  MtRecord 'CDNCheck' 'cdncheck' 'go'
}

if (Have 'smap') {
  MtSkip 'Smap' (Get-Command 'smap').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Smap (smap)'
  MtInstall 'go' 'github.com/s0md3v/smap/cmd/smap@latest'
  MtRecord 'Smap' 'smap' 'go'
}

if (Have 'nrich') {
  MtSkip 'nrich' (Get-Command 'nrich').Source
} elseif (-not $Only -or $Only -eq 'cargo') {
  MtLog 'Installing nrich (nrich)'
  MtInstall 'cargo' 'nrich'
  MtRecord 'nrich' 'nrich' 'cargo'
}

# ---- OSINT ---------------------------------------------------
if (Have 'theHarvester') {
  MtSkip 'theHarvester' (Get-Command 'theHarvester').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing theHarvester (theHarvester)'
  MtInstall 'pip' 'theHarvester'
  MtRecord 'theHarvester' 'theHarvester' 'pip'
}

if (Have 'shodan') {
  MtSkip 'Shodan CLI' (Get-Command 'shodan').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Shodan CLI (shodan)'
  MtInstall 'pip' 'shodan'
  MtRecord 'Shodan CLI' 'shodan' 'pip'
}

if (Have 'censys') {
  MtSkip 'Censys' (Get-Command 'censys').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Censys (censys)'
  MtInstall 'pip' 'censys'
  MtRecord 'Censys' 'censys' 'pip'
}

if (Have 'spiderfoot') {
  MtSkip 'SpiderFoot' (Get-Command 'spiderfoot').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing SpiderFoot (spiderfoot)'
  MtInstall 'pip' 'spiderfoot'
  MtRecord 'SpiderFoot' 'spiderfoot' 'pip'
}

if (Have 'github-subdomains') {
  MtSkip 'GitHub Subdomains' (Get-Command 'github-subdomains').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing GitHub Subdomains (github-subdomains)'
  MtInstall 'go' 'github.com/gwen001/github-subdomains@latest'
  MtRecord 'GitHub Subdomains' 'github-subdomains' 'go'
}

if (Have 'gitdorker') {
  MtSkip 'GitDorker' (Get-Command 'gitdorker').Source
} elseif (-not $Only -or $Only -eq 'manual') {
  MtLog 'Installing GitDorker (gitdorker)'
  MtInstall 'manual' 'git clone https://github.com/obheda12/GitDorker && pip install -r GitDorker/requirements.txt'
  MtRecord 'GitDorker' 'gitdorker' 'manual'
}

if (Have 'github-endpoints') {
  MtSkip 'GitHub Endpoints' (Get-Command 'github-endpoints').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing GitHub Endpoints (github-endpoints)'
  MtInstall 'go' 'github.com/gwen001/github-endpoints@latest'
  MtRecord 'GitHub Endpoints' 'github-endpoints' 'go'
}

if (Have 'gitlab-subdomains') {
  MtSkip 'GitLab Subdomains' (Get-Command 'gitlab-subdomains').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing GitLab Subdomains (gitlab-subdomains)'
  MtInstall 'go' 'github.com/gwen001/gitlab-subdomains@latest'
  MtRecord 'GitLab Subdomains' 'gitlab-subdomains' 'go'
}

if (Have 'uncover') {
  MtSkip 'Uncover' (Get-Command 'uncover').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Uncover (uncover)'
  MtInstall 'go' 'github.com/projectdiscovery/uncover/cmd/uncover@latest'
  MtRecord 'Uncover' 'uncover' 'go'
}

# ---- Params --------------------------------------------------
if (Have 'arjun') {
  MtSkip 'Arjun' (Get-Command 'arjun').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Arjun (arjun)'
  MtInstall 'pip' 'arjun'
  MtRecord 'Arjun' 'arjun' 'pip'
}

if (Have 'paramspider') {
  MtSkip 'ParamSpider' (Get-Command 'paramspider').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing ParamSpider (paramspider)'
  MtInstall 'pip' 'paramspider'
  MtRecord 'ParamSpider' 'paramspider' 'pip'
}

if (Have 'x8') {
  MtSkip 'x8' (Get-Command 'x8').Source
} elseif (-not $Only -or $Only -eq 'cargo') {
  MtLog 'Installing x8 (x8)'
  MtInstall 'cargo' 'x8'
  MtRecord 'x8' 'x8' 'cargo'
}

if (Have 'paraminer') {
  MtSkip 'Paraminer' (Get-Command 'paraminer').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Paraminer (paraminer)'
  MtInstall 'pip' 'paraminer'
  MtRecord 'Paraminer' 'paraminer' 'pip'
}

# ---- Recon ---------------------------------------------------
if (Have 'subfinder') {
  MtSkip 'Subfinder' (Get-Command 'subfinder').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Subfinder (subfinder)'
  MtInstall 'go' 'github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest'
  MtRecord 'Subfinder' 'subfinder' 'go'
}

if (Have 'httpx') {
  MtSkip 'HTTPX' (Get-Command 'httpx').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing HTTPX (httpx)'
  MtInstall 'go' 'github.com/projectdiscovery/httpx/cmd/httpx@latest'
  MtRecord 'HTTPX' 'httpx' 'go'
}

if (Have 'amass') {
  MtSkip 'Amass' (Get-Command 'amass').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Amass (amass)'
  MtInstall 'go' 'github.com/owasp-amass/amass/v4/...@master'
  MtRecord 'Amass' 'amass' 'go'
}

if (Have 'assetfinder') {
  MtSkip 'Assetfinder' (Get-Command 'assetfinder').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Assetfinder (assetfinder)'
  MtInstall 'go' 'github.com/tomnomnom/assetfinder@latest'
  MtRecord 'Assetfinder' 'assetfinder' 'go'
}

if (Have 'findomain') {
  MtSkip 'Findomain' (Get-Command 'findomain').Source
} elseif (-not $Only -or $Only -eq 'scoop') {
  MtLog 'Installing Findomain (findomain)'
  MtInstall 'scoop' 'findomain'
  MtRecord 'Findomain' 'findomain' 'scoop'
}

if (Have 'dnsx') {
  MtSkip 'DNSx' (Get-Command 'dnsx').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing DNSx (dnsx)'
  MtInstall 'go' 'github.com/projectdiscovery/dnsx/cmd/dnsx@latest'
  MtRecord 'DNSx' 'dnsx' 'go'
}

if (Have 'shuffledns') {
  MtSkip 'ShuffleDNS' (Get-Command 'shuffledns').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing ShuffleDNS (shuffledns)'
  MtInstall 'go' 'github.com/projectdiscovery/shuffledns/cmd/shuffledns@latest'
  MtRecord 'ShuffleDNS' 'shuffledns' 'go'
}

if (Have 'chaos') {
  MtSkip 'Chaos' (Get-Command 'chaos').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Chaos (chaos)'
  MtInstall 'go' 'github.com/projectdiscovery/chaos-client/cmd/chaos@latest'
  MtRecord 'Chaos' 'chaos' 'go'
}

if (Have 'whatweb') {
  MtSkip 'WhatWeb' (Get-Command 'whatweb').Source
} elseif (-not $Only -or $Only -eq 'gem') {
  MtLog 'Installing WhatWeb (whatweb)'
  MtInstall 'gem' 'whatweb'
  MtRecord 'WhatWeb' 'whatweb' 'gem'
}

if (Have 'wafw00f') {
  MtSkip 'WAFW00F' (Get-Command 'wafw00f').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing WAFW00F (wafw00f)'
  MtInstall 'pip' 'wafw00f'
  MtRecord 'WAFW00F' 'wafw00f' 'pip'
}

if (Have 'puredns') {
  MtSkip 'PureDNS' (Get-Command 'puredns').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing PureDNS (puredns)'
  MtInstall 'go' 'github.com/d3mondev/puredns/v2@latest'
  MtRecord 'PureDNS' 'puredns' 'go'
}

if (Have 'alterx') {
  MtSkip 'AlterX' (Get-Command 'alterx').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing AlterX (alterx)'
  MtInstall 'go' 'github.com/projectdiscovery/alterx/cmd/alterx@latest'
  MtRecord 'AlterX' 'alterx' 'go'
}

if (Have 'dnsgen') {
  MtSkip 'DNSGen' (Get-Command 'dnsgen').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing DNSGen (dnsgen)'
  MtInstall 'pip' 'dnsgen'
  MtRecord 'DNSGen' 'dnsgen' 'pip'
}

if (Have 'gotator') {
  MtSkip 'Gotator' (Get-Command 'gotator').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Gotator (gotator)'
  MtInstall 'go' 'github.com/Josue87/gotator@latest'
  MtRecord 'Gotator' 'gotator' 'go'
}

if (Have 'tlsx') {
  MtSkip 'TLSX' (Get-Command 'tlsx').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing TLSX (tlsx)'
  MtInstall 'go' 'github.com/projectdiscovery/tlsx/cmd/tlsx@latest'
  MtRecord 'TLSX' 'tlsx' 'go'
}

if (Have 'asnmap') {
  MtSkip 'ASNMap' (Get-Command 'asnmap').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing ASNMap (asnmap)'
  MtInstall 'go' 'github.com/projectdiscovery/asnmap/cmd/asnmap@latest'
  MtRecord 'ASNMap' 'asnmap' 'go'
}

if (Have 'cero') {
  MtSkip 'Cero' (Get-Command 'cero').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Cero (cero)'
  MtInstall 'go' 'github.com/glebarez/cero@latest'
  MtRecord 'Cero' 'cero' 'go'
}

if (Have 'gowitness') {
  MtSkip 'GoWitness' (Get-Command 'gowitness').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing GoWitness (gowitness)'
  MtInstall 'go' 'github.com/sensepost/gowitness@latest'
  MtRecord 'GoWitness' 'gowitness' 'go'
}

if (Have 'aquatone') {
  MtSkip 'Aquatone' (Get-Command 'aquatone').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Aquatone (aquatone)'
  MtInstall 'go' 'github.com/michenriksen/aquatone@latest'
  MtRecord 'Aquatone' 'aquatone' 'go'
}

if (Have 'wappalyzer') {
  MtSkip 'Wappalyzer' (Get-Command 'wappalyzer').Source
} elseif (-not $Only -or $Only -eq 'npm') {
  MtLog 'Installing Wappalyzer (wappalyzer)'
  MtInstall 'npm' 'wappalyzer'
  MtRecord 'Wappalyzer' 'wappalyzer' 'npm'
}

if (Have 'httprobe') {
  MtSkip 'httprobe' (Get-Command 'httprobe').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing httprobe (httprobe)'
  MtInstall 'go' 'github.com/tomnomnom/httprobe@latest'
  MtRecord 'httprobe' 'httprobe' 'go'
}

if (Have 'urlfinder') {
  MtSkip 'URLFinder' (Get-Command 'urlfinder').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing URLFinder (urlfinder)'
  MtInstall 'go' 'github.com/projectdiscovery/urlfinder/cmd/urlfinder@latest'
  MtRecord 'URLFinder' 'urlfinder' 'go'
}

if (Have 'hakip2host') {
  MtSkip 'hakip2host' (Get-Command 'hakip2host').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing hakip2host (hakip2host)'
  MtInstall 'go' 'github.com/hakluke/hakip2host@latest'
  MtRecord 'hakip2host' 'hakip2host' 'go'
}

if (Have 'bbot') {
  MtSkip 'BBOT' (Get-Command 'bbot').Source
} elseif (-not $Only -or $Only -eq 'pipx') {
  MtLog 'Installing BBOT (bbot)'
  MtInstall 'pipx' 'bbot'
  MtRecord 'BBOT' 'bbot' 'pipx'
}

if (Have 'crtsh') {
  MtSkip 'crt.sh' (Get-Command 'crtsh').Source
} elseif (-not $Only -or $Only -eq 'pipx') {
  MtLog 'Installing crt.sh (crtsh)'
  MtInstall 'pipx' 'crtsh'
  MtRecord 'crt.sh' 'crtsh' 'pipx'
}

if (Have 'massdns') {
  MtSkip 'MassDNS' (Get-Command 'massdns').Source
} elseif (-not $Only -or $Only -eq 'manual') {
  MtLog 'Installing MassDNS (massdns)'
  MtInstall 'manual' 'apt install massdns  # or build from github.com/blechschmidt/massdns'
  MtRecord 'MassDNS' 'massdns' 'manual'
}

if (Have 'csprecon') {
  MtSkip 'CSPRecon' (Get-Command 'csprecon').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing CSPRecon (csprecon)'
  MtInstall 'go' 'github.com/edoardottt/csprecon/cmd/csprecon@latest'
  MtRecord 'CSPRecon' 'csprecon' 'go'
}

if (Have 'webanalyze') {
  MtSkip 'webanalyze' (Get-Command 'webanalyze').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing webanalyze (webanalyze)'
  MtInstall 'go' 'github.com/rverton/webanalyze/cmd/webanalyze@latest'
  MtRecord 'webanalyze' 'webanalyze' 'go'
}

# ---- SSRF ----------------------------------------------------
if (Have 'ssrfmap') {
  MtSkip 'SSRFmap' (Get-Command 'ssrfmap').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing SSRFmap (ssrfmap)'
  MtInstall 'pip' 'ssrfmap'
  MtRecord 'SSRFmap' 'ssrfmap' 'pip'
}

if (Have 'gopherus') {
  MtSkip 'Gopherus' (Get-Command 'gopherus').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Gopherus (gopherus)'
  MtInstall 'pip' 'gopherus'
  MtRecord 'Gopherus' 'gopherus' 'pip'
}

if (Have 'interactsh-client') {
  MtSkip 'Interactsh' (Get-Command 'interactsh-client').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Interactsh (interactsh-client)'
  MtInstall 'go' 'github.com/projectdiscovery/interactsh/cmd/interactsh-client@latest'
  MtRecord 'Interactsh' 'interactsh-client' 'go'
}

if (Have 'ssrf-sheriff') {
  MtSkip 'SSRF Sheriff' (Get-Command 'ssrf-sheriff').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing SSRF Sheriff (ssrf-sheriff)'
  MtInstall 'pip' 'ssrf-sheriff'
  MtRecord 'SSRF Sheriff' 'ssrf-sheriff' 'pip'
}

# ---- SSTI ----------------------------------------------------
if (Have 'sstimap') {
  MtSkip 'SSTImap' (Get-Command 'sstimap').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing SSTImap (sstimap)'
  MtInstall 'pip' 'sstimap'
  MtRecord 'SSTImap' 'sstimap' 'pip'
}

if (Have 'tplmap') {
  MtSkip 'Tplmap' (Get-Command 'tplmap').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Tplmap (tplmap)'
  MtInstall 'pip' 'tplmap'
  MtRecord 'Tplmap' 'tplmap' 'pip'
}

# ---- Scanner -------------------------------------------------
if (Have 'sniper') {
  MtSkip 'Sn1per' (Get-Command 'sniper').Source
} elseif (-not $Only -or $Only -eq 'manual') {
  MtLog 'Installing Sn1per (sniper)'
  MtInstall 'manual' 'git clone https://github.com/1N3/Sn1per && cd Sn1per && bash install.sh'
  MtRecord 'Sn1per' 'sniper' 'manual'
}

# ---- Secrets -------------------------------------------------
if (Have 'trufflehog') {
  MtSkip 'TruffleHog' (Get-Command 'trufflehog').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing TruffleHog (trufflehog)'
  MtInstall 'go' 'github.com/trufflesecurity/trufflehog/v3@latest'
  MtRecord 'TruffleHog' 'trufflehog' 'go'
}

if (Have 'gitleaks') {
  MtSkip 'Gitleaks' (Get-Command 'gitleaks').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Gitleaks (gitleaks)'
  MtInstall 'go' 'github.com/gitleaks/gitleaks/v8@latest'
  MtRecord 'Gitleaks' 'gitleaks' 'go'
}

if (Have 'semgrep') {
  MtSkip 'Semgrep' (Get-Command 'semgrep').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Semgrep (semgrep)'
  MtInstall 'pip' 'semgrep'
  MtRecord 'Semgrep' 'semgrep' 'pip'
}

# ---- Supply Chain --------------------------------------------
if (Have 'syft') {
  MtSkip 'Syft' (Get-Command 'syft').Source
} elseif (-not $Only -or $Only -eq 'manual') {
  MtLog 'Installing Syft (syft)'
  MtInstall 'manual' 'curl -sSfL https://get.anchore.io/syft | sudo sh -s -- -b /usr/local/bin'
  MtRecord 'Syft' 'syft' 'manual'
}

if (Have 'grype') {
  MtSkip 'Grype' (Get-Command 'grype').Source
} elseif (-not $Only -or $Only -eq 'manual') {
  MtLog 'Installing Grype (grype)'
  MtInstall 'manual' 'curl -sSfL https://get.anchore.io/grype | sudo sh -s -- -b /usr/local/bin'
  MtRecord 'Grype' 'grype' 'manual'
}

# ---- Takeover ------------------------------------------------
if (Have 'subjack') {
  MtSkip 'Subjack' (Get-Command 'subjack').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Subjack (subjack)'
  MtInstall 'go' 'github.com/haccer/subjack@latest'
  MtRecord 'Subjack' 'subjack' 'go'
}

if (Have 'subzy') {
  MtSkip 'Subzy' (Get-Command 'subzy').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Subzy (subzy)'
  MtInstall 'go' 'github.com/PentestPad/subzy@latest'
  MtRecord 'Subzy' 'subzy' 'go'
}

if (Have 'nuclei') {
  MtSkip 'Nuclei Takeover' (Get-Command 'nuclei').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Nuclei Takeover (nuclei)'
  MtInstall 'go' 'github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest'
  MtRecord 'Nuclei Takeover' 'nuclei' 'go'
}

if (Have 'dnsreaper') {
  MtSkip 'DNSReaper' (Get-Command 'dnsreaper').Source
} elseif (-not $Only -or $Only -eq 'pipx') {
  MtLog 'Installing DNSReaper (dnsreaper)'
  MtInstall 'pipx' 'dnsReaper'
  MtRecord 'DNSReaper' 'dnsreaper' 'pipx'
}

# ---- Utility -------------------------------------------------
if (Have 'anew') {
  MtSkip 'Anew' (Get-Command 'anew').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Anew (anew)'
  MtInstall 'go' 'github.com/tomnomnom/anew@latest'
  MtRecord 'Anew' 'anew' 'go'
}

if (Have 'qsreplace') {
  MtSkip 'QSReplace' (Get-Command 'qsreplace').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing QSReplace (qsreplace)'
  MtInstall 'go' 'github.com/tomnomnom/qsreplace@latest'
  MtRecord 'QSReplace' 'qsreplace' 'go'
}

if (Have 'uro') {
  MtSkip 'URO' (Get-Command 'uro').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing URO (uro)'
  MtInstall 'pip' 'uro'
  MtRecord 'URO' 'uro' 'pip'
}

if (Have 'unfurl') {
  MtSkip 'Unfurl' (Get-Command 'unfurl').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Unfurl (unfurl)'
  MtInstall 'go' 'github.com/tomnomnom/unfurl@latest'
  MtRecord 'Unfurl' 'unfurl' 'go'
}

if (Have 'jq') {
  MtSkip 'JQ Filter' (Get-Command 'jq').Source
} elseif (-not $Only -or $Only -eq 'winget') {
  MtLog 'Installing JQ Filter (jq)'
  MtInstall 'winget' 'jqlang.jq'
  MtRecord 'JQ Filter' 'jq' 'winget'
}

if (Have 'gf') {
  MtSkip 'GF Patterns' (Get-Command 'gf').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing GF Patterns (gf)'
  MtInstall 'go' 'github.com/tomnomnom/gf@latest'
  MtRecord 'GF Patterns' 'gf' 'go'
}

if (Have 'interlace') {
  MtSkip 'Interlace' (Get-Command 'interlace').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Interlace (interlace)'
  MtInstall 'pip' 'interlace'
  MtRecord 'Interlace' 'interlace' 'pip'
}

if (Have 'rush') {
  MtSkip 'Rush' (Get-Command 'rush').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Rush (rush)'
  MtInstall 'go' 'github.com/shenwei356/rush@latest'
  MtRecord 'Rush' 'rush' 'go'
}

if (Have 'notify') {
  MtSkip 'Notify' (Get-Command 'notify').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Notify (notify)'
  MtInstall 'go' 'github.com/projectdiscovery/notify/cmd/notify@latest'
  MtRecord 'Notify' 'notify' 'go'
}

if (Have 'meg') {
  MtSkip 'Meg' (Get-Command 'meg').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Meg (meg)'
  MtInstall 'go' 'github.com/tomnomnom/meg@latest'
  MtRecord 'Meg' 'meg' 'go'
}

if (Have 'dsieve') {
  MtSkip 'dsieve' (Get-Command 'dsieve').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing dsieve (dsieve)'
  MtInstall 'go' 'github.com/trickest/dsieve@latest'
  MtRecord 'dsieve' 'dsieve' 'go'
}

if (Have 'dnsvalidator') {
  MtSkip 'DNSValidator' (Get-Command 'dnsvalidator').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing DNSValidator (dnsvalidator)'
  MtInstall 'pip' 'dnsvalidator'
  MtRecord 'DNSValidator' 'dnsvalidator' 'pip'
}

# ---- Vulnerability -------------------------------------------
if (Have 'nikto') {
  MtSkip 'Nikto' (Get-Command 'nikto').Source
} elseif (-not $Only -or $Only -eq 'manual') {
  MtLog 'Installing Nikto (nikto)'
  MtInstall 'manual' 'apt install nikto  # or brew install nikto'
  MtRecord 'Nikto' 'nikto' 'manual'
}

if (Have 'wpscan') {
  MtSkip 'WPScan' (Get-Command 'wpscan').Source
} elseif (-not $Only -or $Only -eq 'gem') {
  MtLog 'Installing WPScan (wpscan)'
  MtInstall 'gem' 'wpscan'
  MtRecord 'WPScan' 'wpscan' 'gem'
}

if (Have 'sqlmap') {
  MtSkip 'SQLMap' (Get-Command 'sqlmap').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing SQLMap (sqlmap)'
  MtInstall 'pip' 'sqlmap'
  MtRecord 'SQLMap' 'sqlmap' 'pip'
}

if (Have 'xsstrike') {
  MtSkip 'XSStrike' (Get-Command 'xsstrike').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing XSStrike (xsstrike)'
  MtInstall 'pip' 'XSStrike'
  MtRecord 'XSStrike' 'xsstrike' 'pip'
}

if (Have 'dalfox') {
  MtSkip 'Dalfox' (Get-Command 'dalfox').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Dalfox (dalfox)'
  MtInstall 'go' 'github.com/hahwul/dalfox/v2@latest'
  MtRecord 'Dalfox' 'dalfox' 'go'
}

if (Have 'ghauri') {
  MtSkip 'Ghauri' (Get-Command 'ghauri').Source
} elseif (-not $Only -or $Only -eq 'pipx') {
  MtLog 'Installing Ghauri (ghauri)'
  MtInstall 'pipx' 'ghauri'
  MtRecord 'Ghauri' 'ghauri' 'pipx'
}

if (Have 'commix') {
  MtSkip 'Commix' (Get-Command 'commix').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Commix (commix)'
  MtInstall 'pip' 'commix'
  MtRecord 'Commix' 'commix' 'pip'
}

if (Have 'jaeles') {
  MtSkip 'Jaeles' (Get-Command 'jaeles').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Jaeles (jaeles)'
  MtInstall 'go' 'github.com/jaeles-project/jaeles@latest'
  MtRecord 'Jaeles' 'jaeles' 'go'
}

if (Have 'joomscan') {
  MtSkip 'JoomScan' (Get-Command 'joomscan').Source
} elseif (-not $Only -or $Only -eq 'manual') {
  MtLog 'Installing JoomScan (joomscan)'
  MtInstall 'manual' 'apt install joomscan  # or git clone https://github.com/OWASP/joomscan'
  MtRecord 'JoomScan' 'joomscan' 'manual'
}

if (Have 'droopescan') {
  MtSkip 'Droopescan' (Get-Command 'droopescan').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Droopescan (droopescan)'
  MtInstall 'pip' 'droopescan'
  MtRecord 'Droopescan' 'droopescan' 'pip'
}

if (Have 'oralyzer') {
  MtSkip 'Oralyzer' (Get-Command 'oralyzer').Source
} elseif (-not $Only -or $Only -eq 'manual') {
  MtLog 'Installing Oralyzer (oralyzer)'
  MtInstall 'manual' 'git clone https://github.com/r0075h3ll/Oralyzer && pip install -r Oralyzer/requirements.txt'
  MtRecord 'Oralyzer' 'oralyzer' 'manual'
}

if (Have 'Gxss') {
  MtSkip 'Gxss' (Get-Command 'Gxss').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing Gxss (Gxss)'
  MtInstall 'go' 'github.com/KathanP19/Gxss@latest'
  MtRecord 'Gxss' 'Gxss' 'go'
}

if (Have 'kxss') {
  MtSkip 'kxss' (Get-Command 'kxss').Source
} elseif (-not $Only -or $Only -eq 'go') {
  MtLog 'Installing kxss (kxss)'
  MtInstall 'go' 'github.com/tomnomnom/hacks/kxss@latest'
  MtRecord 'kxss' 'kxss' 'go'
}

if (Have 'smuggler') {
  MtSkip 'Smuggler' (Get-Command 'smuggler').Source
} elseif (-not $Only -or $Only -eq 'manual') {
  MtLog 'Installing Smuggler (smuggler)'
  MtInstall 'manual' 'git clone https://github.com/defparam/smuggler && cd smuggler  # run: python3 smuggler.py'
  MtRecord 'Smuggler' 'smuggler' 'manual'
}

if (Have 'retire') {
  MtSkip 'Retire.js' (Get-Command 'retire').Source
} elseif (-not $Only -or $Only -eq 'npm') {
  MtLog 'Installing Retire.js (retire)'
  MtInstall 'npm' 'retire'
  MtRecord 'Retire.js' 'retire' 'npm'
}

if (Have 'ppfuzz') {
  MtSkip 'ppfuzz' (Get-Command 'ppfuzz').Source
} elseif (-not $Only -or $Only -eq 'cargo') {
  MtLog 'Installing ppfuzz (ppfuzz)'
  MtInstall 'cargo' 'ppfuzz'
  MtRecord 'ppfuzz' 'ppfuzz' 'cargo'
}

if (Have 'wapiti') {
  MtSkip 'Wapiti' (Get-Command 'wapiti').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Wapiti (wapiti)'
  MtInstall 'pip' 'wapiti3'
  MtRecord 'Wapiti' 'wapiti' 'pip'
}

if (Have 'zap-baseline.py') {
  MtSkip 'OWASP ZAP' (Get-Command 'zap-baseline.py').Source
} elseif (-not $Only -or $Only -eq 'manual') {
  MtLog 'Installing OWASP ZAP (zap-baseline.py)'
  MtInstall 'manual' 'docker pull ghcr.io/zaproxy/zaproxy:stable  # provides zap-baseline.py'
  MtRecord 'OWASP ZAP' 'zap-baseline.py' 'manual'
}

# ---- Wordlist ------------------------------------------------
if (Have 'cewl') {
  MtSkip 'CeWL' (Get-Command 'cewl').Source
} elseif (-not $Only -or $Only -eq 'gem') {
  MtLog 'Installing CeWL (cewl)'
  MtInstall 'gem' 'cewl'
  MtRecord 'CeWL' 'cewl' 'gem'
}

if (Have 'wordlister') {
  MtSkip 'Wordlister' (Get-Command 'wordlister').Source
} elseif (-not $Only -or $Only -eq 'pip') {
  MtLog 'Installing Wordlister (wordlister)'
  MtInstall 'pip' 'wordlister'
  MtRecord 'Wordlister' 'wordlister' 'pip'
}

MtSummary
