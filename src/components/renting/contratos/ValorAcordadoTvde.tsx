import { Input } from '@/components/ui/input';
import { precoSemanaDifereDaTarifa } from '@/utils/precoContratoTvde';
import { formatCurrency } from './contratosUtils';

export interface ValorAcordadoTvdeProps {
  /** Preço semanal da tarifa para o modelo: o que se cobra até haver aprovação. */
  precoTarifa: number | null | undefined;
  pretendido: number | null | undefined;
  motivo: string;
  onPretendidoChange: (valor: number | null) => void;
  onMotivoChange: (motivo: string) => void;
}

/**
 * Abertura de contrato TVDE: o valor combinado com o motorista não se grava no
 * contrato; se difere da tarifa vira pedido ao Supervisor Gestor TVDE.
 */
export const ValorAcordadoTvde: React.FC<ValorAcordadoTvdeProps> = ({
  precoTarifa,
  pretendido,
  motivo,
  onPretendidoChange,
  onMotivoChange,
}) => {
  const difere = precoSemanaDifereDaTarifa(pretendido, precoTarifa);
  const label = 'Valor semanal acordado com o motorista';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="valor-semanal-acordado" className="text-muted-foreground text-xs">
          {label}
        </label>
        <Input
          id="valor-semanal-acordado"
          type="number"
          min={0}
          step="0.01"
          value={pretendido ?? ''}
          onChange={(e) =>
            onPretendidoChange(e.target.value === '' ? null : Number(e.target.value))
          }
          placeholder={precoTarifa != null ? precoTarifa.toFixed(2) : '—'}
          className="h-8 w-24 shrink-0 text-right tabular-nums text-sm"
        />
      </div>
      <p className="text-muted-foreground text-xs text-right">× 1 semana, IVA incluído</p>
      {difere && precoTarifa != null && (
        <>
          <p role="status" className="text-amber-600 dark:text-amber-400 text-xs">
            Vai pedir aprovação ao Supervisor Gestor TVDE. Até lá cobra-se a tarifa (
            {formatCurrency(precoTarifa)}).
          </p>
          <Input
            aria-label="Motivo"
            value={motivo}
            maxLength={200}
            onChange={(e) => onMotivoChange(e.target.value)}
            placeholder="Motivo (opcional)"
            className="h-8 text-sm"
          />
        </>
      )}
    </div>
  );
};
