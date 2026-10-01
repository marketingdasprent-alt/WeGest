import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import type { ViaturaFormData } from './viaturaTabDados.types';

// O cartão de anúncios vai à base de dados e não tem nada que ver com tarifas.
vi.mock('./AnunciosViaturaCard', () => ({ AnunciosViaturaCard: () => null }));

import { ViaturaFormVeiculo } from './ViaturaFormVeiculo';

const MODELO_ID = 'modelo-1';
const TIPO_TVDE = { id: 'tipo-1', nome: 'TVDE', elegivel_tvde: true };
const GRUPO = { id: 'grupo-1', nome: 'Grupo A' };

function renderVeiculo(
  tarifasTvdeModelo: Array<{ modelo_id: string; tarifa_nome: string; preco_semana: number }>
) {
  function Wrapper() {
    const form = useForm<ViaturaFormData>({
      defaultValues: {
        grupo_id: GRUPO.id,
        tipo_id: TIPO_TVDE.id,
        modelo_id: MODELO_ID,
      } as unknown as ViaturaFormData,
    });
    return (
      <FormProvider {...form}>
        <ViaturaFormVeiculo
          form={form}
          watchedMarcaId="marca-1"
          marcas={[{ id: 'marca-1', nome: 'Fiat' }]}
          modelos={[{ id: MODELO_ID, nome: 'Panda', marca_id: 'marca-1' }]}
          combustiveis={[]}
          viaturasTipos={[TIPO_TVDE]}
          grupos={[GRUPO]}
          // Grupo sem tarifa própria: é o caso em que o bloco por modelo aparece.
          allTarifas={[]}
          tarifasTvdeModelo={tarifasTvdeModelo}
          tarifasRacModelo={[]}
          estacoes={[]}
          viaturaId={null}
        />
      </FormProvider>
    );
  }
  return render(<Wrapper />);
}

describe('ViaturaFormVeiculo — tarifas TVDE por modelo', () => {
  it('mostra TODAS as tarifas em que o modelo está, não só uma', () => {
    renderVeiculo([
      { modelo_id: MODELO_ID, tarifa_nome: 'TVDE - Base', preco_semana: 325 },
      { modelo_id: MODELO_ID, tarifa_nome: 'Açores', preco_semana: 225 },
    ]);

    expect(screen.getByText('TVDE - Base')).toBeInTheDocument();
    expect(screen.getByText('Açores')).toBeInTheDocument();
    expect(screen.getByText(/325,00/)).toBeInTheDocument();
    expect(screen.getByText(/225,00/)).toBeInTheDocument();
    expect(screen.getByText('Tarifas TVDE (por modelo)')).toBeInTheDocument();
  });

  it('ordena por nome — a ordem não pode depender do que a base devolve', () => {
    renderVeiculo([
      { modelo_id: MODELO_ID, tarifa_nome: 'TVDE - Base', preco_semana: 325 },
      { modelo_id: MODELO_ID, tarifa_nome: 'Açores', preco_semana: 225 },
    ]);

    const nomes = screen.getAllByText(/^(Açores|TVDE - Base)$/).map((el) => el.textContent);
    expect(nomes).toEqual(['Açores', 'TVDE - Base']);
  });

  it('com uma só tarifa mantém o título no singular', () => {
    renderVeiculo([{ modelo_id: MODELO_ID, tarifa_nome: 'TVDE - Base', preco_semana: 325 }]);

    expect(screen.getByText('Tarifa TVDE (por modelo)')).toBeInTheDocument();
    expect(screen.getByText('TVDE - Base')).toBeInTheDocument();
  });

  it('ignora tarifas de outros modelos', () => {
    renderVeiculo([
      { modelo_id: MODELO_ID, tarifa_nome: 'TVDE - Base', preco_semana: 325 },
      { modelo_id: 'outro-modelo', tarifa_nome: 'Tarifa de outro carro', preco_semana: 999 },
    ]);

    expect(screen.getByText('TVDE - Base')).toBeInTheDocument();
    expect(screen.queryByText('Tarifa de outro carro')).not.toBeInTheDocument();
  });
});
