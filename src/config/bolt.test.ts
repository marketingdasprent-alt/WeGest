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
  it('a fonte é bolt_resumos_semanais.ganhos_liquidos', () => {
    expect(BOLT_GANHOS.tabela).toBe('bolt_resumos_semanais');
    expect(BOLT_GANHOS.campo).toBe('ganhos_liquidos');
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

  it('o fecho da semana grava o líquido, não o bruto', () => {
    // O painel do motorista lê motorista_resumo_semanal.receita_bolt, escrito
    // aqui. Enquanto isto lia ganhos_brutos_total, o painel mostrava um número
    // e os outros dois ecrãs mostravam outro: em 178 semanas fechadas, 178 não
    // batiam (65.087,40 EUR contra 47.730,63 EUR).
    const fecho = ler('supabase/functions/fechar-semana-financeiro/index.ts');
    expect(fecho).toMatch(/\.select\('ganhos_liquidos, periodo_inicio, periodo_fim'\)/);
    expect(fecho).not.toMatch(/Number\(r\.ganhos_brutos_total\)/);
  });
});
