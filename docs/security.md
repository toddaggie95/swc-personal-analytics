# Security and local operation

The original app secret was exposed and must be considered compromised. Never use it in this project.
Regenerate it through SWC before activation testing. Acknowledgement flags default false.

Credentials live only in local `.env` and token storage, never source, tests, logs or Git. Test credentials
are explicitly synthetic. `.gitignore` excludes environment secrets, all data directories, token files,
databases, logs, build output and dependencies. Ignoring files does not encrypt them or remove files
already tracked elsewhere. Do not force-add private files.

This workspace is under OneDrive. Runtime data defaults outside it, under the current user's local app-data
directory. `.env` itself can still be synced by OneDrive: keep the project/local secrets out of shared sync,
or use local process environment variables for credentials instead. Never place runtime storage in a shared
or cloud-synced folder. `SWC_PRIVATE_DIR` must be absolute and outside the current project directory.

Storage is plaintext for this single-user development proof. New directories/files request Unix modes
0700/0600, and replacement writes are atomic. Windows does not implement those modes as Unix ACLs:
security depends on the user-profile directory's inherited Windows ACLs. Check the private directory's
Security properties and limit access to your account and appropriate system administrators. This is not
an OS credential vault and does not protect against malware running as you. Future deployment needs a
proper secret store and encrypted-at-rest retention policy.

Only fixed character and owned-station GET endpoints are available. Requests refuse redirects so an OAuth
header is not forwarded to another host. OAuth token requests use the SDK's verified production endpoints.
SDK debug mode is disabled. No SWC username/password, scraping, Anubis challenge solving or Darkness
automation is supported. OAuth responses never enter the raw snapshot pipeline.

Hidden TTY entry avoids echoed codes and command-history secrets. State is checked before exchange whenever
returned; manual code-only mode has a documented limitation in oauth.md. PKCE must not be advertised as
enforced by SWC until confirmed. Pending sessions expire after ten minutes and are consumed before exchange.

Raw data is private even when it contains no credentials. Retain only as long as needed, do not attach it
to public issues, and avoid pasting it into chat. Error bodies could contain server diagnostics, so they
are stored privately and never printed. Top-level errors suppress underlying SDK/HTTP messages and stacks.

An exclusive `operation.lock` prevents simultaneous CLI commands racing token rotation. It is removed after
normal completion or errors. A forced termination can leave it behind: confirm no CLI process is still
running, then remove **only** `operation.lock` inside your configured private directory. No automatic stale
lock takeover is attempted. Starting OAuth again replaces the old pending session; only the newest URL works.

If a secret leaks, stop using it and reset/revoke it with SWC; deleting a local file or Git commit alone is
insufficient. Do not share the compromised value when reporting the issue.
