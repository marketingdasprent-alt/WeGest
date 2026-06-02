import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  BarChart3,
  Ticket,
  Users,
  Car,
  FileText,
  Wrench,
  Settings,
  Wallet,
  Megaphone,
  CalendarDays,
  LayoutDashboard,
  KeyRound,
  Eye,
  Pencil,
  Ban,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

export type NivelAcesso = 'nenhum' | 'ver' | 'editar';

export interface Permission {
  recurso_id: string;
  tem_acesso: boolean;
  pode_editar: boolean;
}

interface Recurso {
  id: string;
  nome: string;
  categoria: string;
  descricao: string | null;
}

interface PermissionsSelectorProps {
  cargoId?: string;
  onChange: (permissions: Permission[]) => void;
}

// ── Módulos com ícones e ordem fixa ──────────────────────────────────────────

const MODULOS = [
  { key: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'Renting', label: 'Renting', icon: KeyRound },
  { key: 'CRM', label: 'CRM', icon: BarChart3 },
  { key: 'Tickets', label: 'Meus Tickets', icon: Ticket },
  { key: 'Motoristas', label: 'Motoristas', icon: Users },
  { key: 'Viaturas', label: 'Viaturas', icon: Car },
  { key: 'Contratos', label: 'Contratos', icon: FileText },
  { key: 'Financeiro', label: 'Financeiro', icon: Wallet },
  { key: 'Marketing', label: 'Marketing', icon: Megaphone },
  { key: 'Calendário', label: 'Calendário', icon: CalendarDays },
  { key: 'Assistência', label: 'Assistência', icon: Wrench },
  { key: 'Administração', label: 'Administração', icon: Settings },
];

// Labels amigáveis para os recursos
const RECURSO_LABELS: Record<string, string> = {
  // Dashboard
  dashboard_ver: 'Aceder ao Dashboard',
  // Renting
  renting_clientes: 'Gestão de clientes de renting',
  renting_contratos: 'Gestão de contratos de renting',
  renting_reservas: 'Gestão de reservas de renting',
  renting_movimentacoes: 'Entradas, saídas e trocas de viatura',
  // CRM
  crm_ver: 'Ver leads e pipeline',
  crm_exportar: 'Exportar dados de leads',
  crm_campanhas: 'Gerir campanhas e tags',
  motoristas_crm: 'Gestão completa do CRM',
  // Tickets
  tickets_ver: 'Ver tickets',
  tickets_criar: 'Criar novos tickets',
  tickets_gerir: 'Gerir todos os tickets',
  // Motoristas
  motoristas_ver: 'Ver lista de motoristas',
  motoristas_criar: 'Criar novos motoristas',
  motoristas_editar: 'Editar dados de motoristas',
  motoristas_eliminar: 'Eliminar motoristas',
  motoristas_candidaturas: 'Gerir candidaturas',
  motoristas_gestao: 'Gestão completa de motoristas',
  motoristas_contactos: 'Gestão de contactos',
  motorista_painel: 'Painel exclusivo do motorista',
  // Viaturas
  viaturas_ver: 'Ver lista de viaturas',
  viaturas_criar: 'Criar novas viaturas',
  viaturas_editar: 'Editar dados de viaturas',
  viaturas_eliminar: 'Eliminar viaturas',
  viaturas_financeiro: 'Ver dados financeiros das viaturas',
  viaturas_marcas_modelos: 'Criar/editar marcas, modelos e versões',
  // Contratos
  contratos_ver: 'Ver contratos',
  contratos_criar: 'Criar novos contratos',
  contratos_reimprimir: 'Reimprimir contratos',
  motoristas_contratos: 'Gestão completa de contratos',
  motoristas_editar_data_contrato: 'Editar data do 1.º contrato',
  // Financeiro
  financeiro_recibos: 'Gestão de recibos verdes',
  recibos_verdes_adicionar: 'Adicionar recibos verdes manualmente',
  // Marketing
  marketing_ver: 'Aceder ao módulo de Marketing',
  // Calendário
  calendario_ver: 'Ver eventos do calendário',
  calendario_ver_gestores: 'Ver gestores nos relatórios de eventos',
  calendario_criar: 'Criar novos eventos',
  calendario_editar: 'Editar eventos existentes',
  calendario_gerir_todos: 'Gerir eventos de todos os gestores',
  calendario_eliminar: 'Eliminar eventos',
  calendario_recolhas: 'Aceder ao painel de recolhas pendentes',
  // Assistência
  assistencia_ver: 'Ver tickets de assistência',
  assistencia_criar: 'Criar tickets de assistência',
  assistencia_categorias: 'Gerir categorias de assistência',
  assistencia_tickets: 'Gestão completa de assistência',
  // Administração
  admin_utilizadores: 'Gerir utilizadores e contas',
  admin_grupos: 'Gerir grupos e permissões',
  admin_documentos: 'Gerir templates de documentos',
  admin_formularios: 'Gerir formulários',
  admin_integracoes: 'Gerir integrações externas',
  admin_configuracoes: 'Configurações do sistema',
  admin_fiscal: 'Definições fiscais (IVA)',
};

function getLabel(nome: string): string {
  return RECURSO_LABELS[nome] || nome;
}

// ── Level Toggle ─────────────────────────────────────────────────────────────

interface LevelToggleProps {
  value: NivelAcesso;
  onChange: (v: NivelAcesso) => void;
}

const LevelToggle: React.FC<LevelToggleProps> = ({ value, onChange }) => {
  const levels: { key: NivelAcesso; label: string; icon: React.ReactNode }[] = [
    { key: 'nenhum', label: 'Nenhum', icon: <Ban className="h-3 w-3" /> },
    { key: 'ver', label: 'Ver', icon: <Eye className="h-3 w-3" /> },
    { key: 'editar', label: 'Editar', icon: <Pencil className="h-3 w-3" /> },
  ];

  return (
    <div className="flex rounded-md border border-border overflow-hidden shrink-0">
      {levels.map(({ key, label, icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors',
            'border-r border-border last:border-r-0',
            value === key
              ? key === 'nenhum'
                ? 'bg-muted text-muted-foreground'
                : key === 'ver'
                  ? 'bg-blue-500 text-white'
                  : 'bg-green-500 text-white'
              : 'bg-background text-muted-foreground hover:bg-muted'
          )}
        >
          {icon}
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNivel(p: Permission | undefined): NivelAcesso {
  if (!p || !p.tem_acesso) return 'nenhum';
  if (p.pode_editar) return 'editar';
  return 'ver';
}

function toPermission(recurso_id: string, nivel: NivelAcesso): Permission {
  return {
    recurso_id,
    tem_acesso: nivel !== 'nenhum',
    pode_editar: nivel === 'editar',
  };
}

// ── Main Component ────────────────────────────────────────────────────────────

export const PermissionsSelector: React.FC<PermissionsSelectorProps> = ({ cargoId, onChange }) => {
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchRecursos();
  }, []);

  useEffect(() => {
    if (cargoId) fetchPermissions(cargoId);
    else setPermissions([]);
  }, [cargoId]);

  const fetchRecursos = async () => {
    try {
      const { data, error } = await supabase
        .from('recursos')
        .select('*')
        .order('categoria')
        .order('nome');
      if (error) throw error;
      setRecursos(data || []);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar recursos',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissions = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('cargo_permissoes')
        .select('*')
        .eq('cargo_id', id);
      if (error) throw error;

      const mapped: Permission[] = (data || []).map((p: any) => ({
        recurso_id: p.recurso_id,
        // Tenta tem_acesso primeiro, depois pode_ver (retrocompatibilidade)
        tem_acesso: p.tem_acesso ?? p.pode_ver ?? false,
        pode_editar: p.pode_editar ?? false,
      }));
      setPermissions(mapped);
      onChange(mapped);
    } catch (error) {
      console.error('Error fetching permissions:', error);
    }
  };

  // ── State helpers ────────────────────────────────────────────────────────

  const getPermission = (recursoId: string): Permission | undefined =>
    permissions.find((p) => p.recurso_id === recursoId);

  const updatePermission = (recursoId: string, nivel: NivelAcesso) => {
    const updated = [
      ...permissions.filter((p) => p.recurso_id !== recursoId),
      toPermission(recursoId, nivel),
    ];
    setPermissions(updated);
    onChange(updated);
  };

  const getRecursosForModulo = (moduloKey: string): Recurso[] =>
    recursos.filter((r) => r.categoria === moduloKey);

  // Stats por módulo
  const getModuloStats = (moduloKey: string) => {
    const moduloRecursos = getRecursosForModulo(moduloKey);
    let editar = 0,
      ver = 0;
    moduloRecursos.forEach((r) => {
      const nivel = toNivel(getPermission(r.id));
      if (nivel === 'editar') editar++;
      else if (nivel === 'ver') ver++;
    });
    return { editar, ver, total: moduloRecursos.length };
  };

  const setAllModuloLevel = (moduloKey: string, nivel: NivelAcesso) => {
    const moduloRecursos = getRecursosForModulo(moduloKey);
    let updated = [...permissions];
    moduloRecursos.forEach((r) => {
      updated = updated.filter((p) => p.recurso_id !== r.id);
      updated.push(toPermission(r.id, nivel));
    });
    setPermissions(updated);
    onChange(updated);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const modulosComRecursos = MODULOS.filter((m) => getRecursosForModulo(m.key).length > 0);

  return (
    <div className="space-y-1">
      {/* Legenda */}
      <div className="flex items-center gap-4 px-1 pb-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-muted border border-border" />
          Sem acesso
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
          Apenas ver
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
          Ver e editar
        </div>
      </div>

      <Accordion type="multiple" className="w-full" defaultValue={['Motoristas', 'Viaturas']}>
        {modulosComRecursos.map((modulo) => {
          const Icon = modulo.icon;
          const stats = getModuloStats(modulo.key);
          const moduloRecursos = getRecursosForModulo(modulo.key);
          const activeCount = stats.editar + stats.ver;

          return (
            <AccordionItem
              key={modulo.key}
              value={modulo.key}
              className="border border-border rounded-lg mb-2 overflow-hidden bg-card"
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50 [&[data-state=open]]:bg-muted/30">
                <div className="flex items-center justify-between w-full pr-2 gap-3">
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-semibold text-foreground">{modulo.label}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-auto mr-2">
                    {stats.editar > 0 && (
                      <Badge className="bg-green-500 text-white text-xs px-1.5 py-0">
                        {stats.editar} editar
                      </Badge>
                    )}
                    {stats.ver > 0 && (
                      <Badge className="bg-blue-500 text-white text-xs px-1.5 py-0">
                        {stats.ver} ver
                      </Badge>
                    )}
                    {activeCount === 0 && (
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        sem acesso
                      </Badge>
                    )}
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-4 pb-4">
                <div className="space-y-3 pt-2">
                  {/* Ações rápidas por módulo */}
                  <div className="flex items-center justify-between py-2 px-3 bg-muted/40 rounded-md border border-border">
                    <span className="text-xs font-medium text-muted-foreground">Acesso rápido</span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setAllModuloLevel(modulo.key, 'nenhum')}
                      >
                        <Ban className="h-3 w-3 mr-1" />
                        Nenhum
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={() => setAllModuloLevel(modulo.key, 'ver')}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Todos ver
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={() => setAllModuloLevel(modulo.key, 'editar')}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Todos editar
                      </Button>
                    </div>
                  </div>

                  {/* Lista de recursos */}
                  <div className="space-y-1">
                    {moduloRecursos.map((recurso) => {
                      const nivel = toNivel(getPermission(recurso.id));
                      return (
                        <div
                          key={recurso.id}
                          className={cn(
                            'flex items-center justify-between py-2 px-3 rounded-md transition-colors',
                            nivel !== 'nenhum' ? 'bg-muted/20' : 'hover:bg-muted/20'
                          )}
                        >
                          <div className="flex flex-col min-w-0 mr-3">
                            <span
                              className={cn(
                                'text-sm font-medium leading-tight',
                                nivel === 'nenhum' ? 'text-muted-foreground' : 'text-foreground'
                              )}
                            >
                              {getLabel(recurso.nome)}
                            </span>
                            {recurso.descricao && (
                              <span className="text-xs text-muted-foreground/70 mt-0.5 truncate">
                                {recurso.descricao}
                              </span>
                            )}
                          </div>
                          <LevelToggle
                            value={nivel}
                            onChange={(v) => updatePermission(recurso.id, v)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
};
