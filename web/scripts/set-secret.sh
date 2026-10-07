#!/usr/bin/env bash
# Menyimpan satu rahasia ke file env di luar repo tanpa pernah menampilkannya. Nilainya diketik di
# prompt tersembunyi (tidak tampil, tidak masuk riwayat terminal), baris lama dengan nama yang sama
# diganti, dan file tetap mode 600. Yang tercetak cuma panjangnya.
#
#   bash ~/code/opertix/web/scripts/set-secret.sh GEMINI_API_KEY
#   bash ~/code/opertix/web/scripts/set-secret.sh CRON_SECRET --generate    # nilai acak, tidak perlu diketik
#
# Bawaan ke ~/.lummy/production.env; file lain lewat SECRET_FILE=... di depan perintah. Setelah itu
# bilang ke Claude nama yang sudah diisi (bukan nilainya), supaya dipasang di Vercel dari file ini.
set -euo pipefail

name="${1:-}"
mode="${2:-}"
file="${SECRET_FILE:-$HOME/.lummy/production.env}"

if [[ ! "$name" =~ ^[A-Z][A-Z0-9_]*$ ]]; then
  echo "Pakai: bash set-secret.sh NAMA_ENV [--generate]   (nama: huruf besar, angka, garis bawah)" >&2
  exit 1
fi

if [[ "$mode" == "--generate" ]]; then
  value="$(openssl rand -hex 32)"
elif [[ -z "$mode" ]]; then
  read -rsp "Tempel nilai $name lalu Enter (tidak tampil): " value
  echo
else
  echo "Opsi tidak dikenal: $mode" >&2
  exit 1
fi

# CR dari tempelan Windows dan spasi di ujung dibuang. Sisanya harus berbentuk kunci: huruf, angka,
# dan . _ - + / = : ~ saja, supaya file tetap aman di-source bash.
value="${value//$'\r'/}"
value="${value#"${value%%[![:space:]]*}"}"
value="${value%"${value##*[![:space:]]}"}"
key_chars='^[A-Za-z0-9._~+/=:-]+$'
if [[ -z "$value" ]]; then
  echo "Kosong, tidak ada yang disimpan." >&2
  exit 1
fi
if [[ ! "$value" =~ $key_chars ]]; then
  echo "Nilainya berisi spasi, tanda kutip, < >, atau karakter lain yang bukan bagian dari kunci. Tidak disimpan; tempel kuncinya saja." >&2
  exit 1
fi

umask 077
mkdir -p "$(dirname "$file")"
touch "$file"
tmp="$(mktemp "$(dirname "$file")/.env.XXXXXX")"
grep -v "^${name}=" "$file" > "$tmp" || true
printf '%s=%s\n' "$name" "$value" >> "$tmp"
chmod 600 "$tmp"
mv "$tmp" "$file"
echo "$name tersimpan di $file (${#value} karakter)."
unset value
