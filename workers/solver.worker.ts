import {
    solveBatchCuttingStock,
    solveBatchCuttingStockBestOf,
    solveLinearHybrid,
    calculateGlobalSchedule,
    calculateMaxLateness,
    prepareCoilGroups
} from '../utils/solver';

self.onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;

    try {
        switch (type) {
            case 'SOLVE_BATCH': // Multi-coil standard
                const resultBatch = solveBatchCuttingStock(
                    payload.demands,
                    payload.config,
                    payload.widthOverrides,
                    payload.minimizePatterns,
                    payload.generateSchedule
                );
                self.postMessage({ type: 'SUCCESS', result: resultBatch });
                break;

            case 'SOLVE_BATCH_BEST_OF': // Single coil rapid (best of 10)
                const resultSingle = solveBatchCuttingStockBestOf(
                    payload.demands,
                    payload.config,
                    payload.widthOverrides,
                    payload.minimizePatterns,
                    payload.maximizeYield, // maximizeYield param (was boolean in caller, seems correct)
                    payload.iterations
                );
                self.postMessage({ type: 'SUCCESS', result: resultSingle });
                break;

            case 'SOLVE_HYBRID_REOPT': // Re-optimize specific coil
                const resultHybrid = solveLinearHybrid(
                    payload.demands,
                    payload.config,
                    true // minimizePatterns
                );
                self.postMessage({ type: 'SUCCESS', result: resultHybrid, coilCode: payload.coilCode });
                break;

            case 'GENERATE_SCHEDULE':
                const resultSchedule = calculateGlobalSchedule(
                    payload.results,
                    payload.demands,
                    payload.dailyCapacity,
                    payload.config,
                    payload.groups
                );
                self.postMessage({ type: 'SUCCESS', result: resultSchedule });
                break;

            case 'CALCULATE_LATENESS':
                const lateness = calculateMaxLateness(
                    payload.schedule,
                    payload.demands
                );
                self.postMessage({ type: 'SUCCESS', result: lateness });
                break;

            case 'PREPARE_GROUPS':
                const groups = prepareCoilGroups(payload.demands);
                self.postMessage({ type: 'SUCCESS', result: groups });
                break;

            default:
                throw new Error(`Unknown action type: ${type}`);
        }
    } catch (error) {
        self.postMessage({ type: 'ERROR', error: error instanceof Error ? error.message : String(error) });
    }
};
