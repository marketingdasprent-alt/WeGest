import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { proximaTentativa } from '../_shared/acordos/backoff.ts';
import { AuthorizationError, requireInternalRequest } from '../_shared/auth/edgeAuthorization.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const env = (k: string) => Deno.env.get(k);

const MAX_POR_ORG = 2;
const MAX_POR_CICLO = 10;

const TIMEOUT_EMITIR_MS = 30_000;

interface Linha {
  id: string;
  org_id: string;
  parcela_id: string | null;
  idempotency_key: string;
  payload: Record<string, unknown>;
  tentativas: number;
  needs_reconcile: boolean;
}

interface RespostaEmitir {
  success?: boolean;
  invoice?: { id: string };
  error?: string;
  classe?: 'known_failed' | 'unknown';
}

async function comLimite<T>(limite: number, itens: T[], tarefa: (i: T) => Promise<void>) {
  const fila = [...itens];
  const trabalhadores = Array.from({ length: Math.min(limite, fila.length) }, async () => {
    for (let item = fila.shift(); item !== undefined; item = fila.shift()) {
      await tarefa(item);
    }
  });
  await Promise.all(trabalhadores);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  try {
    requireInternalRequest(req, serviceRoleKey);
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 401;
    return new Response(
      JSON.stringify({ success: false, error: 'Chamada interna não autorizada' }),
      {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  const service = createClient(env('SUPABASE_URL') ?? '', serviceRoleKey);
  const contadores = { processadas: 0, sucesso: 0, suspensas: 0, falhadas: 0, reagendadas: 0 };

  const { data: linhas, error } = await service.rpc('faturacao_outbox_claim', {
    p_max: MAX_POR_CICLO,
  });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const porOrg = new Map<string, Linha[]>();
  for (const l of (linhas ?? []) as Linha[]) {
    porOrg.set(l.org_id, [...(porOrg.get(l.org_id) ?? []), l]);
  }

  async function suspender(l: Linha, erro: string) {
    await service
      .from('faturacao_outbox')
      .update({ estado: 'suspenso', needs_reconcile: true, ultimo_erro: erro })
      .eq('id', l.id);
    contadores.suspensas++;
  }

  for (const [orgId, doOrg] of porOrg) {
    await comLimite(MAX_POR_ORG, doOrg, async (linha) => {
      contadores.processadas++;

      try {
        if (linha.needs_reconcile) {
          await suspender(linha, 'Resultado desconhecido — requer verificação manual');
          return;
        }

        let res: RespostaEmitir;
        try {
          const r = await fetch(`${env('SUPABASE_URL')}/functions/v1/faturacao-emitir`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({ ...linha.payload, org_id: orgId }),
            signal: AbortSignal.timeout(TIMEOUT_EMITIR_MS),
          });
          res = await r.json();
        } catch (e) {
          await suspender(linha, `Falha de comunicação: ${(e as Error).message}`);
          return;
        }

        if (res.success) {
          let liquidarErr: { message: string } | null = null;
          if (linha.parcela_id) {
            const { error } = await service.rpc('acordo_parcela_liquidar', {
              p_parcela_id: linha.parcela_id,
              p_invoice_id: res.invoice?.id ?? null,
            });
            liquidarErr = error;
          }
          await service
            .from('faturacao_outbox')
            .update({
              estado: 'sucesso',
              invoice_id: res.invoice?.id ?? null,
              needs_reconcile: !!liquidarErr,
              ultimo_erro: liquidarErr
                ? `Documento emitido mas falhou liquidar: ${liquidarErr.message}`
                : null,
            })
            .eq('id', linha.id);
          contadores.sucesso++;
          return;
        }

        if (res.classe !== 'known_failed') {
          await suspender(linha, res.error ?? 'Resultado desconhecido do provider');
          return;
        }

        const proxima = proximaTentativa(linha.tentativas, new Date());
        if (!proxima) {
          await service
            .from('faturacao_outbox')
            .update({ estado: 'falhado', ultimo_erro: res.error ?? 'Erro do provider' })
            .eq('id', linha.id);
          contadores.falhadas++;
          return;
        }
        await service
          .from('faturacao_outbox')
          .update({
            estado: 'pendente',
            proxima_tentativa: proxima.toISOString(),
            ultimo_erro: res.error ?? 'Erro do provider',
          })
          .eq('id', linha.id);
        contadores.reagendadas++;
      } catch (erro) {
        console.error(`faturacao-outbox-drain: linha ${linha.id} falhou inesperadamente:`, erro);
        await suspender(linha, `Erro inesperado: ${(erro as Error).message}`).catch(
          (erroSuspender) =>
            console.error(
              `faturacao-outbox-drain: falha a suspender linha ${linha.id}:`,
              erroSuspender
            )
        );
      }
    });
  }

  return new Response(JSON.stringify(contadores), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
