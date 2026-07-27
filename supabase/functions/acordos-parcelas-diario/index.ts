// supabase/functions/acordos-parcelas-diario/index.ts
// ============================================================
// Worker diário do ciclo de vida das parcelas.
// ============================================================
// Cinco passos, TODOS idempotentes e derivados do estado atual — nenhum depende
// de "quando é que corri pela última vez". Se o cron falhar três dias, o quarto
// repõe tudo sozinho.
//
// FUSO: o pg_cron corre em UTC. Comparar data_vencimento com "hoje" perto da
// meia-noite dava um dia de erro com horário de verão, por isso `hoje` é
// calculado explicitamente em Europe/Lisbon.
//
// DESVIO do desenho original (verificado ao ler send-brevo-email/index.ts):
// o plano previa notificar com um POST a `send-brevo-email` e corpo
// {to, subject, html}. Essa função só aceita `{to, type, redirect_to}` com
// type em 'password_recovery' | 'magic_link' | 'motorista_onboarding' — é
// exclusiva para emails de autenticação: gera sempre o corpo a partir de um
// actionLink do Supabase Auth e IGNORA qualquer subject/html enviado.
// Chamá-la com {to, subject, html} não enviava o aviso nenhum — enviava (na
// melhor hipótese) um email de "magic link" com link vazio. Em vez disso,
// este worker fala directamente com EmailProviderFactory
// (supabase/functions/_shared/email/factories/EmailProviderFactory.ts), o
// MESMO mecanismo que EmailService usa por trás de todas as outras Edge
// Functions de email deste repositório — respeita a integração de email
// própria de CADA organização (plataformas_configuracao: API key e
// remetente configurados por-org) em vez de assumir uma única conta Brevo
// global. Não se usa EmailService directamente porque nenhum dos seus
// métodos existentes (todos ligados a um template fixo — reminder,
// documento_fiscal, marketing, etc.) serve um aviso de parcela sem
// acrescentar um template novo, fora do âmbito desta tarefa (2 ficheiros:
// este worker + a migração dos crons). O registo em `email_sends` abaixo
// replica o que EmailService.log() faz, para manter a mesma visibilidade
// operacional que todos os outros tipos de email já têm.
// ============================================================
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { EmailProviderFactory } from '../_shared/email/factories/EmailProviderFactory.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const env = (k: string) => Deno.env.get(k);

/** Data de hoje em Lisboa, como `YYYY-MM-DD`. */
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
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const service = createClient(env('SUPABASE_URL') ?? '', env('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const appUrl = env('APP_URL') ?? '';
  const hoje = hojeEmLisboa();
  const r = { vencidas: 0, avisadas: 0, incumprimentos: 0, liquidados: 0, revisao: 0 };

  // ── ① VENCIDAS ────────────────────────────────────────────────────────
  const { data: vencidas } = await service
    .from('acordo_parcelas')
    .update({ estado: 'vencida' })
    .in('estado', ['agendada', 'avisada'])
    .lt('data_vencimento', hoje)
    .select('id');
  r.vencidas = vencidas?.length ?? 0;

  // ── ② AVISOS ──────────────────────────────────────────────────────────
  const { data: aAvisar } = await service
    .from('acordo_parcelas')
    .select(
      // aviso_tentativas TEM de vir no select — é incrementado em caso de falha.
      // org_id TEM de vir no select — é a chave para resolver o provider de
      // email da organização responsável (EmailProviderFactory é por-org).
      'id, org_id, numero, valor, data_vencimento, acordo_id, aviso_tentativas, ' +
        'acordo:acordos_pagamento!inner(id, codigo, estado, valor_total, ' +
        'aviso_antecedencia_dias, responsavel_papel, responsavel_nome, ' +
        'responsavel_cliente_id, responsavel_motorista_id, cobranca_id)'
    )
    .eq('estado', 'agendada')
    .is('aviso_enviado_em', null)
    .lt('aviso_tentativas', 3)
    .eq('acordo.estado', 'ativo')
    .gte('data_vencimento', hoje);

  for (const p of (aAvisar ?? []) as any[]) {
    const a = p.acordo;
    // Só avisa dentro da antecedência configurada no acordo.
    const dias = Math.round(
      (Date.parse(`${p.data_vencimento}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86400000
    );
    if (dias > (a.aviso_antecedencia_dias ?? 3)) continue;

    let email: string | null = null;
    if (a.responsavel_motorista_id) {
      const { data } = await service
        .from('motoristas_ativos')
        .select('email')
        .eq('id', a.responsavel_motorista_id)
        .maybeSingle();
      email = data?.email ?? null;
    } else {
      const { data } = await service
        .from('clientes')
        .select('email')
        .eq('id', a.responsavel_cliente_id)
        .maybeSingle();
      email = data?.email ?? null;
    }

    if (!email) {
      // Incrementa a partir do valor actual — nunca um literal fixo. Um
      // literal (ex.: sempre 1) nunca atingiria o limite de 3 do filtro
      // `lt('aviso_tentativas', 3)` acima, e a parcela seria re-selecionada
      // e tentada TODOS os dias, para sempre, em vez de desistir ao fim de 3.
      await service
        .from('acordo_parcelas')
        .update({
          aviso_tentativas: (p.aviso_tentativas ?? 0) + 1,
          aviso_erro: 'Entidade responsável sem email',
        })
        .eq('id', p.id);
      continue;
    }

    const { data: faltaPagar } = await service.rpc('cobranca_saldo_por_liquidar', {
      p_cobranca_id: a.cobranca_id,
    });

    try {
      // NÃO é documento fiscal — dito no assunto e no corpo, porque o email
      // sobrevive fora da app e é reencaminhado a contabilistas.
      const assunto =
        `Aviso de vencimento (não é fatura) · Parcela ${p.numero} ` +
        `do acordo ACD-${a.codigo} · ${eur(p.valor)}`;

      const corpoHtml =
        `<p>Olá ${a.responsavel_nome},</p>` +
        `<p><strong>Aviso de vencimento — não é fatura nem recibo.</strong></p>` +
        `<p>Parcela ${p.numero} · <strong>${eur(p.valor)}</strong> · ` +
        `vence a ${dataPT(p.data_vencimento)}.</p>` +
        `<p>Falta pagar ${eur(Number(faltaPagar ?? 0))} de ${eur(Number(a.valor_total))}.</p>` +
        (appUrl ? `<p><a href="${appUrl}/acordos/${a.id}">Ver o plano de pagamentos</a></p>` : '');

      // Resolve o provider de email DESTA organização (Brevo com a API key e
      // remetente configurados nela, ou o fallback legado global se ainda
      // não tiver integração própria) — nunca uma conta Brevo fixa.
      const { provider, sender } = await EmailProviderFactory.getProvider(p.org_id, service);
      const result = await provider.send({
        to: [{ email, name: a.responsavel_nome }],
        subject: assunto,
        html: corpoHtml,
        senderOverride: sender,
      });
      if (!result.success) throw new Error(result.error || 'Falha ao enviar email');

      // Mesmo registo (email_sends) que todos os outros tipos de email do
      // sistema — dá visibilidade operacional consistente. Uma falha aqui
      // não deve derrubar o aviso que já foi enviado com sucesso.
      const { error: logError } = await service.from('email_sends').insert({
        org_id: p.org_id,
        origem: 'acordo_aviso',
        email,
        status: 'sent',
        last_event: 'sent',
        last_event_at: new Date().toISOString(),
        brevo_message_id: result.providerMessageId ?? null,
      });
      if (logError) {
        console.error(
          'acordos-parcelas-diario: falha ao gravar log em email_sends:',
          logError.message
        );
      }

      await service
        .from('acordo_parcelas')
        .update({ estado: 'avisada', aviso_enviado_em: new Date().toISOString(), aviso_erro: null })
        .eq('id', p.id);
      r.avisadas++;
    } catch (e) {
      await service
        .from('acordo_parcelas')
        .update({ aviso_tentativas: (p.aviso_tentativas ?? 0) + 1, aviso_erro: (e as Error).message })
        .eq('id', p.id);
    }
  }

  // ── ③ INCUMPRIMENTO, ④ LIQUIDADOS, ⑤ DIVERGÊNCIA ──────────────────────
  const { data: manutencao } = await service.rpc('acordos_manutencao_diaria', { p_hoje: hoje });
  if (manutencao) {
    r.incumprimentos = manutencao.incumprimentos ?? 0;
    r.liquidados = manutencao.liquidados ?? 0;
    r.revisao = manutencao.revisao ?? 0;
  }

  return new Response(JSON.stringify(r), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
