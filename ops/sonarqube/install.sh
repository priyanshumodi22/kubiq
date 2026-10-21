#!/bin/sh
set -eu
install -d -m 700 /var/lib/sonarqube-ops
install -m 700 /tmp/sonar-ops.py /usr/local/sbin/sonar-ops
for job in idle export backup; do
  case "$job" in
    idle) interval=60s ;;
    export) interval=5min ;;
    backup) interval=6h ;;
  esac
  printf '[Unit]\nDescription=SonarQube %s\nAfter=docker.service\n[Service]\nType=oneshot\nExecStart=/usr/local/sbin/sonar-ops %s\nTimeoutStartSec=15min\n' "$job" "$job" > "/etc/systemd/system/sonar-$job.service"
  printf '[Unit]\nDescription=SonarQube %s schedule\n[Timer]\nOnBootSec=3min\nOnUnitActiveSec=%s\n[Install]\nWantedBy=timers.target\n' "$job" "$interval" > "/etc/systemd/system/sonar-$job.timer"
done
printf '[Unit]\nDescription=Stop SonarQube before credit expiry\n[Service]\nType=oneshot\nExecStart=/usr/bin/systemctl poweroff\n' > /etc/systemd/system/sonar-deadline.service
printf '[Unit]\nDescription=SonarQube credit expiry cutoff\n[Timer]\nOnCalendar=2026-12-22 00:00:00 UTC\nPersistent=true\n[Install]\nWantedBy=timers.target\n' > /etc/systemd/system/sonar-deadline.timer
systemctl daemon-reload
systemctl enable --now sonar-idle.timer sonar-export.timer sonar-backup.timer sonar-deadline.timer
shutdown -c || true
