#!/usr/bin/env node
/**
 * Script para aplicar migration KeyInvoice ao Supabase
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRole) {
  console.error('❌ Erro: VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRole, {
  auth: { persistSession: false },
});

async function applyMigration() {
  try {
    console.log('📝 Lendo migration...');
    const migrationFile = path.join(
      process.cwd(),
      'supabase/migrations/20260611_create_invoices_table.sql'
    );
    const sql = fs.readFileSync(migrationFile, 'utf-8');

    console.log('🚀 Aplicando migration ao Supabase...');
    
    // Executar SQL via RPC (se disponível) ou via query direta
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      // Se RPC não existe, tentar directo
      console.log('⚠️  RPC não disponível, aplicando SQL direto...');
      // Infelizmente, Supabase client não suporta queries SQL brutas
      // Precisamos de usar psql ou outra ferramenta
      throw new Error('Necessário aplicar via Supabase Dashboard ou psql');
    }

    console.log('✅ Migration aplicada com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao aplicar migration:', error.message);
    process.exit(1);
  }
}

applyMigration();
