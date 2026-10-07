import { identidadeDoEvento } from '@/components/admin/automacao/rotulos';

export interface TipoDeNotificacao {
  eventType: string;
  label: string;
  modulo: string;
  /** Sem regra de email activa para o evento, a subscrição não chega a lado nenhum. */
  temAccaoEmail: boolean;
}

export interface GrupoDeTipos {
  modulo: string;
  tipos: TipoDeNotificacao[];
}

// A mesma regra da base de dados (CHECK em notificacao_emails_externos).
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizarEmail(valor: string): string {
  return valor.trim().toLowerCase();
}

export function emailValido(valor: string): boolean {
  return EMAIL_RE.test(normalizarEmail(valor));
}

/**
 * Os tipos que a lista de emails pode subscrever, agrupados por módulo na ordem
 * do editor de automação. Os rótulos vêm do catálogo do servidor; a lista de
 * eventos com acção de email vem das regras da organização.
 */
export function agruparTiposPorModulo(
  eventos: Record<string, { label: string }>,
  eventosComEmail: ReadonlySet<string>
): GrupoDeTipos[] {
  const grupos = new Map<string, TipoDeNotificacao[]>();
  for (const [eventType, evento] of Object.entries(eventos)) {
    const modulo = identidadeDoEvento(eventType).nome;
    const lista = grupos.get(modulo) ?? [];
    lista.push({
      eventType,
      label: evento.label,
      modulo,
      temAccaoEmail: eventosComEmail.has(eventType),
    });
    grupos.set(modulo, lista);
  }
  return [...grupos.entries()].map(([modulo, tipos]) => ({
    modulo,
    tipos: [...tipos].sort((a, b) => a.label.localeCompare(b.label, 'pt')),
  }));
}

export function alternarTipo(tipos: readonly string[], tipo: string, ligado: boolean): string[] {
  const sem = tipos.filter((t) => t !== tipo);
  return ligado ? [...sem, tipo] : sem;
}
