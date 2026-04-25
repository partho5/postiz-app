#!/usr/bin/env bash
# ============================================================
# Postiz deploy script
# Usage:
#   ./deploy.sh           — start all services
#   ./deploy.sh restart   — rebuild + restart all
#   ./deploy.sh stop      — stop all pm2 processes
#   ./deploy.sh status    — show pm2 status + port check
# ============================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

LOG_DIR="/var/log/postiz"
mkdir -p "$LOG_DIR"

# ── helpers ────────────────────────────────────────────────
info()  { echo -e "\033[0;36m[postiz]\033[0m $*"; }
ok()    { echo -e "\033[0;32m[postiz]\033[0m $*"; }
warn()  { echo -e "\033[0;33m[postiz]\033[0m $*"; }
die()   { echo -e "\033[0;31m[postiz] ERROR:\033[0m $*" >&2; exit 1; }

require_cmd() { command -v "$1" &>/dev/null || die "'$1' not found"; }

# ── pre-flight ─────────────────────────────────────────────
require_cmd pnpm
require_cmd pm2
require_cmd nginx

# ── logrotate config ───────────────────────────────────────
setup_logrotate() {
    cat > /etc/logrotate.d/postiz << 'EOF'
# Postiz application logs — rotate when any single file hits 200 MB
/var/log/postiz/*.log
/root/.pm2/logs/*.log {
    size 200M
    rotate 5
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
    postrotate
        pm2 reloadLogs 2>/dev/null || true
    endscript
}

# Nginx logs for dev.nanybot.com — rotate when any single file hits 200 MB
/var/log/nginx/postiz_*.log {
    size 200M
    rotate 5
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
    postrotate
        nginx -s reopen 2>/dev/null || true
    endscript
}
EOF
    ok "Logrotate configured (/etc/logrotate.d/postiz)"
}

# ── pm2 process management ─────────────────────────────────
start_services() {
    info "Starting services..."

    # Delete stale processes (ignore errors if none exist)
    pm2 delete postiz-backend  2>/dev/null || true
    pm2 delete postiz-workers  2>/dev/null || true
    pm2 delete postiz-cron     2>/dev/null || true
    pm2 delete postiz-frontend 2>/dev/null || true

    pm2 start "pnpm run start:prod:backend"  \
        --name postiz-backend  \
        --log "$LOG_DIR/backend.log"  \
        --time

    pm2 start "pnpm run start:prod:workers"  \
        --name postiz-workers  \
        --log "$LOG_DIR/workers.log"  \
        --time

    pm2 start "pnpm run start:prod:cron"     \
        --name postiz-cron     \
        --log "$LOG_DIR/cron.log"     \
        --time

    pm2 start "pnpm run start:prod:frontend" \
        --name postiz-frontend \
        --log "$LOG_DIR/frontend.log" \
        --time

    pm2 save
    ok "All services started and saved to pm2 dump"
}

# ── build ──────────────────────────────────────────────────
build_app() {
    info "Installing dependencies..."
    pnpm install

    info "Pushing Prisma schema..."
    pnpm run prisma-db-push

    info "Building all apps..."
    pnpm run build

    info "Seeding knowledge base..."
    pnpm run seed:knowledge

    ok "Build complete"
}

# ── nginx reload ───────────────────────────────────────────
reload_nginx() {
    nginx -t && systemctl reload nginx && ok "nginx reloaded"
}

# ── status check ───────────────────────────────────────────
check_status() {
    pm2 list
    echo ""
    info "Port check:"
    for port in 3000 4200; do
        if ss -tlnp | grep -q ":${port}"; then
            ok "  :${port} listening"
        else
            warn "  :${port} NOT listening"
        fi
    done
    echo ""
    info "HTTP check:"
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4200 2>/dev/null)
    echo "  frontend (4200): HTTP $code"
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null)
    echo "  backend  (3000): HTTP $code"
}

# ── pm2 auto-start on boot ─────────────────────────────────
ensure_pm2_startup() {
    pm2 startup systemd -u root --hp /root 2>&1 | grep -v "^\[PM2\]" || true
    systemctl enable pm2-root 2>/dev/null || true
    pm2 save
    ok "pm2 will auto-start on reboot"
}

# ── main ───────────────────────────────────────────────────
CMD="${1:-start}"

case "$CMD" in
  start)
    setup_logrotate
    start_services
    ensure_pm2_startup
    reload_nginx
    check_status
    ;;
  restart)
    setup_logrotate
    build_app
    start_services
    ensure_pm2_startup
    reload_nginx
    check_status
    ;;
  stop)
    pm2 stop all
    ok "All services stopped"
    ;;
  status)
    check_status
    ;;
  *)
    echo "Usage: $0 [start|restart|stop|status]"
    exit 1
    ;;
esac
