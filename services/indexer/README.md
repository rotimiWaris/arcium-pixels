# Arcium Pixels Indexer (Phase 2)

Read-optimized API + indexer for pixel state.

## Endpoints

- `GET /health`
- `GET /arcium/status`
- `GET /sync-status`
- `GET /pixels`
- `GET /pixels/:id`
- `GET /access/check?pixelId=..&viewer=..`
- `POST /policies/:id` (admin)
- `GET /policies/:id` (admin)
- `POST /access/grant` (admin)

## Setup

1. Copy env file:

```powershell
cd services/indexer
copy .env.example .env
```

2. Install dependencies:

```powershell
npm install
```

3. Run DB migration:

```powershell
npm run migrate
```

4. Start service:

```powershell
npm run dev
```

Service default URL: `http://localhost:8787`

## Architecture (Short)

```text
[Browser App] --(viewer id + pixel id)--> [Indexer API]
     |                                         |
     |                             [Policy + Grants DB (Postgres)]
     |                                         |
     +----------------------------- read pixel state from ----------+
                                   [Solana Program Accounts]
                                                |
                                         [Arcium runtime]
                                   (finalize allow/deny decision)
```

## Trust Model (Short)

- Solana program is the source of truth for pixel ownership and claimed metadata URI.
- Indexer mirrors on-chain state into Postgres for fast reads and policy checks.
- Access policy and grants are enforced by backend API responses.
- Arcium runtime contributes attested decision context in access finalization.
- Frontend is untrusted for enforcement and only renders what backend/on-chain returns.

## Phase-B Policy Enforcement

Policy state is stored encrypted in DB and enforced at API read time.

- `public_view`: everyone can read pixel metadata
- `time_bound`: metadata is visible until `expiresAt`
- `pay_to_decrypt`: metadata is hidden unless viewer has active grant
- `revoked: true`: metadata always hidden

### Admin auth

Set `ADMIN_API_KEY` in `.env`, then send it as `x-admin-key`.

Example set policy:

```powershell
$headers = @{ "x-admin-key" = "change-me" }
$body = @{
  mode = "pay_to_decrypt"
  revoked = $false
  priceLamports = 100000
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:8787/policies/1" -Headers $headers -Body $body -ContentType "application/json"
```

Example grant access:

```powershell
$headers = @{ "x-admin-key" = "change-me" }
$body = @{
  pixelId = 1
  viewerId = "wallet:YourWalletAddress"
  grantedUntil = "2030-01-01T00:00:00.000Z"
  paymentRef = "dev-test"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:8787/access/grant" -Headers $headers -Body $body -ContentType "application/json"
```

Example viewer read:

```powershell
Invoke-RestMethod "http://localhost:8787/pixels/1?viewer=wallet:YourWalletAddress"
```

## Demo Script: Deny Before Grant, Allow After Grant

Run this with indexer running and `.env` populated:

```powershell
npm run demo:policy
```

Optional arguments:

```powershell
node scripts/demo-policy-flow.js <pixelId> <viewerId> <baseUrl>
```

Example:

```powershell
node scripts/demo-policy-flow.js 1 wallet:test-a http://localhost:8787
```

Expected behavior:

1. Script sets `pay_to_decrypt` on the chosen pixel.
2. `/access/check` returns `allowed: false` before grant.
3. Script grants access.
4. `/access/check` returns `allowed: true` after grant.

## Phase-C Real Arcium Integration

Indexer integrates `@arcium-hq/reader` and uses Arcium cluster state as an attestation input for final access decisions.

### Required env

```env
ARCIUM_ENABLED=true
ARCIUM_CLUSTER_OFFSET=0
ARCIUM_RPC_URL=https://api.devnet.solana.com
ARCIUM_REQUIRE_CLUSTER=false
ARCIUM_STATUS_CACHE_MS=30000
```

If `ARCIUM_REQUIRE_CLUSTER=true`, reads are denied when cluster status is unavailable.

### Verify integration

```powershell
Invoke-RestMethod "http://localhost:8787/arcium/status"
Invoke-RestMethod "http://localhost:8787/access/check?pixelId=1&viewer=wallet:test"
```

`/access/check` returns `localAllowed`, final `allowed`, and `arcium.attestation`.

## Current Limitation

Policy enforcement is currently at backend read/API layer, not fully on-chain.

- On-chain stores ownership and metadata URI.
- Access control decisions are enforced when serving API responses.
- This is acceptable for current phase, but full trust-minimized enforcement would require moving policy checks/validation deeper on-chain and/or cryptographic proof verification paths.

## Frontend Integration

In `app/config.local.js` (or `window.APP_CONFIG`), set:

```js
window.APP_CONFIG = {
  indexerApiBaseUrl: "http://localhost:8787",
};
```

Frontend reads indexer first, then falls back to on-chain RPC.
