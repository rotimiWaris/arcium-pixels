import crypto from "crypto";
import { Connection, PublicKey } from "@solana/web3.js";

export function createSolanaConnection(rpcUrl, commitment) {
  return new Connection(rpcUrl, { commitment });
}

export function getProgramId(programId) {
  return new PublicKey(programId);
}

export function getAccountDiscriminator(name) {
  const preimage = `account:${name}`;
  const hash = crypto.createHash("sha256").update(preimage).digest();
  return hash.subarray(0, 8);
}

function readAnchorString(view, offsetRef, data) {
  const length = view.getUint32(offsetRef.value, true);
  offsetRef.value += 4;
  const out = data.subarray(offsetRef.value, offsetRef.value + length);
  offsetRef.value += length;
  return new TextDecoder().decode(out);
}

export function decodePixelAccount(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const offset = { value: 8 }; // skip discriminator

  offset.value += 32; // board pubkey
  const pixelId = view.getUint16(offset.value, true);
  offset.value += 2;

  const ownerBytes = data.subarray(offset.value, offset.value + 32);
  const owner = new PublicKey(ownerBytes).toBase58();
  offset.value += 32;

  offset.value += 8; // price_lamports
  offset.value += 8; // lease_expires_at
  const metadataUri = readAnchorString(view, offset, data);
  const claimedAt = Number(view.getBigInt64(offset.value, true));

  return { pixelId, owner, metadataUri, claimedAt };
}

function toGatewayUrl(uri) {
  if (!uri) return uri;
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
  }
  return uri;
}

function decodeDataUriJson(uri) {
  const prefix = "data:application/json;base64,";
  if (!uri || !uri.startsWith(prefix)) return null;
  const base64 = uri.slice(prefix.length);
  const raw = Buffer.from(base64, "base64").toString("utf8");
  return JSON.parse(raw);
}

function decryptArciumEnvelope(envelope, metadataEncryptionKey) {
  if (!metadataEncryptionKey) return null;
  if (!envelope?.iv || !envelope?.ciphertext) return null;
  const key = crypto.createHash("sha256").update(metadataEncryptionKey).digest();
  const iv = Buffer.from(envelope.iv, "base64");
  const encrypted = Buffer.from(envelope.ciphertext, "base64");
  if (encrypted.length <= 16) return null;
  const tag = encrypted.subarray(encrypted.length - 16);
  const body = encrypted.subarray(0, encrypted.length - 16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveMetadataUri(uri, metadataEncryptionKey = "") {
  const embedded = decodeDataUriJson(uri);
  if (embedded) {
    if (embedded.v === "arcium-enc-v1") {
      try {
        return decryptArciumEnvelope(embedded, metadataEncryptionKey);
      } catch {
        return null;
      }
    }
    return embedded;
  }
  const url = toGatewayUrl(uri);
  if (!url) return null;
  const payload = await fetchJson(url);
  if (!payload) return null;
  if (payload.v === "arcium-enc-v1") {
    try {
      return decryptArciumEnvelope(payload, metadataEncryptionKey);
    } catch {
      return null;
    }
  }
  return payload;
}

export async function fetchProgramPixelAccounts(connection, programId) {
  const accounts = await connection.getProgramAccounts(programId);
  const discriminator = getAccountDiscriminator("Pixel");
  const result = [];

  for (let i = 0; i < accounts.length; i++) {
    const raw = accounts[i].account.data;
    if (!raw || raw.length < 8) continue;
    let isPixel = true;
    for (let j = 0; j < 8; j++) {
      if (raw[j] !== discriminator[j]) {
        isPixel = false;
        break;
      }
    }
    if (!isPixel) continue;
    try {
      result.push(decodePixelAccount(raw));
    } catch {
      // Skip malformed account
    }
  }
  return result;
}
