import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import { Loader2, Pencil, Plus, RefreshCw, Settings } from 'lucide-react';
import type { IntegracaoConfig } from '../integracoes/types';
import { ViaVerdeContaDialog } from './ViaVerdeContaDialog';
import type { ViaVerdeConta } from './types';

const VIA_VERDE_INTERNAL_NAME = 'Via Verde';

export const ViaVerdePanel: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [integracao, setIntegracao] = useState<IntegracaoConfig | null>(null);
  const [contas, setContas] = useState<ViaVerdeConta[]>([]);
  const [selectedConta, setSelectedConta] = useState<ViaVerdeConta | null>(null);
  const [sortField, setSortField] = useState<string>('nome_conta');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const normalizeIntegracao = async (integracaoBase: IntegracaoConfig) => {
    if (integracaoBase.nome === VIA_VERDE_INTERNAL_NAME) {
      return integracaoBase;
    }

    const { error } = await supabase
      .from('plataformas_configuracao')
      .update({ nome: VIA_VERDE_INTERNAL_NAME })
      .eq('id', integracaoBase.id);

    if (error) throw error;

    return {
      ...integracaoBase,
      nome: VIA_VERDE_INTERNAL_NAME,
    };
  };

  const ensureIntegracaoBase = async () => {
    const existingIntegracao = integracao;
    if (existingIntegracao) {
      const normalizedIntegracao = await normalizeIntegracao(existingIntegracao);
      setIntegracao(normalizedIntegracao);
      return normalizedIntegracao;
    }

    const { data: existingData, error: existingError } = await supabase
      .from('plataformas_configuracao')
      .select('*')
      .eq('plataforma', 'via_verde')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existingData) {
      const normalizedIntegracao = await normalizeIntegracao(existingData as IntegracaoConfig);
      setIntegracao(normalizedIntegracao);
      return normalizedIntegracao;
    }

    const { data, error } = await supabase
      .from('plataformas_configuracao')
      .insert({
        nome: VIA_VERDE_INTERNAL_NAME,
        plataforma: 'via_verde',
        ativo: true,
      })
      .select('*')
      .single();

    if (error) throw error;

    const novaIntegracao = data as IntegracaoConfig;
    setIntegracao(novaIntegracao);
    return novaIntegracao;
  };

  const fetchViaVerde = async () => {
    try {
      setLoading(true);
      const integracaoBase = await ensureIntegracaoBase();
      const supabaseAny = supabase as any;

      const { data, error } = await supabaseAny
        .from('via_verde_contas')
        .select('*')
        .eq('integracao_id', integracaoBase.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContas((data || []) as ViaVerdeConta[]);
    } catch (error: any) {
      console.error('Erro ao carregar Via Verde:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível carregar as contas Via Verde.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchViaVerde();
  }, []);

  const handleCreateAccount = async () => {
    try {
      const integracaoBase = await ensureIntegracaoBase();
      setIntegracao(integracaoBase);
      setSelectedConta(null);
      setDialogOpen(true);
    } catch (error: any) {
      console.error('Erro ao preparar Via Verde:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível preparar a conta Via Verde.',
        variant: 'destructive',
      });
    }
  };

  const handleEditAccount = async (conta: ViaVerdeConta) => {
    try {
      const integracaoBase = await ensureIntegracaoBase();
      setIntegracao(integracaoBase);
      setSelectedConta(conta);
      setDialogOpen(true);
    } catch (error: any) {
      console.error('Erro ao abrir conta Via Verde:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível abrir a conta Via Verde.',
        variant: 'destructive',
      });
    }
  };

  const sortedContas = useMemo(() => {
    const list = [...contas];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'nome_conta') {
        va = a.nome_conta;
        vb = b.nome_conta;
      } else if (sortField === 'codigo_rac') {
        va = a.codigo_rac || '';
        vb = b.codigo_rac || '';
      } else if (sortField === 'ftp_ativo') {
        va = a.ftp_ativo ? 0 : 1;
        vb = b.ftp_ativo ? 0 : 1;
      } else if (sortField === 'sync_ativo') {
        va = a.sync_ativo ? 0 : 1;
        vb = b.sync_ativo ? 0 : 1;
      } else if (sortField === 'estado') {
        va = a.ftp_ativo || a.sync_ativo ? 0 : 1;
        vb = b.ftp_ativo || b.sync_ativo ? 0 : 1;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [contas, sortField, sortDir]);

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
                <Settings className="h-5 w-5" />
                Via Verde
              </CardTitle>
              <CardDescription>
                Configure contas Via Verde com acesso FTP/SFTP e sincronização de dispositivos.
              </CardDescription>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={fetchViaVerde}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Actualizar
              </Button>
              <Button onClick={handleCreateAccount}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Conta
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {contas.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Settings className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>Ainda não existem contas Via Verde configuradas.</p>
              <p className="text-sm">
                Clique em &quot;Nova Conta&quot; para adicionar a primeira conta.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    field="nome_conta"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Conta
                  </SortableTableHead>
                  <SortableTableHead
                    field="codigo_rac"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    RAC
                  </SortableTableHead>
                  <SortableTableHead
                    field="ftp_ativo"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    FTP/SFTP
                  </SortableTableHead>
                  <SortableTableHead
                    field="sync_ativo"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Sync dispositivos
                  </SortableTableHead>
                  <SortableTableHead
                    field="estado"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Estado
                  </SortableTableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedContas.map((conta) => {
                  const contaActiva = conta.ftp_ativo || conta.sync_ativo;

                  return (
                    <TableRow key={conta.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{conta.nome_conta}</p>
                          <p className="text-sm text-muted-foreground">
                            {conta.ftp_host}:{conta.ftp_porta}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{conta.codigo_rac}</TableCell>
                      <TableCell>
                        <Badge variant={conta.ftp_ativo ? 'default' : 'secondary'}>
                          {conta.ftp_protocolo.toUpperCase()} ·{' '}
                          {conta.ftp_ativo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={conta.sync_ativo ? 'default' : 'secondary'}>
                          {conta.sync_ativo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={contaActiva ? 'default' : 'secondary'}>
                          {contaActiva ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditAccount(conta)}
                        >
                          <Pencil className="h-4 w-4" />
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

      {integracao && (
        <ViaVerdeContaDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          integracaoId={integracao.id}
          conta={selectedConta}
          onSuccess={fetchViaVerde}
        />
      )}
    </>
  );
};
