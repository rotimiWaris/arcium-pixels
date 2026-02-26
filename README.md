# Arcium Pixels

Solana-first pixel ownership app with Arcium-oriented confidential access architecture.

## Repository Structure

```text
app/                     Frontend (canvas + modal + wallet + claim flow)
  index.html
  style.css
  script.js
  config.example.js
docs/                    Project docs and notes
  SOLANA_ARCIUM_BLUEPRINT.md
  note.txt
solana/                  On-chain program workspace
  Anchor.toml
  Cargo.toml
  programs/arcium_pixels/src/lib.rs
services/indexer/        Optional phase-2 indexer + read API
  src/server.js
  sql/schema.sql
```

## Quick Start (Frontend)

1. Serve `app/` with any static server.
2. Open `app/index.html` in browser.
3. Connect Phantom wallet and claim pixels.

Example:

```powershell
cd app
python -m http.server 5500
```

Then open `http://localhost:5500`.

## Runtime Config

Use `window.APP_CONFIG` (see `app/config.example.js`) to override defaults:

- `solanaNetwork`: `"devnet"` / `"mainnet-beta"`
- `solanaProgramId`
- `indexerApiBaseUrl` (optional, phase-2 API)
- `pinataJwt`

## Phase-2 (Optional Indexer)

If you want fast multi-user reads and cache recovery beyond browser localStorage:

1. Start `services/indexer` (`npm install`, `npm run migrate`, `npm run dev`)
2. Set `window.APP_CONFIG.indexerApiBaseUrl`
3. Frontend reads indexer first, then falls back to on-chain RPC

## Solana Program Flow

1. Build program (`solana/` workspace)
2. Deploy program to selected cluster
3. Keep these IDs in sync:
   - `solana/programs/arcium_pixels/src/lib.rs` `declare_id!`
   - `solana/Anchor.toml` program IDs
   - `app/script.js` `SOLANA_PROGRAM_ID` (or `APP_CONFIG.solanaProgramId`)

## Notes

- Frontend-only changes do not require redeploying the on-chain program.
- Rust program changes require rebuild + redeploy.
- Don't commit `app/config.local.js` or secrets.
