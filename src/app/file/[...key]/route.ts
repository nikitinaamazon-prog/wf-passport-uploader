import { getCloudflareContext } from '@opennextjs/cloudflare';
export const runtime = 'edge';

export async function GET(_req, ctx) {
  const { env } = getCloudflareContext();
  const bucket = env.BUCKET;

  const key = ctx.params.key.join('/');
  const obj = await bucket.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Disposition': 'inline'
    }
  });
}
