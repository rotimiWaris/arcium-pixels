# Arcium Pixels: Solana + Arcium Build Blueprint

## 1) Target repo structure

```text
arcium-pixels/
  app/
    index.html
    style.css
    script.js
  solana/
    Anchor.toml
    Cargo.toml
    programs/
      arcium_pixels/
        Cargo.toml
        src/
          lib.rs
    migrations/
      deploy.ts
  arcium/
    policy.md
    examples/
      access-check.json
```

Use current frontend files as `app/` (can keep them in root for now, then move later).

## 2) Solana account schema (Anchor)

### `Board` account (global config)

- `authority: Pubkey`
- `total_pixels: u16` (e.g., 512)
- `bump: u8`

### `Pixel` account (one per pixel id)

- `board: Pubkey`
- `pixel_id: u16`
- `owner: Pubkey`
- `price_lamports: u64`
- `lease_expires_at: i64` (Unix timestamp, optional time-bound rights)
- `metadata_uri: String` (IPFS/S3 encrypted metadata pointer)
- `claimed_at: i64`
- `bump: u8`

### `OwnerIndex` account (enforces one pixel per wallet)

- `owner: Pubkey`
- `pixel_id: u16`
- `bump: u8`

PDA suggestions:

- `board` => `["board"]`
- `pixel` => `["pixel", pixel_id_le_bytes]`
- `owner_index` => `["owner", owner_pubkey]`

## 3) Program instructions

- `initialize_board(total_pixels)`
  - Creates global board.

- `claim_pixel(pixel_id, price_lamports, lease_expires_at, metadata_uri)`
  - Requires pixel not claimed.
  - Creates/validates `OwnerIndex` so one wallet cannot claim multiple pixels.
  - Sets owner + metadata + pricing/timing.

- `transfer_pixel(pixel_id, new_owner)`
  - Only current owner can transfer.
  - Updates owner and moves owner index.

- `set_pixel_license(pixel_id, price_lamports, lease_expires_at, metadata_uri)`
  - Only owner.
  - Updates licensing/access params.

## 4) Quick mapping (Option 1 requirement)

- Canvas `pixel_id` click -> `claim_pixel` transaction on Solana.
- Pixel ownership source -> Solana account state (`Pixel.owner`), not Supabase.
- Premium/private pixel content -> encrypted file on IPFS/S3.
- Access rule evaluation -> Arcium encrypted policy state.
- Revocation/time-bound access -> `lease_expires_at` + Arcium policy checks.
- Pay-to-decrypt -> verify payment + policy, then allow decryption key release.

## 5) Arcium role in this app

- Store policy inputs privately:
  - user wallet, pixel id, license terms, payment receipt, expiry state.
- Run private compute:
  - `can_user_decrypt(pixel_id, wallet, timestamp, payment_proof) -> {allow|deny, proof}`
- Return minimal output to app:
  - no full policy internals leaked, just decision/proof.

## 6) Minimal build phases

### Phase A

- Keep current UI/canvas.
- Add wallet connect (Phantom/Solflare).
- Read pixel ownership from Solana program.

### Phase B

- Replace Supabase claim with `claim_pixel` transaction.
- Keep Supabase only as optional cache/indexer.

### Phase C

- Encrypt pixel media.
- Integrate Arcium access checks for decrypt authorization.

### Phase D

- Add transfer/secondary market logic.
- Add revocation and time-based licensing in UI.

## 7) First implementation checklist

1. Create Anchor workspace in `solana/`.
2. Implement `Board`, `Pixel`, `OwnerIndex` accounts.
3. Implement `initialize_board` and `claim_pixel`.
4. Seed pixels `1..512`.
5. In frontend, map clicked particle id -> Solana `pixel_id`.
6. Replace claim button handler to send Solana tx.
7. Display owner wallet/X handle from chain + optional profile metadata.
