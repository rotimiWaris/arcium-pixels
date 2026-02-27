# Arcium Pixels - Full Technical Documentation

## 1) Project Overview

Arcium Pixels is a Solana-powered interactive pixel board where users connect a wallet and claim one pixel.

Each claimed pixel can carry profile metadata (X username and image URL) through an encrypted metadata payload.

The product combines:

- On-chain ownership and claim state (Solana program)
- Off-chain indexed read API (Node + Postgres indexer)
- Policy-based access control with encrypted policy state
- Arcium runtime status and attested decision finalization in backend read paths

## 2) What the Website Does

### 2.1 User-facing features

- Renders a particle/pixel board on canvas
- Supports wallet connection and disconnection
- Allows claiming a pixel with profile data
- Shows claimed pixel profile images when access is allowed
- Shows a dedicated locked/private showcase pixel (config-driven)
- Uses a modal flow for fetch/preview/add actions

### 2.2 Locked pixel meaning

The locked pixel is a special showcase/private pixel slot.

When locked, it means:

- The pixel is claimed on-chain (`owner` exists)
- Public details are intentionally hidden (`username`, `image_url` masked)
- Access to private data is policy-controlled (grant-based flow)

In UI, a locked pixel is rendered as a private marker and does not expose profile content.

## 3) Architecture and Trust Model

```text
[Browser Frontend]
  - Canvas board
  - Wallet actions
  - Modal claim flow
  - Config-driven privacy behavior
        |
        | reads pixel state / submits claim tx
        v
[Solana Program]
  - Board account
  - Pixel PDA accounts
  - OwnerIndex PDA accounts
        |
        | indexed by backend sync
        v
[Indexer API + Postgres]
  - syncs on-chain pixel accounts
  - decrypts metadata (keyed)
  - stores read model
  - enforces policy/grants on API responses
  - finalizes decisions with Arcium runtime status/attestation
```

### Trust model

- Source of truth for ownership: Solana program state
- Source of truth for read-policy decisions: backend API enforcement
- Frontend is untrusted for enforcement (it only renders data returned by API/chain)
- Arcium runtime contributes attested decision context in backend final decision output

## 4) Frontend Documentation (`app/`)

### 4.1 Core files

- `index.html`: page shell, canvas, modal, wallet controls, metadata tags
- `style.css`: styling for board, modal, controls, status indicators
- `script.js`: runtime logic (wallet, rendering, claim flow, sync/read logic)
- `config.js`: production/public config
- `config.local.js`: local override config (loaded only on localhost)
- `config.example.js`: reference config template

### 4.2 Runtime config keys

The frontend reads `window.APP_CONFIG`.

Important keys:

- `solanaNetwork` (`devnet`, `mainnet-beta`)
- `solanaProgramId`
- `indexerApiBaseUrl`
- `enableArciumEncryption`
- `metadataEncryptionKey`
- `arciumPolicyDefault`
- `showcasePrivatePixelIds`
- `forceShowcasePrivate` (default behavior in code is `true` unless set to `false`)

### 4.3 Data loading strategy

Current strategy in `script.js`:

1. Try indexer first (`/pixels`) for richer profile data and policy-aware responses
2. If indexer is unavailable or lacks usable profile data, fallback to chain decode
3. Reapply showcase privacy overlay rules

This prevents blank UI when one source is stale and keeps privacy behavior consistent.

### 4.4 Wallet behavior

- Supports Phantom and Solflare provider selection
- Supports connect/disconnect flows
- Handles provider event updates
- Refreshes board state after wallet status changes

### 4.5 Claim flow

1. User selects pixel in canvas
2. Modal opens with pixel context
3. User enters username and fetches profile image preview
4. On add, frontend creates encrypted metadata URI payload (if encryption enabled)
5. Frontend submits Solana transaction to claim pixel
6. Frontend refreshes board state from indexer/chain

### 4.6 Privacy rendering rules

- Showcase pixel IDs are configured in `showcasePrivatePixelIds`
- If a showcase pixel is private, UI masks username/image
- With `forceShowcasePrivate` enabled, showcase pixel remains visually locked even if backend returns public fields

This is a defense-in-depth UI guard for the showcase slot.

### 4.7 Browser cache/debug helpers

Exposed helpers:

- `window.arciumPixelsCache.export()`

These assist manual recovery/testing of board state.

## 5) Solana Program Documentation (`solana/programs/arcium_pixels/src/lib.rs`)

Program ID:

- `7U2tXnjHxXRB4txpGW9tB5n1CoPJqwRsn5Da63ddgVp4`

Admin initializer authority:

- `FTGLYKah3ZXRNSMb1uji2DXiTTHt8isPYqLxnG6oNJrf`

### 5.1 Accounts

- `Board`
  - `authority: Pubkey`
  - `total_pixels: u16`
  - `bump: u8`

- `Pixel`
  - `board: Pubkey`
  - `pixel_id: u16`
  - `owner: Pubkey`
  - `price_lamports: u64`
  - `lease_expires_at: i64`
  - `metadata_uri: String` (max 256)
  - `claimed_at: i64`
  - `bump: u8`

- `OwnerIndex`
  - `owner: Pubkey`
  - `pixel_id: u16`
  - `bump: u8`

### 5.2 Instructions

- `initialize_board(total_pixels)`
  - Admin-only initialization

- `claim_pixel(pixel_id, price_lamports, lease_expires_at, metadata_uri)`
  - Validates pixel range
  - Enforces one owner per pixel
  - Enforces one pixel per owner via `OwnerIndex`

- `set_pixel_license(price_lamports, lease_expires_at, metadata_uri)`
  - Owner-only update of licensing/metadata URI

### 5.3 Program-level protections

- Invalid pixel id rejection
- Metadata URI length cap
- Already claimed guard
- One-wallet-one-pixel guard
- Owner-only license update guard

## 6) Indexer and API Documentation (`services/indexer/`)

### 6.1 Role

The indexer creates a fast, policy-aware read model from chain accounts.

It:

- Polls Solana program accounts
- Resolves/decrypts metadata URI payload
- Upserts rows in Postgres
- Serves API responses with access control

### 6.2 Metadata resolution

Metadata resolver handles:

- `data:application/json;base64,...` payloads
- `ipfs://...` payloads via gateway resolution
- encrypted envelope payloads (`arcium-enc-v1`) using `METADATA_ENCRYPTION_KEY`

### 6.3 API endpoints

- `GET /health`
- `GET /arcium/status`
- `GET /sync-status`
- `GET /pixels`
- `GET /pixels/:id`
- `GET /access/check?pixelId=..&viewer=..`
- `POST /policies/:id` (admin)
- `GET /policies/:id` (admin)
- `POST /access/grant` (admin)

### 6.4 Policy modes

Policy payload supports:

- `public_view`
- `time_bound`
- `pay_to_decrypt`
- `revoked` flag
- `expiresAt`
- `priceLamports`

Policy ciphertext is AES-GCM encrypted at rest in DB (`pixel_policies.policy_ciphertext`).

### 6.5 Arcium integration behavior

Backend initializes Arcium reader runtime and includes cluster status in decision finalization.

- If Arcium is disabled: backend falls back to local decision
- If Arcium is enabled: backend emits `source: arcium` and attestation hash
- Optional strict mode: deny reads if cluster unavailable (`ARCIUM_REQUIRE_CLUSTER=true`)

## 7) Database Schema (`services/indexer/sql/schema.sql`)

### `public.pixels`

Read model for each pixel:

- `pixel_id` (PK)
- `owner`
- `username`
- `image_url`
- `metadata_uri`
- `claimed_at`
- `slot`
- `updated_at`

### `public.sync_state`

Indexer state:

- `key`
- `last_slot`
- `last_synced_at`
- `notes`

### `public.pixel_policies`

Encrypted per-pixel policy state:

- `pixel_id` (PK, FK -> pixels)
- `policy_ciphertext`
- `updated_by`
- `updated_at`

### `public.pixel_access_grants`

Viewer grants for private access:

- `id`
- `pixel_id` (FK)
- `viewer_id`
- `granted_until`
- `granted_by`
- `payment_ref`
- `created_at`
- unique `(pixel_id, viewer_id)`

## 8) Environment and Secrets

### Frontend (`app/config.js`)

Only public-safe values belong here.

Do not place secrets in frontend config.

### Local frontend (`app/config.local.js`)

Local-only overrides.

Never commit secret-bearing versions.

### Backend (`services/indexer/.env`)

Required/important:

- `DATABASE_URL`
- `SOLANA_PROGRAM_ID`
- `SOLANA_RPC_URL`
- `METADATA_ENCRYPTION_KEY`
- `POLICY_ENCRYPTION_KEY`
- `ADMIN_API_KEY`
- `ARCIUM_ENABLED`
- `ARCIUM_REQUIRE_CLUSTER`
- `ARCIUM_CLUSTER_OFFSET`
- `ARCIUM_RPC_URL`

## 9) Deployment Topology

Recommended split:

- Frontend static hosting (Vercel)
- Backend API + sync worker (Railway/Render)
- Managed Postgres

Required production wiring:

- `app/config.js` must point `indexerApiBaseUrl` to deployed backend URL
- Backend must run migrations (`npm run migrate`) before serving traffic
- Frontend should not load `config.local.js` in production

## 10) Operations and Troubleshooting

### Symptom: claimed pixels show blank username/image

Check in order:

1. `GET /pixels` payload contains blank fields -> backend decode issue
2. Ensure `METADATA_ENCRYPTION_KEY` matches claim-time encryption key
3. Ensure indexer is syncing without errors
4. Redeploy backend after env changes

### Symptom: frontend blank but `/pixels` has data

- Verify frontend uses correct `indexerApiBaseUrl`
- Verify deployed `script.js` is latest
- Hard refresh browser cache

### Symptom: `config.local.js` 404 in production

- Ensure local config loads only on localhost

### Symptom: `Missing required env var: DATABASE_URL`

- Add `DATABASE_URL` in backend service env, not in DB service panel

## 11) Current Limitation (Important)

Policy enforcement is currently backend/API layer, not fully trust-minimized on-chain.

- On-chain stores ownership and metadata URI pointer
- API enforces access rules and redaction for clients
- This is valid for current phase and demo scope
- Full trust-minimized model would require deeper on-chain checks and/or cryptographic proof paths for key release

## 12) Submission Narrative (Short Form)

Arcium Pixels demonstrates a practical confidential access architecture:

- Solana for immutable ownership and claim state
- Encrypted metadata payloads for profile data
- Policy encryption at rest in backend store
- Grant/revoke/time/pay policy controls on reads
- Arcium runtime-attested decision finalization

The locked showcase pixel represents private-by-default content under policy control, while public pixels remain discoverable for community participation.

---

If you publish this doc, also link:

- root README (`README.md`)
- indexer README (`services/indexer/README.md`)
- blueprint (`docs/SOLANA_ARCIUM_BLUEPRINT.md`)
