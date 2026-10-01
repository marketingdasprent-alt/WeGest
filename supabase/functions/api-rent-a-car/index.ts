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
import { tratarPedido } from '../_shared/api-rent-a-car/handler.ts';

// Supabase Edge Runtime: sem waitUntil, o isolate pode fechar logo depois da
// resposta e a auditoria perder-se. Fora do runtime (deno check, testes) não existe.
declare const EdgeRuntime: { waitUntil(promessa: Promise<unknown>): void } | undefined;

const env = (k: string) => Deno.env.get(k) ?? '';
const db = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

Deno.serve(async (req) => {
  const { resposta, auditoria } = await tratarPedido(req, db());
  if (auditoria && typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(auditoria);
  return resposta;
});
