// Pure parts of the self-updater (no VS Code, no network) so they can be tested.
// VS Code does not auto-update extensions installed from a .vsix, so the extension checks the GitHub Releases itself.
import { createHash } from 'crypto';

export const REPO = 'SoreviR/token-binder';
export const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;
const MAX_VSIX_BYTES = 20 * 1024 * 1024;   // sanity cap: our .vsix is well under 1 MB
export const CHECK_EVERY_MS = 24 * 3600 * 1000;

export type Version = [major: number, minor: number, patch: number];

/** "v1.2.3" or "1.2.3" → [1, 2, 3]. Anything else (pre-release suffixes, extra parts) is rejected. */
export function parseVersion(s: string): Version | undefined {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(s).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

/** Is `candidate` a strictly newer version than `current`? Unparseable versions never count as newer. */
export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate), b = parseVersion(current);
  if (!a || !b) { return false; }
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) { return a[i] > b[i]; } }
  return false;
}

export interface ReleaseInfo {
  version: string;       // 1.5.0
  tag: string;           // v1.5.0
  vsixUrl: string;
  size: number;
  sha256?: string;       // hex, when GitHub reports a digest for the asset
  notesUrl: string;
}

/**
 * Picks the update from the response of `GET /repos/<repo>/releases/latest`. Strict on purpose: only a published,
 * non-prerelease `vX.Y.Z` release with a `token-binder-X.Y.Z.vsix` asset hosted in this repository is accepted.
 */
export function pickRelease(json: any): ReleaseInfo | undefined {
  if (!json || typeof json !== 'object' || json.draft || json.prerelease) { return undefined; }
  const tag = String(json.tag_name ?? '');
  const parsed = parseVersion(tag);
  if (!parsed || !tag.startsWith('v')) { return undefined; }
  const version = parsed.join('.');
  const name = `token-binder-${version}.vsix`;
  const asset = Array.isArray(json.assets) ? json.assets.find((a: any) => a?.name === name) : undefined;
  if (!asset || asset.browser_download_url !== `${DOWNLOAD_PREFIX}${tag}/${name}`) { return undefined; }
  const size = Number(asset.size);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_VSIX_BYTES) { return undefined; }
  const digest = /^sha256:([0-9a-f]{64})$/i.exec(String(asset.digest ?? ''));
  return {
    version, tag, vsixUrl: asset.browser_download_url, size,
    sha256: digest ? digest[1].toLowerCase() : undefined,
    notesUrl: `https://github.com/${REPO}/releases/tag/${tag}`,
  };
}

/** Does the downloaded file have the size (and, when known, the SHA-256) GitHub reports for the asset? */
export function verifyDownload(data: Uint8Array, info: Pick<ReleaseInfo, 'size' | 'sha256'>): boolean {
  if (data.byteLength !== info.size) { return false; }
  if (!info.sha256) { return true; }
  return createHash('sha256').update(data).digest('hex') === info.sha256;
}

/** Automatic checks run at most once per 24 h; a manual check always runs. */
export function shouldCheck(o: { now: number; lastCheck: number | undefined; manual: boolean; enabled: boolean }): boolean {
  if (o.manual) { return true; }
  if (!o.enabled) { return false; }
  return o.lastCheck === undefined || o.now - o.lastCheck >= CHECK_EVERY_MS || o.now < o.lastCheck;
}

/** Should the user be told about this version? Not if they chose to skip exactly that one (a newer one is announced again). */
export function shouldNotify(version: string, skipped: string | undefined, manual: boolean): boolean {
  return manual || skipped !== version;
}
