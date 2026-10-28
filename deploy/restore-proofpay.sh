#!/usr/bin/env bash
# Memulihkan service ProofPay (demo hackathon PayPal AI) setelah VM diganti.
# Mengikuti pola restore-*.sh proyek lain (mis. grab-tracker-bot):
# pasang unit systemd dari deploy/proofpay.service, buat env file bila belum
# ada, lalu enable + restart + verifikasi aktif.
# CATATAN: skrip ini TIDAK menyentuh cloudflared, DNS, atau konfigurasi tunnel.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$DEPLOY_DIR")"
ENV_FILE="$DEPLOY_DIR/proofpay.env"

if ! command -v node >/dev/null 2>&1; then
  echo "node tidak ditemukan — service tidak dibuat." >&2
  exit 1
fi

# Env file: buat hanya bila belum ada (jangan menimpa token yang sudah diisi).
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
# ProofPay runtime environment (mode 600; JANGAN commit nilai asli)
PORT=3102
PAYPAL_ENV=sandbox
PROOFPAY_SECRETS_FILE=$APP_DIR/data/secrets.json
# Wajib diisi sebelum app diekspos ke publik: token penjaga halaman /connect
PROOFPAY_SETUP_TOKEN=
EOF
  echo "Env file dibuat: $ENV_FILE (isi PROOFPAY_SETUP_TOKEN sebelum ekspos publik)"
fi
chmod 600 "$ENV_FILE"

# Unit: salin template sambil mengganti __APP_DIR__ dengan path repo aktual.
sed "s|__APP_DIR__|$APP_DIR|g" "$DEPLOY_DIR/proofpay.service" \
  > /etc/systemd/system/proofpay.service

systemctl daemon-reload
systemctl enable --now proofpay.service
systemctl restart proofpay.service
sleep 3
systemctl is-active proofpay.service
journalctl -u proofpay.service -n 5 --no-pager || true
