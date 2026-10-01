import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmissorSelect } from '@/components/renting/EmissorSelect';

interface Props {
  nome: string;
  onNomeChange: (v: string) => void;
  nomePlaceholder: string;
  emissorId: string | null;
  onEmissorChange: (v: string | null) => void;
  disabled?: boolean;
}

/**
 * Quem é esta integração de faturação: o nome por que se conhece na lista e a
 * empresa em nome de quem emite.
 *
 * A empresa é o campo que manda. Quem assina uma factura é a empresa emissora
 * do contrato (`clientes.is_emissora`), cada uma com o seu NIF e a sua conta no
 * software de facturação — não a organização. Uma empresa sem integração não
 * pode ser faturada, e é a edge function `faturacao-emitir` que o garante.
 */
export function FaturacaoIdentidadeFields({
  nome,
  onNomeChange,
  nomePlaceholder,
  emissorId,
  onEmissorChange,
  disabled,
}: Props) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="faturacao-nome">Nome da Integração</Label>
        <Input
          id="faturacao-nome"
          value={nome}
          placeholder={nomePlaceholder}
          onChange={(e) => onNomeChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Só para distinguir esta integração na lista. Com uma conta por empresa, convém que o nome
          diga de quem é.
        </p>
      </div>

      <div className="space-y-2">
        <Label>
          Empresa a faturar <span className="text-destructive">*</span>
        </Label>
        <EmissorSelect value={emissorId} onChange={onEmissorChange} disabled={disabled} />
        <p className="text-xs text-muted-foreground">
          A empresa em nome de quem esta chave emite. Uma empresa sem integração de faturação não
          pode ser faturada.
        </p>
      </div>
    </>
  );
}
