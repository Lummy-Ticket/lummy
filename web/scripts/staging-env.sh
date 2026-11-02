#!/usr/bin/env bash
# Writes ~/.lummy/staging.env for the lummy-staging Supabase project (docs/config/05-staging.md).
# It asks for each value in turn; the secret key and the database password are typed at hidden
# prompts, and nothing secret is ever printed, only the names written. Anything that names the
# production project is refused. CRON_SECRET is made up on the spot.
#
#   bash ~/code/opertix/web/scripts/staging-env.sh
#
# The Xendit test keys are not asked for: the server and the checks take them from web/.env.local.
set -euo pipefail

PRODUCTION_REF=tnszimamfpuaqjrdynbu
file="$HOME/.lummy/staging.env"

# CR from a Windows paste and spaces at either end go.
trim() {
  local v=${1//$'\r'/}
  v="${v#"${v%%[![:space:]]*}"}"
  printf '%s' "${v%"${v##*[![:space:]]}"}"
}
refuse() {
  echo "Not written: $1" >&2
  exit 1
}

if [ -f "$file" ]; then
  read -rp "$file already exists. Replace it? Type yes to go on: " answer
  [ "$(trim "$answer")" = yes ] || refuse "kept the file as it is."
fi

echo "From the lummy-staging project in the Supabase dashboard (docs/config/05-staging.md):"
read -rp "Project URL, like https://abcdefghijklmnopqrst.supabase.co : " url
url=$(trim "$url")
url=${url%/}
[[ $url =~ ^https://([a-z0-9]+)\.supabase\.co$ ]] || refuse "the project URL should look like https://REF.supabase.co"
ref=${BASH_REMATCH[1]}
[ "$ref" != "$PRODUCTION_REF" ] || refuse "that is the production project. Staging has to be a project of its own."

read -rp "Publishable key (sb_publishable_...): " publishable
publishable=$(trim "$publishable")
[[ $publishable =~ ^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9._-]+)$ ]] || refuse "that does not look like a publishable key"

read -rsp "Secret key (sb_secret_..., hidden): " secret
echo
secret=$(trim "$secret")
[[ $secret =~ ^(sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9._-]+)$ ]] || refuse "that does not look like a secret key"

echo "Connect > Session pooler shows a string like postgresql://postgres.REF:[YOUR-PASSWORD]@aws-...pooler.supabase.com:5432/postgres"
read -rp "Paste it as shown, with [YOUR-PASSWORD] still in it: " pooler
pooler=$(trim "$pooler")
[[ $pooler =~ ^postgres(ql)?://postgres\.([a-z0-9]+)(:\[YOUR-PASSWORD\])?@[A-Za-z0-9.-]+:[0-9]+/[A-Za-z0-9_]+$ ]] ||
  refuse "that is not the Session pooler string with [YOUR-PASSWORD] in it (if you pasted the password into it, paste it again without)"
[ "${BASH_REMATCH[2]}" = "$ref" ] || refuse "that connection string is for project ${BASH_REMATCH[2]}, the URL for $ref"

read -rsp "Database password (hidden): " password
echo
password=${password//$'\r'/}
[ -n "$password" ] || refuse "the password is empty"

# The password goes into the connection string percent-encoded, byte by byte, as the CLI expects.
encoded=""
LC_ALL=C
for ((i = 0; i < ${#password}; i++)); do
  c=${password:i:1}
  case "$c" in
    [A-Za-z0-9._~-]) encoded+=$c ;;
    *) encoded+=$(printf '%%%02X' "'$c") ;;
  esac
done
unset password
if [[ $pooler == *"[YOUR-PASSWORD]"* ]]; then
  db_url=${pooler/\[YOUR-PASSWORD\]/$encoded}
else
  db_url=${pooler/@/:$encoded@}
fi
unset encoded

umask 077
mkdir -p "$HOME/.lummy"
tmp=$(mktemp "$HOME/.lummy/.staging.XXXXXX")
{
  echo "# lummy-staging ($ref), written by web/scripts/staging-env.sh. Made-up data only."
  printf 'NEXT_PUBLIC_SUPABASE_URL=%s\n' "$url"
  printf 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=%s\n' "$publishable"
  printf 'SUPABASE_SECRET_KEY=%s\n' "$secret"
  printf 'STAGING_DB_URL=%s\n' "$db_url"
  printf 'CRON_SECRET=%s\n' "$(openssl rand -hex 32)"
} > "$tmp"
unset secret db_url
chmod 600 "$tmp"
mv "$tmp" "$file"
echo "Wrote $file (mode 600) for project $ref: NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SECRET_KEY STAGING_DB_URL CRON_SECRET."
echo "Next: cd ~/code/opertix/web && npm run staging:setup"
