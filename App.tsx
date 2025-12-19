

import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { DemandInput } from './components/DemandInput';
import { Results } from './components/Results';
import { BatchConfigModal } from './components/BatchConfigModal';
import { CoilMasterModal } from './components/CoilMasterModal';
import {
  Demand,
  SolverConfig,
  BatchOptimizationResult,
  INITIAL_DEMANDS,
  INITIAL_CONFIG,
  CoilGroupConfig,
  InputMode
} from './types';
import { solveBatchCuttingStock, prepareCoilGroups, solveLinearHybrid, calculateGlobalSchedule, calculateGlobalScheduleALAP, calculateMaxLateness, solveBatchCuttingStockBestOf } from './utils/solver';
import { Calculator, Zap } from 'lucide-react';

const App: React.FC = () => {
  const [config, setConfig] = useState<SolverConfig>(INITIAL_CONFIG);
  const [demands, setDemands] = useState<Demand[]>(INITIAL_DEMANDS);

  // Independent Result States
  const [multiCoilResult, setMultiCoilResult] = useState<BatchOptimizationResult | null>(null);
  const [singleCoilResult, setSingleCoilResult] = useState<BatchOptimizationResult | null>(null);

  const [isSolving, setIsSolving] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // UI State
  // UI State
  const [inputMode, setInputMode] = useState<InputMode>('multi-coil');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showMasterModal, setShowMasterModal] = useState(false);
  const [coilGroups, setCoilGroups] = useState<CoilGroupConfig[]>([]);
  const [solvingMode, setSolvingMode] = useState<'standard' | 'hybrid'>('standard');
  const [batchWidthOverrides, setBatchWidthOverrides] = useState<Record<string, number>>({});

  // Constants
  const RAPID_COIL_CODE = "BOBINA-RAPIDA";

  // Determine which result to show based on active tab
  const activeResult = inputMode === 'simple' ? singleCoilResult : multiCoilResult;

  const handleInitiateSolve = (mode: 'standard' | 'hybrid' = 'standard') => {
    setSolvingMode(mode);

    // Filter demands based on active mode
    const activeDemands = demands.filter(d =>
      inputMode === 'simple'
        ? d.coilCode === RAPID_COIL_CODE
        : d.coilCode !== RAPID_COIL_CODE
    );

    if (activeDemands.length === 0) {
      alert(`No hay demanda cargada en la pestaña ${inputMode === 'simple' ? 'Rápida' : 'Multi-Bobina'}.`);
      return;
    }

    if (inputMode === 'simple') {
      // RAPID MODE: Skip Modal, Solve Independently
      setIsSolving(true);
      setLoadingMessage("Optimizando bobina única (Mejor de 10 intentos)...");

      // Force specific code for simple mode demands just in case
      const safeDemands = activeDemands.map(d => ({ ...d, coilCode: RAPID_COIL_CODE }));

      // Create a single group override using Sidebar width
      const widthOverrides = { [RAPID_COIL_CODE]: config.parentWidth };

      setTimeout(() => {
        try {
          // RUN BEST OF 10 ITERATIONS
          const solution = solveBatchCuttingStockBestOf(safeDemands, config, widthOverrides, false, true, 10);
          setSingleCoilResult(solution);
        } catch (error) {
          console.error("Error en solver:", error);
          alert("Ocurrió un error durante el cálculo.");
        } finally {
          setIsSolving(false);
        }
      }, 100);

    } else {
      // MULTI-COIL MODE: DIRECTLY OPTIMIZE (Using Master Data Default)
      // The modal is skipped as per user request to rely on Master Data
      executeBatchOptimization({});
    }
  };

  const executeBatchOptimization = (widthOverrides: Record<string, number> = {}) => {
    setBatchWidthOverrides(widthOverrides);
    setShowBatchModal(false);
    setIsSolving(true);
    const isHybrid = solvingMode === 'hybrid';
    setLoadingMessage(isHybrid
      ? "Ejecutando Optimización Híbrida (Min. Diseños + Rendimiento)..."
      : "Optimizando Rendimiento Global..."
    );

    // Filter demands for multi-coil
    const activeDemands = demands.filter(d => d.coilCode !== RAPID_COIL_CODE);

    setTimeout(() => {
      try {
        // NOTE: We generate schedule separately relative to JIT logic
        const solution = solveBatchCuttingStock(activeDemands, config, widthOverrides, isHybrid, false);

        // AUTO-GENERATE JIT (ALAP) SCHEDULE
        const groups = prepareCoilGroups(activeDemands);
        const jitSchedule = calculateGlobalScheduleALAP(
          solution.results,
          activeDemands,
          config.dailyCapacityHours,
          config,
          groups
        );
        solution.globalCapacitySchedule = jitSchedule;

        // Auto-adjust start date if needed
        if (jitSchedule.length > 0) {
          const firstDay = jitSchedule[0].date;
          // Optional: Update visual config to match real start
          // setConfig(p => ({ ...p, scheduleStartDate: firstDay }));
        }

        setMultiCoilResult(solution);
      } catch (error) {
        console.error("Error en solver:", error);
        alert("Error: " + (error instanceof Error ? error.message : String(error)));
      } finally {
        setIsSolving(false);
      }
    }, 100);
  };

  const handleConfirmBatch = (widthOverrides: Record<string, number>) => {
    executeBatchOptimization(widthOverrides);
  };

  // Re-optimize a single coil from the results view
  const handleReoptimizeCoil = (coilCode: string) => {
    if (!multiCoilResult) return;
    setIsSolving(true);
    setLoadingMessage(`Re-optimizando bobina ${coilCode} (Modo Híbrido)...`);

    setTimeout(() => {
      try {
        // 1. Get demands for this coil
        const coilDemands = demands.filter(d => d.coilCode === coilCode);

        // 2. Get specific width config
        const width = batchWidthOverrides[coilCode] || config.parentWidth;
        const specificConfig = { ...config, parentWidth: width };

        // 3. Run Solver (Always Hybrid for re-optimization attempts)
        const newCoilResult = solveLinearHybrid(coilDemands, specificConfig, true);

        // 4. Update Batch Result Structure
        const updatedResults = { ...multiCoilResult.results, [coilCode]: newCoilResult };

        // Recalculate summary metrics
        let totalInput = 0;
        let totalOutput = 0;
        const updatedSummary = multiCoilResult.summary.map(s => {
          if (s.coilCode === coilCode) {
            const inp = newCoilResult.patterns.reduce((acc, p) => acc + p.totalProductionWeight, 0);
            const out = newCoilResult.patterns.reduce((acc, p) => acc + (p.totalProductionWeight * p.yieldPercentage / 100), 0);
            return {
              ...s,
              totalInputTons: inp,
              totalOutputTons: out,
              yield: inp > 0 ? (out / inp) * 100 : 0,
              waste: 100 - (inp > 0 ? (out / inp) * 100 : 0)
            };
          }
          return s;
        });

        updatedSummary.forEach(s => {
          totalInput += s.totalInputTons;
          totalOutput += s.totalOutputTons;
        });

        const newTotalYield = totalInput > 0 ? (totalOutput / totalInput) * 100 : 0;

        setMultiCoilResult({
          ...multiCoilResult,
          results: updatedResults,
          summary: updatedSummary,
          totalGlobalYield: newTotalYield,
          totalGlobalInput: totalInput,
          totalGlobalOutput: totalOutput,
          // Clear schedule because patterns changed
          globalCapacitySchedule: []
        });

      } catch (e) {
        console.error(e);
        alert("Error re-optimizando bobina");
      } finally {
        setIsSolving(false);
      }
    }, 100);
  };

  // Generate Schedule independently
  const handleGenerateSchedule = () => {
    if (!multiCoilResult) return;
    setIsSolving(true);
    setLoadingMessage("Generando programa de corte y secuencia...");

    setTimeout(() => {
      try {
        const activeDemands = demands.filter(d => d.coilCode !== RAPID_COIL_CODE);
        const groups = prepareCoilGroups(activeDemands);

        // FORCE JIT (ALAP) for manual generation too
        const schedule = calculateGlobalScheduleALAP(
          multiCoilResult.results,
          activeDemands,
          config.dailyCapacityHours,
          config,
          groups
        );

        setMultiCoilResult(prev => prev ? ({
          ...prev,
          globalCapacitySchedule: schedule
        }) : null);

      } catch (e) {
        console.error(e);
        alert("Error generando secuencia");
      } finally {
        setIsSolving(false);
      }
    }, 100);
  };

  // NEW: Smart Schedule Start Date Adjustment (JIT) - ALAP VERSION
  const handleSmartScheduleDate = () => {
    if (!multiCoilResult) return;

    setIsSolving(true);
    setLoadingMessage("Generando secuencia JIT (Backward Scheduling)...");

    setTimeout(() => {
      try {
        const activeDemands = demands.filter(d => d.coilCode !== RAPID_COIL_CODE);
        const groups = prepareCoilGroups(activeDemands);

        // DIRECT BACKWARD SCHEDULING (ALAP)
        // This naturally aligns production to (Demand - 2 days).
        let schedule = calculateGlobalScheduleALAP(
          multiCoilResult.results,
          activeDemands,
          config.dailyCapacityHours,
          config,
          groups
        );

        // Detect new Start Date based on the schedule


        setMultiCoilResult(prev => prev ? ({
          ...prev,
          globalCapacitySchedule: schedule
        }) : null);

        setLoadingMessage("Programación JIT generada exitosamente.");

      } catch (e) {
        console.error(e);
        alert("Error durante la programación inteligente");
      } finally {
        setIsSolving(false);
      }
    }, 100);
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">

      {/* Sidebar for Configuration */}
      <Sidebar
        config={config}
        setConfig={setConfig}
        isSolving={isSolving}
        onOpenMaster={() => setShowMasterModal(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">

        {/* Top Header with Calculate Button */}
        <header className="bg-white border-b border-slate-200 p-4 flex justify-between items-center shadow-sm z-10">
          <h1 className="font-bold text-lg md:text-xl text-slate-800">Planificación de Corte</h1>

          <div className="flex gap-3">
            <button
              onClick={() => handleInitiateSolve('standard')}
              disabled={isSolving}
              className={`py-2 px-6 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md ${inputMode === 'simple'
                ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-blue-900/10 text-white'
                : 'bg-orange-600 hover:bg-orange-500 active:bg-orange-700 shadow-orange-900/10 text-white'
                }`}
            >
              {isSolving ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <Calculator className="w-5 h-5" />
              )}
              {inputMode === 'simple' ? 'Optimizar Bobina Única' : 'Optimizar'}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8">

          {/* Input Section */}
          <section className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-4 h-96">
              <DemandInput
                demands={demands}
                setDemands={setDemands}
                inputMode={inputMode}
                setInputMode={setInputMode}
              />
            </div>
          </section>

          {/* Results Section (Shows result corresponding to active Tab) */}
          <section className="relative min-h-[100px]">
            {/* OVERLAY LOADER: Shows when solving AND results already exist (Re-optimization) */}
            {isSolving && activeResult && (
              <div className="absolute inset-0 z-50 bg-white/70 backdrop-blur-[2px] rounded-xl transition-all duration-300 pointer-events-none flex justify-center pt-[10vh]">
                <div className="sticky top-[20vh] h-fit flex flex-col items-center p-6 bg-white shadow-xl rounded-2xl border border-slate-100">
                  <span className="font-medium animate-pulse text-center text-lg mb-2 text-blue-600">
                    {loadingMessage}
                  </span>
                  <div className="w-64 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 animate-progress"></div>
                  </div>
                </div>
              </div>
            )}

            {/* INITIAL LOADER: Shows when solving AND no results exist (First run) */}
            {isSolving && !activeResult && (
              <div className="w-full h-64 flex flex-col items-center justify-center text-blue-600">
                <span className="font-medium animate-pulse text-center text-lg mb-2">
                  {loadingMessage}
                </span>
                <div className="w-64 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 animate-progress"></div>
                </div>
              </div>
            )}

            {/* RESULTS CONTENT: Always render if result exists, stays mounted during re-opt */}
            {activeResult && (
              <div className={isSolving ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
                <Results
                  batchResult={activeResult}
                  allDemands={demands}
                  config={config}
                  onReoptimizeCoil={handleReoptimizeCoil}
                  onGenerateSchedule={handleGenerateSchedule}
                  onSmartSchedule={handleSmartScheduleDate}
                />
              </div>
            )}

            {/* EMPTY STATE */}
            {!isSolving && !activeResult && (
              <div className="flex flex-col items-center justify-center h-64 bg-white border border-dashed border-slate-300 rounded-xl text-slate-400">
                <p>Carga la demanda en <b>{inputMode === 'simple' ? 'Rápida' : 'Multi-Bobina'}</b> y presiona "Calcular" arriba.</p>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Modal - Only triggered for Multi-Coil logic */}
      {showBatchModal && (
        <BatchConfigModal
          groups={coilGroups}
          onConfirm={handleConfirmBatch}
          onCancel={() => setShowBatchModal(false)}
        />
      )}

      <CoilMasterModal
        isOpen={showMasterModal}
        onClose={() => setShowMasterModal(false)}
      />

    </div>
  );
};

export default App;