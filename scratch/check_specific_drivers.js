import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://hkqzzxgeedsmjnhyquke.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_PUBLISHABLE_KEY) throw new Error('Configure VITE_SUPABASE_PUBLISHABLE_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function checkDrivers() {
  const names = ['Sonia Sousa', 'Cesar Martins', 'Nuno Costa'];
  
  for (const name of names) {
    const { data: motorista, error } = await supabase
      .from('motoristas')
      .select('id, nome, email, uber_uuid, bolt_id, user_id')
      .ilike('nome', `%${name}%`)
      .maybeSingle();
    
    if (error) {
      console.error(`Erro ao buscar ${name}:`, error);
      continue;
    }
    
    if (motorista) {
      console.log(`\nMotorista: ${motorista.nome}`);
      console.log(`- ID: ${motorista.id}`);
      console.log(`- Email: ${motorista.email}`);
      console.log(`- Uber UUID: ${motorista.uber_uuid}`);
      console.log(`- Bolt ID: ${motorista.bolt_id}`);
      console.log(`- User ID: ${motorista.user_id}`);
    } else {
      console.log(`\nMotorista não encontrado: ${name}`);
    }
  }
}

checkDrivers();
