
import React, { useState, useEffect, useMemo } from 'react';
import { CoilMasterEntry, getCoilMasterData, saveCoilMasterData, upsertCoilEntry, deleteCoilEntry } from '../utils/coilMaster';
import { X, Search, Plus, Save, Trash2, Edit2, AlertCircle, RefreshCw } from 'lucide-react';

interface CoilMasterModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const CoilMasterModal: React.FC<CoilMasterModalProps> = ({ isOpen, onClose }) => {
    const [entries, setEntries] = useState<CoilMasterEntry[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingEntry, setEditingEntry] = useState<CoilMasterEntry | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Form Stats
    const [formData, setFormData] = useState<CoilMasterEntry>({
        code: '',
        description: '',
        width: 1200,
        rhythm: 10
    });

    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen]);

    const loadData = () => {
        setEntries(getCoilMasterData());
    };

    const filteredEntries = useMemo(() => {
        return entries.filter(e =>
            e.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.description.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [entries, searchTerm]);

    const handleEdit = (entry: CoilMasterEntry) => {
        setEditingEntry(entry);
        setFormData({ ...entry });
        setIsCreating(false);
    };

    const handleCreate = () => {
        setEditingEntry(null);
        setFormData({
            code: '',
            description: '',
            width: 1200,
            rhythm: 10
        });
        setIsCreating(true);
    };

    const handleSave = () => {
        if (!formData.code || !formData.description) return;

        const updatedList = upsertCoilEntry(formData);
        setEntries(updatedList);
        setEditingEntry(null);
        setIsCreating(false);
    };

    const handleDelete = (code: string) => {
        if (window.confirm(`¿Estás seguro de eliminar el código ${code}?`)) {
            const updatedList = deleteCoilEntry(code);
            setEntries(updatedList);
            if (editingEntry?.code === code) {
                setEditingEntry(null);
                setIsCreating(false);
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <RefreshCw className="w-5 h-5 text-indigo-600" />
                            Maestro de Bobinas
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">Administra los anchos estándar y ritmos de producción por código de material.</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors bg-white p-2 rounded-full shadow-sm border border-slate-200 hover:border-slate-300">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left Panel: List */}
                    <div className="w-1/3 border-r border-slate-200 flex flex-col bg-slate-50/50">
                        <div className="p-4 border-b border-slate-200 space-y-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar por código o descripción..."
                                    className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <button
                                onClick={handleCreate}
                                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                            >
                                <Plus className="w-4 h-4" /> Nuevo Material
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {filteredEntries.map(entry => (
                                <div
                                    key={entry.code}
                                    onClick={() => handleEdit(entry)}
                                    className={`p-4 border-b border-slate-100 cursor-pointer hover:bg-indigo-50 transition-colors ${editingEntry?.code === entry.code ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : 'border-l-4 border-l-transparent'}`}
                                >
                                    <div className="flex justify-between items-start">
                                        <span className="font-mono font-bold text-slate-700 text-sm">{entry.code}</span>
                                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">{entry.width} mm</span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{entry.description}</p>
                                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                                        <span>Ritmo: {entry.rhythm} t/h</span>
                                    </div>
                                </div>
                            ))}
                            {filteredEntries.length === 0 && (
                                <div className="p-8 text-center text-slate-400 text-sm">
                                    No se encontraron resultados
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Panel: Form */}
                    <div className="flex-1 flex flex-col bg-white">
                        {(editingEntry || isCreating) ? (
                            <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
                                <div className="p-8 flex-1 overflow-y-auto">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-lg font-bold text-slate-800">
                                            {isCreating ? 'Crear Nuevo Material' : 'Editar Material'}
                                        </h3>
                                        {!isCreating && (
                                            <button
                                                onClick={() => handleDelete(formData.code)}
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                            >
                                                <Trash2 className="w-4 h-4" /> Eliminar
                                            </button>
                                        )}
                                    </div>

                                    <div className="space-y-6 max-w-lg">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Código de Material</label>
                                            <input
                                                type="text"
                                                className={`w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none ${!isCreating ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200' : 'border-slate-300'}`}
                                                value={formData.code}
                                                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                                disabled={!isCreating}
                                                placeholder="Ej: 100479"
                                            />
                                            {isCreating && <p className="text-xs text-slate-400 mt-1">El código debe ser único.</p>}
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                                            <input
                                                type="text"
                                                className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                                value={formData.description}
                                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                placeholder="Ej: BLAF A1008 0.75MM X 1200MM"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Ancho Madre (mm)</label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none pr-12"
                                                        value={formData.width}
                                                        onChange={(e) => setFormData({ ...formData, width: parseFloat(e.target.value) || 0 })}
                                                    />
                                                    <span className="absolute right-3 top-2 text-slate-500 text-sm pointer-events-none">mm</span>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Ritmo Producción</label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none pr-12"
                                                        value={formData.rhythm}
                                                        onChange={(e) => setFormData({ ...formData, rhythm: parseFloat(e.target.value) || 0 })}
                                                    />
                                                    <span className="absolute right-3 top-2 text-slate-500 text-sm pointer-events-none">t/h</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3 text-sm text-blue-800">
                                            <AlertCircle className="w-5 h-5 flex-shrink-0 text-blue-600" />
                                            <p>
                                                Estos valores se utilizarán automáticamente cuando cargues un archivo Excel que contenga este material.
                                                El ritmo de producción afecta el cálculo de capacidad diaria.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                                    <button
                                        onClick={() => { setEditingEntry(null); setIsCreating(false); }}
                                        className="px-6 py-2 rounded-lg border border-slate-300 text-slate-600 font-medium hover:bg-white hover:text-slate-800 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={!formData.code || !formData.description}
                                        className="px-6 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 shadow-md shadow-indigo-500/30 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Save className="w-4 h-4" /> Guardar Cambios
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                    <Edit2 className="w-8 h-8 text-slate-300" />
                                </div>
                                <h3 className="text-lg font-medium text-slate-600">Selecciona un material</h3>
                                <p className="text-sm mt-1 max-w-xs mx-auto">Haz clic en un elemento de la lista para editarlo o crea uno nuevo.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
