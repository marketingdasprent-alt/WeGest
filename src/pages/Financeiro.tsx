import { useState, useEffect, useMemo } from 'react';
import { matchesSearch } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FinanceiroStats } from '@/components/financeiro/FinanceiroStats';
import { FinanceiroFilters } from '@/components/financeiro/FinanceiroFilters';
import { RecibosTable } from '@/components/financeiro/RecibosTable';
import { Loader2, Receipt } from 'lucide-react';

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

interface Motorista {
  id: string;
  codigo: number;
  nome: string;
}

export default function Financeiro() {
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');

  useEffect(() => {
    loadData();

    // Configurar real-time updates
    const channel = supabase
      .channel('financeiro-recibos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'motorista_recibos' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Carregar recibos com dados do motorista
      const { data: recibosData, error: recibosError } = await supabase
        .from('motorista_recibos')
        .select(
          `
          *,
          motoristas_ativos!motorista_recibos_motorista_id_fkey (
            id,
            codigo,
            nome
          )
        `
        )
        .eq('tipo', 'recibo')
        .order('created_at', { ascending: false });

      if (recibosError) throw recibosError;
      setRecibos(recibosData || []);

      // Carregar lista de motoristas para o filtro
      const { data: motoristasData, error: motoristasError } = await supabase
        .from('motoristas_ativos')
        .select('id, codigo, nome')
        .eq('status_ativo', true)
        .order('nome');

      if (motoristasError) throw motoristasError;
      setMotoristas(motoristasData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar recibos');
    } finally {
      setLoading(false);
    }
  }

  // Aplicar filtros
  const filteredRecibos = useMemo(() => {
    return recibos.filter((recibo) => {
      // Pesquisa unificada
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const codigoRecibo = String(recibo.codigo).padStart(4, '0');
        const codigoMotorista = String(recibo.motoristas_ativos?.codigo || '').padStart(4, '0');
        const valorStr = String(recibo.valor_total || 0);

        const matches =
          codigoRecibo.includes(term.replace('#', '')) ||
          codigoMotorista.includes(term.replace('#', '')) ||
          matchesSearch(recibo.motoristas_ativos?.nome, searchTerm) ||
          valorStr.includes(term);

        if (!matches) return false;
      }

      // Filtro por status
      if (selectedStatus !== 'all' && recibo.status !== selectedStatus) {
        return false;
      }

      return true;
    });
  }, [recibos, searchTerm, selectedStatus]);

  function handleClearFilters() {
    setSearchTerm('');
    setSelectedStatus('all');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Receipt className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Gestão de recibos verdes dos motoristas</p>
        </div>
      </div>

      {/* Stats Cards */}
      <FinanceiroStats recibos={recibos} />

      {/* Filtros */}
      <FinanceiroFilters
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        selectedStatus={selectedStatus}
        setSelectedStatus={setSelectedStatus}
        onClearFilters={handleClearFilters}
      />

      {/* Contador de resultados */}
      <div className="text-sm text-muted-foreground">
        {filteredRecibos.length} {filteredRecibos.length === 1 ? 'recibo' : 'recibos'} encontrado
        {filteredRecibos.length !== 1 && 's'}
      </div>

      {/* Tabela de Recibos */}
      <RecibosTable recibos={filteredRecibos} onReciboUpdated={loadData} />
    </div>
  );
}
