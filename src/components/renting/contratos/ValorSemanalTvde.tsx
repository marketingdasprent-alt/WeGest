import type { PrecoSemanalTvde } from '@shared/precoAluguer';

import { formatCurrency } from './contratosUtils';

interface ValorSemanalTvdeProps {
  /** `undefined` enquanto o preço carrega. */
  preco: PrecoSemanalTvde | undefined;
  valorTotalManual: number | null | undefined;
  erro?: boolean;
}

const ORIGEM: Record<PrecoSemanalTvde['origem'], string> = {
  acordado: 'acordado',
  tarifa: 'tarifa',
  'sem-preco': '',
};

/** Valor semanal que o motorista paga, e à parte o que se factura ao cliente. */
export const ValorSemanalTvde: React.FC<ValorSemanalTvdeProps> = ({
  preco,
  valorTotalManual,
  erro = false,
}) => {
  const valor = preco?.valor ?? null;
  // Em cêntimos, para o ruído de vírgula flutuante não criar uma diferença.
  const manualDifere =
    preco !== undefined &&
    valorTotalManual != null &&
    valorTotalManual > 0 &&
    (valor === null || Math.round(valorTotalManual * 100) !== Math.round(valor * 100));

  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">Valor semanal (motorista)</span>
        <span className="text-muted-foreground text-xs">
          {erro ? (
            'Erro a ler o preço'
          ) : preco === undefined ? (
            'A carregar…'
          ) : valor === null ? (
            'Sem preço'
          ) : (
            <>
              {formatCurrency(valor)}
              {ORIGEM[preco.origem] && <span className="ml-1">({ORIGEM[preco.origem]})</span>}
            </>
          )}
        </span>
      </div>
      {manualDifere && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">Faturar ao cliente</span>
            <span className="text-muted-foreground text-xs">
              {formatCurrency(valorTotalManual)}
            </span>
          </div>
          <p className="text-amber-600 dark:text-amber-400 text-xs">
            Este valor não é o que o motorista paga.
          </p>
        </>
      )}
    </>
  );
};
