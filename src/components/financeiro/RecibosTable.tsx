import { useState } from 'react';
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
import { Card, CardContent } from '@/components/ui/card';
import { Eye, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { ReciboPreviewDialog } from './ReciboPreviewDialog';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/TablePagination';

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

export function RecibosTable({ recibos, onReciboUpdated }: RecibosTableProps) {
  const isMobile = useIsMobile();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [previewRecibo, setPreviewRecibo] = useState<Recibo | null>(null);

  // Assinatura estável da lista (1.º id + tamanho) para voltar à 1ª página
  // quando o pai troca de filtro — mesmo que a contagem se mantenha igual.
  const { setPage, totalPages, total, pageItems, start, end, page, pageSizeStr, setPageSizeStr } =
    usePagination(recibos, 25, `${recibos.length}|${recibos[0]?.id ?? ''}`);

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

  async function handleRejeitar(id: string) {
    setLoadingAction(id + '-rejeitar');
    try {
      const { error } = await supabase
        .from('motorista_recibos')
        .update({
          status: 'rejeitado',
          data_validacao: new Date().toISOString(),
          validado_por: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq('id', id);

      if (error) throw error;
      toast.success('Recibo recusado');
      onReciboUpdated();
    } catch (error) {
      console.error('Erro ao rejeitar:', error);
      toast.error('Erro ao recusar recibo');
    } finally {
      setLoadingAction(null);
    }
  }

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
                          onClick={() => handleRejeitar(recibo.id)}
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
              <TableHead className="w-[80px]">Código</TableHead>
              <TableHead>Motorista</TableHead>
              <TableHead>Semana</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Submetido</TableHead>
              <TableHead>Status</TableHead>
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
                            onClick={() => handleRejeitar(recibo.id)}
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
    </>
  );
}
