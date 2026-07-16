import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const url = new URL(req.url);
    const integracaoId = url.searchParams.get('integracao_id');

    if (!integracaoId) {
      return new Response(
        JSON.stringify({ success: false, error: 'integracao_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Verify integration exists
    const { data: config, error: configError } = await supabase
      .from('plataformas_configuracao')
      .select('id, nome, plataforma, robot_target_platform')
      .eq('id', integracaoId)
      .in('plataforma', ['robot', 'via_verde'])
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ success: false, error: 'Integração robot não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Parse the incoming payload from the Apify actor
    const contentType = req.headers.get('content-type') || '';
    let payload: any = {};

    if (contentType.includes('application/json')) {
      payload = await req.json();
    } else {
      const text = await req.text();
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }

    const payloadKeys = Object.keys(payload);
    console.log(`robot-webhook received for integration ${integracaoId} (${config.robot_target_platform}). Keys: [${payloadKeys.join(', ')}]`);
    // Log string field sizes to help identify which field contains the CSV
    for (const [k, v] of Object.entries(payload)) {
      if (typeof v === 'string') console.log(`  key="${k}" length=${v.length}`);
      else if (Array.isArray(v)) console.log(`  key="${k}" array length=${v.length}`);
    }

    // Update ultimo_sync timestamp
    await supabase
      .from('plataformas_configuracao')
      .update({ ultimo_sync: new Date().toISOString() })
      .eq('id', integracaoId);

    // Helper: find any string value that looks like CSV (has newlines + commas)
    const findCsvInPayload = (obj: any): string | null => {
      console.log('robot-webhook: Searching for CSV in payload keys:', Object.keys(obj).join(', '));
      
      // 1. Check known field names (case-insensitive and partial match)
      const knownPatterns = [/csv/i, /data/i, /content/i, /bolt/i, /result/i, /raw/i];
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string' && v.length > 50) {
          if (knownPatterns.some(p => p.test(k))) {
             // Basic CSV validation: must have at least one comma and one newline
             if (v.includes(',') && v.includes('\n')) {
               console.log(`robot-webhook: Found CSV-like content in key "${k}" (length: ${v.length})`);
               return v;
             }
          }
        }
      }

      // 2. Deep search: any string that looks like a CSV (newlines + many commas)
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string' && v.length > 100) {
          const commaCount = (v.match(/,/g) || []).length;
          const newlineCount = (v.match(/\n/g) || []).length;
          if (commaCount > 5 && newlineCount > 1) {
            console.log(`robot-webhook: Deep search match found in key "${k}" (commas: ${commaCount}, lines: ${newlineCount})`);
            return v;
          }
        }
      }

      // 3. Nested object search (in case Apify wraps data)
      for (const v of Object.values(obj)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const nested = findCsvInPayload(v);
          if (nested) return nested;
        }
      }

      return null;
    };

    // Detect Bolt CSV data in payload
    const boltCsvContent = config.robot_target_platform === 'bolt'
      ? (payload.dados_csv_bolt || payload.csv_content || payload.data || payload.dados_csv || payload.raw_csv || findCsvInPayload(payload))
      : payload.dados_csv_bolt;

    if (boltCsvContent) {
      console.log('robot-webhook: Bolt CSV data detected, forwarding to bolt-import-csv');

      const boltResponse = await fetch(
        `${SUPABASE_URL}/functions/v1/bolt-import-csv`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integracao_id: integracaoId,
            dados_csv_bolt: boltCsvContent,
            periodo: payload.periodo || payload.nome_ficheiro || undefined,
            periodo_inicio: payload.periodo_inicio || undefined,
            periodo_fim: payload.periodo_fim || undefined,
          }),
        },
      );

      const boltResult = await boltResponse.json();
      console.log('robot-webhook: bolt-import-csv response:', JSON.stringify(boltResult).substring(0, 500));

      return new Response(
        JSON.stringify({
          success: boltResponse.ok,
          message: boltResponse.ok ? 'Dados Bolt processados com sucesso' : 'Erro ao processar dados Bolt',
          integracao_id: integracaoId,
          import_result: boltResult,
        }),
        { status: boltResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Detect BP fuel CSV data in payload
    const hasBpData = config.robot_target_platform === 'bp'
      ? (payload.combustivel_csv || payload.dados_csv_combustivel || payload.csv_content || payload.data || findCsvInPayload(payload))
      : (payload.combustivel_csv || payload.dados_csv_combustivel);

    if (hasBpData) {
      console.log('robot-webhook: BP fuel CSV data detected, forwarding to bp-import-csv');

      const csvContent = hasBpData;

      const bpResponse = await fetch(
        `${SUPABASE_URL}/functions/v1/bp-import-csv`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integracao_id: integracaoId,
            combustivel_csv: csvContent,
          }),
        },
      );

      const bpResult = await bpResponse.json();
      console.log('robot-webhook: bp-import-csv response:', JSON.stringify(bpResult).substring(0, 500));

      return new Response(
        JSON.stringify({
          success: bpResponse.ok,
          message: bpResponse.ok ? 'Dados BP processados com sucesso' : 'Erro ao processar dados BP',
          integracao_id: integracaoId,
          import_result: bpResult,
        }),
        { status: bpResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Detect Repsol fuel data in payload
    if (config.robot_target_platform === 'repsol') {
      console.log('robot-webhook: Repsol integration detected, forwarding to repsol-import-csv');

      const knownData = payload.combustivel_csv || payload.dados_csv_combustivel || payload.movimentos || payload.data || findCsvInPayload(payload);
      const fallbackArray = !knownData
        ? Object.values(payload).find(v => Array.isArray(v)) as any[] | undefined
        : undefined;
      const repsolData = knownData || fallbackArray;

      const resp = await fetch(
        `${SUPABASE_URL}/functions/v1/repsol-import-csv`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integracao_id: integracaoId,
            combustivel_csv: typeof repsolData === 'string' ? repsolData : null,
            movimentos: Array.isArray(repsolData) ? repsolData : null,
          }),
        },
      );
      
      const result = await resp.json();
      return new Response(
        JSON.stringify({
          success: resp.ok,
          message: resp.ok ? 'Dados Repsol processados com sucesso' : 'Erro ao processar dados Repsol',
          integracao_id: integracaoId,
          import_result: result,
        }),
        { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Detect EDP fuel CSV data in payload
    if (config.robot_target_platform === 'edp') {
      const edpData = payload.combustivel_csv || payload.dados_csv_combustivel || payload.data || findCsvInPayload(payload);
      if (edpData) {
        console.log('robot-webhook: EDP fuel data detected, forwarding to edp-import-csv');
        
        const resp = await fetch(
          `${SUPABASE_URL}/functions/v1/edp-import-csv`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              integracao_id: integracaoId,
              combustivel_csv: edpData,
            }),
          },
        );
        
        const result = await resp.json();
        return new Response(
          JSON.stringify({
            success: resp.ok,
            message: resp.ok ? 'Dados EDP processados com sucesso' : 'Erro ao processar dados EDP',
            integracao_id: integracaoId,
            import_result: result,
          }),
          { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Detect Uber CSV data in payload (flexible)
    const uberPagamentosCsv = payload.pagamentos_csv || payload.dados_csv_pagamentos;
    const uberViagensCsv = payload.viagens_csv || payload.dados_csv_atividades;
    // For robot integrations targeting 'uber', also look for generic CSV fields
    const uberFallbackCsv = config.robot_target_platform === 'uber' && !uberPagamentosCsv && !uberViagensCsv
      ? (payload.csv_content || findCsvInPayload(payload))
      : null;
    const hasUberData = uberPagamentosCsv || uberViagensCsv || uberFallbackCsv;

    if (hasUberData) {
      console.log('robot-webhook: Uber CSV data detected, forwarding to uber-import-reports');

      // Extract original filename so uber-import-reports can parse the period from it
      const nomeOriginal: string = payload.nome_ficheiro || payload.filename || payload.nome_original || '';

      // Build a clean forward body with the correct field names that uber-import-reports expects
      const forwardBody: Record<string, unknown> = {
        integracao_id: integracaoId,
        origem: 'Robot Apify',
        data_extracao: new Date().toISOString(),
      };

      if (uberPagamentosCsv) {
        forwardBody.pagamentos_csv = uberPagamentosCsv;
        forwardBody.nome_pagamentos = payload.nome_pagamentos || nomeOriginal || 'pagamentos.csv';
      }
      if (uberViagensCsv) {
        forwardBody.viagens_csv = uberViagensCsv;
        forwardBody.nome_viagens = payload.nome_viagens || nomeOriginal || 'viagens.csv';
      }

      // Fallback: single CSV detected via generic field — determine type from filename
      if (uberFallbackCsv) {
        const isActivity = /activit|atividade/i.test(nomeOriginal);
        if (isActivity) {
          forwardBody.viagens_csv = uberFallbackCsv;
          forwardBody.nome_viagens = nomeOriginal || 'atividade.csv';
        } else {
          // payments_driver or unknown → treat as pagamentos
          forwardBody.pagamentos_csv = uberFallbackCsv;
          forwardBody.nome_pagamentos = nomeOriginal || 'pagamentos.csv';
        }
      }

      console.log(`robot-webhook: Uber forward — pagamentos=${!!forwardBody.pagamentos_csv}, viagens=${!!forwardBody.viagens_csv}, nome="${nomeOriginal}"`);

      const importResponse = await fetch(
        `${SUPABASE_URL}/functions/v1/uber-import-reports`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(forwardBody),
        },
      );

      const importResult = await importResponse.json();
      console.log('robot-webhook: uber-import-reports response:', JSON.stringify(importResult).substring(0, 500));

      return new Response(
        JSON.stringify({
          success: importResponse.ok,
          message: importResponse.ok ? 'Dados Uber processados com sucesso' : 'Erro ao processar dados Uber',
          integracao_id: integracaoId,
          import_result: importResult,
        }),
        { status: importResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Detect Via Verde transactions data in payload
    // O actor Apify envia EITHER:
    //   - { dados_csv: "<csv content>", periodo_inicio, periodo_fim, ... }
    //   - { transacoes: [...], periodo_inicio, periodo_fim, ... }
    if (config.robot_target_platform === 'viaverde') {
      const viaVerdeCsv =
        payload.dados_csv || payload.csv_content || payload.dados_csv_viaverde || findCsvInPayload(payload);
      const viaVerdeTransacoes = Array.isArray(payload.transacoes) ? payload.transacoes : null;

      if (viaVerdeCsv || viaVerdeTransacoes) {
        console.log('robot-webhook: Via Verde data detected, forwarding to via-verde-import');

        const resp = await fetch(`${SUPABASE_URL}/functions/v1/via-verde-import`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integracao_id: integracaoId,
            conta_id: payload.conta_id || null,
            dados_csv: viaVerdeCsv,
            transacoes: viaVerdeTransacoes,
            periodo_inicio: payload.periodo_inicio || null,
            periodo_fim: payload.periodo_fim || null,
          }),
        });

        const result = await resp.json();
        console.log('robot-webhook: via-verde-import response:', JSON.stringify(result).substring(0, 500));

        return new Response(
          JSON.stringify({
            success: resp.ok,
            message: resp.ok ? 'Dados Via Verde processados com sucesso' : 'Erro ao processar dados Via Verde',
            integracao_id: integracaoId,
            import_result: result,
          }),
          { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // If we reached here, data was technically received but not recognized as a known format
    console.error(`robot-webhook ERROR: Payload for integration ${integracaoId} (${config.nome}) NOT recognized. Keys received:`, Object.keys(payload).join(', '));

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Formato de dados não reconhecido. Nenhum CSV detetado.',
        integracao_id: integracaoId,
        platform: config.robot_target_platform,
        keys_received: Object.keys(payload)
      }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('robot-webhook error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
