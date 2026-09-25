// Cloudflare Turnstile nos formulários públicos (registo, contacto, tickets).
// Fica activo quando TURNSTILE_SECRET_KEY existe: assim o código pode sair
// antes das chaves, e as quotas globais só sobem com o CAPTCHA ligado.

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TAMANHO_MAXIMO_TOKEN = 2048;

export type CaptchaDecision =
  | { readonly ok: true; readonly ativo: boolean }
  | { readonly ok: false; readonly status: 400 | 503 };

export async function verificarCaptcha(
  token: unknown,
  ip: string,
  fetcher: typeof fetch = fetch
): Promise<CaptchaDecision> {
  const segredo = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!segredo) return { ok: true, ativo: false };
  if (typeof token !== 'string' || !token || token.length > TAMANHO_MAXIMO_TOKEN) {
    return { ok: false, status: 400 };
  }

  const campos = new URLSearchParams({ secret: segredo, response: token });
  if (ip !== 'unknown') campos.set('remoteip', ip);
  try {
    const resposta = await fetcher(SITEVERIFY, { method: 'POST', body: campos });
    if (!resposta.ok) return { ok: false, status: 503 };
    const resultado = (await resposta.json()) as { success?: unknown };
    return resultado.success === true ? { ok: true, ativo: true } : { ok: false, status: 400 };
  } catch (error: unknown) {
    // Sem confirmação não se deixa passar: o CAPTCHA é o que protege o envio.
    console.error('captcha: siteverify indisponível', error instanceof Error ? error.name : error);
    return { ok: false, status: 503 };
  }
}

export function captchaResponse(
  decision: CaptchaDecision,
  corsHeaders: Readonly<Record<string, string>>
): Response | null {
  if (decision.ok) return null;
  return new Response(
    JSON.stringify({
      success: false,
      error:
        decision.status === 400
          ? 'A verificação anti-robô falhou. Recarregue a página e tente de novo.'
          : 'Verificação anti-robô temporariamente indisponível. Tente mais tarde.',
    }),
    { status: decision.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
