import cors from "cors";
import express from "express";
import { config } from "./config.js";
import {
  createDbPool,
  getPixelPolicy,
  hasActiveAccessGrant,
  getPixelById,
  listActiveGrantsForViewer,
  listPixelPolicies,
  getSyncState,
  listPixels,
  upsertAccessGrant,
  upsertPixelPolicy,
} from "./db.js";
import { syncPixelsOnce } from "./indexer.js";
import { createArciumRuntime } from "./arcium.js";
import {
  canViewerAccess,
  normalizePolicyInput,
  parsePolicyEnvelopeString,
  toPolicyEnvelopeString,
} from "./policy.js";
import { createSolanaConnection, getProgramId } from "./solana.js";

const app = express();
app.use(cors());
app.use(express.json());

const pool = createDbPool(config.databaseUrl, { ssl: config.databaseSsl });
const connection = createSolanaConnection(
  config.solanaRpcUrl,
  config.syncCommitment,
);
const programId = getProgramId(config.solanaProgramId);
const arciumRuntime = createArciumRuntime({
  enabled: config.arciumEnabled,
  requireCluster: config.arciumRequireCluster,
  clusterOffset: config.arciumClusterOffset,
  rpcUrl: config.arciumRpcUrl || config.solanaRpcUrl,
  commitment: config.syncCommitment,
  cacheMs: config.arciumStatusCacheMs,
});

let syncRunning = false;
let lastSyncError = "";

function getViewerId(req) {
  return String(req.query.viewer || "").trim();
}

function requireAdmin(req, res, next) {
  if (!config.adminApiKey) {
    res.status(503).json({ ok: false, error: "Admin API key not configured" });
    return;
  }
  const provided = String(req.headers["x-admin-key"] || "");
  if (!provided || provided !== config.adminApiKey) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  next();
}

function redactPixel(row) {
  return {
    ...row,
    username: "",
    image_url: "",
  };
}

async function resolvePolicyMap(pixelIds) {
  const rows = await listPixelPolicies(pool, pixelIds);
  const map = new Map();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const policy = parsePolicyEnvelopeString(
      row.policy_ciphertext,
      config.policyEncryptionKey,
    );
    if (policy) {
      map.set(Number(row.pixel_id), policy);
    }
  }
  return map;
}

async function runSyncCycle() {
  if (syncRunning) return;
  syncRunning = true;
  try {
    const result = await syncPixelsOnce({ connection, programId, pool });
    lastSyncError = "";
    console.log(
      `[indexer] synced ${result.written} pixels at slot ${result.slot}`,
    );
  } catch (error) {
    lastSyncError = String(error?.message || error);
    console.error("[indexer] sync failed:", error);
  } finally {
    syncRunning = false;
  }
}

app.get("/health", async (_req, res) => {
  const arcium = await arciumRuntime.getStatus();
  res.json({
    ok: true,
    syncRunning,
    lastSyncError: lastSyncError || null,
    arcium,
  });
});

app.get("/arcium/status", async (_req, res, next) => {
  try {
    const arcium = await arciumRuntime.getStatus();
    res.json({ ok: true, arcium });
  } catch (error) {
    next(error);
  }
});

app.get("/sync-status", async (_req, res, next) => {
  try {
    const state = await getSyncState(pool);
    res.json({
      ok: true,
      syncRunning,
      lastSyncError: lastSyncError || null,
      state,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/pixels", async (_req, res, next) => {
  try {
    const rows = await listPixels(pool);
    const viewerId = getViewerId(_req);
    const pixelIds = rows.map((row) => Number(row.pixel_id)).filter(Number.isFinite);
    const policies = await resolvePolicyMap(pixelIds);
    const grants = viewerId
      ? new Set(await listActiveGrantsForViewer(pool, viewerId))
      : new Set();
    const now = new Date();
    const result = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const pixelId = Number(row.pixel_id);
      const policy = policies.get(pixelId) || null;
      const hasGrant = viewerId ? grants.has(pixelId) : false;
      const localAllowed = canViewerAccess({ policy, now, hasGrant });
      const arciumDecision = await arciumRuntime.finalizeDecision({
        pixelId,
        viewerId,
        localAllowed,
        policyMode: policy?.mode || "public_view",
      });
      if (arciumDecision.allowed) {
        result.push(row);
      } else {
        result.push(redactPixel(row));
      }
    }
    res.json({ ok: true, count: result.length, viewerId: viewerId || null, pixels: result });
  } catch (error) {
    next(error);
  }
});

app.get("/pixels/:id", async (req, res, next) => {
  try {
    const pixelId = Number(req.params.id);
    if (!Number.isInteger(pixelId) || pixelId <= 0) {
      res.status(400).json({ ok: false, error: "Invalid pixel id" });
      return;
    }
    const row = await getPixelById(pool, pixelId);
    if (!row) {
      res.status(404).json({ ok: false, error: "Pixel not found" });
      return;
    }
    const viewerId = getViewerId(req);
    const policyRow = await getPixelPolicy(pool, pixelId);
    const policy = policyRow
      ? parsePolicyEnvelopeString(
          policyRow.policy_ciphertext,
          config.policyEncryptionKey,
        )
      : null;
    const hasGrant = viewerId
      ? await hasActiveAccessGrant(pool, pixelId, viewerId)
      : false;
    const localAllowed = canViewerAccess({
      policy,
      now: new Date(),
      hasGrant,
    });
    const arciumDecision = await arciumRuntime.finalizeDecision({
      pixelId,
      viewerId,
      localAllowed,
      policyMode: policy?.mode || "public_view",
    });
    res.json({
      ok: true,
      viewerId: viewerId || null,
      pixel: arciumDecision.allowed ? row : redactPixel(row),
      arcium: arciumDecision,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/policies/:id", requireAdmin, async (req, res, next) => {
  try {
    const pixelId = Number(req.params.id);
    if (!Number.isInteger(pixelId) || pixelId <= 0) {
      res.status(400).json({ ok: false, error: "Invalid pixel id" });
      return;
    }
    const row = await getPixelPolicy(pool, pixelId);
    if (!row) {
      res.status(404).json({ ok: false, error: "Policy not found" });
      return;
    }
    const policy = parsePolicyEnvelopeString(
      row.policy_ciphertext,
      config.policyEncryptionKey,
    );
    res.json({
      ok: true,
      pixelId,
      policy,
      updatedBy: row.updated_by || null,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/policies/:id", requireAdmin, async (req, res, next) => {
  try {
    const pixelId = Number(req.params.id);
    if (!Number.isInteger(pixelId) || pixelId <= 0) {
      res.status(400).json({ ok: false, error: "Invalid pixel id" });
      return;
    }
    const policy = normalizePolicyInput(req.body || {});
    const envelope = toPolicyEnvelopeString(policy, config.policyEncryptionKey);
    const updatedBy = String(req.body?.updatedBy || "admin");
    await upsertPixelPolicy(pool, pixelId, envelope, updatedBy);
    res.json({ ok: true, pixelId, policy });
  } catch (error) {
    if (String(error?.message || "").includes("Invalid")) {
      res.status(400).json({ ok: false, error: error.message });
      return;
    }
    next(error);
  }
});

app.post("/access/grant", requireAdmin, async (req, res, next) => {
  try {
    const pixelId = Number(req.body?.pixelId);
    const viewerId = String(req.body?.viewerId || "").trim();
    const grantedUntil = req.body?.grantedUntil;
    if (!Number.isInteger(pixelId) || pixelId <= 0) {
      res.status(400).json({ ok: false, error: "Invalid pixelId" });
      return;
    }
    if (!viewerId) {
      res.status(400).json({ ok: false, error: "viewerId is required" });
      return;
    }
    const grantedUntilDate = new Date(grantedUntil);
    if (!grantedUntil || Number.isNaN(grantedUntilDate.getTime())) {
      res.status(400).json({ ok: false, error: "Invalid grantedUntil" });
      return;
    }
    await upsertAccessGrant(pool, {
      pixelId,
      viewerId,
      grantedUntilIso: grantedUntilDate.toISOString(),
      grantedBy: String(req.body?.grantedBy || "admin"),
      paymentRef: String(req.body?.paymentRef || ""),
    });
    res.json({
      ok: true,
      pixelId,
      viewerId,
      grantedUntil: grantedUntilDate.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/access/check", async (req, res, next) => {
  try {
    const pixelId = Number(req.query.pixelId);
    const viewerId = String(req.query.viewer || "").trim();
    if (!Number.isInteger(pixelId) || pixelId <= 0) {
      res.status(400).json({ ok: false, error: "Invalid pixelId" });
      return;
    }
    if (!viewerId) {
      res.status(400).json({ ok: false, error: "viewer is required" });
      return;
    }
    const policyRow = await getPixelPolicy(pool, pixelId);
    const policy = policyRow
      ? parsePolicyEnvelopeString(
          policyRow.policy_ciphertext,
          config.policyEncryptionKey,
        )
      : null;
    const hasGrant = await hasActiveAccessGrant(pool, pixelId, viewerId);
    const localAllowed = canViewerAccess({
      policy,
      now: new Date(),
      hasGrant,
    });
    const arciumDecision = await arciumRuntime.finalizeDecision({
      pixelId,
      viewerId,
      localAllowed,
      policyMode: policy?.mode || "public_view",
    });
    res.json({
      ok: true,
      pixelId,
      viewerId,
      hasGrant,
      allowed: arciumDecision.allowed,
      localAllowed,
      policyMode: policy?.mode || "public_view",
      revoked: Boolean(policy?.revoked),
      expiresAt: policy?.expiresAt || null,
      arcium: arciumDecision,
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error("[indexer] request error:", error);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

async function main() {
  await runSyncCycle();
  setInterval(runSyncCycle, config.syncIntervalMs);

  app.listen(config.port, () => {
    console.log(`[indexer] listening on :${config.port}`);
    console.log(`[indexer] program: ${config.solanaProgramId}`);
    console.log(`[indexer] rpc: ${config.solanaRpcUrl}`);
    console.log(
      `[indexer] arcium: ${config.arciumEnabled ? "enabled" : "disabled"} (clusterOffset=${config.arciumClusterOffset})`,
    );
  });
}

main().catch((error) => {
  console.error("[indexer] fatal:", error);
  process.exit(1);
});
