import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import { FontFamily } from '@tiptap/extension-font-family';
import ImageResize from 'tiptap-extension-resize-image';
import { TableKit } from '@tiptap/extension-table';
import { Extension } from '@tiptap/core';
import { Button } from '@/components/ui/button';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Undo,
  Redo,
  Heading1,
  Heading2,
  Quote,
  Image as ImageIcon,
  Table as TableIcon,
  Columns3,
  Rows3,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Custom extension for font size
const FontSize = Extension.create({
  name: 'fontSize',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize.replace('px', ''),
            renderHTML: (attributes) => {
              if (!attributes.fontSize) {
                return {};
              }
              return {
                style: `font-size: ${attributes.fontSize}px`,
              };
            },
          },
        },
      },
    ];
  },
});

export interface RichTextEditorRef {
  insertContent: (content: string) => void;
  focus: () => void;
}

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
}

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  ({ content, onChange }, ref) => {
    const isInternalUpdate = useRef(false);
    const lastContent = useRef(content);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Validar tipo e tamanho
      if (!file.type.startsWith('image/')) {
        toast.error('Por favor, selecione um arquivo de imagem');
        return;
      }

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        toast.error('Imagem muito grande. Máximo: 5MB');
        return;
      }

      try {
        toast.loading('Fazendo upload da imagem...');

        // Upload para Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const { data, error } = await supabase.storage
          .from('document-templates')
          .upload(fileName, file);

        if (error) throw error;

        // Obter URL pública
        const {
          data: { publicUrl },
        } = supabase.storage.from('document-templates').getPublicUrl(fileName);

        // Inserir imagem no editor
        editor?.chain().focus().insertContent(`<img src="${publicUrl}" />`).run();

        toast.dismiss();
        toast.success('Imagem adicionada!');
      } catch (error) {
        console.error('Erro ao fazer upload:', error);
        toast.dismiss();
        toast.error('Erro ao fazer upload da imagem');
      }

      // Limpar input
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
    };

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          // Desabilitar underline do StarterKit para evitar duplicação
          // (estamos usando a extensão Underline separadamente)
          strike: {
            HTMLAttributes: {
              class: 'strike-through',
            },
          },
          // Configurar comportamento de quebra de linha
          hardBreak: {
            keepMarks: true, // Mantém formatação (bold, italic) após quebra manual
          },
          // Configurar parágrafo para não criar quebras automáticas em formatação inline
          paragraph: {
            HTMLAttributes: {
              class: 'editor-paragraph',
            },
          },
        }),
        Underline,
        ImageResize,
        TableKit.configure({
          table: { resizable: true, HTMLAttributes: { class: 'pdf-table' } },
        }),
        TextAlign.configure({
          types: ['heading', 'paragraph'],
        }),
        TextStyle,
        FontSize,
        Color,
        Highlight.configure({ multicolor: true }),
        FontFamily.configure({
          types: ['textStyle'],
        }),
      ],
      content,
      onUpdate: ({ editor }) => {
        isInternalUpdate.current = true;
        const newContent = editor.getHTML();

        // Só chamar onChange se o conteúdo realmente mudou
        if (newContent !== lastContent.current) {
          lastContent.current = newContent;
          onChange(newContent);
        }
      },
      editorProps: {
        attributes: {
          class: 'prose prose-sm focus:outline-none bg-white',
          style:
            'width: 210mm; min-height: 297mm; margin: 0 auto; padding: 30mm; box-shadow: 0 0 10px rgba(0,0,0,0.1);',
        },
        // Arrastar um campo dinâmico (chip) para o documento → insere o
        // placeholder na posição exacta onde foi largado.
        handleDrop: (view, event, _slice, moved) => {
          const campo = event.dataTransfer?.getData('application/x-campo-dinamico');
          if (!campo || moved) return false;
          const coords = { left: event.clientX, top: event.clientY };
          const pos = view.posAtCoords(coords);
          if (pos) {
            view.dispatch(view.state.tr.insertText(campo, pos.pos));
            view.focus();
          }
          event.preventDefault();
          return true;
        },
      },
    });

    // Expor métodos via ref
    useImperativeHandle(ref, () => ({
      insertContent: (content: string) => {
        if (editor) {
          editor.chain().focus().insertContent(content).run();
        }
      },
      focus: () => {
        if (editor) {
          editor.commands.focus();
        }
      },
    }));

    // Sync content when it changes externally (not from internal updates)
    useEffect(() => {
      if (!editor) return;

      // Só atualizar se o conteúdo mudou externamente E não foi uma atualização interna
      if (content !== lastContent.current && !isInternalUpdate.current) {
        const currentEditorHTML = editor.getHTML();

        // Comparação mais robusta: só atualizar se realmente diferente
        if (content !== currentEditorHTML) {
          editor.commands.setContent(content);
        }
      }

      // Resetar flags
      lastContent.current = content;
      isInternalUpdate.current = false;
    }, [content, editor]);

    if (!editor) {
      return null;
    }

    const setFontSize = (size: string) => {
      editor.chain().focus().setMark('textStyle', { fontSize: size }).run();
    };

    const setFontFamily = (family: string) => {
      editor.chain().focus().setFontFamily(family).run();
    };

    const ToolbarButton = ({
      onClick,
      isActive,
      children,
      title,
    }: {
      onClick: (e: React.MouseEvent) => void;
      isActive?: boolean;
      children: React.ReactNode;
      title: string;
    }) => (
      <Button
        type="button"
        variant={isActive ? 'secondary' : 'ghost'}
        size="sm"
        onMouseDown={(e) => {
          e.preventDefault();
          onClick(e);
        }}
        title={title}
        className="h-8 w-8 p-0 pointer-events-auto"
        tabIndex={-1}
      >
        {children}
      </Button>
    );

    return (
      <div className="border rounded-lg bg-gray-100">
        <div className="sticky top-0 z-10 border-b bg-muted/30 backdrop-blur-sm p-2 flex flex-wrap gap-1 shadow-sm">
          {/* Text Style */}
          <div className="flex gap-1 border-r pr-2">
            <ToolbarButton
              onClick={() => {
                editor.chain().focus().toggleBold().run();
              }}
              isActive={editor.isActive('bold')}
              title="Negrito"
            >
              <Bold className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                editor.chain().focus().toggleItalic().run();
              }}
              isActive={editor.isActive('italic')}
              title="Itálico"
            >
              <Italic className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                editor.chain().focus().toggleUnderline().run();
              }}
              isActive={editor.isActive('underline')}
              title="Sublinhado"
            >
              <UnderlineIcon className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                editor.chain().focus().toggleStrike().run();
              }}
              isActive={editor.isActive('strike')}
              title="Riscado"
            >
              <Strikethrough className="h-4 w-4" />
            </ToolbarButton>
          </div>

          {/* Headings */}
          <div className="flex gap-1 border-r pr-2">
            <ToolbarButton
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 1 }).run();
              }}
              isActive={editor.isActive('heading', { level: 1 })}
              title="Título 1"
            >
              <Heading1 className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 2 }).run();
              }}
              isActive={editor.isActive('heading', { level: 2 })}
              title="Título 2"
            >
              <Heading2 className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                editor.chain().focus().toggleBlockquote().run();
              }}
              isActive={editor.isActive('blockquote')}
              title="Citação"
            >
              <Quote className="h-4 w-4" />
            </ToolbarButton>
          </div>

          {/* Font Size */}
          <div className="border-r pr-2">
            <Select onValueChange={setFontSize}>
              <SelectTrigger className="h-8 w-[100px]">
                <SelectValue placeholder="Tamanho" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12px">12pt</SelectItem>
                <SelectItem value="14px">14pt</SelectItem>
                <SelectItem value="16px">16pt</SelectItem>
                <SelectItem value="18px">18pt</SelectItem>
                <SelectItem value="20px">20pt</SelectItem>
                <SelectItem value="24px">24pt</SelectItem>
                <SelectItem value="30px">30pt</SelectItem>
                <SelectItem value="36px">36pt</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Font Family */}
          <div className="border-r pr-2">
            <Select onValueChange={setFontFamily}>
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue placeholder="Fonte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Arial">Arial</SelectItem>
                <SelectItem value="Helvetica">Helvetica</SelectItem>
                <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                <SelectItem value="Courier New">Courier New</SelectItem>
                <SelectItem value="Georgia">Georgia</SelectItem>
                <SelectItem value="Verdana">Verdana</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Alignment */}
          <div className="flex gap-1 border-r pr-2">
            <ToolbarButton
              onClick={() => {
                editor.chain().focus().setTextAlign('left').run();
              }}
              isActive={editor.isActive({ textAlign: 'left' })}
              title="Alinhar à esquerda"
            >
              <AlignLeft className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                editor.chain().focus().setTextAlign('center').run();
              }}
              isActive={editor.isActive({ textAlign: 'center' })}
              title="Centralizar"
            >
              <AlignCenter className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                editor.chain().focus().setTextAlign('right').run();
              }}
              isActive={editor.isActive({ textAlign: 'right' })}
              title="Alinhar à direita"
            >
              <AlignRight className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                editor.chain().focus().setTextAlign('justify').run();
              }}
              isActive={editor.isActive({ textAlign: 'justify' })}
              title="Justificar"
            >
              <AlignJustify className="h-4 w-4" />
            </ToolbarButton>
          </div>

          {/* Lists */}
          <div className="flex gap-1 border-r pr-2">
            <ToolbarButton
              onClick={() => {
                editor.chain().focus().toggleBulletList().run();
              }}
              isActive={editor.isActive('bulletList')}
              title="Lista com marcadores"
            >
              <List className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                editor.chain().focus().toggleOrderedList().run();
              }}
              isActive={editor.isActive('orderedList')}
              title="Lista numerada"
            >
              <ListOrdered className="h-4 w-4" />
            </ToolbarButton>
          </div>

          {/* Image Upload */}
          <div className="flex gap-1 border-r pr-2">
            <input
              type="file"
              accept="image/*"
              ref={imageInputRef}
              className="hidden"
              onChange={handleImageUpload}
            />
            <ToolbarButton onClick={() => imageInputRef.current?.click()} title="Inserir imagem">
              <ImageIcon className="h-4 w-4" />
            </ToolbarButton>
          </div>

          {/* Tabelas (caixas / colunas) */}
          <div className="flex gap-1 border-r pr-2">
            <ToolbarButton
              onClick={() =>
                editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run()
              }
              title="Inserir tabela"
            >
              <TableIcon className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              title="Adicionar coluna"
            >
              <Columns3 className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().addRowAfter().run()}
              title="Adicionar linha"
            >
              <Rows3 className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().deleteTable().run()}
              title="Eliminar tabela"
            >
              <Trash2 className="h-4 w-4" />
            </ToolbarButton>
          </div>

          {/* Undo/Redo */}
          <div className="flex gap-1">
            <ToolbarButton
              onClick={() => {
                editor.chain().focus().undo().run();
              }}
              title="Desfazer"
            >
              <Undo className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                editor.chain().focus().redo().run();
              }}
              title="Refazer"
            >
              <Redo className="h-4 w-4" />
            </ToolbarButton>
          </div>
        </div>

        <div className="overflow-auto max-h-[calc(100vh-420px)] md:max-h-[calc(100vh-300px)] p-8">
          <EditorContent editor={editor} />
        </div>
      </div>
    );
  }
);

RichTextEditor.displayName = 'RichTextEditor';
