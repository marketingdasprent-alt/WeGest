import { useState, useEffect, useRef } from 'react';
import { Loader2, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useClientesEmpresas, empresaFooterText } from '@/hooks/useClientesEmpresas';
import { empresaDocData } from '@/config/empresas';
import type { DocumentTemplate } from '@/types/documentTemplate';

interface Props {
  template: DocumentTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TIPO_LABELS: Record<string, string> = {
  contrato_aluguer: 'Contrato de Aluguer',
  contrato_prestacao: 'Contrato de Prestação',
  anexo_danos: 'Folha de Danos',
  outro: 'Outro',
};

const SAMPLE_MOTORISTA = {
  nome: 'Maria Santos',
  email: 'maria.santos@exemplo.pt',
  telefone: '912 345 678',
  morada: 'Av. da Liberdade, Nº 100, 1250-096 Lisboa',
  nif: '123456789',
  cidade: 'Lisboa',
  documento_tipo: 'Cartão de Cidadão',
  documento_numero: '12345678 0 ZZ5',
  documento_validade: '2030-12-31',
  carta_conducao: 'A1B-2025-001',
  carta_categorias: ['B'],
  carta_validade: '2025-01-15',
  licenca_tvde_numero: 'TVDE-001/2024',
  licenca_tvde_validade: '2025-12-31',
};

const SAMPLE_EMPRESA_DATA = {
  nomeCompleto: 'Empresa Emissora, Unipessoal, Lda.',
  nif: '500000000',
  sede: 'Rua Principal, Nº 1, 1000-001 Lisboa',
  licencaTVDE: 'TVDE-0001/2024',
  licencaValidade: '31/12/2025',
  representante: 'João Silva',
  cargoRepresentante: 'gerente com poderes para o ato',
};

export const DocumentTemplatePreviewDialog: React.FC<Props> = ({
  template,
  open,
  onOpenChange,
}) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const { empresas } = useClientesEmpresas();

  useEffect(() => {
    if (!open || !template) {
      setPdfUrl(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setPdfUrl(null);

    const empresaId = template.cliente_empresa_id ?? template.empresa_id ?? null;
    const empresa = empresaId ? (empresas.find((e) => e.id === empresaId) ?? null) : null;

    const documentData = {
      data_inicio: '2025-01-01',
      data_fim: '2025-01-31',
      data_assinatura: '2025-01-01',
      cidade_assinatura: 'Lisboa',
      duracao_meses: '1',
      numero_contrato: 'RNT-2025-001',
      viatura_matricula: 'AA-00-BB',
      viatura_data_matricula: '2022-03-15',
      viatura_marca_modelo: 'Toyota Corolla',
      viatura_grupo: 'Grupo B',
      viatura_kms: '15.000',
      viatura_combustivel_saida: '3/4',
      local_entrega: 'Aeroporto de Lisboa',
      local_recolha: 'Aeroporto de Lisboa',
      tarifa_diaria: '25,00 €',
      valor_semanal: '175,00 €',
      franquia: '500,00 €',
      caucao: '200,00 €',
      kms_incluidos: '2.000',
      km_adicional: '0,15 €',
      subtotal: '750,00 €',
      iva: '23%',
      dias: '30',
      total: '922,50 €',
      observacoes: '—',
      colaborador_nome: 'Gestor Demo',
      empresaData: empresa ? empresaDocData(empresa) : SAMPLE_EMPRESA_DATA,
      clienteData: {
        nome: SAMPLE_MOTORISTA.nome,
        nif: SAMPLE_MOTORISTA.nif,
        email: SAMPLE_MOTORISTA.email,
        telefone: SAMPLE_MOTORISTA.telefone,
        morada: SAMPLE_MOTORISTA.morada,
        codigo_postal: '1250-096',
        cidade: SAMPLE_MOTORISTA.cidade,
        data_nascimento: '1990-01-15',
        nome_comercial: '',
        sede: '',
        representante: '',
        cargo_representante: '',
      },
    };

    import('@/utils/generateDocumentFromTemplate')
      .then(({ generateDocumentFromTemplate }) =>
        generateDocumentFromTemplate({
          templateId: template.id,
          motoristaData: SAMPLE_MOTORISTA,
          documentData,
          skipOutput: true,
          headerLogoUrl: empresa?.logoUrl || '/Logo.png',
          footerText: empresa ? empresaFooterText(empresa) : undefined,
        })
      )
      .then((pdf) => {
        if (!pdf) {
          setError('Não foi possível gerar a pré-visualização.');
          return;
        }
        // Revogar URL anterior se existir
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        const url = pdf.output('bloburl').toString();
        blobUrlRef.current = url;
        setPdfUrl(url);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erro ao gerar pré-visualização.');
      })
      .finally(() => setLoading(false));

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [open, template, empresas]);

  if (!template) return null;

  const tipoLabel = TIPO_LABELS[template.tipo] ?? template.tipo;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[95vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center gap-3">
            <DialogTitle className="flex-1">{template.nome}</DialogTitle>
            <Badge variant="secondary">{tipoLabel}</Badge>
            {!template.ativo && <Badge variant="outline">Inativo</Badge>}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-amber-600 mt-1">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>
              Pré-visualização com dados de exemplo — os valores reais substituem os marcadores ao
              gerar o PDF.
            </span>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 relative">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/30 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">A gerar pré-visualização...</p>
            </div>
          )}

          {error && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
              <p className="text-sm text-destructive font-medium">{error}</p>
              <p className="text-xs text-muted-foreground">
                Verifica se o template está ativo e tem conteúdo válido.
              </p>
            </div>
          )}

          {pdfUrl && !loading && (
            <iframe
              src={pdfUrl}
              className="w-full h-full border-0"
              title={`Pré-visualização: ${template.nome}`}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
