import { getCloudflareContext } from '@opennextjs/cloudflare';

// Безопасность: дёргаем урл вида /upload/admin/purge?token=... (секрет в env)
export async function GET(req) {
  const { env } = getCloudflareContext();

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!env.PURGE_TOKEN || token !== env.PURGE_TOKEN) {
    return new Response('Forbidden', { status: 403 });
  }

  const SUPABASE_URL = env.SUPABASE_URL;
  const SERVICE_KEY  = env.SUPABASE_SERVICE_KEY;
  const BUCKET       = env.SUPABASE_BUCKET || 'passports';
  const PREFIX       = 'passports/';          // мы кладём файлы в эту «папку»
  const MAX_DAYS     = Number(env.MAX_FILE_AGE_DAYS || 30);

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY', { status: 500 });
  }

  const cutoff = Date.now() - MAX_DAYS * 24 * 60 * 60 * 1000;

  let offset = 0, limit = 100, totalChecked = 0, totalDeleted = 0, done = false, errors = [];

  async function listBatch(off) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${encodeURIComponent(BUCKET)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prefix: PREFIX, // листим только нашу «папку»
        limit,
        offset: off,
        sortBy: { column: 'updated_at', order: 'asc' }
      })
    });
    if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`);
    return res.json(); // массив объектов
  }

  while (!done) {
    let batch = [];
    try {
      batch = await listBatch(offset);
    } catch (e) {
      errors.push(String(e));
      break;
    }

    if (!Array.isArray(batch) || batch.length === 0) {
      done = true;
      break;
    }

    for (const obj of batch) {
      // obj.name — имя файла, obj.updated_at/created_at — строки дат
      const path = obj.name?.startsWith(PREFIX) ? obj.name : `${PREFIX}${obj.name}`;
      const ts = Date.parse(obj.updated_at || obj.created_at || 0);
      totalChecked++;
      if (!isNaN(ts) && ts < cutoff) {
        const del = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${encodeURIComponent(path)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY }
        });
        if (del.ok) totalDeleted++;
        else errors.push(`del ${path}: ${del.status} ${await del.text()}`);
      }
    }

    offset += batch.length;
    if (batch.length < limit) done = true;
  }

  return Response.json({
    ok: true,
    checked: totalChecked,
    deleted: totalDeleted,
    keepDays: MAX_DAYS,
    errors
  });
}
