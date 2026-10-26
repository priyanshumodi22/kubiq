#!/usr/bin/env bash
set -euo pipefail
umask 077
if [[ "${KUBIQ_STAGING_RESTORE_CONFIRMED:-}" != yes ]]; then
  echo 'Refusing restore: confirm the self-hosted database is still staging and kubiq still uses Atlas.' >&2
  exit 1
fi
export HOME=/work
OPS_DIR=${OPS_DIR:-/ops}
mongosh --nodb --norc --quiet $OPS_DIR/make-configs.js
mongodump --config=/work/source.yml --db=kubiq --out=/work/source --numParallelCollections=1 > /work/source-dump.log 2>&1
# This is a rehearsal. Atlas remains online; a final consistent copy requires a write pause.
MONGODB_ACTION=pause-ttl mongosh --nodb --norc --quiet $OPS_DIR/admin-control.js
trap 'MONGODB_ACTION=resume-ttl mongosh --nodb --norc --quiet $OPS_DIR/admin-control.js >/work/ttl-resume.log 2>&1' EXIT
mongorestore --config=/work/target.yml --dir=/work/source --nsInclude='kubiq.*' --drop --stopOnError --numParallelCollections=1 --numInsertionWorkersPerCollection=1 > /work/restore.log 2>&1
mongodump --config=/work/target.yml --db=kubiq --out=/work/restored --numParallelCollections=1 > /work/restored-dump.log 2>&1
mongosh --nodb --norc --quiet $OPS_DIR/verify-rehearsal.js
mongosh --nodb --norc --quiet $OPS_DIR/auth-check.js
mongosh --nodb --norc --quiet $OPS_DIR/admin-control.js
