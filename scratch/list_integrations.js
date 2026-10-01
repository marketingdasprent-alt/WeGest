import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://hkqzzxgeedsmjnhyquke.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_KEY) throw new Error('Configure SUPABASE_SERVICE_ROLE_KEY ou VITE_SUPABASE_PUBLISHABLE_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function listIntegrations() {
  console.log("Listing all integrations...");
  const { data, error } = await supabase
    .from('integracoes')
    .select('*');

  if (error) {
    console.error("Error listing integrations:", error);
    return;
  }

  console.table(data.map(i => ({
    id: i.id,
    nome: i.nome,
    tipo: i.tipo,
    plataforma: i.plataforma_id,
    ativo: i.ativo
  })));
}

listIntegrations();
