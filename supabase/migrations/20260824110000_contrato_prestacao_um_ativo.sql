-- ============================================================
-- Um contrato de prestação activo de cada vez
-- ============================================================
-- A 24/08/2026 havia 18 contratos activos onde deviam existir 4. O caso pior:
-- 11 contratos para o mesmo motorista, mesma viatura e mesma reserva, criados
-- de quatro em quatro segundos. Não é um bug de lógica de negócio — é o botão
-- "criar contrato" a aceitar ser carregado várias vezes, e nada na base de
-- dados a recusar o segundo.
--
-- O ecrã do motorista não deixa perceber que são vários: mostra um contrato.
-- Só quando o dinheiro começa a ser contado a triplicar é que se dá por isso.
--
-- Debounce no botão não chega: dois separadores abertos, ou um clique enquanto
-- a rede está lenta, e volta a acontecer. A regra tem de viver aqui, onde não
-- há forma de a contornar.
--
-- A limpeza vem primeiro: os índices não podem ser criados enquanto houver
-- duplicados activos.

-- ── 0. Limpar o que já lá está ────────────────────────────────────────────
-- De cada grupo (mesma reserva, motorista e viatura) fica o mais recente; os
-- anteriores passam a 'encerrado'. À data eram 18 activos para 4 grupos.
--
-- Reversível: muda o estado, não apaga. Nenhuma tabela tem chave estrangeira
-- para contratos_prestacao, portanto não há referências a partir.
with duplicados as (
  select id,
         row_number() over (
           partition by reserva_id, motorista_id, viatura_id
           order by created_at desc
         ) as posicao
  from public.contratos_prestacao
  where estado = 'ativo' and deleted_at is null
)
update public.contratos_prestacao cp
set estado = 'encerrado',
    observacoes = coalesce(cp.observacoes || E'\n', '')
      || 'Encerrado a 2026-08-24: duplicado do mesmo motorista, viatura e reserva, '
      || 'criado por cliques repetidos em "criar contrato". Ficou activo o mais recente do grupo.',
    updated_at = now()
from duplicados d
where d.id = cp.id and d.posicao > 1;

-- ── 1. Um activo por reserva ──────────────────────────────────────────────
-- Uma reserva dá origem a um contrato. `reserva_id is not null` porque há
-- contratos criados à mão, sem reserva — esses caem na regra seguinte.
create unique index if not exists contratos_prestacao_um_ativo_por_reserva
  on public.contratos_prestacao (reserva_id)
  where estado = 'ativo' and deleted_at is null and reserva_id is not null;

-- ── 2. Um activo por motorista + viatura ──────────────────────────────────
-- Apanha o caso sem reserva. Um motorista pode ter dois contratos activos se
-- forem viaturas diferentes — isso continua a passar. O que deixa de passar é
-- o mesmo par motorista+viatura duas vezes ao mesmo tempo.
--
-- Não impede um contrato novo depois de o anterior terminar: o índice só olha
-- para os que estão `ativo`.
create unique index if not exists contratos_prestacao_um_ativo_por_motorista_viatura
  on public.contratos_prestacao (motorista_id, viatura_id)
  where estado = 'ativo' and deleted_at is null;

comment on index public.contratos_prestacao_um_ativo_por_reserva is
  'Impede o duplo clique em "criar contrato" de deixar dois contratos activos para a mesma reserva.';

comment on index public.contratos_prestacao_um_ativo_por_motorista_viatura is
  'Impede dois contratos activos para o mesmo motorista e viatura ao mesmo tempo (cobre os contratos sem reserva).';
