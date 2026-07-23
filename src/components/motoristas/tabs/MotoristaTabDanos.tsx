import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Car, ImageIcon, Eye, ExternalLink, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { DanoFotosGallery } from '@/components/viaturas/DanoFotosGallery';
import { DanoCategoriaBadge } from '@/components/viaturas/DanoCategoriaBadge';
import type { Motorista } from '@/pages/Motoristas';

interface Dano {
  id: string;
  descricao: string;
  localizacao: string | null;
  data_ocorrencia: string | null;
  data_registo: string;
  estado: string;
  valor: number;
  observacoes: string | null;
  viatura_id: string;
  contrato_id: string | null;
  categoria: { id: string; nome: string; cor: string | null } | null;
  viatura: {
    matricula: string;
    marca: string;
    modelo: string;
  } | null;
  fotos: Array<{
    id: string;
    ficheiro_url: string;
    nome_ficheiro: string | null;
    descricao: string | null;
  }>;
}

interface MotoristaTabDanosProps {
  motorista: Motorista;
}

const ESTADOS = [
  { value: 'todos', label: 'Todos os Estados' },
  {
    value: 'pendente',
    label: 'Pendente',
    color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  },
  {
    value: 'em_reparacao',
    label: 'Em Reparação',
    color: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  },
  {
    value: 'reparado',
    label: 'Reparado',
    color: 'bg-green-500/10 text-green-600 border-green-500/20',
  },
  {
    value: 'irreparavel',
    label: 'Irreparável',
    color: 'bg-destructive/10 text-destructive border-destructive/20',
  },
];

const LOCALIZACOES: Record<string, string> = {
  frente: 'Frente',
  traseira: 'Traseira',
  lateral_esq: 'Lateral Esquerda',
  lateral_dir: 'Lateral Direita',
  teto: 'Teto',
  interior: 'Interior',
  motor: 'Motor',
  outro: 'Outro',
};

export function MotoristaTabDanos({ motorista }: MotoristaTabDanosProps) {
  const [danos, setDanos] = useState<Dano[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [selectedDano, setSelectedDano] = useState<Dano | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    loadDanos();
  }, [motorista.id]);

  async function loadDanos() {
    try {
      setLoading(true);

      const { data: danosData, error } = await supabase
        .from('viatura_danos')
        .select(
          `
          id,
          descricao,
          localizacao,
          data_ocorrencia,
          data_registo,
          estado,
          valor,
          observacoes,
          viatura_id,
          contrato_id,
          viaturas (
            matricula,
            marca,
            modelo
          ),
          categoria:assistencia_categorias (
            id,
            nome,
            cor
          )
        `
        )
        .eq('motorista_id', motorista.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Buscar fotos para cada dano
      const danosComFotos: Dano[] = [];
      for (const dano of danosData || []) {
        const { data: fotos } = await supabase
          .from('viatura_dano_fotos')
          .select('id, ficheiro_url, nome_ficheiro, descricao')
          .eq('dano_id', dano.id);

        danosComFotos.push({
          id: dano.id,
          descricao: dano.descricao,
          localizacao: dano.localizacao,
          data_ocorrencia: dano.data_ocorrencia,
          data_registo: dano.data_registo,
          estado: dano.estado,
          valor: dano.valor || 0,
          observacoes: dano.observacoes,
          viatura_id: dano.viatura_id,
          contrato_id: dano.contrato_id,
          categoria: dano.categoria as Dano['categoria'],
          viatura: dano.viaturas as Dano['viatura'],
          fotos: fotos || [],
        });
      }

      setDanos(danosComFotos);
    } catch (error) {
      console.error('Erro ao carregar danos:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(value: number) {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  }

  function getEstadoConfig(estado: string) {
    return ESTADOS.find((e) => e.value === estado) || ESTADOS[1];
  }

  const danosFiltrados =
    filtroEstado === 'todos' ? danos : danos.filter((d) => d.estado === filtroEstado);

  const totalDanos = danos.reduce((sum, d) => sum + (d.valor || 0), 0);
  const totalPendente = danos
    .filter((d) => d.estado === 'pendente')
    .reduce((sum, d) => sum + (d.valor || 0), 0);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-24 bg-muted rounded" />
            <div className="h-24 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Total de Danos</p>
              <p className="text-2xl font-bold">{danos.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Valor Total</p>
              <p className="text-2xl font-bold text-destructive">{formatCurrency(totalDanos)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Pendente</p>
              <p className="text-2xl font-bold text-yellow-600">{formatCurrency(totalPendente)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTADOS.map((estado) => (
                <SelectItem key={estado.value} value={estado.value}>
                  {estado.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {danosFiltrados.length} resultado(s)
          </span>
        </div>

        {/* Lista de danos */}
        {danosFiltrados.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Nenhum dano encontrado.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {danosFiltrados.map((dano) => {
              const estadoConfig = getEstadoConfig(dano.estado);
              const dataDisplay = dano.data_ocorrencia || dano.data_registo;

              return (
                <Card key={dano.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="pt-4">
                    <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                      {/* Info principal */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{dano.descricao}</p>
                            <DanoCategoriaBadge categoria={dano.categoria} />
                            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                              {dano.viatura && (
                                <>
                                  <Car className="h-3 w-3" />
                                  <span>{dano.viatura.matricula}</span>
                                  <span>-</span>
                                  <span>
                                    {dano.viatura.marca} {dano.viatura.modelo}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <Badge variant="outline" className={estadoConfig.color || ''}>
                            {estadoConfig.label}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Data: </span>
                            <span>
                              {format(new Date(dataDisplay), 'd/MM/yyyy', { locale: pt })}
                            </span>
                          </div>
                          {dano.localizacao && (
                            <div>
                              <span className="text-muted-foreground">Local: </span>
                              <span>{LOCALIZACOES[dano.localizacao] || dano.localizacao}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-muted-foreground">Valor: </span>
                            <span className="font-semibold text-destructive">
                              {formatCurrency(dano.valor)}
                            </span>
                          </div>
                        </div>

                        {dano.observacoes && (
                          <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
                            {dano.observacoes}
                          </p>
                        )}
                      </div>

                      {/* Fotos */}
                      <div className="lg:w-64">
                        <DanoFotosGallery
                          danoId={dano.id}
                          fotos={dano.fotos}
                          onFotosChange={loadDanos}
                          readonly
                        />
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex justify-end mt-4 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/viaturas/${dano.viatura_id}`, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Ver Viatura
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
