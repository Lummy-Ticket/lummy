#!/usr/bin/env bash
# The local check server: `next start` on one port, with a throwaway demo key and ticket pepper,
# never the production ones. It runs against the staging project when ~/.lummy/staging.env exists
# and against web/.env.local, which is production, when it does not (docs/config/05-staging.md).
#
#   bash ~/code/opertix/web/scripts/start-local.sh [--port N] [chain] [--build] [--dry-run]
#
# --port     the port, 3000 when not given. Only the server already on that port is stopped.
# chain      adds the testnet operator keys from ~/.lummy/testnet.env, without the deployer and
#            seller keys, which never belong on a server.
# --build    builds first even when the build looks current. Without it the script builds when
#            there is no build yet or a source file is newer than it.
# --dry-run  prints which database it would use and the names of the variables it would export.
# LUMMY_ENV=production forces web/.env.local; LUMMY_ENV=staging insists on the staging file.
#
# NEXT_PUBLIC_ values are fixed at build time, so staging has its own build in web/.next-staging
# and production's stays in web/.next.
# shellcheck source=/dev/null
[ -f "$HOME/.lummy-env.sh" ] && . "$HOME/.lummy-env.sh"
set -euo pipefail

usage() { sed -n '6,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

port=3000 chain=0 build=0 dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --port) port=${2:-}; shift; [ $# -gt 0 ] && shift ;;
    --port=*) port=${1#*=}; shift ;;
    chain) chain=1; shift ;;
    --build) build=1; shift ;;
    --dry-run) dry=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
if [[ ! $port =~ ^[0-9]+$ ]] || [ "$port" -lt 1024 ] || [ "$port" -gt 65535 ]; then
  echo "--port needs a number from 1024 to 65535" >&2
  exit 2
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."
. scripts/lib/target-env.sh
lummy_target_choose || exit 1
dist=.next
[ "$LUMMY_TARGET" = staging ] && dist=.next-staging

# A build is current when no source file, and for staging not the staging file either, is newer.
newer=""
if [ -f "$dist/BUILD_ID" ]; then
  extra=()
  [ "$LUMMY_TARGET" = staging ] && extra=("$LUMMY_STAGING_FILE")
  newer=$(find src public next.config.ts package.json package-lock.json tsconfig.json postcss.config.mjs "${extra[@]}" \
    -newer "$dist/BUILD_ID" -print -quit 2>/dev/null || true)
fi
# A staging build carries the host it was made for, so one built by hand with other NEXT_PUBLIC_
# values, or for an earlier staging project, is never served as staging.
stamp=$dist/lummy-supabase-host
why_build=""
if [ "$build" = 1 ]; then
  why_build="--build"
elif [ ! -f "$dist/BUILD_ID" ]; then
  why_build="no build in web/$dist yet"
elif [ -n "$newer" ]; then
  why_build="$newer is newer than the build in web/$dist"
elif [ "$LUMMY_TARGET" = staging ] && [ "$(cat "$stamp" 2>/dev/null)" != "$LUMMY_TARGET_HOST" ]; then
  why_build="the build in web/$dist was not made by this script for $LUMMY_TARGET_HOST"
fi

if [ "$dry" = 1 ]; then
  lummy_target_banner
  echo "Port $port, build web/$dist${why_build:+, would build first: $why_build}"
  names=$(
    {
      [ "$chain" = 1 ] && lummy_env_names "$HOME/.lummy/testnet.env" | grep -vxE 'DEPLOYER_PRIVATE_KEY|SELLER_PRIVATE_KEY|LUMMY_DEMO_KEY'
      lummy_target_names
      echo LUMMY_DEMO_KEY
      echo TICKET_BARCODE_PEPPER
    } | awk '!seen[$0]++' | tr '\n' ' '
  )
  echo "Would export: $names"
  exit 0
fi

lummy_target_banner

# Only this port's server goes: other agents and other checks keep theirs.
if fuser -s -n tcp "$port" 2>/dev/null; then
  fuser -k -TERM -n tcp "$port" >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do
    fuser -s -n tcp "$port" 2>/dev/null || break
    sleep 0.5
  done
  fuser -k -KILL -n tcp "$port" >/dev/null 2>&1 || true
fi

# The testnet file holds the production demo key too; the throwaway one below replaces it.
if [ "$chain" = 1 ]; then
  if [ ! -f "$HOME/.lummy/testnet.env" ]; then
    echo "chain needs ~/.lummy/testnet.env" >&2
    exit 1
  fi
  set -a
  # shellcheck source=/dev/null
  . "$HOME/.lummy/testnet.env"
  set +a
  unset DEPLOYER_PRIVATE_KEY SELLER_PRIVATE_KEY
fi
lummy_target_export

if [ -n "$why_build" ]; then
  buildlog=/tmp/lummy-build-$port.log
  echo "Building web/$dist ($why_build), log in $buildlog. It waits for /tmp/lummy-heavy.lock first."
  # A build points next-env.d.ts at its own folder; the type check of the repo keeps using .next.
  envdts=""
  if [ "$dist" != .next ] && [ -f next-env.d.ts ]; then
    envdts=$(mktemp)
    cp next-env.d.ts "$envdts"
  fi
  restore_envdts() {
    if [ -n "$envdts" ]; then
      cat "$envdts" > next-env.d.ts
      rm -f "$envdts"
    elif [ "$dist" != .next ]; then
      rm -f next-env.d.ts
    fi
  }
  started=$SECONDS
  if ! flock /tmp/lummy-heavy.lock npx next build > "$buildlog" 2>&1; then
    restore_envdts
    tail -n 40 "$buildlog" >&2
    echo "The build failed; see $buildlog" >&2
    exit 1
  fi
  restore_envdts
  [ "$LUMMY_TARGET" = staging ] && printf '%s\n' "$LUMMY_TARGET_HOST" > "$stamp"
  echo "Built in $((SECONDS - started)) s."
fi

[ -f /tmp/lummy-local-key ] || head -c 18 /dev/urandom | base64 | tr -d "/+=" > /tmp/lummy-local-key
chmod 600 /tmp/lummy-local-key
LUMMY_DEMO_KEY="$(cat /tmp/lummy-local-key)"
export LUMMY_DEMO_KEY
# A throwaway local pepper for the ticket check, never the production one.
[ -f /tmp/lummy-local-pepper ] || head -c 32 /dev/urandom | base64 | tr -d "/+=" > /tmp/lummy-local-pepper
chmod 600 /tmp/lummy-local-pepper
TICKET_BARCODE_PEPPER="local-$(cat /tmp/lummy-local-pepper)"
export TICKET_BARCODE_PEPPER

log=/tmp/lummy-next-$port.log
setsid nohup npx next start -p "$port" > "$log" 2>&1 < /dev/null &
up=0
for _ in $(seq 1 60); do
  sleep 1
  if curl -s -o /dev/null "http://127.0.0.1:$port/api/chain"; then
    up=1
    break
  fi
done
if [ "$up" = 0 ]; then
  tail -n 30 "$log" >&2
  echo "The server did not answer on :$port within a minute; see $log" >&2
  exit 1
fi

# Which database this server uses, for target-env.mjs to compare with the checks it is given.
pid=$(fuser -n tcp "$port" 2>/dev/null | awk '{print $1}')
printf '%s %s %s\n' "$LUMMY_TARGET" "$LUMMY_TARGET_HOST" "$pid" > "/tmp/lummy-next-$port.target"

curl -s "http://127.0.0.1:$port/api/demo/session"
echo
curl -s "http://127.0.0.1:$port/api/chain"
echo
lummy_target_banner
echo "Server: http://127.0.0.1:$port from web/$dist, log in $log, stop it with: fuser -k $port/tcp"
echo "Checks take the throwaway demo key: BASE=http://127.0.0.1:$port DEMO_KEY=\"\$(cat /tmp/lummy-local-key)\" npm run auth:check"
