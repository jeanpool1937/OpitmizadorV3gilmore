
import React, { useState, useMemo, useEffect } from 'react';
import { OptimizationResult, Demand, SolverConfig, BatchOptimizationResult, DailyPlan } from '../types';
import {
    generateCSV,
    downloadCSV,
    generateGlobalDesignExport,
    generateGlobalMatrixExport,
    exportScheduleToExcel,
    exportScheduleToPDF
} from '../utils/export';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
    ComposedChart, Line, Area, ReferenceLine
} from 'recharts';
import { Download, AlertTriangle, PieChart, Layers, Trash, Calendar, Table as TableIcon, Factory, TrendingUp, LayoutGrid, ArrowLeft, FileText, Grid, FileSpreadsheet, Printer, Filter, XCircle, Clock, RefreshCw, CalendarDays, CheckCircle, CalendarClock, ChevronLeft, ChevronRight, List } from 'lucide-react';

interface ResultsProps {
    batchResult: BatchOptimizationResult;
    allDemands: Demand[];
    config: SolverConfig;
    onReoptimizeCoil?: (coilCode: string) => void;
    onGenerateSchedule?: () => void;
    onSmartSchedule?: () => void;
}

import { DateComplianceView } from './results/DateComplianceView';
import { CalendarGridView } from './results/CalendarGridView';
import { SingleResultView } from './results/SingleResultView';

// Helper: Formatter
const formatDate = (dateStr: string) => {
    if (dateStr === 'Stock / Sobrante') return dateStr;
    try {
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
    } catch (e) {
        return dateStr;
    }
};





// Main Component
export const Results: React.FC<ResultsProps> = ({ batchResult, allDemands, config, onReoptimizeCoil, onGenerateSchedule, onSmartSchedule }) => {
    const [selectedCoil, setSelectedCoil] = useState<string | null>(null);
    const [dashboardTab, setDashboardTab] = useState<'kpi' | 'schedule' | 'daily_list' | 'calendar_view' | 'stock'>('kpi');

    // Filter States
    const [targetYieldFilter, setTargetYieldFilter] = useState<number>(98.9);
    const [isFilterActive, setIsFilterActive] = useState<boolean>(false);

    // Auto-select if single result (Rapid Mode)
    useEffect(() => {
        if (batchResult.summary.length === 1 && !selectedCoil) {
            setSelectedCoil(batchResult.summary[0].coilCode);
        }
    }, [batchResult, selectedCoil]);

    // Derived filtered summary
    const filteredSummaries = useMemo(() => {
        if (!isFilterActive) return batchResult.summary;
        return batchResult.summary.filter(s => s.yield < targetYieldFilter);
    }, [batchResult.summary, isFilterActive, targetYieldFilter]);

    // Calculate total patterns generated across all coils
    const totalGlobalPatterns = useMemo(() => {
        return Object.values(batchResult.results).reduce((acc, res) => acc + res.patterns.length, 0);
    }, [batchResult]);

    // Calculate Global Stock Evolution
    const globalStockData = useMemo(() => {
        // 1. Get all dates involved
        const dateSet = new Set<string>();
        allDemands.forEach(d => dateSet.add(d.date));
        batchResult.globalCapacitySchedule.forEach(d => dateSet.add(d.date));
        const dates = Array.from(dateSet).sort();

        // 2. Initial Stock = Sum of all Reserved Stock columns (Col F)
        const initialReservedStock = allDemands.reduce((sum, d) => sum + (d.reservedStock || 0), 0);

        let currentStock = initialReservedStock;
        let cumulativeProduction = 0;
        let cumulativeConsumption = 0;

        const evolution = dates.map(date => {
            // Planned Consumption for this date (Col E)
            const dailyConsumption = allDemands
                .filter(d => d.date === date)
                .reduce((sum, d) => sum + (d.plannedConsumption || d.targetTons), 0);

            // Production for this date (from schedule)
            const dayPlan = batchResult.globalCapacitySchedule.find(p => p.date === date);
            const dailyProduction = dayPlan ? dayPlan.totalTons : 0;

            cumulativeConsumption += dailyConsumption;
            cumulativeProduction += dailyProduction;

            // Stock at End of Day = Previous Stock + Production - Consumption
            // But since we want "Projected Stock", we can use the running total approach:
            // Stock(t) = Initial + CumulativeProd - CumulativeCons

            currentStock = initialReservedStock + cumulativeProduction - cumulativeConsumption;

            return {
                date,
                formattedDate: formatDate(date),
                produccion: dailyProduction,
                consumo: dailyConsumption,
                stock: currentStock
            };
        });

        // Prepend "Start" point for chart visualization
        if (evolution.length > 0) {
            return [
                {
                    date: 'Inicio',
                    formattedDate: 'Stock Inicial',
                    produccion: 0,
                    consumo: 0,
                    stock: initialReservedStock
                },
                ...evolution
            ];
        }
        return evolution;

    }, [allDemands, batchResult.globalCapacitySchedule]);

    // Chart Data: Demand Composition (Stack by Stock vs Production Date)
    const demandCompositionData = useMemo(() => {
        if (batchResult.globalCapacitySchedule.length === 0) return { data: [], productionDates: [] };

        // 1. Create a "Production Pool" from the Schedule
        // Map: CoilCode -> Width -> FIFO Queue [{ date: string, tons: number }]
        const productionPool: Record<string, Record<number, { date: string, tons: number }[]>> = {};
        const allProductionDates = new Set<string>();

        batchResult.globalCapacitySchedule.forEach((day: DailyPlan) => {
            allProductionDates.add(day.date);
            day.patterns.forEach(p => {
                const code = p.coilCode || 'DEFAULT';
                p.pattern.cuts.forEach(c => {
                    const totalTons = p.coils * c.count * c.weightPerCut;
                    if (!productionPool[code]) productionPool[code] = {};
                    if (!productionPool[code][c.width]) productionPool[code][c.width] = [];

                    productionPool[code][c.width].push({
                        date: day.date,
                        tons: totalTons
                    });
                });
            });
        });

        // 2. Iterate Demands chronologically
        const sortedDemands = [...allDemands].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const chartMap: Record<string, any> = {};

        sortedDemands.forEach(d => {
            const dayKey = d.date;
            if (!chartMap[dayKey]) chartMap[dayKey] = { date: dayKey, Stock: 0 };

            // Stock Portion
            chartMap[dayKey].Stock += (d.reservedStock || 0);

            // Production Portion (Target Tons)
            let needed = d.targetTons;
            const code = d.coilCode || 'DEFAULT';
            const pool = productionPool[code]?.[d.width] || [];

            // Consume from pool FIFO
            while (needed > 0.01 && pool.length > 0) {
                const batch = pool[0]; // Peek
                const take = Math.min(needed, batch.tons);

                const prodKey = `Prod: ${formatDate(batch.date)}`;
                chartMap[dayKey][prodKey] = (chartMap[dayKey][prodKey] || 0) + take;

                needed -= take;
                batch.tons -= take;
                if (batch.tons <= 0.001) {
                    pool.shift(); // Remove used up batch
                }
            }

            // If still needed but pool empty, it's Backlog/Unmet (Optional to visualize, skipping for now to keep clean)
        });

        const data = Object.values(chartMap).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const sortedProdDates = Array.from(allProductionDates).sort();

        return { data, productionDates: sortedProdDates };

    }, [allDemands, batchResult.globalCapacitySchedule]);

    const exportGlobalDesigns = () => {
        const csv = generateGlobalDesignExport(batchResult);
        downloadCSV(csv, `Diseños_Globales_${new Date().toISOString().slice(0, 10)}.csv`);
    };

    const exportGlobalMatrix = () => {
        const csv = generateGlobalMatrixExport(batchResult, allDemands);
        downloadCSV(csv, `Matriz_Global_${new Date().toISOString().slice(0, 10)}.csv`);
    };

    const handleExportScheduleExcel = () => {
        exportScheduleToExcel(batchResult.globalCapacitySchedule);
    };

    const handleExportSchedulePDF = () => {
        exportScheduleToPDF(batchResult.globalCapacitySchedule);
    };

    // Drill Down View (or Single Coil Rapid View)
    if (selectedCoil && batchResult.results[selectedCoil]) {
        const demandsForCoil = allDemands.filter(d => (d.coilCode || 'DEFAULT') === selectedCoil);
        const summary = batchResult.summary.find(s => s.coilCode === selectedCoil);
        const viewConfig = summary ? { ...config, parentWidth: summary.parentWidth } : config;

        return (
            <SingleResultView
                result={batchResult.results[selectedCoil]}
                demands={demandsForCoil}
                config={viewConfig}
                coilCode={selectedCoil}
                // Only show Back button if there is more than 1 coil
                onBack={batchResult.summary.length > 1 ? () => setSelectedCoil(null) : undefined}
            />
        );
    }

    // Dashboard General
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <LayoutGrid className="w-6 h-6 text-blue-600" />
                        Dashboard Global
                    </h2>
                    <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                        <span>{batchResult.summary.length} grupos de bobinas</span>
                        <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                        <span className="font-medium text-blue-600">{totalGlobalPatterns} Diseños Generados</span>
                        <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                        <span className="font-semibold text-emerald-600">{batchResult.totalGlobalYield.toFixed(2)}% Rendimiento Promedio</span>
                    </div>
                </div>

                <div className="flex gap-2">
                    {/* Sequencing Buttons */}
                    {onGenerateSchedule && (
                        <button
                            onClick={onGenerateSchedule}
                            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                        >
                            <Calendar className="w-4 h-4" />
                            Generar Secuencia
                        </button>
                    )}

                    {/* NEW: JIT Optimization Button */}
                    {onSmartSchedule && onGenerateSchedule && (
                        <button
                            onClick={onSmartSchedule}
                            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm mr-2"
                            title="Ajustar fecha de inicio automáticamente para cumplir con la demanda (Just In Time)"
                        >
                            <CalendarClock className="w-4 h-4" />
                            Optimizar Inicio (JIT)
                        </button>
                    )}

                    <button
                        onClick={exportGlobalDesigns}
                        className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                    >
                        <FileText className="w-4 h-4 text-blue-500" />
                        Exp. Diseños
                    </button>
                    <button
                        onClick={exportGlobalMatrix}
                        className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                    >
                        <Grid className="w-4 h-4 text-emerald-500" />
                        Exp. Matriz
                    </button>
                </div>
            </div>

            {/* Dashboard Tabs */}
            <div className="flex border-b border-slate-200 overflow-x-auto">
                <button
                    onClick={() => setDashboardTab('kpi')}
                    className={`px-6 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${dashboardTab === 'kpi' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                    <LayoutGrid className="w-4 h-4" /> Resumen
                </button>
                <button
                    onClick={() => setDashboardTab('schedule')}
                    className={`px-6 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${dashboardTab === 'schedule' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                    <Factory className="w-4 h-4" /> Planificación
                </button>
                <button
                    onClick={() => setDashboardTab('daily_list')}
                    className={`px-6 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${dashboardTab === 'daily_list' ? 'border-orange-600 text-orange-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                    <List className="w-4 h-4" /> Detalle Diario
                </button>
                <button
                    onClick={() => setDashboardTab('calendar_view')}
                    className={`px-6 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${dashboardTab === 'calendar_view' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                    <Calendar className="w-4 h-4" /> Vista Calendario
                </button>
                <button
                    onClick={() => setDashboardTab('stock')}
                    className={`px-6 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${dashboardTab === 'stock' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                    <TrendingUp className="w-4 h-4" /> Stock
                </button>
            </div>

            <div className="pt-4">
                {/* TAB: KPI & COIL LIST */}
                {dashboardTab === 'kpi' && (
                    <>
                        {/* FILTER BAR */}
                        <div className="flex items-center gap-4 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200 w-fit">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-600">Obj. Rendimiento (%):</span>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={targetYieldFilter}
                                    onChange={(e) => setTargetYieldFilter(parseFloat(e.target.value) || 0)}
                                    className="w-20 border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <button
                                onClick={() => setIsFilterActive(!isFilterActive)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${isFilterActive
                                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                        : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
                                    }`}
                            >
                                {isFilterActive ? (
                                    <><XCircle className="w-4 h-4" /> Filtrando Bajos</>
                                ) : (
                                    <><Filter className="w-4 h-4" /> Filtrar {"<"} {targetYieldFilter}%</>
                                )}
                            </button>
                            {isFilterActive && (
                                <span className="text-xs text-amber-600 font-medium">
                                    Mostrando {filteredSummaries.length} de {batchResult.summary.length}
                                </span>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredSummaries.map((coil) => (
                                <div key={coil.coilCode} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow animate-in zoom-in-95 duration-300">
                                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-start">
                                        <div>
                                            <h3 className="font-bold text-lg text-slate-800">{coil.coilCode}</h3>
                                            <p className="text-xs text-slate-500 line-clamp-1" title={coil.description}>{coil.description}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="text-xs font-mono bg-white border border-slate-200 px-2 py-1 rounded text-slate-600">
                                                {coil.parentWidth} mm
                                            </span>
                                            {/* Per-Coil Re-optimize Button */}
                                            {onReoptimizeCoil && (
                                                <button
                                                    onClick={() => onReoptimizeCoil(coil.coilCode)}
                                                    className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-800 hover:underline mt-1"
                                                    title="Intentar mejorar el rendimiento (Solo esta bobina)"
                                                >
                                                    <RefreshCw className="w-3 h-3" /> Optimizar
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="p-4 space-y-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-slate-500">Entrada Total</span>
                                            <span className="font-bold text-slate-800">{coil.totalInputTons.toFixed(1)} T</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-slate-500">Salida Total</span>
                                            <span className="font-bold text-emerald-700">{coil.totalOutputTons.toFixed(1)} T</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden flex">
                                            <div className={`h-2.5 ${coil.yield < targetYieldFilter ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${coil.yield}%` }}></div>
                                            <div className="bg-rose-400 h-2.5" style={{ width: `${coil.waste}%` }}></div>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className={`font-bold ${coil.yield < targetYieldFilter ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                {coil.yield.toFixed(2)}% Eficiencia
                                            </span>
                                            <span className="text-rose-500">{coil.waste.toFixed(2)}% Merma</span>
                                        </div>
                                        <button
                                            onClick={() => setSelectedCoil(coil.coilCode)}
                                            className="w-full mt-2 bg-blue-50 text-blue-600 hover:bg-blue-100 py-2 rounded-lg text-sm font-medium transition-colors"
                                        >
                                            Ver Patrones Detallados
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {filteredSummaries.length === 0 && (
                                <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                                    <p>No se encontraron bobinas bajo el criterio de rendimiento.</p>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* TAB: SCHEDULE PLAN (Compliance & Charts) */}
                {dashboardTab === 'schedule' && (
                    <div className="space-y-6">
                        {batchResult.globalCapacitySchedule.length === 0 ? (
                            <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
                                <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-slate-700">Programa de Corte no Generado</h3>
                                <p className="text-slate-500 mb-6 max-w-md mx-auto">
                                    Se requiere generar la secuencia para ver el cumplimiento y las gráficas.
                                </p>
                                {onGenerateSchedule && (
                                    <button
                                        onClick={onGenerateSchedule}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-bold shadow-md transition-colors"
                                    >
                                        Generar Secuencia Ahora
                                    </button>
                                )}
                            </div>
                        ) : (
                            <>
                                <DateComplianceView schedule={batchResult.globalCapacitySchedule} demands={allDemands} />

                                {/* Stacked Bar Chart for Demand Coverage */}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-6">
                                    <div className="flex justify-between items-center mb-6">
                                        <div>
                                            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                                <Factory className="w-5 h-5 text-indigo-600" />
                                                Cobertura de Demanda Diaria (Stock vs Producción)
                                            </h3>
                                            <p className="text-sm text-slate-500">Visualiza el origen del material para cada día de demanda.</p>
                                        </div>
                                    </div>
                                    <div className="h-80 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={demandCompositionData.data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                <XAxis
                                                    dataKey="date"
                                                    tickFormatter={formatDate}
                                                    stroke="#64748b"
                                                    fontSize={12}
                                                />
                                                <YAxis stroke="#64748b" fontSize={12} label={{ value: 'Ton', angle: -90, position: 'insideLeft' }} />
                                                <Tooltip
                                                    labelFormatter={formatDate}
                                                    labelStyle={{ fontWeight: 'bold' }}
                                                />
                                                <Legend />

                                                {/* Stock Layer (Always Grey) */}
                                                <Bar dataKey="Stock" name="Stock Reservado" stackId="a" fill="#94a3b8" />

                                                {/* Dynamic Production Layers based on Production Date */}
                                                {demandCompositionData.productionDates.map((pDate, idx) => {
                                                    const formatted = formatDate(pDate);
                                                    // Generate distinctive colors based on index
                                                    const hue = (idx * 137.508) % 360; // Golden angle for distribution
                                                    const color = `hsl(${hue}, 70%, 50%)`;

                                                    return (
                                                        <Bar
                                                            key={pDate}
                                                            dataKey={`Prod: ${formatted}`}
                                                            name={`Prod. el ${formatted}`}
                                                            stackId="a"
                                                            fill={color}
                                                        />
                                                    );
                                                })}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* TAB: CALENDAR GRID VIEW */}
                {dashboardTab === 'calendar_view' && (
                    <div className="space-y-6">
                        {batchResult.globalCapacitySchedule.length === 0 ? (
                            <div className="text-center py-16 text-slate-400">Genera la secuencia primero.</div>
                        ) : (
                            <CalendarGridView schedule={batchResult.globalCapacitySchedule} />
                        )}
                    </div>
                )}

                {/* TAB: DAILY LIST (MOVED HERE) */}
                {dashboardTab === 'daily_list' && (
                    <div className="space-y-6">
                        {batchResult.globalCapacitySchedule.length === 0 ? (
                            <div className="text-center py-16 text-slate-400">Genera la secuencia primero.</div>
                        ) : (
                            <>
                                <div className="flex justify-between items-end gap-2 mb-2 mt-4 border-b border-slate-200 pb-4">
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-800">Calendario de Producción Diaria</h3>
                                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-white border border-slate-300 block"></span>Disponible</span>
                                            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-100 border border-orange-200 block"></span>Penalización Setup</span>
                                            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-indigo-100 border border-indigo-200 block"></span>Ocupado</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleExportScheduleExcel}
                                            className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded text-sm font-medium transition-colors"
                                        >
                                            <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
                                        </button>
                                        <button
                                            onClick={handleExportSchedulePDF}
                                            className="flex items-center gap-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 px-3 py-1.5 rounded text-sm font-medium transition-colors"
                                        >
                                            <Printer className="w-4 h-4" /> Exportar PDF
                                        </button>
                                    </div>
                                </div>

                                {batchResult.globalCapacitySchedule.map((day, idx) => (
                                    <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between items-center">
                                            <div className="flex items-center gap-3">
                                                <Calendar className="w-5 h-5 text-indigo-500" />
                                                <h3 className="font-bold text-slate-800 uppercase flex items-center gap-2">
                                                    {formatDate(day.date)}
                                                    {/* Detect Sunday here visually too */}
                                                    {new Date(day.date).getUTCDay() === 0 && (
                                                        <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full border border-red-200 normal-case">Domingo (50%)</span>
                                                    )}
                                                </h3>
                                                {day.setupPenaltyTons > 0 && (
                                                    <div className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 ml-2" title="Capacidad perdida por cambios de diseño">
                                                        <Clock className="w-3 h-3" />
                                                        -{day.setupPenaltyTons}T Setup
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4">
                                                {/* Daily Yield Badge */}
                                                <span className={`text-xs font-semibold px-2 py-1 rounded border ${day.dailyYield > 98 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                                                    Rendimiento Día: {day.dailyYield.toFixed(2)}%
                                                </span>

                                                <span className="text-sm font-medium text-slate-500">
                                                    Total: <span className="text-slate-900 font-bold">{day.totalTons.toFixed(1)} Ton</span>
                                                </span>
                                            </div>
                                        </div>

                                        {/* Capacity Bar Visual */}
                                        <div className="h-1.5 w-full bg-slate-100 flex">
                                            {/* Use capacityUsedPercent from plan which now considers Sunday 50% cap */}
                                            <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, day.capacityUsedPercent)}%` }}></div>
                                        </div>

                                        <div className="p-6">
                                            <div className="space-y-2">
                                                <div className="grid grid-cols-12 gap-2 mb-2 text-xs font-semibold text-slate-500 uppercase">
                                                    <div className="col-span-4 md:col-span-3">Bobina</div>
                                                    <div className="col-span-2 md:col-span-1">Cant.</div>
                                                    <div className="col-span-4 md:col-span-5">Cortes</div>
                                                    <div className="col-span-2 md:col-span-1 text-right">Rend %</div>
                                                    <div className="col-span-12 md:col-span-2 text-right">Peso</div>
                                                </div>

                                                {day.patterns.map((sp, pIdx) => (
                                                    <div key={pIdx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                                                        <div className="col-span-4 md:col-span-3 flex flex-col justify-center">
                                                            <div className="bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded text-xs w-fit mb-1">{sp.coilCode}</div>
                                                            <div className="text-[10px] text-slate-500 leading-tight line-clamp-2" title={sp.coilDescription}>
                                                                {sp.coilDescription || '-'}
                                                            </div>
                                                        </div>
                                                        <div className="col-span-2 md:col-span-1 text-sm font-bold text-slate-700">{sp.coils}</div>
                                                        <div className="col-span-4 md:col-span-5 flex flex-wrap gap-1">
                                                            {sp.pattern.cuts.map((c, i) => (
                                                                <span key={i} className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                                                                    {c.width}mm (x{c.count})
                                                                </span>
                                                            ))}
                                                        </div>
                                                        <div className="col-span-2 md:col-span-1 text-right text-sm font-bold">
                                                            <span className={`${sp.pattern.yieldPercentage > 98 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                                                {sp.pattern.yieldPercentage.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                        <div className="col-span-12 md:col-span-2 text-right text-sm text-slate-500 font-mono">
                                                            {sp.pattern.totalProductionWeight.toFixed(1)} T
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                )}

                {/* TAB: GLOBAL STOCK CHART */}
                {dashboardTab === 'stock' && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-indigo-600" />
                                    Evolución de Stock Global (Proyectado)
                                </h3>
                                <p className="text-sm text-slate-500">Balance neto: Stock Inicial + Producción - Consumo (Plan)</p>
                            </div>
                        </div>
                        {batchResult.globalCapacitySchedule.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 border border-dashed rounded-lg">
                                Se requiere generar la secuencia (Programa) para visualizar la evolución del stock.
                            </div>
                        ) : (
                            <div className="h-96 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={globalStockData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="formattedDate" stroke="#64748b" fontSize={12} />
                                        <YAxis stroke="#64748b" fontSize={12} label={{ value: 'Ton', angle: -90, position: 'insideLeft' }} />
                                        <Tooltip
                                            labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Legend />
                                        <ReferenceLine y={0} stroke="#000" strokeOpacity={0.2} />
                                        <Area type="monotone" dataKey="stock" name="Stock Proyectado" fill="#818cf8" fillOpacity={0.2} stroke="#4f46e5" strokeWidth={2} />
                                        <Bar dataKey="produccion" name="Producción (Entrada)" fill="#10b981" barSize={20} />
                                        <Bar dataKey="consumo" name="Plan (Consumo)" fill="#f43f5e" barSize={20} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
