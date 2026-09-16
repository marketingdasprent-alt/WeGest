import { BOLT_DEFAULTS, type BoltCompanyOption } from './types';

export type BoltAuthMode = 'password' | 'oauth';

export type EstadoTesteBolt = 'idle' | 'testing' | 'success' | 'error';

export interface LinhaIntegracaoBolt {
  plataforma?: string | null;
  robot_target_platform?: string | null;
  auth_mode?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
  company_id?: number | null;
  company_name?: string | null;
  robot_portal_email?: string | null;
  robot_portal_password?: string | null;
}

const preenchido = (v: string | null | undefined) => Boolean(v && v.trim());

export function temCredenciaisPortal(linha: LinhaIntegracaoBolt | null | undefined): boolean {
  if (!linha) return false;
  if (preenchido(linha.robot_portal_email) && preenchido(linha.robot_portal_password)) return true;
  return (
    boltAuthMode(linha) !== 'oauth' &&
    preenchido(linha.client_id) &&
    preenchido(linha.client_secret)
  );
}

export function isIntegracaoBolt(linha: LinhaIntegracaoBolt | null | undefined): boolean {
  if (!linha) return false;
  if (linha.plataforma === 'bolt') return true;
  return linha.plataforma === 'robot' && linha.robot_target_platform === 'bolt';
}

export function boltAuthMode(linha: LinhaIntegracaoBolt | null | undefined): BoltAuthMode {
  return linha?.auth_mode === 'oauth' ? 'oauth' : 'password';
}

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

export function etiquetaEmpresaBolt(empresa: BoltCompanyOption): string {
  return empresa.company_name
    ? `${empresa.company_name} (${empresa.company_id})`
    : `#${empresa.company_id}`;
}

export interface EntradaDecisaoBolt {
  contexto: 'criar' | 'editar';
  modoGravado: BoltAuthMode;
  clientId: string;
  clientSecret: string;
  companyId: string;
  estadoTeste: EstadoTesteBolt;
  empresas: BoltCompanyOption[];
  temPortal?: boolean;
}

export interface DecisaoFormularioBolt {
  mostrarAvisoConversao: boolean;
  mostrarCredenciaisPortal: boolean;
  mostrarEmpresas: boolean;
  podeTestar: boolean;
  preenchido: boolean;
  completo: boolean;
  motivo: string | null;
  mostrarImportarCsv: boolean;
  mostrarExecutarRobot: boolean;
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

  const emEdicao = entrada.contexto === 'editar';

  return {
    mostrarAvisoConversao: aindaNoRobo,
    mostrarCredenciaisPortal: emEdicao,
    mostrarEmpresas: entrada.empresas.length > 0,
    podeTestar: clientId !== '' && clientSecret !== '' && entrada.estadoTeste !== 'testing',
    preenchido,
    completo,
    motivo,
    mostrarImportarCsv: true,
    mostrarExecutarRobot: emEdicao && entrada.temPortal === true,
    mostrarSincronizarSemana: emEdicao && entrada.modoGravado === 'oauth',
  };
}

export interface EstadoCredenciaisBolt {
  clientId: string;
  clientSecret: string;
  companyId: string;
  companyName: string | null;
  preenchido: boolean;
  completo: boolean;
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

export interface CredenciaisApiBolt {
  clientId: string;
  clientSecret: string;
  companyId: string | number;
  companyName?: string | null;
}

export function normalizarCompanyId(valor: string | number): number {
  const numero = typeof valor === 'number' ? valor : Number.parseInt(String(valor).trim(), 10);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new Error('Escolha a empresa Bolt desta integração.');
  }
  return numero;
}

function credenciaisLimpas(entrada: CredenciaisApiBolt) {
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
}

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
    apify_api_token: null,
    webhook_url: BOLT_DEFAULTS.site_url,
    cookies_json: null,
    ativo: true,
    sync_automatico: false,
  };
}

export interface EntradaConversaoBolt extends CredenciaisApiBolt {
  portalAnterior?: { email?: string | null; password?: string | null } | null;
}

export function payloadConversaoBolt(entrada: EntradaConversaoBolt): Record<string, unknown> {
  const cred = credenciaisLimpas(entrada);

  const payload: Record<string, unknown> = {
    auth_mode: 'oauth',
    client_id: cred.clientId,
    client_secret: cred.clientSecret,
    company_id: cred.companyId,
    company_name: cred.companyName,
    cookies_json: null,
    sync_automatico: false,
  };

  const email = entrada.portalAnterior?.email?.trim();
  const password = entrada.portalAnterior?.password?.trim();
  if (email && password) {
    payload.robot_portal_email = email;
    payload.robot_portal_password = password;
  }

  return payload;
}

export function payloadCredenciaisPortalBolt(
  email: string,
  password: string
): Record<string, unknown> {
  const emailLimpo = email.trim();
  const passwordLimpa = password.trim();
  if (!emailLimpo || !passwordLimpa) {
    throw new Error('Preencha o email e a password do portal Bolt.');
  }
  return { robot_portal_email: emailLimpo, robot_portal_password: passwordLimpa };
}

function isoLocal(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

export function semanaAnterior(hoje: Date): { inicio: string; fim: string } {
  const referencia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diaSemana = (referencia.getDay() + 6) % 7; // 0 = Segunda … 6 = Domingo

  const inicio = new Date(referencia);
  inicio.setDate(referencia.getDate() - diaSemana - 7);

  const fim = new Date(inicio);
  fim.setDate(inicio.getDate() + 6);

  return { inicio: isoLocal(inicio), fim: isoLocal(fim) };
}

export function semanaDe(dataIso: string): { inicio: string; fim: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) return null;
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  const referencia = new Date(ano, mes - 1, dia);
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

export function periodoTexto(inicio: string, fim: string): string {
  return `${inicio} a ${fim}`;
}
