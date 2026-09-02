import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocation, useNavigate } from 'react-router-dom';
import { paletaDaMarca } from '@/lib/corDaMarca';

/** Marca de recurso: sem organização, mostra-se a WeGest. */
const LOGO_WEGEST = '/Logo.png';

interface OrganizacaoDaMarca {
  nome?: string;
  logo_url?: string | null;
  cor_primaria?: string | null;
}

const Obrigado = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // A marca vem de quem enviou para aqui (o formulário público). Um refresh
  // perde este estado — e nesse caso vale a regra de sempre: marca WeGest.
  // Esta página forçava preto, visto verde, texto amarelo e o rodapé da
  // DasPrent, independentemente da organização que angariou o lead.
  const organizacao = (location.state as { organizacao?: OrganizacaoDaMarca } | null)?.organizacao;
  const marca = paletaDaMarca(organizacao?.cor_primaria);

  const fadeInUp = {
    initial: { opacity: 0, y: 60 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: 'easeOut' },
  };

  return (
    <div className="min-h-screen bg-background" style={marca.variaveisCss}>
      <div className="min-h-screen flex items-center justify-center px-4">
        <motion.div
          className="text-center max-w-2xl mx-auto"
          initial="initial"
          animate="animate"
          variants={fadeInUp}
        >
          <img
            src={organizacao?.logo_url || LOGO_WEGEST}
            alt={organizacao?.logo_url ? `Logótipo de ${organizacao.nome ?? ''}`.trim() : 'WeGest'}
            className="h-16 mx-auto mb-10 object-contain"
          />

          <div className="mb-8">
            {/* O visto é o sinal de "correu bem" — verde é a leitura universal
                disso, e não uma cor de marca. Fica verde de propósito. */}
            <CheckCircle className="w-20 h-20 text-green-600 dark:text-green-500 mx-auto mb-6" />
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-6">
            Obrigado!
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground mb-8 leading-relaxed">
            A sua candidatura foi enviada com sucesso. A nossa equipa entrará em contacto consigo
            nas próximas 24 horas.
          </p>

          <div className="space-y-4">
            <p className="font-medium text-lg" style={{ color: marca.cor }}>
              ⚡ Seja bem-vindo à nossa equipa!
            </p>

            {/* O botão tinha texto branco sobre fundo claro — invisível. */}
            <Button
              onClick={() => navigate('/')}
              variant="outline"
              className="bg-transparent hover:bg-muted mt-8"
              style={{ borderColor: marca.corDeContorno, color: marca.cor }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao início
            </Button>
          </div>
        </motion.div>
      </div>

      <footer className="py-6 px-4 text-center">
        <p className="text-muted-foreground text-sm">
          © {new Date().getFullYear()} {organizacao?.nome ?? 'WeGest'}. Todos os direitos
          reservados.
        </p>
      </footer>
    </div>
  );
};

export default Obrigado;
