#!/bin/sh
set -e

ADDON_OPTIONS=/data/options.json

if [ -f "$ADDON_OPTIONS" ]; then
  # Home Assistant add-on: the Supervisor manages the container; options are read by the app.
  DATA_DIR_RESOLVED=$(node -e "const o=require('$ADDON_OPTIONS');process.stdout.write(o.data_dir||'/share/travelsteps')")
  mkdir -p "$DATA_DIR_RESOLVED"
  exec "$@"
fi

# Plain Docker: make sure the mounted host folder is writable, then drop root privileges.
mkdir -p "$DATA_DIR"
if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
