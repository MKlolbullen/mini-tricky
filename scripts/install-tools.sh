#!/usr/bin/env bash
#
# install-tools.sh — bootstrap the 75+ binaries mini-tricky drives.
#
# Generated from backend/src/main.py::_generate_install_script. Re-generate with:
#   curl -s http://localhost:5000/api/tools/install-script > scripts/install-tools.sh
#
# Idempotent: each tool is guarded by `command -v`, so re-running only
# installs what is still missing. Requires go, python/pip, cargo, npm, and
# apt or brew on the host.
#
set -euo pipefail

log() { printf "\033[1;36m[install-tools]\033[0m %s\n" "$*"; }
skip() { printf "\033[2m[install-tools] %s already installed at %s\033[0m\n" "$1" "$2"; }

# ── API ─────────────────────────────────────────────────────────
if command -v kr >/dev/null 2>&1; then
  skip "Kiterunner" "$(command -v kr)"
else
  log "Installing Kiterunner (kr)"
  go install github.com/assetnote/kiterunner/cmd/kr@latest
fi

if command -v APIFuzzer >/dev/null 2>&1; then
  skip "APIFuzzer" "$(command -v APIFuzzer)"
else
  log "Installing APIFuzzer (APIFuzzer)"
  pip install APIFuzzer
fi

if command -v oasdiff >/dev/null 2>&1; then
  skip "OpenAPI Diff" "$(command -v oasdiff)"
else
  log "Installing OpenAPI Diff (oasdiff)"
  go install github.com/tufin/oasdiff@latest
fi

if command -v restler >/dev/null 2>&1; then
  skip "RESTler" "$(command -v restler)"
else
  log "Installing RESTler (restler)"
  pip install restler-fuzzer  # or download from github.com/microsoft/restler-fuzzer
fi

if command -v graphw00f >/dev/null 2>&1; then
  skip "graphw00f" "$(command -v graphw00f)"
else
  log "Installing graphw00f (graphw00f)"
  pip install graphw00f
fi

if command -v graphql-cop >/dev/null 2>&1; then
  skip "GraphQL Cop" "$(command -v graphql-cop)"
else
  log "Installing GraphQL Cop (graphql-cop)"
  pip install graphql-cop
fi

if command -v clairvoyance >/dev/null 2>&1; then
  skip "Clairvoyance" "$(command -v clairvoyance)"
else
  log "Installing Clairvoyance (clairvoyance)"
  pip install clairvoyance
fi

# ── Archive ─────────────────────────────────────────────────────
if command -v gau >/dev/null 2>&1; then
  skip "GAU" "$(command -v gau)"
else
  log "Installing GAU (gau)"
  go install -v github.com/lc/gau/v2/cmd/gau@latest
fi

if command -v waymore >/dev/null 2>&1; then
  skip "Waymore" "$(command -v waymore)"
else
  log "Installing Waymore (waymore)"
  pip install waymore
fi

# ── CORS ────────────────────────────────────────────────────────
if command -v cors_scan >/dev/null 2>&1; then
  skip "CORScanner" "$(command -v cors_scan)"
else
  log "Installing CORScanner (cors_scan)"
  pip install CORScanner
fi

if command -v crlfuzz >/dev/null 2>&1; then
  skip "CRLFuzz" "$(command -v crlfuzz)"
else
  log "Installing CRLFuzz (crlfuzz)"
  go install github.com/dwisiswant0/crlfuzz/cmd/crlfuzz@latest
fi

# ── CSRF ────────────────────────────────────────────────────────
if command -v xsrfprobe >/dev/null 2>&1; then
  skip "XSRFProbe" "$(command -v xsrfprobe)"
else
  log "Installing XSRFProbe (xsrfprobe)"
  pip install xsrfprobe
fi

# ── Cloud ───────────────────────────────────────────────────────
if command -v s3scanner >/dev/null 2>&1; then
  skip "S3Scanner" "$(command -v s3scanner)"
else
  log "Installing S3Scanner (s3scanner)"
  pip install s3scanner
fi

if command -v cloud_enum >/dev/null 2>&1; then
  skip "Cloud Enum" "$(command -v cloud_enum)"
else
  log "Installing Cloud Enum (cloud_enum)"
  pip install cloud_enum
fi

if command -v prowler >/dev/null 2>&1; then
  skip "Prowler" "$(command -v prowler)"
else
  log "Installing Prowler (prowler)"
  pip install prowler
fi

if command -v scout >/dev/null 2>&1; then
  skip "ScoutSuite" "$(command -v scout)"
else
  log "Installing ScoutSuite (scout)"
  pip install scoutsuite
fi

if command -v cloudsploit >/dev/null 2>&1; then
  skip "CloudSploit" "$(command -v cloudsploit)"
else
  log "Installing CloudSploit (cloudsploit)"
  npm install -g cloudsploit  # or git clone github.com/aquasecurity/cloudsploit
fi

if command -v gcpbucketbrute >/dev/null 2>&1; then
  skip "GCPBucketBrute" "$(command -v gcpbucketbrute)"
else
  log "Installing GCPBucketBrute (gcpbucketbrute)"
  pipx install gcpbucketbrute  # or git clone github.com/RhinoSecurityLabs/GCPBucketBrute
fi

# ── Crawling ────────────────────────────────────────────────────
if command -v katana >/dev/null 2>&1; then
  skip "Katana" "$(command -v katana)"
else
  log "Installing Katana (katana)"
  go install -v github.com/projectdiscovery/katana/cmd/katana@latest
fi

if command -v gospider >/dev/null 2>&1; then
  skip "GoSpider" "$(command -v gospider)"
else
  log "Installing GoSpider (gospider)"
  go install -v github.com/jaeles-project/gospider@latest
fi

if command -v hakrawler >/dev/null 2>&1; then
  skip "Hakrawler" "$(command -v hakrawler)"
else
  log "Installing Hakrawler (hakrawler)"
  go install -v github.com/hakluke/hakrawler@latest
fi

if command -v waybackurls >/dev/null 2>&1; then
  skip "Waybackurls" "$(command -v waybackurls)"
else
  log "Installing Waybackurls (waybackurls)"
  go install -v github.com/tomnomnom/waybackurls@latest
fi

if command -v cariddi >/dev/null 2>&1; then
  skip "Cariddi" "$(command -v cariddi)"
else
  log "Installing Cariddi (cariddi)"
  go install github.com/edoardottt/cariddi/cmd/cariddi@latest
fi

# ── Enumeration ─────────────────────────────────────────────────
if command -v gobuster >/dev/null 2>&1; then
  skip "Gobuster" "$(command -v gobuster)"
else
  log "Installing Gobuster (gobuster)"
  go install github.com/OJ/gobuster/v3@latest
fi

if command -v dirsearch >/dev/null 2>&1; then
  skip "Dirsearch" "$(command -v dirsearch)"
else
  log "Installing Dirsearch (dirsearch)"
  pip install dirsearch
fi

if command -v feroxbuster >/dev/null 2>&1; then
  skip "Feroxbuster" "$(command -v feroxbuster)"
else
  log "Installing Feroxbuster (feroxbuster)"
  curl -sL https://raw.githubusercontent.com/epi052/feroxbuster/main/install-nix.sh | bash
fi

if command -v wfuzz >/dev/null 2>&1; then
  skip "Wfuzz" "$(command -v wfuzz)"
else
  log "Installing Wfuzz (wfuzz)"
  pip install wfuzz
fi

if command -v cmseek >/dev/null 2>&1; then
  skip "CMSeeK" "$(command -v cmseek)"
else
  log "Installing CMSeeK (cmseek)"
  git clone https://github.com/Tuhinshubhra/CMSeeK && pip install -r CMSeeK/requirements.txt
fi

if command -v nomore403 >/dev/null 2>&1; then
  skip "nomore403" "$(command -v nomore403)"
else
  log "Installing nomore403 (nomore403)"
  go install github.com/devploit/nomore403@latest
fi

if command -v dirb >/dev/null 2>&1; then
  skip "Dirb" "$(command -v dirb)"
else
  log "Installing Dirb (dirb)"
  apt install dirb  # or brew install dirb
fi

if command -v shortscan >/dev/null 2>&1; then
  skip "Shortscan" "$(command -v shortscan)"
else
  log "Installing Shortscan (shortscan)"
  go install github.com/bitquark/shortscan/cmd/shortscan@latest
fi

# ── Fuzzing ─────────────────────────────────────────────────────
if command -v ffuf >/dev/null 2>&1; then
  skip "FFUF" "$(command -v ffuf)"
else
  log "Installing FFUF (ffuf)"
  go install -v github.com/ffuf/ffuf/v2@latest
fi

# ── Headers ─────────────────────────────────────────────────────
if command -v shcheck >/dev/null 2>&1; then
  skip "Shcheck" "$(command -v shcheck)"
else
  log "Installing Shcheck (shcheck)"
  pip install shcheck
fi

if command -v hakcheckurl >/dev/null 2>&1; then
  skip "Hakcheckurl" "$(command -v hakcheckurl)"
else
  log "Installing Hakcheckurl (hakcheckurl)"
  go install github.com/hakluke/hakcheckurl@latest
fi

# ── JSAnalysis ──────────────────────────────────────────────────
if command -v linkfinder >/dev/null 2>&1; then
  skip "LinkFinder" "$(command -v linkfinder)"
else
  log "Installing LinkFinder (linkfinder)"
  pip install linkfinder
fi

if command -v SecretFinder >/dev/null 2>&1; then
  skip "SecretFinder" "$(command -v SecretFinder)"
else
  log "Installing SecretFinder (SecretFinder)"
  pip install SecretFinder
fi

if command -v getJS >/dev/null 2>&1; then
  skip "GetJS" "$(command -v getJS)"
else
  log "Installing GetJS (getJS)"
  go install github.com/003random/getJS/v2@latest
fi

if command -v subjs >/dev/null 2>&1; then
  skip "SubJS" "$(command -v subjs)"
else
  log "Installing SubJS (subjs)"
  go install -v github.com/lc/subjs@latest
fi

if command -v jsluice >/dev/null 2>&1; then
  skip "jsluice" "$(command -v jsluice)"
else
  log "Installing jsluice (jsluice)"
  go install github.com/BishopFox/jsluice/cmd/jsluice@latest
fi

if command -v mantra >/dev/null 2>&1; then
  skip "Mantra" "$(command -v mantra)"
else
  log "Installing Mantra (mantra)"
  go install github.com/MrEmpy/mantra@latest
fi

if command -v xnLinkFinder >/dev/null 2>&1; then
  skip "xnLinkFinder" "$(command -v xnLinkFinder)"
else
  log "Installing xnLinkFinder (xnLinkFinder)"
  pip install xnLinkFinder
fi

# ── Kubernetes ──────────────────────────────────────────────────
if command -v kube-hunter >/dev/null 2>&1; then
  skip "kube-hunter" "$(command -v kube-hunter)"
else
  log "Installing kube-hunter (kube-hunter)"
  pip install kube-hunter
fi

if command -v kube-bench >/dev/null 2>&1; then
  skip "kube-bench" "$(command -v kube-bench)"
else
  log "Installing kube-bench (kube-bench)"
  go install github.com/aquasecurity/kube-bench@latest  # or docker run aquasec/kube-bench
fi

if command -v kubeaudit >/dev/null 2>&1; then
  skip "kubeaudit" "$(command -v kubeaudit)"
else
  log "Installing kubeaudit (kubeaudit)"
  go install github.com/Shopify/kubeaudit@latest
fi

if command -v trivy >/dev/null 2>&1; then
  skip "Trivy" "$(command -v trivy)"
else
  log "Installing Trivy (trivy)"
  go install github.com/aquasecurity/trivy/cmd/trivy@latest  # or brew install trivy
fi

if command -v kubeletctl >/dev/null 2>&1; then
  skip "kubeletctl" "$(command -v kubeletctl)"
else
  log "Installing kubeletctl (kubeletctl)"
  go install github.com/cyberark/kubeletctl@latest
fi

if command -v popeye >/dev/null 2>&1; then
  skip "Popeye" "$(command -v popeye)"
else
  log "Installing Popeye (popeye)"
  go install github.com/derailed/popeye@latest  # or brew install derailed/popeye/popeye
fi

# ── Network ─────────────────────────────────────────────────────
if command -v nmap >/dev/null 2>&1; then
  skip "Nmap" "$(command -v nmap)"
else
  log "Installing Nmap (nmap)"
  apt install nmap  # or brew install nmap
fi

if command -v masscan >/dev/null 2>&1; then
  skip "Masscan" "$(command -v masscan)"
else
  log "Installing Masscan (masscan)"
  apt install masscan  # or brew install masscan
fi

if command -v naabu >/dev/null 2>&1; then
  skip "Naabu" "$(command -v naabu)"
else
  log "Installing Naabu (naabu)"
  go install -v github.com/projectdiscovery/naabu/v2/cmd/naabu@latest
fi

if command -v rustscan >/dev/null 2>&1; then
  skip "RustScan" "$(command -v rustscan)"
else
  log "Installing RustScan (rustscan)"
  cargo install rustscan
fi

if command -v testssl.sh >/dev/null 2>&1; then
  skip "testssl.sh" "$(command -v testssl.sh)"
else
  log "Installing testssl.sh (testssl.sh)"
  git clone https://github.com/drwetter/testssl.sh.git
fi

if command -v sslscan >/dev/null 2>&1; then
  skip "SSLScan" "$(command -v sslscan)"
else
  log "Installing SSLScan (sslscan)"
  apt install sslscan  # or brew install sslscan
fi

if command -v mapcidr >/dev/null 2>&1; then
  skip "MapCIDR" "$(command -v mapcidr)"
else
  log "Installing MapCIDR (mapcidr)"
  go install github.com/projectdiscovery/mapcidr/cmd/mapcidr@latest
fi

if command -v cdncheck >/dev/null 2>&1; then
  skip "CDNCheck" "$(command -v cdncheck)"
else
  log "Installing CDNCheck (cdncheck)"
  go install github.com/projectdiscovery/cdncheck/cmd/cdncheck@latest
fi

if command -v smap >/dev/null 2>&1; then
  skip "Smap" "$(command -v smap)"
else
  log "Installing Smap (smap)"
  go install github.com/s0md3v/smap/cmd/smap@latest
fi

# ── OSINT ───────────────────────────────────────────────────────
if command -v theHarvester >/dev/null 2>&1; then
  skip "theHarvester" "$(command -v theHarvester)"
else
  log "Installing theHarvester (theHarvester)"
  pip install theHarvester
fi

if command -v shodan >/dev/null 2>&1; then
  skip "Shodan CLI" "$(command -v shodan)"
else
  log "Installing Shodan CLI (shodan)"
  pip install shodan
fi

if command -v censys >/dev/null 2>&1; then
  skip "Censys" "$(command -v censys)"
else
  log "Installing Censys (censys)"
  pip install censys
fi

if command -v spiderfoot >/dev/null 2>&1; then
  skip "SpiderFoot" "$(command -v spiderfoot)"
else
  log "Installing SpiderFoot (spiderfoot)"
  pip install spiderfoot
fi

if command -v github-subdomains >/dev/null 2>&1; then
  skip "GitHub Subdomains" "$(command -v github-subdomains)"
else
  log "Installing GitHub Subdomains (github-subdomains)"
  go install github.com/gwen001/github-subdomains@latest
fi

if command -v gitdorker >/dev/null 2>&1; then
  skip "GitDorker" "$(command -v gitdorker)"
else
  log "Installing GitDorker (gitdorker)"
  git clone https://github.com/obheda12/GitDorker && pip install -r GitDorker/requirements.txt
fi

# ── Params ──────────────────────────────────────────────────────
if command -v arjun >/dev/null 2>&1; then
  skip "Arjun" "$(command -v arjun)"
else
  log "Installing Arjun (arjun)"
  pip install arjun
fi

if command -v paramspider >/dev/null 2>&1; then
  skip "ParamSpider" "$(command -v paramspider)"
else
  log "Installing ParamSpider (paramspider)"
  pip install paramspider
fi

if command -v x8 >/dev/null 2>&1; then
  skip "x8" "$(command -v x8)"
else
  log "Installing x8 (x8)"
  cargo install x8
fi

if command -v paraminer >/dev/null 2>&1; then
  skip "Paraminer" "$(command -v paraminer)"
else
  log "Installing Paraminer (paraminer)"
  pip install paraminer
fi

# ── Recon ───────────────────────────────────────────────────────
if command -v subfinder >/dev/null 2>&1; then
  skip "Subfinder" "$(command -v subfinder)"
else
  log "Installing Subfinder (subfinder)"
  go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
fi

if command -v httpx >/dev/null 2>&1; then
  skip "HTTPX" "$(command -v httpx)"
else
  log "Installing HTTPX (httpx)"
  go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest
fi

if command -v amass >/dev/null 2>&1; then
  skip "Amass" "$(command -v amass)"
else
  log "Installing Amass (amass)"
  go install -v github.com/owasp-amass/amass/v4/...@master
fi

if command -v assetfinder >/dev/null 2>&1; then
  skip "Assetfinder" "$(command -v assetfinder)"
else
  log "Installing Assetfinder (assetfinder)"
  go install -v github.com/tomnomnom/assetfinder@latest
fi

if command -v findomain >/dev/null 2>&1; then
  skip "Findomain" "$(command -v findomain)"
else
  log "Installing Findomain (findomain)"
  curl -LO https://github.com/Findomain/Findomain/releases/latest/download/findomain-linux.zip && unzip findomain-linux.zip
fi

if command -v dnsx >/dev/null 2>&1; then
  skip "DNSx" "$(command -v dnsx)"
else
  log "Installing DNSx (dnsx)"
  go install -v github.com/projectdiscovery/dnsx/cmd/dnsx@latest
fi

if command -v shuffledns >/dev/null 2>&1; then
  skip "ShuffleDNS" "$(command -v shuffledns)"
else
  log "Installing ShuffleDNS (shuffledns)"
  go install -v github.com/projectdiscovery/shuffledns/cmd/shuffledns@latest
fi

if command -v chaos >/dev/null 2>&1; then
  skip "Chaos" "$(command -v chaos)"
else
  log "Installing Chaos (chaos)"
  go install -v github.com/projectdiscovery/chaos-client/cmd/chaos@latest
fi

if command -v whatweb >/dev/null 2>&1; then
  skip "WhatWeb" "$(command -v whatweb)"
else
  log "Installing WhatWeb (whatweb)"
  gem install whatweb  # or apt install whatweb
fi

if command -v wafw00f >/dev/null 2>&1; then
  skip "WAFW00F" "$(command -v wafw00f)"
else
  log "Installing WAFW00F (wafw00f)"
  pip install wafw00f
fi

if command -v puredns >/dev/null 2>&1; then
  skip "PureDNS" "$(command -v puredns)"
else
  log "Installing PureDNS (puredns)"
  go install github.com/d3mondev/puredns/v2@latest
fi

if command -v alterx >/dev/null 2>&1; then
  skip "AlterX" "$(command -v alterx)"
else
  log "Installing AlterX (alterx)"
  go install github.com/projectdiscovery/alterx/cmd/alterx@latest
fi

if command -v dnsgen >/dev/null 2>&1; then
  skip "DNSGen" "$(command -v dnsgen)"
else
  log "Installing DNSGen (dnsgen)"
  pip install dnsgen
fi

if command -v gotator >/dev/null 2>&1; then
  skip "Gotator" "$(command -v gotator)"
else
  log "Installing Gotator (gotator)"
  go install github.com/Josue87/gotator@latest
fi

if command -v tlsx >/dev/null 2>&1; then
  skip "TLSX" "$(command -v tlsx)"
else
  log "Installing TLSX (tlsx)"
  go install github.com/projectdiscovery/tlsx/cmd/tlsx@latest
fi

if command -v asnmap >/dev/null 2>&1; then
  skip "ASNMap" "$(command -v asnmap)"
else
  log "Installing ASNMap (asnmap)"
  go install github.com/projectdiscovery/asnmap/cmd/asnmap@latest
fi

if command -v cero >/dev/null 2>&1; then
  skip "Cero" "$(command -v cero)"
else
  log "Installing Cero (cero)"
  go install github.com/glebarez/cero@latest
fi

if command -v gowitness >/dev/null 2>&1; then
  skip "GoWitness" "$(command -v gowitness)"
else
  log "Installing GoWitness (gowitness)"
  go install github.com/sensepost/gowitness@latest
fi

if command -v aquatone >/dev/null 2>&1; then
  skip "Aquatone" "$(command -v aquatone)"
else
  log "Installing Aquatone (aquatone)"
  go install github.com/michenriksen/aquatone@latest
fi

if command -v wappalyzer >/dev/null 2>&1; then
  skip "Wappalyzer" "$(command -v wappalyzer)"
else
  log "Installing Wappalyzer (wappalyzer)"
  npm install -g wappalyzer
fi

if command -v httprobe >/dev/null 2>&1; then
  skip "httprobe" "$(command -v httprobe)"
else
  log "Installing httprobe (httprobe)"
  go install github.com/tomnomnom/httprobe@latest
fi

if command -v urlfinder >/dev/null 2>&1; then
  skip "URLFinder" "$(command -v urlfinder)"
else
  log "Installing URLFinder (urlfinder)"
  go install github.com/projectdiscovery/urlfinder/cmd/urlfinder@latest
fi

if command -v hakip2host >/dev/null 2>&1; then
  skip "hakip2host" "$(command -v hakip2host)"
else
  log "Installing hakip2host (hakip2host)"
  go install github.com/hakluke/hakip2host@latest
fi

# ── SSRF ────────────────────────────────────────────────────────
if command -v ssrfmap >/dev/null 2>&1; then
  skip "SSRFmap" "$(command -v ssrfmap)"
else
  log "Installing SSRFmap (ssrfmap)"
  pip install ssrfmap
fi

if command -v gopherus >/dev/null 2>&1; then
  skip "Gopherus" "$(command -v gopherus)"
else
  log "Installing Gopherus (gopherus)"
  pip install gopherus
fi

if command -v interactsh-client >/dev/null 2>&1; then
  skip "Interactsh" "$(command -v interactsh-client)"
else
  log "Installing Interactsh (interactsh-client)"
  go install -v github.com/projectdiscovery/interactsh/cmd/interactsh-client@latest
fi

if command -v ssrf-sheriff >/dev/null 2>&1; then
  skip "SSRF Sheriff" "$(command -v ssrf-sheriff)"
else
  log "Installing SSRF Sheriff (ssrf-sheriff)"
  pip install ssrf-sheriff
fi

# ── SSTI ────────────────────────────────────────────────────────
if command -v sstimap >/dev/null 2>&1; then
  skip "SSTImap" "$(command -v sstimap)"
else
  log "Installing SSTImap (sstimap)"
  pip install sstimap
fi

if command -v tplmap >/dev/null 2>&1; then
  skip "Tplmap" "$(command -v tplmap)"
else
  log "Installing Tplmap (tplmap)"
  pip install tplmap
fi

# ── Secrets ─────────────────────────────────────────────────────
if command -v trufflehog >/dev/null 2>&1; then
  skip "TruffleHog" "$(command -v trufflehog)"
else
  log "Installing TruffleHog (trufflehog)"
  go install github.com/trufflesecurity/trufflehog/v3@latest
fi

if command -v gitleaks >/dev/null 2>&1; then
  skip "Gitleaks" "$(command -v gitleaks)"
else
  log "Installing Gitleaks (gitleaks)"
  go install github.com/gitleaks/gitleaks/v8@latest
fi

if command -v semgrep >/dev/null 2>&1; then
  skip "Semgrep" "$(command -v semgrep)"
else
  log "Installing Semgrep (semgrep)"
  pip install semgrep
fi

# ── Takeover ────────────────────────────────────────────────────
if command -v subjack >/dev/null 2>&1; then
  skip "Subjack" "$(command -v subjack)"
else
  log "Installing Subjack (subjack)"
  go install github.com/haccer/subjack@latest
fi

if command -v subzy >/dev/null 2>&1; then
  skip "Subzy" "$(command -v subzy)"
else
  log "Installing Subzy (subzy)"
  go install -v github.com/PentestPad/subzy@latest
fi

if command -v nuclei >/dev/null 2>&1; then
  skip "Nuclei Takeover" "$(command -v nuclei)"
else
  log "Installing Nuclei Takeover (nuclei)"
  go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
fi

# ── Utility ─────────────────────────────────────────────────────
if command -v anew >/dev/null 2>&1; then
  skip "Anew" "$(command -v anew)"
else
  log "Installing Anew (anew)"
  go install -v github.com/tomnomnom/anew@latest
fi

if command -v qsreplace >/dev/null 2>&1; then
  skip "QSReplace" "$(command -v qsreplace)"
else
  log "Installing QSReplace (qsreplace)"
  go install -v github.com/tomnomnom/qsreplace@latest
fi

if command -v uro >/dev/null 2>&1; then
  skip "URO" "$(command -v uro)"
else
  log "Installing URO (uro)"
  pip install uro
fi

if command -v unfurl >/dev/null 2>&1; then
  skip "Unfurl" "$(command -v unfurl)"
else
  log "Installing Unfurl (unfurl)"
  go install -v github.com/tomnomnom/unfurl@latest
fi

if command -v jq >/dev/null 2>&1; then
  skip "JQ Filter" "$(command -v jq)"
else
  log "Installing JQ Filter (jq)"
  apt install jq  # or brew install jq
fi

if command -v gf >/dev/null 2>&1; then
  skip "GF Patterns" "$(command -v gf)"
else
  log "Installing GF Patterns (gf)"
  go install -v github.com/tomnomnom/gf@latest
fi

if command -v interlace >/dev/null 2>&1; then
  skip "Interlace" "$(command -v interlace)"
else
  log "Installing Interlace (interlace)"
  pip install interlace
fi

if command -v rush >/dev/null 2>&1; then
  skip "Rush" "$(command -v rush)"
else
  log "Installing Rush (rush)"
  go install github.com/shenwei356/rush@latest
fi

if command -v notify >/dev/null 2>&1; then
  skip "Notify" "$(command -v notify)"
else
  log "Installing Notify (notify)"
  go install -v github.com/projectdiscovery/notify/cmd/notify@latest
fi

if command -v meg >/dev/null 2>&1; then
  skip "Meg" "$(command -v meg)"
else
  log "Installing Meg (meg)"
  go install github.com/tomnomnom/meg@latest
fi

if command -v dsieve >/dev/null 2>&1; then
  skip "dsieve" "$(command -v dsieve)"
else
  log "Installing dsieve (dsieve)"
  go install github.com/trickest/dsieve@latest
fi

if command -v dnsvalidator >/dev/null 2>&1; then
  skip "DNSValidator" "$(command -v dnsvalidator)"
else
  log "Installing DNSValidator (dnsvalidator)"
  pip install dnsvalidator
fi

# ── Vulnerability ───────────────────────────────────────────────
if command -v nikto >/dev/null 2>&1; then
  skip "Nikto" "$(command -v nikto)"
else
  log "Installing Nikto (nikto)"
  apt install nikto  # or brew install nikto
fi

if command -v wpscan >/dev/null 2>&1; then
  skip "WPScan" "$(command -v wpscan)"
else
  log "Installing WPScan (wpscan)"
  gem install wpscan  # or apt install wpscan
fi

if command -v sqlmap >/dev/null 2>&1; then
  skip "SQLMap" "$(command -v sqlmap)"
else
  log "Installing SQLMap (sqlmap)"
  pip install sqlmap
fi

if command -v xsstrike >/dev/null 2>&1; then
  skip "XSStrike" "$(command -v xsstrike)"
else
  log "Installing XSStrike (xsstrike)"
  pip install XSStrike
fi

if command -v dalfox >/dev/null 2>&1; then
  skip "Dalfox" "$(command -v dalfox)"
else
  log "Installing Dalfox (dalfox)"
  go install -v github.com/hahwul/dalfox/v2@latest
fi

if command -v ghauri >/dev/null 2>&1; then
  skip "Ghauri" "$(command -v ghauri)"
else
  log "Installing Ghauri (ghauri)"
  pipx install ghauri  # or pipx install git+https://github.com/r0oth3x49/ghauri
fi

if command -v commix >/dev/null 2>&1; then
  skip "Commix" "$(command -v commix)"
else
  log "Installing Commix (commix)"
  pip install commix
fi

if command -v jaeles >/dev/null 2>&1; then
  skip "Jaeles" "$(command -v jaeles)"
else
  log "Installing Jaeles (jaeles)"
  go install github.com/jaeles-project/jaeles@latest
fi

if command -v joomscan >/dev/null 2>&1; then
  skip "JoomScan" "$(command -v joomscan)"
else
  log "Installing JoomScan (joomscan)"
  apt install joomscan  # or git clone https://github.com/OWASP/joomscan
fi

if command -v droopescan >/dev/null 2>&1; then
  skip "Droopescan" "$(command -v droopescan)"
else
  log "Installing Droopescan (droopescan)"
  pip install droopescan
fi

if command -v oralyzer >/dev/null 2>&1; then
  skip "Oralyzer" "$(command -v oralyzer)"
else
  log "Installing Oralyzer (oralyzer)"
  git clone https://github.com/r0075h3ll/Oralyzer && pip install -r Oralyzer/requirements.txt
fi

if command -v Gxss >/dev/null 2>&1; then
  skip "Gxss" "$(command -v Gxss)"
else
  log "Installing Gxss (Gxss)"
  go install github.com/KathanP19/Gxss@latest
fi

if command -v kxss >/dev/null 2>&1; then
  skip "kxss" "$(command -v kxss)"
else
  log "Installing kxss (kxss)"
  go install github.com/tomnomnom/hacks/kxss@latest
fi

if command -v smuggler >/dev/null 2>&1; then
  skip "Smuggler" "$(command -v smuggler)"
else
  log "Installing Smuggler (smuggler)"
  git clone https://github.com/defparam/smuggler && cd smuggler  # run: python3 smuggler.py
fi

if command -v retire >/dev/null 2>&1; then
  skip "Retire.js" "$(command -v retire)"
else
  log "Installing Retire.js (retire)"
  npm install -g retire
fi

if command -v ppfuzz >/dev/null 2>&1; then
  skip "ppfuzz" "$(command -v ppfuzz)"
else
  log "Installing ppfuzz (ppfuzz)"
  cargo install ppfuzz
fi

# ── Wordlist ────────────────────────────────────────────────────
if command -v cewl >/dev/null 2>&1; then
  skip "CeWL" "$(command -v cewl)"
else
  log "Installing CeWL (cewl)"
  gem install cewl  # or apt install cewl
fi

if command -v wordlister >/dev/null 2>&1; then
  skip "Wordlister" "$(command -v wordlister)"
else
  log "Installing Wordlister (wordlister)"
  pip install wordlister
fi

log "All done. Run 'npm run dev' or launch the desktop app."
