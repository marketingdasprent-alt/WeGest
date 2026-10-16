// PDF de uma fatura para a conta de cliente. O WeGest não guarda o PDF: pede-se ao
// programa de faturação na hora, pela edge faturacao-emitir (action 'pdf'), com a
// service role, a única que pode indicar o org_id. Nunca registar o base64.
import { CORS_HEADERS } from './respostas.ts';

/** semPdf: a fatura não tem número no fornecedor, logo nunca haverá PDF (não é falha passageira). */
export type ResultadoPdf = { base64: string } | { erro: string; semPdf?: boolean };

/** Pede o PDF (base64) da fatura invoiceId da organização orgId. Nunca lança. */
export type PedirPdfFatura = (invoiceId: string, orgId: string) => Promise<ResultadoPdf>;

// O Primavera pode levar até 40 s (PDF_TIMEOUT_MS em faturacao-emitir/providers/primavera.ts);
// desistir antes disso só põe outro pedido na fila do agente a cada nova tentativa.
export const ESPERA_MAXIMA_MS = 45_000;

const MAX_MENSAGEM = 200;
const SEM_NUMERO = /não tem número no fornecedor|sem provider_docnum/i;

/** Mensagem de erro própria para log: sem emails nem sequências longas (tokens, base64), ≤ 200. */
export function limparMensagem(mensagem: string): string {
  return mensagem
    .replace(/[^\s@]+@[^\s@]+/g, '[email]')
    .replace(/[A-Za-z0-9+/=_.-]{40,}/g, '[…]')
    .slice(0, MAX_MENSAGEM);
}

function erroDoCorpo(corpo: unknown, alternativa: string): { erro: string; semPdf?: boolean } {
  const bruto = (corpo as { error?: unknown } | null)?.error;
  const mensagem = typeof bruto === 'string' && bruto.trim() ? bruto.trim() : alternativa;
  return SEM_NUMERO.test(mensagem)
    ? { erro: limparMensagem(mensagem), semPdf: true }
    : { erro: limparMensagem(mensagem) };
}

/** O PedirPdfFatura de produção: POST a faturacao-emitir com a service role. */
export function criarPedirPdfFatura(
  supabaseUrl: string,
  serviceRoleKey: string,
  fazerFetch: typeof fetch = fetch,
  esperaMaximaMs = ESPERA_MAXIMA_MS
): PedirPdfFatura {
  return async (invoiceId, orgId) => {
    if (!supabaseUrl || !serviceRoleKey) return { erro: 'configuração em falta' };
    const sinal = AbortSignal.timeout(esperaMaximaMs);
    // Corta também um fetch que ignore o signal (ou um corpo que nunca acaba de chegar).
    const desistir = new Promise<never>((_, rejeitar) =>
      sinal.addEventListener('abort', () => rejeitar(sinal.reason), { once: true })
    );
    const pedir = async (): Promise<ResultadoPdf> => {
      const r = await fazerFetch(
        `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/faturacao-emitir`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'pdf', invoice_id: invoiceId, org_id: orgId }),
          signal: sinal,
        }
      );
      if (!r.ok) {
        const texto = await r.text().catch(() => '');
        let corpo: unknown = null;
        try {
          corpo = JSON.parse(texto);
        } catch {
          // Corpo que não é JSON (HTML de um proxy, por exemplo): fica só o estado HTTP.
        }
        return erroDoCorpo(corpo, `HTTP ${r.status}`);
      }
      // faturacao-emitir responde 200 também quando falha: { success: false, error }.
      const corpo = (await r.json()) as { success?: unknown; base64?: unknown } | null;
      if (corpo?.success !== true) return erroDoCorpo(corpo, 'resposta sem PDF');
      if (typeof corpo.base64 !== 'string' || !corpo.base64) return { erro: 'resposta sem PDF' };
      return { base64: corpo.base64 };
    };
    try {
      return await Promise.race([pedir(), desistir]);
    } catch (e) {
      return { erro: e instanceof Error ? e.name : 'falha' };
    }
  };
}

/** Os bytes do PDF, ou null quando o base64 não descodifica ou não é um PDF. */
export function bytesDoPdf(base64: string): Uint8Array<ArrayBuffer> | null {
  let binario: string;
  try {
    binario = atob(base64.replace(/\s/g, ''));
  } catch {
    return null;
  }
  if (!binario.startsWith('%PDF-')) return null;
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** "<serie> <numero>.pdf", só com caracteres que não partem o Content-Disposition. */
export function nomeDoPdf(serie: unknown, numero: unknown): string {
  const partes = [serie, numero]
    .filter((p) => (typeof p === 'string' || typeof p === 'number') && String(p).trim() !== '')
    .map((p) =>
      String(p)
        .trim()
        .replace(/[^A-Za-z0-9 ._-]/g, '-')
    );
  const nome = partes.join(' ').slice(0, 100);
  return `${nome || 'fatura'}.pdf`;
}

export function respostaPdf(bytes: Uint8Array<ArrayBuffer>, nome: string): Response {
  return new Response(bytes, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      Vary: 'Origin',
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${nome}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
