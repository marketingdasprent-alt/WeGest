import { useEffect, useMemo, useRef, useState } from 'react';
import type jsPDF from 'jspdf';
import { Download, FileText, Loader2, Mail, Printer } from 'lucide-react';

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
import { useContactosDocumento } from '@/hooks/useContactosDocumento';

import { generateContratoPdf, type CondutorPrincipal } from '@/utils/generateContratoPdf';
import type { EmpresaConfig } from '@/config/empresas';
import type { ContratoRenting, ContratoCondutor } from '@/types/contratoRenting';
import type { ClienteComDocumentos } from '@/types/cliente';
import type { Motorista } from '@/types/motorista';
import type { ViaturaBasic } from '@/hooks/useViaturas';
import { CidadeAssinaturaField } from '@/components/documentos/CidadeAssinaturaField';
import { EnviarContratoEmailDialog } from './EnviarContratoEmailDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contrato: ContratoRenting;
  /** Todos os condutores do contrato (ex.: regime slot pode ter 2 motoristas
   *  a partilhar a viatura). O principal vem pré-seleccionado; com mais do
   *  que um condutor, o utilizador pode escolher para quem gerar. */
  condutores: ContratoCondutor[];
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
  condutores,
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
  const [cidadeAssinatura, setCidadeAssinatura] = useState('');
  const [enviarEmailOpen, setEnviarEmailOpen] = useState(false);
  const [pdfParaEnviar, setPdfParaEnviar] = useState<jsPDF | null>(null);
  const [filenameParaEnviar, setFilenameParaEnviar] = useState('');

  // Chave estável de um condutor (cliente_id em rent-a-car, motorista_id em
  // TVDE/slot) — usada para seleccionar para quem gerar os documentos.
  const condutorKey = (c: ContratoCondutor) => c.cliente_id ?? c.motorista_id ?? '';
  const nomeCondutor = (c: ContratoCondutor): string =>
    (c.cliente_id
      ? clientes.find((cl) => cl.id === c.cliente_id)?.nome
      : motoristas.find((m) => m.id === c.motorista_id)?.nome) ?? 'Removido';

  const [condutorId, setCondutorId] = useState<string | null>(null);

  // Ao abrir, selecciona o condutor principal por defeito. Com regime slot
  // (2 motoristas a partilhar a viatura) o utilizador pode trocar abaixo —
  // antes só era possível gerar documentos para o principal.
  useEffect(() => {
    if (!open) return;
    const principal = condutores.find((c) => c.is_principal) ?? condutores[0] ?? null;
    setCondutorId(principal ? condutorKey(principal) : null);
  }, [open, condutores]);

  const condutorSelecionado = condutores.find((c) => condutorKey(c) === condutorId) ?? null;

  // Cliente e/ou condutor (motorista ou cliente-condutor) para o envio por email.
  const { data: contactosEnvio = [] } = useContactosDocumento({
    clienteId: contrato.cliente_id,
    condutor: condutorSelecionado
      ? {
          cliente_id: condutorSelecionado.cliente_id,
          motorista_id: condutorSelecionado.motorista_id,
        }
      : null,
  });

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
      setCidadeAssinatura('');
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

  // IDs escolhidos, na ordem de leitura do PDF combinado — partilhado por
  // download/impressão/email.
  const templateIdsEscolhidos = () =>
    templates
      .filter((t) => selected.has(t.id))
      .sort((a, b) => ordemTipo(a.tipo) - ordemTipo(b.tipo) || a.nome.localeCompare(b.nome))
      .map((t) => t.id);

  const condutorPrincipalAtual = (): CondutorPrincipal | null =>
    condutorSelecionado
      ? {
          cliente_id: condutorSelecionado.cliente_id,
          motorista_id: condutorSelecionado.motorista_id,
        }
      : null;

  const gerar = async (action: 'print' | 'download') => {
    const empresa = empresas.find((e) => e.id === empresaId) ?? null;
    const templateIds = templateIdsEscolhidos();

    if (templateIds.length === 0) {
      toast({ title: 'Selecione pelo menos um documento', variant: 'destructive' });
      return;
    }
    if (!cidadeAssinatura.trim()) {
      toast({ title: 'Indique a cidade de assinatura', variant: 'destructive' });
      return;
    }

    try {
      setGerando(true);
      await generateContratoPdf({
        contrato,
        condutorPrincipal: condutorPrincipalAtual(),
        clientes,
        motoristas,
        viatura,
        empresa,
        action,
        templateIds,
        cidadeAssinatura,
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

  // Gera o PDF sem imprimir/descarregar e abre o dialog de envio por email —
  // mantém este dialog aberto por baixo, tal como acontece ao enviar faturas.
  const prepararEnvioEmail = async () => {
    const empresa = empresas.find((e) => e.id === empresaId) ?? null;
    const templateIds = templateIdsEscolhidos();

    if (templateIds.length === 0) {
      toast({ title: 'Selecione pelo menos um documento', variant: 'destructive' });
      return;
    }

    try {
      setGerando(true);
      const resultado = await generateContratoPdf({
        contrato,
        condutorPrincipal: condutorPrincipalAtual(),
        clientes,
        motoristas,
        viatura,
        empresa,
        action: 'email',
        templateIds,
        cidadeAssinatura,
      });
      if (!resultado) throw new Error('Não foi possível gerar o documento.');
      setPdfParaEnviar(resultado.pdf);
      setFilenameParaEnviar(resultado.fileName);
      setEnviarEmailOpen(true);
    } catch (err) {
      toast({
        title: 'Erro ao preparar o envio',
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

          {condutores.length > 1 && (
            <div className="space-y-2">
              <Label>Condutor</Label>
              <Select value={condutorId ?? ''} onValueChange={setCondutorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o condutor" />
                </SelectTrigger>
                <SelectContent>
                  {condutores.map((c) => (
                    <SelectItem key={condutorKey(c)} value={condutorKey(c)}>
                      {nomeCondutor(c)}
                      {c.is_principal ? ' (Principal)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Regime {contrato.regime === 'slot' ? 'Slot' : 'TVDE'} com mais de um condutor — gera
                os documentos para o condutor escolhido acima.
              </p>
            </div>
          )}

          <CidadeAssinaturaField value={cidadeAssinatura} onChange={setCidadeAssinatura} />

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
            disabled={gerando || loading || count === 0 || !cidadeAssinatura.trim()}
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
            variant="outline"
            onClick={prepararEnvioEmail}
            disabled={gerando || loading || count === 0}
            className="gap-2"
          >
            {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Email
          </Button>
          <Button
            onClick={() => gerar('print')}
            disabled={gerando || loading || count === 0 || !cidadeAssinatura.trim()}
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

      <EnviarContratoEmailDialog
        open={enviarEmailOpen}
        onOpenChange={setEnviarEmailOpen}
        pdf={pdfParaEnviar}
        filename={filenameParaEnviar}
        contextoLabel={`Contrato #${contrato.codigo ?? ''}`}
        entidades={contactosEnvio}
        orgId={contrato.org_id}
      />
    </Dialog>
  );
};
