
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Caller tem de estar autenticado (verify_jwt garante assinatura).
    const authHeader = req.headers.get('Authorization') ?? ''
    const callerToken = authHeader.replace('Bearer ', '')
    if (!callerToken) {
      return new Response(
        JSON.stringify({ error: 'Não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const { data: { user: caller }, error: callerAuthError } =
      await supabaseAdmin.auth.getUser(callerToken)
    if (callerAuthError || !caller) {
      return new Response(
        JSON.stringify({ error: 'Sessão inválida' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { email, org_id: orgId } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'org_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Só um admin DESTA org pode promover (papel per-org em user_organizacoes).
    const { data: callerMembership, error: callerMembershipError } = await supabaseAdmin
      .from('user_organizacoes')
      .select('is_admin')
      .eq('user_id', caller.id)
      .eq('org_id', orgId)
      .single()

    if (callerMembershipError || !callerMembership?.is_admin) {
      return new Response(
        JSON.stringify({ error: 'Apenas administradores podem promover utilizadores' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Buscar usuário pelo email
    const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers()

    if (userError) {
      console.error('Erro ao buscar usuários:', userError)
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar usuário' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const user = users.users.find(u => u.email === email)

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Alvo tem de ser membro DESTA org.
    const { data: targetMembership, error: targetMembershipError } = await supabaseAdmin
      .from('user_organizacoes')
      .select('id')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single()

    if (targetMembershipError || !targetMembership) {
      return new Response(
        JSON.stringify({ error: 'O utilizador não pertence a esta organização' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Promover a admin NA ORG (per-org). Não tocar em profiles (legado).
    const { error: updateError } = await supabaseAdmin
      .from('user_organizacoes')
      .update({ is_admin: true })
      .eq('user_id', user.id)
      .eq('org_id', orgId)

    if (updateError) {
      console.error('Erro ao promover na org:', updateError)
      return new Response(
        JSON.stringify({ error: 'Erro ao promover usuário a admin' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        message: 'Usuário promovido a administrador com sucesso',
        user_id: user.id
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Erro:', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
