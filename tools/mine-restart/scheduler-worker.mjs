// Optional Cloudflare Cron Trigger fallback. Configure UTC schedules
// 7 11 * * * and 7 12 * * * and set the GITHUB_DISPATCH_TOKEN secret.
// Disable the native GitHub cron before enabling these triggers.
const clock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
});
const url = 'https://api.github.com/repos/toddaggie95/swc-personal-analytics/actions/workflows/swc-kashyyyk-mine-audit.yml/dispatches';

export async function dispatchMorningAudit(scheduledTime, token, request = fetch) {
  if (!Number.isFinite(scheduledTime)) throw Error('Missing scheduled occurrence time.');
  if (clock.format(new Date(scheduledTime)) !== '06:07') return {dispatched: false};
  if (typeof token !== 'string' || !token.trim()) throw Error('GitHub dispatch credential is missing.');
  const response = await request(url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token.trim(),
      'Content-Type': 'application/json',
      'User-Agent': 'SWC-morning-mine-scheduler',
      'X-GitHub-Api-Version': '2026-03-10',
    },
    body: JSON.stringify({ref: 'main', inputs: {system: 'All', resume_eligible: 'true', resume_run_id: ''}}),
  });
  if (!response.ok) throw Error('GitHub workflow dispatch returned HTTP ' + response.status + '.');
  const result = response.status === 200 ? await response.json() : {};
  return {dispatched: true, runId: Number.isSafeInteger(result.workflow_run_id) ? result.workflow_run_id : null};
}

export default {
  async scheduled(event, env) {
    // Do not issue a second dispatch if the first response is ambiguous.
    const result = await dispatchMorningAudit(event.scheduledTime, env.GITHUB_DISPATCH_TOKEN);
    console.log(JSON.stringify(result));
  },
};
