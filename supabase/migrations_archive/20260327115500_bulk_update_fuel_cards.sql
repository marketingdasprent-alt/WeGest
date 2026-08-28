-- Atualização em massa dos cartões frota dos motoristas
-- Gerado a partir da lista fornecida em 27/03/2026

DO $$ 
BEGIN
  -- Abel Cardas
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 1529' WHERE nome ILIKE 'Abel Cardas%';
  -- Adair Pinheiro
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 28925', cartao_repsol = 'REPSOL DA 1040' WHERE nome ILIKE 'Adair Pinheiro%';
  -- Ahmed Gaceb
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 0039' WHERE nome ILIKE 'Ahmed Gaceb%';
  -- Alex Sandro
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 1107' WHERE nome ILIKE 'Alex Sandro%';
  -- Alexandre Moura
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 1938' WHERE nome ILIKE 'Alexandre Moura%';
  -- Alysson Caldeira
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 0638' WHERE nome ILIKE 'Alysson Caldeira%';
  -- Amadeu Souto
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30240' WHERE nome ILIKE 'Amadeu Souto%';
  -- Ana Alfaiate
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 450' WHERE nome ILIKE 'Ana Alfaiate%';
  -- Ana Aurelio
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30262' WHERE nome ILIKE 'Ana Aurelio%';
  -- André Bojaca Lopes
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 1375' WHERE nome ILIKE 'André Bojaca Lopes%';
  -- Andre Nascimento
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 0018' WHERE nome ILIKE 'Andre Nascimento%';
  -- Andre Rocha
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 28937' WHERE nome ILIKE 'Andre Rocha%';
  -- Angela Souza
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30270' WHERE nome ILIKE 'Angela Souza%';
  -- Antonio Batista
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 0794' WHERE nome ILIKE 'Antonio Batista%';
  -- Antonio Fernandes
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30230' WHERE nome ILIKE 'Antonio Fernandes%';
  -- Antonio Ribeiro
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30271' WHERE nome ILIKE 'Antonio Ribeiro%';
  -- Antonio Vieira
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DO 0250' WHERE nome ILIKE 'Antonio Vieira%';
  -- Arivelton Oliveira
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 0497 / REPSOL DO 0359' WHERE nome ILIKE 'Arivelton Oliveira%';
  -- Aymen Mhamdi
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 1136' WHERE nome ILIKE 'Aymen Mhamdi%';
  -- Belito Julio
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 0273' WHERE nome ILIKE 'Belito Julio%';
  -- Carla Cristiane Marques
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30244' WHERE nome ILIKE 'Carla Cristiane Marques%';
  -- Carlos Serra
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 1953' WHERE nome ILIKE 'Carlos Serra%';
  -- Catia Coelho
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 27234' WHERE nome ILIKE 'Catia Coelho%';
  -- Cesar Sousa
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30257' WHERE nome ILIKE 'Cesar Sousa%';
  -- Cezar Tome
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 0398' WHERE nome ILIKE 'Cezar Tome%';
  -- Claudio Henriques
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 0563' WHERE nome ILIKE 'Claudio Henriques%';
  -- Deepak Kumar
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30237', cartao_bp = 'BP DA 1763' WHERE nome ILIKE 'Deepak Kumar%';
  -- Dídimo Fernandes
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 0026' WHERE nome ILIKE 'Dídimo Fernandes%';
  -- Douglas Oliveira
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30256' WHERE nome ILIKE 'Douglas Oliveira%';
  -- Eduardo Pedro Ramos
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DO 0292' WHERE nome ILIKE 'Eduardo Pedro Ramos%';
  -- Eduardo Tendim Ramos
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 28905' WHERE nome ILIKE 'Eduardo Tendim Ramos%';
  -- Eli Cavassas
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 1412' WHERE nome ILIKE 'Eli Cavassas%';
  -- Elias Araujo
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DO 1081' WHERE nome ILIKE 'Elias Araujo%';
  -- Eligiane Bruna
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 1813' WHERE nome ILIKE 'Eligiane Bruna%';
  -- Elio Silva
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 28913 / EDP 30259' WHERE nome ILIKE 'Elio Silva%';
  -- Emanuel Rosa
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 27241' WHERE nome ILIKE 'Emanuel Rosa%';
  -- Emerson Diniz
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 1206' WHERE nome ILIKE 'Emerson Diniz%';
  -- Emerson Pinto
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DO 0391' WHERE nome ILIKE 'Emerson Pinto%';
  -- Fabiano Scolari
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30264' WHERE nome ILIKE 'Fabiano Scolari%';
  -- Fabio Bernardo
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 0752' WHERE nome ILIKE 'Fabio Bernardo%';
  -- Fábio Magnavita
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP 526', cartao_repsol = 'REPSOL 0034' WHERE nome ILIKE 'Fábio Magnavita%';
  -- Fabio Santos
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30238' WHERE nome ILIKE 'Fabio Santos%';
  -- Fabrício Soares
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 484' WHERE nome ILIKE 'Fabrício Soares%';
  -- Fagner Amorim
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 1243', cartao_repsol = 'REPSOL DA 1016' WHERE nome ILIKE 'Fagner Amorim%';
  -- Fernando Pereira
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 0927 / REPSOL DO 0235' WHERE nome ILIKE 'Fernando Pereira%';
  -- Filipa Aniceto
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 1821' WHERE nome ILIKE 'Filipa Aniceto%';
  -- Filipe Ferreira
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 0641' WHERE nome ILIKE 'Filipe Ferreira%';
  -- Francione Souza
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 1214 / REPSOL DO 0466' WHERE nome ILIKE 'Francione Souza%';
  -- Frederico Cardoso
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 1099' WHERE nome ILIKE 'Frederico Cardoso%';
  -- Gerson Lebre
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 1065' WHERE nome ILIKE 'Gerson Lebre%';
  -- Gil Gonçalves
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30260' WHERE nome ILIKE 'Gil Gonçalves%';
  -- Glenys Patino
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP 1789' WHERE nome ILIKE 'Glenys Patino%';
  -- Gonçalo Caldas
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30299' WHERE nome ILIKE 'Gonçalo Caldas%';
  -- Higino Caimbambo
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 1888', cartao_repsol = 'REPSOL DO 0185' WHERE nome ILIKE 'Higino Caimbambo%';
  -- Isevane Silva
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 1156' WHERE nome ILIKE 'Isevane Silva%';
  -- Jaime Ferreira
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 28920' WHERE nome ILIKE 'Jaime Ferreira%';
  -- Jeniffer Silva
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 0427', cartao_edp = 'EDPM 30237' WHERE nome ILIKE 'Jeniffer Silva%';
  -- João Correia
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 1722' WHERE nome ILIKE 'João Correia%';
  -- João Varela
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30235' WHERE nome ILIKE 'João Varela%';
  -- Joaquim Coelho
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 27262' WHERE nome ILIKE 'Joaquim Coelho%';
  -- Joaquim Rosa
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 1243' WHERE nome ILIKE 'Joaquim Rosa%';
  -- Jorge Conceição
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 28933' WHERE nome ILIKE 'Jorge Conceição%';
  -- Jorge Detoni
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 28936' WHERE nome ILIKE 'Jorge Detoni%';
  -- José Braga
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DO 0227' WHERE nome ILIKE 'José Braga%';
  -- Jose Carlos Silva
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 849' WHERE nome ILIKE 'Jose Carlos Silva%';
  -- José Junior
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 28930' WHERE nome ILIKE 'José Junior%';
  -- José Pacheco
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 27267' WHERE nome ILIKE 'José Pacheco%';
  -- Jose Ramalho Carvalho
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DO 0021' WHERE nome ILIKE 'Jose Ramalho Carvalho%';
  -- Jose Reis Cabeças
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 0409' WHERE nome ILIKE 'Jose Reis Cabeças%';
  -- Josué Jesus
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 1255' WHERE nome ILIKE 'Josué Jesus%';
  -- Juliana Severino
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30273' WHERE nome ILIKE 'Juliana Severino%';
  -- Kamoli Adedoyn
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL SA 1446' WHERE nome ILIKE 'Kamoli Adedoyn%';
  -- Karla Pacheco
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30237' WHERE nome ILIKE 'Karla Pacheco%';
  -- Leandro Reis
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 1313' WHERE nome ILIKE 'Leandro Reis%';
  -- Luciano Andrade
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 0711' WHERE nome ILIKE 'Luciano Andrade%';
  -- Luis Felicidade
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 0042' WHERE nome ILIKE 'Luis Felicidade%';
  -- Luis Pineza
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30255' WHERE nome ILIKE 'Luis Pineza%';
  -- Luiz Candeo
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30258' WHERE nome ILIKE 'Luiz Candeo%';
  -- Manuel Domingos
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 1862' WHERE nome ILIKE 'Manuel Domingos%';
  -- Manuel Pedroso
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 1230', cartao_edp = 'EDP 27273' WHERE nome ILIKE 'Manuel Pedroso%';
  -- Marcelo Jaques
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30276' WHERE nome ILIKE 'Marcelo Jaques%';
  -- Marcio Jesus
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 28905' WHERE nome ILIKE 'Marcio Jesus%';
  -- Marco Reis
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 28906' WHERE nome ILIKE 'Marco Reis%';
  -- Marcos Nunes
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 1131' WHERE nome ILIKE 'Marcos Nunes%';
  -- Marcus Moraes
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 690' WHERE nome ILIKE 'Marcus Moraes%';
  -- Maria Luisa Aço
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 138' WHERE nome ILIKE 'Maria Luisa Aço%';
  -- Marivalda Roza
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DO 0136' WHERE nome ILIKE 'Marivalda Roza%';
  -- Marlone Melo
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 1172' WHERE nome ILIKE 'Marlone Melo%';
  -- Mateus Aragão
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 28910' WHERE nome ILIKE 'Mateus Aragão%';
  -- Mauricio Lopes
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 1404' WHERE nome ILIKE 'Mauricio Lopes%';
  -- Mauro Pinto
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DO 0060' WHERE nome ILIKE 'Mauro Pinto%';
  -- Mehrshad Ghafoorin
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 1164' WHERE nome ILIKE 'Mehrshad Ghafoorin%';
  -- Michelle Santos
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 0435' WHERE nome ILIKE 'Michelle Santos%';
  -- Miguel Maia
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP 559' WHERE nome ILIKE 'Miguel Maia%';
  -- Milton Furtado
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 27264' WHERE nome ILIKE 'Milton Furtado%';
  -- Nadila Silva
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 070', cartao_edp = 'EDP 30267' WHERE nome ILIKE 'Nadila Silva%';
  -- Nathalie Ferro
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 0963' WHERE nome ILIKE 'Nathalie Ferro%';
  -- Neeraj Prinja
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 0773' WHERE nome ILIKE 'Neeraj Prinja%';
  -- Nelson marques
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 542' WHERE nome ILIKE 'Nelson marques%';
  -- Nozha Dardourl
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 0703' WHERE nome ILIKE 'Nozha Dardourl%';
  -- Nuno Costa
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 27241' WHERE nome ILIKE 'Nuno Costa%';
  -- Nuno Viveiros
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 27266' WHERE nome ILIKE 'Nuno Viveiros%';
  -- Patrick Figueiredo
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30275' WHERE nome ILIKE 'Patrick Figueiredo%';
  -- Paula Rodriguez
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 1904' WHERE nome ILIKE 'Paula Rodriguez%';
  -- Paulo Amado Silva
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 278' WHERE nome ILIKE 'Paulo Amado Silva%';
  -- Paulo Antunes
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 1529' WHERE nome ILIKE 'Paulo Antunes%';
  -- Paulo Azenha
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 1854' WHERE nome ILIKE 'Paulo Azenha%';
  -- Paulo Ferreira
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30252', cartao_bp = 'BP DA 1680' WHERE nome ILIKE 'Paulo Ferreira%';
  -- Paulo Patricio
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 0505' WHERE nome ILIKE 'Paulo Patricio%';
  -- Paulo Perneta
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 30281' WHERE nome ILIKE 'Paulo Perneta%';
  -- Paulo Silva
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP30242' WHERE nome ILIKE 'Paulo Silva%';
  -- Pedro Martins
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP 1714' WHERE nome ILIKE 'Pedro Martins%';
  -- Pedro Rebelo
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 27242' WHERE nome ILIKE 'Pedro Rebelo%';
  -- Pedro Rego
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 27243' WHERE nome ILIKE 'Pedro Rego%';
  -- Radhwen Garbi
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 1032' WHERE nome ILIKE 'Radhwen Garbi%';
  -- Rajwinder Singh
  UPDATE public.motoristas_ativos SET cartao_bp = 'bp da 1698' WHERE nome ILIKE 'Rajwinder Singh%';
  -- Ricardo Monteiro
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 1292' WHERE nome ILIKE 'Ricardo Monteiro%';
  -- Roberto Benigno
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DO 0011' WHERE nome ILIKE 'Roberto Benigno%';
  -- Roberto Rocha
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 27240' WHERE nome ILIKE 'Roberto Rocha%';
  -- Roberto Silva
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 0177' WHERE nome ILIKE 'Roberto Silva%';
  -- Robin Singh
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DO 0243' WHERE nome ILIKE 'Robin Singh%';
  -- Rodrigo Muniz
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 28922' WHERE nome ILIKE 'Rodrigo Muniz%';
  -- Ruben Roda
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 1289' WHERE nome ILIKE 'Ruben Roda%';
  -- Ruben Soares
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 1474' WHERE nome ILIKE 'Ruben Soares%';
  -- Rui Ponte
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 28904' WHERE nome ILIKE 'Rui Ponte%';
  -- Sachin Sharma
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DO 0425' WHERE nome ILIKE 'Sachin Sharma%';
  -- Saker Zoghlami
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DO 0433' WHERE nome ILIKE 'Saker Zoghlami%';
  -- Samantha Morais
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 0836' WHERE nome ILIKE 'Samantha Morais%';
  -- Sandra Correia
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 1284' WHERE nome ILIKE 'Sandra Correia%';
  -- Sandra Noemia
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 28939' WHERE nome ILIKE 'Sandra Noemia%';
  -- Saqib Chaudhary
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DO 0219' WHERE nome ILIKE 'Saqib Chaudhary%';
  -- Silmara Silva
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 0315' WHERE nome ILIKE 'Silmara Silva%';
  -- Tania Lopes
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL 0128' WHERE nome ILIKE 'Tania Lopes%';
  -- Thiago Almeida
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 0901' WHERE nome ILIKE 'Thiago Almeida%';
  -- Thiago Nascimento
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 1300' WHERE nome ILIKE 'Thiago Nascimento%';
  -- Tiago Filipe Ferraz
  UPDATE public.motoristas_ativos SET cartao_bp = 'BP DA 1748' WHERE nome ILIKE 'Tiago Filipe Ferraz%';
  -- Tulio Miranda
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DO 0013' WHERE nome ILIKE 'Tulio Miranda%';
  -- Vladmir Chipapa
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 28932' WHERE nome ILIKE 'Vladmir Chipapa%';
  -- Wael Al Muhunna
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 0331' WHERE nome ILIKE 'Wael Al Muhunna%';
  -- Waqar Ahmed
  UPDATE public.motoristas_ativos SET cartao_repsol = 'REPSOL DA 0919' WHERE nome ILIKE 'Waqar Ahmed%';
  -- Yuri Silva
  UPDATE public.motoristas_ativos SET cartao_edp = 'EDP 27239' WHERE nome ILIKE 'Yuri Silva%';

END $$;
