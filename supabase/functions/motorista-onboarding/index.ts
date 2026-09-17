import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CARGO_MOTORISTA_ID = 'a0000000-0000-0000-0000-000000000001';

function escapeLike(value: string): string {
  return value.replace(/([%_\\])/g, '\\$1');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!supabaseUrl || !serviceKey) {
      return json({ ok: false, error: 'Servidor mal configurado' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const emailNorm = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const orgId = typeof body?.org_id === 'string' ? body.org_id : '';
    const redirectTo = typeof body?.redirect_to === 'string' ? body.redirect_to : undefined;

    if (!emailNorm || !orgId) {
      return json({ ok: false, error: 'email e org_id são obrigatórios' }, 400);
    }

    const { data: profileExistente } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', escapeLike(emailNorm))
      .maybeSingle();

    if (profileExistente) {
      return json({ ok: true, status: 'existe_conta' });
    }

    const { data: perfil, error: perfilErr } = await admin
      .from('motoristas_ativos')
      .select('id, nome, telefone, email, user_id, org_id')
      .eq('org_id', orgId)
      .is('user_id', null)
      .ilike('email', escapeLike(emailNorm))
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (perfilErr || !perfil) {
      return json({ ok: true, status: 'criar' });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: emailNorm,
      email_confirm: true,
      user_metadata: {
        nome: perfil.nome ?? emailNorm.split('@')[0],
        telefone: perfil.telefone ?? null,
        cargo_nome: 'Motorista',
        tipo_utilizador: 'motorista',
        org_id: orgId,
      },
      app_metadata: {
        org_id: orgId,
        cargo_id: CARGO_MOTORISTA_ID,
        tipo_utilizador: 'motorista',
      },
    });

    if (createErr) {
      const alreadyExists = /already.*(registered|exists)/i.test(createErr.message || '');
      if (alreadyExists) {
        return json({ ok: true, status: 'existe_conta' });
      }
      console.error('motorista-onboarding createUser:', createErr);
      return json({ ok: false, error: 'Não foi possível preparar a conta.' }, 500);
    }

    const userId = created.user?.id ?? null;

    if (userId) {
      const { error: linkErr } = await admin
        .from('motoristas_ativos')
        .update({ user_id: userId, updated_at: new Date().toISOString() })
        .eq('id', perfil.id)
        .is('user_id', null);
      if (linkErr) {
        console.error('motorista-onboarding link:', linkErr);
        return json({ ok: false, error: 'Não foi possível associar a conta ao perfil.' }, 500);
      }
    }

    const mailResp = await fetch(`${supabaseUrl}/functions/v1/send-brevo-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        to: emailNorm,
        type: 'motorista_onboarding',
        redirect_to: redirectTo,
      }),
    });

    if (!mailResp.ok) {
      const detail = await mailResp.text().catch(() => '');
      console.error('motorista-onboarding send-brevo-email:', mailResp.status, detail);
      return json(
        { ok: false, error: 'Conta preparada, mas falhou o envio do email. Tente novamente.' },
        502
      );
    }

    return json({ ok: true, status: 'enviado' });
  } catch (e) {
    console.error('motorista-onboarding erro:', e);
    return json({ ok: false, error: 'Erro interno do servidor' }, 500);
  }
});
