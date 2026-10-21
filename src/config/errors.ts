import { SafeError } from './index.js';

/** Only fixed diagnostics leave the process; never echo SDK messages or paths. */
export function safeFailure(error: unknown, stage: string): string {
  if (error instanceof SafeError) return error.message;
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const hints: Record<string, string> = {
    ENOENT: 'A required local file is missing. Run auth:start in this same terminal first.',
    EACCES: 'Windows denied access to local storage.',
    EPERM: 'Windows blocked a local file operation.',
    EBUSY: 'A local file is in use by another process.',
    ENOSPC: 'Local storage is full.',
  };
  const hint = typeof code === 'string' ? hints[code] : undefined;
  return `Failed during ${stage}. ${hint ?? (error instanceof SyntaxError ? 'A local JSON file could not be parsed.' : 'Unexpected failure; sensitive details suppressed.')}`;
}
