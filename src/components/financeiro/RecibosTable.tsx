import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ReciboStatusBadge } from '@/lib/statusBadges';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import { Card, CardContent } from '@/components/ui/card';
import { Eye, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { ReciboPreviewDialog } from './ReciboPreviewDialog';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/TablePagination';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface Recibo {
  id: string;
  codigo: number;
  motorista_id: string;
  ficheiro_url: string;
  nome_ficheiro: string | null;
  descricao: string;
  valor_total: number | null;
  semana_referencia_inicio: string | null;
  status: string | null;
  created_at: string | null;
  motoristas_ativos: {
    id: string;
    codigo: number;
    nome: string;
  } | null;
}

interface RecibosTableProps {
  recibos: Recibo[];
  onReciboUpdated: () => void;
}

const RECIBOS_COLUMNS: {
  field: string;
  label: string;
  className?: string;
  align?: 'left' | 'right';
}[] = [
  { field: 'codigo', label: 'Código', className: 'w-[80px]' },
  { field: 'motorista', label: 'Motorista' },
  { field: 'semana', label: 'Semana' },
  { field: 'valor_total', label: 'Valor', align: 'right' },
  { field: 'created_at', label: 'Submetido' },
  { field: 'status', label: 'Status' },
];

export function RecibosTable({ recibos, onReciboUpdated }: RecibosTableProps) {
  const isMobile = useIsMobile();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [previewRecibo, setPreviewRecibo] = useState<Recibo | null>(null);
  // Recusa com motivo: abre um modal para escrever o porquê, que fica gravado
  // em observacoes e aparece ao motorista no painel (ao clicar no recibo recusado).
  const [rejeitarRecibo, setRejeitarRecibo] = useState<Recibo | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState('');

  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const sortedRecibos = useMemo(() => {
    const list = [...recibos];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'codigo') {
        va = a.codigo;
        vb = b.codigo;
      } else if (sortField === 'motorista') {
        va = a.motoristas_ativos?.nome || '';
        vb = b.motoristas_ativos?.nome || '';
      } else if (sortField === 'semana') {
        va = a.semana_referencia_inicio || '';
        vb = b.semana_referencia_inicio || '';
      } else if (sortField === 'valor_total') {
        va = a.valor_total ?? 0;
        vb = b.valor_total ?? 0;
      } else if (sortField === 'created_at') {
        va = a.created_at || '';
        vb = b.created_at || '';
      } else if (sortField === 'status') {
        va = a.status || '';
        vb = b.status || '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [recibos, sortField, sortDir]);

  // Assinatura estável da lista (1.º id + tamanho + ordenação) para voltar à
  // 1ª página quando o pai troca de filtro ou o utilizador reordena.
  const { setPage, totalPages, total, pageItems, start, end, page, pageSizeStr, setPageSizeStr } =
    usePagination(
      sortedRecibos,
      25,
      `${recibos.length}|${recibos[0]?.id ?? ''}|${sortField}|${sortDir}`
    );

  const formatCurrency = (value: number | null) =>
    value
      ? new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value)
      : '—';

  const formatWeek = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 6);
    return `${date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })} - ${endDate.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  async function handleValidar(id: string) {
    setLoadingAction(id + '-validar');
    try {
      const { error } = await supabase
        .from('motorista_recibos')
        .update({
          status: 'validado',
          data_validacao: new Date().toISOString(),
          validado_por: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq('id', id);

      if (error) throw error;
      toast.success('Recibo validado com sucesso');
      onReciboUpdated();
    } catch (error) {
      console.error('Erro ao validar:', error);
      toast.error('Erro ao validar recibo');
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleRejeitar(id: string, motivo: string) {
    setLoadingAction(id + '-rejeitar');
    try {
      const { error } = await supabase
        .from('motorista_recibos')
        .update({
          status: 'rejeitado',
          observacoes: motivo.trim() || null,
          data_validacao: new Date().toISOString(),
          validado_por: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq('id', id);

      if (error) throw error;
      toast.success('Recibo recusado');
      setRejeitarRecibo(null);
      setMotivoRecusa('');
      onReciboUpdated();
    } catch (error) {
      console.error('Erro ao rejeitar:', error);
      toast.error('Erro ao recusar recibo');
    } finally {
      setLoadingAction(null);
    }
  }

  // Modal de recusa com motivo — partilhado pelas vistas mobile e desktop.
  const rejeitarModal = (
    <Dialog
      open={!!rejeitarRecibo}
      onOpenChange={(open) => {
        if (!open) {
          setRejeitarRecibo(null);
          setMotivoRecusa('');
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recusar recibo verde</DialogTitle>
          <DialogDescription>
            {rejeitarRecibo?.motoristas_ativos?.nome
              ? `Recibo de ${rejeitarRecibo.motoristas_ativos.nome}. `
              : ''}
            Escreve o motivo — o motorista vê-o no painel ao clicar no recibo recusado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="motivo-recusa">Motivo da recusa</Label>
          <Textarea
            id="motivo-recusa"
            value={motivoRecusa}
            onChange={(e) => setMotivoRecusa(e.target.value)}
            placeholder="Ex: o valor não corresponde à semana, o ficheiro está ilegível…"
            rows={4}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setRejeitarRecibo(null);
              setMotivoRecusa('');
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => rejeitarRecibo && handleRejeitar(rejeitarRecibo.id, motivoRecusa)}
            disabled={
              !motivoRecusa.trim() || loadingAction === (rejeitarRecibo?.id ?? '') + '-rejeitar'
            }
          >
            {loadingAction === (rejeitarRecibo?.id ?? '') + '-rejeitar' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Confirmar recusa'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Mobile view - Cards
  if (isMobile) {
    return (
      <>
        <div className="space-y-3">
          {recibos.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhum recibo encontrado
              </CardContent>
            </Card>
          ) : (
            pageItems.map((recibo) => (
              <Card key={recibo.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">#{String(recibo.codigo).padStart(4, '0')}</p>
                      <p className="text-sm text-muted-foreground">
                        {recibo.motoristas_ativos?.nome || 'Motorista desconhecido'}
                      </p>
                    </div>
                    <ReciboStatusBadge status={recibo.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Semana</p>
                      <p>{formatWeek(recibo.semana_referencia_inicio)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Valor</p>
                      <p className="font-medium">{formatCurrency(recibo.valor_total)}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setPreviewRecibo(recibo)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Ver
                    </Button>
                    {recibo.status === 'submetido' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-green-600 hover:text-green-700"
                          onClick={() => handleValidar(recibo.id)}
                          disabled={loadingAction === recibo.id + '-validar'}
                        >
                          {loadingAction === recibo.id + '-validar' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Validar
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-red-600 hover:text-red-700"
                          onClick={() => setRejeitarRecibo(recibo)}
                          disabled={loadingAction === recibo.id + '-rejeitar'}
                        >
                          {loadingAction === recibo.id + '-rejeitar' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 mr-1" />
                              Recusar
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {total > 0 && (
          <TablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            start={start}
            end={end}
            onPageChange={setPage}
            noun={['recibo', 'recibos']}
            pageSizeStr={pageSizeStr}
            onPageSizeChange={setPageSizeStr}
          />
        )}

        <ReciboPreviewDialog
          open={!!previewRecibo}
          onOpenChange={(open) => !open && setPreviewRecibo(null)}
          recibo={
            previewRecibo
              ? {
                  ...previewRecibo,
                  motorista_nome: previewRecibo.motoristas_ativos?.nome,
                }
              : null
          }
        />
        {rejeitarModal}
      </>
    );
  }

  // Desktop view - Table
  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {RECIBOS_COLUMNS.map((col) => (
                <SortableTableHead
                  key={col.field}
                  field={col.field}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className={col.className}
                  align={col.align}
                >
                  {col.label}
                </SortableTableHead>
              ))}
              <TableHead className="text-right">Acções</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recibos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  Nenhum recibo encontrado
                </TableCell>
              </TableRow>
            ) : (
              pageItems.map((recibo) => (
                <TableRow key={recibo.id}>
                  <TableCell className="font-mono">
                    #{String(recibo.codigo).padStart(4, '0')}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{recibo.motoristas_ativos?.nome || '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        #{String(recibo.motoristas_ativos?.codigo || 0).padStart(4, '0')}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{formatWeek(recibo.semana_referencia_inicio)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(recibo.valor_total)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(recibo.created_at)}
                  </TableCell>
                  <TableCell>
                    <ReciboStatusBadge status={recibo.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPreviewRecibo(recibo)}
                        title="Ver recibo"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {recibo.status === 'submetido' && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleValidar(recibo.id)}
                            disabled={loadingAction === recibo.id + '-validar'}
                            title="Validar"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          >
                            {loadingAction === recibo.id + '-validar' ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setRejeitarRecibo(recibo)}
                            disabled={loadingAction === recibo.id + '-rejeitar'}
                            title="Recusar"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            {loadingAction === recibo.id + '-rejeitar' ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {total > 0 && (
          <TablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            start={start}
            end={end}
            onPageChange={setPage}
            noun={['recibo', 'recibos']}
            pageSizeStr={pageSizeStr}
            onPageSizeChange={setPageSizeStr}
          />
        )}
      </div>

      <ReciboPreviewDialog
        open={!!previewRecibo}
        onOpenChange={(open) => !open && setPreviewRecibo(null)}
        recibo={
          previewRecibo
            ? {
                ...previewRecibo,
                motorista_nome: previewRecibo.motoristas_ativos?.nome,
              }
            : null
        }
      />
      {rejeitarModal}
    </>
  );
}
