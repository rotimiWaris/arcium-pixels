import crypto from "crypto";

const POLICY_VERSION = "arcium-policy-v1";

function normalizeMode(mode) {
  const value = String(mode || "public_view").trim().toLowerCase();
  if (
    value === "public_view" ||
    value === "time_bound" ||
    value === "pay_to_decrypt"
  ) {
    return value;
  }
  throw new Error("Invalid policy mode");
}

export function normalizePolicyInput(input = {}) {
  const mode = normalizeMode(input.mode);
  const revoked = Boolean(input.revoked);
  const expiresAt = input.expiresAt ? new Date(input.expiresAt).toISOString() : null;
  if (input.expiresAt && Number.isNaN(new Date(input.expiresAt).getTime())) {
    throw new Error("Invalid expiresAt value");
  }
  const priceLamports = Number(input.priceLamports || 0);
  if (!Number.isFinite(priceLamports) || priceLamports < 0) {
    throw new Error("Invalid priceLamports value");
  }
  return {
    mode,
    revoked,
    expiresAt,
    priceLamports: Math.floor(priceLamports),
  };
}

function deriveKey(secret) {
  if (!secret) throw new Error("POLICY_ENCRYPTION_KEY is required");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptPolicy(policy, secret) {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(policy), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: POLICY_VERSION,
    alg: "AES-GCM",
    iv: iv.toString("base64"),
    ciphertext: Buffer.concat([encrypted, tag]).toString("base64"),
  };
}

export function decryptPolicyEnvelope(envelope, secret) {
  if (!envelope || envelope.v !== POLICY_VERSION) return null;
  const key = deriveKey(secret);
  const iv = Buffer.from(envelope.iv || "", "base64");
  const payload = Buffer.from(envelope.ciphertext || "", "base64");
  if (payload.length <= 16) return null;
  const body = payload.subarray(0, payload.length - 16);
  const tag = payload.subarray(payload.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}

export function canViewerAccess({ policy, now, hasGrant }) {
  if (!policy) return true;
  if (policy.revoked) return false;
  if (policy.mode === "public_view") return true;
  if (policy.mode === "time_bound") {
    if (!policy.expiresAt) return true;
    return now.getTime() <= new Date(policy.expiresAt).getTime();
  }
  if (policy.mode === "pay_to_decrypt") {
    return Boolean(hasGrant);
  }
  return false;
}

export function toPolicyEnvelopeString(policy, secret) {
  return JSON.stringify(encryptPolicy(policy, secret));
}

export function parsePolicyEnvelopeString(raw, secret) {
  if (!raw) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  try {
    return decryptPolicyEnvelope(parsed, secret);
  } catch {
    return null;
  }
}
