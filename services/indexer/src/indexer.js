import { resolveMetadataUri, fetchProgramPixelAccounts } from "./solana.js";
import { setSyncState, upsertPixel } from "./db.js";

function toClaimedAtIso(unixSeconds) {
  if (!unixSeconds || Number.isNaN(unixSeconds)) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

export async function syncPixelsOnce({ connection, programId, pool }) {
  const slot = await connection.getSlot("confirmed");
  const accounts = await fetchProgramPixelAccounts(connection, programId);
  const prepared = [];
  const activePixelIds = [];
  let written = 0;

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    if (!account || !account.pixelId) continue;
    if (account.owner === "11111111111111111111111111111111") continue;

    const metadata = await resolveMetadataUri(
      account.metadataUri,
      process.env.METADATA_ENCRYPTION_KEY || "",
    );
    const username = metadata?.username || metadata?.u || "";
    const imageUrl = metadata?.image_url || metadata?.i || "";
    prepared.push({
      pixelId: account.pixelId,
      owner: account.owner,
      username,
      imageUrl,
      metadataUri: account.metadataUri,
      claimedAtIso: toClaimedAtIso(account.claimedAt),
      slot,
    });
  }

  prepared.sort((a, b) => a.pixelId - b.pixelId);
  const seenUsernames = new Set();
  for (let i = 0; i < prepared.length; i++) {
    const row = prepared[i];
    const normalized = String(row.username || "").trim().toLowerCase();
    if (normalized) {
      if (seenUsernames.has(normalized)) {
        continue;
      }
      seenUsernames.add(normalized);
    }
    await upsertPixel(pool, row);
    activePixelIds.push(row.pixelId);
    written += 1;
  }

  if (activePixelIds.length > 0) {
    await pool.query(
      "delete from public.pixels where not (pixel_id = any($1::int[]))",
      [activePixelIds],
    );
  } else {
    await pool.query("delete from public.pixels");
  }

  await setSyncState(pool, {
    lastSlot: slot,
    notes: `Synced ${written} claimed pixels (deduped by username)`,
  });

  return { written, slot };
}
