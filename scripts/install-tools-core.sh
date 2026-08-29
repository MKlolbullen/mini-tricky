#!/usr/bin/env bash
#
# install-tools.sh — bootstrap the security binaries mini-tricky drives.
#
# Generated from backend/src/main.py::_generate_install_script. Re-generate with:
#   curl -s http://localhost:8000/api/tools/install-script > scripts/install-tools-core.sh
#
# Idempotent: every tool is guarded by `command -v`, so re-running only installs
# what is still missing. The runtime detects the host package manager, bootstraps
# the language toolchains it needs (go / pipx / cargo / npm / gem), never aborts
# on a single failure, and prints a summary of what installed, was already
# present, came from source, or failed.
#
# Flags:  --dry-run            print what would be installed, do nothing
#         --only <method>      only go|pip|pipx|cargo|npm|gem|pm|git|sh tools
#         --skip-prereqs       do not try to install missing toolchains
#         -h | --help          show usage
# Env:    MINI_TRICKY_HOME     base dir for source checkouts (default ~/.mini-tricky)
#
set -euo pipefail

MT_HOME="${MINI_TRICKY_HOME:-$HOME/.mini-tricky}"
MT_SRC_DIR="$MT_HOME/src"
MT_DRY_RUN=""
MT_ONLY=""
MT_SKIP_PREREQS=""

if [[ -t 1 ]]; then
  C_CYAN=$'\033[1;36m'; C_DIM=$'\033[2m'; C_YEL=$'\033[1;33m'; C_RED=$'\033[1;31m'; C_RST=$'\033[0m'
else
  C_CYAN=""; C_DIM=""; C_YEL=""; C_RED=""; C_RST=""
fi
log()  { printf '%s[install-tools]%s %s\n' "$C_CYAN" "$C_RST" "$*"; }
warn() { printf '%s[install-tools]%s %s\n' "$C_YEL" "$C_RST" "$*" >&2; }
err()  { printf '%s[install-tools]%s %s\n' "$C_RED" "$C_RST" "$*" >&2; }

MT_OK=(); MT_SKIP=(); MT_SRC=(); MT_FAIL=(); MT_LAST_RC=0
skip() { printf '%s[install-tools] %s already installed at %s%s\n' "$C_DIM" "$1" "$2" "$C_RST"; MT_SKIP+=("$1"); }

usage() {
  cat <<'USAGE'
Usage: install-tools.sh [--dry-run] [--only <method>] [--skip-prereqs] [-h]
  --dry-run        print what would be installed, do nothing
  --only <method>  only install one method: go pip pipx cargo npm gem pm git sh
  --skip-prereqs   do not attempt to install missing language toolchains
  -h, --help       show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) MT_DRY_RUN=1 ;;
    --only) MT_ONLY="${2:-}"; shift ;;
    --only=*) MT_ONLY="${1#*=}" ;;
    --skip-prereqs) MT_SKIP_PREREQS=1 ;;
    -h|--help) usage; exit 0 ;;
    *) warn "unknown option: $1" ;;
  esac
  shift
done

MT_SUDO=""
if [[ "$(id -u)" -ne 0 ]] && command -v sudo >/dev/null 2>&1; then MT_SUDO="sudo"; fi
MT_PM=""
detect_pm() {
  [[ -n "$MT_PM" ]] && return 0
  if   command -v apt-get >/dev/null 2>&1; then MT_PM="apt"
  elif command -v dnf     >/dev/null 2>&1; then MT_PM="dnf"
  elif command -v yum     >/dev/null 2>&1; then MT_PM="yum"
  elif command -v pacman  >/dev/null 2>&1; then MT_PM="pacman"
  elif command -v zypper  >/dev/null 2>&1; then MT_PM="zypper"
  elif command -v apk     >/dev/null 2>&1; then MT_PM="apk"
  elif command -v brew    >/dev/null 2>&1; then MT_PM="brew"
  else MT_PM="none"; fi
}
pm_install() {
  detect_pm
  case "$MT_PM" in
    apt)    $MT_SUDO apt-get update -qq && $MT_SUDO apt-get install -y "$@" ;;
    dnf)    $MT_SUDO dnf install -y "$@" ;;
    yum)    $MT_SUDO yum install -y "$@" ;;
    pacman) $MT_SUDO pacman -Sy --noconfirm "$@" ;;
    zypper) $MT_SUDO zypper install -y "$@" ;;
    apk)    $MT_SUDO apk add "$@" ;;
    brew)   brew install "$@" ;;
    *)      err "no supported package manager to install: $*"; return 1 ;;
  esac
}

_go_path() {
  local gobin; gobin="$(go env GOBIN 2>/dev/null || true)"
  [[ -z "$gobin" ]] && gobin="$(go env GOPATH 2>/dev/null || true)/bin"
  case ":$PATH:" in *":$gobin:"*) : ;; *) export PATH="$PATH:$gobin" ;; esac
}
ensure_go() {
  if command -v go >/dev/null 2>&1; then _go_path; return 0; fi
  [[ -n "$MT_SKIP_PREREQS" ]] && return 1
  log "bootstrapping Go toolchain"
  pm_install golang-go || pm_install golang || pm_install go || return 1
  command -v go >/dev/null 2>&1 && { _go_path; return 0; } || return 1
}
ensure_pipx() {
  command -v pipx >/dev/null 2>&1 && return 0
  [[ -n "$MT_SKIP_PREREQS" ]] && return 1
  log "bootstrapping pipx"
  python3 -m pip install --user pipx >/dev/null 2>&1 \
    || python3 -m pip install --user --break-system-packages pipx >/dev/null 2>&1 \
    || pm_install pipx || return 1
  export PATH="$PATH:$HOME/.local/bin"
  command -v pipx >/dev/null 2>&1 || return 1
  pipx ensurepath >/dev/null 2>&1 || true
}
ensure_cargo() {
  command -v cargo >/dev/null 2>&1 && return 0
  [[ -n "$MT_SKIP_PREREQS" ]] && return 1
  log "bootstrapping Rust/cargo"
  pm_install cargo || pm_install rust || return 1
  command -v cargo >/dev/null 2>&1
}
ensure_npm() {
  command -v npm >/dev/null 2>&1 && return 0
  [[ -n "$MT_SKIP_PREREQS" ]] && return 1
  log "bootstrapping Node/npm"
  pm_install npm || pm_install nodejs || return 1
  command -v npm >/dev/null 2>&1
}
ensure_gem() {
  command -v gem >/dev/null 2>&1 && return 0
  [[ -n "$MT_SKIP_PREREQS" ]] && return 1
  log "bootstrapping Ruby/gem"
  pm_install ruby || return 1
  command -v gem >/dev/null 2>&1
}
ensure_git() {
  command -v git >/dev/null 2>&1 && return 0
  [[ -n "$MT_SKIP_PREREQS" ]] && return 1
  pm_install git
}

mt_pip() {
  ensure_pipx && pipx install "$1" >/dev/null 2>&1 && return 0
  export PATH="$PATH:$HOME/.local/bin"
  python3 -m pip install --user "$1" >/dev/null 2>&1 && return 0
  python3 -m pip install --user --break-system-packages "$1" >/dev/null 2>&1 && return 0
  return 1
}
mt_gem() { gem install "$1" >/dev/null 2>&1 || gem install --user-install "$1"; }
mt_git() { mkdir -p "$MT_SRC_DIR"; ( cd "$MT_SRC_DIR" && eval "$1" ); }

_mt_install() {
  local method="$1" payload="$2"
  if [[ -n "$MT_ONLY" && "$MT_ONLY" != "$method" ]]; then return 0; fi
  if [[ -n "$MT_DRY_RUN" ]]; then printf '   %s(dry-run %s)%s %s\n' "$C_DIM" "$method" "$C_RST" "$payload"; return 0; fi
  MT_LAST_RC=0
  set +e
  case "$method" in
    go)    ensure_go    && eval "$payload" ;;
    pip)   mt_pip "$payload" ;;
    pipx)  ensure_pipx  && pipx install "$payload" ;;
    cargo) ensure_cargo && cargo install "$payload" ;;
    npm)   ensure_npm   && npm install -g "$payload" ;;
    gem)   ensure_gem   && mt_gem "$payload" ;;
    pm)    pm_install $payload ;;
    git)   ensure_git   && mt_git "$payload" ;;
    sh)    eval "$payload" ;;
    manual) printf '   %smanual step:%s %s\n' "$C_YEL" "$C_RST" "$payload" ;;
    *)     eval "$payload" ;;
  esac
  MT_LAST_RC=$?
  set -e
  return 0
}

_mt_record() {
  [[ -n "$MT_ONLY" && "$MT_ONLY" != "$3" ]] && return 0
  [[ -n "$MT_DRY_RUN" ]] && return 0
  if command -v "$2" >/dev/null 2>&1; then
    MT_OK+=("$1")
  elif [[ "$MT_LAST_RC" -eq 0 && ( "$3" == "git" || "$3" == "sh" || "$3" == "manual" ) ]]; then
    MT_SRC+=("$1 ($2)")
  else
    MT_FAIL+=("$1 ($2)")
    warn "could not install $1 ($2)"
  fi
}

_mt_summary() {
  echo
  log "──────── summary ────────"
  log "installed now: ${#MT_OK[@]}    already present: ${#MT_SKIP[@]}"
  if [[ ${#MT_SRC[@]} -gt 0 ]]; then
    log "from source / container (verify these are on your PATH):"
    for t in "${MT_SRC[@]}"; do printf '   - %s\n' "$t"; done
  fi
  if [[ ${#MT_FAIL[@]} -gt 0 ]]; then
    err "failed: ${#MT_FAIL[@]}"
    for t in "${MT_FAIL[@]}"; do printf '   - %s\n' "$t"; done
    warn "re-run after installing the needed toolchain, or install these by hand."
  fi
  log "PATH hint: add \$(go env GOPATH 2>/dev/null)/bin, \$HOME/.local/bin, and \$HOME/.cargo/bin"
}
trap _mt_summary EXIT

# ── API ─────────────────────────────────────────────────────────
if command -v kr >/dev/null 2>&1; then
  skip "Kiterunner" "$(command -v kr)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Kiterunner (kr)"
  _mt_install 'go' 'go install github.com/assetnote/kiterunner/cmd/kr@latest'
  _mt_record "Kiterunner" "kr" "go"
fi

if command -v APIFuzzer >/dev/null 2>&1; then
  skip "APIFuzzer" "$(command -v APIFuzzer)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing APIFuzzer (APIFuzzer)"
  _mt_install 'pip' 'APIFuzzer'
  _mt_record "APIFuzzer" "APIFuzzer" "pip"
fi

if command -v oasdiff >/dev/null 2>&1; then
  skip "OpenAPI Diff" "$(command -v oasdiff)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing OpenAPI Diff (oasdiff)"
  _mt_install 'go' 'go install github.com/tufin/oasdiff@latest'
  _mt_record "OpenAPI Diff" "oasdiff" "go"
fi

if command -v restler >/dev/null 2>&1; then
  skip "RESTler" "$(command -v restler)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing RESTler (restler)"
  _mt_install 'pip' 'restler-fuzzer'
  _mt_record "RESTler" "restler" "pip"
fi

if command -v graphw00f >/dev/null 2>&1; then
  skip "graphw00f" "$(command -v graphw00f)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing graphw00f (graphw00f)"
  _mt_install 'pip' 'graphw00f'
  _mt_record "graphw00f" "graphw00f" "pip"
fi

if command -v graphql-cop >/dev/null 2>&1; then
  skip "GraphQL Cop" "$(command -v graphql-cop)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing GraphQL Cop (graphql-cop)"
  _mt_install 'pip' 'graphql-cop'
  _mt_record "GraphQL Cop" "graphql-cop" "pip"
fi

if command -v clairvoyance >/dev/null 2>&1; then
  skip "Clairvoyance" "$(command -v clairvoyance)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Clairvoyance (clairvoyance)"
  _mt_install 'pip' 'clairvoyance'
  _mt_record "Clairvoyance" "clairvoyance" "pip"
fi

if command -v jwt_tool >/dev/null 2>&1; then
  skip "JWT Tool" "$(command -v jwt_tool)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing JWT Tool (jwt_tool)"
  _mt_install 'pip' 'jwt_tool'
  _mt_record "JWT Tool" "jwt_tool" "pip"
fi

# ── Archive ─────────────────────────────────────────────────────
if command -v gau >/dev/null 2>&1; then
  skip "GAU" "$(command -v gau)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing GAU (gau)"
  _mt_install 'go' 'go install -v github.com/lc/gau/v2/cmd/gau@latest'
  _mt_record "GAU" "gau" "go"
fi

if command -v waymore >/dev/null 2>&1; then
  skip "Waymore" "$(command -v waymore)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Waymore (waymore)"
  _mt_install 'pip' 'waymore'
  _mt_record "Waymore" "waymore" "pip"
fi

# ── CORS ────────────────────────────────────────────────────────
if command -v cors_scan >/dev/null 2>&1; then
  skip "CORScanner" "$(command -v cors_scan)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing CORScanner (cors_scan)"
  _mt_install 'pip' 'CORScanner'
  _mt_record "CORScanner" "cors_scan" "pip"
fi

if command -v crlfuzz >/dev/null 2>&1; then
  skip "CRLFuzz" "$(command -v crlfuzz)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing CRLFuzz (crlfuzz)"
  _mt_install 'go' 'go install github.com/dwisiswant0/crlfuzz/cmd/crlfuzz@latest'
  _mt_record "CRLFuzz" "crlfuzz" "go"
fi

# ── CSRF ────────────────────────────────────────────────────────
if command -v xsrfprobe >/dev/null 2>&1; then
  skip "XSRFProbe" "$(command -v xsrfprobe)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing XSRFProbe (xsrfprobe)"
  _mt_install 'pip' 'xsrfprobe'
  _mt_record "XSRFProbe" "xsrfprobe" "pip"
fi

# ── Cloud ───────────────────────────────────────────────────────
if command -v s3scanner >/dev/null 2>&1; then
  skip "S3Scanner" "$(command -v s3scanner)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing S3Scanner (s3scanner)"
  _mt_install 'pip' 's3scanner'
  _mt_record "S3Scanner" "s3scanner" "pip"
fi

if command -v cloud_enum >/dev/null 2>&1; then
  skip "Cloud Enum" "$(command -v cloud_enum)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Cloud Enum (cloud_enum)"
  _mt_install 'pip' 'cloud_enum'
  _mt_record "Cloud Enum" "cloud_enum" "pip"
fi

if command -v prowler >/dev/null 2>&1; then
  skip "Prowler" "$(command -v prowler)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Prowler (prowler)"
  _mt_install 'pip' 'prowler'
  _mt_record "Prowler" "prowler" "pip"
fi

if command -v scout >/dev/null 2>&1; then
  skip "ScoutSuite" "$(command -v scout)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing ScoutSuite (scout)"
  _mt_install 'pip' 'scoutsuite'
  _mt_record "ScoutSuite" "scout" "pip"
fi

if command -v cloudsploit >/dev/null 2>&1; then
  skip "CloudSploit" "$(command -v cloudsploit)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "npm" ]]; then
  log "Installing CloudSploit (cloudsploit)"
  _mt_install 'npm' 'cloudsploit'
  _mt_record "CloudSploit" "cloudsploit" "npm"
fi

if command -v gcpbucketbrute >/dev/null 2>&1; then
  skip "GCPBucketBrute" "$(command -v gcpbucketbrute)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pipx" ]]; then
  log "Installing GCPBucketBrute (gcpbucketbrute)"
  _mt_install 'pipx' 'gcpbucketbrute'
  _mt_record "GCPBucketBrute" "gcpbucketbrute" "pipx"
fi

# ── Crawling ────────────────────────────────────────────────────
if command -v katana >/dev/null 2>&1; then
  skip "Katana" "$(command -v katana)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Katana (katana)"
  _mt_install 'go' 'go install -v github.com/projectdiscovery/katana/cmd/katana@latest'
  _mt_record "Katana" "katana" "go"
fi

if command -v gospider >/dev/null 2>&1; then
  skip "GoSpider" "$(command -v gospider)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing GoSpider (gospider)"
  _mt_install 'go' 'go install -v github.com/jaeles-project/gospider@latest'
  _mt_record "GoSpider" "gospider" "go"
fi

if command -v hakrawler >/dev/null 2>&1; then
  skip "Hakrawler" "$(command -v hakrawler)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Hakrawler (hakrawler)"
  _mt_install 'go' 'go install -v github.com/hakluke/hakrawler@latest'
  _mt_record "Hakrawler" "hakrawler" "go"
fi

if command -v waybackurls >/dev/null 2>&1; then
  skip "Waybackurls" "$(command -v waybackurls)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Waybackurls (waybackurls)"
  _mt_install 'go' 'go install -v github.com/tomnomnom/waybackurls@latest'
  _mt_record "Waybackurls" "waybackurls" "go"
fi

if command -v cariddi >/dev/null 2>&1; then
  skip "Cariddi" "$(command -v cariddi)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Cariddi (cariddi)"
  _mt_install 'go' 'go install github.com/edoardottt/cariddi/cmd/cariddi@latest'
  _mt_record "Cariddi" "cariddi" "go"
fi

if command -v crawlergo >/dev/null 2>&1; then
  skip "crawlergo" "$(command -v crawlergo)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "manual" ]]; then
  log "Installing crawlergo (crawlergo)"
  _mt_install 'manual' 'download a release from https://github.com/Qianlitp/crawlergo/releases'
  _mt_record "crawlergo" "crawlergo" "manual"
fi

# ── Enumeration ─────────────────────────────────────────────────
if command -v gobuster >/dev/null 2>&1; then
  skip "Gobuster" "$(command -v gobuster)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Gobuster (gobuster)"
  _mt_install 'go' 'go install github.com/OJ/gobuster/v3@latest'
  _mt_record "Gobuster" "gobuster" "go"
fi

if command -v dirsearch >/dev/null 2>&1; then
  skip "Dirsearch" "$(command -v dirsearch)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Dirsearch (dirsearch)"
  _mt_install 'pip' 'dirsearch'
  _mt_record "Dirsearch" "dirsearch" "pip"
fi

if command -v feroxbuster >/dev/null 2>&1; then
  skip "Feroxbuster" "$(command -v feroxbuster)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "sh" ]]; then
  log "Installing Feroxbuster (feroxbuster)"
  _mt_install 'sh' 'curl -sL https://raw.githubusercontent.com/epi052/feroxbuster/main/install-nix.sh | bash'
  _mt_record "Feroxbuster" "feroxbuster" "sh"
fi

if command -v wfuzz >/dev/null 2>&1; then
  skip "Wfuzz" "$(command -v wfuzz)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Wfuzz (wfuzz)"
  _mt_install 'pip' 'wfuzz'
  _mt_record "Wfuzz" "wfuzz" "pip"
fi

if command -v cmseek >/dev/null 2>&1; then
  skip "CMSeeK" "$(command -v cmseek)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "git" ]]; then
  log "Installing CMSeeK (cmseek)"
  _mt_install 'git' 'git clone https://github.com/Tuhinshubhra/CMSeeK && pip install -r CMSeeK/requirements.txt'
  _mt_record "CMSeeK" "cmseek" "git"
fi

if command -v nomore403 >/dev/null 2>&1; then
  skip "nomore403" "$(command -v nomore403)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing nomore403 (nomore403)"
  _mt_install 'go' 'go install github.com/devploit/nomore403@latest'
  _mt_record "nomore403" "nomore403" "go"
fi

if command -v dirb >/dev/null 2>&1; then
  skip "Dirb" "$(command -v dirb)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pm" ]]; then
  log "Installing Dirb (dirb)"
  _mt_install 'pm' 'dirb'
  _mt_record "Dirb" "dirb" "pm"
fi

if command -v shortscan >/dev/null 2>&1; then
  skip "Shortscan" "$(command -v shortscan)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Shortscan (shortscan)"
  _mt_install 'go' 'go install github.com/bitquark/shortscan/cmd/shortscan@latest'
  _mt_record "Shortscan" "shortscan" "go"
fi

if command -v dirhunt >/dev/null 2>&1; then
  skip "Dirhunt" "$(command -v dirhunt)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Dirhunt (dirhunt)"
  _mt_install 'pip' 'dirhunt'
  _mt_record "Dirhunt" "dirhunt" "pip"
fi

if command -v byp4xx >/dev/null 2>&1; then
  skip "byp4xx" "$(command -v byp4xx)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing byp4xx (byp4xx)"
  _mt_install 'go' 'go install github.com/lobuhi/byp4xx@latest'
  _mt_record "byp4xx" "byp4xx" "go"
fi

# ── Fuzzing ─────────────────────────────────────────────────────
if command -v ffuf >/dev/null 2>&1; then
  skip "FFUF" "$(command -v ffuf)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing FFUF (ffuf)"
  _mt_install 'go' 'go install -v github.com/ffuf/ffuf/v2@latest'
  _mt_record "FFUF" "ffuf" "go"
fi

# ── Headers ─────────────────────────────────────────────────────
if command -v shcheck >/dev/null 2>&1; then
  skip "Shcheck" "$(command -v shcheck)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Shcheck (shcheck)"
  _mt_install 'pip' 'shcheck'
  _mt_record "Shcheck" "shcheck" "pip"
fi

if command -v hakcheckurl >/dev/null 2>&1; then
  skip "Hakcheckurl" "$(command -v hakcheckurl)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Hakcheckurl (hakcheckurl)"
  _mt_install 'go' 'go install github.com/hakluke/hakcheckurl@latest'
  _mt_record "Hakcheckurl" "hakcheckurl" "go"
fi

# ── JSAnalysis ──────────────────────────────────────────────────
if command -v linkfinder >/dev/null 2>&1; then
  skip "LinkFinder" "$(command -v linkfinder)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing LinkFinder (linkfinder)"
  _mt_install 'pip' 'linkfinder'
  _mt_record "LinkFinder" "linkfinder" "pip"
fi

if command -v SecretFinder >/dev/null 2>&1; then
  skip "SecretFinder" "$(command -v SecretFinder)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing SecretFinder (SecretFinder)"
  _mt_install 'pip' 'SecretFinder'
  _mt_record "SecretFinder" "SecretFinder" "pip"
fi

if command -v getJS >/dev/null 2>&1; then
  skip "GetJS" "$(command -v getJS)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing GetJS (getJS)"
  _mt_install 'go' 'go install github.com/003random/getJS/v2@latest'
  _mt_record "GetJS" "getJS" "go"
fi

if command -v subjs >/dev/null 2>&1; then
  skip "SubJS" "$(command -v subjs)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing SubJS (subjs)"
  _mt_install 'go' 'go install -v github.com/lc/subjs@latest'
  _mt_record "SubJS" "subjs" "go"
fi

if command -v jsluice >/dev/null 2>&1; then
  skip "jsluice" "$(command -v jsluice)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing jsluice (jsluice)"
  _mt_install 'go' 'go install github.com/BishopFox/jsluice/cmd/jsluice@latest'
  _mt_record "jsluice" "jsluice" "go"
fi

if command -v mantra >/dev/null 2>&1; then
  skip "Mantra" "$(command -v mantra)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Mantra (mantra)"
  _mt_install 'go' 'go install github.com/MrEmpy/mantra@latest'
  _mt_record "Mantra" "mantra" "go"
fi

if command -v xnLinkFinder >/dev/null 2>&1; then
  skip "xnLinkFinder" "$(command -v xnLinkFinder)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing xnLinkFinder (xnLinkFinder)"
  _mt_install 'pip' 'xnLinkFinder'
  _mt_record "xnLinkFinder" "xnLinkFinder" "pip"
fi

# ── Kubernetes ──────────────────────────────────────────────────
if command -v kube-hunter >/dev/null 2>&1; then
  skip "kube-hunter" "$(command -v kube-hunter)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing kube-hunter (kube-hunter)"
  _mt_install 'pip' 'kube-hunter'
  _mt_record "kube-hunter" "kube-hunter" "pip"
fi

if command -v kube-bench >/dev/null 2>&1; then
  skip "kube-bench" "$(command -v kube-bench)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing kube-bench (kube-bench)"
  _mt_install 'go' 'go install github.com/aquasecurity/kube-bench@latest'
  _mt_record "kube-bench" "kube-bench" "go"
fi

if command -v kubeaudit >/dev/null 2>&1; then
  skip "kubeaudit" "$(command -v kubeaudit)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing kubeaudit (kubeaudit)"
  _mt_install 'go' 'go install github.com/Shopify/kubeaudit@latest'
  _mt_record "kubeaudit" "kubeaudit" "go"
fi

if command -v trivy >/dev/null 2>&1; then
  skip "Trivy" "$(command -v trivy)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Trivy (trivy)"
  _mt_install 'go' 'go install github.com/aquasecurity/trivy/cmd/trivy@latest'
  _mt_record "Trivy" "trivy" "go"
fi

if command -v kubeletctl >/dev/null 2>&1; then
  skip "kubeletctl" "$(command -v kubeletctl)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing kubeletctl (kubeletctl)"
  _mt_install 'go' 'go install github.com/cyberark/kubeletctl@latest'
  _mt_record "kubeletctl" "kubeletctl" "go"
fi

if command -v popeye >/dev/null 2>&1; then
  skip "Popeye" "$(command -v popeye)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Popeye (popeye)"
  _mt_install 'go' 'go install github.com/derailed/popeye@latest'
  _mt_record "Popeye" "popeye" "go"
fi

# ── Network ─────────────────────────────────────────────────────
if command -v nmap >/dev/null 2>&1; then
  skip "Nmap" "$(command -v nmap)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pm" ]]; then
  log "Installing Nmap (nmap)"
  _mt_install 'pm' 'nmap'
  _mt_record "Nmap" "nmap" "pm"
fi

if command -v masscan >/dev/null 2>&1; then
  skip "Masscan" "$(command -v masscan)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pm" ]]; then
  log "Installing Masscan (masscan)"
  _mt_install 'pm' 'masscan'
  _mt_record "Masscan" "masscan" "pm"
fi

if command -v naabu >/dev/null 2>&1; then
  skip "Naabu" "$(command -v naabu)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Naabu (naabu)"
  _mt_install 'go' 'go install -v github.com/projectdiscovery/naabu/v2/cmd/naabu@latest'
  _mt_record "Naabu" "naabu" "go"
fi

if command -v rustscan >/dev/null 2>&1; then
  skip "RustScan" "$(command -v rustscan)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "cargo" ]]; then
  log "Installing RustScan (rustscan)"
  _mt_install 'cargo' 'rustscan'
  _mt_record "RustScan" "rustscan" "cargo"
fi

if command -v testssl.sh >/dev/null 2>&1; then
  skip "testssl.sh" "$(command -v testssl.sh)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "git" ]]; then
  log "Installing testssl.sh (testssl.sh)"
  _mt_install 'git' 'git clone https://github.com/drwetter/testssl.sh.git'
  _mt_record "testssl.sh" "testssl.sh" "git"
fi

if command -v sslscan >/dev/null 2>&1; then
  skip "SSLScan" "$(command -v sslscan)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pm" ]]; then
  log "Installing SSLScan (sslscan)"
  _mt_install 'pm' 'sslscan'
  _mt_record "SSLScan" "sslscan" "pm"
fi

if command -v mapcidr >/dev/null 2>&1; then
  skip "MapCIDR" "$(command -v mapcidr)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing MapCIDR (mapcidr)"
  _mt_install 'go' 'go install github.com/projectdiscovery/mapcidr/cmd/mapcidr@latest'
  _mt_record "MapCIDR" "mapcidr" "go"
fi

if command -v cdncheck >/dev/null 2>&1; then
  skip "CDNCheck" "$(command -v cdncheck)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing CDNCheck (cdncheck)"
  _mt_install 'go' 'go install github.com/projectdiscovery/cdncheck/cmd/cdncheck@latest'
  _mt_record "CDNCheck" "cdncheck" "go"
fi

if command -v smap >/dev/null 2>&1; then
  skip "Smap" "$(command -v smap)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Smap (smap)"
  _mt_install 'go' 'go install github.com/s0md3v/smap/cmd/smap@latest'
  _mt_record "Smap" "smap" "go"
fi

if command -v nrich >/dev/null 2>&1; then
  skip "nrich" "$(command -v nrich)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "cargo" ]]; then
  log "Installing nrich (nrich)"
  _mt_install 'cargo' 'nrich'
  _mt_record "nrich" "nrich" "cargo"
fi

# ── OSINT ───────────────────────────────────────────────────────
if command -v theHarvester >/dev/null 2>&1; then
  skip "theHarvester" "$(command -v theHarvester)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing theHarvester (theHarvester)"
  _mt_install 'pip' 'theHarvester'
  _mt_record "theHarvester" "theHarvester" "pip"
fi

if command -v shodan >/dev/null 2>&1; then
  skip "Shodan CLI" "$(command -v shodan)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Shodan CLI (shodan)"
  _mt_install 'pip' 'shodan'
  _mt_record "Shodan CLI" "shodan" "pip"
fi

if command -v censys >/dev/null 2>&1; then
  skip "Censys" "$(command -v censys)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Censys (censys)"
  _mt_install 'pip' 'censys'
  _mt_record "Censys" "censys" "pip"
fi

if command -v spiderfoot >/dev/null 2>&1; then
  skip "SpiderFoot" "$(command -v spiderfoot)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing SpiderFoot (spiderfoot)"
  _mt_install 'pip' 'spiderfoot'
  _mt_record "SpiderFoot" "spiderfoot" "pip"
fi

if command -v github-subdomains >/dev/null 2>&1; then
  skip "GitHub Subdomains" "$(command -v github-subdomains)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing GitHub Subdomains (github-subdomains)"
  _mt_install 'go' 'go install github.com/gwen001/github-subdomains@latest'
  _mt_record "GitHub Subdomains" "github-subdomains" "go"
fi

if command -v gitdorker >/dev/null 2>&1; then
  skip "GitDorker" "$(command -v gitdorker)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "git" ]]; then
  log "Installing GitDorker (gitdorker)"
  _mt_install 'git' 'git clone https://github.com/obheda12/GitDorker && pip install -r GitDorker/requirements.txt'
  _mt_record "GitDorker" "gitdorker" "git"
fi

if command -v github-endpoints >/dev/null 2>&1; then
  skip "GitHub Endpoints" "$(command -v github-endpoints)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing GitHub Endpoints (github-endpoints)"
  _mt_install 'go' 'go install github.com/gwen001/github-endpoints@latest'
  _mt_record "GitHub Endpoints" "github-endpoints" "go"
fi

if command -v gitlab-subdomains >/dev/null 2>&1; then
  skip "GitLab Subdomains" "$(command -v gitlab-subdomains)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing GitLab Subdomains (gitlab-subdomains)"
  _mt_install 'go' 'go install github.com/gwen001/gitlab-subdomains@latest'
  _mt_record "GitLab Subdomains" "gitlab-subdomains" "go"
fi

# ── Params ──────────────────────────────────────────────────────
if command -v arjun >/dev/null 2>&1; then
  skip "Arjun" "$(command -v arjun)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Arjun (arjun)"
  _mt_install 'pip' 'arjun'
  _mt_record "Arjun" "arjun" "pip"
fi

if command -v paramspider >/dev/null 2>&1; then
  skip "ParamSpider" "$(command -v paramspider)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing ParamSpider (paramspider)"
  _mt_install 'pip' 'paramspider'
  _mt_record "ParamSpider" "paramspider" "pip"
fi

if command -v x8 >/dev/null 2>&1; then
  skip "x8" "$(command -v x8)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "cargo" ]]; then
  log "Installing x8 (x8)"
  _mt_install 'cargo' 'x8'
  _mt_record "x8" "x8" "cargo"
fi

if command -v paraminer >/dev/null 2>&1; then
  skip "Paraminer" "$(command -v paraminer)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Paraminer (paraminer)"
  _mt_install 'pip' 'paraminer'
  _mt_record "Paraminer" "paraminer" "pip"
fi

# ── Recon ───────────────────────────────────────────────────────
if command -v subfinder >/dev/null 2>&1; then
  skip "Subfinder" "$(command -v subfinder)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Subfinder (subfinder)"
  _mt_install 'go' 'go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest'
  _mt_record "Subfinder" "subfinder" "go"
fi

if command -v httpx >/dev/null 2>&1; then
  skip "HTTPX" "$(command -v httpx)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing HTTPX (httpx)"
  _mt_install 'go' 'go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest'
  _mt_record "HTTPX" "httpx" "go"
fi

if command -v amass >/dev/null 2>&1; then
  skip "Amass" "$(command -v amass)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Amass (amass)"
  _mt_install 'go' 'go install -v github.com/owasp-amass/amass/v4/...@master'
  _mt_record "Amass" "amass" "go"
fi

if command -v assetfinder >/dev/null 2>&1; then
  skip "Assetfinder" "$(command -v assetfinder)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Assetfinder (assetfinder)"
  _mt_install 'go' 'go install -v github.com/tomnomnom/assetfinder@latest'
  _mt_record "Assetfinder" "assetfinder" "go"
fi

if command -v findomain >/dev/null 2>&1; then
  skip "Findomain" "$(command -v findomain)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "sh" ]]; then
  log "Installing Findomain (findomain)"
  _mt_install 'sh' 'curl -LO https://github.com/Findomain/Findomain/releases/latest/download/findomain-linux.zip && unzip findomain-linux.zip'
  _mt_record "Findomain" "findomain" "sh"
fi

if command -v dnsx >/dev/null 2>&1; then
  skip "DNSx" "$(command -v dnsx)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing DNSx (dnsx)"
  _mt_install 'go' 'go install -v github.com/projectdiscovery/dnsx/cmd/dnsx@latest'
  _mt_record "DNSx" "dnsx" "go"
fi

if command -v shuffledns >/dev/null 2>&1; then
  skip "ShuffleDNS" "$(command -v shuffledns)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing ShuffleDNS (shuffledns)"
  _mt_install 'go' 'go install -v github.com/projectdiscovery/shuffledns/cmd/shuffledns@latest'
  _mt_record "ShuffleDNS" "shuffledns" "go"
fi

if command -v chaos >/dev/null 2>&1; then
  skip "Chaos" "$(command -v chaos)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Chaos (chaos)"
  _mt_install 'go' 'go install -v github.com/projectdiscovery/chaos-client/cmd/chaos@latest'
  _mt_record "Chaos" "chaos" "go"
fi

if command -v whatweb >/dev/null 2>&1; then
  skip "WhatWeb" "$(command -v whatweb)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "gem" ]]; then
  log "Installing WhatWeb (whatweb)"
  _mt_install 'gem' 'whatweb'
  _mt_record "WhatWeb" "whatweb" "gem"
fi

if command -v wafw00f >/dev/null 2>&1; then
  skip "WAFW00F" "$(command -v wafw00f)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing WAFW00F (wafw00f)"
  _mt_install 'pip' 'wafw00f'
  _mt_record "WAFW00F" "wafw00f" "pip"
fi

if command -v puredns >/dev/null 2>&1; then
  skip "PureDNS" "$(command -v puredns)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing PureDNS (puredns)"
  _mt_install 'go' 'go install github.com/d3mondev/puredns/v2@latest'
  _mt_record "PureDNS" "puredns" "go"
fi

if command -v alterx >/dev/null 2>&1; then
  skip "AlterX" "$(command -v alterx)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing AlterX (alterx)"
  _mt_install 'go' 'go install github.com/projectdiscovery/alterx/cmd/alterx@latest'
  _mt_record "AlterX" "alterx" "go"
fi

if command -v dnsgen >/dev/null 2>&1; then
  skip "DNSGen" "$(command -v dnsgen)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing DNSGen (dnsgen)"
  _mt_install 'pip' 'dnsgen'
  _mt_record "DNSGen" "dnsgen" "pip"
fi

if command -v gotator >/dev/null 2>&1; then
  skip "Gotator" "$(command -v gotator)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Gotator (gotator)"
  _mt_install 'go' 'go install github.com/Josue87/gotator@latest'
  _mt_record "Gotator" "gotator" "go"
fi

if command -v tlsx >/dev/null 2>&1; then
  skip "TLSX" "$(command -v tlsx)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing TLSX (tlsx)"
  _mt_install 'go' 'go install github.com/projectdiscovery/tlsx/cmd/tlsx@latest'
  _mt_record "TLSX" "tlsx" "go"
fi

if command -v asnmap >/dev/null 2>&1; then
  skip "ASNMap" "$(command -v asnmap)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing ASNMap (asnmap)"
  _mt_install 'go' 'go install github.com/projectdiscovery/asnmap/cmd/asnmap@latest'
  _mt_record "ASNMap" "asnmap" "go"
fi

if command -v cero >/dev/null 2>&1; then
  skip "Cero" "$(command -v cero)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Cero (cero)"
  _mt_install 'go' 'go install github.com/glebarez/cero@latest'
  _mt_record "Cero" "cero" "go"
fi

if command -v gowitness >/dev/null 2>&1; then
  skip "GoWitness" "$(command -v gowitness)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing GoWitness (gowitness)"
  _mt_install 'go' 'go install github.com/sensepost/gowitness@latest'
  _mt_record "GoWitness" "gowitness" "go"
fi

if command -v aquatone >/dev/null 2>&1; then
  skip "Aquatone" "$(command -v aquatone)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Aquatone (aquatone)"
  _mt_install 'go' 'go install github.com/michenriksen/aquatone@latest'
  _mt_record "Aquatone" "aquatone" "go"
fi

if command -v wappalyzer >/dev/null 2>&1; then
  skip "Wappalyzer" "$(command -v wappalyzer)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "npm" ]]; then
  log "Installing Wappalyzer (wappalyzer)"
  _mt_install 'npm' 'wappalyzer'
  _mt_record "Wappalyzer" "wappalyzer" "npm"
fi

if command -v httprobe >/dev/null 2>&1; then
  skip "httprobe" "$(command -v httprobe)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing httprobe (httprobe)"
  _mt_install 'go' 'go install github.com/tomnomnom/httprobe@latest'
  _mt_record "httprobe" "httprobe" "go"
fi

if command -v urlfinder >/dev/null 2>&1; then
  skip "URLFinder" "$(command -v urlfinder)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing URLFinder (urlfinder)"
  _mt_install 'go' 'go install github.com/projectdiscovery/urlfinder/cmd/urlfinder@latest'
  _mt_record "URLFinder" "urlfinder" "go"
fi

if command -v hakip2host >/dev/null 2>&1; then
  skip "hakip2host" "$(command -v hakip2host)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing hakip2host (hakip2host)"
  _mt_install 'go' 'go install github.com/hakluke/hakip2host@latest'
  _mt_record "hakip2host" "hakip2host" "go"
fi

if command -v bbot >/dev/null 2>&1; then
  skip "BBOT" "$(command -v bbot)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pipx" ]]; then
  log "Installing BBOT (bbot)"
  _mt_install 'pipx' 'bbot'
  _mt_record "BBOT" "bbot" "pipx"
fi

if command -v crtsh >/dev/null 2>&1; then
  skip "crt.sh" "$(command -v crtsh)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pipx" ]]; then
  log "Installing crt.sh (crtsh)"
  _mt_install 'pipx' 'crtsh'
  _mt_record "crt.sh" "crtsh" "pipx"
fi

if command -v massdns >/dev/null 2>&1; then
  skip "MassDNS" "$(command -v massdns)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pm" ]]; then
  log "Installing MassDNS (massdns)"
  _mt_install 'pm' 'massdns'
  _mt_record "MassDNS" "massdns" "pm"
fi

if command -v csprecon >/dev/null 2>&1; then
  skip "CSPRecon" "$(command -v csprecon)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing CSPRecon (csprecon)"
  _mt_install 'go' 'go install github.com/edoardottt/csprecon/cmd/csprecon@latest'
  _mt_record "CSPRecon" "csprecon" "go"
fi

if command -v webanalyze >/dev/null 2>&1; then
  skip "webanalyze" "$(command -v webanalyze)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing webanalyze (webanalyze)"
  _mt_install 'go' 'go install github.com/rverton/webanalyze/cmd/webanalyze@latest'
  _mt_record "webanalyze" "webanalyze" "go"
fi

# ── SSRF ────────────────────────────────────────────────────────
if command -v ssrfmap >/dev/null 2>&1; then
  skip "SSRFmap" "$(command -v ssrfmap)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing SSRFmap (ssrfmap)"
  _mt_install 'pip' 'ssrfmap'
  _mt_record "SSRFmap" "ssrfmap" "pip"
fi

if command -v gopherus >/dev/null 2>&1; then
  skip "Gopherus" "$(command -v gopherus)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Gopherus (gopherus)"
  _mt_install 'pip' 'gopherus'
  _mt_record "Gopherus" "gopherus" "pip"
fi

if command -v interactsh-client >/dev/null 2>&1; then
  skip "Interactsh" "$(command -v interactsh-client)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Interactsh (interactsh-client)"
  _mt_install 'go' 'go install -v github.com/projectdiscovery/interactsh/cmd/interactsh-client@latest'
  _mt_record "Interactsh" "interactsh-client" "go"
fi

if command -v ssrf-sheriff >/dev/null 2>&1; then
  skip "SSRF Sheriff" "$(command -v ssrf-sheriff)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing SSRF Sheriff (ssrf-sheriff)"
  _mt_install 'pip' 'ssrf-sheriff'
  _mt_record "SSRF Sheriff" "ssrf-sheriff" "pip"
fi

# ── SSTI ────────────────────────────────────────────────────────
if command -v sstimap >/dev/null 2>&1; then
  skip "SSTImap" "$(command -v sstimap)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing SSTImap (sstimap)"
  _mt_install 'pip' 'sstimap'
  _mt_record "SSTImap" "sstimap" "pip"
fi

if command -v tplmap >/dev/null 2>&1; then
  skip "Tplmap" "$(command -v tplmap)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Tplmap (tplmap)"
  _mt_install 'pip' 'tplmap'
  _mt_record "Tplmap" "tplmap" "pip"
fi

# ── Scanner ─────────────────────────────────────────────────────
if command -v sniper >/dev/null 2>&1; then
  skip "Sn1per" "$(command -v sniper)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "git" ]]; then
  log "Installing Sn1per (sniper)"
  _mt_install 'git' 'git clone https://github.com/1N3/Sn1per && cd Sn1per && bash install.sh'
  _mt_record "Sn1per" "sniper" "git"
fi

# ── Secrets ─────────────────────────────────────────────────────
if command -v trufflehog >/dev/null 2>&1; then
  skip "TruffleHog" "$(command -v trufflehog)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing TruffleHog (trufflehog)"
  _mt_install 'go' 'go install github.com/trufflesecurity/trufflehog/v3@latest'
  _mt_record "TruffleHog" "trufflehog" "go"
fi

if command -v gitleaks >/dev/null 2>&1; then
  skip "Gitleaks" "$(command -v gitleaks)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Gitleaks (gitleaks)"
  _mt_install 'go' 'go install github.com/gitleaks/gitleaks/v8@latest'
  _mt_record "Gitleaks" "gitleaks" "go"
fi

if command -v semgrep >/dev/null 2>&1; then
  skip "Semgrep" "$(command -v semgrep)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Semgrep (semgrep)"
  _mt_install 'pip' 'semgrep'
  _mt_record "Semgrep" "semgrep" "pip"
fi

# ── Takeover ────────────────────────────────────────────────────
if command -v subjack >/dev/null 2>&1; then
  skip "Subjack" "$(command -v subjack)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Subjack (subjack)"
  _mt_install 'go' 'go install github.com/haccer/subjack@latest'
  _mt_record "Subjack" "subjack" "go"
fi

if command -v subzy >/dev/null 2>&1; then
  skip "Subzy" "$(command -v subzy)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Subzy (subzy)"
  _mt_install 'go' 'go install -v github.com/PentestPad/subzy@latest'
  _mt_record "Subzy" "subzy" "go"
fi

if command -v nuclei >/dev/null 2>&1; then
  skip "Nuclei Takeover" "$(command -v nuclei)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Nuclei Takeover (nuclei)"
  _mt_install 'go' 'go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest'
  _mt_record "Nuclei Takeover" "nuclei" "go"
fi

if command -v dnsreaper >/dev/null 2>&1; then
  skip "DNSReaper" "$(command -v dnsreaper)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pipx" ]]; then
  log "Installing DNSReaper (dnsreaper)"
  _mt_install 'pipx' 'dnsReaper'
  _mt_record "DNSReaper" "dnsreaper" "pipx"
fi

# ── Utility ─────────────────────────────────────────────────────
if command -v anew >/dev/null 2>&1; then
  skip "Anew" "$(command -v anew)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Anew (anew)"
  _mt_install 'go' 'go install -v github.com/tomnomnom/anew@latest'
  _mt_record "Anew" "anew" "go"
fi

if command -v qsreplace >/dev/null 2>&1; then
  skip "QSReplace" "$(command -v qsreplace)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing QSReplace (qsreplace)"
  _mt_install 'go' 'go install -v github.com/tomnomnom/qsreplace@latest'
  _mt_record "QSReplace" "qsreplace" "go"
fi

if command -v uro >/dev/null 2>&1; then
  skip "URO" "$(command -v uro)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing URO (uro)"
  _mt_install 'pip' 'uro'
  _mt_record "URO" "uro" "pip"
fi

if command -v unfurl >/dev/null 2>&1; then
  skip "Unfurl" "$(command -v unfurl)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Unfurl (unfurl)"
  _mt_install 'go' 'go install -v github.com/tomnomnom/unfurl@latest'
  _mt_record "Unfurl" "unfurl" "go"
fi

if command -v jq >/dev/null 2>&1; then
  skip "JQ Filter" "$(command -v jq)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pm" ]]; then
  log "Installing JQ Filter (jq)"
  _mt_install 'pm' 'jq'
  _mt_record "JQ Filter" "jq" "pm"
fi

if command -v gf >/dev/null 2>&1; then
  skip "GF Patterns" "$(command -v gf)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing GF Patterns (gf)"
  _mt_install 'go' 'go install -v github.com/tomnomnom/gf@latest'
  _mt_record "GF Patterns" "gf" "go"
fi

if command -v interlace >/dev/null 2>&1; then
  skip "Interlace" "$(command -v interlace)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Interlace (interlace)"
  _mt_install 'pip' 'interlace'
  _mt_record "Interlace" "interlace" "pip"
fi

if command -v rush >/dev/null 2>&1; then
  skip "Rush" "$(command -v rush)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Rush (rush)"
  _mt_install 'go' 'go install github.com/shenwei356/rush@latest'
  _mt_record "Rush" "rush" "go"
fi

if command -v notify >/dev/null 2>&1; then
  skip "Notify" "$(command -v notify)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Notify (notify)"
  _mt_install 'go' 'go install -v github.com/projectdiscovery/notify/cmd/notify@latest'
  _mt_record "Notify" "notify" "go"
fi

if command -v meg >/dev/null 2>&1; then
  skip "Meg" "$(command -v meg)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Meg (meg)"
  _mt_install 'go' 'go install github.com/tomnomnom/meg@latest'
  _mt_record "Meg" "meg" "go"
fi

if command -v dsieve >/dev/null 2>&1; then
  skip "dsieve" "$(command -v dsieve)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing dsieve (dsieve)"
  _mt_install 'go' 'go install github.com/trickest/dsieve@latest'
  _mt_record "dsieve" "dsieve" "go"
fi

if command -v dnsvalidator >/dev/null 2>&1; then
  skip "DNSValidator" "$(command -v dnsvalidator)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing DNSValidator (dnsvalidator)"
  _mt_install 'pip' 'dnsvalidator'
  _mt_record "DNSValidator" "dnsvalidator" "pip"
fi

# ── Vulnerability ───────────────────────────────────────────────
if command -v nikto >/dev/null 2>&1; then
  skip "Nikto" "$(command -v nikto)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pm" ]]; then
  log "Installing Nikto (nikto)"
  _mt_install 'pm' 'nikto'
  _mt_record "Nikto" "nikto" "pm"
fi

if command -v wpscan >/dev/null 2>&1; then
  skip "WPScan" "$(command -v wpscan)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "gem" ]]; then
  log "Installing WPScan (wpscan)"
  _mt_install 'gem' 'wpscan'
  _mt_record "WPScan" "wpscan" "gem"
fi

if command -v sqlmap >/dev/null 2>&1; then
  skip "SQLMap" "$(command -v sqlmap)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing SQLMap (sqlmap)"
  _mt_install 'pip' 'sqlmap'
  _mt_record "SQLMap" "sqlmap" "pip"
fi

if command -v xsstrike >/dev/null 2>&1; then
  skip "XSStrike" "$(command -v xsstrike)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing XSStrike (xsstrike)"
  _mt_install 'pip' 'XSStrike'
  _mt_record "XSStrike" "xsstrike" "pip"
fi

if command -v dalfox >/dev/null 2>&1; then
  skip "Dalfox" "$(command -v dalfox)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Dalfox (dalfox)"
  _mt_install 'go' 'go install -v github.com/hahwul/dalfox/v2@latest'
  _mt_record "Dalfox" "dalfox" "go"
fi

if command -v ghauri >/dev/null 2>&1; then
  skip "Ghauri" "$(command -v ghauri)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pipx" ]]; then
  log "Installing Ghauri (ghauri)"
  _mt_install 'pipx' 'ghauri'
  _mt_record "Ghauri" "ghauri" "pipx"
fi

if command -v commix >/dev/null 2>&1; then
  skip "Commix" "$(command -v commix)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Commix (commix)"
  _mt_install 'pip' 'commix'
  _mt_record "Commix" "commix" "pip"
fi

if command -v jaeles >/dev/null 2>&1; then
  skip "Jaeles" "$(command -v jaeles)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Jaeles (jaeles)"
  _mt_install 'go' 'go install github.com/jaeles-project/jaeles@latest'
  _mt_record "Jaeles" "jaeles" "go"
fi

if command -v joomscan >/dev/null 2>&1; then
  skip "JoomScan" "$(command -v joomscan)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pm" ]]; then
  log "Installing JoomScan (joomscan)"
  _mt_install 'pm' 'joomscan'
  _mt_record "JoomScan" "joomscan" "pm"
fi

if command -v droopescan >/dev/null 2>&1; then
  skip "Droopescan" "$(command -v droopescan)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Droopescan (droopescan)"
  _mt_install 'pip' 'droopescan'
  _mt_record "Droopescan" "droopescan" "pip"
fi

if command -v oralyzer >/dev/null 2>&1; then
  skip "Oralyzer" "$(command -v oralyzer)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "git" ]]; then
  log "Installing Oralyzer (oralyzer)"
  _mt_install 'git' 'git clone https://github.com/r0075h3ll/Oralyzer && pip install -r Oralyzer/requirements.txt'
  _mt_record "Oralyzer" "oralyzer" "git"
fi

if command -v Gxss >/dev/null 2>&1; then
  skip "Gxss" "$(command -v Gxss)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Gxss (Gxss)"
  _mt_install 'go' 'go install github.com/KathanP19/Gxss@latest'
  _mt_record "Gxss" "Gxss" "go"
fi

if command -v kxss >/dev/null 2>&1; then
  skip "kxss" "$(command -v kxss)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing kxss (kxss)"
  _mt_install 'go' 'go install github.com/tomnomnom/hacks/kxss@latest'
  _mt_record "kxss" "kxss" "go"
fi

if command -v smuggler >/dev/null 2>&1; then
  skip "Smuggler" "$(command -v smuggler)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "git" ]]; then
  log "Installing Smuggler (smuggler)"
  _mt_install 'git' 'git clone https://github.com/defparam/smuggler && cd smuggler'
  _mt_record "Smuggler" "smuggler" "git"
fi

if command -v retire >/dev/null 2>&1; then
  skip "Retire.js" "$(command -v retire)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "npm" ]]; then
  log "Installing Retire.js (retire)"
  _mt_install 'npm' 'retire'
  _mt_record "Retire.js" "retire" "npm"
fi

if command -v ppfuzz >/dev/null 2>&1; then
  skip "ppfuzz" "$(command -v ppfuzz)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "cargo" ]]; then
  log "Installing ppfuzz (ppfuzz)"
  _mt_install 'cargo' 'ppfuzz'
  _mt_record "ppfuzz" "ppfuzz" "cargo"
fi

if command -v wapiti >/dev/null 2>&1; then
  skip "Wapiti" "$(command -v wapiti)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Wapiti (wapiti)"
  _mt_install 'pip' 'wapiti3'
  _mt_record "Wapiti" "wapiti" "pip"
fi

if command -v zap-baseline.py >/dev/null 2>&1; then
  skip "OWASP ZAP" "$(command -v zap-baseline.py)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "sh" ]]; then
  log "Installing OWASP ZAP (zap-baseline.py)"
  _mt_install 'sh' 'docker pull ghcr.io/zaproxy/zaproxy:stable'
  _mt_record "OWASP ZAP" "zap-baseline.py" "sh"
fi

# ── Wordlist ────────────────────────────────────────────────────
if command -v cewl >/dev/null 2>&1; then
  skip "CeWL" "$(command -v cewl)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "gem" ]]; then
  log "Installing CeWL (cewl)"
  _mt_install 'gem' 'cewl'
  _mt_record "CeWL" "cewl" "gem"
fi

if command -v wordlister >/dev/null 2>&1; then
  skip "Wordlister" "$(command -v wordlister)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "pip" ]]; then
  log "Installing Wordlister (wordlister)"
  _mt_install 'pip' 'wordlister'
  _mt_record "Wordlister" "wordlister" "pip"
fi
