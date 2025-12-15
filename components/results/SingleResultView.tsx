import React from 'react';
import { OptimizationResult, Demand, SolverConfig } from '../../types';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { ArrowLeft, Layers, PieChart, Trash } from 'lucide-react';

interface SingleResultViewProps {
    result: OptimizationResult;
    demands: Demand[];
    config: SolverConfig;
    coilCode: string;
    onBack?: () => void;
}

export const SingleResultView: React.FC<SingleResultViewProps> = ({ result, demands, config, coilCode, onBack }) => {

    const aggregatedDemands: Record<number, number> = {};
    demands.forEach(d => aggregatedDemands[d.width] = (aggregatedDemands[d.width] || 0) + d.targetTons);

    const chartData = Object.entries(aggregatedDemands).map(([width, target]) => {
        const w = parseFloat(width);
        const produced = result.fulfillment[w] || 0;
        return {
            width: w,
            Objetivo: target,
            Real: produced,
            Estado: produced >= target * (1 - config.tolerance / 100) ? 'Cumplido' : 'Fallo'
        };
    });

    // Calculate unique widths for Matrix View
    const uniqueWidths = Array.from(new Set(demands.map(d => d.width))).sort((a: number, b: number) => a - b);

    // Calculate Matrix Totals
    const totalCoils = result.patterns.reduce((sum, p) => sum + p.assignedCoils, 0);
    const totalTons = result.patterns.reduce((sum, p) => sum + p.totalProductionWeight, 0);

    const widthTotals = uniqueWidths.map(w => {
        return result.patterns.reduce((sum, p) => {
            const cut = p.cuts.find(c => c.width === w);
            return sum + (cut ? (p.assignedCoils * cut.count * cut.weightPerCut) : 0);
        }, 0);
    });

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {onBack && (
                <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors mb-2">
                    <ArrowLeft className="w-4 h-4" /> Volver al Dashboard General
                </button>
            )}

            <div className="flex justify-between items-end border-b border-slate-200 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">{coilCode === 'BOBINA-RAPIDA' ? 'Bobina Única (Rápida)' : coilCode}</h2>
                    <p className="text-sm text-slate-500">Detalle de optimización de patrones</p>
                </div>
                <div className="text-right">
                    <span className={`text-xl font-bold ${result.globalYield >= 95 ? 'text-emerald-600' : 'text-amber-600'}`}>{result.globalYield.toFixed(2)}%</span>
                    <p className="text-xs text-slate-400">Rendimiento</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><Layers className="w-6 h-6" /></div>
                        <div>
                            <p className="text-sm text-slate-500 font-medium">Total Bobinas</p>
                            <h4 className="text-2xl font-bold text-slate-800">{result.totalCoilsUsed}</h4>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-lg ${result.globalYield >= 90 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}><PieChart className="w-6 h-6" /></div>
                        <div>
                            <p className="text-sm text-slate-500 font-medium">Rendimiento</p>
                            <h4 className="text-2xl font-bold text-slate-800">{result.globalYield.toFixed(2)}%</h4>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-rose-100 text-rose-600 rounded-lg"><Trash className="w-6 h-6" /></div>
                        <div>
                            <p className="text-sm text-slate-500 font-medium">Desperdicio</p>
                            <h4 className="text-2xl font-bold text-slate-800">{result.globalWaste.toFixed(2)}%</h4>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-80 mb-6">
                <h3 className="font-bold text-slate-700 mb-4">Producción vs Objetivo</h3>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="width" tickFormatter={(val) => `${val}mm`} stroke="#64748b" fontSize={12} />
                        <YAxis stroke="#64748b" fontSize={12} label={{ value: 'Ton', angle: -90, position: 'insideLeft' }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        <Bar dataKey="Objetivo" fill="#94a3b8" name="Objetivo" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Real" name="Producido" radius={[4, 4, 0, 0]}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.Estado === 'Cumplido' ? '#10b981' : '#f59e0b'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* MATRIX VIEW */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800 text-lg">Matriz de Producción (Diseños x Anchos)</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold">
                            <tr>
                                <th className="px-4 py-3 border-r border-slate-200">Patrón</th>
                                <th className="px-4 py-3 border-r border-slate-200 text-center">Bobinas</th>
                                {uniqueWidths.map(w => (
                                    <th key={w} className="px-4 py-3 text-right bg-blue-50/50 border-r border-slate-200">{w}mm</th>
                                ))}
                                <th className="px-4 py-3 text-right bg-slate-100">Total T</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {result.patterns.map((p) => (
                                <tr key={p.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-2 border-r border-slate-100 font-medium">ID-{p.id}</td>
                                    <td className="px-4 py-2 border-r border-slate-100 text-center font-bold">{p.assignedCoils}</td>
                                    {uniqueWidths.map(w => {
                                        const cut = p.cuts.find(c => c.width === w);
                                        const tons = cut ? (p.assignedCoils * cut.count * cut.weightPerCut).toFixed(2) : '-';
                                        return (
                                            <td key={w} className="px-4 py-2 text-right border-r border-slate-100 text-slate-600">
                                                {tons}
                                            </td>
                                        );
                                    })}
                                    <td className="px-4 py-2 text-right font-bold bg-slate-50">
                                        {p.totalProductionWeight.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-100 font-bold text-slate-800 text-xs border-t-2 border-slate-200">
                            <tr>
                                <td className="px-4 py-3 text-right">TOTAL</td>
                                <td className="px-4 py-3 text-center">{totalCoils}</td>
                                {widthTotals.map((t, idx) => (
                                    <td key={idx} className="px-4 py-3 text-right bg-blue-100/50 border-r border-blue-200">
                                        {t > 0 ? t.toFixed(2) : '-'}
                                    </td>
                                ))}
                                <td className="px-4 py-3 text-right bg-slate-200">{totalTons.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800 text-lg">Detalle de Patrones</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 uppercase font-medium text-xs border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3">Patrón #</th>
                                <th className="px-6 py-3 text-center">Bobinas</th>
                                <th className="px-6 py-3">Cortes</th>
                                <th className="px-6 py-3 text-right">Rend.</th>
                                <th className="px-6 py-3 text-right">Salida (Ton)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {result.patterns.map((pattern) => (
                                <tr key={pattern.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 font-medium"><span className="bg-blue-100 text-blue-700 py-1 px-2 rounded">ID-{pattern.id}</span></td>
                                    <td className="px-6 py-4 text-center font-bold">{pattern.assignedCoils}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-2">
                                            {pattern.cuts.map((cut, idx) => (
                                                <div key={idx} className="bg-white border border-slate-200 px-2 py-1 rounded shadow-sm text-xs">
                                                    <b>{cut.width}mm</b> x{cut.count}
                                                </div>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">{pattern.yieldPercentage.toFixed(2)}%</td>
                                    <td className="px-6 py-4 text-right">{pattern.totalProductionWeight.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
