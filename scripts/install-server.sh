#!/usr/bin/env bash
# =============================================================================
# Installs or updates the hotel room tracker on an Ubuntu server
# (written for Amazon Lightsail, Ubuntu 24.04, 2 GB RAM).
#
# First install, on the server:
#   curl -fsSL https://raw.githubusercontent.com/elio-fyshku1/hotel-rooms/main/scripts/install-server.sh -o install.sh
#   sudo bash install.sh
#
# Update to the latest code on GitHub (keeps all data):
#   sudo bash /opt/hotel-rooms/scripts/install-server.sh
#
# Switch to HTTPS once a domain points to this server's IP:
#   sudo DOMAIN=dhomat.example.al bash /opt/hotel-rooms/scripts/install-server.sh
# =============================================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/elio-fyshku1/hotel-rooms.git}"
APP_DIR="${APP_DIR:-/opt/hotel-rooms}"
ENV_FILE="$APP_DIR/.env"


# --- 1. Software: Docker, Caddy (web server for HTTPS) and git ----------------

if ! command -v docker >/dev/null; then
  echo "==> Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi

if ! command -v caddy >/dev/null || ! command -v git >/dev/null; then
  echo "==> Installing Caddy and git"
  apt-get update -qq
  apt-get install -y -qq caddy git
fi

# Building the app needs about 1.5 GB of memory. Add 2 GB of swap on small
# servers so the build can't run out of memory.
if [ "$(swapon --show --noheadings | wc -l)" -eq 0 ] && [ ! -f /swapfile ]; then
  echo "==> Adding 2 GB swap"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi


# --- 2. Code: download the first time, update after that ----------------------

if [ -d "$APP_DIR/.git" ]; then
  echo "==> Updating the code"
  git -C "$APP_DIR" pull --ff-only
else
  echo "==> Downloading the code"
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"


# --- 3. Settings: random passwords, created only on the first install ---------
# .env is not in git, so updating the code never touches it.

FIRST_INSTALL=0
if [ ! -f "$ENV_FILE" ]; then
  FIRST_INSTALL=1
  cat > "$ENV_FILE" <<EOF
DB_PASSWORD=$(openssl rand -hex 16)
SESSION_SECRET=$(openssl rand -hex 32)
ADMIN_PASSWORD=$(openssl rand -hex 5)
APP_BIND=127.0.0.1
COOKIE_SECURE=false
DOMAIN=
EOF
  chmod 600 "$ENV_FILE"
fi

# A DOMAIN given on the command line is saved, and turns on secure cookies
# (the site will be HTTPS from now on)
if [ -n "${DOMAIN:-}" ]; then
  sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN/; s/^COOKIE_SECURE=.*/COOKIE_SECURE=true/" "$ENV_FILE"
fi

# Load the saved values into this script
set -a
. "$ENV_FILE"
set +a


# --- 4. Start the database and the app ----------------------------------------

echo "==> Building and starting (the first build takes a few minutes)"
docker compose up -d --build

# Wait until PostgreSQL accepts connections over the network. During its first
# start it runs a temporary server that only listens on a local socket.
echo "==> Waiting for the database"
for _ in $(seq 1 60); do
  if docker compose exec -T db pg_isready -h 127.0.0.1 -U hotel </dev/null >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

# Create/update the tables and the admin user. Safe to run on every update.
docker compose exec -T app node scripts/setup-db.mjs </dev/null


# --- 5. Caddy: forwards web traffic to the app --------------------------------
# With a domain, Caddy gets a free HTTPS certificate by itself.
# Without one, the app is served over plain HTTP on the server's IP.

if [ -n "${DOMAIN:-}" ]; then
  SITE_ADDRESS="$DOMAIN"
else
  SITE_ADDRESS=":80"
fi

cat > /etc/caddy/Caddyfile <<EOF
$SITE_ADDRESS {
  reverse_proxy 127.0.0.1:3000
}
EOF
systemctl reload caddy 2>/dev/null || systemctl restart caddy


# --- 6. Summary ----------------------------------------------------------------

PUBLIC_IP="$(curl -fs https://checkip.amazonaws.com 2>/dev/null || echo "SERVER-IP")"
echo
echo "============================================================"
if [ -n "${DOMAIN:-}" ]; then
  echo " Open: https://$DOMAIN"
else
  echo " Open: http://$PUBLIC_IP"
fi
if [ "$FIRST_INSTALL" -eq 1 ]; then
  echo " Login: admin / $ADMIN_PASSWORD"
  echo " (write it down; change it in Administrimi -> Perdoruesit)"
fi
echo "============================================================"
