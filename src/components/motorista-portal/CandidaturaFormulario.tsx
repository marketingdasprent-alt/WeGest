import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { LogOut, Car, CheckCircle2 } from 'lucide-react';
import { Candidatura } from '@/pages/motorista/PainelMotorista';
import { buildValidationErrors, traduzirErro, type CandidaturaCampos } from '@/utils/candidatura';
import {
  DadosPessoaisSection,
  CartaConducaoSection,
  DocumentosSection,
  SubmissaoSection,
} from './candidatura/sections';

interface CandidaturaFormularioProps {
  candidatura: Candidatura | null;
  onUpdate: () => void;
}

export const CandidaturaFormulario: React.FC<CandidaturaFormularioProps> = ({
  candidatura,
  onUpdate,
}) => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const setFieldError = (field: string, msg: string) =>
    setFieldErrors((prev) => ({ ...prev, [field]: msg }));
  const clearFieldError = (field: string) =>
    setFieldErrors((prev) => {
      const n = { ...prev };
      delete n[field];
      return n;
    });

  const metadataNome = typeof user?.user_metadata?.nome === 'string' ? user.user_metadata.nome : '';
  const metadataTelefone =
    typeof user?.user_metadata?.telefone === 'string' ? user.user_metadata.telefone : '';

  // Dados pessoais
  const [nome, setNome] = useState(candidatura?.nome || metadataNome || '');
  const [email, setEmail] = useState(candidatura?.email || user?.email || '');
  const [telefone, setTelefone] = useState(candidatura?.telefone || metadataTelefone || '');
  const [nif, setNif] = useState(candidatura?.nif || '');
  const [morada, setMorada] = useState(candidatura?.morada || '');
  const [codigoPostal, setCodigoPostal] = useState(candidatura?.codigo_postal || '');
  const [cidade, setCidade] = useState(candidatura?.cidade || '');
  const [observacoes, setObservacoes] = useState(candidatura?.observacoes || '');

  // Documento de identificação
  const [documentoTipo, setDocumentoTipo] = useState(candidatura?.documento_tipo || '');
  const [documentoNumero, setDocumentoNumero] = useState(candidatura?.documento_numero || '');
  const [documentoValidade, setDocumentoValidade] = useState(candidatura?.documento_validade || '');
  const [documentoFicheiroUrl, setDocumentoFicheiroUrl] = useState(
    candidatura?.documento_ficheiro_url || ''
  );
  const [documentoIdentificacaoVersoUrl, setDocumentoIdentificacaoVersoUrl] = useState(
    candidatura?.documento_identificacao_verso_url || ''
  );

  // Carta de condução
  const [cartaConducao, setCartaConducao] = useState(candidatura?.carta_conducao || '');
  const [cartaCategorias, setCartaCategorias] = useState<string[]>(
    candidatura?.carta_categorias || []
  );
  const [cartaValidade, setCartaValidade] = useState(candidatura?.carta_validade || '');
  const [cartaFicheiroUrl, setCartaFicheiroUrl] = useState(candidatura?.carta_ficheiro_url || '');
  const [cartaConducaoVersoUrl, setCartaConducaoVersoUrl] = useState(
    candidatura?.carta_conducao_verso_url || ''
  );

  // Licença TVDE
  const [licencaTvdeNumero, setLicencaTvdeNumero] = useState(
    candidatura?.licenca_tvde_numero || ''
  );
  const [licencaTvdeValidade, setLicencaTvdeValidade] = useState(
    candidatura?.licenca_tvde_validade || ''
  );
  const [licencaTvdeFicheiroUrl, setLicencaTvdeFicheiroUrl] = useState(
    candidatura?.licenca_tvde_ficheiro_url || ''
  );

  // Documentos adicionais
  const [registoCriminalUrl, setRegistoCriminalUrl] = useState(
    candidatura?.registo_criminal_url || ''
  );
  const [comprovativoMoradaUrl, setComprovativoMoradaUrl] = useState(
    candidatura?.comprovativo_morada_url || ''
  );
  const [iban, setIban] = useState(candidatura?.iban || '');
  const [comprovativoIbanUrl, setComprovativoIbanUrl] = useState(
    candidatura?.comprovativo_iban_url || ''
  );

  const draftKey = user ? `candidatura_rascunho_${user.id}` : null;
  const hydratedRef = useRef(false);

  const currentDraftFields = () => ({
    nome,
    email,
    telefone,
    nif,
    morada,
    codigo_postal: codigoPostal,
    cidade,
    documento_tipo: documentoTipo,
    documento_numero: documentoNumero,
    documento_validade: documentoValidade,
    documento_ficheiro_url: documentoFicheiroUrl,
    documento_identificacao_verso_url: documentoIdentificacaoVersoUrl,
    carta_conducao: cartaConducao,
    carta_categorias: cartaCategorias,
    carta_validade: cartaValidade,
    carta_ficheiro_url: cartaFicheiroUrl,
    carta_conducao_verso_url: cartaConducaoVersoUrl,
    licenca_tvde_numero: licencaTvdeNumero,
    licenca_tvde_validade: licencaTvdeValidade,
    licenca_tvde_ficheiro_url: licencaTvdeFicheiroUrl,
    registo_criminal_url: registoCriminalUrl,
    comprovativo_morada_url: comprovativoMoradaUrl,
    iban,
    comprovativo_iban_url: comprovativoIbanUrl,
  });

  // Sincronizar com candidatura da BD
  useEffect(() => {
    setNome(candidatura?.nome || metadataNome || '');
    setEmail(candidatura?.email || user?.email || '');
    setTelefone(candidatura?.telefone || metadataTelefone || '');
    setNif(candidatura?.nif || '');
    setMorada(candidatura?.morada || '');
    setCodigoPostal(candidatura?.codigo_postal || '');
    setCidade(candidatura?.cidade || '');
    setDocumentoTipo(candidatura?.documento_tipo || '');
    setDocumentoNumero(candidatura?.documento_numero || '');
    setDocumentoValidade(candidatura?.documento_validade || '');
    setDocumentoFicheiroUrl(
      candidatura?.documento_frente_url || candidatura?.documento_ficheiro_url || ''
    );
    setDocumentoIdentificacaoVersoUrl(candidatura?.documento_identificacao_verso_url || '');
    setCartaConducao(candidatura?.carta_conducao || '');
    setCartaCategorias(candidatura?.carta_categorias || []);
    setCartaValidade(candidatura?.carta_validade || '');
    setCartaFicheiroUrl(candidatura?.carta_frente_url || candidatura?.carta_ficheiro_url || '');
    setCartaConducaoVersoUrl(candidatura?.carta_conducao_verso_url || '');
    setLicencaTvdeNumero(candidatura?.licenca_tvde_numero || '');
    setLicencaTvdeValidade(candidatura?.licenca_tvde_validade || '');
    setLicencaTvdeFicheiroUrl(candidatura?.licenca_tvde_ficheiro_url || '');
    setRegistoCriminalUrl(candidatura?.registo_criminal_url || '');
    setComprovativoMoradaUrl(candidatura?.comprovativo_morada_url || '');
    setIban(candidatura?.iban || '');
    setComprovativoIbanUrl(candidatura?.comprovativo_iban_url || '');
  }, [candidatura, metadataNome, metadataTelefone, user?.email]);

  // Restaurar rascunho local
  useEffect(() => {
    if (hydratedRef.current || !draftKey) return;
    hydratedRef.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      const draftTime = draft?._savedAt ? Date.parse(draft._savedAt) : 0;
      const dbTime = candidatura?.updated_at ? Date.parse(candidatura.updated_at) : 0;
      if (draftTime <= dbTime) return;
      const { _savedAt: _ignored, ...draftFields } = draft;
      if (JSON.stringify(draftFields) === JSON.stringify(currentDraftFields())) return;
      if (typeof draft.nome === 'string') setNome(draft.nome);
      if (typeof draft.email === 'string') setEmail(draft.email);
      if (typeof draft.telefone === 'string') setTelefone(draft.telefone);
      if (typeof draft.nif === 'string') setNif(draft.nif);
      if (typeof draft.morada === 'string') setMorada(draft.morada);
      if (typeof draft.codigo_postal === 'string') setCodigoPostal(draft.codigo_postal);
      if (typeof draft.cidade === 'string') setCidade(draft.cidade);
      if (typeof draft.documento_tipo === 'string') setDocumentoTipo(draft.documento_tipo);
      if (typeof draft.documento_numero === 'string') setDocumentoNumero(draft.documento_numero);
      if (typeof draft.documento_validade === 'string')
        setDocumentoValidade(draft.documento_validade);
      if (typeof draft.documento_ficheiro_url === 'string')
        setDocumentoFicheiroUrl(draft.documento_ficheiro_url);
      if (typeof draft.documento_identificacao_verso_url === 'string')
        setDocumentoIdentificacaoVersoUrl(draft.documento_identificacao_verso_url);
      if (typeof draft.carta_conducao === 'string') setCartaConducao(draft.carta_conducao);
      if (Array.isArray(draft.carta_categorias)) setCartaCategorias(draft.carta_categorias);
      if (typeof draft.carta_validade === 'string') setCartaValidade(draft.carta_validade);
      if (typeof draft.carta_ficheiro_url === 'string')
        setCartaFicheiroUrl(draft.carta_ficheiro_url);
      if (typeof draft.carta_conducao_verso_url === 'string')
        setCartaConducaoVersoUrl(draft.carta_conducao_verso_url);
      if (typeof draft.licenca_tvde_numero === 'string')
        setLicencaTvdeNumero(draft.licenca_tvde_numero);
      if (typeof draft.licenca_tvde_validade === 'string')
        setLicencaTvdeValidade(draft.licenca_tvde_validade);
      if (typeof draft.licenca_tvde_ficheiro_url === 'string')
        setLicencaTvdeFicheiroUrl(draft.licenca_tvde_ficheiro_url);
      if (typeof draft.registo_criminal_url === 'string')
        setRegistoCriminalUrl(draft.registo_criminal_url);
      if (typeof draft.comprovativo_morada_url === 'string')
        setComprovativoMoradaUrl(draft.comprovativo_morada_url);
      if (typeof draft.iban === 'string') setIban(draft.iban);
      if (typeof draft.comprovativo_iban_url === 'string')
        setComprovativoIbanUrl(draft.comprovativo_iban_url);
      toast({
        title: 'Rascunho recuperado',
        description: 'Recuperámos os dados que tinha preenchido neste dispositivo.',
      });
    } catch (e) {
      console.error('Erro ao restaurar rascunho local:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, candidatura, toast]);

  // Gravar rascunho automático no localStorage
  useEffect(() => {
    if (!hydratedRef.current || !draftKey) return;
    const fields = currentDraftFields();
    const serialized = JSON.stringify(fields);
    const existingRaw = localStorage.getItem(draftKey);
    if (existingRaw) {
      try {
        const { _savedAt: _ignored, ...existingFields } = JSON.parse(existingRaw);
        if (JSON.stringify(existingFields) === serialized) return;
      } catch {
        /* regrava */
      }
    }
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ ...fields, _savedAt: new Date().toISOString() })
      );
    } catch (e) {
      console.error('Erro ao guardar rascunho local:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftKey,
    nome,
    email,
    telefone,
    nif,
    morada,
    codigoPostal,
    cidade,
    documentoTipo,
    documentoNumero,
    documentoValidade,
    documentoFicheiroUrl,
    documentoIdentificacaoVersoUrl,
    cartaConducao,
    cartaCategorias,
    cartaValidade,
    cartaFicheiroUrl,
    cartaConducaoVersoUrl,
    licencaTvdeNumero,
    licencaTvdeValidade,
    licencaTvdeFicheiroUrl,
    registoCriminalUrl,
    comprovativoMoradaUrl,
    iban,
    comprovativoIbanUrl,
  ]);

  const saveUploadUrlToDb = async (column: string, url: string) => {
    if (!user || !candidatura) return;
    try {
      await supabase
        .from('motorista_candidaturas')
        .update({ [column]: url || null } as TablesUpdate<'motorista_candidaturas'>)
        .eq('id', candidatura.id);
      onUpdate();
    } catch (err) {
      console.error('Erro ao persistir URL do ficheiro na BD:', err);
    }
  };

  const clearLocalDraft = () => {
    if (draftKey)
      try {
        localStorage.removeItem(draftKey);
      } catch (e) {
        console.error('Erro ao limpar rascunho local:', e);
      }
  };

  const buildCandidaturaData = () => ({
    user_id: user!.id,
    nome,
    email,
    telefone: telefone || null,
    nif: nif || null,
    morada: morada || null,
    codigo_postal: codigoPostal || null,
    cidade: cidade || null,
    documento_tipo: documentoTipo || null,
    documento_numero: documentoNumero || null,
    documento_validade: documentoValidade || null,
    documento_ficheiro_url: documentoFicheiroUrl || null,
    documento_identificacao_verso_url: documentoIdentificacaoVersoUrl || null,
    carta_conducao: cartaConducao || null,
    carta_categorias: cartaCategorias.length > 0 ? cartaCategorias : null,
    carta_validade: cartaValidade || null,
    carta_ficheiro_url: cartaFicheiroUrl || null,
    carta_conducao_verso_url: cartaConducaoVersoUrl || null,
    licenca_tvde_numero: licencaTvdeNumero || null,
    licenca_tvde_validade: licencaTvdeValidade || null,
    licenca_tvde_ficheiro_url: licencaTvdeFicheiroUrl || null,
    registo_criminal_url: registoCriminalUrl || null,
    comprovativo_morada_url: comprovativoMoradaUrl || null,
    // Mesma normalização que a ficha do gestor (motoristaDialog.schema.ts):
    // sem espaços, maiúsculas — é assim que o validador e a BD esperam o IBAN.
    iban: iban ? iban.replace(/\s+/g, '').toUpperCase() : null,
    comprovativo_iban_url: comprovativoIbanUrl || null,
    observacoes: observacoes || null,
  });

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const data = buildCandidaturaData() as TablesInsert<'motorista_candidaturas'>;
      if (candidatura) {
        const { data: rows, error } = await supabase
          .from('motorista_candidaturas')
          .update(data)
          .eq('id', candidatura.id)
          .select('id');
        if (error) throw error;
        if (!rows || rows.length === 0) throw new Error('sem_permissao_guardar');
      } else {
        const { error } = await supabase
          .from('motorista_candidaturas')
          .insert({ ...data, status: 'rascunho' });
        if (error) throw error;
      }
      toast({ title: 'Guardado', description: 'Os seus dados foram guardados com sucesso.' });
      onUpdate();
    } catch (error: any) {
      console.error('Erro ao guardar:', error);
      toast({
        title: 'Erro',
        description: traduzirErro(error.message, 'Ocorreu um erro ao guardar.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const scrollToFirstError = () => {
    setTimeout(() => {
      document
        .querySelector('[data-field-error="true"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  const handleSubmit = async () => {
    const campos: CandidaturaCampos = {
      nome,
      email,
      telefone,
      nif,
      morada,
      cidade,
      codigoPostal,
      documentoTipo,
      documentoNumero,
      documentoValidade,
      documentoFicheiroUrl,
      documentoIdentificacaoVersoUrl,
      cartaConducao,
      cartaCategorias,
      cartaValidade,
      cartaFicheiroUrl,
      cartaConducaoVersoUrl,
      licencaTvdeNumero,
      licencaTvdeValidade,
      licencaTvdeFicheiroUrl,
      registoCriminalUrl,
      comprovativoMoradaUrl,
      iban,
      comprovativoIbanUrl,
    };
    const errors = buildValidationErrors(campos);
    setFieldErrors(errors);
    const problemas = Object.values(errors);
    if (problemas.length > 0) {
      const visiveis = problemas.slice(0, 6);
      toast({
        title:
          problemas.length === 1
            ? '1 ponto por corrigir antes de submeter'
            : `${problemas.length} pontos por corrigir antes de submeter`,
        description: (
          <div className="mt-1 space-y-1">
            <p>Corrija o seguinte (também assinalado a vermelho no formulário):</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {visiveis.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
              {problemas.length > visiveis.length && (
                <li>e mais {problemas.length - visiveis.length}…</li>
              )}
            </ul>
          </div>
        ),
        variant: 'destructive',
      });
      scrollToFirstError();
      return;
    }
    setSubmitting(true);
    try {
      const data = {
        ...buildCandidaturaData(),
        status: 'submetido',
        data_submissao: new Date().toISOString(),
      } as TablesInsert<'motorista_candidaturas'>;
      if (candidatura) {
        const { data: rows, error } = await supabase
          .from('motorista_candidaturas')
          .update(data)
          .eq('id', candidatura.id)
          .select('id');
        if (error) throw error;
        if (!rows || rows.length === 0) throw new Error('sem_permissao_guardar');
      } else {
        const { error } = await supabase.from('motorista_candidaturas').insert(data);
        if (error) throw error;
      }
      clearLocalDraft();
      toast({
        title: 'Candidatura Submetida!',
        description: 'Os seus documentos serão analisados pela nossa equipa.',
      });
      onUpdate();
    } catch (error: any) {
      console.error('Erro ao submeter:', error);
      toast({
        title: 'Erro',
        description: traduzirErro(error.message, 'Ocorreu um erro ao submeter a candidatura.'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const completionPercentage = () => {
    const fields = [
      nome,
      email,
      telefone,
      nif,
      morada,
      cidade,
      documentoTipo,
      documentoNumero,
      documentoValidade,
      documentoFicheiroUrl,
      documentoIdentificacaoVersoUrl,
      cartaConducao,
      cartaCategorias.length > 0,
      cartaValidade,
      cartaFicheiroUrl,
      cartaConducaoVersoUrl,
      licencaTvdeNumero,
      licencaTvdeValidade,
      licencaTvdeFicheiroUrl,
      registoCriminalUrl,
      comprovativoMoradaUrl,
      iban,
      comprovativoIbanUrl,
    ];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card/50 backdrop-blur border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Car className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">WeGest</h1>
              <p className="text-sm text-muted-foreground">Candidatura de Motorista</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-foreground">{nome || user?.email}</p>
              <p className="text-xs text-muted-foreground">{completionPercentage()}% completo</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => signOut()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${completionPercentage()}%` }}
          />
        </div>
      </div>

      {/* Form Sections */}
      <div className="max-w-4xl mx-auto px-4 pb-8 space-y-6">
        <p className="text-xs text-muted-foreground">
          <span className="text-red-500 font-semibold">*</span> Campos obrigatórios
        </p>

        <DadosPessoaisSection
          campos={{
            nome,
            email,
            telefone,
            nif,
            morada,
            cidade,
            codigoPostal,
            comprovativoMoradaUrl,
          }}
          setNome={setNome}
          setEmail={setEmail}
          setTelefone={setTelefone}
          setNif={setNif}
          setMorada={setMorada}
          setCidade={setCidade}
          setCodigoPostal={setCodigoPostal}
          setComprovativoMoradaUrl={setComprovativoMoradaUrl}
          fieldErrors={fieldErrors}
          setFieldError={setFieldError}
          clearFieldError={clearFieldError}
          onUploadToDb={saveUploadUrlToDb}
        />

        <CartaConducaoSection
          documentoTipo={documentoTipo}
          documentoNumero={documentoNumero}
          documentoValidade={documentoValidade}
          documentoFicheiroUrl={documentoFicheiroUrl}
          documentoIdentificacaoVersoUrl={documentoIdentificacaoVersoUrl}
          setDocumentoTipo={setDocumentoTipo}
          setDocumentoNumero={setDocumentoNumero}
          setDocumentoValidade={setDocumentoValidade}
          setDocumentoFicheiroUrl={setDocumentoFicheiroUrl}
          setDocumentoIdentificacaoVersoUrl={setDocumentoIdentificacaoVersoUrl}
          cartaConducao={cartaConducao}
          cartaCategorias={cartaCategorias}
          cartaValidade={cartaValidade}
          cartaFicheiroUrl={cartaFicheiroUrl}
          cartaConducaoVersoUrl={cartaConducaoVersoUrl}
          setCartaConducao={setCartaConducao}
          setCartaCategorias={setCartaCategorias}
          setCartaValidade={setCartaValidade}
          setCartaFicheiroUrl={setCartaFicheiroUrl}
          setCartaConducaoVersoUrl={setCartaConducaoVersoUrl}
          fieldErrors={fieldErrors}
          setFieldError={setFieldError}
          clearFieldError={clearFieldError}
          onUploadToDb={saveUploadUrlToDb}
        />

        <DocumentosSection
          licencaTvdeNumero={licencaTvdeNumero}
          licencaTvdeValidade={licencaTvdeValidade}
          licencaTvdeFicheiroUrl={licencaTvdeFicheiroUrl}
          setLicencaTvdeNumero={setLicencaTvdeNumero}
          setLicencaTvdeValidade={setLicencaTvdeValidade}
          setLicencaTvdeFicheiroUrl={setLicencaTvdeFicheiroUrl}
          registoCriminalUrl={registoCriminalUrl}
          iban={iban}
          comprovativoIbanUrl={comprovativoIbanUrl}
          setRegistoCriminalUrl={setRegistoCriminalUrl}
          setIban={setIban}
          setComprovativoIbanUrl={setComprovativoIbanUrl}
          fieldErrors={fieldErrors}
          clearFieldError={clearFieldError}
          onUploadToDb={saveUploadUrlToDb}
        />

        <SubmissaoSection
          observacoes={observacoes}
          setObservacoes={setObservacoes}
          saving={saving}
          submitting={submitting}
          onSave={handleSave}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
};
