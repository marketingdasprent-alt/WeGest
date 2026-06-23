import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract JWT token from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autenticado - Token ausente' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Decode JWT payload to extract user_id (sub).
    // The Supabase Edge runtime already verifies the JWT signature before invoking this function
    // (verify_jwt defaults to true), so we trust the payload here.
    let callerUserId: string;
    try {
      const payloadB64 = token.split('.')[1];
      const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadJson);
      callerUserId = payload.sub;
      if (!callerUserId) throw new Error('JWT sem claim sub');
    } catch (e) {
      console.error('Failed to decode JWT:', e);
      return new Response(
        JSON.stringify({ error: 'Não autenticado - Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = { id: callerUserId };

    // Admin client (service role) for DB lookups and password update
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check if user is admin using service role (bypasses RLS)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      console.error('Admin check failed:', profileError);
      return new Response(
        JSON.stringify({ error: 'Permissão negada. Apenas administradores podem resetar passwords.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { userId, newPassword } = await req.json();

    // Validate inputs
    if (!userId || !newPassword) {
      return new Response(
        JSON.stringify({ error: 'userId e newPassword são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate password length
    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: 'A password deve ter pelo menos 6 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (newPassword.length > 72) {
      return new Response(
        JSON.stringify({ error: 'A password deve ter no máximo 72 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update user password (reuse supabaseAdmin from admin check)
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (updateError) {
      console.error('Error updating password:', updateError);
      const code = (updateError as { code?: string }).code;
      const isWeak = code === 'weak_password' || updateError.name === 'AuthWeakPasswordError';
      const message = isWeak
        ? 'A palavra-passe é demasiado fraca. Tem de incluir pelo menos uma letra minúscula, uma maiúscula, um número e um símbolo (ex.: ! @ # $ % &).'
        : `Erro ao atualizar password: ${updateError.message}`;
      return new Response(
        JSON.stringify({ error: message, code: code ?? 'update_failed' }),
        { status: isWeak ? 422 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Password reset successful for user ${userId} by admin ${user.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Password atualizada com sucesso',
        user: updatedUser 
      }),
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
