# shellcheck shell=bash
# The shell half of target-env.mjs, for the scripts that start a server (start-local.sh,
# chain-e2e.sh): the same rule for which database, read the same way, so the server and the checks
# that drive it agree. Keep the two in step. Source it, then call lummy_target_choose.

LUMMY_PRODUCTION_REF=tnszimamfpuaqjrdynbu
LUMMY_WEB_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

# The value of $2 in env file $1 as target-env.mjs reads it: the last line naming it wins, one pair
# of surrounding quotes comes off. The file is read, never sourced.
lummy_env_get() {
  local line
  line=$(grep -E "^$2=" "$1" 2>/dev/null | tail -n 1) || true
  line=${line%$'\r'}
  line=${line#*=}
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  if [ "${#line}" -ge 2 ] && { [ "${line:0:1}" = '"' ] || [ "${line:0:1}" = "'" ]; } && [ "${line: -1}" = "${line:0:1}" ]; then
    line=${line:1:${#line}-2}
  fi
  printf '%s' "$line"
}

# The names an env file sets, once each, in order.
lummy_env_names() {
  grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' "$1" 2>/dev/null | sed 's/=$//' | awk '!seen[$0]++'
}

lummy_host_of() {
  local h=${1#*://}
  h=${h%%/*}
  h=${h%%:*}
  printf '%s' "${h:-none}"
}

# Decides the target and checks it can be used. Sets LUMMY_TARGET (staging or production),
# LUMMY_TARGET_WHY, LUMMY_STAGING_FILE, LUMMY_SUPABASE_URL and LUMMY_TARGET_HOST; on a refusal it
# says why on stderr and returns 1.
lummy_target_choose() {
  LUMMY_STAGING_FILE="$HOME/.lummy/staging.env"
  case "${LUMMY_ENV:-}" in
    staging) LUMMY_TARGET=staging LUMMY_TARGET_WHY="LUMMY_ENV=staging" ;;
    production) LUMMY_TARGET=production LUMMY_TARGET_WHY="LUMMY_ENV=production" ;;
    "")
      if [ -f "$LUMMY_STAGING_FILE" ]; then
        LUMMY_TARGET=staging LUMMY_TARGET_WHY="from ~/.lummy/staging.env"
      else
        LUMMY_TARGET=production LUMMY_TARGET_WHY="no ~/.lummy/staging.env"
      fi
      ;;
    *)
      echo "DB target: refused, LUMMY_ENV=$LUMMY_ENV is neither staging nor production" >&2
      return 1
      ;;
  esac

  if [ "$LUMMY_TARGET" = staging ]; then
    if [ ! -f "$LUMMY_STAGING_FILE" ]; then
      echo "DB target: refused, LUMMY_ENV=staging but $LUMMY_STAGING_FILE does not exist (docs/config/05-staging.md)" >&2
      return 1
    fi
    local name missing=""
    for name in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SECRET_KEY; do
      [ -n "$(lummy_env_get "$LUMMY_STAGING_FILE" "$name")" ] || missing="$missing${missing:+, }$name"
    done
    if [ -n "$missing" ]; then
      echo "DB target: refused, $LUMMY_STAGING_FILE: $missing missing" >&2
      return 1
    fi
    LUMMY_SUPABASE_URL=$(lummy_env_get "$LUMMY_STAGING_FILE" NEXT_PUBLIC_SUPABASE_URL)
    if [[ ! $LUMMY_SUPABASE_URL =~ ^https://[^/[:space:]]+ ]]; then
      echo "DB target: refused, $LUMMY_STAGING_FILE: NEXT_PUBLIC_SUPABASE_URL is not an https URL" >&2
      return 1
    fi
    for name in NEXT_PUBLIC_SUPABASE_URL STAGING_DB_URL; do
      case "$(lummy_env_get "$LUMMY_STAGING_FILE" "$name")" in
        *"$LUMMY_PRODUCTION_REF"*)
          echo "DB target: refused, $LUMMY_STAGING_FILE: $name names the production project $LUMMY_PRODUCTION_REF" >&2
          return 1
          ;;
      esac
    done
  else
    # As Next sees it: a value already exported wins over web/.env.local.
    LUMMY_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL-$(lummy_env_get "$LUMMY_WEB_DIR/.env.local" NEXT_PUBLIC_SUPABASE_URL)}
  fi
  LUMMY_TARGET_HOST=$(lummy_host_of "$LUMMY_SUPABASE_URL")
}

# The names lummy_target_export would export, one per line.
lummy_target_names() {
  if [ "$LUMMY_TARGET" = staging ]; then
    lummy_env_names "$LUMMY_STAGING_FILE" | grep -vx STAGING_DB_URL || true
  fi
  echo NEXT_DIST_DIR
}

# Exports the staging file's values (so they win over web/.env.local, which Next only reads for
# what is unset) and the build folder that goes with the target. The database password stays out.
lummy_target_export() {
  local name
  if [ "$LUMMY_TARGET" = staging ]; then
    while IFS= read -r name; do
      [ "$name" = STAGING_DB_URL ] && continue
      export "$name=$(lummy_env_get "$LUMMY_STAGING_FILE" "$name")"
    done < <(lummy_env_names "$LUMMY_STAGING_FILE")
    export NEXT_DIST_DIR=.next-staging
  else
    export NEXT_DIST_DIR=.next
  fi
}

# The same banner target-env.mjs prints, plus why this target was chosen.
lummy_target_banner() {
  case "$LUMMY_SUPABASE_URL" in
    *"$LUMMY_PRODUCTION_REF"*)
      echo "WARNING: DB target: PRODUCTION ($LUMMY_TARGET_HOST), writes land in the live database ($LUMMY_TARGET_WHY)"
      return
      ;;
  esac
  if [ "$LUMMY_TARGET_HOST" = none ]; then
    echo "DB target: none, no NEXT_PUBLIC_SUPABASE_URL set ($LUMMY_TARGET_WHY)"
  elif [ "$LUMMY_TARGET" = staging ]; then
    echo "DB target: staging ($LUMMY_TARGET_HOST), $LUMMY_TARGET_WHY"
  else
    echo "DB target: web/.env.local ($LUMMY_TARGET_HOST), $LUMMY_TARGET_WHY"
  fi
}
