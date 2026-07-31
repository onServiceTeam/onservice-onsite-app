#!/usr/bin/env bash
# ============================================================================
# discover-server.sh — READ-ONLY server inventory for the 3-server consolidation
# (Contabo Odoo + Hetzner onservice.ph/medclaimspro -> keeper Hetzner).
#
# WHAT IT DOES: prints a complete "what is on this machine" report: identity
# fingerprint, OS, resources, users, SSH posture, ports, services, docker,
# databases (with sizes), websites + SSL certs, cron jobs, git repos, Odoo
# details, and .env variable NAMES.
#
# WHAT IT NEVER DOES: it changes NOTHING (no writes, no restarts, no installs),
# and it NEVER prints secret values (passwords, keys, tokens). .env files are
# listed by variable NAME only. Odoo configs are printed with password lines
# stripped. The output is safe to paste into a chat.
#
# USAGE (as root):        bash discover-server.sh | tee /tmp/inventory-$(hostname).txt
# USAGE (non-root+sudo):  sudo bash discover-server.sh | tee /tmp/inventory-$(hostname).txt
# ============================================================================
set -u

hr()  { printf '\n============================================================\n== %s\n============================================================\n' "$1"; }
sub() { printf -- '\n---- %s ----\n' "$1"; }
have(){ command -v "$1" >/dev/null 2>&1; }

SUDO=""
if [ "$(id -u)" != "0" ]; then
  if have sudo; then SUDO="sudo -n"; echo "NOTE: not root; using passwordless sudo where possible (some sections may be partial)."; else echo "NOTE: not root and no sudo; report will be partial."; fi
fi

# Run a query as the postgres OS user, whether we are root or a sudoer.
pgq() {
  if have sudo; then sudo -u postgres psql -tAc "$1" 2>/dev/null
  else su -s /bin/sh postgres -c "psql -tAc \"$1\"" 2>/dev/null
  fi
}

hr "SERVER FINGERPRINT (identity — read this first)"
echo "Report generated : $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "Hostname         : $(hostname -f 2>/dev/null || hostname)"
echo "Primary IPs      : $(hostname -I 2>/dev/null || ip -brief addr 2>/dev/null | awk '{print $3}' | tr '\n' ' ')"
echo "Uptime           : $(uptime -p 2>/dev/null || uptime)"
sub "Known project markers on this box"
[ -d /opt/onservice ]        && echo "MARKER: /opt/onservice exists -> onservice.ph production stack lives here" || echo "no /opt/onservice"
ls -d /etc/odoo* /opt/odoo* /odoo /var/lib/odoo* 2>/dev/null | sed 's/^/MARKER: odoo path -> /' || true
$SUDO find /opt /srv /var/www /home /root -maxdepth 2 -iname '*medclaim*' 2>/dev/null | sed 's/^/MARKER: medclaims path -> /'
$SUDO find /opt /srv /var/www /home /root -maxdepth 2 \( -iname '*agent*' -o -iname '*mcp*' \) 2>/dev/null | sed 's/^/MARKER: agents\/mcp path -> /'
# Point-of-sale / restaurant project (Cochi Loco) — Ken is unsure whether it exists.
$SUDO find /opt /srv /var/www /home /root -maxdepth 3 \( -iname '*cochi*' -o -iname '*loco*' -o -iname '*pos*' -o -iname '*restaurant*' -o -iname '*resto*' -o -iname '*kitchen*' -o -iname '*menu*' \) 2>/dev/null | grep -viE 'node_modules|/pos(ix|t)|compose|position' | sed 's/^/MARKER: possible POS\/restaurant path -> /'
have docker && $SUDO docker ps -a --format '{{.Names}} {{.Image}}' 2>/dev/null | grep -iE 'odoo|onservice|medclaim|agent|cochi|loco|pos|restaurant' | sed 's/^/MARKER: container -> /'
sub "EVERY project directory (so nothing is missed, named or not)"
for base in /opt /srv /var/www /home; do
  [ -d "$base" ] && $SUDO ls -1 "$base" 2>/dev/null | sed "s|^|  $base/|"
done

hr "SYSTEM"
{ hostnamectl 2>/dev/null || cat /etc/os-release 2>/dev/null; } | head -12
echo "CPU cores: $(nproc 2>/dev/null || echo '?')"
sub "Memory"; free -h 2>/dev/null | head -3
sub "Disk (real filesystems)"; df -hT 2>/dev/null | awk 'NR==1 || $2~/ext4|xfs|btrfs|zfs/'
sub "Biggest directories (top level)"
for d in /opt /srv /var/www /var/lib /home /root; do
  [ -d "$d" ] && $SUDO du -xh -d1 "$d" 2>/dev/null | sort -rh | head -8
done

hr "USERS AND SSH ACCESS"
sub "Users with login shells"
awk -F: '$7 ~ /(bash|sh|zsh)$/ {print $1" (uid "$3", home "$6")"}' /etc/passwd
sub "Sudo-capable users"
{ getent group sudo; getent group wheel; getent group admin; } 2>/dev/null
sub "Authorized SSH public keys (these are PUBLIC halves — safe to show)"
for h in /root $( awk -F: '$7 ~ /(bash|sh|zsh)$/ && $3>=1000 {print $6}' /etc/passwd ); do
  f="$h/.ssh/authorized_keys"
  if $SUDO test -f "$f"; then echo "[$f]"; $SUDO awk '{print "  " $1, substr($2,1,20) "...", $3}' "$f" 2>/dev/null; fi
done
sub "SSH daemon posture (effective)"
if $SUDO test -r /etc/ssh/sshd_config; then
  { $SUDO sshd -T 2>/dev/null || $SUDO cat /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null; } \
    | grep -iE '^(port|permitrootlogin|passwordauthentication|pubkeyauthentication|allowusers|allowgroups)' | sort -u
fi

hr "NETWORK: LISTENING PORTS AND FIREWALL"
sub "Listening ports (with owning process)"
$SUDO ss -tlnp 2>/dev/null | awk 'NR==1 || 1' | sed 's/users:((\"/ <- /;s/\",pid.*//'
sub "Firewall"
have ufw && $SUDO ufw status verbose 2>/dev/null
have iptables && echo "iptables rules count: $($SUDO iptables -S 2>/dev/null | wc -l)"
have fail2ban-client && $SUDO fail2ban-client status 2>/dev/null

hr "RUNNING SERVICES AND TIMERS"
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | awk '{print $1}'
sub "Enabled (start on boot)"
systemctl list-unit-files --type=service --state=enabled --no-pager --no-legend 2>/dev/null | awk '{print $1}' | grep -vE '^(getty|systemd|dbus|cron|rsyslog|ssh|networkd|resolved|logrotate|apt-|dpkg|e2scrub|fstrim|man-db|motd|phpsessionclean|snapd|ua-|unattended)' || true
sub "Systemd timers"
systemctl list-timers --no-pager 2>/dev/null | head -15

hr "DOCKER"
if have docker; then
  docker --version
  sub "All containers (running and stopped)"
  $SUDO docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null
  sub "Compose projects"
  $SUDO docker compose ls -a 2>/dev/null || true
  sub "Volumes and disk usage"
  $SUDO docker system df -v 2>/dev/null | sed -n '/Local Volumes space usage/,/^$/p' | head -25
  sub "Networks"
  $SUDO docker network ls --format '{{.Name}} ({{.Driver}})' 2>/dev/null
else
  echo "docker not installed"
fi

hr "DATABASES"
sub "Native PostgreSQL (outside docker)"
if have psql || systemctl is-active postgresql >/dev/null 2>&1; then
  pgq "SELECT version();" | head -1
  echo "Databases and sizes:"
  pgq "SELECT datname || ' | ' || pg_size_pretty(pg_database_size(datname)) FROM pg_database WHERE NOT datistemplate ORDER BY pg_database_size(datname) DESC;"
else
  echo "no native postgres detected"
fi
sub "PostgreSQL inside docker containers"
if have docker; then
  for c in $($SUDO docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null | awk 'tolower($2) ~ /postgres/ {print $1}'); do
    echo "[container: $c]"
    $SUDO docker exec "$c" sh -c 'psql -U "${POSTGRES_USER:-postgres}" -tAc "SELECT datname || '"'"' | '"'"' || pg_size_pretty(pg_database_size(datname)) FROM pg_database WHERE NOT datistemplate ORDER BY pg_database_size(datname) DESC;"' 2>/dev/null
  done
fi
sub "MySQL/MariaDB"
if have mysql; then mysql -e "SELECT table_schema, ROUND(SUM(data_length+index_length)/1024/1024,1) AS mb FROM information_schema.tables GROUP BY table_schema;" 2>/dev/null || echo "mysql present but socket auth failed (fine)"; else echo "no mysql/mariadb"; fi
sub "Redis"
have redis-cli && (systemctl is-active redis-server redis 2>/dev/null | head -1) || true
have docker && $SUDO docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null | awk 'tolower($2) ~ /redis/ {print "redis container: "$1}'

hr "WEBSITES, DOMAINS, SSL"
sub "nginx sites"
if have nginx; then
  $SUDO nginx -v 2>&1
  $SUDO nginx -T 2>/dev/null | grep -E 'server_name|listen |root |proxy_pass|ssl_certificate ' | sed 's/^[[:space:]]*//' | sort -u
  echo "[sites-enabled]"; ls /etc/nginx/sites-enabled 2>/dev/null
else echo "no host-level nginx (may still run inside docker — see DOCKER section)"; fi
sub "apache"
ls /etc/apache2/sites-enabled 2>/dev/null || echo "no apache"
sub "caddy"
ls /etc/caddy 2>/dev/null || echo "no caddy"
sub "Let's Encrypt certificates and expiry"
if $SUDO test -d /etc/letsencrypt/live; then
  for d in $($SUDO ls /etc/letsencrypt/live 2>/dev/null); do
    [ "$d" = "README" ] && continue
    exp=$($SUDO openssl x509 -enddate -noout -in "/etc/letsencrypt/live/$d/cert.pem" 2>/dev/null | cut -d= -f2)
    echo "$d  (expires: ${exp:-unknown})"
  done
  sub "certbot renewal timer"
  systemctl list-timers --no-pager 2>/dev/null | grep -i certbot || echo "no certbot timer found (check cron)"
else echo "no /etc/letsencrypt/live (certs may live inside docker volumes)"; fi

hr "SCHEDULED JOBS (cron)"
for u in root $( awk -F: '$7 ~ /(bash|sh|zsh)$/ && $3>=1000 {print $1}' /etc/passwd ); do
  ct=$($SUDO crontab -l -u "$u" 2>/dev/null | grep -vE '^\s*#|^\s*$')
  [ -n "$ct" ] && { echo "[crontab: $u]"; echo "$ct"; }
done
ls /etc/cron.d 2>/dev/null | grep -v placeholder | sed 's/^/[\/etc\/cron.d] /'

hr "CODE: GIT REPOSITORIES ON THIS BOX"
for g in $($SUDO find /opt /srv /var/www /home /root -maxdepth 4 -name .git -type d 2>/dev/null); do
  repo=$(dirname "$g")
  echo "[${repo}]"
  $SUDO git -C "$repo" remote -v 2>/dev/null | head -1 | sed 's/^/  remote: /'
  echo "  branch: $($SUDO git -C "$repo" rev-parse --abbrev-ref HEAD 2>/dev/null)  commit: $($SUDO git -C "$repo" log -1 --format='%h %ad %s' --date=short 2>/dev/null)"
  st=$($SUDO git -C "$repo" status --porcelain 2>/dev/null | wc -l); echo "  uncommitted changes: $st file(s)"
done

hr "ODOO DETAIL (if present)"
found_odoo=0
for cf in /etc/odoo/odoo.conf /etc/odoo.conf /etc/odoo-server.conf /opt/odoo*/odoo.conf; do
  if $SUDO test -f "$cf" 2>/dev/null; then
    found_odoo=1
    echo "[config: $cf] (password lines stripped)"
    $SUDO grep -vE 'passw|secret|token' "$cf" | grep -vE '^\s*$|^\s*[;#]'
    ap=$($SUDO grep -E '^addons_path' "$cf" | cut -d= -f2- | tr -d ' ')
    if [ -n "${ap:-}" ]; then
      echo "[custom addons found in addons_path]"
      IFS=','; for p in $ap; do
        case "$p" in */odoo/addons|*/dist-packages*|*/site-packages*) continue;; esac
        $SUDO ls "$p" 2>/dev/null | sed "s|^|  $p/|"
      done; unset IFS
    fi
    dd=$($SUDO grep -E '^data_dir' "$cf" | cut -d= -f2- | tr -d ' ')
    [ -n "${dd:-}" ] && echo "[filestore] $dd/filestore size: $($SUDO du -sh "$dd/filestore" 2>/dev/null | cut -f1)"
  fi
done
systemctl list-units --no-legend 2>/dev/null | grep -i odoo | sed 's/^/service: /'
have docker && $SUDO docker ps -a --format '{{.Names}} {{.Image}}' 2>/dev/null | grep -i odoo | sed 's/^/container: /'
pip3 list 2>/dev/null | grep -i '^odoo' || dpkg -l 2>/dev/null | grep -i odoo | head -3 || true
[ "$found_odoo" = "0" ] && echo "no native odoo config found on this box"

hr "ENV FILES (variable NAMES only — values are never printed)"
for f in $($SUDO find /opt /srv /var/www /home /root -maxdepth 3 -name '.env*' -type f 2>/dev/null | grep -v node_modules); do
  echo "[$f]"
  $SUDO grep -oE '^[A-Za-z_][A-Za-z0-9_]*' "$f" 2>/dev/null | sed 's/^/  /'
done

hr "DONE"
echo "This report contains no passwords, keys, or tokens. It is safe to share in chat."
