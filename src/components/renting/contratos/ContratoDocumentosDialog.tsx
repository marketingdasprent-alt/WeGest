import { useEffect, useState } from 'react';
import { Download, FileText, Loader2, Printer } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

import { generateContratoPdf, type CondutorPrincipal } from '@/utils/generateContratoPdf';
import type { EmpresaConfig } from '@/config/empresas';
import type { ContratoRenting } from '@/types/contratoRenting';
import type { ClienteComDocumentos } from '@/types/cliente';
import type { Motorista } from '@/types/motorista';
import type { ViaturaBasic } from '@/hooks/useViaturas';

interface DocumentTemplateRow {
  id: string;
  nome: string;
  tipo: string;
  empresa_id: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contrato: ContratoRenting;
  condutorPrincipal: CondutorPrincipal | null;
  clientes: ClienteComDocumentos[];
  motoristas: Motorista[];
  viatura: ViaturaBasic | null;
  empresas: EmpresaConfig[];
}

// Ordem de leitura no PDF combinado: prestação → aluguer → restantes.
const TIPO_ORDEM: Record<string, number> = { contrato_prestacao: 0, contrato_aluguer: 1 };
const ordemTipo = (tipo: string) => TIPO_ORDEM[tipo] ?? 2;

/**
 * Dialog "Gerar Documentos" do contrato de renting (mesmo padrão do dos
 * motoristas): seletor de empresa (só com >1 empresa) + checklist de templates
 * activos, pré-seleccionados por regime. O nome do template traz a empresa, por
 * isso a escolha resolve a marca — sem `empresa_id` no schema.
 */
export const ContratoDocumentosDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  contrato,
  condutorPrincipal,
  clientes,
  motoristas,
  viatura,
  empresas,
}) => {
  const { toast } = useToast();
  const empresaPorDefeito =
    empresas.find((e) => e.orgId === contrato.org_id)?.id ?? empresas[0]?.id ?? '';

  const [empresaId, setEmpresaId] = useState(empresaPorDefeito);
  const [templates, setTemplates] = useState<DocumentTemplateRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [gerando, setGerando] = useState(false);

  // Ao abrir, repõe a empresa por defeito. Ao fechar, limpa a selecção.
  useEffect(() => {
    if (open) setEmpresaId(empresaPorDefeito);
    else setSelected(new Set());
  }, [open, empresaPorDefeito]);

  // Carrega templates activos da empresa e pré-selecciona por regime.
  useEffect(() => {
    if (!open || !empresaId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('document_templates')
        .select('id, nome, tipo, empresa_id')
        .eq('ativo', true)
        .eq('empresa_id', empresaId)
        .order('nome', { ascending: true });
      if (cancelled) return;
      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
        setTemplates([]);
        setSelected(new Set());
      } else {
        const rows = (data ?? []) as DocumentTemplateRow[];
        setTemplates(rows);
        const pre = new Set<string>();
        rows.forEach((t) => {
          if (t.tipo === 'contrato_aluguer') pre.add(t.id);
          if (t.tipo === 'contrato_prestacao' && contrato.regime !== 'rent_a_car') pre.add(t.id);
        });
        setSelected(pre);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, empresaId, contrato.regime, toast]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const count = templates.filter((t) => selected.has(t.id)).length;

  const gerar = async (action: 'print' | 'download') => {
    const empresa = empresas.find((e) => e.id === empresaId) ?? null;
    const templateIds = templates
      .filter((t) => selected.has(t.id))
      .sort((a, b) => ordemTipo(a.tipo) - ordemTipo(b.tipo) || a.nome.localeCompare(b.nome))
      .map((t) => t.id);

    if (templateIds.length === 0) {
      toast({ title: 'Selecione pelo menos um documento', variant: 'destructive' });
      return;
    }

    try {
      setGerando(true);
      await generateContratoPdf({
        contrato,
        condutorPrincipal,
        clientes,
        motoristas,
        viatura,
        empresa,
        action,
        templateIds,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Erro ao gerar documentos',
        description: err instanceof Error ? err.message : 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Gerar Documentos
          </DialogTitle>
          <DialogDescription>
            Contrato #{contrato.codigo ?? ''} — escolhe os documentos a gerar (saem num só PDF).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {empresas.length > 1 && (
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Select value={empresaId} onValueChange={setEmpresaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Documentos a Gerar</Label>
            <ScrollArea className="h-[220px] rounded-md border p-3">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : templates.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nenhum template disponível para esta empresa.
                </p>
              ) : (
                <div className="space-y-1">
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50"
                      onClick={() => toggle(t.id)}
                    >
                      <Checkbox
                        checked={selected.has(t.id)}
                        onCheckedChange={() => toggle(t.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <label className="flex-1 cursor-pointer text-sm font-medium leading-none">
                        {t.nome}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            {count} documento(s) selecionado(s)
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gerando}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => gerar('download')}
            disabled={gerando || loading || count === 0}
            className="gap-2"
          >
            {gerando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            PDF
          </Button>
          <Button
            onClick={() => gerar('print')}
            disabled={gerando || loading || count === 0}
            className="gap-2"
          >
            {gerando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
