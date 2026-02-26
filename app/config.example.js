window.APP_CONFIG = {
  ...(window.APP_CONFIG || {}),

  // Solana (public)
  solanaNetwork: "devnet",
  solanaProgramId: "V7z3BRz2T8XX6gCQf5nYibHRm3KhDN38Z9HPp5tiFdc",
  indexerApiBaseUrl: "http://localhost:8787",

  // Arcium/frontend behavior
  enableArciumEncryption: true,
  metadataEncryptionKey: "",
  arciumPolicyDefault: "public_view",
  showcasePrivatePixelIds: [1],

  // Keep secrets off frontend. Pin uploads should happen from backend.
  pinataJwt: "",
};
