import "dotenv/config";

function argOrDefault(index, fallback) {
  const value = process.argv[index];
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function toQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== "") {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = payload ? JSON.stringify(payload) : `HTTP ${response.status}`;
    throw new Error(`${options.method || "GET"} ${url} failed: ${detail}`);
  }
  return payload;
}

async function main() {
  const pixelId = Number(argOrDefault(2, "1"));
  const viewerId = argOrDefault(3, "wallet:demo-viewer");
  const baseUrl =
    argOrDefault(4, "") ||
    process.env.INDEXER_API_BASE_URL ||
    `http://localhost:${process.env.PORT || 8787}`;
  const adminApiKey = String(process.env.ADMIN_API_KEY || "").trim();

  if (!Number.isInteger(pixelId) || pixelId <= 0) {
    throw new Error("Pixel id must be a positive integer.");
  }
  if (!adminApiKey) {
    throw new Error("ADMIN_API_KEY is missing. Set it in services/indexer/.env");
  }

  const headers = {
    "content-type": "application/json",
    "x-admin-key": adminApiKey,
  };

  console.log(`[demo] baseUrl=${baseUrl}`);
  console.log(`[demo] pixelId=${pixelId} viewerId=${viewerId}`);

  const setPolicyPayload = {
    mode: "pay_to_decrypt",
    revoked: false,
    priceLamports: 100000,
    updatedBy: "demo-script",
  };

  const policyResult = await requestJson(`${baseUrl}/policies/${pixelId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(setPolicyPayload),
  });
  console.log("[demo] policy set:", policyResult.policy);

  const denyUrl = `${baseUrl}/access/check?${toQuery({ pixelId, viewer: viewerId })}`;
  const denyCheck = await requestJson(denyUrl);
  console.log("[demo] before grant:", {
    hasGrant: denyCheck.hasGrant,
    allowed: denyCheck.allowed,
    policyMode: denyCheck.policyMode,
    arciumAllowed: denyCheck?.arcium?.allowed,
  });
  if (denyCheck.allowed) {
    throw new Error("Expected deny-before-grant, but allowed=true");
  }

  const grantUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const grantPayload = {
    pixelId,
    viewerId,
    grantedUntil: grantUntil,
    grantedBy: "demo-script",
    paymentRef: "demo-pay-ref",
  };

  const grantResult = await requestJson(`${baseUrl}/access/grant`, {
    method: "POST",
    headers,
    body: JSON.stringify(grantPayload),
  });
  console.log("[demo] grant created:", grantResult);

  const allowCheck = await requestJson(denyUrl);
  console.log("[demo] after grant:", {
    hasGrant: allowCheck.hasGrant,
    allowed: allowCheck.allowed,
    policyMode: allowCheck.policyMode,
    arciumAllowed: allowCheck?.arcium?.allowed,
  });
  if (!allowCheck.allowed) {
    throw new Error("Expected allow-after-grant, but allowed=false");
  }

  const pixelView = await requestJson(
    `${baseUrl}/pixels/${pixelId}?${toQuery({ viewer: viewerId })}`,
  );
  console.log("[demo] pixel view after grant:", {
    pixel_id: pixelView?.pixel?.pixel_id,
    username: pixelView?.pixel?.username || "",
    image_url: pixelView?.pixel?.image_url ? "present" : "",
  });

  console.log("[demo] success: deny-before-grant and allow-after-grant verified.");
}

main().catch((error) => {
  console.error("[demo] failed:", error.message || error);
  process.exit(1);
});
