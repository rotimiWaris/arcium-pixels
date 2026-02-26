# Solana Workspace Setup

## Prerequisites
- Rust + Cargo
- Solana CLI
- Anchor CLI

## Install (example)
```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest
```

## Build
```bash
cd solana
anchor build
```

## Local test validator
```bash
solana-test-validator
```

## Deploy (localnet)
```bash
cd solana
anchor deploy
```

## Important
- Keep program ID in sync across:
  - `solana/Anchor.toml`
  - `solana/programs/arcium_pixels/src/lib.rs` (`declare_id!`)
  - `app/script.js` (`SOLANA_PROGRAM_ID`) or `window.APP_CONFIG.solanaProgramId`.
