import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4';
import { z } from 'npm:zod@3.23.8';
import {
  accountCorsHeaders, accountErrorResponse, accountResponse,
  authenticateAccountRequest, requireAccountAdmin,
} from '../_shared/auth/accountRequests.ts';

const createUserSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(6).max(72),
  cargo_id: z.string().uuid().nullable().default(null),
  org_id: z.string().uuid(),
}).strict();

export async function handleCreateUser(req: Request, client: SupabaseClient): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: accountCorsHeaders });
  if (req.method !== 'POST') return accountResponse({ error: 'Método não permitido' }, 405);
  try {
    const user = await authenticateAccountRequest(req, client);
    const input = createUserSchema.parse(await req.json());
    await requireAccountAdmin(client, user.id, input.org_id);

    let cargoNome: string | null = null;
    if (input.cargo_id) {
      const { data: cargo, error } = await client.from('cargos').select('id, nome, org_id')
        .eq('id', input.cargo_id).eq('org_id', input.org_id).maybeSingle();
      if (error) throw error;
      if (!cargo || cargo.org_id !== input.org_id) {
        return accountResponse({ error: 'Grupo inválido para esta organização' }, 400);
      }
      cargoNome = cargo.nome;
    }

    // O trigger cria profile e membership; a atualização abaixo sincroniza o papel por org.
    const { data, error } = await client.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { nome: input.nome, cargo_nome: cargoNome },
      app_metadata: { org_id: input.org_id, cargo_id: input.cargo_id, tipo_utilizador: 'colaborador' },
    });
    if (!error) {
      if (!data.user) throw new Error('Conta criada sem utilizador');
      const isAdmin = (cargoNome ?? '').toLowerCase().includes('admin');
      const { error: roleError } = await client.from('user_organizacoes')
        .update({ cargo_id: input.cargo_id, is_admin: isAdmin })
        .eq('user_id', data.user.id).eq('org_id', input.org_id);
      if (roleError) throw roleError;
      // Só numa conta acabada de criar: o trigger grava false e a política de
      // convites (mt_convites_admin_manage) lê profiles.is_admin.
      const { error: profileError } = await client.from('profiles')
        .update({ is_admin: isAdmin }).eq('id', data.user.id);
      if (profileError) throw profileError;
      return accountResponse({ success: true, status: 'created' });
    }
    if (error.code !== 'email_exists' && error.code !== 'user_already_exists' &&
      !/already (been )?registered/i.test(error.message)) {
      return accountResponse({ error: error.message }, 400);
    }

    // Uma conta global existente só recebe pertença após aceitar o convite autenticada.
    let pendingQuery = client.from('convites').select('token, expires_at')
      .eq('email', input.email).eq('org_id', input.org_id).eq('usado', false)
      .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1);
    pendingQuery = input.cargo_id ? pendingQuery.eq('cargo_id', input.cargo_id) : pendingQuery.is('cargo_id', null);
    const { data: pending, error: pendingError } = await pendingQuery.maybeSingle();
    if (pendingError) throw pendingError;
    if (pending) return accountResponse({ success: true, status: 'invited', invite: pending });

    const { data: invite, error: inviteError } = await client.from('convites').insert({
      email: input.email, org_id: input.org_id, cargo_id: input.cargo_id,
      token: crypto.randomUUID().replaceAll('-', ''), usado: false,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }).select('token, expires_at').single();
    if (inviteError) throw inviteError;
    return accountResponse({ success: true, status: 'invited', invite });
  } catch (error: unknown) {
    return accountErrorResponse(error);
  }
}

