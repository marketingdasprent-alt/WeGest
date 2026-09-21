import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { EmailProviderFactory } from '../_shared/email/factories/EmailProviderFactory.ts';
import type { EmailSendResult } from '../_shared/email/types/index.ts';
import { AuthorizationError, requireInternalRequest } from '../_shared/auth/edgeAuthorization.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const env = (k: string) => Deno.env.get(k);

function hojeEmLisboa(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const eur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

const dataPT = (iso: string) => iso.split('-').reverse().join('/');

serve(async (req) => {
  const r = {
    vencidas: 0,
    avisadas: 0,
    incumprimentos: 0,
    liquidados: 0,
    revisao: 0,
    erros: [] as string[],
  };

  try {
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
    const appUrl = env('APP_URL') ?? '';
    const hoje = hojeEmLisboa();

    const registarErro = (passo: string, error: { message: string } | null | undefined) => {
      if (!error) return;
      const msg = `${passo}: ${error.message}`;
      console.error(`acordos-parcelas-diario: ${msg}`);
      r.erros.push(msg);
    };

    const { data: vencidas, error: vencidasError } = await service
      .from('acordo_parcelas')
      .update({ estado: 'vencida' })
      .in('estado', ['agendada', 'avisada'])
      .lt('data_vencimento', hoje)
      .select('id');
    registarErro('Passo ①', vencidasError);
    r.vencidas = vencidas?.length ?? 0;

    const { data: aAvisar, error: aAvisarError } = await service
      .from('acordo_parcelas')
      .select(
        'id, org_id, numero, valor, data_vencimento, acordo_id, aviso_tentativas, ' +
          'acordo:acordos_pagamento!inner(id, codigo, estado, valor_total, ' +
          'aviso_antecedencia_dias, responsavel_papel, responsavel_nome, ' +
          'responsavel_cliente_id, responsavel_motorista_id, cobranca_id)'
      )
      .eq('estado', 'agendada')
      .is('aviso_enviado_em', null)
      .lt('aviso_tentativas', 3)
      .in('acordo.estado', ['ativo', 'incumprimento'])
      .gte('data_vencimento', hoje);
    registarErro('Passo ②', aAvisarError);

    for (const p of (aAvisar ?? []) as any[]) {
      try {
        const a = p.acordo;
        const dias = Math.round(
          (Date.parse(`${p.data_vencimento}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) /
            86400000
        );
        if (dias > (a.aviso_antecedencia_dias ?? 3)) continue;

        let email: string | null = null;
        let emailLookupError: { message: string } | null = null;
        if (a.responsavel_motorista_id) {
          const { data, error } = await service
            .from('motoristas_ativos')
            .select('email')
            .eq('id', a.responsavel_motorista_id)
            .maybeSingle();
          email = data?.email ?? null;
          emailLookupError = error;
        } else {
          const { data, error } = await service
            .from('clientes')
            .select('email')
            .eq('id', a.responsavel_cliente_id)
            .maybeSingle();
          email = data?.email ?? null;
          emailLookupError = error;
        }

        if (emailLookupError) {
          registarErro(`Passo ② (email, parcela ${p.id})`, emailLookupError);
          await service
            .from('acordo_parcelas')
            .update({
              aviso_tentativas: (p.aviso_tentativas ?? 0) + 1,
              aviso_erro: `Falha ao consultar email: ${emailLookupError.message}`,
            })
            .eq('id', p.id);
          continue;
        }

        if (!email) {
          await service
            .from('acordo_parcelas')
            .update({
              aviso_tentativas: (p.aviso_tentativas ?? 0) + 1,
              aviso_erro: 'Entidade responsável sem email',
            })
            .eq('id', p.id);
          continue;
        }

        const { data: faltaPagar, error: faltaPagarError } = await service.rpc(
          'cobranca_saldo_por_liquidar',
          { p_cobranca_id: a.cobranca_id }
        );
        if (faltaPagarError) {
          registarErro(`Passo ② (saldo, parcela ${p.id})`, faltaPagarError);
          continue;
        }

        const assunto =
          `Aviso de vencimento (não é fatura) · Parcela ${p.numero} ` +
          `do acordo ACD-${a.codigo} · ${eur(p.valor)}`;

        const rota = a.responsavel_motorista_id
          ? `/motorista/painel/acordos/${a.id}`
          : `/acordos/${a.id}`;

        const corpoHtml =
          `<p>Olá ${a.responsavel_nome},</p>` +
          `<p><strong>Aviso de vencimento — não é fatura nem recibo.</strong></p>` +
          `<p>Parcela ${p.numero} · <strong>${eur(p.valor)}</strong> · ` +
          `vence a ${dataPT(p.data_vencimento)}.</p>` +
          `<p>Falta pagar ${eur(Number(faltaPagar ?? 0))} de ${eur(Number(a.valor_total))}.</p>` +
          (appUrl ? `<p><a href="${appUrl}${rota}">Ver o plano de pagamentos</a></p>` : '');

        let result: EmailSendResult;
        try {
          const { provider, sender } = await EmailProviderFactory.getProvider(p.org_id, service);
          result = await provider.send({
            to: [{ email, name: a.responsavel_nome }],
            subject: assunto,
            html: corpoHtml,
            senderOverride: sender,
          });
        } catch (e) {
          result = { success: false, error: (e as Error).message };
        }

        const { error: logError } = await service.from('email_sends').insert({
          org_id: p.org_id,
          origem: 'acordo_aviso',
          email,
          status: result.success ? 'sent' : 'erro',
          last_event: result.success ? 'sent' : 'erro',
          last_event_at: new Date().toISOString(),
          brevo_message_id: result.providerMessageId ?? null,
          error_message: result.error ?? null,
        });
        if (logError) {
          console.error(
            'acordos-parcelas-diario: falha ao gravar log em email_sends:',
            logError.message
          );
        }

        if (result.success) {
          await service
            .from('acordo_parcelas')
            .update({
              estado: 'avisada',
              aviso_enviado_em: new Date().toISOString(),
              aviso_erro: null,
            })
            .eq('id', p.id);
          r.avisadas++;
        } else {
          await service
            .from('acordo_parcelas')
            .update({
              aviso_tentativas: (p.aviso_tentativas ?? 0) + 1,
              aviso_erro: result.error || 'Falha ao enviar email',
            })
            .eq('id', p.id);
        }
      } catch (e) {
        const msg = `Passo ② (parcela ${p?.id}): ${(e as Error).message}`;
        console.error(`acordos-parcelas-diario: ${msg}`);
        r.erros.push(msg);
        continue;
      }
    }

    const { data: manutencao, error: manutencaoError } = await service.rpc(
      'acordos_manutencao_diaria',
      { p_hoje: hoje }
    );
    registarErro('Passo ③④⑤', manutencaoError);
    if (manutencao) {
      r.incumprimentos = manutencao.incumprimentos ?? 0;
      r.liquidados = manutencao.liquidados ?? 0;
      r.revisao = manutencao.revisao ?? 0;
    }

    return new Response(JSON.stringify(r), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = `Erro não tratado: ${(e as Error).message}`;
    console.error(`acordos-parcelas-diario: ${msg}`);
    r.erros.push(msg);
    return new Response(JSON.stringify(r), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
