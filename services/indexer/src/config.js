import dotenv from "dotenv";

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 8787),
  databaseUrl: required("DATABASE_URL"),
  databaseSsl:
    process.env.DATABASE_SSL === "true" ||
    process.env.DATABASE_SSL === "1" ||
    /sslmode=require/i.test(process.env.DATABASE_URL || ""),
  solanaRpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  solanaProgramId: required("SOLANA_PROGRAM_ID"),
  metadataEncryptionKey: process.env.METADATA_ENCRYPTION_KEY || "",
  policyEncryptionKey:
    process.env.POLICY_ENCRYPTION_KEY ||
    process.env.METADATA_ENCRYPTION_KEY ||
    "",
  adminApiKey: process.env.ADMIN_API_KEY || "",
  arciumEnabled:
    process.env.ARCIUM_ENABLED === "true" ||
    process.env.ARCIUM_ENABLED === "1",
  arciumRequireCluster:
    process.env.ARCIUM_REQUIRE_CLUSTER === "true" ||
    process.env.ARCIUM_REQUIRE_CLUSTER === "1",
  arciumClusterOffset: Number(process.env.ARCIUM_CLUSTER_OFFSET || 0),
  arciumRpcUrl: process.env.ARCIUM_RPC_URL || process.env.SOLANA_RPC_URL || "",
  arciumStatusCacheMs: Number(process.env.ARCIUM_STATUS_CACHE_MS || 30000),
  syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS || 15000),
  syncCommitment: process.env.SYNC_COMMITMENT || "confirmed",
};
