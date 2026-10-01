// As observações dos leads públicos guardam respostas por campo em JSON; este
// módulo centraliza a leitura para nunca expor esse formato bruto na interface.

export interface RespostaDoLead {
  label: string;
  value: string;
}

interface CampoBruto {
  label?: unknown;
  value?: unknown;
}

export function respostasDoLead(observacoes: string | null | undefined): RespostaDoLead[] {
  if (!observacoes?.trim()) return [];

  let dados: unknown;
  try {
    dados = JSON.parse(observacoes);
  } catch {
    return [];
  }

  if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) return [];

  const respostas: RespostaDoLead[] = [];
  for (const [chave, bruto] of Object.entries(dados as Record<string, CampoBruto>)) {
    // Só chaves do formulário público; texto manual em JSON não é uma resposta.
    if (!chave.startsWith('field_')) continue;
    if (typeof bruto !== 'object' || bruto === null) continue;

    const label = typeof bruto.label === 'string' ? bruto.label.trim() : '';
    const value =
      bruto.value === null || bruto.value === undefined ? '' : String(bruto.value).trim();
    if (!label || !value) continue;

    respostas.push({ label, value });
  }

  return respostas;
}

export function saoRespostasDeFormulario(observacoes: string | null | undefined): boolean {
  return respostasDoLead(observacoes).length > 0;
}

export function observacoesLegiveis(observacoes: string | null | undefined): string {
  const respostas = respostasDoLead(observacoes);
  if (respostas.length === 0) return observacoes?.trim() ?? '';
  return respostas.map((r) => `${r.label}: ${r.value}`).join(' · ');
}
