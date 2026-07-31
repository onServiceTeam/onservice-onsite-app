# 05 — DNS cutover at GoDaddy (Ken does this part)

Good news first: **nothing needs to be re-registered, and no SSL certificate
needs to be bought.** Domains stay exactly as they are. All that changes is one
number per record: the server address they point to. SSL is free and issued
automatically on the new server by Let's Encrypt, and it renews itself.

## Where every domain points today (checked 2026-07-17)

| Domain | Currently points at | After the move |
|---|---|---|
| onservice.ph | 5.78.143.185 | **46.62.207.225** |
| www.onservice.ph | 5.78.143.185 | **46.62.207.225** |
| app.onservice.ph | 5.78.143.185 | **46.62.207.225** |
| admin.onservice.ph | 5.78.143.185 | **46.62.207.225** |
| api.onservice.ph | 5.78.143.185 | **46.62.207.225** |
| onservice.com.ph | 5.78.143.185 | **46.62.207.225** |
| www.onservice.com.ph | 5.78.143.185 | **46.62.207.225** |
| app.onservice.com.ph | 5.78.143.185 | **46.62.207.225** |
| admin.onservice.com.ph | 5.78.143.185 | **46.62.207.225** |
| medclaimspro.com | 5.78.143.185 | **46.62.207.225** |
| www.medclaimspro.com | 5.78.143.185 | **46.62.207.225** |
| agents.onservice.us | 46.62.207.225 | no change, already on the keeper |
| crm.onservice.us | 144.126.134.77 | only if the Odoo server is also moved |
| onservice.us / www | 50.87.146.164 | leave alone, that is HostGator shared hosting |

Eleven records to change. Verify this table against GoDaddy before the cutover,
since records can be added at any time.

## A day (or more) before the cutover: lower the TTL

TTL is how long the internet caches the old answer. It is probably 1 hour or
more, which means after a flip some people would still reach the old server for
an hour. Lowering it first shrinks that window to minutes.

1. Log in to GoDaddy → **My Products** → the domain → **DNS**.
2. For each **A record** in the table above, click the pencil (edit), change
   **TTL** to **Custom → 600 seconds** (or the smallest allowed), and save.
3. Leave everything else untouched. Do not change MX records (that is email),
   TXT records (SPF/verification), or nameservers.
4. Wait at least as long as the OLD TTL before doing the flip.

## Cutover day: change the addresses

Only after the apps are running and tested on the keeper (hosts-file test in
`03-onservice-migration.md`):

1. GoDaddy → domain → **DNS**.
2. Edit each A record from the table: change **Value** from `5.78.143.185` to
   **`46.62.207.225`**. Save each one.
3. Do onservice.ph and its subdomains together, then medclaimspro.com. Do not
   flip half of onservice.ph and stop, the app and its API must land on the
   same server at the same time.

Check propagation from a command line:
```bash
nslookup app.onservice.ph 8.8.8.8
nslookup medclaimspro.com 8.8.8.8
```
When those return `46.62.207.225`, the internet has caught up. It is usually
minutes with a low TTL.

## Right after the flip: issue the SSL certificates

On the keeper, once DNS resolves to it (certbot proves ownership by answering
on the new server, so it can only succeed after the flip):

```bash
sudo certbot --nginx \
  -d onservice.ph -d www.onservice.ph -d app.onservice.ph \
  -d admin.onservice.ph -d api.onservice.ph
sudo certbot --nginx -d medclaimspro.com -d www.medclaimspro.com
sudo certbot --nginx -d app.onservice.com.ph -d www.onservice.com.ph -d admin.onservice.com.ph
```

Then confirm automatic renewal is armed, so certificates never expire on you:
```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```
Both must look healthy. This is the answer to "make sure SSLs automatically
renew and nothing fails."

## After the flip: put the TTLs back

Once everything has been stable for a day or two, edit the same records and set
TTL back to 1 hour. Low TTLs mean more DNS lookups than necessary.

## Do not forget

- **GitHub Actions secret `DEPLOY_HOST`** must change to the keeper, or
  automatic deploys will keep targeting the dead server. GitHub → repo →
  Settings → Secrets and variables → Actions.
- If any email (MX) records point at the old server, email would break at
  decommission. Check the MX records for each domain before cancelling
  anything. The discovery report shows whether a mail server runs on the old
  box.
