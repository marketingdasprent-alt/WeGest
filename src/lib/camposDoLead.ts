// O que o lead respondeu no formulário, em texto que se lê.
//
// `leads_dasprent.observacoes` guarda as respostas do formulário público em
// JSON: `{"field_123": {"label": "Telemóvel", "value": "+351 …", "type": "phone"}}`.
// Guardar assim é acertado — preserva as perguntas tal como foram feitas, que
// mudam de formulário para formulário.
//
// O problema é que cada ecrã tratou disso à sua maneira: a ficha do lead
// interpreta o JSON, o cartão do CRM esconde-o, e o kanban despejava-o em
// bruto no cartão — o gestor via `{"field_1788276699230":{"label":"Qual é a
// sua situação atual?","value":"Já tenho…` em vez da resposta.
//
// Passa a haver um sítio só que sabe ler este formato.

export interface RespostaDoLead {
  label: string;
  value: string;
}

interface CampoBruto {
  label?: unknown;
  value?: unknown;
}

/** As respostas do formulário, ou `[]` se as observações não forem deste formato. */
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
    // Só as chaves do formulário público. Uma observação escrita à mão que por
    // acaso seja JSON não é tratada como respostas.
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

/** true quando as observações são respostas de formulário, e não texto escrito à mão. */
export function saoRespostasDeFormulario(observacoes: string | null | undefined): boolean {
  return respostasDoLead(observacoes).length > 0;
}

/**
 * As observações prontas a mostrar num cartão ou numa lista.
 *
 * Respostas de formulário viram `Pergunta: resposta · Pergunta: resposta`;
 * texto escrito à mão passa tal como está. É isto que quem chama deve mostrar,
 * em vez do campo em bruto.
 */
export function observacoesLegiveis(observacoes: string | null | undefined): string {
  const respostas = respostasDoLead(observacoes);
  if (respostas.length === 0) return observacoes?.trim() ?? '';
  return respostas.map((r) => `${r.label}: ${r.value}`).join(' · ');
}
