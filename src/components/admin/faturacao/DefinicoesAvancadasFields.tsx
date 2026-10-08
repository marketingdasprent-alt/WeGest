import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CodigosPorTipoFields } from './CodigosPorTipoFields';
import type { CamposPorTipo } from './faturacaoIntegracaoConfig';

interface DefinicoesAvancadasFieldsProps {
  endpoint: string;
  onEndpointChange: (v: string) => void;
  defaultProduct: string;
  onDefaultProductChange: (v: string) => void;
  defaultIdTax: string;
  onDefaultIdTaxChange: (v: string) => void;
  doctypes: CamposPorTipo;
  onDoctypesChange: (v: CamposPorTipo) => void;
  docseries: CamposPorTipo;
  onDocseriesChange: (v: CamposPorTipo) => void;
  precosComIva: boolean;
  onPrecosComIvaChange: (v: boolean) => void;
}

/** Corpo das "Definições avançadas" do diálogo de integração de faturação. */
export const DefinicoesAvancadasFields = ({
  endpoint,
  onEndpointChange,
  defaultProduct,
  onDefaultProductChange,
  defaultIdTax,
  onDefaultIdTaxChange,
  doctypes,
  onDoctypesChange,
  docseries,
  onDocseriesChange,
  precosComIva,
  onPrecosComIvaChange,
}: DefinicoesAvancadasFieldsProps) => (
  <div className="space-y-4 rounded-md border bg-muted/20 p-4">
    <div className="space-y-2">
      <Label htmlFor="fat-endpoint">Endpoint da API</Label>
      <Input
        id="fat-endpoint"
        placeholder="Deixe vazio para usar o endpoint por defeito"
        value={endpoint}
        onChange={(e) => onEndpointChange(e.target.value)}
      />
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <Label htmlFor="fat-prod">Artigo genérico (id/ref)</Label>
        <Input
          id="fat-prod"
          placeholder="p/ linhas de texto livre"
          value={defaultProduct}
          onChange={(e) => onDefaultProductChange(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fat-idtax">IVA por defeito (id)</Label>
        <Input
          id="fat-idtax"
          placeholder="id de recurso"
          value={defaultIdTax}
          onChange={(e) => onDefaultIdTaxChange(e.target.value)}
        />
      </div>
    </div>
    <CodigosPorTipoFields
      label="Tipos de documento (DocType)"
      valores={doctypes}
      onChange={onDoctypesChange}
      ajuda="Só preencher se o software exigir códigos diferentes dos predefinidos. O RC (recibo) costuma não ter predefinição."
    />
    <CodigosPorTipoFields
      label="Séries (DocSeries)"
      valores={docseries}
      onChange={onDocseriesChange}
      ajuda='Código interno da série no software (ex.: 67), não a referência (ex.: FT26). Obrigatório quando a conta não tem série por omissão: sem ela o KeyInvoice recusa com "Série de documento inválida".'
    />
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-0.5">
        <Label htmlFor="fat-precos-com-iva">A conta usa preços com IVA incluído</Label>
        <p className="text-[11px] text-muted-foreground">
          Ligar só se as faturas saem com o valor sem IVA como total (o PDF diz &quot;Os valores
          apresentados incluem a Taxa de IVA&quot;). O WeGest passa a mandar o preço já com IVA.
          Numa conta normal, ligar isto duplica o IVA.
        </p>
      </div>
      <Switch
        id="fat-precos-com-iva"
        checked={precosComIva}
        onCheckedChange={onPrecosComIvaChange}
      />
    </div>
  </div>
);
