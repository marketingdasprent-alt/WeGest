// Envio em massa do resumo semanal por e-mail (Brevo). A lógica vive aqui, com
// as dependências injectadas, para se testar sem rede nem base de dados.

export const MAX_MOTORISTAS_POR_PEDIDO = 500;
const ENVIOS_EM_PARALELO = 5;

export interface PedidoEnvioResumos {
  motoristaIds: string[];
  semanaInicio: string;
}

export interface LinhaResumo {
  motoristaId: string;
  orgId: string;
  nome: string;
  email: string | null;
  liquido: number;
  semanaFim: string;
}

export interface FalhaEnvio {
  motoristaId: string;
  nome: string;
  motivo: string;
}

export interface ResultadoEnvioResumos {
  enviados: number;
  semEmail: FalhaEnvio[];
  falhados: FalhaEnvio[];
}

export interface DependenciasEnvio {
  enviarEmail: (linha: LinhaResumo) => Promise<{ success: boolean; error?: string }>;
  marcarEnviados: (motoristaIds: string[]) => Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export function lerPedidoEnvio(body: unknown): PedidoEnvioResumos {
  const b = (body ?? {}) as Record<string, unknown>;
  const ids = b.motoristaIds;
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('motoristaIds é obrigatório');
  if (ids.length > MAX_MOTORISTAS_POR_PEDIDO) {
    throw new Error(`No máximo ${MAX_MOTORISTAS_POR_PEDIDO} motoristas por envio`);
  }
  if (!ids.every((id) => typeof id === 'string' && UUID.test(id))) {
    throw new Error('motoristaIds inválidos');
  }
  if (typeof b.semanaInicio !== 'string' || !DATA.test(b.semanaInicio)) {
    throw new Error('semanaInicio inválida');
  }
  return { motoristaIds: [...new Set(ids as string[])], semanaInicio: b.semanaInicio };
}

export function emailValido(email: string | null | undefined): email is string {
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function enviarResumos(
  linhas: LinhaResumo[],
  deps: DependenciasEnvio
): Promise<ResultadoEnvioResumos> {
  const semEmail: FalhaEnvio[] = [];
  const falhados: FalhaEnvio[] = [];
  const aEnviar: LinhaResumo[] = [];

  for (const l of linhas) {
    if (emailValido(l.email)) aEnviar.push(l);
    else semEmail.push({ motoristaId: l.motoristaId, nome: l.nome, motivo: 'Sem e-mail válido' });
  }

  const enviadosIds: string[] = [];
  for (let i = 0; i < aEnviar.length; i += ENVIOS_EM_PARALELO) {
    const lote = aEnviar.slice(i, i + ENVIOS_EM_PARALELO);
    const resultados = await Promise.allSettled(lote.map((l) => deps.enviarEmail(l)));
    resultados.forEach((r, j) => {
      const l = lote[j];
      if (r.status === 'fulfilled' && r.value.success) enviadosIds.push(l.motoristaId);
      else {
        const motivo =
          r.status === 'fulfilled'
            ? r.value.error || 'Falha no envio'
            : r.reason instanceof Error
              ? r.reason.message
              : String(r.reason);
        falhados.push({ motoristaId: l.motoristaId, nome: l.nome, motivo });
      }
    });
  }

  // Só quem recebeu fica com a semana publicada no perfil.
  if (enviadosIds.length > 0) await deps.marcarEnviados(enviadosIds);

  return { enviados: enviadosIds.length, semEmail, falhados };
}

/** yyyy-MM-dd → dd/MM/yyyy */
export function dataPt(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
