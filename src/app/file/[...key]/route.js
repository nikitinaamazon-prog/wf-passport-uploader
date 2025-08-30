// src/app/file/[...key]/route.ts  (или .js)
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { R2Bucket } from '@cloudflare/workers-types';

export async function GET(_req: Request, ctx: { params: { key: string[] } }) {
  const { env } = getCloudflareContext();
  const bucket = env.BUCKET as R2Bucket;

  const key = ctx.params.key.join('/');
  const obj = await bucket.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Disposition': 'inline',
    },
  });
}
