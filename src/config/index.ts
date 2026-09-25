import { homedir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { CharacterScopes, PersonalInventoryScopes } from 'swcombine-sdk';

export const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';
export const API_BASE = 'https://www.swcombine.com/ws/v2.0/';
export const SCOPES = [CharacterScopes.AUTH, CharacterScopes.READ,
  PersonalInventoryScopes.OVERVIEW, PersonalInventoryScopes.STATIONS.READ];
export class SafeError extends Error {}
export interface Config {
  clientId: string; clientSecret: string; privateDir: string;
  activated: boolean; regenerated: boolean;
  oobMode: 'state-required' | 'code-only'; pkce: 'disabled' | 's256';
}
export function loadConfig(env = process.env): Config {
  const pkce = env.SWC_PKCE || 'disabled';
  const oobMode = env.SWC_OOB_RESULT_MODE || 'state-required';
  if (pkce !== 'disabled' && pkce !== 's256') throw new SafeError('Invalid SWC_PKCE setting.');
  if (oobMode !== 'state-required' && oobMode !== 'code-only') throw new SafeError('Invalid OOB result mode.');
  const privateDir = env.SWC_PRIVATE_DIR || (process.platform === 'win32'
    ? join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'SWC Personal Analytics')
    : join(homedir(), '.local', 'share', 'swc-personal-analytics'));
  const rel = relative(process.cwd(), privateDir);
  if (!isAbsolute(privateDir) || rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new SafeError('Private storage must be an absolute path outside the repository.');
  }
  return { clientId: env.SWC_CLIENT_ID?.trim() || '', clientSecret: env.SWC_CLIENT_SECRET?.trim() || '',
    privateDir, activated: env.SWC_APP_ACTIVATED === 'true', regenerated: env.SWC_SECRET_REGENERATED === 'true', pkce, oobMode };
}
export function requireLive(config: Config): void {
  if (!config.activated) throw new SafeError('Live access blocked: await SWC application activation.');
  if (!config.regenerated) throw new SafeError('Live access blocked: regenerate the compromised app secret first.');
  if (!config.clientId || !config.clientSecret) throw new SafeError('Set the client ID and regenerated secret locally in .env.');
}
