// src/config/bolt.test.ts
//
// Este ficheiro testava um interruptor `BOLT_FONTE_FINANCEIRA` que escolhia
// entre DUAS TABELAS para o mesmo dinheiro Bolt — bolt_resumos_semanais quando
// estava em 'csv', bolt_viagens quando estava em 'api'. O interruptor
// desapareceu: há um sítio só, e tanto a API oficial como o CSV escrevem lá.
//
// O que se guarda aqui agora é a regra que substituiu o interruptor, para que
// ninguém a desfaça sem dar por isso.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOLT_GANHOS } from './bolt';

const raiz = join(__dirname, '..', '..');
const ler = (caminho: string) => readFileSync(join(raiz, caminho), 'utf8');

describe('ganhos Bolt: uma tabela só', () => {
  it('a fonte é bolt_resumos_semanais.liquido_a_pagar', () => {
    // liquido_a_pagar = ganhos_liquidos + ganhos_campanha + reembolsos_despesas,
    // calculada pela base (migração 20260915170000). Numa integração em oauth
    // o ganhos_liquidos vem da API, que não conhece campanhas: só na semana
    // de 2026-09-07 ficaram 984,28 EUR de campanhas por chegar aos motoristas
    // da Década Ousada. Ler ganhos_liquidos directamente volta a perdê-las.
    expect(BOLT_GANHOS.tabela).toBe('bolt_resumos_semanais');
    expect(BOLT_GANHOS.campo).toBe('liquido_a_pagar');
  });

  it('não voltou a existir um interruptor de fonte', () => {
    // Um `BOLT_FONTE_FINANCEIRA` obrigava cada ecrã a repetir a decisão, e
    // bastava um decidir diferente para o mesmo motorista aparecer com dois
    // valores.
    expect(ler('src/config/bolt.ts')).not.toMatch(/export const BOLT_FONTE_FINANCEIRA/);
  });

  it('nenhum ecrã financeiro lê bolt_viagens para dinheiro', () => {
    // bolt_viagens tem uma linha por TENTATIVA de despacho: a mesma corrida
    // aparece lá tantas vezes quantas a Bolt a despachou, sempre com os mesmos
    // valores. Somá-la dava 19.489,74 EUR a mais.
    const ecras = [
      'src/components/administrativo/ContasResumoTab.tsx',
      'src/components/motoristas/tabs/MotoristaRecibosSection.tsx',
    ];
    for (const ecra of ecras) {
      expect(ler(ecra), `${ecra} não pode consultar bolt_viagens`).not.toMatch(
        /\.from\(\s*['"]bolt_viagens['"]\s*\)/
      );
    }
  });

  it('o fecho da semana grava o líquido a pagar, não o bruto nem o líquido sem campanhas', () => {
    // O painel do motorista lê motorista_resumo_semanal.receita_bolt, escrito
    // aqui. Enquanto isto lia ganhos_brutos_total, o painel mostrava um número
    // e os outros dois ecrãs mostravam outro: em 178 semanas fechadas, 178 não
    // batiam (65.087,40 EUR contra 47.730,63 EUR). Depois leu ganhos_liquidos,
    // que nas integrações em oauth vem da API sem as campanhas.
    const fecho = ler('supabase/functions/fechar-semana-financeiro/index.ts');
    expect(fecho).toMatch(/\.select\('liquido_a_pagar, periodo_inicio, periodo_fim'\)/);
    expect(fecho).not.toMatch(/Number\(r\.ganhos_brutos_total\)/);
    expect(fecho).not.toMatch(/Number\(r\.ganhos_liquidos\)/);
  });

  it('os ecrãs financeiros lêem liquido_a_pagar, não ganhos_liquidos', () => {
    // Os mesmos três sítios que antes convergiram em ganhos_liquidos convergem
    // agora em liquido_a_pagar. Um que fique para trás volta a mostrar um
    // motorista com dois valores — exactamente o que o BOLT_GANHOS existe
    // para impedir.
    const contas = ler('src/hooks/useContasResumoSemana.ts');
    expect(contas).toMatch(/liquido_a_pagar, gorjetas, viagens_terminadas/);
    expect(contas).toMatch(/faturado_bolt \+= Number\(r\.liquido_a_pagar\)/);
    expect(contas).not.toMatch(/Number\(r\.ganhos_liquidos\)/);

    const recibos = ler('src/components/motoristas/tabs/MotoristaRecibosSection.tsx');
    expect(recibos).toMatch(/\.select\('liquido_a_pagar'\)/);
    expect(recibos).toMatch(/Number\(curr\.liquido_a_pagar\)/);
    expect(recibos).not.toMatch(/Number\(curr\.ganhos_liquidos\)/);

    // O ecrã dos motoristas de plataforma sem ficha mostra quanto cada
    // identificador Bolt facturou — é dinheiro, lê o mesmo campo.
    const naoAssociados = ler('src/components/motoristas/MotoristasPlataformaNaoAssociados.tsx');
    expect(naoAssociados).toMatch(/identificador_motorista, motorista_nome, liquido_a_pagar/);
    expect(naoAssociados).toMatch(/faturado \+= Number\(r\.liquido_a_pagar\)/);
    expect(naoAssociados).not.toMatch(/Number\(r\.ganhos_liquidos\)/);
  });
});
