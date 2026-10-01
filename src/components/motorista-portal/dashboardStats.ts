import { addDays, addWeeks, format, isBefore, startOfWeek } from 'date-fns';
import { pt } from 'date-fns/locale';

/**
 * Cálculos puros do Início do painel do motorista. Viviam dentro do `useEffect`
 * do dashboard, misturados com as queries — aqui são testáveis sem Supabase.
 */

export interface SemanaEmFalta {
  /** Segunda-feira da semana, `yyyy-MM-dd` — o valor que `motorista_recibos.semana_referencia_inicio` guarda. */
  value: string;
  label: string;
}

export interface DocAExpirar {
  label: string;
  tipo: 'conducao' | 'identificacao' | 'tvde';
  /** Validade formatada para mostrar. */
  data: string;
  validade: Date;
}

/**
 * Semanas completas desde a contratação sem recibo verde submetido, da mais
 * recente para a mais antiga. A semana em curso nunca conta — ainda não acabou.
 */
export function semanasSemRecibo(
  dataContratacao: string | null | undefined,
  semanasComRecibo: ReadonlySet<string>,
  hoje: Date = new Date()
): SemanaEmFalta[] {
  if (!dataContratacao) return [];

  const emFalta: SemanaEmFalta[] = [];
  let semana = startOfWeek(new Date(dataContratacao), { weekStartsOn: 1 });
  const limite = startOfWeek(hoje, { weekStartsOn: 1 });

  while (isBefore(semana, limite)) {
    const value = format(semana, 'yyyy-MM-dd');
    if (!semanasComRecibo.has(value)) {
      const fim = addDays(semana, 6);
      emFalta.push({
        value,
        label: `${format(semana, 'dd MMM', { locale: pt })} - ${format(fim, 'dd MMM yyyy', { locale: pt })}`,
      });
    }
    semana = addWeeks(semana, 1);
  }

  return emFalta.reverse();
}

type ChaveValidade = 'carta_validade' | 'documento_validade' | 'licenca_tvde_validade';
export type ValidadesMotorista = Partial<Record<ChaveValidade, string | null>>;

const DOCUMENTOS_DO_MOTORISTA: { key: ChaveValidade; label: string; tipo: DocAExpirar['tipo'] }[] =
  [
    { key: 'carta_validade', label: 'Carta de Condução', tipo: 'conducao' },
    {
      key: 'documento_validade',
      label: 'Cartão de Cidadão / Título de Residência',
      tipo: 'identificacao',
    },
    { key: 'licenca_tvde_validade', label: 'Licença TVDE', tipo: 'tvde' },
  ];

/**
 * Documentos do motorista que expiram dentro de `diasDeAviso` — ou que já
 * expiraram, que é ainda mais urgente. Sem validade registada não há aviso:
 * não sabemos, e um "expirado" falso assusta sem motivo.
 */
export function documentosAExpirar(
  motorista: ValidadesMotorista,
  hoje: Date = new Date(),
  diasDeAviso = 30
): DocAExpirar[] {
  const limite = addDays(hoje, diasDeAviso);
  const resultado: DocAExpirar[] = [];

  for (const doc of DOCUMENTOS_DO_MOTORISTA) {
    const valor = motorista[doc.key];
    if (!valor) continue;
    const validade = new Date(valor);
    if (Number.isNaN(validade.getTime())) continue;
    if (validade <= limite) {
      resultado.push({
        label: doc.label,
        tipo: doc.tipo,
        data: format(validade, 'dd/MM/yyyy'),
        validade,
      });
    }
  }

  return resultado;
}
