# 01 — Getting into each server (and running the inventory)

No secrets in this file. Passwords and the key passphrase are with Ken.

## The key

Ken's working key file is `~/.ssh/onservice_hetzner` (on his Windows PC under
`C:\Users\kmoul\.ssh\`, and restored in the Codespace from the
`SSH_PRIVATE_KEY` secret). It may ask for its passphrase ("pin") — Ken has it.
To avoid retyping it, load it once per session:

```bash
eval "$(ssh-agent -s)" && ssh-add ~/.ssh/onservice_hetzner
```

## Hetzner old box — 5.78.143.185 (onservice.ph production + medclaimspro)

```bash
ssh -i ~/.ssh/onservice_hetzner -o IdentitiesOnly=yes root@5.78.143.185
```

Works today (this is the standard access from `.ai-coder/handoff/HANDOFF-TO-NEW-AGENT-2026-06-29.md` §2.3).

## Keeper — 46.62.207.225 (agents.onservice.us dashboard)

- Root SSH login is disabled on purpose. Log in as the regular admin user
  (identify it during discovery; Ken's key comment there is `kmoul@Ken`),
  then use `sudo` with the password Ken holds.
- First discovery task on this box: confirm the exact username, confirm
  `sudo` works, and read `/etc/ssh/sshd_config` posture (the discovery
  script prints it).

```bash
ssh -i <keyfile> <adminuser>@46.62.207.225
sudo -v   # proves sudo works; asks for Ken's sudo password
```

## Contabo — 144.126.134.77 (Odoo 17)

- Verified 2026-07-17: SSH password login for root is ENABLED (Ken reset the
  root password; he holds it). Ken's Hetzner key is NOT authorized here.
- Fallback if password login ever breaks: my.contabo.com → your VPS →
  VNC console (Ken holds the VNC password) → log in as root on the console.

```bash
ssh root@144.126.134.77    # type the root password Ken holds
```

First job once in: add the public key so future sessions don't need the
password (this is the ONE allowed write during discovery):

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBb/vuSDSEV9hIybyunXxwkWENZ2IIrSR7VrRCAPzeiT onservice-hetzner' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

## Running the inventory (read-only) on any of the three

From a machine that can SSH (streams the script in, nothing is installed on
the server):

```bash
ssh <user>@<ip> 'bash -s' < scripts/migration/discover-server.sh | tee inventory-<name>.txt
```

Or, on the old Hetzner box only, entirely server-side (it has a read-only
GitHub deploy key):

```bash
cd /opt/onservice
git fetch origin claude/contabo-hetzner-migration-rhak0z
git show FETCH_HEAD:scripts/migration/discover-server.sh > /tmp/discover-server.sh
bash /tmp/discover-server.sh | tee /tmp/inventory-$(hostname).txt
```

The report prints no passwords/keys/tokens and is safe to paste into chat.
Collect all three reports before any migration step begins.
