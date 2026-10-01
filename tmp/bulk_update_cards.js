import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://hkqzzxgeedsmjnhyquke.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_ANON_KEY) throw new Error('Configure VITE_SUPABASE_PUBLISHABLE_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const UPDATES = [
  { nome: 'Abel Cardas', cartao_repsol: 'REPSOL DA 1529' },
  { nome: 'Adair Pinheiro', cartao_edp: 'EDP 28925', cartao_repsol: 'REPSOL DA 1040' },
  { nome: 'Ahmed Gaceb', cartao_repsol: 'REPSOL 0039' },
  { nome: 'Alex Sandro', cartao_repsol: 'REPSOL 1107' },
  { nome: 'Alexandre Moura', cartao_repsol: 'REPSOL 1938' },
  { nome: 'Alysson Caldeira', cartao_repsol: 'REPSOL DA 0638' },
  { nome: 'Amadeu Souto', cartao_edp: 'EDP 30240' },
  { nome: 'Ana Alfaiate', cartao_bp: 'BP DA 450' },
  { nome: 'Ana Aurelio', cartao_edp: 'EDP 30262' },
  { nome: 'André Bojaca Lopes', cartao_bp: 'BP DA 1375' },
  { nome: 'Andre Nascimento', cartao_repsol: 'REPSOL DA 0018' },
  { nome: 'Andre Rocha', cartao_edp: 'EDP 28937' },
  { nome: 'Angela Souza', cartao_edp: 'EDP 30270' },
  { nome: 'Antonio Batista', cartao_repsol: 'REPSOL 0794' },
  { nome: 'Antonio Fernandes', cartao_edp: 'EDP 30230' },
  { nome: 'Antonio Ribeiro', cartao_edp: 'EDP 30271' },
  { nome: 'Antonio Vieira', cartao_repsol: 'REPSOL DO 0250' },
  { nome: 'Arivelton Oliveira', cartao_repsol: 'REPSOL DA 0497 / REPSOL DO 0359' },
  { nome: 'Aymen Mhamdi', cartao_bp: 'BP DA 1136' },
  { nome: 'Belito Julio', cartao_repsol: 'REPSOL 0273' },
  { nome: 'Carla Cristiane Marques', cartao_edp: 'EDP 30244' },
  { nome: 'Carlos Serra', cartao_bp: 'BP DA 1953' },
  { nome: 'Catia Coelho', cartao_edp: 'EDP 27234' },
  { nome: 'Cesar Sousa', cartao_edp: 'EDP 30257' },
  { nome: 'Cezar Tome', cartao_repsol: 'REPSOL 0398' },
  { nome: 'Claudio Henriques', cartao_repsol: 'REPSOL 0563' },
  { nome: 'Deepak Kumar', cartao_edp: 'EDP 30237', cartao_bp: 'BP DA 1763' },
  { nome: 'Dídimo Fernandes', cartao_repsol: 'REPSOL 0026' },
  { nome: 'Douglas Oliveira', cartao_edp: 'EDP 30256' },
  { nome: 'Eduardo Pedro Ramos', cartao_repsol: 'REPSOL DO 0292' },
  { nome: 'Eduardo Tendim Ramos', cartao_edp: 'EDP 28905' },
  { nome: 'Eli Cavassas', cartao_repsol: 'REPSOL 1412' },
  { nome: 'Elias Araujo', cartao_repsol: 'REPSOL DO 1081' },
  { nome: 'Eligiane Bruna', cartao_bp: 'BP DA 1813' },
  { nome: 'Elio Silva', cartao_edp: 'EDP 28913 / EDP 30259' },
  { nome: 'Emanuel Rosa', cartao_edp: 'EDP 27241' },
  { nome: 'Emerson Diniz', cartao_repsol: 'REPSOL 1206' },
  { nome: 'Emerson Pinto', cartao_repsol: 'REPSOL DO 0391' },
  { nome: 'Fabiano Scolari', cartao_edp: 'EDP 30264' },
  { nome: 'Fabio Bernardo', cartao_repsol: 'REPSOL 0752' },
  { nome: 'Fábio Magnavita', cartao_bp: 'BP 526', cartao_repsol: 'REPSOL 0034' },
  { nome: 'Fabio Santos', cartao_edp: 'EDP 30238' },
  { nome: 'Fabrício Soares', cartao_bp: 'BP DA 484' },
  { nome: 'Fagner Amorim', cartao_bp: 'BP DA 1243', cartao_repsol: 'REPSOL DA 1016' },
  { nome: 'Fernando Pereira', cartao_repsol: 'REPSOL 0927 / REPSOL DO 0235' },
  { nome: 'Filipa Aniceto', cartao_bp: 'BP DA 1821' },
  { nome: 'Filipe Ferreira', cartao_bp: 'BP DA 0641' },
  { nome: 'Francione Souza', cartao_repsol: 'REPSOL DA 1214 / REPSOL DO 0466' },
  { nome: 'Frederico Cardoso', cartao_repsol: 'REPSOL DA 1099' },
  { nome: 'Gerson Lebre', cartao_repsol: 'REPSOL 1065' },
  { nome: 'Gil Gonçalves', cartao_edp: 'EDP 30260' },
  { nome: 'Glenys Patino', cartao_bp: 'BP 1789' },
  { nome: 'Gonçalo Caldas', cartao_edp: 'EDP 30299' },
  { nome: 'Higino Caimbambo', cartao_bp: 'BP DA 1888', cartao_repsol: 'REPSOL DO 0185' },
  { nome: 'Isevane Silva', cartao_repsol: 'REPSOL DA 1156' },
  { nome: 'Jaime Ferreira', cartao_edp: 'EDP 28920' },
  { nome: 'Jeniffer Silva', cartao_bp: 'BP DA 0427', cartao_edp: 'EDPM 30237' },
  { nome: 'João Correia', cartao_bp: 'BP DA 1722' },
  { nome: 'João Varela', cartao_edp: 'EDP 30235' },
  { nome: 'Joaquim Coelho', cartao_edp: 'EDP 27262' },
  { nome: 'Joaquim Rosa', cartao_bp: 'BP DA 1243' },
  { nome: 'Jorge Conceição', cartao_edp: 'EDP 28933' },
  { nome: 'Jorge Detoni', cartao_edp: 'EDP 28936' },
  { nome: 'José Braga', cartao_repsol: 'REPSOL DO 0227' },
  { nome: 'Jose Carlos Silva', cartao_bp: 'BP DA 849' },
  { nome: 'José Junior', cartao_edp: 'EDP 28930' },
  { nome: 'José Pacheco', cartao_edp: 'EDP 27267' },
  { nome: 'Jose Ramalho Carvalho', cartao_repsol: 'REPSOL DO 0021' },
  { nome: 'Jose Reis Cabeças', cartao_repsol: 'REPSOL 0409' },
  { nome: 'Josué Jesus', cartao_repsol: 'REPSOL DA 1255' },
  { nome: 'Juliana Severino', cartao_edp: 'EDP 30273' },
  { nome: 'Kamoli Adedoyn', cartao_repsol: 'REPSOL SA 1446' },
  { nome: 'Karla Pacheco', cartao_edp: 'EDP 30237' },
  { nome: 'Leandro Reis', cartao_repsol: 'REPSOL 1313' },
  { nome: 'Luciano Andrade', cartao_repsol: 'REPSOL DA 0711' },
  { nome: 'Luis Felicidade', cartao_repsol: 'REPSOL DA 0042' },
  { nome: 'Luis Pineza', cartao_edp: 'EDP 30255' },
  { nome: 'Luiz Candeo', cartao_edp: 'EDP 30258' },
  { nome: 'Manuel Domingos', cartao_bp: 'BP DA 1862' },
  { nome: 'Manuel Pedroso', cartao_repsol: 'REPSOL 1230', cartao_edp: 'EDP 27273' },
  { nome: 'Marcelo Jaques', cartao_edp: 'EDP 30276' },
  { nome: 'Marcio Jesus', cartao_edp: 'EDP 28905' },
  { nome: 'Marco Reis', cartao_edp: 'EDP 28906' },
  { nome: 'Marcos Nunes', cartao_repsol: 'REPSOL DA 1131' },
  { nome: 'Marcus Moraes', cartao_bp: 'BP DA 690' },
  { nome: 'Maria Luisa Aço', cartao_bp: 'BP DA 138' },
  { nome: 'Marivalda Roza', cartao_repsol: 'REPSOL DO 0136' },
  { nome: 'Marlone Melo', cartao_repsol: 'REPSOL DA 1172' },
  { nome: 'Mateus Aragão', cartao_edp: 'EDP 28910' },
  { nome: 'Mauricio Lopes', cartao_repsol: 'REPSOL 1404' },
  { nome: 'Mauro Pinto', cartao_repsol: 'REPSOL DO 0060' },
  { nome: 'Mehrshad Ghafoorin', cartao_repsol: 'REPSOL DA 1164' },
  { nome: 'Michelle Santos', cartao_bp: 'BP DA 0435' },
  { nome: 'Miguel Maia', cartao_bp: 'BP 559' },
  { nome: 'Milton Furtado', cartao_edp: 'EDP 27264' },
  { nome: 'Nadila Silva', cartao_bp: 'BP DA 070', cartao_edp: 'EDP 30267' },
  { nome: 'Nathalie Ferro', cartao_bp: 'BP DA 0963' },
  { nome: 'Neeraj Prinja', cartao_bp: 'BP DA 0773' },
  { nome: 'Nelson marques', cartao_bp: 'BP DA 542' },
  { nome: 'Nozha Dardourl', cartao_repsol: 'REPSOL DA 0703' },
  { nome: 'Nuno Costa', cartao_edp: 'EDP 27241' },
  { nome: 'Nuno Viveiros', cartao_edp: 'EDP 27266' },
  { nome: 'Patrick Figueiredo', cartao_edp: 'EDP 30275' },
  { nome: 'Paula Rodriguez', cartao_bp: 'BP DA 1904' },
  { nome: 'Paulo Amado Silva', cartao_bp: 'BP DA 278' },
  { nome: 'Paulo Antunes', cartao_repsol: 'REPSOL DA 1529' },
  { nome: 'Paulo Azenha', cartao_bp: 'BP DA 1854' },
  { nome: 'Paulo Ferreira', cartao_edp: 'EDP 30252', cartao_bp: 'BP DA 1680' },
  { nome: 'Paulo Patricio', cartao_repsol: 'REPSOL 0505' },
  { nome: 'Paulo Perneta', cartao_edp: 'EDP 30281' },
  { nome: 'Paulo Silva', cartao_edp: 'EDP30242' },
  { nome: 'Pedro Martins', cartao_bp: 'BP 1714' },
  { nome: 'Pedro Rebelo', cartao_edp: 'EDP 27242' },
  { nome: 'Pedro Rego', cartao_edp: 'EDP 27243' },
  { nome: 'Radhwen Garbi', cartao_repsol: 'REPSOL DA 1032' },
  { nome: 'Rajwinder Singh', cartao_bp: 'bp da 1698' },
  { nome: 'Ricardo Monteiro', cartao_bp: 'BP DA 1292' },
  { nome: 'Roberto Benigno', cartao_repsol: 'REPSOL DO 0011' },
  { nome: 'Roberto Rocha', cartao_edp: 'EDP 27240' },
  { nome: 'Roberto Silva', cartao_repsol: 'REPSOL DA 0177' },
  { nome: 'Robin Singh', cartao_repsol: 'REPSOL DO 0243' },
  { nome: 'Rodrigo Muniz', cartao_edp: 'EDP 28922' },
  { nome: 'Ruben Roda', cartao_repsol: 'REPSOL 1289' },
  { nome: 'Ruben Soares', cartao_repsol: 'REPSOL 1474' },
  { nome: 'Rui Ponte', cartao_edp: 'EDP 28904' },
  { nome: 'Sachin Sharma', cartao_repsol: 'REPSOL DO 0425' },
  { nome: 'Saker Zoghlami', cartao_repsol: 'REPSOL DO 0433' },
  { nome: 'Samantha Morais', cartao_repsol: 'REPSOL 0836' },
  { nome: 'Sandra Correia', cartao_bp: 'BP DA 1284' },
  { nome: 'Sandra Noemia', cartao_edp: 'EDP 28939' },
  { nome: 'Saqib Chaudhary', cartao_repsol: 'REPSOL DO 0219' },
  { nome: 'Silmara Silva', cartao_repsol: 'REPSOL 0315' },
  { nome: 'Tania Lopes', cartao_repsol: 'REPSOL 0128' },
  { nome: 'Thiago Almeida', cartao_repsol: 'REPSOL DA 0901' },
  { nome: 'Thiago Nascimento', cartao_bp: 'BP DA 1300' },
  { nome: 'Tiago Filipe Ferraz', cartao_bp: 'BP DA 1748' },
  { nome: 'Tulio Miranda', cartao_repsol: 'REPSOL DO 0013' },
  { nome: 'Vladmir Chipapa', cartao_edp: 'EDP 28932' },
  { nome: 'Wael Al Muhunna', cartao_repsol: 'REPSOL DA 0331' },
  { nome: 'Waqar Ahmed', cartao_repsol: 'REPSOL DA 0919' },
  { nome: 'Yuri Silva', cartao_edp: 'EDP 27239' }
];

async function runUpdates() {
  console.log(`Iniciando actualização de ${UPDATES.length} motoristas...`);
  let successCount = 0;
  let errorCount = 0;

  for (const update of UPDATES) {
    const { data, error } = await supabase
      .from('motoristas_ativos')
      .update({
        cartao_bp: update.cartao_bp || null,
        cartao_repsol: update.cartao_repsol || null,
        cartao_edp: update.cartao_edp || null
      })
      .ilike('nome', `${update.nome}%`);

    if (error) {
      console.error(`Erro ao actualizar ${update.nome}:`, error);
      errorCount++;
    } else {
      successCount++;
      if (successCount % 20 === 0) console.log(`Progresso: ${successCount} processados...`);
    }
  }

  console.log(`Finalizado! Sucesso: ${successCount}, Erros: ${errorCount}`);
}

runUpdates();
