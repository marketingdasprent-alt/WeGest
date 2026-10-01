import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { EmailService } from '../_shared/email/services/EmailService.ts';
import {
  authenticateUser,
  AuthorizationError,
  requireOrgMember,
} from '../_shared/auth/edgeAuthorization.ts';

// Envia a cópia da Folha de Danos por email. Autoriza por token de
// realização ou por sessão membro da org; assunto fixado no servidor
// (auditoria 2026-09-16).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ~10 MB de PDF em base64. Uma folha de danos com fotografias anda na ordem
// de 1-3 MB; acima disto é abuso ou erro.
const MAX_PDF_BASE64_CHARS = 14_000_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SendFolhaDanosEmailRequest {
  to: string;
  toNome?: string;
  /** PDF em base64 puro (sem prefixo data:...;base64,). */
  pdfBase64: string;
  filename: string;
  matricula: string;
  momento: 'ENTREGA' | 'RECOLHA';
  /** Ausente no fluxo por token (sem sessão) — derivado de viaturaId nesse caso. */
  org_id?: string;
  /** Viatura do check-in/check-out — usada para derivar org_id quando org_id é omitido. */
  viaturaId?: string;
  /** Token de realização — via de autorização do check-in/out no terreno. */
  token?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: SendFolhaDanosEmailRequest = await req.json();
    const { to, toNome, pdfBase64, filename, matricula, momento, org_id, viaturaId, token } = body;

    if (!to || !pdfBase64 || !filename || !matricula || (!org_id && !viaturaId)) {
      return json(
        { error: 'to, pdfBase64, filename, matricula e (org_id ou viaturaId) são obrigatórios' },
        400,
      );
    }
    if (typeof pdfBase64 !== 'string' || pdfBase64.length > MAX_PDF_BASE64_CHARS) {
      return json({ error: 'PDF demasiado grande' }, 413);
    }
    if (org_id && !UUID_RE.test(org_id)) return json({ error: 'org_id inválido' }, 400);
    if (viaturaId && !UUID_RE.test(viaturaId)) return json({ error: 'viaturaId inválido' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Organização da viatura (quando indicada) — serve para derivar a org no
    // fluxo por token e para confirmar que a viatura pertence à org autorizada.
    let viaturaOrgId: string | null = null;
    if (viaturaId) {
      const { data: viatura } = await admin
        .from('viaturas')
        .select('org_id')
        .eq('id', viaturaId)
        .maybeSingle();
      viaturaOrgId = viatura?.org_id ?? null;
      if (!viaturaOrgId) return json({ error: 'Viatura não encontrada.' }, 404);
    }

    // ── Autorização ─────────────────────────────────────────────────────────
    let orgId: string | null = null;

    if (token && UUID_RE.test(token)) {
      const { data: tok } = await admin
        .from('realizacao_tokens')
        .select('org_id')
        .eq('id', token)
        .maybeSingle();
      if (tok?.org_id) {
        orgId = tok.org_id;
        if (viaturaOrgId && viaturaOrgId !== orgId) {
          throw new AuthorizationError('A viatura não pertence a esta realização.', 403);
        }
        if (org_id && org_id !== orgId) {
          throw new AuthorizationError('Organização não corresponde ao token.', 403);
        }
      }
    }

    if (!orgId) {
      const authClient = createClient(supabaseUrl, anonKey);
      const user = await authenticateUser(req, {
        getUser: async (jwt) => {
          const { data, error } = await authClient.auth.getUser(jwt);
          return { user: error || !data.user ? null : { id: data.user.id } };
        },
      });

      orgId = org_id ?? viaturaOrgId;
      if (!orgId) throw new AuthorizationError('Sem organização.', 403);
      if (viaturaOrgId && viaturaOrgId !== orgId) {
        throw new AuthorizationError('A viatura não pertence a esta organização.', 403);
      }

      await requireOrgMember(user.id, orgId, async (userId, org) => {
        const { data, error } = await admin
          .from('user_organizacoes')
          .select('is_admin')
          .eq('user_id', userId)
          .eq('org_id', org)
          .maybeSingle();
        return error ? null : data;
      });
    }

    const momentoLabel = momento === 'RECOLHA' ? 'Recolha' : 'Entrega';
    const matriculaLimpa = String(matricula).replace(/[\r\n]/g, ' ').slice(0, 20);
    const subject = `Folha de Danos — ${momentoLabel} — ${matriculaLimpa}`;

    const emailService = new EmailService(admin);
    const result = await emailService.sendFolhaDanos(orgId, {
      to,
      toNome,
      subject,
      pdfBase64,
      filename: String(filename).replace(/[^\w.\-]/g, '_').slice(0, 120),
      viaturaId,
    });

    if (!result.success) throw new Error(result.error || 'Falha ao enviar email');

    return json({ success: true });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return json({ success: false, error: error.message }, error.status);
    }
    console.error('Erro send-folha-danos-email:', error);
    return json({ success: false, error: (error as Error).message || 'Erro interno' }, 500);
  }
});
