import { useEffect, useRef } from 'react';
// @ts-ignore
import SolverWorker from '../workers/solver.worker?worker';

export const useSolver = () => {
    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        workerRef.current = new SolverWorker();
        return () => {
            workerRef.current?.terminate();
        };
    }, []);

    const execute = <T>(type: string, payload: any): Promise<T> => {
        return new Promise((resolve, reject) => {
            if (!workerRef.current) return reject("Worker not ready");

            const handler = (e: MessageEvent) => {
                // Ideally check ID, but for single-threaded blocking UI this works
                if (e.data.type === 'SUCCESS') {
                    resolve(e.data);
                } else if (e.data.type === 'ERROR') {
                    reject(e.data.error);
                }
                workerRef.current?.removeEventListener('message', handler);
            };

            workerRef.current.addEventListener('message', handler);
            workerRef.current.postMessage({ type, payload });
        });
    };

    return {
        solveBatch: (payload: any) => execute<{ result: any }>('SOLVE_BATCH', payload),
        solveBatchBestOf: (payload: any) => execute<{ result: any }>('SOLVE_BATCH_BEST_OF', payload),
        solveHybridReopt: (payload: any) => execute<{ result: any, coilCode: string }>('SOLVE_HYBRID_REOPT', payload),
        generateSchedule: (payload: any) => execute<{ result: any }>('GENERATE_SCHEDULE', payload),
        calculateLateness: (payload: any) => execute<{ result: number }>('CALCULATE_LATENESS', payload),
        prepareGroups: (payload: any) => execute<{ result: any }>('PREPARE_GROUPS', payload),
    };
};
