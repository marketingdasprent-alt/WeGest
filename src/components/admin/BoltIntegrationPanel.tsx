import React, { useState, useEffect, useMemo } from 'react';
import { SINCRONIZACAO_ATIVA } from '@/config/sync';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { BoltSyncStatusBadge } from '@/lib/statusBadges';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import { useTenant } from '@/contexts/TenantContext';
import {
  Loader2,
  Zap,
  RefreshCw,
  CheckCircle,
  XCircle,
  Settings,
  Users,
  Car,
  History,
  AlertCircle,
  Eye,
  EyeOff,
  Database,
  Download,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { pt } from 'date-fns/locale';

interface BoltConfig {
  id: string;
  client_id: string;
  client_secret: string;
  company_id: number;
  company_name: string | null;
  ativo: boolean;
  ultimo_sync: string | null;
  sync_automatico: boolean;
  intervalo_sync_horas: number;
}

interface BoltMapeamento {
  id: string;
  driver_uuid: string;
  driver_name: string | null;
  driver_phone: string | null;
  motorista_id: string | null;
  auto_mapped: boolean;
  motorista?: {
    nome: string;
  };
}

interface BoltSyncLog {
  id: string;
  tipo: string;
  status: string;
  mensagem: string | null;
  viagens_novas: number;
  viagens_atualizadas: number;
  erros: number;
  created_at: string;
}

interface Motorista {
  id: string;
  nome: string;
}

export const BoltIntegrationPanel: React.FC = () => {
  const { toast } = useToast();
  const { orgId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [config, setConfig] = useState<BoltConfig | null>(null);
  const [formData, setFormData] = useState({
    client_id: '',
    client_secret: '',
    company_id: '',
    ativo: false,
    sync_automatico: false,
    intervalo_sync_horas: 6,
  });

  const [mapeamentos, setMapeamentos] = useState<BoltMapeamento[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [logs, setLogs] = useState<BoltSyncLog[]>([]);

  // Ordenação — Mapeamento
  const [sortFieldMap, setSortFieldMap] = useState<string>('driver_name');
  const [sortDirMap, setSortDirMap] = useState<'asc' | 'desc'>('asc');
  const handleSortMap = (f: string) =>
    toggleSort(f, { sortField: sortFieldMap, sortDir: sortDirMap }, setSortFieldMap, setSortDirMap);

  // Ordenação — Histórico
  const [sortFieldLogs, setSortFieldLogs] = useState<string>('created_at');
  const [sortDirLogs, setSortDirLogs] = useState<'asc' | 'desc'>('desc');
  const handleSortLogs = (f: string) =>
    toggleSort(
      f,
      { sortField: sortFieldLogs, sortDir: sortDirLogs },
      setSortFieldLogs,
      setSortDirLogs
    );

  const [syncDates, setSyncDates] = useState({
    start: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });

  // Estados para Dados Bolt
  const [boltDrivers, setBoltDrivers] = useState<any[]>([]);
  const [boltVehicles, setBoltVehicles] = useState<any[]>([]);
  const [loadingBoltData, setLoadingBoltData] = useState(false);
  const [fetchingDrivers, setFetchingDrivers] = useState(false);
  const [fetchingVehicles, setFetchingVehicles] = useState(false);

  // Ordenação — Motoristas Bolt
  const [sortFieldDrivers, setSortFieldDrivers] = useState<string>('name');
  const [sortDirDrivers, setSortDirDrivers] = useState<'asc' | 'desc'>('asc');
  const handleSortDrivers = (f: string) =>
    toggleSort(
      f,
      { sortField: sortFieldDrivers, sortDir: sortDirDrivers },
      setSortFieldDrivers,
      setSortDirDrivers
    );

  // Ordenação — Viaturas Bolt
  const [sortFieldVehicles, setSortFieldVehicles] = useState<string>('license_plate');
  const [sortDirVehicles, setSortDirVehicles] = useState<'asc' | 'desc'>('asc');
  const handleSortVehicles = (f: string) =>
    toggleSort(
      f,
      { sortField: sortFieldVehicles, sortDir: sortDirVehicles },
      setSortFieldVehicles,
      setSortDirVehicles
    );

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Buscar configuração, mapeamentos, motoristas e logs em paralelo
      const [configRes, mapeamentosRes, motoristasRes, logsRes] = await Promise.all([
        supabase.from('plataformas_configuracao').select('*').limit(1).single(),
        supabase
          .from('bolt_mapeamento_motoristas')
          .select('*, motorista:motoristas_ativos(nome)')
          .order('driver_name'),
        supabase
          .from('motoristas_ativos')
          .select('id, nome')
          .eq('status_ativo', true)
          .order('nome'),
        supabase
          .from('bolt_sync_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (configRes.data) {
        setConfig(configRes.data as BoltConfig);
        setFormData({
          client_id: configRes.data.client_id || '',
          client_secret: configRes.data.client_secret || '',
          company_id: configRes.data.company_id?.toString() || '',
          ativo: configRes.data.ativo || false,
          sync_automatico: configRes.data.sync_automatico || false,
          intervalo_sync_horas: configRes.data.intervalo_sync_horas || 6,
        });
      }

      setMapeamentos((mapeamentosRes.data || []) as BoltMapeamento[]);
      setMotoristas((motoristasRes.data || []) as Motorista[]);
      setLogs((logsRes.data || []) as BoltSyncLog[]);
    } catch (error: any) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!formData.client_id || !formData.client_secret) {
      toast({
        title: 'Erro',
        description: 'Preencha o Client ID e Client Secret',
        variant: 'destructive',
      });
      return;
    }

    try {
      setTesting(true);

      const { data, error } = await supabase.functions.invoke('bolt-test-connection', {
        body: {
          client_id: formData.client_id,
          client_secret: formData.client_secret,
          company_id: formData.company_id,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: 'Conexão bem sucedida',
          description: data.company?.company_name
            ? `Ligado a: ${data.company.company_name}`
            : 'Credenciais válidas',
        });

        // Actualizar nome da empresa se disponível
        if (data.company?.company_name) {
          setFormData((prev) => ({ ...prev, company_name: data.company.company_name }));
        }
      } else {
        toast({
          title: 'Falha na conexão',
          description: data.error || 'Verifique as credenciais',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível testar a conexão',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!formData.client_id || !formData.client_secret || !formData.company_id) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos obrigatórios',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);

      const configData = {
        client_id: formData.client_id,
        client_secret: formData.client_secret,
        company_id: parseInt(formData.company_id),
        ativo: formData.ativo,
        sync_automatico: formData.sync_automatico,
        intervalo_sync_horas: formData.intervalo_sync_horas,
        org_id: orgId,
      };

      let error;
      if (config) {
        const result = await supabase
          .from('plataformas_configuracao')
          .update(configData)
          .eq('id', config.id);
        error = result.error;
      } else {
        const result = await supabase.from('plataformas_configuracao').insert(configData);
        error = result.error;
      }

      if (error) throw error;

      // Sync scheduling is handled by the central sync-orchestrator cron job
      // No individual cron jobs needed — just save sync_automatico flag

      toast({
        title: 'Sucesso',
        description: 'Configuração guardada com sucesso',
      });

      fetchData();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível guardar a configuração',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (!config?.ativo) {
      toast({
        title: 'Erro',
        description: 'A integração não está activa',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSyncing(true);

      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase.functions.invoke('bolt-sync', {
        body: {
          start_date: syncDates.start,
          end_date: syncDates.end,
          user_id: userData.user?.id,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: 'Sincronização concluída',
          description: data.message,
        });
        fetchData();
      } else {
        toast({
          title: 'Erro na sincronização',
          description: data.error,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível sincronizar',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleMapDriver = async (mapeamentoId: string, motoristaId: string | null) => {
    try {
      const { error } = await supabase
        .from('bolt_mapeamento_motoristas')
        .update({
          motorista_id: motoristaId,
          auto_mapped: false,
        })
        .eq('id', mapeamentoId);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Mapeamento actualizado',
      });

      fetchData();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const fetchBoltDrivers = async () => {
    if (!config?.ativo) {
      toast({
        title: 'Erro',
        description: 'A integração não está activa',
        variant: 'destructive',
      });
      return;
    }

    try {
      setFetchingDrivers(true);

      const { data, error } = await supabase.functions.invoke('bolt-api', {
        body: { operation: 'getDrivers' },
      });

      if (error) throw error;

      if (data.success) {
        const drivers = data.drivers || [];
        setBoltDrivers(drivers);

        // Guardar na base de dados (upsert)
        if (drivers.length > 0) {
          const driversToUpsert = drivers.map((driver: any) => ({
            driver_uuid: driver.driver_uuid || driver.uuid || driver.id,
            name: driver.name || driver.driver_name || null,
            email: driver.email || null,
            phone: driver.phone || driver.driver_phone || null,
            status: driver.status || null,
            registration_date: driver.registration_date || driver.created_at || null,
            dados_raw: driver,
            updated_at: new Date().toISOString(),
          }));

          const { error: upsertError } = await supabase
            .from('bolt_drivers')
            .upsert(driversToUpsert, { onConflict: 'driver_uuid' });

          if (upsertError) {
            console.error('Erro ao guardar motoristas:', upsertError);
          } else if (config?.id) {
            // Auto-mapear motoristas automaticamente após guardar
            try {
              const { data: autoMapData } = await supabase.functions.invoke(
                'bolt-auto-map-drivers',
                { body: { integracao_id: config.id } }
              );

              if (autoMapData?.created > 0) {
                toast({
                  title: 'Novos motoristas criados',
                  description: `${autoMapData.created} motoristas criados automaticamente via email`,
                });
              }
            } catch (autoMapError) {
              console.error('Erro no auto-mapeamento:', autoMapError);
              // Não falhar por erro no auto-map
            }
          }
        }

        toast({
          title: 'Sucesso',
          description: `${data.total || 0} motoristas encontrados e guardados`,
        });
      } else {
        toast({
          title: 'Erro',
          description: data.error || 'Erro ao buscar motoristas',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível buscar motoristas',
        variant: 'destructive',
      });
    } finally {
      setFetchingDrivers(false);
    }
  };

  const fetchBoltVehicles = async () => {
    if (!config?.ativo) {
      toast({
        title: 'Erro',
        description: 'A integração não está activa',
        variant: 'destructive',
      });
      return;
    }

    try {
      setFetchingVehicles(true);

      const { data, error } = await supabase.functions.invoke('bolt-api', {
        body: { operation: 'getVehicles' },
      });

      if (error) throw error;

      if (data.success) {
        const vehicles = data.vehicles || [];
        setBoltVehicles(vehicles);

        // Guardar na base de dados (upsert)
        if (vehicles.length > 0) {
          const vehiclesToUpsert = vehicles.map((vehicle: any) => ({
            vehicle_uuid: vehicle.vehicle_uuid || vehicle.uuid || vehicle.id,
            license_plate: vehicle.license_plate || vehicle.plate || null,
            brand: vehicle.brand || vehicle.make || null,
            model: vehicle.model || null,
            year: vehicle.year || null,
            color: vehicle.color || null,
            status: vehicle.status || null,
            dados_raw: vehicle,
            updated_at: new Date().toISOString(),
          }));

          const { error: upsertError } = await supabase
            .from('bolt_vehicles')
            .upsert(vehiclesToUpsert, { onConflict: 'vehicle_uuid' });

          if (upsertError) {
            console.error('Erro ao guardar viaturas:', upsertError);
          }
        }

        toast({
          title: 'Sucesso',
          description: `${data.total || 0} viaturas encontradas e guardadas`,
        });
      } else {
        toast({
          title: 'Erro',
          description: data.error || 'Erro ao buscar viaturas',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível buscar viaturas',
        variant: 'destructive',
      });
    } finally {
      setFetchingVehicles(false);
    }
  };

  const sortedBoltDrivers = useMemo(() => {
    const list = [...boltDrivers];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortFieldDrivers === 'name') {
        va = a.name || a.first_name || '';
        vb = b.name || b.first_name || '';
      } else if (sortFieldDrivers === 'phone') {
        va = a.phone || '';
        vb = b.phone || '';
      } else if (sortFieldDrivers === 'email') {
        va = a.email || '';
        vb = b.email || '';
      } else if (sortFieldDrivers === 'status') {
        va = a.status || '';
        vb = b.status || '';
      }
      if (va < vb) return sortDirDrivers === 'asc' ? -1 : 1;
      if (va > vb) return sortDirDrivers === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [boltDrivers, sortFieldDrivers, sortDirDrivers]);

  const sortedBoltVehicles = useMemo(() => {
    const list = [...boltVehicles];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortFieldVehicles === 'license_plate') {
        va = a.license_plate || a.reg_number || '';
        vb = b.license_plate || b.reg_number || '';
      } else if (sortFieldVehicles === 'model') {
        va = a.model || '';
        vb = b.model || '';
      } else if (sortFieldVehicles === 'brand') {
        va = a.brand || a.make || '';
        vb = b.brand || b.make || '';
      } else if (sortFieldVehicles === 'color') {
        va = a.color || '';
        vb = b.color || '';
      } else if (sortFieldVehicles === 'status') {
        va = a.status || '';
        vb = b.status || '';
      }
      if (va < vb) return sortDirVehicles === 'asc' ? -1 : 1;
      if (va > vb) return sortDirVehicles === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [boltVehicles, sortFieldVehicles, sortDirVehicles]);

  const sortedMapeamentos = useMemo(() => {
    const list = [...mapeamentos];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortFieldMap === 'driver_name') {
        va = a.driver_name || '';
        vb = b.driver_name || '';
      } else if (sortFieldMap === 'driver_phone') {
        va = a.driver_phone || '';
        vb = b.driver_phone || '';
      } else if (sortFieldMap === 'mapeamento') {
        va = a.auto_mapped ? 2 : a.motorista_id ? 1 : 0;
        vb = b.auto_mapped ? 2 : b.motorista_id ? 1 : 0;
      }
      if (va < vb) return sortDirMap === 'asc' ? -1 : 1;
      if (va > vb) return sortDirMap === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [mapeamentos, sortFieldMap, sortDirMap]);

  const sortedLogs = useMemo(() => {
    const list = [...logs];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortFieldLogs === 'created_at') {
        va = a.created_at;
        vb = b.created_at;
      } else if (sortFieldLogs === 'tipo') {
        va = a.tipo || '';
        vb = b.tipo || '';
      } else if (sortFieldLogs === 'status') {
        va = a.status || '';
        vb = b.status || '';
      } else if (sortFieldLogs === 'viagens_novas') {
        va = a.viagens_novas || 0;
        vb = b.viagens_novas || 0;
      } else if (sortFieldLogs === 'viagens_atualizadas') {
        va = a.viagens_atualizadas || 0;
        vb = b.viagens_atualizadas || 0;
      } else if (sortFieldLogs === 'erros') {
        va = a.erros || 0;
        vb = b.erros || 0;
      } else if (sortFieldLogs === 'mensagem') {
        va = a.mensagem || '';
        vb = b.mensagem || '';
      }
      if (va < vb) return sortDirLogs === 'asc' ? -1 : 1;
      if (va > vb) return sortDirLogs === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [logs, sortFieldLogs, sortDirLogs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Zap className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Bolt Fleet
                {config?.ativo ? (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Activo
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <XCircle className="h-3 w-3 mr-1" />
                    Inactivo
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Integração com a API Bolt Fleet para importar viagens automaticamente
              </CardDescription>
            </div>
          </div>
          {config?.ultimo_sync && (
            <div className="text-sm text-muted-foreground">
              Última sincronização:{' '}
              {format(new Date(config.ultimo_sync), 'dd/MM/yyyy HH:mm', { locale: pt })}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="config" className="w-full">
          <TabsList className="flex w-full overflow-x-auto mb-6 h-auto">
            <TabsTrigger value="config" className="flex items-center gap-1.5 shrink-0">
              <Settings className="h-4 w-4" />
              <span className="hidden xs:inline">Configuração</span>
            </TabsTrigger>
            <TabsTrigger value="sync" className="flex items-center gap-1.5 shrink-0">
              <RefreshCw className="h-4 w-4" />
              <span className="hidden xs:inline">Sincronizar</span>
            </TabsTrigger>
            <TabsTrigger value="boltdata" className="flex items-center gap-1.5 shrink-0">
              <Database className="h-4 w-4" />
              <span className="hidden xs:inline">Dados Bolt</span>
            </TabsTrigger>
            <TabsTrigger value="mapping" className="flex items-center gap-1.5 shrink-0">
              <Users className="h-4 w-4" />
              <span className="hidden xs:inline">Mapeamento</span>
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-1.5 shrink-0">
              <History className="h-4 w-4" />
              <span className="hidden xs:inline">Histórico</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab Configuração */}
          <TabsContent value="config" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="client_id">
                  Client ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="client_id"
                  value={formData.client_id}
                  onChange={(e) => setFormData((prev) => ({ ...prev, client_id: e.target.value }))}
                  placeholder="Introduza o Client ID da Bolt"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_secret">
                  Client Secret <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="client_secret"
                    type={showSecret ? 'text' : 'password'}
                    value={formData.client_secret}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, client_secret: e.target.value }))
                    }
                    placeholder="Introduza o Client Secret da Bolt"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="company_id">
                  Company ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="company_id"
                  value={formData.company_id}
                  onChange={(e) => setFormData((prev) => ({ ...prev, company_id: e.target.value }))}
                  placeholder="ID da empresa na Bolt"
                />
              </div>
            </div>

            <div className="flex items-center justify-between py-4 border-t border-border/50">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="ativo"
                    checked={formData.ativo}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, ativo: checked }))
                    }
                  />
                  <Label htmlFor="ativo">Integração Activa</Label>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    id="sync_auto"
                    checked={formData.sync_automatico}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, sync_automatico: checked }))
                    }
                  />
                  <Label htmlFor="sync_auto">Sincronização Semanal (Segundas 00:00)</Label>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
                  {testing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Testar Conexão
                </Button>
                <Button onClick={handleSaveConfig} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Guardar
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Tab Sincronizar */}
          <TabsContent value="sync" className="space-y-4">
            {!config?.ativo ? (
              <div className="flex items-center gap-2 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                <span className="text-yellow-500">
                  Active a integração na tab "Configuração" para sincronizar viagens.
                </span>
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="start_date">Data Início</Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={syncDates.start}
                      onChange={(e) => setSyncDates((prev) => ({ ...prev, start: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_date">Data Fim</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={syncDates.end}
                      onChange={(e) => setSyncDates((prev) => ({ ...prev, end: e.target.value }))}
                    />
                  </div>
                  <div className="flex items-end">
                    {SINCRONIZACAO_ATIVA ? (
                      <Button onClick={handleSync} disabled={syncing} className="w-full">
                        {syncing ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Sincronizar Agora
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Sincronização automática desativada. Usa o import manual por CSV em
                        Administrativo › Importar Dados.
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  A sincronização irá importar todas as viagens no período seleccionado. Viagens já
                  existentes serão actualizadas.
                </div>
              </>
            )}
          </TabsContent>

          {/* Tab Dados Bolt */}
          <TabsContent value="boltdata" className="space-y-6">
            {!config?.ativo ? (
              <div className="flex items-center gap-2 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                <span className="text-yellow-500">
                  Active a integração na tab "Configuração" para consultar dados da Bolt.
                </span>
              </div>
            ) : (
              <>
                {/* Motoristas Bolt */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Motoristas da Bolt
                    </h3>
                    <Button onClick={fetchBoltDrivers} disabled={fetchingDrivers}>
                      {fetchingDrivers ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Buscar Motoristas
                    </Button>
                  </div>

                  {boltDrivers.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableTableHead
                            field="name"
                            sortField={sortFieldDrivers}
                            sortDir={sortDirDrivers}
                            onSort={handleSortDrivers}
                          >
                            Nome
                          </SortableTableHead>
                          <SortableTableHead
                            field="phone"
                            sortField={sortFieldDrivers}
                            sortDir={sortDirDrivers}
                            onSort={handleSortDrivers}
                          >
                            Telefone
                          </SortableTableHead>
                          <SortableTableHead
                            field="email"
                            sortField={sortFieldDrivers}
                            sortDir={sortDirDrivers}
                            onSort={handleSortDrivers}
                          >
                            Email
                          </SortableTableHead>
                          <SortableTableHead
                            field="status"
                            sortField={sortFieldDrivers}
                            sortDir={sortDirDrivers}
                            onSort={handleSortDrivers}
                          >
                            Estado
                          </SortableTableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedBoltDrivers.map((driver, index) => (
                          <TableRow key={driver.uuid || index}>
                            <TableCell className="font-medium">
                              {driver.name || driver.first_name || 'Sem nome'}
                            </TableCell>
                            <TableCell>{driver.phone || '-'}</TableCell>
                            <TableCell>{driver.email || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{driver.status || 'desconhecido'}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Clique em "Buscar Motoristas" para consultar a API Bolt</p>
                    </div>
                  )}
                </div>

                {/* Viaturas Bolt */}
                <div className="space-y-4 pt-4 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                      <Car className="h-5 w-5" />
                      Viaturas da Bolt
                    </h3>
                    <Button onClick={fetchBoltVehicles} disabled={fetchingVehicles}>
                      {fetchingVehicles ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Buscar Viaturas
                    </Button>
                  </div>

                  {boltVehicles.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableTableHead
                            field="license_plate"
                            sortField={sortFieldVehicles}
                            sortDir={sortDirVehicles}
                            onSort={handleSortVehicles}
                          >
                            Matrícula
                          </SortableTableHead>
                          <SortableTableHead
                            field="model"
                            sortField={sortFieldVehicles}
                            sortDir={sortDirVehicles}
                            onSort={handleSortVehicles}
                          >
                            Modelo
                          </SortableTableHead>
                          <SortableTableHead
                            field="brand"
                            sortField={sortFieldVehicles}
                            sortDir={sortDirVehicles}
                            onSort={handleSortVehicles}
                          >
                            Marca
                          </SortableTableHead>
                          <SortableTableHead
                            field="color"
                            sortField={sortFieldVehicles}
                            sortDir={sortDirVehicles}
                            onSort={handleSortVehicles}
                          >
                            Cor
                          </SortableTableHead>
                          <SortableTableHead
                            field="status"
                            sortField={sortFieldVehicles}
                            sortDir={sortDirVehicles}
                            onSort={handleSortVehicles}
                          >
                            Estado
                          </SortableTableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedBoltVehicles.map((vehicle, index) => (
                          <TableRow key={vehicle.uuid || index}>
                            <TableCell className="font-medium font-mono">
                              {vehicle.license_plate || vehicle.reg_number || '-'}
                            </TableCell>
                            <TableCell>{vehicle.model || '-'}</TableCell>
                            <TableCell>{vehicle.brand || vehicle.make || '-'}</TableCell>
                            <TableCell>{vehicle.color || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{vehicle.status || 'desconhecido'}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
                      <Car className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Clique em "Buscar Viaturas" para consultar a API Bolt</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          {/* Tab Mapeamento */}
          <TabsContent value="mapping" className="space-y-4">
            {mapeamentos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum motorista da Bolt encontrado.</p>
                <p className="text-sm">Execute uma sincronização para importar os motoristas.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      field="driver_name"
                      sortField={sortFieldMap}
                      sortDir={sortDirMap}
                      onSort={handleSortMap}
                    >
                      Motorista Bolt
                    </SortableTableHead>
                    <SortableTableHead
                      field="driver_phone"
                      sortField={sortFieldMap}
                      sortDir={sortDirMap}
                      onSort={handleSortMap}
                    >
                      Telefone
                    </SortableTableHead>
                    <TableHead>Motorista Sistema</TableHead>
                    <SortableTableHead
                      field="mapeamento"
                      sortField={sortFieldMap}
                      sortDir={sortDirMap}
                      onSort={handleSortMap}
                    >
                      Mapeamento
                    </SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedMapeamentos.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{m.driver_name || 'Sem nome'}</p>
                          <code className="text-xs text-muted-foreground">
                            {m.driver_uuid.slice(0, 8)}...
                          </code>
                        </div>
                      </TableCell>
                      <TableCell>{m.driver_phone || '-'}</TableCell>
                      <TableCell>
                        <Select
                          value={m.motorista_id || 'none'}
                          onValueChange={(v) => handleMapDriver(m.id, v === 'none' ? null : v)}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Seleccionar motorista" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Não mapeado</SelectItem>
                            {motoristas.map((mot) => (
                              <SelectItem key={mot.id} value={mot.id}>
                                {mot.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {m.auto_mapped ? (
                          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                            <Car className="h-3 w-3 mr-1" />
                            Automático
                          </Badge>
                        ) : m.motorista_id ? (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Manual
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Pendente
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* Tab Histórico */}
          <TabsContent value="logs" className="space-y-4">
            {logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum registo de sincronização.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      field="created_at"
                      sortField={sortFieldLogs}
                      sortDir={sortDirLogs}
                      onSort={handleSortLogs}
                    >
                      Data
                    </SortableTableHead>
                    <SortableTableHead
                      field="tipo"
                      sortField={sortFieldLogs}
                      sortDir={sortDirLogs}
                      onSort={handleSortLogs}
                    >
                      Tipo
                    </SortableTableHead>
                    <SortableTableHead
                      field="status"
                      sortField={sortFieldLogs}
                      sortDir={sortDirLogs}
                      onSort={handleSortLogs}
                    >
                      Estado
                    </SortableTableHead>
                    <SortableTableHead
                      field="viagens_novas"
                      sortField={sortFieldLogs}
                      sortDir={sortDirLogs}
                      onSort={handleSortLogs}
                      align="right"
                    >
                      Novas
                    </SortableTableHead>
                    <SortableTableHead
                      field="viagens_atualizadas"
                      sortField={sortFieldLogs}
                      sortDir={sortDirLogs}
                      onSort={handleSortLogs}
                      align="right"
                    >
                      Actualizadas
                    </SortableTableHead>
                    <SortableTableHead
                      field="erros"
                      sortField={sortFieldLogs}
                      sortDir={sortDirLogs}
                      onSort={handleSortLogs}
                      align="right"
                    >
                      Erros
                    </SortableTableHead>
                    <SortableTableHead
                      field="mensagem"
                      sortField={sortFieldLogs}
                      sortDir={sortDirLogs}
                      onSort={handleSortLogs}
                    >
                      Mensagem
                    </SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm', { locale: pt })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.tipo}</Badge>
                      </TableCell>
                      <TableCell>
                        <BoltSyncStatusBadge status={log.status} />
                      </TableCell>
                      <TableCell className="text-green-500 text-right">
                        {log.viagens_novas || 0}
                      </TableCell>
                      <TableCell className="text-blue-500 text-right">
                        {log.viagens_atualizadas || 0}
                      </TableCell>
                      <TableCell className="text-red-500 text-right">{log.erros || 0}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                        {log.mensagem || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
