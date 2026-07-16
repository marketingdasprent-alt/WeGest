import { History, CalendarPlus, FileSignature, PackageCheck, Receipt, PenLine } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import {
  useContratoHistorico,
  type ContratoHistoricoEvento,
  type ContratoHistoricoEventoTipo,
} from '@/hooks/useContratoHistorico';

interface Props {
  contratoId: string;
}

/** Formata "DD/MM/AAAA HH:MM" (com espaço, sem vírgula) a partir de um ISO. */
function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const MARCO_META: Record<
  Exclude<ContratoHistoricoEventoTipo, 'ultima_alteracao'>,
  { label: string; Icon: typeof History }
> = {
  reserva_criada: { label: 'Reserva criada por', Icon: CalendarPlus },
  contrato_aberto: { label: 'Contrato aberto por', Icon: FileSignature },
  contrato_fechado: { label: 'Contrato fechado por', Icon: PackageCheck },
  contrato_faturado: { label: 'Contrato faturado por', Icon: Receipt },
};

const ORDEM_MARCOS: Array<keyof typeof MARCO_META> = [
  'reserva_criada',
  'contrato_aberto',
  'contrato_fechado',
  'contrato_faturado',
];

/**
 * Histórico de Edições — marcos do ciclo de vida do contrato + última alteração.
 * Mostra "<Marco> por: Nome - DD/MM/AAAA HH:MM" e um bloco destacado com a
 * última alteração (qualquer modificação ao contrato).
 */
/** O trigger de INSERT regista 'contrato_aberto' na CRIAÇÃO do contrato, com
 *  detalhe "estado inicial: <estado>". Isso só é uma abertura real se o
 *  contrato já tiver nascido 'em_curso' — nascido 'agendado', a abertura
 *  acontece (e é registada com "agendado → em_curso") quando a entrega for
 *  confirmada. Sem essa confirmação, o marco fica honestamente "sem registo"
 *  em vez de fingir que o contrato foi aberto (ex.: #611 dizia "aberto" com
 *  o estado ainda em Agendado). */
function isAberturaReal(ev: ContratoHistoricoEvento): boolean {
  const d = ev.detalhe ?? '';
  if (!d.startsWith('estado inicial:')) return true; // transição real (ex.: "agendado → em_curso")
  return d.includes('em_curso'); // nasceu já em curso — abertura na criação
}

export function HistoricoEdicoesContrato({ contratoId }: Props) {
  const { data: eventos, isLoading } = useContratoHistorico(contratoId);

  const porTipo = (tipo: string): ContratoHistoricoEvento | undefined =>
    (eventos ?? []).find((e) => e.evento_tipo === tipo);

  const ultima = porTipo('ultima_alteracao');

  return (
    <Card className="bg-card border-border sticky top-4 mt-4">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Histórico de Edições
          </h3>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">A carregar…</p>
        ) : (
          <div className="space-y-2.5">
            {ORDEM_MARCOS.map((tipo) => {
              let ev = porTipo(tipo);
              if (tipo === 'contrato_aberto' && ev && !isAberturaReal(ev)) ev = undefined;
              const { label, Icon } = MARCO_META[tipo];
              return (
                <div key={tipo} className="flex items-start gap-2">
                  <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 text-sm">
                    <span className="text-muted-foreground">{label}: </span>
                    {ev ? (
                      <span className="text-foreground">
                        <span className="font-medium">{ev.ator_nome ?? 'Desconhecido'}</span>
                        {' — '}
                        <span className="tabular-nums">{fmtDataHora(ev.criado_em)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground/70 italic">sem registo</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Última alteração — bloco destacado */}
            <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <PenLine className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Última alteração
                </span>
              </div>
              {ultima ? (
                <p className="text-sm font-semibold text-foreground">
                  {ultima.ator_nome ?? 'Desconhecido'}
                  <span className="font-normal text-muted-foreground">
                    {' — '}
                    <span className="tabular-nums">{fmtDataHora(ultima.criado_em)}</span>
                  </span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground/70 italic">sem alterações registadas</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
