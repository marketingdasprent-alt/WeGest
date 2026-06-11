import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, User, ArrowRight, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface StatusHistoryEntry {
  id: string;
  status_anterior: string | null;
  status_novo: string;
  alterado_em: string;
  alterado_por: string | null;
  observacoes: string | null;
  user_email?: string;
}

interface LeadStatusHistoryProps {
  leadId: string;
}

const statusLabels: Record<string, string> = {
  novo: 'Novo',
  contactado: 'Contactado',
  interessado: 'Interessado',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

const statusColors: Record<string, string> = {
  novo: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  contactado: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  interessado: 'bg-green-500/20 text-green-400 border-green-500/50',
  convertido: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  perdido: 'bg-red-500/20 text-red-400 border-red-500/50',
};

export const LeadStatusHistory: React.FC<LeadStatusHistoryProps> = ({ leadId }) => {
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatusHistory();
  }, [leadId]);

  const fetchStatusHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: historyData, error: historyError } = await supabase
        .from('lead_status_history')
        .select('*')
        .eq('lead_id', leadId)
        .order('alterado_em', { ascending: false })
        .limit(10);

      if (historyError) {
        console.error('Erro ao buscar histórico:', historyError);
        setError(`Erro ao carregar histórico: ${historyError.message}`);
        return;
      }

      if (!historyData || historyData.length === 0) {
        setHistory([]);
        return;
      }

      // Buscar informações dos usuários que alteraram
      const userIds = historyData.map((entry: any) => entry.alterado_por).filter(Boolean);
      const uniqueUserIds = [...new Set(userIds)];

      let userProfiles: Record<string, string> = {};

      if (uniqueUserIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, email, nome')
          .in('id', uniqueUserIds);

        if (!profilesError && profilesData) {
          userProfiles = profilesData.reduce(
            (acc: any, profile: any) => {
              acc[profile.id] = profile.nome || profile.email || 'Usuário';
              return acc;
            },
            {} as Record<string, string>
          );
        }
      }

      // Combinar dados do histórico com informações dos usuários
      const transformedData = historyData.map((entry: any) => ({
        ...entry,
        user_email: entry.alterado_por ? userProfiles[entry.alterado_por] || 'Sistema' : 'Sistema',
      }));

      setHistory(transformedData);
    } catch (error) {
      console.error('Erro ao carregar histórico de status:', error);
      setError('Erro inesperado ao carregar histórico');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchStatusHistory();
  };

  if (loading) {
    return (
      <Card className="bg-card/50 border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-500"></div>
            <span className="ml-2 text-muted-foreground">Carregando histórico...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Clock className="h-5 w-5 text-red-500" />
            Histórico de Status
            <button
              onClick={handleRefresh}
              className="ml-auto p-1 hover:bg-muted rounded"
              title="Recarregar histórico"
            >
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded border border-red-500/30">
            {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (history.length === 0) {
    return (
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-500" />
            Histórico de Status
            <button
              onClick={handleRefresh}
              className="ml-auto p-1 hover:bg-muted rounded"
              title="Recarregar histórico"
            >
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="text-center py-8">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">Nenhum histórico encontrado ainda.</p>
            <p className="text-muted-foreground/80 text-xs mt-1">
              O histórico será criado automaticamente quando o status do lead for alterado.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <Clock className="h-5 w-5 text-yellow-500" />
          Histórico de Status
          <Badge variant="outline" className="text-xs text-muted-foreground border-border">
            {history.length} entradas
          </Badge>
          <button
            onClick={handleRefresh}
            className="ml-auto p-1 hover:bg-muted rounded"
            title="Recarregar histórico"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {history.map((entry, index) => (
            <div
              key={entry.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-card/50 border border-border/50 hover:bg-muted/70 transition-colors"
            >
              <div className="flex-shrink-0 mt-1">
                <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {entry.status_anterior ? (
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-xs ${statusColors[entry.status_anterior] || 'bg-gray-500/20 text-gray-400'}`}
                      >
                        {statusLabels[entry.status_anterior] || entry.status_anterior}
                      </Badge>
                      <ArrowRight className="h-3 w-3 text-gray-500 flex-shrink-0" />
                      <Badge
                        variant="outline"
                        className={`text-xs ${statusColors[entry.status_novo] || 'bg-gray-500/20 text-gray-400'}`}
                      >
                        {statusLabels[entry.status_novo] || entry.status_novo}
                      </Badge>
                    </div>
                  ) : (
                    <Badge
                      variant="outline"
                      className={`text-xs ${statusColors[entry.status_novo] || 'bg-gray-500/20 text-gray-400'}`}
                    >
                      {statusLabels[entry.status_novo] || entry.status_novo} (Inicial)
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate max-w-24">{entry.user_email}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 flex-shrink-0" />
                    <span className="whitespace-nowrap">
                      {format(new Date(entry.alterado_em), 'dd/MM/yyyy HH:mm', { locale: pt })}
                    </span>
                  </div>
                </div>

                {entry.observacoes && (
                  <p className="text-xs text-foreground mt-2 italic bg-card/50 p-2 rounded border-l-2 border-yellow-500/30">
                    "{entry.observacoes}"
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
