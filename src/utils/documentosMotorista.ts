/**
 * Documentos pessoais do motorista — a lista de tipos e a regra de "o que vale".
 *
 * Um documento que o motorista envia NÃO entra na ficha: fica `pendente` até
 * um gestor o aprovar. Só então a RPC `aprovar_documento_motorista` o copia
 * para a coluna oficial em `motoristas_ativos`. Aqui está a leitura desse
 * estado, pura e testável — o cartão do portal só desenha o que isto devolve.
 */

export type StatusDocumento = 'pendente' | 'aprovado' | 'rejeitado';

export interface DocumentoMotoristaPortal {
  id: string;
  tipo_documento: string;
  nome_ficheiro: string | null;
  /** Caminho no bucket `motorista-documentos`. */
  ficheiro_url: string;
  data_validade: string | null;
  status: StatusDocumento;
  motivo_rejeicao: string | null;
  created_at: string | null;
}

export type ChaveFichaUrl =
  | 'documento_ficheiro_url'
  | 'documento_identificacao_verso_url'
  | 'carta_ficheiro_url'
  | 'carta_conducao_verso_url'
  | 'licenca_tvde_ficheiro_url'
  | 'registo_criminal_url'
  | 'comprovativo_morada_url'
  | 'comprovativo_iban_url';

export type ChaveFichaValidade = 'documento_validade' | 'carta_validade' | 'licenca_tvde_validade';

/** As colunas da ficha (`motoristas_ativos`) que interessam aos documentos. */
export type FichaDocumentos = Partial<Record<ChaveFichaUrl | ChaveFichaValidade, string | null>>;

export interface TipoDocumentoMotorista {
  value: string;
  label: string;
  /** Coluna oficial na ficha. Sem `field`, o documento vive só em `motorista_documentos`. */
  field?: ChaveFichaUrl;
  validityField?: ChaveFichaValidade;
  /** Pasta no bucket. */
  folder: string;
}

/** Espelha o backoffice (MotoristaTabDocumentos) — mesma ordem, mesmos ids. */
export const TIPOS_DOCUMENTO_MOTORISTA: readonly TipoDocumentoMotorista[] = [
  {
    value: 'documento_identificacao',
    label: 'Cartão de Cidadão / Passaporte (Frente)',
    field: 'documento_ficheiro_url',
    validityField: 'documento_validade',
    folder: 'documentos',
  },
  {
    value: 'documento_identificacao_verso',
    label: 'Cartão de Cidadão / Passaporte (Verso)',
    field: 'documento_identificacao_verso_url',
    validityField: 'documento_validade',
    folder: 'documentos',
  },
  {
    value: 'carta_conducao',
    label: 'Carta de Condução (Frente)',
    field: 'carta_ficheiro_url',
    validityField: 'carta_validade',
    folder: 'cartas',
  },
  {
    value: 'carta_conducao_verso',
    label: 'Carta de Condução (Verso)',
    field: 'carta_conducao_verso_url',
    validityField: 'carta_validade',
    folder: 'cartas',
  },
  {
    value: 'licenca_tvde',
    label: 'Licença TVDE',
    field: 'licenca_tvde_ficheiro_url',
    validityField: 'licenca_tvde_validade',
    folder: 'tvde',
  },
  {
    value: 'registo_criminal',
    label: 'Registo Criminal',
    field: 'registo_criminal_url',
    folder: 'documentos',
  },
  {
    value: 'comprovativo_morada',
    label: 'Comprovativo de Morada',
    field: 'comprovativo_morada_url',
    folder: 'documentos',
  },
  {
    value: 'comprovativo_iban',
    label: 'Comprovativo de IBAN',
    field: 'comprovativo_iban_url',
    folder: 'documentos',
  },
  { value: 'outros', label: 'Outros Documentos', folder: 'documentos' },
];

export interface DocumentoOficial {
  ficheiro_url: string;
  nome_ficheiro: string | null;
  validade: string | null;
}

export interface EstadoDocumento {
  /** O que vale hoje: a coluna oficial da ficha ou, na falta dela, o último aprovado. */
  oficial: DocumentoOficial | null;
  /** Enviado pelo motorista, à espera do gestor. */
  pendente: DocumentoMotoristaPortal | null;
  /** Só quando o ÚLTIMO envio foi recusado e ainda não há outro a caminho. */
  rejeitado: DocumentoMotoristaPortal | null;
}

const maisRecentePrimeiro = (a: DocumentoMotoristaPortal, b: DocumentoMotoristaPortal) =>
  (b.created_at ?? '').localeCompare(a.created_at ?? '');

/**
 * Estado de um tipo de documento para este motorista.
 *
 * A ficha ganha sempre: é lá que o gestor aprova. O fallback para o último
 * `aprovado` em `motorista_documentos` cobre dois casos — os tipos sem coluna
 * própria ('outros') e os documentos antigos, de antes de existir aprovação,
 * que ficaram como `aprovado` sem nunca terem sido copiados para a ficha.
 */
export function estadoDocumento(
  tipo: TipoDocumentoMotorista,
  ficha: FichaDocumentos | null,
  documentos: readonly DocumentoMotoristaPortal[]
): EstadoDocumento {
  const doTipo = documentos
    .filter((d) => d.tipo_documento === tipo.value)
    .sort(maisRecentePrimeiro);

  const pendente = doTipo.find((d) => d.status === 'pendente') ?? null;
  const ultimo = doTipo[0] ?? null;
  const rejeitado = !pendente && ultimo?.status === 'rejeitado' ? ultimo : null;

  let oficial: DocumentoOficial | null = null;
  const urlFicha = tipo.field ? ficha?.[tipo.field] : null;
  if (urlFicha) {
    oficial = {
      ficheiro_url: urlFicha,
      nome_ficheiro: tipo.label,
      validade: tipo.validityField ? (ficha?.[tipo.validityField] ?? null) : null,
    };
  } else {
    const aprovado = doTipo.find((d) => d.status === 'aprovado');
    if (aprovado) {
      oficial = {
        ficheiro_url: aprovado.ficheiro_url,
        nome_ficheiro: aprovado.nome_ficheiro,
        validade: aprovado.data_validade,
      };
    }
  }

  return { oficial, pendente, rejeitado };
}
