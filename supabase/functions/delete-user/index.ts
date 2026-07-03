import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Create client with user's JWT to verify they are admin
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    // Get current user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.log('Failed to get user:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get payload: which user to remove, and from WHICH org (org ativa do caller).
    const { userId, org_id: orgId } = await req.json();
    if (!userId) {
      console.log('No userId provided');
      return new Response(
        JSON.stringify({ error: 'ID do utilizador não fornecido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!orgId) {
      console.log('No org_id provided');
      return new Response(
        JSON.stringify({ error: 'org_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify caller is admin OF THIS ORG (papel per-org vive em user_organizacoes).
    const { data: callerMembership, error: callerError } = await supabaseAdmin
      .from('user_organizacoes')
      .select('is_admin')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single();

    if (callerError || !callerMembership?.is_admin) {
      console.log('Caller is not admin of org:', user.id, orgId);
      return new Response(
        JSON.stringify({ error: 'Apenas administradores podem eliminar utilizadores' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prevent self-deletion
    if (userId === user.id) {
      console.log('User tried to delete themselves');
      return new Response(
        JSON.stringify({ error: 'Não pode eliminar a sua própria conta' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify target actually belongs to THIS org (a remoção é sempre org-scoped).
    const { data: targetMembership, error: targetError } = await supabaseAdmin
      .from('user_organizacoes')
      .select('id')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .single();

    if (targetError || !targetMembership) {
      console.log('Target user not a member of this org:', userId, orgId);
      return new Response(
        JSON.stringify({ error: 'Não pode eliminar utilizadores de outra organização' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Remover apenas o membership desta org.
    const { error: removeError } = await supabaseAdmin
      .from('user_organizacoes')
      .delete()
      .eq('user_id', userId)
      .eq('org_id', orgId);

    if (removeError) {
      console.error('Error removing membership:', removeError.message);
      return new Response(
        JSON.stringify({ error: `Erro ao remover utilizador da organização: ${removeError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Se a org removida era a org ativa do user, limpar para não apontar para nada.
    await supabaseAdmin
      .from('user_org_ativa')
      .delete()
      .eq('user_id', userId)
      .eq('org_id', orgId);

    // Contar orgs restantes: só apagar a conta auth se esta era a última org.
    const { count: remainingOrgs, error: countError } = await supabaseAdmin
      .from('user_organizacoes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      console.error('Error counting remaining orgs:', countError.message);
      // Membership já removido — não bloquear; reportar sucesso parcial.
      return new Response(
        JSON.stringify({ success: true, removedFromOrg: true, accountDeleted: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if ((remainingOrgs ?? 0) === 0) {
      // Última org — apagar conta auth (profiles cai via ON DELETE CASCADE).
      console.log('Last org removed, deleting auth account:', userId);
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (deleteError) {
        console.error('Error deleting user:', deleteError.message);
        return new Response(
          JSON.stringify({ error: `Erro ao eliminar utilizador: ${deleteError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, removedFromOrg: true, accountDeleted: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User removed from org, account kept (other orgs remain):', userId);
    return new Response(
      JSON.stringify({ success: true, removedFromOrg: true, accountDeleted: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
