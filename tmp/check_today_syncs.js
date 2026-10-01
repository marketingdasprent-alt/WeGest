// Check today's sync queue activity
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hkqzzxgeedsmjnhyquke.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_KEY) throw new Error('Configure VITE_SUPABASE_PUBLISHABLE_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  console.log(`\n📅 A verificar sincronizações desde: ${today.toLocaleString('pt-PT')}\n`);

  // 1. Sync Queue - actividade de hoje
  const { data: queue, error: queueError } = await supabase
    .from('sync_queue')
    .select('*')
    .gte('created_at', todayISO)
    .order('created_at', { ascending: false });

  if (queueError) {
    console.error('❌ Erro ao ler sync_queue:', queueError.message);
  } else if (!queue || queue.length === 0) {
    console.log('⚠️  Nenhuma entrada na sync_queue hoje.');
  } else {
    console.log(`📋 SYNC QUEUE (${queue.length} entradas hoje):`);
    console.log('─'.repeat(80));
    for (const item of queue) {
      const icon = item.status === 'completed' ? '✅' : item.status === 'failed' ? '❌' : item.status === 'running' ? '🔄' : '⏳';
      const created = new Date(item.created_at).toLocaleString('pt-PT');
      const completed = item.completed_at ? new Date(item.completed_at).toLocaleString('pt-PT') : '-';
      console.log(`${icon} [${item.status.toUpperCase()}] ${item.plataforma} (integ: ${item.integracao_id})`);
      console.log(`   Criado: ${created}  |  Concluído: ${completed}`);
      if (item.error_message) {
        console.log(`   ⚠️  Erro: ${item.error_message}`);
      }
      console.log();
    }
  }

  // 2. Estado das integrações configuradas
  const { data: configs, error: configError } = await supabase
    .from('plataformas_configuracao')
    .select('id, plataforma, robot_target_platform, sync_automatico, intervalo_sync_horas, ultimo_sync, ativo')
    .eq('ativo', true)
    .order('plataforma');

  if (configError) {
    console.error('❌ Erro ao ler plataformas_configuracao:', configError.message);
  } else if (configs && configs.length > 0) {
    console.log(`\n⚙️  INTEGRAÇÕES ACTIVAS (${configs.length}):`);
    console.log('─'.repeat(80));
    const now = Date.now();
    for (const cfg of configs) {
      const nome = cfg.robot_target_platform || cfg.plataforma;
      const autoIcon = cfg.sync_automatico ? '🤖' : '🔴';
      const lastSync = cfg.ultimo_sync ? new Date(cfg.ultimo_sync) : null;
      const lastSyncStr = lastSync ? lastSync.toLocaleString('pt-PT') : 'Nunca';
      const hoursAgo = lastSync ? ((now - lastSync.getTime()) / 1000 / 60 / 60).toFixed(1) : 'N/A';
      const intervalH = cfg.intervalo_sync_horas || 168;
      const nextSyncAt = lastSync ? new Date(lastSync.getTime() + intervalH * 60 * 60 * 1000) : null;
      const nextSyncStr = nextSyncAt ? nextSyncAt.toLocaleString('pt-PT') : '-';
      const isOverdue = nextSyncAt ? nextSyncAt.getTime() < now : false;

      console.log(`${autoIcon} ${nome.toUpperCase()} [${cfg.plataforma}]`);
      console.log(`   Auto-sync: ${cfg.sync_automatico ? 'SIM' : 'NÃO'} | Intervalo: ${intervalH}h`);
      console.log(`   Último sync: ${lastSyncStr} (há ${hoursAgo}h)`);
      console.log(`   Próximo sync: ${nextSyncStr} ${isOverdue ? '⚠️  ATRASADO!' : '✅'}`);
      console.log();
    }
  }

  // 3. Pending items na queue agora
  const { data: pending } = await supabase
    .from('sync_queue')
    .select('*')
    .in('status', ['pending', 'running']);

  if (pending && pending.length > 0) {
    console.log(`\n🔄 ITENS PENDENTES/A CORRER AGORA (${pending.length}):`);
    for (const p of pending) {
      console.log(`   [${p.status}] ${p.plataforma} - criado ${new Date(p.created_at).toLocaleString('pt-PT')}`);
    }
    console.log();
  }
}

main().catch(console.error);
