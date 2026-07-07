import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Car, Calendar, MapPin, User, Phone, Mail, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { DasprentNavigation } from '@/components/DasprentNavigation';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/TablePagination';

interface Lead {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  zona: string;
  data_aluguer: string;
  tipo_viatura: string;
  observacoes: string;
  status: string;
  created_at: string;
  updated_at: string;
}

const statusOptions = [
  { value: 'novo', label: 'Novo', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'contactado', label: 'Contactado', color: 'bg-primary/20 text-primary' },
  {
    value: 'proposta_enviada',
    label: 'Proposta Enviada',
    color: 'bg-purple-500/20 text-purple-400',
  },
  { value: 'negociacao', label: 'Negociação', color: 'bg-orange-500/20 text-orange-400' },
  { value: 'fechado', label: 'Fechado', color: 'bg-green-500/20 text-green-400' },
  { value: 'perdido', label: 'Perdido', color: 'bg-red-500/20 text-red-400' },
];

const DasprentLeads = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const { toast } = useToast();

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      const { data, error } = await supabase
        .from('leads_dasprent')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Erro ao carregar leads: ' + error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const updateLeadStatus = async (leadId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('leads_dasprent')
        .update({ status: newStatus })
        .eq('id', leadId);

      if (error) throw error;

      setLeads(leads.map((lead) => (lead.id === leadId ? { ...lead, status: newStatus } : lead)));

      toast({
        title: 'Sucesso',
        description: 'Status do lead atualizado com sucesso!',
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getStatusStyle = (status: string) => {
    const statusOption = statusOptions.find((option) => option.value === status);
    return statusOption ? statusOption.color : 'bg-gray-500/20 text-gray-400';
  };

  const getStatusLabel = (status: string) => {
    const statusOption = statusOptions.find((option) => option.value === status);
    return statusOption ? statusOption.label : status;
  };

  const filteredLeads =
    filterStatus === 'all' ? leads : leads.filter((lead) => lead.status === filterStatus);

  // Paginação client-side (com seletor de tamanho). Volta à 1ª página ao trocar
  // de filtro de status.
  const { setPage, totalPages, total, pageItems, start, end, page, pageSizeStr, setPageSizeStr } =
    usePagination(filteredLeads, 25, filterStatus);

  const stats = {
    total: leads.length,
    novos: leads.filter((l) => l.status === 'novo').length,
    contactados: leads.filter((l) => l.status === 'contactado').length,
    fechados: leads.filter((l) => l.status === 'fechado').length,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Car className="h-12 w-12 animate-pulse text-primary mx-auto mb-4" />
          <p className="text-white text-lg">Carregando leads...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <DasprentNavigation />

      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Leads DasPrent</h1>
            <p className="text-gray-400">Gerir leads de aluguer de viaturas</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <User className="h-6 w-6 text-blue-400" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm text-gray-400">Total Leads</p>
                    <p className="text-2xl font-bold text-white">{stats.total}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-800/50 border-gray-700">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <Calendar className="h-6 w-6 text-primary" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm text-gray-400">Novos</p>
                    <p className="text-2xl font-bold text-white">{stats.novos}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-800/50 border-gray-700">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-purple-500/20 rounded-lg">
                    <Phone className="h-6 w-6 text-purple-400" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm text-gray-400">Contactados</p>
                    <p className="text-2xl font-bold text-white">{stats.contactados}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-800/50 border-gray-700">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-green-500/20 rounded-lg">
                    <Car className="h-6 w-6 text-green-400" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm text-gray-400">Fechados</p>
                    <p className="text-2xl font-bold text-white">{stats.fechados}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="bg-gray-800/50 border-gray-700 mb-6">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <label className="text-white font-medium">Filtrar por status:</label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-48 bg-gray-700 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="all" className="text-white">
                      Todos
                    </SelectItem>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-white">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Leads Table */}
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Car className="h-5 w-5" />
                Lista de Leads ({filteredLeads.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-gray-300">Nome</TableHead>
                      <TableHead className="text-gray-300">Contacto</TableHead>
                      <TableHead className="text-gray-300">Zona</TableHead>
                      <TableHead className="text-gray-300">Tipo Viatura</TableHead>
                      <TableHead className="text-gray-300">Data Aluguer</TableHead>
                      <TableHead className="text-gray-300">Status</TableHead>
                      <TableHead className="text-gray-300">Data Criação</TableHead>
                      <TableHead className="text-gray-300">Observações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageItems.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell className="text-white font-medium">{lead.nome}</TableCell>
                        <TableCell className="text-gray-300">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              <span className="text-xs">{lead.email}</span>
                            </div>
                            {lead.telefone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                <span className="text-xs">{lead.telefone}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-300">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span className="text-xs">{lead.zona}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-300">{lead.tipo_viatura}</TableCell>
                        <TableCell className="text-gray-300">
                          {lead.data_aluguer
                            ? format(new Date(lead.data_aluguer), 'dd/MM/yyyy', { locale: pt })
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={lead.status}
                            onValueChange={(value) => updateLeadStatus(lead.id, value)}
                          >
                            <SelectTrigger
                              className={`w-36 text-xs ${getStatusStyle(lead.status)}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-600">
                              {statusOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                  className="text-white"
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-gray-300 text-xs">
                          {format(new Date(lead.created_at), 'dd/MM/yyyy HH:mm', { locale: pt })}
                        </TableCell>
                        <TableCell className="text-gray-300 max-w-48">
                          {lead.observacoes && (
                            <div className="flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              <span className="text-xs truncate">{lead.observacoes}</span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {total > 0 && (
                <TablePagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  start={start}
                  end={end}
                  onPageChange={setPage}
                  noun={['lead', 'leads']}
                  pageSizeStr={pageSizeStr}
                  onPageSizeChange={setPageSizeStr}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DasprentLeads;
