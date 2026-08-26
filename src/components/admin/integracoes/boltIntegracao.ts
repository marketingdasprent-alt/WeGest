/**
 * Lógica pura da integração Bolt: que campos mostrar e que payload gravar.
 *
 * Vive fora dos componentes de propósito — é aqui que estão as decisões que
 * mexem em dinheiro (que linha se actualiza, que colunas se escrevem) e essas
 * têm de ser testáveis sem montar um DOM.
 *
 * MODELO (decidido com o utilizador, não revisitar):
 *   A Bolt é UMA plataforma só. Uma integração Bolt é sempre a linha
 *   `plataforma='robot' + robot_target_platform='bolt'`; o que distingue as
 *   duas formas de ligar é o `auth_mode`:
 *     · 'password' → robô Apify com o login do portal (o que as 6 contas
 *       actuais ainda usam);
 *     · 'oauth'    → API oficial Bolt Fleet (client_credentials).
 *
 *   Converter uma conta é uma actualização NO LUGAR: o `id` não muda, porque há
 *   4312 linhas de `bolt_resumos_semanais` agarradas a esse `integracao_id` e o
 *   histórico tem de continuar ligado. Nunca criar uma linha nova para "a
 *   versão API" da mesma conta.
 *
 *   client_id/client_secret são as MESMAS colunas nos dois modos. Converter
 *   substitui o login do portal pelas credenciais da API — é por isso que o
 *   robô deixa de conseguir entrar, e é isso que o aviso de conversão diz.
 *
 * A importação manual do CSV mantém-se em qualquer dos modos (requisito
 * explícito): a API e o CSV são donos de campos diferentes do resumo semanal.
 */

import { BOLT_DEFAULTS, type BoltCompanyOption } from './types';

export type BoltAuthMode = 'password' | 'oauth';

export type EstadoTesteBolt = 'idle' | 'testing' | 'success' | 'error';

/** Só os campos de `plataformas_configuracao` que estas decisões precisam. */
export interface LinhaIntegracaoBolt {
  plataforma?: string | null;
  robot_target_platform?: string | null;
  auth_mode?: string | null;
  client_secret?: string | null;
  company_id?: number | null;
  company_name?: string | null;
}

/**
 * Uma linha de plataformas_configuracao é uma integração Bolt?
 *
 * Aceita também `plataforma='bolt'` — é a forma legada (nenhuma linha em
 * produção, mas o wizard antigo criava assim e não se ganha nada em deixar
 * essas órfãs sem ecrã de edição).
 */
export function isIntegracaoBolt(linha: LinhaIntegracaoBolt | null | undefined): boolean {
  if (!linha) return false;
  if (linha.plataforma === 'bolt') return true;
  return linha.plataforma === 'robot' && linha.robot_target_platform === 'bolt';
}

/** Modo de ligação gravado. Tudo o que não seja 'oauth' conta como robô. */
export function boltAuthMode(linha: LinhaIntegracaoBolt | null | undefined): BoltAuthMode {
  return linha?.auth_mode === 'oauth' ? 'oauth' : 'password';
}

/**
 * Normaliza a lista de empresas devolvida por bolt-test-connection.
 *
 * O getCompanies da Bolt devolve apenas `{ data: { company_ids: number[] } }` —
 * IDs, sem nomes. A edge function tenta enriquecer cada ID com o `company_name`
 * (via getFleetOrders), mas isso é best-effort: se a Bolt não responder, o nome
 * vem a null e mostra-se só o ID. Aceitam-se ambas as formas para o ecrã não
 * partir se a função mudar de formato.
 */
export function normalizarEmpresasBolt(payload: unknown): BoltCompanyOption[] {
  const corpo = payload as
    | { companies?: unknown; company_ids?: unknown; data?: { company_ids?: unknown } }
    | null
    | undefined;
  const bruto = corpo?.companies ?? corpo?.company_ids ?? corpo?.data?.company_ids;
  if (!Array.isArray(bruto)) return [];

  const empresas: BoltCompanyOption[] = [];
  for (const item of bruto) {
    const isObjecto = typeof item === 'object' && item !== null;
    const companyId = Number(isObjecto ? (item as { company_id?: unknown }).company_id : item);
    // Inteiro positivo, e nada mais: `Number(null)` e `Number('')` são 0, e um
    // "#0" na lista de empresas é uma escolha que só falha no primeiro sync.
    if (!Number.isInteger(companyId) || companyId <= 0) continue;
    if (empresas.some((e) => e.company_id === companyId)) continue;

    const nome = isObjecto ? (item as { company_name?: unknown }).company_name : null;
    empresas.push({
      company_id: companyId,
      company_name: typeof nome === 'string' && nome.trim() ? nome.trim() : null,
    });
  }
  return empresas;
}

/** Etiqueta de uma empresa na lista/resumo. Sem nome mostra-se só o ID. */
export function etiquetaEmpresaBolt(empresa: BoltCompanyOption): string {
  return empresa.company_name
    ? `${empresa.company_name} (${empresa.company_id})`
    : `#${empresa.company_id}`;
}

// ---------------------------------------------------------------------------
// Decisão: que campos mostrar e quando é que se pode gravar
// ---------------------------------------------------------------------------

export interface EntradaDecisaoBolt {
  /** 'criar' = wizard de nova integração; 'editar' = integração já existente. */
  contexto: 'criar' | 'editar';
  /** auth_mode gravado na BD (irrelevante em 'criar' — nasce sempre em oauth). */
  modoGravado: BoltAuthMode;
  clientId: string;
  clientSecret: string;
  /** company_id escolhido no Select, em texto (é o valor do Select). */
  companyId: string;
  estadoTeste: EstadoTesteBolt;
  empresas: BoltCompanyOption[];
}

export interface DecisaoFormularioBolt {
  /** Está a converter uma conta do robô: avisar do que muda. */
  mostrarAvisoConversao: boolean;
  /** Credenciais do portal — só enquanto a conta ainda é do robô. */
  mostrarCredenciaisPortal: boolean;
  mostrarEmpresas: boolean;
  podeTestar: boolean;
  /** O utilizador escreveu alguma coisa nos campos da API. */
  preenchido: boolean;
  /** Há credenciais completas e testadas — só assim se gravam. */
  completo: boolean;
  /** O que falta, em português, ou null quando está completo. */
  motivo: string | null;
  /** Importação manual do CSV: sempre, em qualquer modo (requisito). */
  mostrarImportarCsv: boolean;
  /** Executar o robô Apify: só enquanto a conta não foi convertida. */
  mostrarExecutarRobot: boolean;
  /** Sincronizar uma semana pela API: só depois de convertida. */
  mostrarSincronizarSemana: boolean;
}

export function decidirFormularioBolt(entrada: EntradaDecisaoBolt): DecisaoFormularioBolt {
  const clientId = entrada.clientId.trim();
  const clientSecret = entrada.clientSecret.trim();
  const companyId = entrada.companyId.trim();

  const aindaNoRobo = entrada.contexto === 'editar' && entrada.modoGravado === 'password';
  const preenchido = clientId !== '' || clientSecret !== '';
  const completo =
    clientId !== '' && clientSecret !== '' && companyId !== '' && entrada.estadoTeste === 'success';

  let motivo: string | null = null;
  if (!completo) {
    if (!clientId || !clientSecret) {
      motivo = 'Preencha o Client ID e o Client Secret da API Bolt.';
    } else if (entrada.estadoTeste !== 'success') {
      motivo = 'Teste a ligação antes de gravar as credenciais.';
    } else {
      motivo = 'Escolha a empresa Bolt desta integração.';
    }
  }

  return {
    mostrarAvisoConversao: aindaNoRobo,
    mostrarCredenciaisPortal: aindaNoRobo,
    mostrarEmpresas: entrada.empresas.length > 0,
    podeTestar: clientId !== '' && clientSecret !== '' && entrada.estadoTeste !== 'testing',
    preenchido,
    completo,
    motivo,
    mostrarImportarCsv: true,
    mostrarExecutarRobot: aindaNoRobo,
    mostrarSincronizarSemana: entrada.contexto === 'editar' && entrada.modoGravado === 'oauth',
  };
}

/**
 * Resultado do bloco de credenciais, tal como chega a quem o usa (wizard de
 * criação e modal de edição). Vive aqui, e não no componente, para o estado
 * inicial poder ser importado sem arrastar React atrás.
 */
export interface EstadoCredenciaisBolt {
  clientId: string;
  clientSecret: string;
  companyId: string;
  companyName: string | null;
  /** O utilizador escreveu alguma coisa — para não deitar fora o que escreveu. */
  preenchido: boolean;
  /** Credenciais completas e testadas: só assim se gravam. */
  completo: boolean;
  /** O que falta, em português, ou null. */
  motivo: string | null;
}

export const CREDENCIAIS_BOLT_VAZIAS: EstadoCredenciaisBolt = {
  clientId: '',
  clientSecret: '',
  companyId: '',
  companyName: null,
  preenchido: false,
  completo: false,
  motivo: 'Preencha o Client ID e o Client Secret da API Bolt.',
};

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface CredenciaisApiBolt {
  clientId: string;
  clientSecret: string;
  companyId: string | number;
  companyName?: string | null;
}

/**
 * company_id tem de ser o inteiro positivo que a Bolt atribui à frota — um
 * valor a mais ou a menos é dinheiro contabilizado na empresa errada.
 */
export function normalizarCompanyId(valor: string | number): number {
  const numero = typeof valor === 'number' ? valor : Number.parseInt(String(valor).trim(), 10);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new Error('Escolha a empresa Bolt desta integração.');
  }
  return numero;
}

function credenciaisLimpas(entrada: CredenciaisApiBolt) {
  // Espaços colados junto com a chave são a causa nº1 de "credenciais
  // inválidas" que afinal estão certas — a edge function também faz trim.
  const clientId = entrada.clientId.trim();
  const clientSecret = entrada.clientSecret.trim();
  if (!clientId || !clientSecret) {
    throw new Error('Preencha o Client ID e o Client Secret da API Bolt.');
  }
  const nome = entrada.companyName?.trim();
  return {
    clientId,
    clientSecret,
    companyId: normalizarCompanyId(entrada.companyId),
    companyName: nome ? nome : null,
  };
}

export interface EntradaCriacaoBolt extends CredenciaisApiBolt {
  nome: string;
  /**
   * Token Apify de outra integração Bolt, se existir. Best-effort: a linha
   * nasce em oauth e o robô não corre, portanto a falta do token não impede
   * criar a integração (ao contrário das plataformas que só têm robô). Guarda-se
   * na mesma para não ficar por preencher se um dia se voltar ao robô.
   */
  apifyApiToken?: string | null;
}

/**
 * INSERT de uma integração Bolt nova — sempre pela API oficial.
 *
 * `sync_automatico=false` de propósito: o sync automático está desligado à
 * escala do sistema (ver src/config/sync.ts) e antes de o ligar é preciso
 * validar uma semana da API contra o acerto oficial da Bolt (o CSV).
 */
export function payloadCriacaoBolt(entrada: EntradaCriacaoBolt): Record<string, unknown> {
  const nome = entrada.nome.trim();
  if (!nome) {
    throw new Error('Preencha o nome da integração');
  }
  const cred = credenciaisLimpas(entrada);

  return {
    nome,
    plataforma: 'robot',
    robot_target_platform: 'bolt',
    auth_mode: 'oauth',
    client_id: cred.clientId,
    client_secret: cred.clientSecret,
    company_id: cred.companyId,
    company_name: cred.companyName,
    apify_actor_id: BOLT_DEFAULTS.apify_actor_id,
    apify_api_token: entrada.apifyApiToken ?? null,
    webhook_url: BOLT_DEFAULTS.site_url,
    cookies_json: null,
    ativo: true,
    sync_automatico: false,
  };
}

/**
 * UPDATE de conversão/actualização de credenciais — aplicado à MESMA linha.
 *
 * Não devolve `id` nem `plataforma`: quem chama faz `.eq('id', integracao.id)`
 * e a linha mantém-se onde está, com o histórico agarrado a ela. Devolver
 * `plataforma` aqui seria a forma mais fácil de partir isso sem dar por ela.
 */
export function payloadConversaoBolt(entrada: CredenciaisApiBolt): Record<string, unknown> {
  const cred = credenciaisLimpas(entrada);

  return {
    auth_mode: 'oauth',
    client_id: cred.clientId,
    client_secret: cred.clientSecret,
    company_id: cred.companyId,
    company_name: cred.companyName,
    cookies_json: null,
    // O robô Apify deixa de correr nesta conta: as credenciais do portal
    // acabaram de ser substituídas pelas da API e ele já não consegue entrar.
    sync_automatico: false,
  };
}

// ---------------------------------------------------------------------------
// Semana a sincronizar
// ---------------------------------------------------------------------------

function isoLocal(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/**
 * Semana anterior completa, Segunda a Domingo, em datas de calendário locais.
 *
 * Local e não UTC de propósito: o utilizador raciocina em datas do calendário
 * dele, e `toISOString()` em Lisboa no Verão dava o dia anterior.
 */
export function semanaAnterior(hoje: Date): { inicio: string; fim: string } {
  const referencia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diaSemana = (referencia.getDay() + 6) % 7; // 0 = Segunda … 6 = Domingo

  const inicio = new Date(referencia);
  inicio.setDate(referencia.getDate() - diaSemana - 7);

  const fim = new Date(inicio);
  fim.setDate(inicio.getDate() + 6);

  return { inicio: isoLocal(inicio), fim: isoLocal(fim) };
}

/**
 * Semana Segunda–Domingo que CONTÉM a data indicada.
 *
 * É o que permite escolher uma semana qualquer no seletor sem obrigar o
 * utilizador a acertar na segunda-feira certa: escolhe um dia, fica com a
 * semana toda. Necessário para calibrar contra 2026-07-06 e para recuperar
 * as semanas que o robô deixou vazias — nenhuma delas é "a semana anterior".
 *
 * Data inválida devolve null: melhor não sincronizar nada do que sincronizar
 * um período que ninguém pediu.
 */
export function semanaDe(dataIso: string): { inicio: string; fim: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) return null;
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  const referencia = new Date(ano, mes - 1, dia);
  // Construir e reler apanha datas impossíveis (2026-02-31 → 3 de Março).
  if (
    referencia.getFullYear() !== ano ||
    referencia.getMonth() !== mes - 1 ||
    referencia.getDate() !== dia
  ) {
    return null;
  }

  const diaSemana = (referencia.getDay() + 6) % 7; // 0 = Segunda … 6 = Domingo
  const inicio = new Date(referencia);
  inicio.setDate(referencia.getDate() - diaSemana);
  const fim = new Date(inicio);
  fim.setDate(inicio.getDate() + 6);

  return { inicio: isoLocal(inicio), fim: isoLocal(fim) };
}

/**
 * Formato de `bolt_resumos_semanais.periodo`, confirmado contra as 4312 linhas
 * já existentes. Não inventar outro — é chave de leitura em vários ecrãs.
 */
export function periodoTexto(inicio: string, fim: string): string {
  return `${inicio} a ${fim}`;
}
