import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { R2Bucket } from '@cloudflare/workers-types';
export const runtime = 'edge';

export async function POST(req: Request) {
  const { env } = getCloudflareContext();
  const bucket = env.BUCKET as R2Bucket;

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return new Response('No file', { status: 400 });

  const type = file.type || 'application/octet-stream';
  if (!(type.startsWith('image/') || type === 'application/pdf')) return new Response('Unsupported type', { status: 415 });
  if (file.size > 10 * 1024 * 1024) return new Response('File too large', { status: 413 });

  const ext = (file.name?.split('.').pop() || 'bin').toLowerCase();
  const key = `passports/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: type } });

  const url = new URL(req.url);
  const base = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname; // /upload
  const fileUrl = `${url.origin}${base}/file/${encodeURIComponent(key)}`;

  return Response.json({ url: fileUrl, name: file.name ?? key });
}
