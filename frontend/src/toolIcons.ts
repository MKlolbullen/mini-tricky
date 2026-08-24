import { CATEGORY_COLORS, CATEGORY_ICONS } from './types';

// Per-tool glyphs. Each tool gets a distinct, function-evocative icon rather
// than sharing a single category emoji. Falls back to the category icon, then
// a generic wrench, for anything unmapped.
export const TOOL_GLYPHS: Record<string, string> = {
  // Recon / DNS
  subfinder: '\u{1F50E}', httpx: '\u{1F310}', amass: '\u{1F5FA}', assetfinder: '\u{1F9ED}',
  findomain: '\u{1F30D}', dnsx: '\u{1F9EC}', shuffledns: '\u{1F500}', chaos: '\u{1F32A}',
  puredns: '\u{1F9F9}', alterx: '\u{1F504}', dnsgen: '\u{1F9EC}', gotator: '\u{1F3B0}',
  tlsx: '\u{1F4DC}', asnmap: '\u{1F5FA}', cero: '\u{1F4DC}', wappalyzer: '\u{1F9F1}',
  gowitness: '\u{1F4F8}', aquatone: '\u{1F4A7}',
  // Network (extended)
  mapcidr: '\u{1F5FA}', cdncheck: '\u{1F6E1}', smap: '\u{1F4E1}',
  httprobe: '\u{1F4E1}', urlfinder: '\u{1F517}', hakip2host: '\u{1F503}', dsieve: '\u{1FA9C}',
  dnsvalidator: '\u{2705}', 'github-subdomains': '\u{1F419}', gitdorker: '\u{1F50E}', cariddi: '\u{1F30A}',
  ppfuzz: '\u{1F9EC}', shortscan: '\u{1F4CF}',
  // Enumeration
  gobuster: '\u{1F528}', dirsearch: '\u{1F4C1}', feroxbuster: '\u{1F980}', wfuzz: '\u{1F300}',
  // Vulnerability
  nuclei: '\u{2622}', nikto: '\u{1FA7A}', wpscan: '\u{1F4DD}', sqlmap: '\u{1F489}',
  xsstrike: '\u{26A1}', dalfox: '\u{1F98A}',
  // Fuzzing
  ffuf: '\u{1F4A5}',
  // Crawling
  katana: '\u{1F577}', gospider: '\u{1F578}', hakrawler: '\u{1F9F5}', waybackurls: '\u{1F570}',
  // Network
  nmap: '\u{1F6F0}', masscan: '\u{1F4E1}', naabu: '\u{1F50C}', rustscan: '\u{1F6A8}',
  // OSINT
  theharvester: '\u{1F33E}', 'shodan-cli': '\u{1F441}', censys: '\u{1F4E1}', spiderfoot: '\u{1F43E}',
  // Archive
  gau: '\u{1F4DA}', waymore: '\u{23F3}',
  // Utility
  anew: '\u{2795}', qsreplace: '\u{1F501}', uro: '\u{1F9F9}', unfurl: '\u{1F38F}',
  'jq-filter': '\u{1F527}', gf: '\u{1F50D}', interlace: '\u{1F9F6}', rush: '\u{1F3C3}',
  notify: '\u{1F514}', meg: '\u{1F4E6}',
  // Params
  arjun: '\u{1F9E9}', paramspider: '\u{1F9F7}', x8: '\u{2734}', paraminer: '\u{26CF}',
  // API
  kiterunner: '\u{1FA81}', apifuzzer: '\u{1F9EA}', 'openapi-diff': '\u{1F500}', restler: '\u{1F517}',
  // SSRF
  ssrfmap: '\u{1F30A}', gopherus: '\u{1F439}', interactsh: '\u{1F4E1}', 'ssrf-sheriff': '\u{1F920}',
  // SSTI
  sstimap: '\u{1F525}', tplmap: '\u{1F9E8}',
  // CSRF / CORS
  xsrfprobe: '\u{1F6AB}', corscanner: '\u{1F6A7}', crlfuzz: '\u{21A9}',
  // Takeover
  subjack: '\u{1F3F4}', subzy: '\u{1F3F4}', 'nuclei-takeover': '\u{2622}',
  // Headers
  shcheck: '\u{1F4CB}', hakcheckurl: '\u{2714}',
  // JS Analysis
  linkfinder: '\u{1F517}', secretfinder: '\u{1F510}', getjs: '\u{1F4DC}', subjs: '\u{1F4C3}',
  jsluice: '\u{1F9C3}', mantra: '\u{1F9FF}', xnlinkfinder: '\u{1F578}',
  // GraphQL / API (extended)
  graphw00f: '\u{1F43A}', 'graphql-cop': '\u{1F46E}', clairvoyance: '\u{1F52E}',
  // Vulnerability (extended)
  gxss: '\u{1FA9E}', kxss: '\u{26A1}', smuggler: '\u{1F4E6}', retire: '\u{1F4DA}', semgrep: '\u{1F9EA}',
  // Wordlist
  cewl: '\u{1F4D6}', wordlister: '\u{1F4DD}',
  // Cloud
  s3scanner: '\u{2601}', cloudenum: '\u{26C5}', prowler: '\u{1F6E1}', scoutsuite: '\u{1F52D}',
  cloudsploit: '\u{1F329}', gcpbucketbrute: '\u{1FAA3}',
  // Kubernetes
  'kube-hunter': '\u{1F3F9}', 'kube-bench': '\u{1FA91}', kubeaudit: '\u{1F9FE}', trivy: '\u{1F433}',
  kubeletctl: '\u{1F579}', popeye: '\u{1F4AA}',
  // Secrets
  trufflehog: '\u{1F437}', gitleaks: '\u{1F4A7}',
  // Web App Testing
  whatweb: '\u{1F52C}', wafw00f: '\u{1F9F1}', testssl: '\u{1F512}', sslscan: '\u{1F50F}',
  ghauri: '\u{1FA78}', commix: '\u{2328}', jaeles: '\u{1F3AF}', cmseek: '\u{1F3DB}',
  joomscan: '\u{1F3D7}', droopescan: '\u{1F4A0}', nomore403: '\u{1F513}', oralyzer: '\u{21AA}',
  dirb: '\u{1F5C2}',
};

/** The glyph (emoji) for a tool, falling back to its category icon. */
export function toolGlyph(toolId: string | undefined, category?: string): string {
  if (toolId && TOOL_GLYPHS[toolId]) return TOOL_GLYPHS[toolId];
  if (category && CATEGORY_ICONS[category]) return CATEGORY_ICONS[category];
  return '\u{1F527}';
}

/** The badge color for a tool, keyed by its category. */
export function toolColor(category?: string): string {
  return (category && CATEGORY_COLORS[category]) || '#5bdcff';
}
