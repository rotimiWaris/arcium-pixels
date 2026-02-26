import pg from "pg";

const { Pool } = pg;

export function createDbPool(connectionString, options = {}) {
  return new Pool({
    connectionString,
    ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });
}

export async function upsertPixel(pool, pixel) {
  const query = `
    insert into public.pixels (
      pixel_id, owner, username, image_url, metadata_uri, claimed_at, slot, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, now())
    on conflict (pixel_id) do update
      set owner = excluded.owner,
          username = excluded.username,
          image_url = excluded.image_url,
          metadata_uri = excluded.metadata_uri,
          claimed_at = excluded.claimed_at,
          slot = excluded.slot,
          updated_at = now()
  `;
  const values = [
    pixel.pixelId,
    pixel.owner,
    pixel.username,
    pixel.imageUrl,
    pixel.metadataUri,
    pixel.claimedAtIso,
    pixel.slot,
  ];
  await pool.query(query, values);
}

export async function setSyncState(pool, state) {
  const query = `
    insert into public.sync_state (key, last_slot, last_synced_at, notes)
    values ('pixels', $1, now(), $2)
    on conflict (key) do update
      set last_slot = excluded.last_slot,
          last_synced_at = excluded.last_synced_at,
          notes = excluded.notes
  `;
  await pool.query(query, [state.lastSlot, state.notes || null]);
}

export async function listPixels(pool) {
  const query = `
    select pixel_id, owner, username, image_url, metadata_uri, claimed_at, slot, updated_at
    from public.pixels
    order by pixel_id asc
  `;
  const { rows } = await pool.query(query);
  return rows;
}

export async function getPixelById(pool, pixelId) {
  const query = `
    select pixel_id, owner, username, image_url, metadata_uri, claimed_at, slot, updated_at
    from public.pixels
    where pixel_id = $1
    limit 1
  `;
  const { rows } = await pool.query(query, [pixelId]);
  return rows[0] || null;
}

export async function getSyncState(pool) {
  const query = `
    select key, last_slot, last_synced_at, notes
    from public.sync_state
    where key = 'pixels'
    limit 1
  `;
  const { rows } = await pool.query(query);
  return rows[0] || null;
}

export async function upsertPixelPolicy(pool, pixelId, policyCiphertext, updatedBy) {
  const query = `
    insert into public.pixel_policies (pixel_id, policy_ciphertext, updated_by, updated_at)
    values ($1, $2, $3, now())
    on conflict (pixel_id) do update
      set policy_ciphertext = excluded.policy_ciphertext,
          updated_by = excluded.updated_by,
          updated_at = now()
  `;
  await pool.query(query, [pixelId, policyCiphertext, updatedBy || null]);
}

export async function getPixelPolicy(pool, pixelId) {
  const query = `
    select pixel_id, policy_ciphertext, updated_by, updated_at
    from public.pixel_policies
    where pixel_id = $1
    limit 1
  `;
  const { rows } = await pool.query(query, [pixelId]);
  return rows[0] || null;
}

export async function listPixelPolicies(pool, pixelIds) {
  if (!Array.isArray(pixelIds) || pixelIds.length === 0) return [];
  const query = `
    select pixel_id, policy_ciphertext, updated_by, updated_at
    from public.pixel_policies
    where pixel_id = any($1::int[])
  `;
  const { rows } = await pool.query(query, [pixelIds]);
  return rows;
}

export async function upsertAccessGrant(
  pool,
  { pixelId, viewerId, grantedUntilIso, grantedBy, paymentRef },
) {
  const query = `
    insert into public.pixel_access_grants (
      pixel_id, viewer_id, granted_until, granted_by, payment_ref, created_at
    ) values ($1, $2, $3, $4, $5, now())
    on conflict (pixel_id, viewer_id) do update
      set granted_until = excluded.granted_until,
          granted_by = excluded.granted_by,
          payment_ref = excluded.payment_ref
  `;
  await pool.query(query, [
    pixelId,
    viewerId,
    grantedUntilIso,
    grantedBy || null,
    paymentRef || null,
  ]);
}

export async function hasActiveAccessGrant(pool, pixelId, viewerId) {
  const query = `
    select 1
    from public.pixel_access_grants
    where pixel_id = $1
      and viewer_id = $2
      and granted_until > now()
    limit 1
  `;
  const { rows } = await pool.query(query, [pixelId, viewerId]);
  return rows.length > 0;
}

export async function listActiveGrantsForViewer(pool, viewerId) {
  const query = `
    select pixel_id
    from public.pixel_access_grants
    where viewer_id = $1
      and granted_until > now()
  `;
  const { rows } = await pool.query(query, [viewerId]);
  return rows.map((row) => Number(row.pixel_id)).filter(Number.isFinite);
}
