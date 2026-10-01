import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TIPOS_DOCUMENTO_FISCAL, type CamposPorTipo } from './faturacaoIntegracaoConfig';

interface CodigosPorTipoFieldsProps {
  label: string;
  valores: CamposPorTipo;
  onChange: (valores: CamposPorTipo) => void;
  ajuda: string;
}

/** Quatro campos curtos, um por tipo fiscal (FT, FR, NC, RC): tipos de documento e séries. */
export const CodigosPorTipoFields = ({
  label,
  valores,
  onChange,
  ajuda,
}: CodigosPorTipoFieldsProps) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <div className="grid grid-cols-4 gap-2">
      {TIPOS_DOCUMENTO_FISCAL.map((k) => (
        <div key={k} className="space-y-1">
          <span className="text-[11px] text-muted-foreground">{k}</span>
          <Input
            value={valores[k]}
            onChange={(e) => onChange({ ...valores, [k]: e.target.value })}
            placeholder="—"
          />
        </div>
      ))}
    </div>
    <p className="text-[11px] text-muted-foreground">{ajuda}</p>
  </div>
);
