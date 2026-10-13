import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import { AuthorizationError, requireInternalRequest } from "../_shared/auth/edgeAuthorization.ts";
import { criarMatcherMotoristas } from "../_shared/bolt-import-csv/parse.ts";
import { fichaDaContaPorContacto } from "../_shared/bolt/fichaDaConta.ts";

// Reparação de mapeamentos motorista ↔ Bolt. Ferramenta operacional interna,
// sempre limitada a uma org (fuzzy match entre tenants era um risco real —
// auditoria 2026-09-16).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    requireInternalRequest(req, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const orgId = typeof body?.org_id === "string" ? body.org_id : "";
    if (!UUID_RE.test(orgId)) {
      return json({ success: false, error: "org_id (uuid) é obrigatório" }, 400);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Iniciando reparação de mapeamentos na org ${orgId}...`);

    // 1. Motoristas ativos DESTA org
    const { data: motoristas, error: motError } = await supabase
      .from("motoristas_ativos")
      .select("id, nome, email, telefone, bolt_id, uber_uuid")
      .eq("org_id", orgId);

    if (motError) throw motError;

    // 2. Resumos Bolt DESTA org que têm identificador_motorista
    const { data: resumos, error: resError } = await supabase
      .from("bolt_resumos_semanais")
      .select("motorista_nome, identificador_motorista, telefone, email, motorista_id")
      .eq("org_id", orgId)
      .not("identificador_motorista", "is", null);

    if (resError) throw resError;

    let totalMapped = 0;
    const updates = [];

    // Só pelo telefone ou email da conta. A comparação por partes do nome
    // ligou "Fabio Silva", "João Santos", "Jorge Silva" e "José Silva" às
    // fichas erradas (2026-10-12): a Bolt de um ia para as contas de outro.
    const matcher = criarMatcherMotoristas(motoristas ?? []);
    const comBoltId = new Set((motoristas ?? []).filter((m) => m.bolt_id).map((m) => m.id));
    const contasVistas = new Set<string>();

    for (const r of resumos ?? []) {
      if (r.motorista_id || contasVistas.has(r.identificador_motorista)) continue;
      contasVistas.add(r.identificador_motorista);

      const fichaId = fichaDaContaPorContacto({ telefone: r.telefone, email: r.email }, matcher);
      if (!fichaId || comBoltId.has(fichaId)) continue;
      comBoltId.add(fichaId);

      console.log(`Ligada pelo contacto: ${r.motorista_nome} -> ${fichaId}`);
      updates.push(
        supabase
          .from("motoristas_ativos")
          .update({ bolt_id: r.identificador_motorista })
          .eq("id", fichaId)
          .eq("org_id", orgId)
      );
      updates.push(
        supabase
          .from("bolt_resumos_semanais")
          .update({ motorista_id: fichaId })
          .eq("org_id", orgId)
          .eq("identificador_motorista", r.identificador_motorista)
          .is("motorista_id", null)
      );
      totalMapped++;
    }

    // Executar atualizações em lotes
    if (updates.length > 0) {
        await Promise.all(updates);
    }

    return json({ success: true, org_id: orgId, mapped: totalMapped });

  } catch (error) {
    if (error instanceof AuthorizationError) {
      return json({ success: false, error: error.message }, error.status);
    }
    const message = error instanceof Error ? error.message : 'Erro interno';
    return json({ success: false, error: message }, 500);
  }
});
