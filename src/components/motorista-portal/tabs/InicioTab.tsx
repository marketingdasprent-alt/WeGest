import React from 'react';
import { Car, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

import { Skeleton } from '@/components/ui/skeleton';
import { legendaSaldoMotorista } from '@/lib/saldoMotorista';
import { useMotoristaTab } from '@/hooks/useMotoristaTab';
import { useMotoristaDashboardStats } from '@/hooks/useMotoristaDashboardStats';
import { useMotoristaViaturaAtual } from '@/hooks/useMotoristaViaturaAtual';
import { useKmDaSemana } from '@/hooks/useKmDaSemana';
import { useMeusAcordosAtivos } from '@/hooks/useAcordoVistaDevedor';
import { useExtratoSemanal } from '@/hooks/useExtratoSemanal';
import type { MotoristaAtivo } from '@/hooks/useMotoristaAtivo';
import { construirAlertas } from '../alertasMotorista';
import { MotoristaAlertas } from '../MotoristaAlertas';
import { MotoristaMiniCartao } from '../MotoristaMiniCartao';
import { MotoristaRegistarKmCard } from '../MotoristaRegistarKmCard';
import { MotoristaExtratoCard } from '../MotoristaExtratoCard';

interface InicioTabProps {
  motorista: MotoristaAtivo;
  usaRecibos: boolean;
}

const eur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

/**
 * O ecrã de entrada: só o que pede acção ou muda de semana para semana.
 *
 * Ordem = prioridade. Os quilómetros primeiro quando faltam (sem eles não há
 * pagamento), depois os alertas, depois saldo e viatura de relance, e a
 * semana ao vivo. O resto vive nas outras secções — aqui não se faz scroll
 * por nove cartões para achar o que interessa.
 */
export const InicioTab: React.FC<InicioTabProps> = ({ motorista, usaRecibos }) => {
  const { irPara } = useMotoristaTab();
  const {
    data: stats,
    isLoading: statsALoad,
    error: statsErro,
  } = useMotoristaDashboardStats(motorista, { usaRecibos });
  const { data: viatura, isLoading: viaturaALoad } = useMotoristaViaturaAtual(motorista.id);
  const { data: semanaKm } = useKmDaSemana(motorista.id);
  const { data: acordos } = useMeusAcordosAtivos();
  const semana = useExtratoSemanal(motorista.id);

  // Sem resposta ainda trata-se como entregue: um cartão a piscar durante o
  // carregamento assusta sem motivo, e corrige-se sozinho num instante.
  const kmPorEntregar = !!viatura && !!semanaKm && !semanaKm.entregue;

  const alertas = construirAlertas({
    docsExpirando: stats?.docsExpirando ?? [],
    semanasEmFalta: stats?.semanasEmFalta.length ?? 0,
    recibosEmValidacao: stats?.recibosEmValidacao.length ?? 0,
    acordosAtivos: acordos?.length ?? 0,
    usaRecibos,
  });

  const legenda = stats ? legendaSaldoMotorista(stats.saldoPendente) : null;
  const primeiroNome = motorista.nome?.split(' ')[0] || 'Motorista';
  const nomeViatura = viatura ? [viatura.marca, viatura.modelo].filter(Boolean).join(' ') : '';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold leading-tight md:text-2xl">Olá, {primeiroNome}</h1>
        <p className="text-xs capitalize text-muted-foreground">
          {format(new Date(), "EEEE, d 'de' MMMM", { locale: pt })}
        </p>
      </div>

      {kmPorEntregar && <MotoristaRegistarKmCard motoristaId={motorista.id} />}

      <MotoristaAlertas alertas={alertas} onAbrir={irPara} />

      <div className="grid grid-cols-2 gap-3">
        <MotoristaMiniCartao
          rotulo="Saldo"
          icone={Wallet}
          valor={
            statsALoad ? (
              <Skeleton className="h-6 w-20" />
            ) : statsErro || !stats ? (
              '—'
            ) : (
              eur(stats.saldoPendente)
            )
          }
          detalhe={statsErro ? 'Não foi possível carregar' : legenda?.texto}
          tom={legenda?.tone === 'negativo' ? 'negativo' : 'neutro'}
          onClick={() => irPara('contas')}
        />
        <MotoristaMiniCartao
          rotulo="Viatura"
          icone={Car}
          valor={
            viaturaALoad ? (
              <Skeleton className="h-6 w-24" />
            ) : viatura ? (
              <span className="font-mono tracking-wide">{viatura.matricula}</span>
            ) : (
              'Sem viatura'
            )
          }
          detalhe={
            viatura
              ? nomeViatura ||
                (viatura.kmAtual != null ? `${viatura.kmAtual.toLocaleString('pt-PT')} km` : null)
              : 'Nenhuma atribuída'
          }
          onClick={() => irPara('viatura')}
        />
      </div>

      <MotoristaExtratoCard
        extrato={semana.extrato}
        isLoading={semana.isLoading}
        error={semana.error}
        inicio={semana.inicio}
        fim={semana.fim}
        semanasAtras={semana.semanasAtras}
        onAnterior={semana.anterior}
        onSeguinte={semana.seguinte}
      />
    </div>
  );
};
