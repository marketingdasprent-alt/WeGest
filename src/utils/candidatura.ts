import {
  validarNIF,
  validarCodigoPostal,
  validarNumeroDocumento,
  validarCartaConducao,
  validarTelefone,
  validarEmail,
  validarIBAN,
} from '@/lib/pt-validators';

export const CATEGORIAS_CARTA = [
  'A',
  'A1',
  'A2',
  'AM',
  'B',
  'B1',
  'BE',
  'C',
  'C1',
  'CE',
  'D',
  'D1',
  'DE',
];

export const TIPOS_DOCUMENTO = [
  { value: 'cc', label: 'Cartão de Cidadão (CC)' },
  { value: 'bi', label: 'Bilhete de Identidade (BI)' },
  { value: 'ar', label: 'Autorização de Residência (AR)' },
  { value: 'tr', label: 'Título de Residência' },
  { value: 'passaporte', label: 'Passaporte' },
];

export interface CandidaturaCampos {
  nome: string;
  email: string;
  telefone: string;
  nif: string;
  morada: string;
  cidade: string;
  codigoPostal: string;
  documentoTipo: string;
  documentoNumero: string;
  documentoValidade: string;
  documentoFicheiroUrl: string;
  documentoIdentificacaoVersoUrl: string;
  cartaConducao: string;
  cartaCategorias: string[];
  cartaValidade: string;
  cartaFicheiroUrl: string;
  cartaConducaoVersoUrl: string;
  licencaTvdeNumero: string;
  licencaTvdeValidade: string;
  licencaTvdeFicheiroUrl: string;
  registoCriminalUrl: string;
  comprovativoMoradaUrl: string;
  iban: string;
  comprovativoIbanUrl: string;
}

export function traduzirErro(msg?: string, fallback = 'Ocorreu um erro. Tente novamente.') {
  const m = (msg || '').toLowerCase();
  if (m === 'sem_permissao_guardar')
    return 'Não foi possível guardar — a sua sessão não tem permissões adequadas. Feche a sessão, entre novamente e tente outra vez.';
  if (
    m.includes('row-level security') ||
    m.includes('permission') ||
    m.includes('not authorized') ||
    m.includes('rls')
  )
    return 'Não tem permissão para esta ação. Inicie sessão novamente e tente outra vez.';
  if (m.includes('could not find') && m.includes('column'))
    return 'Erro de base de dados: uma coluna está em falta. O administrador precisa de aplicar a migration mais recente no Supabase.';
  if (m.includes('duplicate') || m.includes('already exists') || m.includes('unique'))
    return 'Já existe um registo com estes dados.';
  if (m.includes('network') || m.includes('failed to fetch') || m.includes('fetch'))
    return 'Falha de ligação. Verifique a sua internet e tente novamente.';
  if (m.includes('jwt') || m.includes('expired') || m.includes('session'))
    return 'A sua sessão expirou. Inicie sessão novamente.';
  if (m.includes('too large') || m.includes('payload'))
    return 'Os ficheiros são demasiado grandes. Reduza o tamanho e tente novamente.';
  return msg || fallback;
}

export function buildValidationErrors(campos: CandidaturaCampos): Record<string, string> {
  const errors: Record<string, string> = {};
  const UPLOAD_HINT = 'carregue o ficheiro (PDF, JPG ou PNG, até 10MB).';

  // Dados Pessoais
  if (!campos.nome.trim()) errors.nome = 'Dados Pessoais — Nome: preencha o seu nome completo.';
  if (!campos.email.trim()) {
    errors.email = 'Dados Pessoais — Email: indique o seu email.';
  } else {
    const r = validarEmail(campos.email);
    if (!r.valid) errors.email = `Dados Pessoais — Email: ${r.message}`;
  }
  if (!campos.telefone.trim()) {
    errors.telefone = 'Dados Pessoais — Telefone: indique o seu número de telefone.';
  } else {
    const r = validarTelefone(campos.telefone);
    if (!r.valid) errors.telefone = `Dados Pessoais — Telefone: ${r.message}`;
  }
  if (!campos.nif.trim()) {
    errors.nif = 'Dados Pessoais — NIF: indique o seu NIF (9 dígitos).';
  } else {
    const r = validarNIF(campos.nif);
    if (!r.valid) errors.nif = `Dados Pessoais — NIF: ${r.message}`;
  }
  if (!campos.morada.trim()) errors.morada = 'Dados Pessoais — Morada: indique a sua morada.';
  if (!campos.cidade.trim()) errors.cidade = 'Dados Pessoais — Cidade: indique a sua cidade.';
  if (!campos.codigoPostal.trim()) {
    errors.codigoPostal = 'Dados Pessoais — Código Postal: indique o código postal (0000-000).';
  } else {
    const r = validarCodigoPostal(campos.codigoPostal);
    if (!r.valid) errors.codigoPostal = `Dados Pessoais — Código Postal: ${r.message}`;
  }
  if (!campos.comprovativoMoradaUrl)
    errors.comprovativoMoradaUrl = `Dados Pessoais — Comprovativo de Morada: ${UPLOAD_HINT}`;

  // Documento de Identificação
  if (!campos.documentoTipo)
    errors.documentoTipo = 'Documento de Identificação — Tipo: selecione o tipo de documento.';
  if (!campos.documentoNumero.trim()) {
    errors.documentoNumero = 'Documento de Identificação — Número: indique o número do documento.';
  } else if (campos.documentoTipo) {
    const r = validarNumeroDocumento(campos.documentoTipo, campos.documentoNumero);
    if (!r.valid) errors.documentoNumero = `Documento de Identificação — Número: ${r.message}`;
  }
  if (!campos.documentoValidade)
    errors.documentoValidade = 'Documento de Identificação — Validade: indique a data de validade.';
  if (!campos.documentoFicheiroUrl)
    errors.documentoFicheiroUrl = `Documento de Identificação — Frente: ${UPLOAD_HINT}`;
  if (!campos.documentoIdentificacaoVersoUrl)
    errors.documentoIdentificacaoVersoUrl = `Documento de Identificação — Verso: ${UPLOAD_HINT}`;

  // Carta de Condução
  if (!campos.cartaConducao.trim()) {
    errors.cartaConducao = 'Carta de Condução — Número: indique o número da carta.';
  } else {
    const r = validarCartaConducao(campos.cartaConducao);
    if (!r.valid) errors.cartaConducao = `Carta de Condução — Número: ${r.message}`;
  }
  if (campos.cartaCategorias.length === 0)
    errors.cartaCategorias =
      'Carta de Condução — Categorias: selecione pelo menos uma categoria (ex.: B).';
  if (!campos.cartaValidade)
    errors.cartaValidade = 'Carta de Condução — Validade: indique a data de validade.';
  if (!campos.cartaFicheiroUrl)
    errors.cartaFicheiroUrl = `Carta de Condução — Frente: ${UPLOAD_HINT}`;
  if (!campos.cartaConducaoVersoUrl)
    errors.cartaConducaoVersoUrl = `Carta de Condução — Verso: ${UPLOAD_HINT}`;

  // Licença TVDE
  if (!campos.licencaTvdeNumero.trim())
    errors.licencaTvdeNumero = 'Licença TVDE — Número: indique o número da licença.';
  if (!campos.licencaTvdeValidade)
    errors.licencaTvdeValidade = 'Licença TVDE — Validade: indique a data de validade.';
  if (!campos.licencaTvdeFicheiroUrl)
    errors.licencaTvdeFicheiroUrl = `Licença TVDE — Ficheiro: ${UPLOAD_HINT}`;

  // Documentos Adicionais
  if (!campos.registoCriminalUrl) errors.registoCriminalUrl = `Registo Criminal: ${UPLOAD_HINT}`;
  if (!campos.iban.trim()) {
    errors.iban = 'Documentos Adicionais — IBAN: indique o seu IBAN.';
  } else {
    const r = validarIBAN(campos.iban);
    if (!r.valid) errors.iban = `Documentos Adicionais — IBAN: ${r.message}`;
  }
  if (!campos.comprovativoIbanUrl)
    errors.comprovativoIbanUrl = `Comprovativo de IBAN: ${UPLOAD_HINT}`;

  return errors;
}
