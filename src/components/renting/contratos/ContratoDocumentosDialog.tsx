import { useEffect, useMemo, useRef, useState } from 'react';
import type jsPDF from 'jspdf';
import { Download, FileText, Loader2, Mail, PenLine, Printer } from 'lucide-react';

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
import { gravarCidadeAssinaturaVigente } from '@/hooks/useContratosRenting';
import { useDocumentTemplates, useFolhasDanosDaOrg } from '@/hooks/useDocumentTemplates';
import { useContactosDocumento } from '@/hooks/useContactosDocumento';

import { generateContratoPdf, type CondutorPrincipal } from '@/utils/generateContratoPdf';
import type { ContratoAnexo } from '@/utils/generateContratoPdf';
import { EnviarParaAssinaturaDialog } from './EnviarParaAssinaturaDialog';
import { useEnviarParaAssinatura } from '@/hooks/useEnviarParaAssinatura';
import { candidatosDoContrato } from '@/lib/assinaturas';
import { useAuth } from '@/contexts/AuthContext';
import type { EmpresaConfig } from '@/config/empresas';
import type { ContratoRenting, ContratoCondutor } from '@/types/contratoRenting';
import type { ClienteComDocumentos } from '@/types/cliente';
import type { Motorista } from '@/types/motorista';
import type { ViaturaBasic } from '@/hooks/useViaturas';
import { CidadeAssinaturaField } from '@/components/documentos/CidadeAssinaturaField';
import { EnviarContratoEmailDialog } from './EnviarContratoEmailDialog';
import { templatesComFolhaDanos } from './templatesComFolhaDanos';

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
  const empresaSelecionada = empresas.find((e) => e.id === empresaId) ?? null;

  // Dados do contrato que vão no corpo do email — é isto que faz o email ser
  // um template com informação, em vez de um texto escrito à mão.
  const fmtData = (d?: string | null) =>
    d
      ? new Date(d).toLocaleDateString('pt-PT', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : '';
  const fmtEur = (v?: number | null) =>
    v == null ? '' : v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });

  const detalhesEmail = [
    { label: 'Contrato', valor: contrato.codigo ? `#${contrato.codigo}` : '' },
    { label: 'Viatura', valor: contrato.matricula ?? '' },
    {
      label: 'Período',
      valor: [fmtData(contrato.data_inicio), fmtData(contrato.data_fim)]
        .filter(Boolean)
        .join(' a '),
    },
    { label: 'Valor', valor: fmtEur(contrato.total_final) },
  ].filter((d) => d.valor);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gerando, setGerando] = useState(false);
  // Pré-preenchida com a cidade vigente do contrato (gravada da última vez que
  // se gerou algo para ele) — um contrato que já teve documentos gerados não
  // volta a perguntar. Só nasce vazia mesmo na primeira geração de sempre.
  const [cidadeAssinatura, setCidadeAssinatura] = useState(contrato.cidade_assinatura ?? '');

  // Reabrir o diálogo (ou trocar de contrato sem desmontar) tem de reflectir
  // o valor mais recente gravado — sem isto, gerar uma vez com uma cidade
  // nova e reabrir logo a seguir mostrava outra vez a antiga.
  useEffect(() => {
    if (open) setCidadeAssinatura(contrato.cidade_assinatura ?? '');
  }, [open, contrato.cidade_assinatura]);

  // Fica "vigente": a próxima geração para este mesmo contrato (aqui ou no
  // fecho) já não pergunta.
  const persistirCidadeVigente = (cidade: string) => {
    const valor = cidade.trim();
    if (!valor || valor === (contrato.cidade_assinatura ?? '')) return;
    void gravarCidadeAssinaturaVigente(contrato.id, valor);
  };
  const [enviarEmailOpen, setEnviarEmailOpen] = useState(false);
  const [anexosParaEnviar, setAnexosParaEnviar] = useState<Array<{ pdf: jsPDF; filename: string }>>(
    []
  );

  const [assinaturaOpen, setAssinaturaOpen] = useState(false);
  const [anexosParaAssinar, setAnexosParaAssinar] = useState<ContratoAnexo[]>([]);
  const enviarParaAssinatura = useEnviarParaAssinatura();
  const { user } = useAuth();

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

  const { data: todosTemplates = [], isLoading: loadingEmpresa } = useDocumentTemplates(
    open ? empresaId : null
  );

  // Folhas de Danos da org — ver o hook: não são filtráveis por empresa.
  const { data: folhasOrg = [], isLoading: loadingFolhas } = useFolhasDanosDaOrg(
    contrato.org_id,
    open
  );

  const loading = loadingEmpresa || loadingFolhas;

  // A Folha de Danos aparece aqui como qualquer outro documento. Entra UMA:
  // a da empresa seleccionada se existir, senão a da org — nunca uma lista de
  // folhas quase iguais.
  //
  // Note-se que sai GERADA NA HORA: leva os danos activos da viatura neste
  // momento e não as assinaturas do handover — essas só existem na folha
  // impressa durante a entrega/recolha.
  //
  // useMemo estabiliza a referência: sem ele, o array novo a cada render fazia
  // a pré-selecção (effect abaixo) correr sempre, esmagando a escolha do
  // utilizador a cada clique.
  const templates = useMemo(
    () => templatesComFolhaDanos(todosTemplates, folhasOrg, empresaId),
    [todosTemplates, folhasOrg, empresaId]
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
      persistirCidadeVigente(cidadeAssinatura);
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
        // Por email vai um ficheiro por documento (Contrato, Declaração,
        // Termo...), não um PDF único com tudo colado: quem recebe assina e
        // arquiva cada um por si.
        separados: true,
      });
      if (!resultado || !('anexos' in resultado) || resultado.anexos.length === 0) {
        throw new Error('Não foi possível gerar os documentos.');
      }
      persistirCidadeVigente(cidadeAssinatura);
      setAnexosParaEnviar(resultado.anexos.map((a) => ({ pdf: a.pdf, filename: a.fileName })));
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

  /**
   * Gera os documentos e abre a escolha de quem assina.
   *
   * Reaproveita o caminho do email — `separados: true` dá um PDF por documento,
   * e cada um leva consigo os dados que o produziram, que é o que permite
   * congelar a fotografia no envio.
   */
  const prepararAssinatura = async () => {
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
        separados: true,
      });

      if (!resultado || !('anexos' in resultado) || resultado.anexos.length === 0) {
        throw new Error('Não foi possível gerar os documentos.');
      }

      persistirCidadeVigente(cidadeAssinatura);
      setAnexosParaAssinar(resultado.anexos);
      setAssinaturaOpen(true);
    } catch (err) {
      toast({
        title: 'Erro ao preparar a assinatura',
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
            variant="outline"
            onClick={prepararAssinatura}
            disabled={gerando || loading || count === 0}
            className="gap-2"
          >
            {gerando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PenLine className="h-4 w-4" />
            )}
            Assinatura
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
        anexos={anexosParaEnviar}
        contextoLabel={`Contrato #${contrato.codigo ?? ''}`}
        entidades={contactosEnvio}
        orgId={contrato.org_id}
        // A empresa escolhida acima é quem emite o contrato — é ela que
        // encabeça e assina o email, não uma marca fixa.
        emissorNome={empresaSelecionada?.nomeCompleto || empresaSelecionada?.nome}
        emissorLogoUrl={empresaSelecionada?.logoUrl ?? null}
        detalhes={detalhesEmail}
      />

      <EnviarParaAssinaturaDialog
        open={assinaturaOpen}
        onOpenChange={setAssinaturaOpen}
        candidatos={candidatosDoContrato({ condutores, clientes, motoristas })}
        onEnviar={async (escolhidos) => {
          const { falharam } = await enviarParaAssinatura.mutateAsync({
            anexos: anexosParaAssinar,
            signatarios: escolhidos,
            orgId: contrato.org_id,
            contratoId: contrato.id,
            criadoPor: user?.id ?? null,
          });

          // "Enviado", nunca "entregue": não há como saber se o email chegou.
          toast({
            title:
              falharam.length > 0
                ? 'Pedidos criados, mas alguns emails falharam'
                : 'Pedidos de assinatura enviados',
            description:
              falharam.length > 0
                ? `Não foi possível enviar a: ${falharam.join(', ')}. Os pedidos ficaram criados — pode reenviar.`
                : undefined,
            variant: falharam.length > 0 ? 'destructive' : undefined,
          });
        }}
      />
    </Dialog>
  );
};
