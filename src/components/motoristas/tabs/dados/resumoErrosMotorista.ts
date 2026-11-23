import type { FieldErrors, FieldValues } from 'react-hook-form';

const MAX_CAMPOS = 5;

const ROTULOS: Record<string, string> = {
  nome: 'Nome',
  nif: 'NIF',
  email: 'Email',
  telefone: 'Telefone',
  iban: 'IBAN',
  morada: 'Morada',
  codigo_postal: 'Código postal',
  cidade: 'Cidade',
  documento_tipo: 'Tipo de documento',
  documento_numero: 'Nº do documento',
  documento_validade: 'Validade do documento',
  carta_conducao: 'Carta de condução',
  carta_categorias: 'Categorias da carta',
  carta_validade: 'Validade da carta',
  licenca_tvde_numero: 'Licença TVDE',
  licenca_tvde_validade: 'Validade da licença TVDE',
  cartao_frota: 'Cartão frota',
  cartao_bp: 'Cartão BP',
  cartao_repsol: 'Cartão Repsol',
  cartao_edp: 'Cartão EDP',
  data_contratacao: 'Data de contratação',
  retencao_iva_pct: 'IVA (%)',
  retencao_irs_pct: 'IRS (%)',
  corte_sem_recibo_pct: 'Corte sem recibo',
  is_slot: 'Slot',
  slot_valor_semanal: 'Valor do slot',
  slot_semana_cobranca: 'Semana de cobrança do slot',
  seguro_valor_semanal: 'Seguro semanal',
  gestor_responsavel: 'Gestor responsável',
  observacoes: 'Observações',
  uber_uuid: 'ID Uber',
  bolt_id: 'ID Bolt',
};

// Arrays (ex.: carta_categorias) trazem o erro dentro de cada item, não no topo.
function primeiraMensagem(erro: unknown): string {
  if (!erro || typeof erro !== 'object') return '';
  const msg = (erro as { message?: unknown }).message;
  if (typeof msg === 'string' && msg) return msg;
  for (const [chave, filho] of Object.entries(erro)) {
    // `ref` é o elemento do DOM: descer nele não leva a mensagem nenhuma.
    if (chave === 'ref') continue;
    const encontrada = primeiraMensagem(filho);
    if (encontrada) return encontrada;
  }
  return '';
}

/** Campos que travaram a gravação, com o nome: o erro fica longe do botão Guardar. */
export function resumoErrosMotorista(errors: FieldErrors<FieldValues>): string {
  const partes = Object.entries(errors).map(
    ([campo, erro]) =>
      `${ROTULOS[campo] ?? campo}: ${primeiraMensagem(erro) || 'preenchimento inválido'}`
  );
  const mostradas = partes.slice(0, MAX_CAMPOS).join(' · ');
  const resto = partes.length - MAX_CAMPOS;
  return resto > 0 ? `${mostradas} (+${resto})` : mostradas;
}

export function avisoGravacaoInvalida(errors: FieldErrors<FieldValues>): {
  titulo: string;
  descricao: string;
} {
  return {
    titulo: 'Não foi possível guardar: há campos por corrigir na ficha',
    descricao:
      resumoErrosMotorista(errors) || 'Verifica os campos assinalados a vermelho na ficha.',
  };
}
