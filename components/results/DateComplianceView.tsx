import React, { useMemo } from 'react';
import { DailyPlan, Demand } from '../../types';
import { CalendarDays, CheckCircle } from 'lucide-react';

const formatDate = (dateStr: string) => {
    if (dateStr === 'Stock / Sobrante') return dateStr;
    try {
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
    } catch (e) {
        return dateStr;
    }
};

interface DateComplianceViewProps {
    schedule: DailyPlan[];
    demands: Demand[];
}

export const DateComplianceView: React.FC<DateComplianceViewProps> = ({ schedule, demands }) => {
    
    // Map demands to production
    const comparisonData = useMemo(() => {
        const data: any[] = [];
        
        // Flatten schedule production
        // Map: CoilCode -> Width -> [ { date: string, tons: number } ]
        const productionLog: Record<string, Record<number, { date: string, tons: number }[]>> = {};

        schedule.forEach(day => {
            day.patterns.forEach((p) => {
                const code = p.coilCode || 'DEFAULT';
                p.pattern.cuts.forEach((c) => {
                    if(!productionLog[code]) productionLog[code] = {};
                    if(!productionLog[code][c.width]) productionLog[code][c.width] = [];
                    
                    const tons = c.weightPerCut * c.count * p.coils;
                    productionLog[code][c.width].push({
                        date: day.date,
                        tons: tons
                    });
                });
            });
        });

        // Match Demands
        demands.forEach(d => {
            const code = d.coilCode || 'DEFAULT';
            const availableProduction = productionLog[code]?.[d.width] || [];
            
            // Logic: Compare Consumption Date (d.date) vs Production Date
            // We ignore Reserved Stock for this specific compliance check, assuming 
            // Reserved Stock is already available "now" and doesn't need scheduling.
            // We only check if the "Por Fabricar" (TargetTons) part is on time.
            
            if (d.targetTons <= 0.01) return; // Skip if no manufacturing needed

            if (availableProduction.length === 0) {
                data.push({
                    coil: code,
                    width: d.width,
                    plan: d.plannedConsumption || d.targetTons,
                    stock: d.reservedStock || 0,
                    toMake: d.targetTons,
                    demandDate: d.date,
                    productionDate: 'No Programado',
                    status: 'pending',
                    daysDiff: 0
                });
            } else {
                // Find earliest production
                const earliest = availableProduction.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
                
                const dDate = new Date(d.date);
                const pDate = new Date(earliest.date);
                const diffTime = dDate.getTime() - pDate.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                
                // If diffDays is positive, Demand is after Production (Early/OnTime = Good)
                // If diffDays is negative, Demand is before Production (Late = Bad)

                let status = 'ontime';
                if (diffDays < 0) status = 'late';
                if (diffDays > 5) status = 'early';

                data.push({
                    coil: code,
                    width: d.width,
                    plan: d.plannedConsumption || d.targetTons,
                    stock: d.reservedStock || 0,
                    toMake: d.targetTons,
                    demandDate: d.date,
                    productionDate: earliest.date,
                    status,
                    daysDiff: diffDays
                });
            }
        });

        return data.sort((a,b) => new Date(a.demandDate).getTime() - new Date(b.demandDate).getTime());
    }, [schedule, demands]);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-blue-600" />
                    Cumplimiento de Fechas: Demanda vs Fabricación
                </h3>
                <p className="text-xs text-slate-500 mt-1">Verificando que los diseños a fabricar estén listos antes de la fecha de consumo (Plan).</p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-medium text-xs">
                        <tr>
                            <th className="px-6 py-3">Bobina</th>
                            <th className="px-6 py-3">Ancho</th>
                            <th className="px-6 py-3 text-right text-slate-400">Plan (E)</th>
                            <th className="px-6 py-3 text-right text-slate-400">Stock (F)</th>
                            <th className="px-6 py-3 text-right font-bold text-blue-700">A Fab. (G)</th>
                            <th className="px-6 py-3">Fecha Plan</th>
                            <th className="px-6 py-3">Fecha Fabricación</th>
                            <th className="px-6 py-3 text-center">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {comparisonData.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                                <td className="px-6 py-3 font-mono text-xs">{row.coil}</td>
                                <td className="px-6 py-3">{row.width} mm</td>
                                <td className="px-6 py-3 text-right text-slate-500">{row.plan?.toFixed(1)}</td>
                                <td className="px-6 py-3 text-right text-slate-500">{row.stock?.toFixed(1)}</td>
                                <td className="px-6 py-3 text-right font-bold text-blue-700">{row.toMake.toFixed(1)}</td>
                                <td className="px-6 py-3 text-slate-600">{formatDate(row.demandDate)}</td>
                                <td className="px-6 py-3 font-medium text-slate-800">
                                    {row.productionDate === 'No Programado' ? '-' : formatDate(row.productionDate)}
                                </td>
                                <td className="px-6 py-3 text-center">
                                    {row.productionDate === 'No Programado' ? (
                                        <span className="bg-slate-100 text-slate-500 px-2 py-1 rounded text-xs font-bold">Sin Asignar</span>
                                    ) : row.status === 'late' ? (
                                        <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">Atrasado ({Math.abs(row.daysDiff)}d)</span>
                                    ) : row.status === 'early' ? (
                                        <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">Adelantado (+{row.daysDiff}d)</span>
                                    ) : (
                                        <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold flex items-center justify-center gap-1">
                                            <CheckCircle className="w-3 h-3" /> A Tiempo
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
