import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Users, Plus, Edit, Trash2 } from 'lucide-react';
import { DasprentNavigation } from '@/components/DasprentNavigation';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';

interface Funcionario {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cargo: string;
  departamento: string;
  data_admissao: string;
  ativo: boolean;
  created_at: string;
}

const DasprentFuncionarios = () => {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingFuncionario, setEditingFuncionario] = useState<Funcionario | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    cargo: '',
    departamento: '',
    data_admissao: '',
    ativo: true,
  });
  const [sortField, setSortField] = useState<string>('nome');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);
  const { toast } = useToast();

  useEffect(() => {
    fetchFuncionarios();
  }, []);

  const fetchFuncionarios = async () => {
    try {
      // Using any type to handle the current type issues
      const { data, error } = await (supabase as any)
        .from('funcionarios_dasprent')
        .select('*')
        .order('nome');

      if (error) throw error;
      setFuncionarios(data || []);
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Erro ao carregar funcionários: ' + error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingFuncionario) {
        // Using any type to handle the current type issues
        const { error } = await (supabase as any)
          .from('funcionarios_dasprent')
          .update(formData)
          .eq('id', editingFuncionario.id);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Funcionário atualizado com sucesso!' });
      } else {
        // Using any type to handle the current type issues
        const { error } = await (supabase as any).from('funcionarios_dasprent').insert([formData]);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Funcionário criado com sucesso!' });
      }

      setShowDialog(false);
      setEditingFuncionario(null);
      setFormData({
        nome: '',
        email: '',
        telefone: '',
        cargo: '',
        departamento: '',
        data_admissao: '',
        ativo: true,
      });
      fetchFuncionarios();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (funcionario: Funcionario) => {
    setEditingFuncionario(funcionario);
    setFormData({
      nome: funcionario.nome,
      email: funcionario.email,
      telefone: funcionario.telefone || '',
      cargo: funcionario.cargo || '',
      departamento: funcionario.departamento || '',
      data_admissao: funcionario.data_admissao || '',
      ativo: funcionario.ativo,
    });
    setShowDialog(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este funcionário?')) return;

    try {
      // Using any type to handle the current type issues
      const { error } = await (supabase as any).from('funcionarios_dasprent').delete().eq('id', id);

      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Funcionário excluído com sucesso!' });
      fetchFuncionarios();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const sortedFuncionarios = [...funcionarios].sort((a, b) => {
    let va: string | number = '';
    let vb: string | number = '';
    if (sortField === 'nome') {
      va = a.nome;
      vb = b.nome;
    } else if (sortField === 'email') {
      va = a.email;
      vb = b.email;
    } else if (sortField === 'cargo') {
      va = a.cargo || '';
      vb = b.cargo || '';
    } else if (sortField === 'departamento') {
      va = a.departamento || '';
      vb = b.departamento || '';
    } else if (sortField === 'ativo') {
      va = a.ativo ? 0 : 1;
      vb = b.ativo ? 0 : 1;
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  if (loading && funcionarios.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Users className="h-12 w-12 animate-pulse text-yellow-500 mx-auto mb-4" />
          <p className="text-white text-lg">Carregando funcionários...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <DasprentNavigation />

      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Funcionários DasPrent</h1>
              <p className="text-gray-400">Gerir equipa da empresa</p>
            </div>

            <Dialog open={showDialog} onOpenChange={setShowDialog}>
              <DialogTrigger asChild>
                <Button className="bg-yellow-500 hover:bg-yellow-600 text-black">
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Funcionário
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-gray-700 text-white">
                <DialogHeader>
                  <DialogTitle>
                    {editingFuncionario ? 'Editar Funcionário' : 'Novo Funcionário'}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    {editingFuncionario
                      ? 'Edite os dados do funcionário selecionado.'
                      : 'Preencha os dados para criar um novo funcionário.'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="nome">Nome</Label>
                      <Input
                        id="nome"
                        value={formData.nome}
                        onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                        required
                        className="bg-gray-800 border-gray-600"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                        className="bg-gray-800 border-gray-600"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="telefone">Telefone</Label>
                      <Input
                        id="telefone"
                        value={formData.telefone}
                        onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                        className="bg-gray-800 border-gray-600"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cargo">Cargo</Label>
                      <Input
                        id="cargo"
                        value={formData.cargo}
                        onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                        className="bg-gray-800 border-gray-600"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="departamento">Departamento</Label>
                      <Input
                        id="departamento"
                        value={formData.departamento}
                        onChange={(e) => setFormData({ ...formData, departamento: e.target.value })}
                        className="bg-gray-800 border-gray-600"
                      />
                    </div>
                    <div>
                      <Label htmlFor="data_admissao">Data Admissão</Label>
                      <Input
                        id="data_admissao"
                        type="date"
                        value={formData.data_admissao}
                        onChange={(e) =>
                          setFormData({ ...formData, data_admissao: e.target.value })
                        }
                        className="bg-gray-800 border-gray-600"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" className="bg-yellow-500 hover:bg-yellow-600 text-black">
                      {editingFuncionario ? 'Atualizar' : 'Criar'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Users className="h-5 w-5" />
                Lista de Funcionários ({funcionarios.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      field="nome"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-gray-300"
                    >
                      Nome
                    </SortableTableHead>
                    <SortableTableHead
                      field="email"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-gray-300"
                    >
                      Email
                    </SortableTableHead>
                    <SortableTableHead
                      field="cargo"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-gray-300"
                    >
                      Cargo
                    </SortableTableHead>
                    <SortableTableHead
                      field="departamento"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-gray-300"
                    >
                      Departamento
                    </SortableTableHead>
                    <SortableTableHead
                      field="ativo"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="text-gray-300"
                    >
                      Status
                    </SortableTableHead>
                    <TableHead className="text-gray-300">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedFuncionarios.map((funcionario) => (
                    <TableRow key={funcionario.id}>
                      <TableCell className="text-white">{funcionario.nome}</TableCell>
                      <TableCell className="text-gray-300">{funcionario.email}</TableCell>
                      <TableCell className="text-gray-300">{funcionario.cargo}</TableCell>
                      <TableCell className="text-gray-300">{funcionario.departamento}</TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            funcionario.ativo
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {funcionario.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(funcionario)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(funcionario.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DasprentFuncionarios;
