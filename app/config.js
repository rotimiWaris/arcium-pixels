window.APP_CONFIG = {
  ...(window.APP_CONFIG || {}),

  // Public, production-safe config only
  solanaNetwork: "devnet",
  solanaProgramId: "7U2tXnjHxXRB4txpGW9tB5n1CoPJqwRsn5Da63ddgVp4",
  indexerApiBaseUrl: "https://arcium-pixels-production.up.railway.app",

  // Feature toggles
  enableArciumEncryption: true,
  arciumPolicyDefault: "public_view",
  showcasePrivatePixelIds: [1],
};
