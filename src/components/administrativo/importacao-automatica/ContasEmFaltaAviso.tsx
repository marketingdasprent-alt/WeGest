import { AlertTriangle } from 'lucide-react';

import { rotuloSemana, type ContaImportacao, type Periodo } from '@/utils/importacaoAutomatica';

interface ContasEmFaltaAvisoProps {
  faltas: ReadonlyArray<{ semana: Periodo; contas: ContaImportacao[] }>;
}

/** Contas que ainda não têm dados da semana e não vêm nestes ficheiros. */
export function ContasEmFaltaAviso({ faltas }: ContasEmFaltaAvisoProps) {
  const comFalta = faltas.filter((f) => f.contas.length > 0);
  if (comFalta.length === 0) return null;
  return (
    <div
      role="alert"
      className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
    >
      {comFalta.map((f) => (
        <p key={f.semana.inicio} className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <span>
            <strong>Semana {rotuloSemana(f.semana)}:</strong> ainda falta o ficheiro de{' '}
            {f.contas.map((c) => c.nome).join(', ')}.
          </span>
        </p>
      ))}
    </div>
  );
}
