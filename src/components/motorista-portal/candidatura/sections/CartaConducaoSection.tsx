import React from 'react';
import { Car, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DocumentUploader } from '@/components/motorista-portal/DocumentUploader';
import { validarNumeroDocumento, validarCartaConducao } from '@/lib/pt-validators';
import { CATEGORIAS_CARTA, TIPOS_DOCUMENTO } from '@/utils/candidatura';

interface CartaConducaoSectionProps {
  // Documento de Identificação
  documentoTipo: string;
  documentoNumero: string;
  documentoValidade: string;
  documentoFicheiroUrl: string;
  documentoIdentificacaoVersoUrl: string;
  setDocumentoTipo: (v: string) => void;
  setDocumentoNumero: (v: string) => void;
  setDocumentoValidade: (v: string) => void;
  setDocumentoFicheiroUrl: (v: string) => void;
  setDocumentoIdentificacaoVersoUrl: (v: string) => void;
  // Carta de Condução
  cartaConducao: string;
  cartaCategorias: string[];
  cartaValidade: string;
  cartaFicheiroUrl: string;
  cartaConducaoVersoUrl: string;
  setCartaConducao: (v: string) => void;
  setCartaCategorias: (v: string[]) => void;
  setCartaValidade: (v: string) => void;
  setCartaFicheiroUrl: (v: string) => void;
  setCartaConducaoVersoUrl: (v: string) => void;
  fieldErrors: Record<string, string>;
  setFieldError: (field: string, msg: string) => void;
  clearFieldError: (field: string) => void;
  onUploadToDb: (column: string, url: string) => void;
}

export const CartaConducaoSection: React.FC<CartaConducaoSectionProps> = ({
  documentoTipo,
  documentoNumero,
  documentoValidade,
  documentoFicheiroUrl,
  documentoIdentificacaoVersoUrl,
  setDocumentoTipo,
  setDocumentoNumero,
  setDocumentoValidade,
  setDocumentoFicheiroUrl,
  setDocumentoIdentificacaoVersoUrl,
  cartaConducao,
  cartaCategorias,
  cartaValidade,
  cartaFicheiroUrl,
  cartaConducaoVersoUrl,
  setCartaConducao,
  setCartaCategorias,
  setCartaValidade,
  setCartaFicheiroUrl,
  setCartaConducaoVersoUrl,
  fieldErrors,
  setFieldError,
  clearFieldError,
  onUploadToDb,
}) => {
  const renderError = (field: string) =>
    fieldErrors[field] ? (
      <p data-field-error="true" className="flex items-start gap-1 text-xs text-destructive">
        <span aria-hidden="true">⚠</span>
        <span>{fieldErrors[field]}</span>
      </p>
    ) : null;

  const handleCategoriaToggle = (categoria: string) => {
    clearFieldError('cartaCategorias');
    setCartaCategorias(
      cartaCategorias.includes(categoria)
        ? cartaCategorias.filter((c) => c !== categoria)
        : [...cartaCategorias, categoria]
    );
  };

  return (
    <>
      {/* Documento de Identificação */}
      <Card className="border-border overflow-hidden">
        <CardHeader className="bg-blue-50/50 dark:bg-blue-900/20 pb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-lg">Documento de Identificação</CardTitle>
          </div>
          <CardDescription>CC, Título de Residência ou outro documento válido</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>
              Tipo de Documento <span className="text-red-500">*</span>
            </Label>
            <Select
              value={documentoTipo}
              onValueChange={(v) => {
                setDocumentoTipo(v);
                clearFieldError('documentoTipo');
                clearFieldError('documentoNumero');
              }}
            >
              <SelectTrigger className={fieldErrors.documentoTipo ? 'border-destructive' : ''}>
                <SelectValue placeholder="Selecionar tipo" />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_DOCUMENTO.map((tipo) => (
                  <SelectItem key={tipo.value} value={tipo.value}>
                    {tipo.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {renderError('documentoTipo')}
          </div>
          <div className="space-y-2">
            <Label htmlFor="documentoNumero">
              Número do Documento <span className="text-red-500">*</span>
            </Label>
            <Input
              id="documentoNumero"
              value={documentoNumero}
              onChange={(e) => {
                setDocumentoNumero(e.target.value.toUpperCase());
                clearFieldError('documentoNumero');
              }}
              onBlur={() => {
                if (documentoNumero.trim() && documentoTipo) {
                  const r = validarNumeroDocumento(documentoTipo, documentoNumero);
                  if (!r.valid) setFieldError('documentoNumero', r.message!);
                  else clearFieldError('documentoNumero');
                }
              }}
              placeholder="Nº do documento"
              aria-invalid={!!fieldErrors.documentoNumero}
              className={fieldErrors.documentoNumero ? 'border-destructive' : ''}
            />
            {renderError('documentoNumero')}
          </div>
          <div className="space-y-2">
            <Label htmlFor="documentoValidade">
              Data de Validade <span className="text-red-500">*</span>
            </Label>
            <Input
              id="documentoValidade"
              type="date"
              value={documentoValidade}
              onChange={(e) => {
                setDocumentoValidade(e.target.value);
                clearFieldError('documentoValidade');
              }}
              aria-invalid={!!fieldErrors.documentoValidade}
              className={fieldErrors.documentoValidade ? 'border-destructive' : ''}
            />
            {renderError('documentoValidade')}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>
              Documento de Identificação <span className="text-red-500">*</span>
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-xs text-muted-foreground block mb-1">Frente</span>
                <DocumentUploader
                  folder="documento-identificacao"
                  currentUrl={documentoFicheiroUrl}
                  onUpload={(url) => {
                    setDocumentoFicheiroUrl(url);
                    clearFieldError('documentoFicheiroUrl');
                    void onUploadToDb('documento_ficheiro_url', url);
                  }}
                  accept="application/pdf,image/jpeg,image/png"
                />
                {renderError('documentoFicheiroUrl')}
              </div>
              <div className="space-y-2">
                <span className="text-xs text-muted-foreground block mb-1">Verso</span>
                <DocumentUploader
                  folder="documento-identificacao"
                  currentUrl={documentoIdentificacaoVersoUrl}
                  onUpload={(url) => {
                    setDocumentoIdentificacaoVersoUrl(url);
                    clearFieldError('documentoIdentificacaoVersoUrl');
                    void onUploadToDb('documento_identificacao_verso_url', url);
                  }}
                  accept="application/pdf,image/jpeg,image/png"
                />
                {renderError('documentoIdentificacaoVersoUrl')}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Carta de Condução */}
      <Card className="border-border overflow-hidden">
        <CardHeader className="bg-primary/10 pb-4">
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Carta de Condução</CardTitle>
          </div>
          <CardDescription>Dados da sua carta de condução válida</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cartaConducao">
              Número da Carta <span className="text-red-500">*</span>
            </Label>
            <Input
              id="cartaConducao"
              value={cartaConducao}
              onChange={(e) => {
                setCartaConducao(e.target.value.toUpperCase());
                clearFieldError('cartaConducao');
              }}
              onBlur={() => {
                if (cartaConducao) {
                  const r = validarCartaConducao(cartaConducao);
                  if (!r.valid) setFieldError('cartaConducao', r.message!);
                }
              }}
              placeholder="Nº da carta de condução"
              className={fieldErrors.cartaConducao ? 'border-destructive' : ''}
            />
            {renderError('cartaConducao')}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cartaValidade">
              Data de Validade <span className="text-red-500">*</span>
            </Label>
            <Input
              id="cartaValidade"
              type="date"
              value={cartaValidade}
              onChange={(e) => {
                setCartaValidade(e.target.value);
                clearFieldError('cartaValidade');
              }}
              aria-invalid={!!fieldErrors.cartaValidade}
              className={fieldErrors.cartaValidade ? 'border-destructive' : ''}
            />
            {renderError('cartaValidade')}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>
              Categorias <span className="text-red-500">*</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIAS_CARTA.map((cat) => (
                <div key={cat} className="flex items-center space-x-2">
                  <Checkbox
                    id={`cat-${cat}`}
                    checked={cartaCategorias.includes(cat)}
                    onCheckedChange={() => handleCategoriaToggle(cat)}
                  />
                  <label
                    htmlFor={`cat-${cat}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-foreground"
                  >
                    {cat}
                  </label>
                </div>
              ))}
            </div>
            {renderError('cartaCategorias')}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>
              Upload da Carta de Condução <span className="text-red-500">*</span>
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-xs text-muted-foreground block mb-1">Frente</span>
                <DocumentUploader
                  folder="carta-conducao"
                  currentUrl={cartaFicheiroUrl}
                  onUpload={(url) => {
                    setCartaFicheiroUrl(url);
                    clearFieldError('cartaFicheiroUrl');
                    void onUploadToDb('carta_ficheiro_url', url);
                  }}
                  accept="application/pdf,image/jpeg,image/png"
                />
                {renderError('cartaFicheiroUrl')}
              </div>
              <div className="space-y-2">
                <span className="text-xs text-muted-foreground block mb-1">Verso</span>
                <DocumentUploader
                  folder="carta-conducao"
                  currentUrl={cartaConducaoVersoUrl}
                  onUpload={(url) => {
                    setCartaConducaoVersoUrl(url);
                    clearFieldError('cartaConducaoVersoUrl');
                    void onUploadToDb('carta_conducao_verso_url', url);
                  }}
                  accept="application/pdf,image/jpeg,image/png"
                />
                {renderError('cartaConducaoVersoUrl')}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
};
