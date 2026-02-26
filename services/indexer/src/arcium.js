import crypto from "crypto";
import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import {
  getArciumProgram,
  getClusterAccAddress,
  getClusterAccInfo,
} from "@arcium-hq/reader";
import { createSolanaConnection } from "./solana.js";

function buildReadOnlyWallet() {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey,
    async signTransaction(tx) {
      return tx;
    },
    async signAllTransactions(txs) {
      return txs;
    },
  };
}

function hashDecision(payload) {
  const serialized = JSON.stringify(payload);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

export function createArciumRuntime(options) {
  const enabled = Boolean(options.enabled);
  const requireCluster = Boolean(options.requireCluster);
  const clusterOffset = Number(options.clusterOffset || 0);

  if (!enabled) {
    return {
      enabled: false,
      async getStatus() {
        return {
          ok: false,
          enabled: false,
          reason: "disabled",
        };
      },
      async finalizeDecision(input) {
        const attestation = hashDecision({
          pixelId: input.pixelId,
          viewerId: input.viewerId,
          localAllowed: input.localAllowed,
          source: "disabled",
        });
        return {
          allowed: input.localAllowed,
          source: "local",
          clusterHealthy: false,
          attestation,
        };
      },
    };
  }

  const connection = createSolanaConnection(
    options.rpcUrl,
    options.commitment || "confirmed",
  );
  const wallet = buildReadOnlyWallet();
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: options.commitment || "confirmed",
  });
  const program = getArciumProgram(provider);
  const clusterAddress = getClusterAccAddress(clusterOffset);
  const statusCache = {
    expiresAt: 0,
    value: null,
  };

  async function fetchStatusNow() {
    try {
      const info = await getClusterAccInfo(
        program,
        clusterAddress,
        options.commitment || "confirmed",
      );
      const maxCapacity = Number(info?.maxCapacity || 0);
      const clusterSize = Number(info?.clusterSize || 0);
      return {
        ok: true,
        enabled: true,
        clusterAddress: clusterAddress.toBase58(),
        clusterSize,
        maxCapacity,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        ok: false,
        enabled: true,
        clusterAddress: clusterAddress.toBase58(),
        error: String(error?.message || error),
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  async function getStatus() {
    const now = Date.now();
    if (statusCache.value && now < statusCache.expiresAt) {
      return statusCache.value;
    }
    const ttlMs = Number(options.cacheMs || 30000);
    const next = await fetchStatusNow();
    statusCache.value = next;
    statusCache.expiresAt = now + ttlMs;
    return next;
  }

  async function finalizeDecision({ pixelId, viewerId, localAllowed, policyMode }) {
    const status = await getStatus();
    let allowed = localAllowed;
    if (requireCluster && !status.ok) {
      allowed = false;
    }
    const attestation = hashDecision({
      pixelId,
      viewerId: viewerId || "",
      localAllowed,
      finalAllowed: allowed,
      policyMode: policyMode || "public_view",
      clusterAddress: status.clusterAddress || "",
      clusterHealthy: Boolean(status.ok),
      fetchedAt: status.fetchedAt || "",
    });
    return {
      allowed,
      source: "arcium",
      clusterHealthy: Boolean(status.ok),
      clusterAddress: status.clusterAddress || null,
      requireCluster,
      attestation,
    };
  }

  return {
    enabled: true,
    getStatus,
    finalizeDecision,
  };
}
