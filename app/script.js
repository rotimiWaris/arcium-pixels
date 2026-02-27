import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
} from "https://esm.sh/@solana/web3.js@1.95.3";

// Keep production working even if external config files fail to load.
const DEFAULT_APP_CONFIG = {
  solanaNetwork: "devnet",
  solanaProgramId: "V7z3BRz2T8XX6gCQf5nYibHRm3KhDN38Z9HPp5tiFdc",
  indexerApiBaseUrl: "https://arcium-pixels-production.up.railway.app",
  enableArciumEncryption: true,
  arciumPolicyDefault: "public_view",
  showcasePrivatePixelIds: [1],
};

window.APP_CONFIG = {
  ...DEFAULT_APP_CONFIG,
  ...(window.APP_CONFIG || {}),
};

// ONLY WANNA RUN THE CODE WHEN BROWSER LOADS
window.addEventListener("load", function () {
  const APP_CONFIG = window.APP_CONFIG || {};
  const WALLET_AUTOCONNECT_DISABLED_KEY =
    "arcium_pixels_wallet_autoconnect_disabled";
  const WALLET_PROVIDER_PREFERENCE_KEY =
    "arcium_pixels_wallet_provider_preference";
  const SOLANA_NETWORK = "devnet";
  const SOLANA_PROGRAM_ID =
    APP_CONFIG.solanaProgramId || "V7z3BRz2T8XX6gCQf5nYibHRm3KhDN38Z9HPp5tiFdc";
  const INDEXER_API_BASE_URL = APP_CONFIG.indexerApiBaseUrl || "";
  const ADMIN_WALLET_PUBLIC_KEY =
    APP_CONFIG.adminWalletPublicKey ||
    "FTGLYKah3ZXRNSMb1uji2DXiTTHt8isPYqLxnG6oNJrf";
  const BOARD_TOTAL_PIXELS = Number(APP_CONFIG.boardTotalPixels || 512);
  const PINATA_JWT = APP_CONFIG.pinataJwt || "YOUR_PINATA_JWT";
  const ENABLE_ARCIUM_ENCRYPTION = APP_CONFIG.enableArciumEncryption === true;
  const METADATA_ENCRYPTION_KEY = APP_CONFIG.metadataEncryptionKey || "";
  const ARCIUM_POLICY_DEFAULT = APP_CONFIG.arciumPolicyDefault || "public_view";
  const SHOWCASE_PRIVATE_PIXEL_IDS = Array.isArray(
    APP_CONFIG.showcasePrivatePixelIds,
  )
    ? APP_CONFIG.showcasePrivatePixelIds
        .map((value) => Number(value))
        .filter(Number.isFinite)
    : [1];
  const FORCE_SHOWCASE_PRIVATE = APP_CONFIG.forceShowcasePrivate !== false;
  const PIXEL_CACHE_VERSION = 1;
  const PIXEL_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
  const solanaConnection = new Connection(clusterApiUrl(SOLANA_NETWORK), {
    commitment: "confirmed",
  });

  const canvas = document.querySelector("canvas");
  const sourceImage = document.getElementById("image");
  // Add willReadFrequently option
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const modal = document.getElementById("modal");
  const profileForm = document.getElementById("profileForm");
  const usernameInput = document.getElementById("usernameInput");
  const fetchBtn = document.getElementById("fetchBtn");
  const fetchStatus = document.getElementById("fetchStatus");
  const profilePreview = document.getElementById("profilePreview");
  const addBtn = document.getElementById("addBtn");
  const particleInfo = document.getElementById("particleInfo");
  const ownerProfileLink = document.getElementById("ownerProfileLink");
  const closeModalButton = document.querySelector(".close");
  const connectWalletBtn = document.getElementById("connectWalletBtn");
  const disconnectWalletBtn = document.getElementById("disconnectWalletBtn");
  const walletProviderSelect = document.getElementById("walletProviderSelect");
  const walletProviderToggle = document.getElementById("walletProviderToggle");
  const walletProviderMenu = document.getElementById("walletProviderMenu");
  const walletStatus = document.getElementById("walletStatus");
  const arciumStatusBadge = document.getElementById("arciumStatusBadge");
  const appToast = document.getElementById("appToast");
  canvas.style.touchAction = "manipulation";

  const imageCache = new Map();
  let particleProfiles = {};
  let currentWalletPublicKey = null;
  let walletManualConnectInProgress = false;
  let walletProviderPreference = "auto";
  let activeWalletEventProvider = null;
  let activeParticle = null;
  let pendingProfile = null;
  let toastHideTimeout = null;
  let arciumStatusIntervalId = null;

  function updateWalletProviderDropdownUI() {
    if (!walletProviderToggle || !walletProviderMenu || !walletProviderSelect)
      return;
    const selectedOption =
      walletProviderSelect.options[walletProviderSelect.selectedIndex];
    walletProviderToggle.textContent = selectedOption?.text || "Auto Wallet";
    const items = walletProviderMenu.querySelectorAll(".wallet-provider-item");
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const isActive = item.dataset.value === walletProviderSelect.value;
      item.classList.toggle("active", isActive);
    }
  }

  function closeWalletProviderMenu() {
    if (!walletProviderMenu || !walletProviderToggle) return;
    walletProviderMenu.classList.remove("open");
    walletProviderToggle.setAttribute("aria-expanded", "false");
  }

  function openWalletProviderMenu() {
    if (!walletProviderMenu || !walletProviderToggle) return;
    walletProviderMenu.classList.add("open");
    walletProviderToggle.setAttribute("aria-expanded", "true");
  }

  // SETTING CANVAS HEIGHT AND WIDTH
  function setCanvasSize() {
    const viewportPadding = 24;
    const maxCanvasWidth = Math.max(
      180,
      window.innerWidth - viewportPadding * 2,
    );
    const maxCanvasHeight = Math.max(
      180,
      window.innerHeight - viewportPadding * 2,
    );
    const imageWidth = sourceImage.naturalWidth || sourceImage.width || 16;
    const imageHeight = sourceImage.naturalHeight || sourceImage.height || 9;
    const imageRatio = imageWidth / imageHeight;

    let width = maxCanvasWidth;
    let height = width / imageRatio;

    if (height > maxCanvasHeight) {
      height = maxCanvasHeight;
      width = height * imageRatio;
    }

    canvas.width = Math.max(180, Math.floor(width));
    canvas.height = Math.max(180, Math.floor(height));
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
  }
  setCanvasSize();

  function normalizeUsername(value) {
    return value.trim().replace(/^@+/, "").toLowerCase();
  }

  function loadImage(url) {
    if (imageCache.has(url)) return imageCache.get(url);
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image could not be loaded"));
      img.src = url;
    });
    imageCache.set(url, promise);
    return promise;
  }

  async function resolveProfileImage(username) {
    const encoded = encodeURIComponent(username);
    const url = `https://unavatar.io/x/${encoded}`;
    await loadImage(url);
    return url;
  }

  function base64FromBytes(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  function bytesFromBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function getMetadataCryptoKey() {
    if (!METADATA_ENCRYPTION_KEY) return null;
    const keyMaterial = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(METADATA_ENCRYPTION_KEY),
    );
    return crypto.subtle.importKey(
      "raw",
      keyMaterial,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
  }

  async function encryptMetadataPayload(payload) {
    const key = await getMetadataCryptoKey();
    if (!key) throw new Error("METADATA_KEY_MISSING");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plaintext,
    );
    return {
      iv: base64FromBytes(iv),
      ciphertext: base64FromBytes(new Uint8Array(encrypted)),
      alg: "AES-GCM",
      key_ref: "arcium:local-dev-v1",
    };
  }

  async function decryptMetadataEnvelope(envelope) {
    const key = await getMetadataCryptoKey();
    if (!key) throw new Error("METADATA_KEY_MISSING");
    const iv = bytesFromBase64(envelope.iv || "");
    const ciphertext = bytesFromBase64(envelope.ciphertext || "");
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
    const json = new TextDecoder().decode(new Uint8Array(decrypted));
    return JSON.parse(json);
  }

  function decodeMetadataDataUri(uri) {
    const prefix = "data:application/json;base64,";
    if (!uri || !uri.startsWith(prefix)) return null;
    try {
      const json = atob(uri.slice(prefix.length));
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function toGatewayUrl(uri) {
    if (!uri) return uri;
    if (uri.startsWith("ipfs://")) {
      return `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
    }
    return uri;
  }

  async function resolveProfileFromMetadataUri(uri) {
    if (!uri) return null;
    const embedded = decodeMetadataDataUri(uri);
    if (embedded) {
      if (embedded.v === "arcium-enc-v1" && embedded.ciphertext) {
        try {
          return await decryptMetadataEnvelope(embedded);
        } catch {
          return null;
        }
      }
      return embedded;
    }
    const gatewayUrl = toGatewayUrl(uri);
    const response = await fetch(gatewayUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: ${response.status}`);
    }
    const payload = await response.json();
    if (payload?.v === "arcium-enc-v1" && payload.ciphertext) {
      try {
        return await decryptMetadataEnvelope(payload);
      } catch {
        return null;
      }
    }
    return payload;
  }

  async function createMetadataUri({
    pixelId,
    username,
    imageUrl,
    ownerWallet,
  }) {
    const payload = {
      pixel_id: pixelId,
      username,
      image_url: imageUrl,
      owner_wallet: ownerWallet,
      created_at: new Date().toISOString(),
    };
    const metadataPayload =
      ENABLE_ARCIUM_ENCRYPTION && METADATA_ENCRYPTION_KEY
        ? {
            v: "arcium-enc-v1",
            policy_id: ARCIUM_POLICY_DEFAULT,
            ...(await encryptMetadataPayload(payload)),
          }
        : payload;

    if (PINATA_JWT && PINATA_JWT !== "YOUR_PINATA_JWT") {
      const response = await fetch(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${PINATA_JWT}`,
          },
          body: JSON.stringify({ pinataContent: metadataPayload }),
        },
      );
      if (!response.ok) {
        throw new Error(`Pinata upload failed: ${response.status}`);
      }
      const result = await response.json();
      if (!result.IpfsHash) throw new Error("Pinata response missing IpfsHash");
      return `ipfs://${result.IpfsHash}`;
    }

    // Keep fallback payload compact so it fits on-chain string limits.
    const compactPayload =
      metadataPayload?.v === "arcium-enc-v1"
        ? metadataPayload
        : { u: username, i: imageUrl };
    const bytes = new TextEncoder().encode(JSON.stringify(compactPayload));
    return `data:application/json;base64,${base64FromBytes(bytes)}`;
  }

  function getPixelCacheStorageKey() {
    return `arcium_pixels_cache:${SOLANA_NETWORK}:${SOLANA_PROGRAM_ID}:v${PIXEL_CACHE_VERSION}`;
  }

  function getPixelCacheBackupKey() {
    return `${getPixelCacheStorageKey()}:backup`;
  }

  function savePixelProfilesToCache(nextProfiles) {
    if (!nextProfiles || typeof nextProfiles !== "object") return;
    const payload = {
      version: PIXEL_CACHE_VERSION,
      network: SOLANA_NETWORK,
      programId: SOLANA_PROGRAM_ID,
      updatedAt: Date.now(),
      profiles: nextProfiles,
    };
    try {
      const raw = JSON.stringify(payload);
      localStorage.setItem(getPixelCacheStorageKey(), raw);
      localStorage.setItem(getPixelCacheBackupKey(), raw);
    } catch {
      // Ignore cache write failures.
    }
  }

  function readPixelProfilesFromCache() {
    const keys = [getPixelCacheStorageKey(), getPixelCacheBackupKey()];
    for (let i = 0; i < keys.length; i++) {
      try {
        const raw = localStorage.getItem(keys[i]);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== PIXEL_CACHE_VERSION) continue;
        if (
          typeof parsed.updatedAt !== "number" ||
          Date.now() - parsed.updatedAt > PIXEL_CACHE_MAX_AGE_MS
        ) {
          continue;
        }
        if (!parsed.profiles || typeof parsed.profiles !== "object") continue;
        return parsed.profiles;
      } catch {
        // Try fallback cache key.
      }
    }
    return null;
  }

  function hydratePixelProfilesFromCache() {
    const cached = readPixelProfilesFromCache();
    if (!cached) return false;
    applyProfiles(cached);
    return true;
  }

  function dedupeProfilesByUsername(nextProfiles) {
    const deduped = {};
    const seenUsernames = new Set();
    const entries = Object.entries(nextProfiles || {}).sort(
      (a, b) => Number(a[0]) - Number(b[0]),
    );

    for (let i = 0; i < entries.length; i++) {
      const [pixelId, profile] = entries[i];
      if (!profile) continue;
      const username = normalizeUsername(profile.username || "");
      if (username) {
        if (seenUsernames.has(username)) continue;
        seenUsernames.add(username);
      }
      deduped[pixelId] = profile;
    }

    return deduped;
  }

  function applyProfiles(nextProfiles) {
    const deduped = dedupeProfilesByUsername(nextProfiles || {});
    particleProfiles = deduped;
    savePixelProfilesToCache(deduped);
    if (effect) effect.applyStoredProfiles();
  }

  function normalizeIndexerApiBaseUrl() {
    if (!INDEXER_API_BASE_URL) return "";
    return INDEXER_API_BASE_URL.replace(/\/+$/, "");
  }

  function hasIndexerApiBaseUrl() {
    return Boolean(normalizeIndexerApiBaseUrl());
  }

  function showToast(message, type = "success") {
    if (!appToast) return;
    appToast.textContent = message;
    appToast.classList.remove("success", "error");
    appToast.classList.add(type === "error" ? "error" : "success");
    appToast.classList.add("show");
    if (toastHideTimeout) clearTimeout(toastHideTimeout);
    toastHideTimeout = setTimeout(() => {
      appToast.classList.remove("show");
    }, 5000);
  }

  function showActionFeedback(message, type = "error") {
    if (fetchStatus) fetchStatus.textContent = message;
    showToast(message, type);
  }

  function setArciumBadgeState(kind, message) {
    if (!arciumStatusBadge) return;
    arciumStatusBadge.classList.remove(
      "arcium-status--loading",
      "arcium-status--ok",
      "arcium-status--warn",
      "arcium-status--err",
    );
    arciumStatusBadge.classList.add(`arcium-status--${kind}`);
    arciumStatusBadge.textContent = message;
  }

  async function refreshArciumStatus() {
    const baseUrl = normalizeIndexerApiBaseUrl();
    if (!baseUrl) {
      setArciumBadgeState("warn", "Arcium: indexer not configured");
      return;
    }
    try {
      const response = await fetch(`${baseUrl}/arcium/status`);
      if (!response.ok) {
        setArciumBadgeState(
          "warn",
          `Arcium: status unavailable (${response.status})`,
        );
        return;
      }
      const payload = await response.json();
      const status = payload?.arcium;
      if (!status?.enabled) {
        setArciumBadgeState("warn", "Arcium: disabled");
        return;
      }
      if (status.ok) {
        const shortCluster = String(status.clusterAddress || "").slice(0, 8);
        setArciumBadgeState(
          "ok",
          `Arcium: connected${shortCluster ? ` (${shortCluster}...)` : ""}`,
        );
      } else {
        setArciumBadgeState("err", "Arcium: cluster unavailable");
      }
    } catch {
      setArciumBadgeState("err", "Arcium: offline");
    }
  }

  async function fetchClaimedPixelsFromIndexer(prefetchedRecords = null) {
    const baseUrl = normalizeIndexerApiBaseUrl();
    if (!baseUrl) return false;
    try {
      let records = prefetchedRecords;
      if (!Array.isArray(records)) {
        const url = new URL(`${baseUrl}/pixels`);
        if (currentWalletPublicKey) {
          url.searchParams.set("viewer", currentWalletPublicKey);
        }
        const response = await fetch(url.toString());
        if (!response.ok) return false;
        const payload = await response.json();
        records = Array.isArray(payload?.pixels) ? payload.pixels : [];
      }
      const next = {};
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        if (!row || !row.pixel_id) continue;
        const isShowcasePixel = SHOWCASE_PRIVATE_PIXEL_IDS.includes(
          Number(row.pixel_id),
        );
        const backendLocked = Boolean(
          row.owner && !row.username && !row.image_url && row.metadata_uri,
        );
        const isLocked = Boolean(
          isShowcasePixel &&
            row.owner &&
            (FORCE_SHOWCASE_PRIVATE || backendLocked),
        );
        next[String(row.pixel_id)] = {
          username: isLocked ? "" : row.username || "",
          imageUrl: isLocked ? "" : row.image_url || "",
          claimedBy: row.owner || "",
          ownerUserId: row.owner || "",
          locked: isLocked,
        };
      }
      applyProfiles(next);
      return true;
    } catch {
      return false;
    }
  }

  function hasIndexerProfileData(records) {
    if (!Array.isArray(records) || records.length === 0) return true;
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      if (!row) continue;
      if (String(row.username || "").trim() || String(row.image_url || "").trim()) {
        return true;
      }
    }
    return false;
  }

  async function fetchIndexerRows() {
    const baseUrl = normalizeIndexerApiBaseUrl();
    if (!baseUrl) return null;
    try {
      const url = new URL(`${baseUrl}/pixels`);
      if (currentWalletPublicKey) {
        url.searchParams.set("viewer", currentWalletPublicKey);
      }
      const response = await fetch(url.toString());
      if (!response.ok) return null;
      const payload = await response.json();
      return Array.isArray(payload?.pixels) ? payload.pixels : [];
    } catch {
      return null;
    }
  }

  function overlayShowcasePrivacy(records) {
    if (!Array.isArray(records) || records.length === 0) return false;
    if (!SHOWCASE_PRIVATE_PIXEL_IDS.length) return false;
    let changed = false;
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const pixelId = Number(row?.pixel_id);
      if (!Number.isFinite(pixelId)) continue;
      if (!SHOWCASE_PRIVATE_PIXEL_IDS.includes(pixelId)) continue;
      const key = String(pixelId);
      const existing = particleProfiles[key];
      const backendLocked = Boolean(
        row.owner && !row.username && !row.image_url && row.metadata_uri,
      );
      const isLocked = Boolean(
        row.owner && (FORCE_SHOWCASE_PRIVATE || backendLocked),
      );

      if (isLocked) {
        particleProfiles[key] = {
          username: "",
          imageUrl: "",
          claimedBy: row.owner || existing?.claimedBy || "",
          ownerUserId: row.owner || existing?.ownerUserId || "",
          locked: true,
        };
        changed = true;
      } else if (existing?.locked) {
        // Remove lock marker when access is allowed again.
        particleProfiles[key] = {
          ...existing,
          locked: false,
          username: row.username || existing.username || "",
          imageUrl: row.image_url || existing.imageUrl || "",
        };
        changed = true;
      }
    }
    if (changed) {
      savePixelProfilesToCache(particleProfiles);
      if (effect) effect.applyStoredProfiles();
    }
    return changed;
  }

  async function refreshClaimedPixels() {
    let indexerRows = null;
    if (hasIndexerApiBaseUrl()) {
      indexerRows = await fetchIndexerRows();
      if (Array.isArray(indexerRows)) {
        const fromIndexer = await fetchClaimedPixelsFromIndexer(indexerRows);
        if (fromIndexer && hasIndexerProfileData(indexerRows)) return true;
      }
    }

    const fromChain = await fetchClaimedPixelsFromSolana();
    if (!fromChain) return false;

    if (hasIndexerApiBaseUrl()) {
      if (!Array.isArray(indexerRows)) {
        indexerRows = await fetchIndexerRows();
      }
      if (indexerRows) overlayShowcasePrivacy(indexerRows);
    }
    return true;
  }

  async function forceRefreshClaimedPixels() {
    particleProfiles = {};
    if (effect) {
      effect.applyStoredProfiles();
      rebuildEffect();
    }

    let indexerRows = null;
    if (hasIndexerApiBaseUrl()) {
      indexerRows = await fetchIndexerRows();
      if (Array.isArray(indexerRows)) {
        const fromIndexer = await fetchClaimedPixelsFromIndexer(indexerRows);
        if (fromIndexer && hasIndexerProfileData(indexerRows)) return true;
      }
    }

    const fromChain = await fetchClaimedPixelsFromSolana();
    if (!fromChain) return false;

    if (hasIndexerApiBaseUrl()) {
      if (!Array.isArray(indexerRows)) {
        indexerRows = await fetchIndexerRows();
      }
      if (indexerRows) overlayShowcasePrivacy(indexerRows);
    }
    return true;
  }

  async function getAnchorAccountDiscriminator(name) {
    const text = `account:${name}`;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text),
    );
    return new Uint8Array(digest).slice(0, 8);
  }

  function readAnchorString(view, offsetRef) {
    const length = view.getUint32(offsetRef.value, true);
    offsetRef.value += 4;
    const bytes = new Uint8Array(
      view.buffer,
      view.byteOffset + offsetRef.value,
      length,
    );
    offsetRef.value += length;
    return new TextDecoder().decode(bytes);
  }

  function decodePixelAccount(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const offset = { value: 8 }; // Skip account discriminator

    offset.value += 32; // board pubkey
    const pixelId = view.getUint16(offset.value, true);
    offset.value += 2;
    const ownerBytes = new Uint8Array(
      data.slice(offset.value, offset.value + 32),
    );
    const owner = new PublicKey(ownerBytes).toBase58();
    offset.value += 32;
    offset.value += 8; // price_lamports
    offset.value += 8; // lease_expires_at
    const metadataUri = readAnchorString(view, offset);
    offset.value += 8; // claimed_at
    // bump is remaining byte

    return { pixelId, owner, metadataUri };
  }

  async function fetchClaimedPixelsFromSolana() {
    if (!hasValidProgramId()) return false;
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const discriminator = await getAnchorAccountDiscriminator("Pixel");
    const accounts = await solanaConnection.getProgramAccounts(programId);
    const next = {};

    for (let i = 0; i < accounts.length; i++) {
      const raw = accounts[i].account.data;
      if (raw.length < 8) continue;
      let isPixelAccount = true;
      for (let j = 0; j < 8; j++) {
        if (raw[j] !== discriminator[j]) {
          isPixelAccount = false;
          break;
        }
      }
      if (!isPixelAccount) continue;
      try {
        const decoded = decodePixelAccount(raw);
        if (!decoded || decoded.pixelId <= 0) continue;
        if (decoded.owner === "11111111111111111111111111111111") continue;

        const meta = await resolveProfileFromMetadataUri(decoded.metadataUri);
        next[String(decoded.pixelId)] = {
          username: meta?.username || meta?.u || "",
          imageUrl: meta?.image_url || meta?.i || "",
          claimedBy: decoded.owner,
          ownerUserId: decoded.owner,
        };
      } catch {
        // Skip invalid account payloads
      }
    }

    applyProfiles(next);
    return true;
  }

  function isClaimedProfile(profile) {
    if (!profile) return false;
    return Boolean(
      profile.username ||
      profile.claimedBy ||
      profile.ownerUserId ||
      profile.locked,
    );
  }

  function getCurrentUserId() {
    return currentWalletPublicKey || "";
  }

  function findClaimedParticleIdByUser(userId) {
    if (!userId) return null;
    const entries = Object.entries(particleProfiles);
    for (let i = 0; i < entries.length; i++) {
      const [particleId, profile] = entries[i];
      if (!profile) continue;
      if (profile.claimedBy === userId || profile.ownerUserId === userId) {
        return Number(particleId);
      }
    }
    return null;
  }

  function findClaimedPixelIdByUsername(username) {
    const target = normalizeUsername(username || "");
    if (!target) return null;
    const entries = Object.entries(particleProfiles);
    for (let i = 0; i < entries.length; i++) {
      const [pixelId, profile] = entries[i];
      const claimedUsername = normalizeUsername(profile?.username || "");
      if (claimedUsername && claimedUsername === target) {
        return Number(pixelId);
      }
    }
    return null;
  }

  function shortenAddress(value) {
    if (!value) return "";
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }

  function readWalletProviderPreference() {
    try {
      const stored = localStorage.getItem(WALLET_PROVIDER_PREFERENCE_KEY);
      if (stored === "phantom" || stored === "solflare" || stored === "auto") {
        return stored;
      }
    } catch {
      // Ignore storage failures.
    }
    return "auto";
  }

  function setWalletProviderPreference(value) {
    walletProviderPreference =
      value === "phantom" || value === "solflare" ? value : "auto";
    try {
      localStorage.setItem(
        WALLET_PROVIDER_PREFERENCE_KEY,
        walletProviderPreference,
      );
    } catch {
      // Ignore storage failures.
    }
    if (walletProviderSelect) {
      walletProviderSelect.value = walletProviderPreference;
      updateWalletProviderDropdownUI();
    }
  }

  function getWalletProviders() {
    const phantom = window.phantom?.solana;
    const directSolflare = window.solflare;
    const injected = window.solana;
    const providers = Array.isArray(injected?.providers)
      ? injected.providers
      : [];
    const candidates = [phantom, directSolflare, injected, ...providers];
    let foundPhantom = null;
    let foundSolflare = null;

    for (let i = 0; i < candidates.length; i++) {
      const provider = candidates[i];
      if (!provider) continue;
      if (!foundPhantom && provider.isPhantom) foundPhantom = provider;
      if (!foundSolflare && provider.isSolflare) foundSolflare = provider;
    }

    return { phantom: foundPhantom, solflare: foundSolflare };
  }

  function getWalletProvider() {
    const providers = getWalletProviders();
    if (walletProviderPreference === "phantom") return providers.phantom;
    if (walletProviderPreference === "solflare") return providers.solflare;
    return providers.phantom || providers.solflare || null;
  }

  function isSupportedWalletProvider(provider) {
    return Boolean(provider && (provider.isPhantom || provider.isSolflare));
  }

  function isWalletAutoConnectDisabled() {
    try {
      return localStorage.getItem(WALLET_AUTOCONNECT_DISABLED_KEY) === "1";
    } catch {
      return false;
    }
  }

  function setWalletAutoConnectDisabled(disabled) {
    try {
      if (disabled) {
        localStorage.setItem(WALLET_AUTOCONNECT_DISABLED_KEY, "1");
      } else {
        localStorage.removeItem(WALLET_AUTOCONNECT_DISABLED_KEY);
      }
    } catch {
      // Ignore storage failures.
    }
  }

  function updateWalletUI() {
    if (!walletStatus || !connectWalletBtn || !disconnectWalletBtn) return;
    const provider = getWalletProvider();
    if (!isSupportedWalletProvider(provider)) {
      if (walletProviderPreference === "phantom") {
        walletStatus.textContent = "Phantom wallet not found";
      } else if (walletProviderPreference === "solflare") {
        walletStatus.textContent = "Solflare wallet not found";
      } else {
        walletStatus.textContent = "Phantom or Solflare wallet not found";
      }
      connectWalletBtn.disabled = true;
      disconnectWalletBtn.style.display = "none";
      return;
    }
    connectWalletBtn.disabled = false;
    if (currentWalletPublicKey) {
      walletStatus.textContent = `Wallet: ${shortenAddress(currentWalletPublicKey)} | Devnet`;
      connectWalletBtn.style.display = "none";
      disconnectWalletBtn.style.display = "inline-block";
    } else {
      walletStatus.textContent = "Wallet not connected (Devnet)";
      connectWalletBtn.style.display = "inline-block";
      disconnectWalletBtn.style.display = "none";
    }
  }

  async function connectWallet() {
    const provider = getWalletProvider();
    if (!isSupportedWalletProvider(provider)) {
      if (walletStatus) {
        walletStatus.textContent = "Install Phantom or Solflare wallet first.";
      }
      return;
    }
    try {
      walletManualConnectInProgress = true;
      const response = await provider.connect({ onlyIfTrusted: false });
      const publicKey = response?.publicKey || provider.publicKey;
      if (!publicKey) throw new Error("WALLET_PUBLIC_KEY_MISSING");
      setWalletAutoConnectDisabled(false);
      currentWalletPublicKey = publicKey.toString();
      updateWalletUI();
      await refreshClaimedPixels();
      await tryAutoInitializeBoardForAdmin();
    } catch (error) {
      // Some providers may throw after approval; trust provider.publicKey if present.
      if (provider?.publicKey) {
        setWalletAutoConnectDisabled(false);
        currentWalletPublicKey = provider.publicKey.toString();
        updateWalletUI();
        await refreshClaimedPixels();
        await tryAutoInitializeBoardForAdmin();
        return;
      }

      const message = String(error?.message || "");
      const isCancelled =
        message.toLowerCase().includes("cancel") ||
        message.toLowerCase().includes("reject") ||
        message.includes("4001");
      if (walletStatus) {
        walletStatus.textContent = isCancelled
          ? "Wallet connection cancelled."
          : `Wallet connection failed: ${message || "Unknown error"}`;
      }
    } finally {
      walletManualConnectInProgress = false;
    }
  }

  async function disconnectWallet() {
    const provider = getWalletProvider();
    setWalletAutoConnectDisabled(true);
    walletManualConnectInProgress = false;
    if (isSupportedWalletProvider(provider)) {
      try {
        await provider.disconnect();
      } catch {
        // no-op
      }
    }
    currentWalletPublicKey = null;
    if (walletStatus) walletStatus.textContent = "Wallet disconnected";
    updateWalletUI();
    await refreshClaimedPixels();
  }

  function bindWalletProviderEvents() {
    const provider = getWalletProvider();
    if (!isSupportedWalletProvider(provider)) {
      activeWalletEventProvider = null;
      updateWalletUI();
      return;
    }
    if (activeWalletEventProvider === provider) {
      updateWalletUI();
      return;
    }

    activeWalletEventProvider = provider;
    provider.on("connect", async (publicKey) => {
      if (isWalletAutoConnectDisabled() && !walletManualConnectInProgress) {
        currentWalletPublicKey = null;
        updateWalletUI();
        try {
          await provider.disconnect();
        } catch {
          // no-op
        }
        return;
      }
      currentWalletPublicKey = publicKey?.toString?.() || null;
      updateWalletUI();
      refreshClaimedPixels().catch(() => {});
      tryAutoInitializeBoardForAdmin();
    });
    provider.on("disconnect", () => {
      currentWalletPublicKey = null;
      updateWalletUI();
      refreshClaimedPixels().catch(() => {});
    });
    provider.on("accountChanged", (publicKey) => {
      if (isWalletAutoConnectDisabled() && !walletManualConnectInProgress) {
        currentWalletPublicKey = null;
        updateWalletUI();
        return;
      }
      currentWalletPublicKey = publicKey?.toString?.() || null;
      updateWalletUI();
      refreshClaimedPixels().catch(() => {});
      tryAutoInitializeBoardForAdmin();
    });

    if (!isWalletAutoConnectDisabled()) {
      provider
        .connect({ onlyIfTrusted: true })
        .then((res) => {
          currentWalletPublicKey =
            res?.publicKey?.toString?.() ||
            provider.publicKey?.toString?.() ||
            null;
          updateWalletUI();
          refreshClaimedPixels().catch(() => {});
          tryAutoInitializeBoardForAdmin();
        })
        .catch(() => {
          updateWalletUI();
        });
    } else {
      currentWalletPublicKey = null;
      if (provider.isConnected) {
        provider.disconnect().catch(() => {
          // no-op
        });
      }
      updateWalletUI();
    }
  }

  function hasValidProgramId() {
    if (!SOLANA_PROGRAM_ID || SOLANA_PROGRAM_ID === "REPLACE_WITH_PROGRAM_ID") {
      return false;
    }
    try {
      // Validation only; the value is used later when tx wiring is added.
      new PublicKey(SOLANA_PROGRAM_ID);
      return true;
    } catch {
      return false;
    }
  }

  function getAnchorInstructionDiscriminator(name) {
    const text = `global:${name}`;
    const bytes = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", bytes).then((digest) => {
      const hashBytes = new Uint8Array(digest);
      return hashBytes.slice(0, 8);
    });
  }

  function encodeClaimPixelArgs({
    pixelId,
    priceLamports,
    leaseExpiresAt,
    metadataUri,
  }) {
    const metadataBytes = new TextEncoder().encode(metadataUri);
    const data = new Uint8Array(8 + 2 + 8 + 8 + 4 + metadataBytes.length);
    const view = new DataView(data.buffer);
    let offset = 0;

    // 8-byte Anchor discriminator is written separately.
    offset += 8;

    view.setUint16(offset, pixelId, true);
    offset += 2;

    view.setBigUint64(offset, BigInt(priceLamports), true);
    offset += 8;

    view.setBigInt64(offset, BigInt(leaseExpiresAt), true);
    offset += 8;

    view.setUint32(offset, metadataBytes.length, true);
    offset += 4;

    data.set(metadataBytes, offset);
    return data;
  }

  async function claimPixelOnSolana({ pixelId, username, imageUrl }) {
    const provider = getWalletProvider();
    if (
      !isSupportedWalletProvider(provider) ||
      !provider.publicKey ||
      !currentWalletPublicKey
    ) {
      throw new Error("WALLET_NOT_CONNECTED");
    }
    if (!hasValidProgramId()) {
      throw new Error("PROGRAM_NOT_CONFIGURED");
    }

    const owner = provider.publicKey;
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const boardPda = getBoardPda(programId);
    const pixelIdBuffer = new Uint8Array(2);
    new DataView(pixelIdBuffer.buffer).setUint16(0, pixelId, true);
    const [pixelPda] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("pixel"), pixelIdBuffer],
      programId,
    );
    const [ownerIndexPda] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("owner"), owner.toBuffer()],
      programId,
    );

    await ensureBoardInitializedOnSolana();
    const boardInfo = await solanaConnection.getAccountInfo(
      boardPda,
      "confirmed",
    );
    if (!boardInfo) {
      throw new Error("BOARD_NOT_INITIALIZED");
    }

    const priceLamports = 0;
    const leaseExpiresAt = 0;
    const metadataUri = await createMetadataUri({
      pixelId,
      username,
      imageUrl,
      ownerWallet: currentWalletPublicKey,
    });
    if (metadataUri.length > 256) {
      throw new Error("METADATA_URI_TOO_LARGE");
    }
    const discriminator =
      await getAnchorInstructionDiscriminator("claim_pixel");
    const instructionData = encodeClaimPixelArgs({
      pixelId,
      priceLamports,
      leaseExpiresAt,
      metadataUri,
    });
    instructionData.set(discriminator, 0);

    const ix = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: boardPda, isSigner: false, isWritable: false },
        { pubkey: pixelPda, isSigner: false, isWritable: true },
        { pubkey: ownerIndexPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: instructionData,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = owner;
    const { blockhash, lastValidBlockHeight } =
      await solanaConnection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;

    const signedTx = await provider.signTransaction(tx);
    const signature = await solanaConnection.sendRawTransaction(
      signedTx.serialize(),
      {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 5,
      },
    );
    await confirmSignatureWithRecovery(
      signature,
      blockhash,
      lastValidBlockHeight,
    );

    return {
      pixelId,
      username,
      imageUrl,
      metadataUri,
      wallet: currentWalletPublicKey,
      signature,
    };
  }

  function isConnectedAdminWallet() {
    return Boolean(
      currentWalletPublicKey &&
      ADMIN_WALLET_PUBLIC_KEY &&
      currentWalletPublicKey === ADMIN_WALLET_PUBLIC_KEY,
    );
  }

  function getBoardPda(programId) {
    return PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("board")],
      programId,
    )[0];
  }

  async function ensureBoardInitializedOnSolana() {
    if (!hasValidProgramId()) return false;
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const boardPda = getBoardPda(programId);
    const existing = await solanaConnection.getAccountInfo(
      boardPda,
      "confirmed",
    );
    if (existing) return true;
    if (!isConnectedAdminWallet()) return false;
    await initializeBoardOnSolana(BOARD_TOTAL_PIXELS);
    return true;
  }

  async function tryAutoInitializeBoardForAdmin() {
    if (!walletStatus || !isConnectedAdminWallet()) {
      return;
    }
    if (!hasValidProgramId()) return;
    try {
      const programId = new PublicKey(SOLANA_PROGRAM_ID);
      const boardPda = getBoardPda(programId);
      const existing = await solanaConnection.getAccountInfo(
        boardPda,
        "confirmed",
      );
      if (existing) return;

      const previous = walletStatus.textContent;
      walletStatus.textContent = "Initializing board (admin)...";
      const result = await initializeBoardOnSolana(BOARD_TOTAL_PIXELS);
      if (result.alreadyInitialized) {
        walletStatus.textContent = "Board already initialized.";
      } else {
        const shortSig = `${result.signature.slice(0, 8)}...${result.signature.slice(-8)}`;
        walletStatus.textContent = `Board initialized. Tx: ${shortSig}`;
      }
      await refreshClaimedPixels();
      setTimeout(() => {
        if (walletStatus.textContent !== previous) updateWalletUI();
      }, 3500);
    } catch (error) {
      console.error("Auto board init error:", error);
    }
  }

  async function initializeBoardOnSolana(totalPixels = 512) {
    const provider = getWalletProvider();
    if (
      !isSupportedWalletProvider(provider) ||
      !provider.publicKey ||
      !currentWalletPublicKey
    ) {
      throw new Error("WALLET_NOT_CONNECTED");
    }
    if (!hasValidProgramId()) {
      throw new Error("PROGRAM_NOT_CONFIGURED");
    }

    const owner = provider.publicKey;
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const boardPda = getBoardPda(programId);
    const existing = await solanaConnection.getAccountInfo(
      boardPda,
      "confirmed",
    );
    if (existing) return { alreadyInitialized: true };

    const discriminator =
      await getAnchorInstructionDiscriminator("initialize_board");
    const data = new Uint8Array(8 + 2);
    data.set(discriminator, 0);
    new DataView(data.buffer).setUint16(8, totalPixels, true);

    const ix = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: boardPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = owner;
    const { blockhash, lastValidBlockHeight } =
      await solanaConnection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;

    const signedTx = await provider.signTransaction(tx);
    const signature = await solanaConnection.sendRawTransaction(
      signedTx.serialize(),
      {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 5,
      },
    );
    await confirmSignatureWithRecovery(
      signature,
      blockhash,
      lastValidBlockHeight,
    );

    return { alreadyInitialized: false, signature };
  }

  async function confirmSignatureWithRecovery(
    signature,
    blockhash,
    lastValidBlockHeight,
  ) {
    try {
      await solanaConnection.confirmTransaction(
        {
          blockhash,
          lastValidBlockHeight,
          signature,
        },
        "confirmed",
      );
      return;
    } catch (error) {
      const message = String(error?.message || "");
      if (!message.includes("block height exceeded")) throw error;

      const statusResp = await solanaConnection.getSignatureStatuses(
        [signature],
        { searchTransactionHistory: true },
      );
      const status = statusResp?.value?.[0];
      if (status && !status.err && status.confirmationStatus) return;

      throw new Error("TX_EXPIRED_BEFORE_CONFIRMATION");
    }
  }

  // CLASS FOR EACH PARTICLE
  class Particle {
    constructor(effect, x, y, size, id) {
      this.effect = effect;
      this.id = id;
      this.originX = x;
      this.originY = y;
      this.x = this.originX;
      this.y = this.originY;
      this.color = "#ffffff";
      this.size = size;
      this.ease = 0.4;
      this.profile = null;
      this.profileImage = null;
      this.profileLoadVersion = 0;
    }
    draw(context) {
      if (this.profile?.locked) {
        context.save();
        context.fillStyle = "rgba(255, 255, 255, 0.18)";
        context.beginPath();
        context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "rgba(109, 69, 255, 0.95)";
        context.lineWidth = Math.max(1, this.size * 0.35);
        context.stroke();
        context.fillStyle = "#ffffff";
        context.font = `${Math.max(7, this.size * 1.35)}px "Space Grotesk", sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("P", this.x, this.y + 0.5);
        context.restore();
        return;
      }
      if (this.profileImage) {
        context.save();
        context.beginPath();
        context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        context.clip();
        context.drawImage(
          this.profileImage,
          this.x - this.size,
          this.y - this.size,
          this.size * 2,
          this.size * 2,
        );
        context.restore();
        return;
      }
      context.fillStyle = this.color;
      context.beginPath();
      context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      context.fill();
    }
    update() {
      this.x += (this.originX - this.x) * this.ease;
      this.y += (this.originY - this.y) * this.ease;
    }
  }

  // CLASS FOR ALL PARTICLE
  class Effect {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.particleArray = [];
      this.image = document.getElementById("image");
      this.baseParticleSize = 3.5;
      this.minParticleSize = 0.25;
      this.particleSize = this.baseParticleSize;
      this.maxParticles = 512;
      this.normalizedShapePoints = this.getNormalizedShapePoints();
      this.updateLayout();
    }

    updateLayout() {
      this.centerX = this.width * 0.5;
      this.centerY = this.height * 0.5;

      const imageWidth = this.image.naturalWidth || this.image.width;
      const imageHeight = this.image.naturalHeight || this.image.height;
      const maxRenderWidth = this.width;
      const maxRenderHeight = this.height;
      const scale = Math.min(
        maxRenderWidth / imageWidth,
        maxRenderHeight / imageHeight,
        1,
      );

      this.renderWidth = Math.floor(imageWidth * scale);
      this.renderHeight = Math.floor(imageHeight * scale);
      this.x = Math.floor(this.centerX - this.renderWidth * 0.5);
      this.y = Math.floor(this.centerY - this.renderHeight * 0.5);
    }

    getNormalizedShapePoints() {
      const sourceWidth = this.image.naturalWidth || this.image.width;
      const sourceHeight = this.image.naturalHeight || this.image.height;
      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = sourceWidth;
      offscreenCanvas.height = sourceHeight;
      const offscreenCtx = offscreenCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      offscreenCtx.drawImage(this.image, 0, 0, sourceWidth, sourceHeight);

      const data = offscreenCtx.getImageData(
        0,
        0,
        sourceWidth,
        sourceHeight,
      ).data;
      const candidates = [];

      const getColorAt = (x, y) => {
        const index = (y * sourceWidth + x) * 4;
        return [data[index], data[index + 1], data[index + 2]];
      };
      const topLeft = getColorAt(0, 0);
      const topRight = getColorAt(sourceWidth - 1, 0);
      const bottomLeft = getColorAt(0, sourceHeight - 1);
      const bottomRight = getColorAt(sourceWidth - 1, sourceHeight - 1);
      const bgColor = [
        Math.floor(
          (topLeft[0] + topRight[0] + bottomLeft[0] + bottomRight[0]) / 4,
        ),
        Math.floor(
          (topLeft[1] + topRight[1] + bottomLeft[1] + bottomRight[1]) / 4,
        ),
        Math.floor(
          (topLeft[2] + topRight[2] + bottomLeft[2] + bottomRight[2]) / 4,
        ),
      ];

      const colorDistance = (r, g, b, bg) => {
        const dr = r - bg[0];
        const dg = g - bg[1];
        const db = b - bg[2];
        return Math.sqrt(dr * dr + dg * dg + db * db);
      };

      for (let y = 0; y < sourceHeight; y++) {
        for (let x = 0; x < sourceWidth; x++) {
          const index = (y * sourceWidth + x) * 4;
          const alpha = data[index + 3];
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          if (alpha > 40 && colorDistance(red, green, blue, bgColor) > 35) {
            candidates.push({ x, y });
          }
        }
      }

      if (candidates.length < this.maxParticles) {
        candidates.length = 0;
        for (let y = 0; y < sourceHeight; y++) {
          for (let x = 0; x < sourceWidth; x++) {
            const index = (y * sourceWidth + x) * 4;
            if (data[index + 3] > 40) candidates.push({ x, y });
          }
        }
      }

      if (candidates.length === 0) return [];

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < candidates.length; i++) {
        const p = candidates[i];
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const boxWidth = Math.max(1, maxX - minX);
      const boxHeight = Math.max(1, maxY - minY);

      const normalized = candidates.map((p) => ({
        nx: (p.x - minX) / boxWidth,
        ny: (p.y - minY) / boxHeight,
      }));

      // Reduce very large pools first, then run farthest-point sampling
      // to maximize spacing and avoid overlap.
      let pool = normalized;
      const maxPoolSize = 30000;
      if (pool.length > maxPoolSize) {
        const stride = Math.ceil(pool.length / maxPoolSize);
        const reduced = [];
        for (let i = 0; i < pool.length; i += stride) reduced.push(pool[i]);
        pool = reduced;
      }

      if (pool.length <= this.maxParticles) {
        const padded = [];
        for (let i = 0; i < this.maxParticles; i++) {
          padded.push(pool[i % pool.length]);
        }
        return padded;
      }

      const selected = [];
      const selectedMask = new Array(pool.length).fill(false);
      const minDistSq = new Array(pool.length).fill(Infinity);

      selected.push(pool[0]);
      selectedMask[0] = true;

      while (
        selected.length < this.maxParticles &&
        selected.length < pool.length
      ) {
        const last = selected[selected.length - 1];

        for (let i = 0; i < pool.length; i++) {
          if (selectedMask[i]) continue;
          const dx = pool[i].nx - last.nx;
          const dy = pool[i].ny - last.ny;
          const d2 = dx * dx + dy * dy;
          if (d2 < minDistSq[i]) minDistSq[i] = d2;
        }

        let bestIndex = -1;
        let bestScore = -1;
        for (let i = 0; i < pool.length; i++) {
          if (selectedMask[i]) continue;
          if (minDistSq[i] > bestScore) {
            bestScore = minDistSq[i];
            bestIndex = i;
          }
        }

        if (bestIndex === -1) break;
        selectedMask[bestIndex] = true;
        selected.push(pool[bestIndex]);
      }

      // Safety fill to keep fixed count deterministic.
      if (selected.length < this.maxParticles) {
        const step = pool.length / (this.maxParticles - selected.length);
        for (let i = 0; selected.length < this.maxParticles; i++) {
          selected.push(pool[Math.floor((i * step) % pool.length)]);
        }
      }
      return selected;
    }

    init(context) {
      this.particleArray = [];
      if (this.normalizedShapePoints.length === 0) {
        context.clearRect(0, 0, this.width, this.height);
        console.log("[particles] generated: 0 | size: 0");
        return;
      }

      const count = this.maxParticles;
      const aspectRatio = this.renderWidth / Math.max(1, this.renderHeight);
      const cols = Math.max(1, Math.round(Math.sqrt(count * aspectRatio)));
      const rows = Math.max(1, Math.ceil(count / cols));
      const cellWidth = this.renderWidth / cols;
      const cellHeight = this.renderHeight / rows;
      const spacingReference = Math.min(cellWidth, cellHeight);
      const fittedSize = spacingReference * 0.46;
      this.particleSize = Math.max(
        this.minParticleSize,
        Math.min(this.baseParticleSize, fittedSize),
      );

      for (let i = 0; i < count; i++) {
        const p = this.normalizedShapePoints[i];
        const x = this.x + p.nx * (this.renderWidth - 1);
        const y = this.y + p.ny * (this.renderHeight - 1);
        this.particleArray.push(new Particle(this, x, y, this.particleSize, i));
      }

      context.clearRect(0, 0, this.width, this.height);
      console.log(
        `[particles] generated: ${this.particleArray.length} | size: ${this.particleSize}`,
      );
    }

    applyStoredProfiles() {
      for (let i = 0; i < this.particleArray.length; i++) {
        const particle = this.particleArray[i];
        particle.profileLoadVersion += 1;
        particle.profile = null;
        particle.profileImage = null;
        const stored = particleProfiles[String(particle.id)];
        if (stored) this.applyProfileToParticle(particle, stored);
      }
    }

    applyProfileToParticle(particle, profile) {
      particle.profile = profile;
      const expectedVersion = particle.profileLoadVersion;
      const expectedImageUrl = profile.imageUrl;
      loadImage(profile.imageUrl)
        .then((img) => {
          if (particle.profileLoadVersion !== expectedVersion) return;
          if (
            !particle.profile ||
            particle.profile.imageUrl !== expectedImageUrl
          )
            return;
          particle.profileImage = img;
        })
        .catch(() => {
          if (particle.profileLoadVersion !== expectedVersion) return;
          particle.profileImage = null;
        });
    }

    draw(context) {
      this.particleArray.forEach((particle) => particle.draw(context));
    }

    update() {
      this.particleArray.forEach((particle) => particle.update());
    }

    // Add a resize method to handle window resizing more cleanly
    resize(width, height) {
      this.width = width;
      this.height = height;
      this.updateLayout();

      // Reset particles
      this.particleArray = [];
    }

    getParticleAt(x, y) {
      for (let i = this.particleArray.length - 1; i >= 0; i--) {
        const particle = this.particleArray[i];
        const dx = x - particle.x;
        const dy = y - particle.y;
        if (dx * dx + dy * dy <= particle.size * particle.size) {
          return particle;
        }
      }
      return null;
    }
  }

  // CALLING THE EFFECT
  let effect;
  function rebuildEffect() {
    effect = new Effect(canvas.width, canvas.height);
    effect.init(ctx);
    effect.applyStoredProfiles();
  }
  rebuildEffect();

  // ANIMATION
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    effect.draw(ctx);
    effect.update();
    requestAnimationFrame(animate);
  }

  animate();

  function openModalForParticle(particle) {
    if (!modal || !particle) return;

    activeParticle = particle;
    pendingProfile = null;
    const owned = isClaimedProfile(particle.profile);
    const currentUserId = getCurrentUserId();
    const alreadyOwnedParticleId = findClaimedParticleIdByUser(currentUserId);
    const walletRequired = !currentWalletPublicKey;
    const blockedBySingleClaim =
      Boolean(alreadyOwnedParticleId) && alreadyOwnedParticleId !== particle.id;
    if (particleInfo) {
      particleInfo.textContent = `Pixel #${particle.id}`;
    }
    if (ownerProfileLink) {
      ownerProfileLink.style.display = "none";
      ownerProfileLink.removeAttribute("href");
      ownerProfileLink.textContent = "";
      if (particle.profile?.username) {
        const username = normalizeUsername(particle.profile.username);
        ownerProfileLink.href = `https://x.com/${encodeURIComponent(username)}`;
        ownerProfileLink.textContent = `@${username}`;
        ownerProfileLink.style.display = "inline-block";
      }
    }
    if (fetchStatus) {
      if (owned) {
        if (particle.profile?.username) {
          fetchStatus.textContent = `Already owned by @${particle.profile.username}`;
        } else if (particle.profile?.locked) {
          fetchStatus.textContent =
            "This pixel is private. Access is required to view owner details.";
          showToast(
            "Pixel is private. Access is required to unlock details.",
            "error",
          );
        } else {
          fetchStatus.textContent = "This pixel has already been claimed.";
        }
      } else if (blockedBySingleClaim) {
        fetchStatus.textContent = `You already claimed pixel #${alreadyOwnedParticleId}. One pixel per user.`;
      } else if (walletRequired) {
        fetchStatus.textContent =
          "Connect your Solana wallet to claim this pixel.";
      } else {
        fetchStatus.textContent = "";
      }
    }
    if (usernameInput) {
      usernameInput.value = particle.profile?.username || "";
      usernameInput.disabled = owned || blockedBySingleClaim || walletRequired;
    }
    if (profilePreview) {
      if (particle.profile?.imageUrl) {
        profilePreview.src = particle.profile.imageUrl;
        profilePreview.style.display = "block";
      } else {
        profilePreview.removeAttribute("src");
        profilePreview.style.display = "none";
      }
    }
    if (addBtn) {
      addBtn.disabled = true;
    }
    if (fetchBtn) {
      fetchBtn.disabled = owned || blockedBySingleClaim || walletRequired;
      fetchBtn.textContent = owned ? "Owned" : "Fetch Profile";
    }

    modal.style.display = "flex";
  }

  function closeModal() {
    if (!modal) return;
    modal.style.display = "none";
    if (fetchBtn) {
      fetchBtn.disabled = false;
      fetchBtn.textContent = "Fetch Profile";
    }
    if (usernameInput) usernameInput.disabled = false;
    if (ownerProfileLink) {
      ownerProfileLink.style.display = "none";
      ownerProfileLink.removeAttribute("href");
      ownerProfileLink.textContent = "";
    }
    activeParticle = null;
    pendingProfile = null;
  }

  async function handleFetchProfile(event) {
    event.preventDefault();
    if (!activeParticle || !usernameInput || !fetchBtn || !fetchStatus) return;
    if (isClaimedProfile(activeParticle.profile)) {
      if (activeParticle.profile?.username) {
        showActionFeedback(
          `Already owned by @${activeParticle.profile.username}`,
          "error",
        );
      } else {
        showActionFeedback(
          "This pixel is private and already claimed.",
          "error",
        );
      }
      return;
    }
    if (!currentWalletPublicKey) {
      showActionFeedback("Connect your Solana wallet first.", "error");
      if (addBtn) addBtn.disabled = true;
      return;
    }
    const currentUserId = getCurrentUserId();
    const alreadyOwnedParticleId = findClaimedParticleIdByUser(currentUserId);
    if (
      alreadyOwnedParticleId &&
      Number(alreadyOwnedParticleId) !== Number(activeParticle.id)
    ) {
      showActionFeedback(
        `You already claimed pixel #${alreadyOwnedParticleId}. One pixel per user.`,
        "error",
      );
      if (addBtn) addBtn.disabled = true;
      return;
    }
    const username = normalizeUsername(usernameInput.value);
    if (!username) {
      showActionFeedback("Enter a valid X username.", "error");
      return;
    }

    await refreshClaimedPixels();
    const claimedPixelIdForUsername = findClaimedPixelIdByUsername(username);
    if (
      claimedPixelIdForUsername &&
      Number(claimedPixelIdForUsername) !== Number(activeParticle.id)
    ) {
      showActionFeedback(
        `@${username} is already claimed on pixel #${claimedPixelIdForUsername}.`,
        "error",
      );
      pendingProfile = null;
      if (addBtn) addBtn.disabled = true;
      return;
    }
    fetchBtn.disabled = true;
    fetchBtn.textContent = "Loading...";
    fetchStatus.textContent = "Fetching profile image...";

    try {
      const imageUrl = await resolveProfileImage(username);
      pendingProfile = { username, imageUrl };
      if (profilePreview) {
        profilePreview.src = imageUrl;
        profilePreview.style.display = "block";
      }
      if (ownerProfileLink) {
        ownerProfileLink.href = `https://x.com/${encodeURIComponent(username)}`;
        ownerProfileLink.textContent = `@${username}`;
        ownerProfileLink.style.display = "inline-block";
      }
      fetchStatus.textContent = `Fetched @${username}.`;
      if (addBtn) addBtn.disabled = false;
    } catch {
      pendingProfile = null;
      if (profilePreview) {
        profilePreview.removeAttribute("src");
        profilePreview.style.display = "none";
      }
      fetchStatus.textContent = "Could not fetch that profile image.";
      if (addBtn) addBtn.disabled = true;
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.textContent = "Fetch Profile";
    }
  }

  function handleAddProfile() {
    if (!activeParticle || !pendingProfile || !fetchStatus) return;
    if (isClaimedProfile(activeParticle.profile)) {
      if (fetchStatus) {
        if (activeParticle.profile?.username) {
          showActionFeedback(
            `Already owned by @${activeParticle.profile.username}`,
            "error",
          );
        } else {
          showActionFeedback("This pixel has already been claimed.", "error");
        }
      }
      return;
    }

    if (!currentWalletPublicKey) {
      showActionFeedback("Connect your Solana wallet first.", "error");
      addBtn.disabled = true;
      return;
    }
    const currentUserId = getCurrentUserId();
    const alreadyOwnedParticleId = findClaimedParticleIdByUser(currentUserId);
    if (
      alreadyOwnedParticleId &&
      Number(alreadyOwnedParticleId) !== Number(activeParticle.id)
    ) {
      showActionFeedback(
        `You already claimed pixel #${alreadyOwnedParticleId}. One pixel per user.`,
        "error",
      );
      addBtn.disabled = true;
      return;
    }
    const run = async () => {
      addBtn.disabled = true;
      fetchStatus.textContent = "Claiming pixel...";

      await refreshClaimedPixels();
      const claimedPixelIdForUsername = findClaimedPixelIdByUsername(
        pendingProfile.username,
      );
      if (
        claimedPixelIdForUsername &&
        Number(claimedPixelIdForUsername) !== Number(activeParticle.id)
      ) {
        showActionFeedback(
          `@${pendingProfile.username} is already claimed on pixel #${claimedPixelIdForUsername}.`,
          "error",
        );
        addBtn.disabled = true;
        return;
      }

      try {
        const result = await claimPixelOnSolana({
          pixelId: Number(activeParticle.id),
          username: pendingProfile.username,
          imageUrl: pendingProfile.imageUrl,
        });
        await refreshClaimedPixels();
        const shortSig = `${result.signature.slice(0, 8)}...${result.signature.slice(-8)}`;
        fetchStatus.textContent = `Claimed on Solana. Tx: ${shortSig}`;
        showToast(
          `Added @${pendingProfile.username} to Pixel #${activeParticle.id}. Tx ${shortSig}`,
          "success",
        );
        closeModal();
      } catch (error) {
        const message = String(error?.message || "");
        const lowerMessage = message.toLowerCase();
        console.error("Solana claim error:", error);
        if (message.includes("WALLET_NOT_CONNECTED")) {
          showActionFeedback("Connect your Solana wallet first.", "error");
        } else if (message.includes("PROGRAM_NOT_CONFIGURED")) {
          showActionFeedback(
            "Set SOLANA_PROGRAM_ID in script.js to enable on-chain claims.",
            "error",
          );
        } else if (message.includes("BOARD_NOT_INITIALIZED")) {
          showActionFeedback(
            "Program board is not initialized on this network yet.",
            "error",
          );
        } else if (message.includes("METADATA_URI_TOO_LARGE")) {
          showActionFeedback(
            "Metadata is too large for on-chain string limit. Set PINATA_JWT to store metadata on IPFS.",
            "error",
          );
        } else if (message.includes("METADATA_KEY_MISSING")) {
          showActionFeedback(
            "Encryption key missing. Set APP_CONFIG.metadataEncryptionKey.",
            "error",
          );
        } else if (
          message.includes("Invalid pixel id") ||
          message.includes("InstructionFallbackNotFound")
        ) {
          showActionFeedback(
            "Program call failed. Confirm your deployed program matches the current Rust code.",
            "error",
          );
        } else if (message.includes("Pinata upload failed")) {
          showActionFeedback(
            "IPFS upload failed. Set a valid PINATA_JWT or use data-URI fallback.",
            "error",
          );
        } else if (
          message.includes("User rejected") ||
          message.includes("denied") ||
          message.includes("rejected")
        ) {
          showActionFeedback("Transaction cancelled in wallet.", "error");
        } else if (
          lowerMessage.includes("attempt to load a program that does not exist")
        ) {
          showActionFeedback(
            "Program not found on Devnet. Confirm program deployment and wallet network.",
            "error",
          );
        } else if (
          lowerMessage.includes("blockhash not found") ||
          lowerMessage.includes("transaction simulation failed")
        ) {
          showActionFeedback(
            "Transaction failed on RPC. Ensure your wallet is on Devnet and the program is deployed.",
            "error",
          );
        } else if (message.includes("TX_EXPIRED_BEFORE_CONFIRMATION")) {
          showActionFeedback(
            "Transaction expired before confirmation. Approve quickly and retry.",
            "error",
          );
        } else {
          showActionFeedback(
            `Solana claim failed: ${message || "Unknown error."}`,
            "error",
          );
        }
      } finally {
        addBtn.disabled = false;
      }
    };
    run();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const clickedParticle = effect.getParticleAt(x, y);
    if (clickedParticle) openModalForParticle(clickedParticle);
  });

  if (closeModalButton) {
    closeModalButton.addEventListener("click", closeModal);
  }
  if (connectWalletBtn) {
    connectWalletBtn.addEventListener("click", connectWallet);
  }
  if (disconnectWalletBtn) {
    disconnectWalletBtn.addEventListener("click", disconnectWallet);
  }
  if (profileForm) {
    profileForm.addEventListener("submit", handleFetchProfile);
  }
  if (addBtn) {
    addBtn.addEventListener("click", handleAddProfile);
  }
  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });
  }
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  hydratePixelProfilesFromCache();
  refreshClaimedPixels().catch((error) => {
    console.error("Failed to fetch Solana pixels:", error.message || error);
  });
  refreshArciumStatus().catch(() => {});
  arciumStatusIntervalId = window.setInterval(() => {
    refreshArciumStatus().catch(() => {});
  }, 30000);

  setWalletProviderPreference(readWalletProviderPreference());
  updateWalletProviderDropdownUI();

  if (walletProviderToggle && walletProviderMenu) {
    walletProviderToggle.addEventListener("click", () => {
      const isOpen = walletProviderMenu.classList.contains("open");
      if (isOpen) {
        closeWalletProviderMenu();
      } else {
        openWalletProviderMenu();
      }
    });

    walletProviderMenu.addEventListener("click", (event) => {
      const button = event.target.closest(".wallet-provider-item");
      if (!button || !walletProviderSelect) return;
      walletProviderSelect.value = button.dataset.value || "auto";
      walletProviderSelect.dispatchEvent(
        new Event("change", { bubbles: true }),
      );
      closeWalletProviderMenu();
    });

    document.addEventListener("click", (event) => {
      const insideWalletToggle = walletProviderToggle.contains(event.target);
      const insideWalletMenu = walletProviderMenu.contains(event.target);
      if (!insideWalletToggle && !insideWalletMenu) closeWalletProviderMenu();
    });
  }

  if (walletProviderSelect) {
    walletProviderSelect.addEventListener("change", async (event) => {
      const previousProvider = getWalletProvider();
      const nextValue = event.target?.value || "auto";
      setWalletProviderPreference(nextValue);

      if (
        isSupportedWalletProvider(previousProvider) &&
        previousProvider.isConnected
      ) {
        try {
          await previousProvider.disconnect();
        } catch {
          // no-op
        }
      }
      currentWalletPublicKey = null;
      activeWalletEventProvider = null;
      bindWalletProviderEvents();
    });
  }

  bindWalletProviderEvents();

  // Optional cache backup helper (browser console):
  // window.arciumPixelsCache.export() -> JSON snapshot
  window.arciumPixelsCache = {
    export() {
      const raw = localStorage.getItem(getPixelCacheStorageKey());
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
  };
  window.arciumPixels = {
    refreshBoard: forceRefreshClaimedPixels,
  };

  // Optimized resize handler
  let resizeTimeout;
  window.addEventListener("resize", () => {
    // Debounce resize to prevent too many recalculations
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      setCanvasSize();

      // Completely rebuild particles/effect on resize for stable positioning.
      rebuildEffect();
    }, 100);
  });
  window.addEventListener("beforeunload", () => {
    if (arciumStatusIntervalId) clearInterval(arciumStatusIntervalId);
    if (toastHideTimeout) clearTimeout(toastHideTimeout);
  });
});
