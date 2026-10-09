import { CalendarPlus, Eye, FileText, Trash2, UserRound, Wrench } from 'lucide-react';

import type { AcaoLinha } from '@/components/ui/acoes-linha';
import type { OcupanteViatura } from '@/utils/ocupantesViaturas';

interface AcoesDaViaturaParams {
  matricula: string;
  estado: string;
  ocupante?: OcupanteViatura;
  pode: {
    eliminar: boolean;
    reservar: boolean;
    verMotorista: boolean;
    verContrato: boolean;
    abrirTicket: boolean;
  };
  on: {
    abrir: () => void;
    eliminar: () => void;
    reservar: () => void;
    verOcupante: () => void;
    abrirTicket: () => void;
  };
}

/**
 * Acções da linha: primeiro a rápida (reservar a livre, ver quem a tem), depois
 * abrir e eliminar. Um carro TVDE passa a motorista por reserva/contrato — a
 * atribuição directa só existe para slot, na ficha do motorista.
 */
export function acoesDaViatura({
  matricula,
  estado,
  ocupante,
  pode,
  on,
}: AcoesDaViaturaParams): AcaoLinha[] {
  const verMotorista = ocupante?.tipo === 'motorista';
  return [
    {
      icone: CalendarPlus,
      rotulo: `Nova reserva para ${matricula}`,
      onClick: on.reservar,
      oculta: estado !== 'disponivel' || !pode.reservar,
    },
    {
      icone: verMotorista ? UserRound : FileText,
      rotulo: verMotorista
        ? `Ver motorista ${ocupante?.nome ?? ''}`.trim()
        : `Ver contrato de ${matricula}`,
      onClick: on.verOcupante,
      oculta: !ocupante || (verMotorista ? !pode.verMotorista : !pode.verContrato),
    },
    {
      icone: Wrench,
      rotulo: `Abrir ticket de assistência para ${matricula}`,
      onClick: on.abrirTicket,
      oculta: !pode.abrirTicket,
    },
    { icone: Eye, rotulo: `Abrir viatura ${matricula}`, onClick: on.abrir },
    {
      icone: Trash2,
      rotulo: `Eliminar viatura ${matricula}`,
      onClick: on.eliminar,
      destrutiva: true,
      oculta: !pode.eliminar,
    },
  ];
}
