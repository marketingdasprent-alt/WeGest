/**
 * Catálogo MESTRE de campos dinâmicos dos templates de documentos.
 *
 * Esta lista é a única fonte de verdade da PALETA do editor de templates.
 * Cada campo tem uma `chave` canónica — o placeholder real inserido no
 * template é sempre `{{chave}}`. A resolução (substituição → valor) vive em
 * `src/utils/generateDocumentFromTemplate.ts` e usa exactamente estas chaves.
 *
 * A customização por organização (tabela `org_campos_dinamicos`) só altera:
 *   • quais campos aparecem (ativo)
 *   • a ordem
 *   • o RÓTULO mostrado no chip (label) — NUNCA a chave
 *
 * Por isso renomear/esconder campos não afecta a geração do PDF: o chip
 * continua a inserir `{{chave}}`.
 *
 * IMPORTANTE: ao adicionar um campo aqui, garante que a resolução o suporta
 * (senão fica por substituir no documento gerado).
 */

/** Categorias base (código). O provider pode criar outras (string livre). */
export type BaseCategoria = 'motorista' | 'cliente' | 'empresa' | 'viatura' | 'contrato' | 'danos';
/** Uma categoria pode ser uma das base OU uma criada pelo provider. */
export type CampoCategoria = string;

export interface CampoDinamico {
  chave: string;
  /** Rótulo default (a org pode sobrepor). */
  label: string;
  categoria: CampoCategoria;
  /** Campos criados pelo provider: chave canónica do sistema a que mapeia
   *  (alias). Indefinido nos campos base do código. */
  fonte?: string;
  /** true se veio da BD (criado pelo provider) — editável/apagável. */
  custom?: boolean;
}

/** Linha da tabela campos_catalogo (campo custom criado pelo provider). */
export interface CampoCatalogoCustom {
  id: string;
  chave: string;
  label: string;
  categoria: CampoCategoria;
  fonte: string;
}

export const CATEGORIA_LABELS: Record<BaseCategoria, string> = {
  motorista: 'Motorista',
  cliente: 'Cliente',
  empresa: 'Empresa',
  viatura: 'Viatura',
  contrato: 'Contrato',
  danos: 'Folha de Danos',
};

export const CATEGORIA_ORDEM: BaseCategoria[] = [
  'motorista',
  'cliente',
  'empresa',
  'viatura',
  'contrato',
  'danos',
];

/** Rótulo de uma categoria: base → traduzido; custom → o próprio nome. */
export function labelCategoria(cat: string): string {
  return (CATEGORIA_LABELS as Record<string, string>)[cat] ?? cat;
}

/**
 * Categorias ordenadas presentes num conjunto de campos: primeiro as base
 * (na ordem fixa), depois as criadas pelo provider (ordem de aparição).
 */
export function categoriasOrdenadas(campos: { categoria: string }[]): string[] {
  const presentes = new Set(campos.map((c) => c.categoria));
  const base = CATEGORIA_ORDEM.filter((c) => presentes.has(c));
  const extra: string[] = [];
  for (const c of campos) {
    if (!CATEGORIA_ORDEM.includes(c.categoria as BaseCategoria) && !extra.includes(c.categoria)) {
      extra.push(c.categoria);
    }
  }
  return [...base, ...extra];
}

export const CAMPOS_CATALOGO: CampoDinamico[] = [
  // ── Motorista ──────────────────────────────────────────────
  { chave: 'motorista_nome', label: 'Nome', categoria: 'motorista' },
  { chave: 'motorista_nif', label: 'NIF', categoria: 'motorista' },
  { chave: 'motorista_documento_tipo', label: 'Tipo de documento', categoria: 'motorista' },
  { chave: 'motorista_documento_numero', label: 'Nº de documento', categoria: 'motorista' },
  { chave: 'motorista_documento_validade', label: 'Validade do documento', categoria: 'motorista' },
  { chave: 'motorista_morada', label: 'Morada', categoria: 'motorista' },
  { chave: 'motorista_email', label: 'Email', categoria: 'motorista' },
  { chave: 'motorista_telefone', label: 'Telefone', categoria: 'motorista' },
  { chave: 'motorista_iban', label: 'IBAN', categoria: 'motorista' },
  { chave: 'carta_conducao', label: 'Carta de condução', categoria: 'motorista' },
  { chave: 'carta_categorias', label: 'Categorias da carta', categoria: 'motorista' },
  { chave: 'carta_validade', label: 'Validade da carta', categoria: 'motorista' },
  { chave: 'cmtvde_numero', label: 'Nº licença TVDE', categoria: 'motorista' },
  { chave: 'cmtvde_validade', label: 'Validade licença TVDE', categoria: 'motorista' },
  { chave: 'cartao_frota_marca', label: 'Marca do cartão frota', categoria: 'motorista' },
  { chave: 'cartao_frota_numero', label: 'Nº do cartão frota', categoria: 'motorista' },
  { chave: 'cartao_frota_validade', label: 'Validade do cartão frota', categoria: 'motorista' },
  { chave: 'cartao_frota_limite', label: 'Limite do cartão frota', categoria: 'motorista' },

  // ── Cliente (renting) ──────────────────────────────────────
  { chave: 'cliente_nome', label: 'Nome', categoria: 'cliente' },
  { chave: 'cliente_nif', label: 'NIF', categoria: 'cliente' },
  { chave: 'cliente_email', label: 'Email', categoria: 'cliente' },
  { chave: 'cliente_telefone', label: 'Telefone', categoria: 'cliente' },
  { chave: 'cliente_morada', label: 'Morada', categoria: 'cliente' },
  { chave: 'cliente_codigo_postal', label: 'Código postal', categoria: 'cliente' },
  { chave: 'cliente_cidade', label: 'Cidade', categoria: 'cliente' },
  { chave: 'cliente_data_nascimento', label: 'Data de nascimento', categoria: 'cliente' },
  { chave: 'cliente_nome_comercial', label: 'Nome comercial (empresa)', categoria: 'cliente' },
  { chave: 'cliente_sede', label: 'Sede (empresa)', categoria: 'cliente' },
  { chave: 'cliente_representante', label: 'Representante (empresa)', categoria: 'cliente' },
  {
    chave: 'cliente_cargo_representante',
    label: 'Cargo do representante (empresa)',
    categoria: 'cliente',
  },

  // ── Empresa ────────────────────────────────────────────────
  { chave: 'empresa_nome_completo', label: 'Nome completo', categoria: 'empresa' },
  { chave: 'empresa_nif', label: 'NIF', categoria: 'empresa' },
  { chave: 'empresa_sede', label: 'Sede', categoria: 'empresa' },
  { chave: 'empresa_licenca_tvde', label: 'Licença TVDE', categoria: 'empresa' },
  { chave: 'empresa_licenca_validade', label: 'Validade licença TVDE', categoria: 'empresa' },
  { chave: 'empresa_representante', label: 'Representante', categoria: 'empresa' },
  { chave: 'empresa_cargo_representante', label: 'Cargo do representante', categoria: 'empresa' },
  { chave: 'colaborador_nome', label: 'Colaborador (quem gera)', categoria: 'empresa' },

  // ── Viatura ────────────────────────────────────────────────
  { chave: 'viatura_matricula', label: 'Matrícula', categoria: 'viatura' },
  { chave: 'viatura_data_matricula', label: 'Data da matrícula', categoria: 'viatura' },
  { chave: 'viatura_marca_modelo', label: 'Marca e modelo', categoria: 'viatura' },
  { chave: 'viatura_grupo', label: 'Grupo', categoria: 'viatura' },
  { chave: 'viatura_kms', label: 'Kms', categoria: 'viatura' },
  {
    chave: 'viatura_combustivel_saida',
    label: 'Combustível/Bateria na entrega',
    categoria: 'viatura',
  },

  // ── Contrato ───────────────────────────────────────────────
  { chave: 'numero_contrato', label: 'Nº do contrato', categoria: 'contrato' },
  { chave: 'data_inicio', label: 'Data de início', categoria: 'contrato' },
  { chave: 'data_fim', label: 'Data de fim', categoria: 'contrato' },
  { chave: 'data_assinatura', label: 'Data de assinatura', categoria: 'contrato' },
  { chave: 'cidade_assinatura', label: 'Cidade de assinatura', categoria: 'contrato' },
  { chave: 'duracao_meses', label: 'Duração (meses)', categoria: 'contrato' },
  { chave: 'dias', label: 'Nº de dias', categoria: 'contrato' },
  { chave: 'tarifa_diaria', label: 'Tarifa diária', categoria: 'contrato' },
  { chave: 'franquia', label: 'Franquia', categoria: 'contrato' },
  { chave: 'caucao', label: 'Caução', categoria: 'contrato' },
  { chave: 'kms_incluidos', label: 'Kms incluídos', categoria: 'contrato' },
  { chave: 'km_adicional', label: 'Km adicional', categoria: 'contrato' },
  { chave: 'subtotal', label: 'Subtotal', categoria: 'contrato' },
  { chave: 'iva', label: 'IVA', categoria: 'contrato' },
  { chave: 'total', label: 'Total', categoria: 'contrato' },
  { chave: 'observacoes', label: 'Observações', categoria: 'contrato' },
  { chave: 'data_atual', label: 'Data actual', categoria: 'contrato' },
  { chave: 'data_atual_extenso', label: 'Data actual (extenso)', categoria: 'contrato' },

  // ── Folha de Danos (templates anexo_danos) ──────────────────
  { chave: 'momento_folha', label: 'Momento (ENTREGA/RECOLHA)', categoria: 'danos' },
  { chave: 'secao_danos', label: 'Secção de danos (tabela+fotos+QR)', categoria: 'danos' },
  { chave: 'observacoes_momento', label: 'Observações do momento', categoria: 'danos' },
  { chave: 'km_saida', label: 'KM saída', categoria: 'danos' },
  { chave: 'km_entrada', label: 'KM entrada', categoria: 'danos' },
  { chave: 'combustivel_saida', label: 'Combustível saída', categoria: 'danos' },
  { chave: 'combustivel_entrada', label: 'Combustível entrada', categoria: 'danos' },
];

/** Override por organização (linha em org_campos_dinamicos). */
export interface CampoOverride {
  chave: string;
  label: string | null;
  ordem: number;
  ativo: boolean;
}

/** Campo já resolvido para a paleta (catálogo + override da org). */
export interface CampoEfetivo extends CampoDinamico {
  ativo: boolean;
  ordem: number;
}

/** Catálogo completo = base do código + campos custom (provider). */
export function catalogoCompleto(custom: CampoCatalogoCustom[] = []): CampoDinamico[] {
  return [
    ...CAMPOS_CATALOGO,
    ...custom.map((c) => ({
      chave: c.chave,
      label: c.label,
      categoria: c.categoria,
      fonte: c.fonte,
      custom: true as const,
    })),
  ];
}

/**
 * Funde o catálogo (base + custom) com os overrides da org → paleta efectiva.
 * Sem overrides (fail-open) devolve o catálogo todo, visível, na ordem default.
 */
export function resolverCampos(
  overrides: CampoOverride[],
  catalogo: CampoDinamico[] = CAMPOS_CATALOGO
): CampoEfetivo[] {
  const porChave = new Map(overrides.map((o) => [o.chave, o]));
  return catalogo.map((campo, idx) => {
    const ov = porChave.get(campo.chave);
    return {
      ...campo,
      label: ov?.label?.trim() ? ov.label : campo.label,
      ativo: ov ? ov.ativo : true,
      ordem: ov && Number.isFinite(ov.ordem) ? ov.ordem : idx,
    };
  });
}
