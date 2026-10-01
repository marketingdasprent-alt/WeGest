import * as XLSX from 'xlsx';

import { supabase } from '@/integrations/supabase/client';
import type { Periodo, PlataformaImportacao } from '@/utils/importacaoAutomatica';
import { resumirRespostaImportacao, type ResultadoImportacao } from '@/utils/respostaImportacao';
import { buildSupabaseFunctionUrl } from '@/utils/supabaseFunctionUrl';

/**
 * Lê o ficheiro como texto CSV. Excel passa a CSV com ';' (seguro com decimais
 * e moradas com vírgula), a partir da folha com mais linhas: alguns ficheiros
 * trazem uma capa na 1.ª folha e os movimentos noutra.
 */
export async function lerFicheiroComoTexto(file: File): Promise<string> {
  const nome = file.name.toLowerCase();
  if (!nome.endsWith('.xlsx') && !nome.endsWith('.xls')) return file.text();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  let melhor = '';
  let linhasMelhor = -1;
  for (const folha of wb.SheetNames) {
    const ws = wb.Sheets[folha];
    if (!ws) continue;
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ';', blankrows: false, rawNumbers: false });
    const linhas = csv.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
    if (linhas > linhasMelhor) {
      linhasMelhor = linhas;
      melhor = csv;
    }
  }
  return melhor;
}

export interface PedidoImportacao {
  plataforma: PlataformaImportacao;
  integracaoId: string;
  texto: string;
  nomeFicheiro: string;
  /** Obrigatório na Uber e na Bolt; os outros usam a data de cada linha. */
  periodo: Periodo | null;
  origem: string;
}

const compacto = (d: string) => d.replace(/-/g, '');

export function pedidoParaFuncao(p: PedidoImportacao): {
  url: string;
  body: Record<string, unknown>;
} {
  if (p.plataforma === 'bolt' || p.plataforma === 'uber') {
    if (!p.periodo) throw new Error('Falta a semana do ficheiro.');
  }
  if (p.plataforma === 'bolt') {
    return {
      url: buildSupabaseFunctionUrl('bolt-import-csv'),
      body: {
        integracao_id: p.integracaoId,
        dados_csv_bolt: p.texto,
        periodo: `${p.periodo!.inicio} a ${p.periodo!.fim}`,
        periodo_inicio: p.periodo!.inicio,
        periodo_fim: p.periodo!.fim,
        origem: p.origem,
      },
    };
  }
  if (p.plataforma === 'uber') {
    // O importador tira a semana (e as chaves) do prefixo AAAAMMDD-AAAAMMDD.
    const prefixo = `${compacto(p.periodo!.inicio)}-${compacto(p.periodo!.fim)}`;
    const nome = /^\d{8}-\d{8}/.test(p.nomeFicheiro)
      ? p.nomeFicheiro
      : `${prefixo}-${p.nomeFicheiro}`;
    return {
      url: buildSupabaseFunctionUrl('uber-webhook', { integracao_id: p.integracaoId }),
      body: {
        integracao_id: p.integracaoId,
        dados_csv_brutos: p.texto,
        origem: p.origem,
        nome_original: nome,
        data_extracao: new Date().toISOString(),
        periodo_inicio: p.periodo!.inicio,
        periodo_fim: p.periodo!.fim,
      },
    };
  }
  return {
    url: buildSupabaseFunctionUrl(`${p.plataforma}-import-csv`),
    body: { integracao_id: p.integracaoId, combustivel_csv: p.texto },
  };
}

/** Envia um ficheiro ao importador da plataforma. Falha alto se o importador recusar. */
export async function enviarImportacao(p: PedidoImportacao): Promise<ResultadoImportacao> {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao?.session?.access_token;
  if (!token) throw new Error('Sessão inválida. Inicie sessão novamente.');
  const { url, body } = pedidoParaFuncao(p);
  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = (await resposta.json()) as Record<string, unknown>;
  if (!resposta.ok || data.success === false) {
    throw new Error((data.error as string) || `Erro ${resposta.status}`);
  }
  return resumirRespostaImportacao(data);
}
