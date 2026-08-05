#!/usr/bin/env bash
# Mirror public/ to OVH web hosting over FTPS.
# Required env vars: OVH_FTP_HOST, OVH_FTP_USER, OVH_FTP_PASS
# Optional: OVH_FTP_REMOTE_DIR (default: www — OVH's web root)
set -euo pipefail

: "${OVH_FTP_HOST:?Set OVH_FTP_HOST}"
: "${OVH_FTP_USER:?Set OVH_FTP_USER}"
: "${OVH_FTP_PASS:?Set OVH_FTP_PASS}"
REMOTE_DIR="${OVH_FTP_REMOTE_DIR:-www}"

cd "$(dirname "$0")/.."

lftp -u "$OVH_FTP_USER,$OVH_FTP_PASS" "$OVH_FTP_HOST" <<EOF
set ftp:ssl-force true
set ssl:verify-certificate true
mirror -R --delete --verbose --exclude-glob .DS_Store public/ "$REMOTE_DIR"
bye
EOF
