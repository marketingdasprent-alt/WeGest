import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { CandidaturaFormulario } from '@/components/motorista-portal/CandidaturaFormulario';
import { CandidaturaEmAnalise } from '@/components/motorista-portal/CandidaturaEmAnalise';
import { CandidaturaRejeitada } from '@/components/motorista-portal/CandidaturaRejeitada';
import { MotoristaDashboard } from '@/components/motorista-portal/MotoristaDashboard';
import { MotoristaLayout } from '@/components/motorista-portal/MotoristaLayout';
import { getOrgSessionStorageKey } from '@/contexts/TenantContext';

interface MotoristaData {
  id: string;
  nome: string;
  foto_url?: string;
}

export type CandidaturaStatus = 'rascunho' | 'submetido' | 'em_analise' | 'aprovado' | 'rejeitado';

export interface Candidatura {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  telefone: string | null;
  nif: string | null;
  morada: string | null;
  codigo_postal: string | null;
  cidade: string | null;
  documento_tipo: string | null;
  documento_numero: string | null;
  documento_validade: string | null;
  documento_ficheiro_url: string | null;
  documento_frente_url?: string | null;
  documento_identificacao_verso_url: string | null;
  carta_conducao: string | null;
  carta_categorias: string[] | null;
  carta_validade: string | null;
  carta_ficheiro_url: string | null;
  carta_frente_url?: string | null;
  carta_conducao_verso_url: string | null;
  licenca_tvde_numero: string | null;
  licenca_tvde_validade: string | null;
  licenca_tvde_ficheiro_url: string | null;
  registo_criminal_url: string | null;
  comprovativo_morada_url: string | null;
  iban: string | null;
  comprovativo_iban_url: string | null;
  outros_documentos: any[];
  status: CandidaturaStatus;
  data_submissao: string | null;
  data_decisao: string | null;
  motivo_rejeicao: string | null;
  observacoes?: string | null;
  created_at: string;
  updated_at: string;
}

interface MotoristaAtivo {
  id: string;
  user_id: string;
  status_ativo: boolean;
  nome?: string | null;
  foto_url?: string | null;
}

const PainelMotorista: React.FC = () => {
  const { user } = useAuth();
  const [candidatura, setCandidatura] = useState<Candidatura | null>(null);
  const [motoristaAtivo, setMotoristaAtivo] = useState<MotoristaAtivo | null>(null);
  const [loading, setLoading] = useState(true);

  const userId = user?.id;
  useEffect(() => {
    if (userId) {
      loadUserData();
    }
    // Só recarregar quando o ID do user muda (login/logout).
    // Evitar remount do formulário no native-app-resume ou token refresh,
    // que causaria perda do estado (incluindo URLs de uploads recentes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadUserData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Alinhar a org ativa com a org onde o utilizador é motorista.
      // Sem isto, um utilizador com múltiplas organizações (ex.: staff que
      // também é motorista) pode ter a org ativa noutra org; a RLS RESTRICTIVE
      // de `motoristas_ativos` (org_id = get_current_org_id()) bloqueia então a
      // leitura do próprio registo e o painel cairia no formulário de
      // candidatura em branco. A RPC devolve a org do motorista ignorando a RLS.
      const { data: orgMotorista } = await supabase.rpc('get_minha_org_motorista');
      if (orgMotorista) {
        const { data: orgAtiva } = await supabase
          .from('user_org_ativa')
          .select('org_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (orgAtiva?.org_id !== orgMotorista) {
          const { error: switchError } = await supabase
            .from('user_org_ativa')
            .upsert({ user_id: user.id, org_id: orgMotorista }, { onConflict: 'user_id' });

          if (!switchError) {
            // Fixar a org do motorista só NESTA aba (sessionStorage, não
            // partilhado) — evita que outras abas já abertas na conta (ex.:
            // o dashboard de staff, para contas com dupla função) sejam
            // arrastadas para esta org só porque a linha partilhada
            // `user_org_ativa` mudou.
            sessionStorage.setItem(getOrgSessionStorageKey(user.id), orgMotorista);
            // Recarregar para que a RLS passe a usar a org correta.
            window.location.reload();
            return;
          }
          console.error('[PainelMotorista] Falha ao alinhar org do motorista:', switchError);
        }
      }

      const { data: motoristaData, error: motoristaError } = await supabase
        .from('motoristas_ativos')
        .select('id, nome, foto_url, status_ativo')
        .eq('user_id', user.id)
        .maybeSingle();

      if (motoristaError) {
        // Não cair silenciosamente na candidatura em branco quando a query
        // falha por um erro real (ex.: coluna inexistente, RLS mal configurada)
        // — já aconteceu e mostrou o formulário de candidatura a um motorista
        // com conta e documentação completas.
        console.error('Erro ao carregar motorista ativo:', motoristaError);
      }

      if (motoristaData) {
        setMotoristaAtivo(motoristaData as any);
        setLoading(false);
        return;
      }

      const { data: candidaturaData, error: candidaturaError } = await supabase
        .from('motorista_candidaturas')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (candidaturaError && candidaturaError.code !== 'PGRST116') {
        console.error('Erro ao carregar candidatura:', candidaturaError);
      }

      setCandidatura(candidaturaData as unknown as Candidatura | null);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="main-content-safe flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
          <p className="text-base text-foreground">A carregar a área do motorista...</p>
        </div>
      </div>
    );
  }

  const displayUserName =
    motoristaAtivo?.nome || candidatura?.nome || user?.user_metadata?.full_name || 'Motorista';
  const displayUserPhoto = motoristaAtivo?.foto_url || user?.user_metadata?.avatar_url;

  return (
    <div className="rota-liquida">
      {motoristaAtivo || candidatura?.status === 'aprovado' ? (
        <MotoristaLayout userName={displayUserName} userPhoto={displayUserPhoto}>
          <MotoristaDashboard />
        </MotoristaLayout>
      ) : !candidatura || candidatura.status === 'rascunho' ? (
        <CandidaturaFormulario candidatura={candidatura} onUpdate={loadUserData} />
      ) : candidatura.status === 'submetido' || candidatura.status === 'em_analise' ? (
        <CandidaturaEmAnalise candidatura={candidatura} />
      ) : candidatura.status === 'rejeitado' ? (
        <CandidaturaRejeitada candidatura={candidatura} onResubmit={loadUserData} />
      ) : null}
    </div>
  );
};

export default PainelMotorista;
