// ============================================================
// Edge Function: api-rent-a-car — API externa de rent-a-car (v1)
// ============================================================
// Fina de propósito: cria o cliente service_role e entrega o pedido a
// _shared/api-rent-a-car/handler.ts (autentica a chave, aplica o limite,
// encaminha, regista em api_pedidos). A regra de negócio vive nas funções SQL
// api_* (org_id da chave). O CI só corre testes Deno em _shared.
// Público em https://wegest.pt/api/rent-a-car/v1/* (rewrite do Vercel) e em
// https://<projecto>.supabase.co/functions/v1/api-rent-a-car/v1/*.
// ============================================================
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { criarArmazemDocumentos } from '../_shared/api-rent-a-car/armazemDocumentos.ts';
import { criarPedirPdfFatura } from '../_shared/api-rent-a-car/faturaPdf.ts';
import { tratarPedido } from '../_shared/api-rent-a-car/handler.ts';

// Supabase Edge Runtime: sem waitUntil, o isolate pode fechar logo depois da
// resposta e a auditoria perder-se. Fora do runtime (deno check, testes) não existe.
declare const EdgeRuntime: { waitUntil(promessa: Promise<unknown>): void } | undefined;

const env = (k: string) => Deno.env.get(k) ?? '';
const db = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
// PDF das faturas da conta de cliente: faturacao-emitir com a service role.
const pedirPdfFatura = criarPedirPdfFatura(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

Deno.serve(async (req) => {
  const cliente = db();
  // Documentos da candidatura da conta: URL assinado de envio e verificação do ficheiro.
  const armazemDocumentos = criarArmazemDocumentos(cliente);
  const { resposta, auditoria } = await tratarPedido(req, cliente, {
    pedirPdfFatura,
    armazemDocumentos,
  });
  if (auditoria && typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(auditoria);
  return resposta;
});
