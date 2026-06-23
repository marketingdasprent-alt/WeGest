import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const RAW_DATA = `Nome	Cartão de Combustível
Abraao Freitas	N/A
Adair Pinheiro	EDP 28925 / REPSOL DA 1040
Adalberto Junior	REPSOL DA 0976
Adriana Borges	N/A
Agnelo Tavares	N/A
Ahmed Gaceb	REPSOL 0039
Ailton Barros	REPSOL DO 0235
Alcinei Crestani	N/A
Alessandro da Silva	N/A
Alessandro Matos	N/A
Alex Sandro	REPSOL 1107
Alexandre Moura	REPSOL 1938
Ali Yazi	REPSOL 1453
Almir Almeida	N/A
Alysson Caldeira	REPSOL DA 0638
Amadeu Souto	EDP 30240
Ana Alfaiate	BP DA 450
Ana Aurelio	EDP 30262
André Bojaca Lopes	BP DA 1375
André Mendes	N/A
Andre Nascimento	REPSOL DA 0018
Andre Rocha	EDP 28937
Andressa Machado	N/A
Angela Souza	EDP 30270
Antonio Batista	REPSOL 0794
Antonio Cardoso	REPSOL DA 1214
Antonio Dias	
Antonio Ribeiro	EDP 30271
Antonio Rosa	REPSOL DO 0193
Antonio Vieira	REPSOL DO 0250
Arivelton Oliveira	REPSOL DO 0359
Augusto Oliveira	N/A
Aymen Mhamdi	BP DA 1136
Belito Julio	REPSOL 0273 
Braidili Fortes	N/A
Camila Silva	N/A
Carla Marques 	N/A
Carlos Carvalho	N/A
Carlos Domingos	N/A
Carlos Henrique	N/A
Carlos Oliveira	N/A
Carlos Serra	BP DA 1953
Catia Coelho	EDP 27234
Celia Santos	N/A
Celio Aguiar	N/A
Cesar Martins	N/A
Cesar Sousa	EDP 30257
Cezar Tome	REPSOL 0398
Claudio Henriques	REPSOL 0562
Claudio Silva	N/A
Cristiano de Sousa	N/A
Dalvir Puri	N/A
Dídimo Fernandes	REPSOL 0026
Douglas Oliveira	EDP 30256
Edson Felisberto	N/A
Eduardo Pedro Ramos	REPSOL DO 0292
Eduardo Silva	N/A
Eduardo Tendim Ramos	EDP 28905
Eduardo Yoshioka	N/A
Ekene Muodum	N/A
Eli Cavassas	REPSOL 1412
Elias Araujo	REPSOL DO 1081
Eligiane Bruna	BP DA 1813
Elio Silva	EDP 28913 / EDP 30259
Elton Kuhnen	N/A
Emanuel Martins	N/A
Emanuel Rosa	EDP 27241
Emerson Diniz	REPSOL 1206
Emerson Pinto	REPSOL DO 0391
Eumissier  Fernandes 	N/A
Fabiano Scolari	EDP 30264
Fabio Bernardo 	REPSOL 0752 / EDP 28942
Fábio Magnavita	BP 526 / REPSOL 0034
Fabio Queiros	EDP 30250
Fabio Santos	EDP 30238
Fabrício Soares	BP DA 484
Fagner Amorim	BP DA 1243 / REPSOL DA 1016
Feliciano Simão 	N/A
Fernando da Silva Pereira	N/A
Filipa Aniceto	BP DA 1821
Filipe Ferreira	BP DA 0641
Flavia Prazeres	N/A
Francione Souza	REPSOL DA 1214 / REPSOL DO 0466
Francisco Basílio	N/A
Francisco Junior	N/A
Francisco Santos	N/A
Frederico Cardoso	REPSOL DA 1099
Frederico Ferrao	EDP 28910
Gerson Lebre	REPSOL 1065
Gil Gonçalves	EDP 30260
Gilberto Dju	N/A
Glenys Patino	BP 1789
Gleyson Rocha	N/A
Gonçalo Caldas	EDP 30299
Gorav Sharma	N/A
Gurmit Singh	N/A
Harish Kumar	N/A
Higino Caimbambo	REPSOL DO 0185
Hugo Guedes	N/A
Isevane Silva	REPSOL DA 1156
Jaime Ferreira	EDP 28920
Jeniffer Silva	BP DA 0427 / EDP 30237
João Conchinha	n/a
João Correia 	BP DA 1722
João Dias	N/A
João Santos	N/A
João Varela	N/A
Joaquim Coelho	
Joaquim Rosa	BP DA 1243
Jorge Conceição	EDP 28933
Jorge Detoni	EDP 28936
Jorge Souza	N/A
José Braga	REPSOL DO 0227
Jose Carlos Silva	BP DA 849
Jose Fiaminghi	N/A
José Gomes	N/A
José Junior	EDP 28930
Jose Menezes	N/A
José Pacheco	EDP 27267
Jose Ramalho Carvalho	REPSOL DO 0021
Jose Reis Cabeças	REPSOL 0409
Jose Rosa	N/A
Josué Jesus	REPSOL DA 1255
Juliana Severino	EDP 30273
Kamal Preet	N/A
Kamoli Adedoyn	REPSOL SA 1446
Kamran Haider	N/A
Karla Pacheco	EDP 30237
Ketan Arora	N/A
Khalid Issa	N/A
Kulwant Singh	N/A
Larissa Silva	N/A
Leandro Rebelo	N/A
Leandro Reis 	REPSOL 1313
Lidiane Silva	N/A
Lucia Duceac	N/A
Luciano Andrade	REPSOL DA 0711
Luis Felicidade	REPSOL DA 0042
Luis Pereira	N/A
Luis Pineza	EDP 30255
Luiz Candeo	EDP 30258
Luiz Peixoto	N/A
Manuel Pedroso	REPSOL 1230 / EDP 27273
Marcelo Jaques	EDP 30276
Marcio Jesus	EDP 28905
Marco Reis	EDP 28906
Marcos Nunes	REPSOL DA 1131
Marcus Moraes	BP DA 690
Maria Luisa Aço	BP DA 138
Maria Pires	N/A
Mario Antunes	N/A
Mario Costa	N/A
Marivalda Roza	REPSOL DO 0136
Marlone Melo	REPSOL DA 1172
Masoud Jafari	N/A
Mateus Machado	N/A
Mauricio Lopes	REPSOL 1404
Mauricio Moura	N/A
Mauro Pinto	REPSOL DO 0060
Mehrshad Ghafoorin	REPSOL DA 1164 / EDP 30235
Michelle Santos	BP DA 0435
Miguel Maia	BP 559
Milton Furtado	EDP 27264
Muhammad Tarar	N/A
Nader Derbali	N/A
Nadila Silva	BP DA 070 / EDP 30267
Narinder Pall Singh	N/A
Nathalie Ferro	BP DA 0963
Neeraj Prinja	BP DA 0773
Nelongo Nempambala	N/A
Nelson marques	BP DA 542
Nidhal Riahi	N/A
Nounou Mendes	N/A
Nozha Dardourl	REPSOL DA 0703
Nuno Costa	EDP 27241
Nuno Raposo	N/A
Nuno Silva	N/A
Nuno Viveiros	EDP 27266
Odair Oliveira	REPSOL DA 0539
Pablo Caro	N/A
Patrick Figueiredo	EDP 30275
Patrick Nunes	N/A
Paula Rodriguez	BP DA 1904
Paulo Amado Silva	BP DA 278
Paulo Antunes	REPSOL DA 1529
Paulo Azenha	BP DA 1854
Paulo Baltazar	N/A
Paulo Brito	N/A
Paulo Caldeira	N/A
Paulo Ferreira	EDP 30252 / BP DA 1680
Paulo Patricio	REPSOL 0505
Paulo Perneta	EDP 30281 / REPSOL DO 0029
Paulo Silva	EDP30242
Pedro Madeira	N/A
Pedro Martins	BP 1714
Pedro Pacheco	N/A
Pedro Rebelo	EDP 27242
Pedro Rego	EDP 27243
Pedro Silva	N/A
Pedro Souto	N/A
Prabhjit Singh 	N/A
Radhwen Garbi	REPSOL DA 1032
Radjab Sharipov	N/A
Rafael Silva	N/A
Rajwinder Singh	bp da 1698
Ricardo Monteiro	BP DA 1292
Roberta Vieira	N/A
Roberto Benigno	REPSOL DO 0011
Roberto Rocha	EDP 27240
Roberto Silva	REPSOL DA 0177
Robin Singh	REPSOL DO 0243
Rodrigo Cardoso	N/A
Rodrigo Muniz	EDP 28922
Rodrigo Silva	N/A
Rosa Alves	N/A
Rosemberg Melo	N/A
Ruben Roda	REPSOL 1289
Ruben Soares 	BP DA 1474
Rui dos Santos	N/A
Rui Ponte	EDP 28904
Sachin Sharma	REPSOL DO 0425
Saddam Abdelkafi 	N/A
Sagar Patel	N/A
Saker Zoghlami	REPSOL DO 0433
Samantha Morais	REPSOL 0836
Sandra Correia	BP DA 1284
Sandra Guitart	N/A
Sandra Noemia	EDP 28939
Saqib Chaudhary	REPSOL DO 0219
Silmara Silva	REPSOL 0315
Sonia Sousa	N/A
Sunil Suni	N/A
Tahir Iqbal	N/A
Taiana Muniz	RODRIGO
Tarciso Rego	N/A
Thiago Almeida	REPSOL DA 0901
Thiago Fernandes	N/A
Thiago Nascimento	BP DA 1300
Thiago Vidal	N/A
Tiago Filipe Ferraz	BP DA 1748
Tulio Miranda	REPSOL DO 0013
Valdenilson Silva	
Vikram Vikram	N/A
Vladmir Chipapa	EDP 28932
Wael Al Muhunna	REPSOL DA 0331
Walter Dias Souza	N/A
Wanderly Souza	N/A
Waqar Ahmed	REPSOL DA 0919
Yuri Silva	EDP 27239`;

function normalizeName(name: string): string {
  return (
    name
      ?.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || ''
  );
}

export function ReparaCartoes() {
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    if (!confirm('Isto vai atualizar todos os cartões de motoristas na base de dados. Continuar?'))
      return;
    setRunning(true);
    try {
      const { data: dbMotoristas } = await supabase
        .from('motoristas_ativos')
        .select('id, nome, cartao_bp, cartao_repsol, cartao_edp');
      if (!dbMotoristas) throw new Error('Erro ao carregar motoristas do DB');

      const lines = RAW_DATA.split('\n').filter((l) => l.trim() && !l.startsWith('Nome'));
      let updated = 0;

      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length < 2) continue;
        const nomeRaw = parts[0].trim();
        const cartaoRaw = parts[1].trim();

        if (
          !cartaoRaw ||
          cartaoRaw.toUpperCase() === 'N/A' ||
          cartaoRaw.toUpperCase() === 'RODRIGO'
        )
          continue;

        // Encontrar motorista
        const normSearch = normalizeName(nomeRaw);
        const match = dbMotoristas.find(
          (m) =>
            normalizeName(m.nome).includes(normSearch) || normSearch.includes(normalizeName(m.nome))
        );

        if (match) {
          // Extract cartões
          const bp = [];
          const repsol = [];
          const edp = [];

          const tokens = cartaoRaw.split('/').map((t) => t.trim());
          for (const t of tokens) {
            const up = t.toUpperCase();
            if (up.includes('BP')) bp.push(t);
            else if (up.includes('REPSOL')) repsol.push(t);
            else if (up.includes('EDP')) edp.push(t);
            else {
              // Se não especificou bem, adivinhamos?
              if (up.includes('DA ') || up.includes('DO ')) repsol.push(t); // heurística
            }
          }

          const updates: any = {};
          if (bp.length) updates.cartao_bp = bp.join(' / ');
          if (repsol.length) updates.cartao_repsol = repsol.join(' / ');
          if (edp.length) updates.cartao_edp = edp.join(' / ');

          if (Object.keys(updates).length > 0) {
            await supabase.from('motoristas_ativos').update(updates).eq('id', match.id);
            updated++;
          }
        }
      }

      toast.success(`Atualizados os cartões de ${updated} motoristas com sucesso!`);
    } catch (e: any) {
      console.error(e);
      toast.error('Erro: ' + e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Button
      onClick={handleRun}
      disabled={running}
      variant="outline"
      className="text-orange-500 border-orange-500"
    >
      {running ? <Loader2 className="animate-spin mr-2" /> : null}
      Corrigir Cartões Combustível
    </Button>
  );
}
