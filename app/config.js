window.APP_CONFIG = {
  ...(window.APP_CONFIG || {}),

  // Public, production-safe config only
  solanaNetwork: "devnet",
  solanaProgramId: "V7z3BRz2T8XX6gCQf5nYibHRm3KhDN38Z9HPp5tiFdc",
  indexerApiBaseUrl: "https://arcium-pixels-production.up.railway.app",

  // Feature toggles
  enableArciumEncryption: true,
  arciumPolicyDefault: "public_view",
  showcasePrivatePixelIds: [1],
};
