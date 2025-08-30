// src/index.js
export default {
  async fetch(req, env) {
    const ALLOWED_ORIGINS = [
      'https://olgas-wondrous-site-c4bcf5.webflow.io/',
      'https://www.kilobanan.com'
    ];
    const origin = req.headers.get('origin') || '';
    const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    const cors = {
      'Access-Control-Allow-Origin': allow,
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Access-Control-Max-Age': '86400',
    };

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(req.url);

    // GET /file/{key}
    if (req.method === 'GET' && url.pathname.startsWith('/file/')) {
      const key = decodeURIComponent(url.pathname.slice('/file/'.length));
      const obj = await env.BUCKET.get(key);
      if (!obj) return new Response('Not found', { status: 404, headers: cors });
      const h = new Headers(cors);
      h.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
      h.set('Content-Disposition', 'inline');
      return new Response(obj.body, { headers: h });
    }

    // POST /
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

    const ct = req.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) return new Response('Expected multipart/form-data', { status: 400, headers: cors });

    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return new Response('No file', { status: 400, headers: cors });

    const MAX_BYTES = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_BYTES) return new Response('File too large', { status: 413, headers: cors });

    const type = file.type || 'application/octet-stream';
    if (!(type.startsWith('image/') || type === 'application/pdf')) return new Response('Unsupported type', { status: 415, headers: cors });

    const ext = (file.name?.split('.').pop() || 'bin').toLowerCase();
    const key = `passports/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    await env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: type } });

    const fileUrl = `${url.origin}/file/${encodeURIComponent(key)}`;
    return new Response(JSON.stringify({ url: fileUrl, name: file.name || key }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
}
