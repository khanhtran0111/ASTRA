# Seed data — `setafuture` demo tenant

Dev-only seed for the `setafuture` tenant, mirroring the 4 Entra users in `entra-users.csv`.
Run from repo root with `.env` exporting `DATABASE_URL`.

## Bootstrap

```bash
set -a && source .env && set +a

# 1. Create tenant + admin (Canh Ta)
pnpm -F @seta/cli exec tsx src/index.ts tenant-create \
  --name "Seta Future" --slug setafuture \
  --admin-email canh.ta@setafuture.onmicrosoft.com \
  --admin-name "Ta Canh"

# 2. Loop the rest as org.member
tail -n +2 scripts/data/entra-users.csv | \
while IFS=',' read -r display _dirsync upn _rest; do
  [ "$upn" = "canh.ta@setafuture.onmicrosoft.com" ] && continue
  pnpm -F @seta/cli exec tsx src/index.ts user-create \
    --tenant setafuture --email "$upn" --name "$display" --role org.member
done
```

Each command prints the generated password as JSON on stdout — capture it then.

## Accounts (current local DB)

All 4 share password **`Setafuture@2026`** after the bulk reset.

| Email | Display name | Role |
|---|---|---|
| canh.ta@setafuture.onmicrosoft.com | Ta Canh | `org.admin` |
| anh.nguyenviet@setafuture.onmicrosoft.com | Anh Nguyen | `org.member` |
| ly.nguyen@setafuture.onmicrosoft.com | Ly Nguyen | `org.member` |
| thang.tran@setafuture.onmicrosoft.com | Thang Tran | `org.member` |

Per the no-JIT policy, these local accounts will link on first Entra OIDC login once SSO is wired up for `setafuture`.

## Resetting passwords

There is no `seta-cli user-set-password` yet. To rotate the shared password, hash with `argon2id` (`packages/identity/src/backend/password/argon2.ts`) and `UPDATE identity.account SET password = $hash WHERE provider_id = 'credential' AND user_id IN (...)`.
