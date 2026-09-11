import { createClient } from "npm:@supabase/supabase-js@2.105.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeStr(str: string): string {
  if (!str) return '';
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Iniciando reparação global de mapeamentos...");

    // 1. Buscar todos os motoristas ativos
    const { data: motoristas, error: motError } = await supabase
      .from("motoristas_ativos")
      .select("id, nome, email, telefone, bolt_id, uber_uuid");

    if (motError) throw motError;

    // 2. Buscar todos os resumos Bolt que têm identificador_motorista
    const { data: resumos, error: resError } = await supabase
      .from("bolt_resumos_semanais")
      .select("motorista_nome, identificador_motorista, telefone, email, motorista_id")
      .not("identificador_motorista", "is", null);

    if (resError) throw resError;

    let totalMapped = 0;
    const updates = [];

    for (const m of motoristas) {
      if (m.bolt_id) continue; // Já tem ID

      const mNorm = normalizeStr(m.nome);
      const mPhone = m.telefone ? m.telefone.replace(/\D/g, '').slice(-9) : null;
      const mEmail = m.email?.toLowerCase().trim();

      // Procurar nos resumos
      const match = resumos.find(r => {
        const rNorm = normalizeStr(r.motorista_nome || '');
        const rPhone = r.telefone ? r.telefone.replace(/\D/g, '').slice(-9) : null;
        const rEmail = r.email?.toLowerCase().trim();

        // Match por Nome Exato
        if (rNorm === mNorm) return true;
        
        // Match por Telefone
        if (mPhone && rPhone && mPhone === rPhone) return true;

        // Match por Email
        if (mEmail && rEmail && mEmail === rEmail) return true;

        // Fuzzy Match (Partes do nome)
        const mParts = mNorm.split(' ').filter(p => p.length > 2);
        const rParts = rNorm.split(' ').filter(p => p.length > 2);
        
        if (mParts.length >= 2 && rParts.length >= 2) {
          // Se todas as partes do nome da Bolt estão no nome do sistema
          if (rParts.every(p => mNorm.includes(p))) return true;
          // Se todas as partes do nome do sistema estão no nome da Bolt
          if (mParts.every(p => rNorm.includes(p))) return true;
        }

        return false;
      });

      if (match) {
        console.log(`Match encontrado: ${m.nome} -> ${match.identificador_motorista}`);
        updates.push(
          supabase
            .from("motoristas_ativos")
            .update({ bolt_id: match.identificador_motorista })
            .eq("id", m.id)
        );

        // Também atualizar o resumo se ele não tiver motorista_id
        if (!match.motorista_id) {
            updates.push(
                supabase
                    .from("bolt_resumos_semanais")
                    .update({ motorista_id: m.id })
                    .eq("identificador_motorista", match.identificador_motorista)
                    .eq("motorista_nome", match.motorista_nome)
            );
        }
        
        totalMapped++;
      }
    }

    // Executar atualizações em lotes
    if (updates.length > 0) {
        await Promise.all(updates);
    }

    return new Response(
      JSON.stringify({ success: true, mapped: totalMapped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
