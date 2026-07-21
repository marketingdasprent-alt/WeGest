import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import { Loader2, Plus, Settings, Zap, Car, CheckCircle, XCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import { IntegracaoDialog } from './IntegracaoDialog';
import { IntegracaoDetailModal } from './IntegracaoDetailModal';
import type { IntegracaoConfig, PlataformaOperacional } from './integracoes/types';

export const PlataformasPanel: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [integracoes, setIntegracoes] = useState<IntegracaoConfig[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedIntegracao, setSelectedIntegracao] = useState<IntegracaoConfig | null>(null);
  const [sortField, setSortField] = useState<string>('nome');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  useEffect(() => {
    fetchIntegracoes();
  }, []);

  const fetchIntegracoes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('plataformas_configuracao')
        .select('*')
        .in('plataforma', ['bolt', 'uber'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setIntegracoes((data || []) as IntegracaoConfig[]);
    } catch (error: any) {
      console.error('Erro ao carregar integrações:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as plataformas.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleIntegracaoUpdated = (updatedIntegracao?: IntegracaoConfig) => {
    if (!updatedIntegracao) {
      fetchIntegracoes();
      return;
    }

    setIntegracoes((prev) =>
      prev.map((integracao) =>
        integracao.id === updatedIntegracao.id ? updatedIntegracao : integracao
      )
    );
    setSelectedIntegracao(updatedIntegracao);
  };

  const handleOpenDetail = (integracao: IntegracaoConfig) => {
    setSelectedIntegracao(integracao);
    setDetailModalOpen(true);
  };

  const handleCreateNew = () => {
    setSelectedIntegracao(null);
    setDialogOpen(true);
  };

  const getLastActivity = (integracao: IntegracaoConfig) =>
    integracao.plataforma === 'uber'
      ? (integracao.last_webhook_at ?? integracao.ultimo_sync)
      : integracao.ultimo_sync;

  const sortedIntegracoes = useMemo(() => {
    const list = [...integracoes];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'nome') {
        va = a.nome || '';
        vb = b.nome || '';
      } else if (sortField === 'plataforma') {
        va = a.plataforma || '';
        vb = b.plataforma || '';
      } else if (sortField === 'estado') {
        va = a.ativo ? 0 : 1;
        vb = b.ativo ? 0 : 1;
      } else if (sortField === 'lastActivity') {
        va = getLastActivity(a) || '';
        vb = getLastActivity(b) || '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [integracoes, sortField, sortDir]);

  const getPlataformaBadge = (plataforma: string) => {
    switch (plataforma) {
      case 'bolt':
        return (
          <Badge variant="secondary" className="gap-1">
            <Zap className="h-3 w-3" /> Bolt
          </Badge>
        );
      case 'uber':
        return (
          <Badge variant="secondary" className="gap-1">
            <Car className="h-3 w-3" /> Uber
          </Badge>
        );
      default:
        return <Badge variant="secondary">{plataforma}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Plataformas
              </CardTitle>
              <CardDescription>
                Configure integrações com plataformas TVDE como Bolt e Uber.
              </CardDescription>
            </div>
            <Button onClick={handleCreateNew}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Integração
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {integracoes.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Zap className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>Nenhuma plataforma configurada.</p>
              <p className="text-sm">Clique em &quot;Nova Integração&quot; para adicionar.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    field="nome"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Nome
                  </SortableTableHead>
                  <SortableTableHead
                    field="plataforma"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Plataforma
                  </SortableTableHead>
                  <SortableTableHead
                    field="estado"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                    className="text-center"
                  >
                    Estado
                  </SortableTableHead>
                  <SortableTableHead
                    field="lastActivity"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Última actividade
                  </SortableTableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedIntegracoes.map((integracao) => {
                  const lastActivity = getLastActivity(integracao);

                  return (
                    <TableRow key={integracao.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <div>
                          <p className="font-medium">{integracao.nome}</p>
                          {integracao.company_name && (
                            <p className="text-sm text-muted-foreground">
                              {integracao.company_name}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getPlataformaBadge(integracao.plataforma as PlataformaOperacional)}
                      </TableCell>
                      <TableCell className="text-center">
                        {integracao.ativo ? (
                          <Badge variant="default" className="gap-1">
                            <CheckCircle className="h-3 w-3" /> Activo
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <XCircle className="h-3 w-3" /> Inactivo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {lastActivity ? (
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(lastActivity), {
                              addSuffix: true,
                              locale: pt,
                            })}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Nunca</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDetail(integracao)}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <IntegracaoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchIntegracoes}
      />

      {selectedIntegracao && (
        <IntegracaoDetailModal
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          integracao={selectedIntegracao}
          onUpdate={handleIntegracaoUpdated}
        />
      )}
    </>
  );
};
