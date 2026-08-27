import { useState, useEffect, useMemo } from 'react';
import { matchesSearch } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { FinanceiroStats } from '@/components/financeiro/FinanceiroStats';
import { FinanceiroFilters } from '@/components/financeiro/FinanceiroFilters';
import { RecibosTable } from '@/components/financeiro/RecibosTable';
import { Loader2, Receipt, Zap, Car, Briefcase, Calculator, Fuel, MapPin } from 'lucide-react';
import { BoltDataTab } from '@/components/administrativo/BoltDataTab';
import { UberDataTab } from '@/components/administrativo/UberDataTab';
import { BPDataTab } from '@/components/administrativo/BPDataTab';
import { RepsolDataTab } from '@/components/administrativo/RepsolDataTab';
import { EdpDataTab } from '@/components/administrativo/EdpDataTab';
import { ViaVerdeDataTab } from '@/components/administrativo/ViaVerdeDataTab';
import { ContasResumoTab } from '@/components/administrativo/ContasResumoTab';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';

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

export default function Administrativo() {
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Permissões granulares do módulo Administrativo (admins têm acesso a tudo).
  const { hasAccessToResource } = usePermissions();
  const canResumos = hasAccessToResource(RECURSOS.ADMINISTRATIVO_RESUMOS);
  const canRecibos = hasAccessToResource(RECURSOS.FINANCEIRO_RECIBOS);
  const canPlataformas = hasAccessToResource(RECURSOS.ADMINISTRATIVO_PLATAFORMAS);
  const defaultTab = canResumos ? 'resumos' : canRecibos ? 'recibos' : 'bolt';

  useEffect(() => {
    loadData();

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
      const { data: recibosData, error: recibosError } = await supabase
        .from('motorista_recibos')
        .select(`*, motoristas_ativos!motorista_recibos_motorista_id_fkey (id, codigo, nome)`)
        .eq('tipo', 'recibo')
        .order('created_at', { ascending: false });

      if (recibosError) throw recibosError;
      setRecibos(recibosData || []);

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

  const filteredRecibos = useMemo(() => {
    return recibos.filter((recibo) => {
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
      if (selectedStatus !== 'all' && recibo.status !== selectedStatus) return false;
      return true;
    });
  }, [recibos, searchTerm, selectedStatus]);

  function handleClearFilters() {
    setSearchTerm('');
    setSelectedStatus('all');
  }

  if (loading) {
    return (
      <div className="p-4">
        <TableSkeleton colunas={5} linhas={6} />
      </div>
    );
  }

  const triggerClass =
    'data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto gap-2 text-xs';

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <StickyPageHeader
        title="Administrativo"
        description="Gestão financeira e dados de plataformas"
        icon={Briefcase}
      />

      <TabsList className="flex w-full overflow-x-auto justify-start no-scrollbar border-b rounded-none bg-transparent h-auto p-0 gap-6 mb-2">
        {canResumos && (
          <TabsTrigger value="resumos" className={triggerClass}>
            <Calculator className="h-4 w-4" />
            Resumos
          </TabsTrigger>
        )}
        {canRecibos && (
          <TabsTrigger value="recibos" className={triggerClass}>
            <Receipt className="h-4 w-4" />
            Recibos Verdes
          </TabsTrigger>
        )}
        {canPlataformas && (
          <>
            <TabsTrigger value="bolt" className={triggerClass}>
              <Zap className="h-4 w-4" />
              Bolt
            </TabsTrigger>
            <TabsTrigger value="uber" className={triggerClass}>
              <Car className="h-4 w-4" />
              Uber
            </TabsTrigger>
            <TabsTrigger value="bp" className={triggerClass}>
              <Fuel className="h-4 w-4 text-orange-400" />
              BP
            </TabsTrigger>
            <TabsTrigger value="repsol" className={triggerClass}>
              <Fuel className="h-4 w-4 text-orange-500" />
              Repsol
            </TabsTrigger>
            <TabsTrigger value="edp" className={triggerClass}>
              <Zap className="h-4 w-4 text-green-500" />
              EDP
            </TabsTrigger>
            <TabsTrigger value="viaverde" className={triggerClass}>
              <MapPin className="h-4 w-4 text-emerald-500" />
              Via Verde
            </TabsTrigger>
          </>
        )}
      </TabsList>

      <div className="space-y-6">
        {canRecibos && (
          <TabsContent value="recibos" className="space-y-4 mt-4">
            <FinanceiroStats recibos={recibos} />
            <FinanceiroFilters
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              selectedStatus={selectedStatus}
              setSelectedStatus={setSelectedStatus}
              onClearFilters={handleClearFilters}
            />
            <div className="text-sm text-muted-foreground">
              {filteredRecibos.length} {filteredRecibos.length === 1 ? 'recibo' : 'recibos'}{' '}
              encontrado{filteredRecibos.length !== 1 && 's'}
            </div>
            <RecibosTable recibos={filteredRecibos} onReciboUpdated={loadData} />
          </TabsContent>
        )}

        {canPlataformas && (
          <>
            <TabsContent value="bolt" className="mt-4">
              <BoltDataTab />
            </TabsContent>

            <TabsContent value="uber" className="mt-4">
              <UberDataTab />
            </TabsContent>

            <TabsContent value="bp" className="mt-0">
              <BPDataTab />
            </TabsContent>

            <TabsContent value="repsol" className="mt-0">
              <RepsolDataTab />
            </TabsContent>

            <TabsContent value="edp" className="mt-0">
              <EdpDataTab />
            </TabsContent>

            <TabsContent value="viaverde" className="mt-0">
              <ViaVerdeDataTab />
            </TabsContent>
          </>
        )}

        {canResumos && (
          <TabsContent value="resumos" className="mt-4">
            <ContasResumoTab />
          </TabsContent>
        )}
      </div>
    </Tabs>
  );
}
