# Issue #1 Mac Mini Uptime Runbook

This runbook hardens the local Mac mini for always-on hosting of `taam.im`.

## One-time setup

1. Apply host uptime policy:

```bash
bash scripts/harden-mac-mini-uptime.sh --apply
```

2. Configure cloudflared tunnel + PM2 service supervision:

```bash
pnpm deploy:taam:setup
```

3. Register PM2 startup on boot:

```bash
pnpm pm2:startup:setup
```

4. Run full verification:

```bash
pnpm deploy:taam:check
```

## Reboot verification checklist

After reboot:

```bash
pm2 list
launchctl list | rg -i 'pm2|cloudflared'
pmset -g custom
curl -I https://taam.im
pnpm deploy:taam:check
```

Expected:
- `targum-web` and `cloudflared-taam` are online in PM2.
- no conflicting `com.cloudflare.cloudflared` or `homebrew.mxcl.cloudflared` launchd jobs are loaded.
- `sleep 0` and `autorestart 1` under AC power.
- `https://taam.im` returns `2xx` or `3xx`.

## Outage triage

Run:

```bash
pnpm deploy:taam:check
pm2 logs cloudflared-taam --lines 150 --nostream
pm2 logs targum-web --lines 150 --nostream
cloudflared tunnel info targum-taam
launchctl list | rg -i cloudflared
pmset -g assertions
```

If PM2 process is down:

```bash
pm2 restart cloudflared-taam
pm2 restart targum-web
pm2 save
```

If conflicting launchd cloudflared jobs are loaded:

```bash
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.cloudflare.cloudflared.plist"
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/homebrew.mxcl.cloudflared.plist"
```

## Rollback to workstation behavior

If this machine should stop behaving like an always-on server:

```bash
sudo pmset -c sleep 10
sudo pmset -c autorestart 0
sudo pmset -c powernap 1
sudo pmset -c displaysleep 10
```

Then verify:

```bash
bash scripts/harden-mac-mini-uptime.sh --check
```
