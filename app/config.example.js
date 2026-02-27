window.APP_CONFIG = {
  ...(window.APP_CONFIG || {}),

  // Solana (public)
  solanaNetwork: "devnet",
  solanaProgramId: "7U2tXnjHxXRB4txpGW9tB5n1CoPJqwRsn5Da63ddgVp4",
  indexerApiBaseUrl: "http://localhost:8787",

  // Arcium/frontend behavior
  enableArciumEncryption: true,
  metadataEncryptionKey: "",
  arciumPolicyDefault: "public_view",
  showcasePrivatePixelIds: [1],

  // Keep secrets off frontend. Pin uploads should happen from backend.
  pinataJwt: "",
};
