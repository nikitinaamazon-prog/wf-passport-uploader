import { getCloudflareContext } from '@opennextjs/cloudflare';

// ВРЕМЕННО: GET /upload — проверка, что роут жив и видит env (без секретов)
export async function GET() {
  const { env } = getCloudflareContext();
  const hasUrl = !!env.SUPABASE_URL;
  const hasKey = !!env.SUPABASE_SERVICE_KEY;
  const bucket = env.SUPABASE_BUCKET || '(not set)';
  return Response.json({ ok: true, hasUrl, hasKey, bucket });
}

export async function POST(req) {
  const { env } = getCloudflareContext();
  const SUPABASE_URL = env.SUPABASE_URL;
  const SERVICE_KEY  = env.SUPABASE_SERVICE_KEY;
  const BUCKET       = env.SUPABASE_BUCKET || 'passports';

  // sanity-check env
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(
      `Missing env: ${!SUPABASE_URL ? 'SUPABASE_URL ' : ''}${!SERVICE_KEY ? 'SUPABASE_SERVICE_KEY' : ''}`,
      { status: 500 }
    );
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!file) return new Response('No file', { status: 400 });

  const type = file.type || 'application/octet-stream';
  if (!(type.startsWith('image/') || type === 'application/pdf'))
    return new Response('Unsupported type', { status: 415 });
  if (file.size > 10 * 1024 * 1024)
    return new Response('File too large', { status: 413 });

  const ext = (file.name?.split('.').pop() || 'bin').toLowerCase();
  const key = `passports/${Date.now()}-${crypto.randomUUID()}.${ext}`; // "папка" passports внутри бакета

  try {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,                // на сервере полезно добавить оба
          'Content-Type': type,
          'x-upsert': 'true'
        },
        body: await file.arrayBuffer()
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return new Response(`Upload failed (${res.status}): ${text}`, { status: 500 });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(BUCKET)}/${encodeURIComponent(key)}`;
    return Response.json({ url: publicUrl, name: file.name ?? key });
  } catch (err) {
    return new Response(`Fetch error: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
  }
}
