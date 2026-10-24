# On-demand SonarQube operations

VM: `sonarqube-vm`, project `priyanshu-apps`, zone `asia-south1-a`.
Host: https://sonar.priyanshumodi.in (Cloudflare Access OTP, then SonarQube login).

Start this VM before manually dispatching **SonarQube release scan** on main.
The workflow uses a kubiq project analysis token and Cloudflare service token
stored in repository Actions secrets. It waits for the quality gate and reports
failure in Actions. It does not start a VM on every code push.

The VM uses `sonarqube-ops@priyanshu-apps.iam.gserviceaccount.com` with no downloaded
identity key. It has object access to the private backup bucket and Editor access
to only the explicitly shared scan spreadsheet owned by kubiq20@gmail.com:
https://docs.google.com/spreadsheets/d/1C7G0-c7mjQkQ3ur57u20mdv-XPIXWVBxWwgwyNHQqGY/edit

`ops.py` is installed at `/usr/local/sbin/sonar-ops`. It is pinned to the deployed
SonarQube 26.3 PostgreSQL schema; revalidate its read-only queries before upgrades.
It never modifies SonarQube's application tables. Each successful analysis creates
a dated sheet tab containing every issue/hotspot, path, line, rule and issue link.
Issue values use RAW input to prevent spreadsheet formula injection. Code text,
paths and rule names remain available in Sheets while the VM is stopped; the
SonarQube issue links require the VM to be running.

Timers run idle checks each minute, export new analyses each five minutes, and
back up PostgreSQL every six hours while running. Browser/scanner HTTP requests
and queued/processing analysis prevent idle shutdown. Internal health polling
does not. The VM stops after two hours without activity, after export and backup
succeed. Preservation failures prevent an idle stop and appear in systemd logs.
The old two-hours-from-boot shutdown is canceled by the idle service.

There is an independent persistent shutdown timer at **2026-12-22 00:00 UTC**
(05:30 IST), before the December 23 credit expiry. This is a date cutoff; it
cannot read the promotional credit balance. Check the billing account before
starting the VM if credits may have depleted earlier. Stopped disks and retained
backups still have charges. Before the deadline, download the last backup and
reports, then remove the VM/disk and bucket only after verifying your copy.

Backups: `gs://priyanshu-apps-sonarqube-backups/postgres/` with 30-day lifecycle
retention. `sonar-ops backup` uploads a custom-format dump, downloads it and compares
bytes. `sonar-ops restore-check` restores the latest backup into a new, temporary
database, verifies the issue count, and deletes only that disposable database.
It does not overwrite the live database. Disaster restore into a replacement VM:
install the same pinned PostgreSQL and SonarQube versions, download a dump, stop
the SonarQube application, restore into an empty PostgreSQL `sonar` database with
`pg_restore --no-owner --exit-on-error`, then start SonarQube and verify project,
analysis and issue counts before routing traffic. The temporary-database restore
check validates the dump, not a complete replacement-VM disaster recovery drill.

GCP Control reads a status-only object published each minute. Reports older than
three minutes or from a previous boot show unavailable. Monitoring requests do
not reset inactivity. The card stays read-only and keeps the k3s VM separate.

Exports now use archive schema 3: `{schemaVersion, metadata, issues}`. Older
array-format archives are retained unchanged. Spreadsheet reports preserve the
original twelve columns and append commit SHA, analysis ID, quality gate,
coverage, hotspot review percentage, open issue count and unreviewed hotspot
count. A completed analysis with a failed quality gate is still exported.
New reports also append new-code coverage and duplication columns, and retain
the full quality-gate conditions in archive metadata. Existing sheet tabs and
the first nineteen report columns are preserved unchanged.
Export state is marked successful only after the Sheets write and archive upload;
an export failure continues to prevent idle shutdown. Format-3 export was verified
against analysis `1571c7e1-ac6e-42a0-82b0-ac4229db5f8f` (gate ERROR).

Maintenance commands (via IAP SSH):

```sh
sudo systemctl list-timers 'sonar-*'
sudo journalctl -u sonar-idle -u sonar-export -u sonar-backup --since today
sudo /usr/local/sbin/sonar-ops export
sudo /usr/local/sbin/sonar-ops backup
sudo /usr/local/sbin/sonar-ops restore-check
sudo /usr/local/sbin/sonar-ops idle-dry-run
sudo python3 /tmp/sonar-test.py
```

The currently provisioned Sonar analysis token expires November 20, 2026;
the Cloudflare service token expires December 20, 2026. Renew credentials within
the same project/application scope before their expiry if continuing to scan.
