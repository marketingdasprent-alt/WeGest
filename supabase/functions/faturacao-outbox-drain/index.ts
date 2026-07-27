// supabase/functions/faturacao-outbox-drain/index.ts
// ============================================================
// Worker: drena a faturacao_outbox e emite os documentos pendentes.
// ============================================================
// Corre a cada 5 minutos (pg_cron). Reclama linhas com claim atómico, emite
// via faturacao-emitir com org_id explícito (service role) e fecha a parcela.
//
// REGRA CENTRAL (v1): resultado DESCONHECIDO nunca é reemitido.
// A API do provider não tem chave de idempotência — um retry após timeout pode
// criar um segundo recibo sobre a mesma fatura. Preferimos parar e chamar um
// humano a arriscar um documento fiscal duplicado.
// ============================================================
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { proximaTentativa } from '../_shared/acordos/backoff.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const env = (k: string) => Deno.env.get(k);

/** Máximo de emissões em simultâneo POR ORGANIZAÇÃO.
 *  O provider autentica por sessão e os limites de rate são desconhecidos. */
const MAX_POR_ORG = 2;
const MAX_POR_CICLO = 10;

interface Linha {
  id: string;
  org_id: string;
  parcela_id: string | null;
  idempotency_key: string;
  payload: Record<string, unknown>;
  tentativas: number;
  needs_reconcile: boolean;
}

/** Resposta de faturacao-emitir (action 'emit') — ver Task 6. */
interface RespostaEmitir {
  success?: boolean;
  invoice?: { id: string };
  error?: string;
  /** known_failed = nada foi criado, seguro reagendar. unknown/ausente =
   *  não se sabe, nunca reagendar sem reconciliar primeiro. */
  classe?: 'known_failed' | 'unknown';
}

/** Corre `tarefa` sobre `itens` com no máximo `limite` em simultâneo. */
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

  const service = createClient(env('SUPABASE_URL') ?? '', env('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const contadores = { processadas: 0, sucesso: 0, suspensas: 0, reagendadas: 0 };

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

      // Rede de segurança: o reaper já suspende as linhas de resultado
      // desconhecido, mas nada reclamado com needs_reconcile chega a emitir.
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
        });
        res = await r.json();
      } catch (e) {
        // Falha de TRANSPORTE a chamar a PRÓPRIA função (não o provider) — não
        // se sabe se o provider chegou a ser contactado. NÃO reemitir.
        await suspender(linha, `Falha de comunicação: ${(e as Error).message}`);
        return;
      }

      if (res.success) {
        // res.invoice pode faltar mesmo com sucesso: falhou só a gravação do
        // espelho local em `invoices`, o documento fiscal é real (ver Task 6/7)
        // — NUNCA tratar isto como falha, ou o próximo tick reemitiria e
        // arriscaria um segundo documento sobre o mesmo pagamento.
        if (linha.parcela_id) {
          await service.rpc('acordo_parcela_liquidar', {
            p_parcela_id: linha.parcela_id,
            p_invoice_id: res.invoice?.id ?? null,
          });
        }
        await service
          .from('faturacao_outbox')
          .update({ estado: 'sucesso', invoice_id: res.invoice?.id ?? null, ultimo_erro: null })
          .eq('id', linha.id);
        contadores.sucesso++;
        return;
      }

      // `classe` (ver Task 6) distingue known_failed (nada foi criado, seguro
      // reagendar) de unknown/ausente (não se sabe — NUNCA reagendar sem
      // reconciliar primeiro). Isto é a regra central deste ficheiro; sem esta
      // verificação qualquer falha reagendaria, incluindo as ambíguas.
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
        contadores.suspensas++;
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
    });
  }

  return new Response(JSON.stringify(contadores), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
