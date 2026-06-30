import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { useDocumentTemplates } from '@/hooks/useDocumentTemplates';

import { generateContratoPdf, type CondutorPrincipal } from '@/utils/generateContratoPdf';
import type { EmpresaConfig } from '@/config/empresas';
import type { ContratoRenting } from '@/types/contratoRenting';
import type { ClienteComDocumentos } from '@/types/cliente';
import type { Motorista } from '@/types/motorista';
import type { ViaturaBasic } from '@/hooks/useViaturas';

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
 * activos, pré-seleccionados por regime. A empresa por defeito é o emissor
 * gravado no contrato (`emissor_id`); o seletor permite override pontual.
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
  // Emissor do contrato manda; fallback para a 1.ª empresa da org cobre
  // contratos antigos criados antes do campo existir.
  const empresaPorDefeito =
    empresas.find((e) => e.id === contrato.emissor_id)?.id ??
    empresas.find((e) => e.orgId === contrato.org_id)?.id ??
    empresas[0]?.id ??
    '';

  const [empresaId, setEmpresaId] = useState(empresaPorDefeito);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gerando, setGerando] = useState(false);

  const { data: todosTemplates = [], isLoading: loading } = useDocumentTemplates(
    open ? empresaId : null
  );
  // A Folha de Danos (anexo_danos) gera-se só no fluxo de check-in/out
  // (entrega/recolha), nunca por este diálogo do contrato.
  // useMemo estabiliza a referência: sem ele, `.filter()` devolvia array novo
  // a cada render e a pré-selecção (effect abaixo) corria sempre, esmagando
  // a escolha do utilizador a cada clique.
  const templates = useMemo(
    () => todosTemplates.filter((t) => t.tipo !== 'anexo_danos'),
    [todosTemplates]
  );

  // Guarda a chave (open+empresa) já pré-seleccionada, para o effect correr
  // só na transição loading→loaded e não repetir a cada render.
  const preSelectKey = useRef<string | null>(null);

  // Ao abrir, repõe a empresa por defeito. Ao fechar, limpa a selecção.
  useEffect(() => {
    if (open) setEmpresaId(empresaPorDefeito);
    else {
      setSelected(new Set());
      preSelectKey.current = null;
    }
  }, [open, empresaPorDefeito]);

  // Pré-selecciona por regime UMA vez quando os templates da empresa actual
  // chegam. A chave (empresaId) garante que muda de empresa volta a pré-seleccionar.
  useEffect(() => {
    if (!open || loading) return;
    const key = `${empresaId}`;
    if (preSelectKey.current === key) return;
    preSelectKey.current = key;

    const pre = new Set<string>();
    templates.forEach((t) => {
      if (t.tipo === 'contrato_aluguer') pre.add(t.id);
      if (t.tipo === 'contrato_prestacao' && contrato.regime !== 'rent_a_car') pre.add(t.id);
    });
    setSelected(pre);
  }, [open, loading, empresaId, templates, contrato.regime]);

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
