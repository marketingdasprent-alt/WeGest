interface RateLimitClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

interface RateLimitOptions {
  readonly operation: string;
  readonly identity: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

export type RateLimitDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly status: 429 | 503; readonly retryAfter: number };

const unavailable: RateLimitDecision = { allowed: false, status: 503, retryAfter: 30 };

export async function hashRateLimitIdentity(identity: string, secret?: string): Promise<string> {
  const bytes = new TextEncoder().encode(identity);
  const digest = secret
    ? await crypto.subtle.sign(
        'HMAC',
        await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        ),
        bytes
      )
    : await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// O gateway Supabase sobrepõe CF-Connecting-IP ou acrescenta a origem ao XFF.
// Sem essa configuração de proxy, não se deve publicar este endpoint diretamente.
export function trustedRequestIp(req: Request): string {
  const value = (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',').at(-1) ??
    ''
  ).trim();
  if (value.includes(':') && /^[a-fA-F0-9:]+$/.test(value)) {
    try {
      return new URL(`http://[${value}]`).hostname.slice(1, -1);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      return 'unknown';
    }
  }
  const parts = value.split('.');
  return parts.length === 4 &&
    parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
    ? value
    : 'unknown';
}

export async function consumeRateLimit(
  client: RateLimitClient,
  options: RateLimitOptions
): Promise<RateLimitDecision> {
  try {
    const { data, error } = await client.rpc('consume_edge_rate_limit', {
      p_operation: options.operation,
      p_subject_hash: await hashRateLimitIdentity(options.identity),
      p_limit: options.limit,
      p_window_seconds: options.windowSeconds,
    });
    if (
      error ||
      typeof data !== 'object' ||
      data === null ||
      !('allowed' in data) ||
      typeof data.allowed !== 'boolean' ||
      !('retry_after' in data) ||
      typeof data.retry_after !== 'number' ||
      !Number.isFinite(data.retry_after) ||
      data.retry_after < 0
    )
      return unavailable;
    if ('unavailable' in data && data.unavailable === true) return unavailable;
    return data.allowed
      ? { allowed: true }
      : {
          allowed: false,
          status: 429,
          retryAfter: Math.max(1, Math.ceil(data.retry_after)),
        };
  } catch (error: unknown) {
    console.error(
      'rate-limit: reserva indisponível',
      error instanceof Error ? error.name : 'RPC error'
    );
    return unavailable;
  }
}

export function rateLimitResponse(
  decision: RateLimitDecision,
  corsHeaders: Readonly<Record<string, string>>
): Response | null {
  if (decision.allowed) return null;
  return new Response(
    JSON.stringify({
      success: false,
      error:
        decision.status === 429
          ? 'Demasiados pedidos. Tente novamente mais tarde.'
          : 'Serviço temporariamente indisponível. Tente mais tarde.',
    }),
    {
      status: decision.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(decision.retryAfter),
        'Access-Control-Expose-Headers': 'Retry-After',
      },
    }
  );
}
