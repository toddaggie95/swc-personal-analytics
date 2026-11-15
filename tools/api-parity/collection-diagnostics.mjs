// Only fixed labels escape the collector; never return exception text or response bodies.
export function failureCategory(error, phase) {
 const message=typeof error?.message==='string'?error.message:'';
 if(message.startsWith('OAuth refresh rejected by server'))return 'oauth-refresh-rejected';
 if(message.startsWith('OAuth refresh forbidden'))return 'oauth-refresh-forbidden';
 if(message.startsWith('OAuth refresh rate-limited'))return 'oauth-refresh-rate-limited';
 if(message.startsWith('OAuth refresh network'))return 'oauth-refresh-network';
 if(message.startsWith('OAuth refresh failed due to server'))return 'oauth-refresh-server';
 if(message.startsWith('OAuth refresh error structure'))return 'oauth-refresh-unclassified';
 if(/persist|secret writer|gh secret/i.test(message))return 'token-persistence';
 if(/rate limit|pacing/i.test(message))return 'api-quota';
 if(message.startsWith('SWC request failed or timed out'))return 'api-transport';
 if(message.startsWith('SWC data request failed'))return 'api-http';
 if(phase==='station-contract')return 'station-contract';
 return 'unclassified';
}
