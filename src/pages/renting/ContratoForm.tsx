import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoBack } from '@/hooks/useGoBack';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Printer,
  Trash2,
} from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { AnyRentDadosSaidaAlert } from '@/components/renting/contratos/AnyRentDadosSaidaAlert';
import { ClienteDialog } from '@/components/renting/ClienteDialog';
import { MotoristaDialog } from '@/components/motoristas/MotoristaDialog';
import { ContratoDocumentosDialog } from '@/components/renting/contratos/ContratoDocumentosDialog';
import { ContratoDeleteConfirm } from '@/components/renting/contratos/ContratoDeleteConfirm';
import { ContratoEstadoActions } from '@/components/renting/contratos/ContratoEstadoActions';
import {
  FecharContratoDialog,
  type AlteracaoMaterial,
} from '@/components/renting/contratos/FecharContratoDialog';
import { ContratoTabHistorico } from '@/components/renting/contratos/ContratoTabHistorico';
import { RealizarEntregaDialog } from '@/components/renting/contratos/RealizarEntregaDialog';
import { ContratoTabAnexos } from '@/components/renting/contratos/ContratoTabAnexos';
import { ContratoTabDanos } from '@/components/renting/contratos/ContratoTabDanos';
import { ContratoTabFaturar } from '@/components/renting/contratos/ContratoTabFaturar';
import { ResumoContrato } from '@/components/renting/contratos/ResumoContrato';
import { HistoricoEdicoesContrato } from '@/components/renting/contratos/HistoricoEdicoesContrato';

import { useContratoForm } from './contrato/useContratoForm';
import { ContratoTabGeral } from './contrato/tabs/ContratoTabGeral';
import { ContratoTabCoberturas } from './contrato/tabs/ContratoTabCoberturas';
import { ContratoTabExtras } from './contrato/tabs/ContratoTabExtras';
import { ContratoTabTaxas } from './contrato/tabs/ContratoTabTaxas';

const ContratoForm = () => {
  const navigate = useNavigate();
  const goBack = useGoBack('/renting/contratos');
  const {
    isEdit,
    id,
    clientes,
    motoristas,
    viaturas,
    estacoes,
    coberturas,
    extrasCatalogo,
    taxasCatalogo,
    grupos,
    tarifas,
    orgDefinicoes,
    contrato,
    loadingContrato,
    vizinhos,
    reservaAssociada,
    viaturaLocked,
    condutoresDb,
    empresas,
    form,
    isPending,
    activeTab,
    setActiveTab,
    confirmDeleteOpen,
    setConfirmDeleteOpen,
    clienteDialogOpen,
    setClienteDialogOpen,
    motoristaDialogOpen,
    setMotoristaDialogOpen,
    novaVersaoCtx,
    setNovaVersaoCtx,
    realizarDialog,
    setRealizarDialog,
    confirmarRealizacaoDireta,
    setConfirmarRealizacaoDireta,
    marcarRealizacaoDireta,
    docsDialogOpen,
    setDocsDialogOpen,
    viaturasParaSelecao,
    realizacaoPendente,
    condutoresRascunho,
    temConflito,
    dataInicio,
    dataFim,
    tarifaDiaria,
    valorTotalManual,
    descontoPercentagem,
    regime,
    isLongaDuracao,
    taxaIva,
    coberturasPrecoDia,
    extrasForm,
    taxasForm,
    grupoIdAtual,
    aplicarDadosViatura,
    handleSubmit,
    handleDelete,
    confirmDelete,
    confirmarNovaVersao,
    handleClienteCriado,
    handleMotoristaCriado,
  } = useContratoForm();

  const motoristaIdPrincipal =
    condutoresDb?.find((c) => c.is_principal && c.motorista_id)?.motorista_id ?? null;

  const abriuEntregaAoCriarRef = useRef(false);

  useEffect(() => {
    if (abriuEntregaAoCriarRef.current) return;
    if (!realizacaoPendente || realizacaoPendente.tipo !== 'entrega') return;
    // Handled inside the hook (useSearchParams + setRealizarDialog)
  }, [realizacaoPendente]);

  if (isEdit && loadingContrato) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isEdit && !contrato) {
    return (
      <div className="w-full">
        <StickyPageHeader title="Contrato não encontrado" icon={FileText} />
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Este contrato não existe ou já foi removido.</p>
            <Button
              variant="outline"
              className="mt-4 gap-2"
              onClick={() => navigate('/renting/contratos')}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar à lista
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full">
      <StickyPageHeader
        title={
          isEdit ? (
            <span className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 -ml-1"
                disabled={!vizinhos?.anterior}
                title={
                  vizinhos?.anterior
                    ? `Contrato anterior — #${vizinhos.anterior.codigo}`
                    : undefined
                }
                onClick={() =>
                  vizinhos?.anterior && navigate(`/renting/contratos/${vizinhos.anterior.id}`)
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {`Contrato #${contrato?.codigo}`}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!vizinhos?.seguinte}
                title={
                  vizinhos?.seguinte
                    ? `Contrato seguinte — #${vizinhos.seguinte.codigo}`
                    : undefined
                }
                onClick={() =>
                  vizinhos?.seguinte && navigate(`/renting/contratos/${vizinhos.seguinte.id}`)
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </span>
          ) : (
            'Novo Contrato'
          )
        }
        description={isEdit ? 'Editar dados do contrato existente' : 'Novo contrato de renting'}
        icon={FileText}
      >
        <Button type="button" variant="outline" onClick={goBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        {isEdit && contrato && (
          <ContratoEstadoActions
            contrato={contrato}
            motoristaId={
              condutoresDb?.find((c) => c.is_principal && c.motorista_id)?.motorista_id ?? null
            }
          />
        )}
        {isEdit && contrato && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setDocsDialogOpen(true)}
            className="gap-2"
            title="Gerar documentos (contrato, prestação, declarações...)"
          >
            <Printer className="h-4 w-4" />
            Documentos
          </Button>
        )}
        {isEdit && contrato && (
          <Button
            type="button"
            variant="outline"
            onClick={handleDelete}
            disabled={false}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </Button>
        )}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || contrato?.substituido_em != null || condutoresRascunho.length > 0}
          className="gap-2"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? 'Guardar' : 'Abrir Contrato'}
        </Button>
      </StickyPageHeader>

      {condutoresRascunho.length > 0 && (
        <Alert className="mb-3 border-warning/40 bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning/90">
            <strong>Contrato bloqueado.</strong> O seguinte condutor tem perfil incompleto (sem NIF
            / carta de condução):{' '}
            {condutoresRascunho
              .map((c) => motoristas.find((m) => m.id === c.motorista_id)?.nome ?? c.motorista_id)
              .join(', ')}
            . Abre a ficha do motorista, preenche todos os dados obrigatórios e guarda — o contrato
            ficará disponível de seguida.
          </AlertDescription>
        </Alert>
      )}

      {isEdit && contrato?.substituido_em && (
        <div className="mb-3 flex items-start gap-2 p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">
            Esta versão foi <strong>substituída</strong>. É apenas leitura — para alterações, abre a
            versão actual a partir do histórico.
          </p>
        </div>
      )}

      {isEdit && contrato?.dua_original_com_motorista && !contrato?.dua_devolvida_em && (
        <div className="mb-3 flex items-start gap-2 p-3 rounded-md border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">
            Este motorista saiu com a <strong>DUA original</strong> da viatura. Tem de ser{' '}
            <strong>devolvida quando o contrato for fechado</strong>.
            {contrato?.dua_observacoes ? ` (${contrato.dua_observacoes})` : ''}
          </p>
        </div>
      )}

      {contrato && <AnyRentDadosSaidaAlert contrato={contrato} />}

      {realizacaoPendente && (
        <div className="mb-3 flex flex-col gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              <strong>
                {realizacaoPendente.tipo === 'entrega' ? 'Entrega' : 'Recolha'} pendente
              </strong>{' '}
              — regista a {realizacaoPendente.tipo === 'entrega' ? 'entrega' : 'recolha'} da viatura
              (fotos, km e confirmação) quando estiver pronta.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() =>
                setRealizarDialog({
                  eventoId: realizacaoPendente.id,
                  tipo: realizacaoPendente.tipo,
                })
              }
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              Realizar {realizacaoPendente.tipo === 'entrega' ? 'entrega' : 'recolha'}
            </Button>
            {realizacaoPendente.tipo === 'entrega' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfirmarRealizacaoDireta(true)}
                disabled={marcarRealizacaoDireta.isPending}
                title="Marca a entrega como realizada sem passar pelo check (fotos/km) — para contratos já existentes no Any Rent."
              >
                {marcarRealizacaoDireta.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Any Rent'
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Confirmação do atalho "marcar entrega como já realizada" (sem check).
          Recolha/fecho não têm atalho — passam sempre por "Fechar contrato",
          pelo fluxo QR/Realizar recolha, ou por troca de viatura. */}
      <AlertDialog open={confirmarRealizacaoDireta} onOpenChange={setConfirmarRealizacaoDireta}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar entrega como já realizada?</AlertDialogTitle>
            <AlertDialogDescription>
              O contrato passa a "Em curso" sem registar fotos, km ou confirmação no terreno. Usa
              isto só para contratos já existentes no <strong>Any Rent</strong> — essa informação
              nunca existiu porque foram migrados de outro sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!contrato || !realizacaoPendente) return;
                marcarRealizacaoDireta.mutate({ contratoId: contrato.id });
                setConfirmarRealizacaoDireta(false);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 sm:p-6">
            <Form {...form}>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="w-full justify-start overflow-x-auto">
                    <TabsTrigger value="geral">Geral</TabsTrigger>
                    {isEdit && contrato && <TabsTrigger value="coberturas">Coberturas</TabsTrigger>}
                    {isEdit && contrato && <TabsTrigger value="extras">Extras</TabsTrigger>}
                    {isEdit && contrato && <TabsTrigger value="taxas">Taxas</TabsTrigger>}
                    {isEdit && contrato && <TabsTrigger value="faturar">Faturar</TabsTrigger>}
                    <TabsTrigger value="danos">Danos</TabsTrigger>
                    {isEdit && contrato && <TabsTrigger value="historico">Histórico</TabsTrigger>}
                    <TabsTrigger value="anexos">Anexos</TabsTrigger>
                  </TabsList>

                  <TabsContent value="geral" className="mt-4">
                    <ContratoTabGeral
                      form={form}
                      clientes={clientes}
                      motoristas={motoristas}
                      viaturas={viaturasParaSelecao}
                      grupos={grupos}
                      grupoIdAtual={grupoIdAtual}
                      estacoes={estacoes}
                      viaturaLocked={viaturaLocked}
                      reservaCodigo={reservaAssociada?.codigo ?? null}
                      onViaturaChange={aplicarDadosViatura}
                      contratoId={contrato?.id ?? null}
                      onCriarNovoCliente={() => setClienteDialogOpen(true)}
                      onCriarNovoMotorista={() => setMotoristaDialogOpen(true)}
                    />
                  </TabsContent>

                  {isEdit && contrato && (
                    <TabsContent value="coberturas" className="mt-4">
                      <ContratoTabCoberturas form={form} coberturas={coberturas} />
                    </TabsContent>
                  )}

                  {isEdit && contrato && (
                    <TabsContent value="extras" className="mt-4">
                      <ContratoTabExtras form={form} extras={extrasCatalogo} />
                    </TabsContent>
                  )}

                  {isEdit && contrato && (
                    <TabsContent value="taxas" className="mt-4">
                      <ContratoTabTaxas form={form} taxas={taxasCatalogo} />
                    </TabsContent>
                  )}

                  {isEdit && contrato && (
                    <TabsContent value="faturar" className="mt-4">
                      <ContratoTabFaturar contrato={contrato} />
                    </TabsContent>
                  )}

                  <TabsContent value="danos" className="mt-4">
                    <ContratoTabDanos contratoId={contrato?.id ?? null} />
                  </TabsContent>

                  {isEdit && contrato && (
                    <TabsContent value="historico" className="mt-4">
                      <ContratoTabHistorico
                        contratoId={contrato.id}
                        onAbrirVersao={(versaoId) => navigate(`/renting/contratos/${versaoId}`)}
                      />
                    </TabsContent>
                  )}

                  <TabsContent value="anexos" className="mt-4">
                    <ContratoTabAnexos contratoId={contrato?.id ?? null} />
                  </TabsContent>
                </Tabs>

                {temConflito && (
                  <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p className="text-sm">
                      Conflito de disponibilidade — esta viatura já tem contrato ou reserva activa
                      sobreposta a este período. Guardar irá falhar.
                    </p>
                  </div>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>

        <aside>
          <ResumoContrato
            dataInicio={dataInicio}
            dataFim={dataFim}
            tarifaDiaria={tarifaDiaria}
            valorTotalManual={valorTotalManual}
            descontoPercentagem={descontoPercentagem}
            taxaIva={taxaIva}
            regime={regime}
            coberturasPrecoDia={coberturasPrecoDia}
            extras={extrasForm}
            taxas={taxasForm}
            isFacturado={contrato?.estado_financeiro === 'facturado'}
            totalSnapshot={contrato?.total_final}
            subtotalSnapshot={contrato?.total_subtotal}
            ivaSnapshot={contrato?.total_iva}
          />
          {isEdit && contrato && <HistoricoEdicoesContrato contratoId={contrato.id} />}
        </aside>
      </div>

      <ContratoDeleteConfirm
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        contrato={contrato ?? null}
        isPending={false}
        onConfirm={confirmDelete}
      />

      <ClienteDialog
        open={clienteDialogOpen}
        onOpenChange={setClienteDialogOpen}
        cliente={null}
        defaultTipoCliente="condutor"
        onCreated={handleClienteCriado}
      />

      <MotoristaDialog
        open={motoristaDialogOpen}
        onOpenChange={setMotoristaDialogOpen}
        motorista={null}
        onMotoristaCreated={(m) => handleMotoristaCriado(m.id)}
      />

      {/* Troca/upgrade/downgrade: alteração material detectada no submit
          (ver detectarAlteracoesMateriais) abre o mesmo popup de fecho
          normal, em modo troca — fecha o contrato actual a sério e só
          depois cria a nova versão com os valores novos (confirmarNovaVersao,
          chamado via onFechado). */}
      {contrato && (
        <FecharContratoDialog
          open={novaVersaoCtx !== null}
          onOpenChange={(o) => {
            if (!o) setNovaVersaoCtx(null);
          }}
          contratoId={contrato.id}
          contratoCodigo={contrato.codigo}
          motoristaId={motoristaIdPrincipal}
          matricula={contrato.matricula}
          viaturaId={contrato.viatura_id}
          duaOriginalComMotorista={
            contrato.dua_original_com_motorista && !contrato.dua_devolvida_em
          }
          alteracoesTroca={novaVersaoCtx?.alteracoes ?? []}
          onFechado={confirmarNovaVersao}
        />
      )}

      <RealizarEntregaDialog
        open={!!realizarDialog}
        onOpenChange={(o) => {
          if (!o) setRealizarDialog(null);
        }}
        eventoId={realizarDialog?.eventoId ?? null}
        tipo={realizarDialog?.tipo ?? 'entrega'}
        resumo={contrato ? `Contrato #${contrato.codigo} · ${contrato.matricula ?? ''}` : undefined}
      />

      {isEdit && contrato && (
        <ContratoDocumentosDialog
          open={docsDialogOpen}
          onOpenChange={setDocsDialogOpen}
          contrato={contrato}
          condutores={condutoresDb ?? []}
          clientes={clientes}
          motoristas={motoristas}
          viatura={viaturas.find((v) => v.id === contrato.viatura_id) ?? null}
          empresas={empresas}
        />
      )}
    </div>
  );
};

export default ContratoForm;
