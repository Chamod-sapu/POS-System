import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, Plus, Edit2, Check, X } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { fetchCategories, createCategory, updateCategory } from '../api/products';
import { Category } from '../types';
import { useToast } from '../../../components/ui/Toast';
import { mapErrorMessage } from '../../../lib/errors';

export interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCategory?: (categoryId: string) => void;
}

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  onSelectCategory,
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    enabled: isOpen,
  });

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: (newCat) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setNewCatName('');
      setErrorMessage(null);
      toast.success(`Category "${newCat.name}" created!`);
      if (onSelectCategory) {
        onSelectCategory(newCat.id);
      }
    },
    onError: (err) => {
      setErrorMessage(mapErrorMessage(err));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name, isActive }: { id: string; name: string; isActive: boolean }) =>
      updateCategory(id, name, isActive),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setEditingCatId(null);
      setErrorMessage(null);
      toast.success(`Category "${updated.name}" updated!`);
    },
    onError: (err) => {
      setErrorMessage(mapErrorMessage(err));
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setErrorMessage(null);
    createMutation.mutate(newCatName.trim());
  };

  const handleStartEdit = (cat: Category) => {
    setEditingCatId(cat.id);
    setEditName(cat.name);
  };

  const handleSaveEdit = (cat: Category) => {
    if (!editName.trim()) return;
    updateMutation.mutate({
      id: cat.id,
      name: editName.trim(),
      isActive: cat.is_active,
    });
  };

  const handleToggleActive = (cat: Category) => {
    updateMutation.mutate({
      id: cat.id,
      name: cat.name,
      isActive: !cat.is_active,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Product Categories"
      description="Manage retail departments and categories"
      size="md"
    >
      <div className="space-y-4">
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-700">
            {errorMessage}
          </div>
        )}

        {/* Add New Category Input */}
        <form onSubmit={handleCreateSubmit} className="flex items-center space-x-2">
          <Input
            placeholder="New category name (e.g. Spices, Dairy)..."
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            disabled={createMutation.isPending}
            className="flex-1"
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!newCatName.trim() || createMutation.isPending}
            isLoading={createMutation.isPending}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add
          </Button>
        </form>

        {/* Categories List */}
        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200 max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-center text-xs text-slate-500">Loading categories...</div>
          ) : categories.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">No categories found.</div>
          ) : (
            categories.map((cat) => {
              const isEditing = editingCatId === cat.id;

              return (
                <div
                  key={cat.id}
                  className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  {isEditing ? (
                    <div className="flex items-center space-x-2 flex-1 mr-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        className="px-2.5 py-1.5 text-xs rounded border border-emerald-500 outline-none w-full"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(cat)}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
                        aria-label="Save category"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCatId(null)}
                        className="p-1.5 text-slate-400 hover:bg-slate-100 rounded"
                        aria-label="Cancel editing"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <Tag className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="text-sm font-semibold text-slate-900">{cat.name}</span>
                      {!cat.is_active && (
                        <Badge variant="neutral" size="sm">
                          Inactive
                        </Badge>
                      )}
                    </div>
                  )}

                  {!isEditing && (
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(cat)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
                        aria-label="Edit category"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(cat)}
                        className={`text-xs px-2 py-1 rounded font-medium ${
                          cat.is_active
                            ? 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        {cat.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};

