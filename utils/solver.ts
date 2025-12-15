
import { Demand, Pattern, OptimizationResult, SolverConfig, Cut, SolverStrategy, DailyPlan, ScheduledPattern, BatchOptimizationResult, CoilSummary, CoilGroupConfig } from '../types';
import { getCoilMasterData } from './coilMaster';
// @ts-ignore
import * as SolverLib from "javascript-lp-solver";

// Safe resolution of the Solver object depending on ESM/CJS interop
const Solver = (SolverLib as any).default || SolverLib;

const SCALE = 100;

const toInt = (n: number) => Math.round(n * SCALE);
const toFloat = (n: number) => n / SCALE;

// Python Script Constant equivalent
const TOLERANCIA_DESPERDICIO_EXTRA = 0.02; // 2% Extra coils allowed to save a pattern

// Master List of Coil Widths (Overrides description detection)
const COIL_WIDTH_MASTER_LIST: Record<string, number> = {
    "100436": 1213,
    "100437": 1213,
    "100438": 1212,
    "100443": 1213,
    "100448": 1213,
    "100449": 1213,
    "100450": 1216,
    "100452": 1517,
    "100457": 1213,
    "100479": 1204,
    "100481": 1204,
    "100482": 1204,
    "100484": 1204,
    "100486": 1205,
    "100487": 1204,
    "100489": 1204,
    "100490": 1205,
    "100499": 1204,
    "100501": 1204,
    "100502": 1202,
    "100565": 1213,
    "100585": 1213,
    "100603": 1204,
    "100610": 1204,
    "100613": 1204,
    "100647": 1220,
    "100648": 1214,
    "102170": 1204,
    "102171": 1203,
    "102290": 1204,
    "102302": 1204,
    "102390": 1213,
    "102394": 1213,
    "102395": 1212,
    "102770": 1203,
    "103130": 1010,
    "103150": 1187,
    "103200": 1160,
    "103230": 1214,
    "103232": 1215,
    "103250": 1214,
    "103255": 1205,
    "103256": 1205,
    "103260": 1257,
    "103290": 1205,
    "103292": 1204,
    "103293": 1204,
    "103294": 1215,
    "103315": 1205,
    "103318": 1205,
    "103330": 1214,
    "103392": 1205,
    "103394": 1205,
    "103395": 1204,
    "103396": 1204,
    "103397": 1204,
    "103398": 1216,
    "103399": 1208,
    "103410": 1050,
    "103460": 1204
};

const calculateStripWeight = (stripWidth: number, parentWidth: number, parentWeight: number): number => {
    if (parentWidth === 0) return 0;
    return (stripWidth / parentWidth) * parentWeight;
};

/**
 * HELPER: Recursive Pattern Generator
 * Generates combinations that fit within usableWidth with high efficiency.
 */
const generateDensePatterns = (
    demands: Demand[],
    usableWidthInt: number,
    maxCuts: number
): number[][] => {
    const demandWidths = demands.map(d => toInt(d.width));
    const patterns: number[][] = [];

    // We limit recursion to avoid browser freeze on large inputs
    const MAX_PATTERNS = 2000;
    let attempts = 0;

    const find = (currentCounts: number[], currentSum: number, startIndex: number, depth: number) => {
        attempts++;
        if (patterns.length >= MAX_PATTERNS || attempts > 500000) return;

        const waste = usableWidthInt - currentSum;

        // Save if waste is very low (e.g. < 2%)
        if (waste < usableWidthInt * 0.02) {
            patterns.push([...currentCounts]);
        }

        // Stop if full or max cuts reached
        if (depth >= maxCuts || waste === 0) return;

        for (let i = startIndex; i < demandWidths.length; i++) {
            const w = demandWidths[i];

            if (currentSum + w <= usableWidthInt) {
                currentCounts[i]++;
                find(currentCounts, currentSum + w, i, depth + 1);
                currentCounts[i]--;
            }
        }
    };

    const initialCounts = new Array(demands.length).fill(0);
    find(initialCounts, 0, 0, 0);
    return patterns;
};

/**
 * Helper to run the LP Solver on a specific set of patterns
 * REVERTED: Using standard bounds (Min/Max) based on Target Tons.
 */
const runLP = (
    patterns: Pattern[],
    demands: Demand[],
    config: SolverConfig,
    effectiveToleranceMin: number,
    effectiveToleranceMax: number
): { feasible: boolean, solutionMap: Record<number, number>, totalCoils: number } => {

    const lpConstraints: Record<string, { min?: number, max?: number }> = {};
    const lpVariables: Record<string, any> = {};

    // Setup Constraints (Demand)
    demands.forEach(d => {
        const minVal = Math.max(0, d.targetTons * (1 - effectiveToleranceMin / 100));
        const maxVal = d.targetTons * (1 + effectiveToleranceMax / 100);

        // Allow tiny residues to be skipped to prevent infeasibility on rounding errors
        if (d.targetTons < 0.5) {
            lpConstraints[d.id] = { min: 0, max: maxVal };
        } else {
            lpConstraints[d.id] = { min: minVal, max: maxVal };
        }
    });

    // Setup Variables (Patterns)
    patterns.forEach((p) => {
        const varName = `pat_${p.id}`;
        const variableData: any = { cost: 1 }; // Minimize Coils

        p.cuts.forEach(c => {
            const demandId = `agg-${c.width}`;
            if (lpConstraints[demandId]) {
                variableData[demandId] = c.count * c.weightPerCut;
            }
        });

        lpVariables[varName] = variableData;
    });

    const model = {
        optimize: "cost",
        opType: "min",
        constraints: lpConstraints,
        variables: lpVariables
    };

    let solverResult;
    try {
        solverResult = Solver.Solve(model);
    } catch (e) {
        return { feasible: false, solutionMap: {}, totalCoils: 0 };
    }

    if (!solverResult || !solverResult.feasible) {
        return { feasible: false, solutionMap: {}, totalCoils: 0 };
    }

    // Extract solution
    const solutionMap: Record<number, number> = {};
    Object.keys(solverResult).forEach(key => {
        if (key.startsWith("pat_")) {
            const pid = parseInt(key.replace("pat_", ""));
            const val = solverResult[key];
            if (val > 0.00001) {
                solutionMap[pid] = val;
            }
        }
    });

    return {
        feasible: true,
        solutionMap,
        totalCoils: solverResult.result
    };
};

/**
 * PHASE 1: Generate optimal patterns + Initial Solve
 */
const solveLinearPhase = (
    aggregatedDemands: Demand[],
    config: SolverConfig,
    overrideTolerance?: number
): { patterns: Pattern[], fulfillment: Record<number, number>, error?: string, rawSolution?: Record<number, number> } => {

    const parentWidthInt = toInt(config.parentWidth);
    const edgeTrimInt = toInt(config.edgeTrim);
    const usableWidthInt = parentWidthInt - edgeTrimInt;
    const maxCuts = config.maxCuts || 16;
    const effectiveToleranceMin = overrideTolerance !== undefined ? overrideTolerance : (config.toleranceMin !== undefined ? config.toleranceMin : 10);
    const effectiveToleranceMax = overrideTolerance !== undefined ? overrideTolerance : (config.toleranceMax !== undefined ? config.toleranceMax : 10);

    const uniquePatterns: Record<string, number[]> = {};

    const addPattern = (counts: number[]) => {
        const key = counts.join(',');
        if (!uniquePatterns[key]) uniquePatterns[key] = counts;
    };

    // A. Single Widths
    aggregatedDemands.forEach((d, i) => {
        const wInt = toInt(d.width);
        if (wInt <= usableWidthInt) {
            let count = Math.floor(usableWidthInt / wInt);
            if (count > maxCuts) count = maxCuts;
            if (count > 0) {
                const pat = new Array(aggregatedDemands.length).fill(0);
                pat[i] = count;
                addPattern(pat);
            }
        }
    });

    // B. Heuristic Generation (Standard)
    const ITERATIONS = 5000;
    for (let i = 0; i < ITERATIONS; i++) {
        const pat = new Array(aggregatedDemands.length).fill(0);
        let currentRemaining = usableWidthInt;
        let currentCuts = 0;

        const indices = Array.from({ length: aggregatedDemands.length }, (_, k) => k)
            .sort(() => Math.random() - 0.5);

        for (const idx of indices) {
            if (currentCuts >= maxCuts) break;
            const wInt = toInt(aggregatedDemands[idx].width);
            if (wInt <= currentRemaining) {
                let maxByWidth = Math.floor(currentRemaining / wInt);
                const allowedCuts = maxCuts - currentCuts;
                let maxC = Math.min(maxByWidth, allowedCuts);
                if (maxC > 0) {
                    let count = Math.floor(Math.random() * maxC) + 1;
                    if (count > 0) {
                        pat[idx] += count;
                        currentRemaining -= count * wInt;
                        currentCuts += count;
                    }
                }
            }
        }
        if (currentRemaining < usableWidthInt * 0.05) addPattern(pat);
    }

    // C. Dense Generation (High Quality)
    const sortedIndices = Array.from({ length: aggregatedDemands.length }, (_, k) => k)
        .sort((a, b) => aggregatedDemands[b].width - aggregatedDemands[a].width);
    const sortedDemands = sortedIndices.map(i => aggregatedDemands[i]);
    const denseRawPatterns = generateDensePatterns(sortedDemands, usableWidthInt, maxCuts);

    denseRawPatterns.forEach(densePat => {
        const originalPat = new Array(aggregatedDemands.length).fill(0);
        densePat.forEach((count, sortedIdx) => {
            originalPat[sortedIndices[sortedIdx]] = count;
        });
        addPattern(originalPat);
    });

    // 2. Build Objects
    const allGeneratedPatterns: Pattern[] = [];
    Object.values(uniquePatterns).forEach((counts, idx) => {
        const cuts: Cut[] = [];
        let usedWidthInt = 0;
        counts.forEach((c, i) => {
            if (c > 0) {
                const d = aggregatedDemands[i];
                const wPerCut = calculateStripWeight(d.width, config.parentWidth, config.parentWeight);
                cuts.push({ width: d.width, count: c, weightPerCut: wPerCut });
                usedWidthInt += c * toInt(d.width);
            }
        });

        allGeneratedPatterns.push({
            id: idx + 1,
            cuts: cuts.sort((a, b) => b.width - a.width),
            assignedCoils: 0,
            usedWidth: toFloat(usedWidthInt),
            wasteWidth: toFloat(usableWidthInt - usedWidthInt + edgeTrimInt),
            yieldPercentage: (toFloat(usedWidthInt) / config.parentWidth) * 100,
            totalProductionWeight: 0
        });
    });

    // 3. Solve Initial LP
    const lpResult = runLP(allGeneratedPatterns, aggregatedDemands, config, effectiveToleranceMin, effectiveToleranceMax);

    if (!lpResult.feasible) {
        return { patterns: [], fulfillment: {}, error: "Infeasible" };
    }

    // 4. Construct Result
    const finalPatterns: Pattern[] = [];
    const fulfillment: Record<number, number> = {};
    aggregatedDemands.forEach(d => fulfillment[d.width] = 0);

    allGeneratedPatterns.forEach(p => {
        const rawCoils = lpResult.solutionMap[p.id];
        if (rawCoils) {
            p.assignedCoils = rawCoils;
            p.totalProductionWeight = rawCoils * config.parentWeight;
            p.cuts.forEach(c => {
                fulfillment[c.width] = (fulfillment[c.width] || 0) + (rawCoils * c.count * c.weightPerCut);
            });
            finalPatterns.push(p);
        }
    });

    return {
        patterns: finalPatterns,
        fulfillment,
        rawSolution: lpResult.solutionMap
    };
};

// --- CORE SOLVER WRAPPER (Local) ---
export const solveLinearHybrid = (demands: Demand[], config: SolverConfig, minimizePatterns: boolean = false): OptimizationResult => {
    // 1. Aggregate Demands
    const aggregatedMap: Record<number, number> = {};
    demands.forEach(d => {
        aggregatedMap[d.width] = (aggregatedMap[d.width] || 0) + d.targetTons;
    });

    const aggregatedDemands: Demand[] = Object.entries(aggregatedMap).map(([width, tons]) => ({
        id: `agg-${width}`,
        width: parseFloat(width),
        targetTons: tons,
        date: ''
    }));

    // === PHASE 1: BASE SOLUTION ===
    let bestResult = solveLinearPhase(aggregatedDemands, config);

    if (bestResult.error || !bestResult.patterns.length) {
        return {
            patterns: [],
            fulfillment: {},
            totalCoilsUsed: 0,
            globalYield: 0,
            globalWaste: 0,
            unmetDemands: ["No solution found"],
            schedule: [],
            capacitySchedule: []
        };
    }

    // === PHASE 2: REDUCTION STRATEGY (Gilmore-Gomory style) ===

    // Calculate Base Cost
    const baseCoils = bestResult.patterns.reduce((sum, p) => sum + p.assignedCoils, 0);
    const maxCoilsAllowed = baseCoils * (1 + TOLERANCIA_DESPERDICIO_EXTRA);

    let activePatterns = [...bestResult.patterns];
    let currentSolutionMap = bestResult.rawSolution || {};

    let improvementFound = true;
    let iterations = 0;
    const MAX_ITERATIONS = 50;

    while (improvementFound && iterations < MAX_ITERATIONS) {
        iterations++;
        improvementFound = false;

        // 1. Filter currently active
        const usedPatterns = activePatterns.filter(p => (currentSolutionMap[p.id] || 0) > 0.0001);

        if (usedPatterns.length <= 1) break;

        // 2. Sort by usage ASC
        usedPatterns.sort((a, b) => (currentSolutionMap[a.id] || 0) - (currentSolutionMap[b.id] || 0));

        const candidate = usedPatterns[0];

        // 3. Test Set
        const testSet = activePatterns.filter(p => p.id !== candidate.id);

        // 4. Solve LP
        // REVERTED: Using standard config tolerance
        const minTol = config.toleranceMin !== undefined ? config.toleranceMin : 10;
        const maxTol = config.toleranceMax !== undefined ? config.toleranceMax : 10;
        const resTest = runLP(testSet, aggregatedDemands, config, minTol, maxTol);

        if (resTest.feasible) {
            // 5. Check Criteria
            if (resTest.totalCoils <= maxCoilsAllowed) {
                activePatterns = testSet;
                currentSolutionMap = resTest.solutionMap;
                improvementFound = true;
            }
        }
    }

    // === PHASE 3: FINALIZE ===
    const finalPatterns: Pattern[] = [];
    const finalFulfillment: Record<number, number> = {};
    aggregatedDemands.forEach(d => finalFulfillment[d.width] = 0);

    activePatterns.forEach(p => {
        const rawCoils = currentSolutionMap[p.id];
        if (rawCoils > 0.0001) {
            const newP = { ...p, assignedCoils: rawCoils, totalProductionWeight: rawCoils * config.parentWeight };
            newP.cuts.forEach(c => {
                finalFulfillment[c.width] = (finalFulfillment[c.width] || 0) + (rawCoils * c.count * c.weightPerCut);
            });
            finalPatterns.push(newP);
        }
    });

    const totalCoilsUsed = finalPatterns.reduce((acc, p) => acc + p.assignedCoils, 0);
    const totalInput = totalCoilsUsed * config.parentWeight;
    const totalOutput = finalPatterns.reduce((acc, p) => {
        const patOutput = p.totalProductionWeight * (p.yieldPercentage / 100);
        return acc + patOutput;
    }, 0);

    const globalYield = totalInput > 0 ? (totalOutput / totalInput) * 100 : 0;

    const unmetDemands = aggregatedDemands.filter(d => {
        const produced = finalFulfillment[d.width] || 0;
        const minTol = config.toleranceMin !== undefined ? config.toleranceMin : 10;
        const minReq = d.targetTons * (1 - minTol / 100);
        return produced < minReq - 0.1;
    }).map(d => `Ancho ${d.width}: ${finalFulfillment[d.width]?.toFixed(1)} / ${d.targetTons} T`);

    return {
        patterns: finalPatterns.sort((a, b) => b.assignedCoils - a.assignedCoils),
        fulfillment: finalFulfillment,
        totalCoilsUsed,
        globalYield,
        globalWaste: 100 - globalYield,
        unmetDemands,
        schedule: [],
        capacitySchedule: []
    };
};

// --- GLOBAL SEQUENCING (Exported for individual use) ---

export const calculateGlobalSchedule = (
    allResults: Record<string, OptimizationResult>,
    allDemands: Demand[],
    globalCapacity: number,
    baseConfig: SolverConfig,
    coilGroupConfigs: CoilGroupConfig[]
): DailyPlan[] => {

    // 1. Setup Coil Description Map
    const descriptionMap: Record<string, string> = {};
    coilGroupConfigs.forEach(g => {
        descriptionMap[g.coilCode] = g.description;
    });

    // 2. Prepare Demand Tracking for Granular Urgency
    // Map: CoilCode -> Width -> [{date, tons}, {date, tons}...] sorted by date
    // We group by coil code because patterns are coil-specific
    const demandsByCoil: Record<string, Demand[]> = {};
    allDemands.forEach(d => {
        const code = d.coilCode || 'DEFAULT';
        if (!demandsByCoil[code]) demandsByCoil[code] = [];
        demandsByCoil[code].push(d);
    });

    const demandTrackers: Record<string, Record<number, { date: number, tons: number }[]>> = {};

    Object.keys(demandsByCoil).forEach(code => {
        demandTrackers[code] = {};
        demandsByCoil[code].forEach(d => {
            if (!demandTrackers[code][d.width]) demandTrackers[code][d.width] = [];
            // Track positive net demand (Target Tons)
            if (d.targetTons > 0.001) {
                // USER REQUEST: Ideal llegar 2 días antes
                // We shift the target urgency back by 2 days (48 hours)
                const BUFFER_MS = 2 * 24 * 60 * 60 * 1000;

                demandTrackers[code][d.width].push({
                    date: new Date(d.date).getTime() - BUFFER_MS,
                    tons: d.targetTons
                });
            }
        });
        // Sort each list by date ascending (Earliest Deadline First)
        Object.values(demandTrackers[code]).forEach(list => list.sort((a, b) => a.date - b.date));
    });

    interface QueueItem {
        pattern: Pattern;
        patternId: number;
        coilCode: string;
        weight: number;
        urgency: number;
        coilConfig: SolverConfig;
    }

    const queue: QueueItem[] = [];

    // 3. Populate Queue with Smart Urgency Assignment
    Object.entries(allResults).forEach(([code, res]) => {
        res.patterns.forEach(p => {
            // We expand the pattern into N individual coil tasks.
            // For Scheduling, we must convert the float assignedCoils to Integers or handle blocks.
            // Since production is usually discrete (1 coil), we ceil the float result for scheduling purposes.
            const coilsToSchedule = Math.ceil(p.assignedCoils);

            // For each coil, we check which earliest demand it satisfies and assign urgency.
            // We then "consume" that demand from our tracker so the NEXT coil gets the next deadline.

            for (let i = 0; i < coilsToSchedule; i++) {
                let bestUrgency = Infinity;

                // First pass: Determine Urgency (Peek)
                p.cuts.forEach(cut => {
                    const tracker = demandTrackers[code]?.[cut.width];
                    if (tracker && tracker.length > 0) {
                        // Look at the head of the demand queue for this width
                        // Skip fully satisfied demands (tiny rounding errors)
                        let tIdx = 0;
                        while (tIdx < tracker.length && tracker[tIdx].tons <= 0.001) {
                            tIdx++;
                        }

                        if (tIdx < tracker.length) {
                            const dDate = tracker[tIdx].date;
                            if (dDate < bestUrgency) bestUrgency = dDate;
                        }
                    }
                });

                // If no demand left (Stock production), assign very low priority
                const assignedUrgency = bestUrgency === Infinity ? 9999999999999 : bestUrgency;

                // Second pass: Consume Demand (Deduct)
                p.cuts.forEach(cut => {
                    const tracker = demandTrackers[code]?.[cut.width];
                    if (tracker) {
                        let amountToDeduct = cut.weightPerCut; // Amount produced by 1 coil of this cut

                        for (let k = 0; k < tracker.length; k++) {
                            if (amountToDeduct <= 0) break;
                            if (tracker[k].tons > 0.001) {
                                const take = Math.min(tracker[k].tons, amountToDeduct);
                                tracker[k].tons -= take;
                                amountToDeduct -= take;
                            }
                        }
                    }
                });

                queue.push({
                    pattern: p,
                    patternId: p.id,
                    coilCode: code,
                    weight: p.totalProductionWeight / p.assignedCoils, // Weight of 1 coil
                    urgency: assignedUrgency,
                    coilConfig: baseConfig
                });
            }
        });
    });

    // 4. Sort Queue
    // Primary: Urgency (Date)
    // Secondary: Pattern ID (Keep batches together if urgencies are identical)
    queue.sort((a, b) => {
        const diff = a.urgency - b.urgency;
        // If urgency difference is significant (more than a few seconds/minutes), prioritize urgency
        if (Math.abs(diff) > 1000) return diff;

        // If dates are basically the same, prioritize grouping by Coil Code then Pattern ID to minimize setup thrashing
        if (a.coilCode !== b.coilCode) return a.coilCode.localeCompare(b.coilCode);
        return a.patternId - b.patternId;
    });

    if (queue.length === 0) return [];

    // 5. Fill Schedule Buckets
    const schedule: DailyPlan[] = [];
    const setupPenalty = baseConfig.setupPenalty || 0;

    let currentDateStr = baseConfig.scheduleStartDate || new Date().toISOString().split('T')[0];

    const nextDay = (d: string) => {
        const date = new Date(d);
        // Use UTC date manipulation to avoid timezone shifts
        const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
        return next.toISOString().split('T')[0];
    };

    let queueIndex = 0;

    // Safety brake
    let dayCount = 0;
    const MAX_DAYS = 365;

    while (queueIndex < queue.length && dayCount < MAX_DAYS) {
        const dayPlan: DailyPlan = {
            date: currentDateStr,
            patterns: [],
            totalTons: 0,
            producedItems: {},
            dailyYield: 0,
            capacityUsedPercent: 0,
            setupPenaltyTons: 0
        };

        const patternsInDay = new Set<string>();
        let dayInputWeight = 0;
        let dayFilled = false;

        // CHECK IF SUNDAY
        // getUTCDay: 0=Sunday, 1=Monday...
        const isSunday = new Date(currentDateStr).getUTCDay() === 0;

        // Effective Daily Capacity Adjustment
        // Sundays work only 1 shift -> 50% capacity
        const currentDailyCapacity = isSunday ? globalCapacity * 0.5 : globalCapacity;

        // Track the LAST pattern used to detect setup changes
        // Note: For simplicity in daily capacity calc, we stick to the penalty rule:
        // "Lose X tons capacity per unique pattern per day"
        // This is a proxy for setup time.

        while (queueIndex < queue.length && !dayFilled) {
            const item = queue[queueIndex];
            const patternKey = `${item.coilCode}-${item.patternId}`;

            const isNewPattern = !patternsInDay.has(patternKey);
            // Check if adding this pattern (and its penalty if new) exceeds capacity
            const currentPenalties = patternsInDay.size * setupPenalty;
            const additionalPenalty = isNewPattern ? setupPenalty : 0;

            const effectiveCapacity = currentDailyCapacity - (currentPenalties + additionalPenalty);

            // Check fit
            if (dayPlan.totalTons + item.weight > effectiveCapacity) {
                // If the day is empty but we can't fit even one item due to massive penalty/weight?
                // We must fit at least one if it fits within raw capacity?
                if (dayPlan.totalTons === 0 && item.weight <= currentDailyCapacity) {
                    // Force fit single item
                } else {
                    dayFilled = true;
                    break;
                }
            }

            // Add to day
            if (isNewPattern) {
                patternsInDay.add(patternKey);
            }

            // Aggregate into DailyPlan structure
            const existing = dayPlan.patterns.find(p => p.patternId === item.patternId && p.coilCode === item.coilCode);
            if (existing) {
                existing.coils++;
            } else {
                dayPlan.patterns.push({
                    patternId: item.patternId,
                    coils: 1,
                    pattern: item.pattern,
                    coilCode: item.coilCode,
                    coilDescription: descriptionMap[item.coilCode] || 'Sin descripción'
                });
            }

            dayPlan.totalTons += item.weight;
            dayInputWeight += item.weight / (item.pattern.yieldPercentage / 100);

            item.pattern.cuts.forEach(cut => {
                const amt = cut.weightPerCut;
                dayPlan.producedItems[cut.width] = (dayPlan.producedItems[cut.width] || 0) + amt;
            });

            queueIndex++;
        }

        dayPlan.setupPenaltyTons = patternsInDay.size * setupPenalty;

        // Calculate visuals (Use the specific day capacity for percentage including penalty)
        const finalEffectiveCapacity = currentDailyCapacity;
        dayPlan.capacityUsedPercent = ((dayPlan.totalTons + dayPlan.setupPenaltyTons) / finalEffectiveCapacity) * 100;

        if (dayInputWeight > 0) {
            const realOutput = dayPlan.patterns.reduce((acc, p) => {
                const patYield = p.pattern.yieldPercentage / 100;
                // For scheduler we use 'p.coils' (int) * weight per coil
                const weightPerCoil = p.pattern.totalProductionWeight / p.pattern.assignedCoils;
                const patInput = p.coils * weightPerCoil;
                return acc + (patInput * patYield);
            }, 0);
            dayPlan.dailyYield = (realOutput / dayPlan.totalTons) * 100;
        }

        schedule.push(dayPlan);
        currentDateStr = nextDay(currentDateStr);
        dayCount++;
    }

    return schedule;
};


// --- BATCH SOLVER TOOLS ---
const extractWidthFromDescription = (desc: string): number | null => {
    if (!desc) return null;
    const descUpper = desc.toUpperCase();
    const regex = /\b(\d{3,4})\s*MM\b/g;
    const matches = [...descUpper.matchAll(regex)];

    let width: number | null = null;
    if (matches.length > 0) {
        const widths = matches.map(m => parseInt(m[1])).filter(w => w > 600 && w < 2500);
        if (widths.length > 0) width = Math.max(...widths);
    }
    if (width === 1200 && descUpper.includes('BLAC')) {
        return 1210;
    }
    return width;
};

export const prepareCoilGroups = (allDemands: Demand[]): CoilGroupConfig[] => {
    const groups: Record<string, CoilGroupConfig> = {};

    allDemands.forEach(d => {
        const code = d.coilCode || 'DEFAULT';
        if (!groups[code]) {
            // 1. Start with Default
            let detectedWidth = 1200;

            // 2. Check Master List (Dynamic)
            const masterData = getCoilMasterData();
            const masterEntry = masterData.find(m => m.code === code);

            if (masterEntry) {
                detectedWidth = masterEntry.width;
            } else {
                // 3. Fallback to description extraction
                const extracted = extractWidthFromDescription(d.coilDescription || '');
                if (extracted) detectedWidth = extracted;
            }

            groups[code] = {
                coilCode: code,
                description: d.coilDescription || 'Bobina Genérica',
                detectedWidth,
                totalDemand: 0
            };
        }
        groups[code].totalDemand += d.targetTons;
    });

    return Object.values(groups).sort((a, b) => b.totalDemand - a.totalDemand);
};

export const solveBatchCuttingStock = (
    allDemands: Demand[],
    baseConfig: SolverConfig,
    widthOverrides?: Record<string, number>,
    minimizePatterns: boolean = false,
    generateSchedule: boolean = false
): BatchOptimizationResult => {

    const groups = prepareCoilGroups(allDemands);
    const groupedDemands: Record<string, Demand[]> = {};

    allDemands.forEach(d => {
        const code = d.coilCode || 'DEFAULT';
        if (!groupedDemands[code]) groupedDemands[code] = [];
        groupedDemands[code].push(d);
    });

    const results: Record<string, OptimizationResult> = {};
    const summary: CoilSummary[] = [];

    let totalGlobalInput = 0;
    let totalGlobalOutput = 0;

    groups.forEach(group => {
        const code = group.coilCode;
        const demands = groupedDemands[code];

        let finalWidth = baseConfig.parentWidth;
        if (widthOverrides && widthOverrides[code]) {
            finalWidth = widthOverrides[code];
        } else if (group.detectedWidth) {
            finalWidth = group.detectedWidth;
        }

        const dynamicConfig = { ...baseConfig, parentWidth: finalWidth };

        const result = solveLinearHybrid(demands, dynamicConfig, minimizePatterns);

        const input = result.patterns.reduce((acc, p) => acc + p.totalProductionWeight, 0);
        const output = result.patterns.reduce((acc, p) => {
            const patternOutput = p.totalProductionWeight * (p.yieldPercentage / 100);
            return acc + patternOutput;
        }, 0);

        result.globalYield = input > 0 ? (output / input) * 100 : 0;
        result.globalWaste = 100 - result.globalYield;

        results[code] = result;

        totalGlobalInput += input;
        totalGlobalOutput += output;

        summary.push({
            coilCode: code,
            description: group.description,
            totalInputTons: input,
            totalOutputTons: output,
            yield: result.globalYield,
            waste: result.globalWaste,
            parentWidth: dynamicConfig.parentWidth
        });
    });

    let globalSchedule: DailyPlan[] = [];

    // Only generate schedule if requested (Decoupling)
    if (generateSchedule) {
        globalSchedule = calculateGlobalSchedule(
            results,
            allDemands,
            baseConfig.dailyCapacity,
            baseConfig,
            groups
        );
    }

    const totalGlobalYield = totalGlobalInput > 0 ? (totalGlobalOutput / totalGlobalInput) * 100 : 0;

    return {
        summary: summary.sort((a, b) => b.totalInputTons - a.totalInputTons),
        results,
        isBatch: true,
        totalGlobalYield,
        totalGlobalInput,
        totalGlobalOutput,
        globalCapacitySchedule: globalSchedule
    };
};

/**
 * Executes the solver N times and returns the best result based on Yield.
 */
export const solveBatchCuttingStockBestOf = (
    allDemands: Demand[],
    baseConfig: SolverConfig,
    widthOverrides?: Record<string, number>,
    minimizePatterns: boolean = false,
    generateSchedule: boolean = false,
    attempts: number = 10
): BatchOptimizationResult => {

    let bestResult: BatchOptimizationResult | null = null;

    for (let i = 0; i < attempts; i++) {
        const currentResult = solveBatchCuttingStock(
            allDemands,
            baseConfig,
            widthOverrides,
            minimizePatterns,
            generateSchedule
        );

        if (!bestResult) {
            bestResult = currentResult;
            continue;
        }

        // Criteria 1: Maximize Yield
        // We use a small epsilon for floating point comparison consistency
        if (currentResult.totalGlobalYield > bestResult.totalGlobalYield + 0.001) {
            bestResult = currentResult;
        }
        // Criteria 2: If Yield is virtually identical, Minimize Complexity (Total Patterns count)
        else if (Math.abs(currentResult.totalGlobalYield - bestResult.totalGlobalYield) <= 0.001) {

            const countPatterns = (res: BatchOptimizationResult) => {
                return Object.values(res.results).reduce((acc, r) => acc + r.patterns.length, 0);
            };

            const currentPatterns = countPatterns(currentResult);
            const bestPatterns = countPatterns(bestResult);

            if (currentPatterns < bestPatterns) {
                bestResult = currentResult;
            }
        }
    }

    return bestResult!;
};

/**
 * Calculates the max days any item is late (or if everyone is early).
 * Returns positive integer for Days Late (Shift Back needed).
 * Returns negative integer for All Early (Shift Forward possible).
 */
export const calculateMaxLateness = (schedule: DailyPlan[], demands: Demand[]): number => {
    // 1. Flatten production log
    const productionLog: Record<string, Record<number, { date: string, tons: number }[]>> = {};

    schedule.forEach(day => {
        day.patterns.forEach((p: any) => {
            const code = p.coilCode;
            p.pattern.cuts.forEach((c: any) => {
                if (!productionLog[code]) productionLog[code] = {};
                if (!productionLog[code][c.width]) productionLog[code][c.width] = [];

                const tons = c.weightPerCut * c.count * p.coils;
                productionLog[code][c.width].push({
                    date: day.date,
                    tons: tons
                });
            });
        });
    });

    let maxLateness = -Infinity;
    let hasDemand = false;

    // USER REQUEST: Validamos contra la fecha objetivo ajustada (2 días antes)
    const BUFFER_MS = 2 * 24 * 60 * 60 * 1000;

    demands.forEach(d => {
        if (d.targetTons <= 0.01) return;
        hasDemand = true;

        const code = d.coilCode || 'DEFAULT';
        const availableProduction = productionLog[code]?.[d.width] || [];

        // If not produced at all, treat as infinitely late (or handle via infeasibility check outside)
        if (availableProduction.length === 0) return;

        // Earliest production for this demand chunk
        const earliest = availableProduction.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

        const dDate = new Date(d.date).getTime() - BUFFER_MS; // Target is now 2 days earlier
        const pDate = new Date(earliest.date).getTime();

        // Diff = Production - Demand (Adjusted)
        // Positive = Late (Missed the T-2 target)
        // Negative = Early (Beat the T-2 target)
        const diffTime = pDate - dDate;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > maxLateness) maxLateness = diffDays;
    });

    return hasDemand ? maxLateness : 0;
};

/**
 * JIT SCHEDULER - SIMPLIFIED VERSION
 * Produces items as late as possible (2 days before demand).
 * Only moves production earlier if capacity is full.
 */
export const calculateGlobalScheduleALAP = (
    allResults: Record<string, OptimizationResult>,
    allDemands: Demand[],
    globalCapacity: number,
    baseConfig: SolverConfig,
    coilGroupConfigs: CoilGroupConfig[]
): DailyPlan[] => {

    const JIT_BUFFER_DAYS = 2;
    const DAY_MS = 24 * 60 * 60 * 1000;

    // 1. Setup Coil Description Map
    const descriptionMap: Record<string, string> = {};
    coilGroupConfigs.forEach(g => {
        descriptionMap[g.coilCode] = g.description;
    });

    // 2. Build Direct Demand Lookup: (coilCode, widthKey) -> earliest demand date (ms)
    // This is the KEY FIX: directly read demand dates instead of complex tracking
    const demandDateLookup: Record<string, Record<number, number>> = {};

    allDemands.forEach(d => {
        const code = d.coilCode || 'DEFAULT';
        const wKey = Math.round(d.width * 100); // Integer key for precision
        const dateMs = new Date(d.date).getTime();

        if (!demandDateLookup[code]) demandDateLookup[code] = {};

        // Keep the EARLIEST date for each (coilCode, width)
        if (!demandDateLookup[code][wKey] || dateMs < demandDateLookup[code][wKey]) {
            demandDateLookup[code][wKey] = dateMs;
        }
    });

    // 3. Create Task Queue with Correct Target Dates
    interface ScheduleTask {
        pattern: Pattern;
        patternId: number;
        coilCode: string;
        weightPerCoil: number;
        targetDateMs: number; // When this should be produced (JIT)
    }

    const tasks: ScheduleTask[] = [];

    Object.entries(allResults).forEach(([coilCode, result]) => {
        result.patterns.forEach(pattern => {
            // Find the EARLIEST demand date among all cuts in this pattern
            let earliestDemandMs = Infinity;

            pattern.cuts.forEach(cut => {
                const wKey = Math.round(cut.width * 100);
                const demandDate = demandDateLookup[coilCode]?.[wKey];
                if (demandDate && demandDate < earliestDemandMs) {
                    earliestDemandMs = demandDate;
                }
            });

            // If no demand found, use a far future date (stock items)
            if (earliestDemandMs === Infinity) {
                earliestDemandMs = new Date('2030-12-31').getTime();
            }

            // Calculate JIT target: Demand - Buffer
            const targetDateMs = earliestDemandMs - (JIT_BUFFER_DAYS * DAY_MS);

            // Expand pattern into individual coil tasks
            const coilsToSchedule = Math.ceil(pattern.assignedCoils);
            const weightPerCoil = pattern.totalProductionWeight / pattern.assignedCoils;

            for (let i = 0; i < coilsToSchedule; i++) {
                tasks.push({
                    pattern,
                    patternId: pattern.id,
                    coilCode,
                    weightPerCoil,
                    targetDateMs
                });
            }
        });
    });

    if (tasks.length === 0) return [];

    // 4. Sort Tasks by Target Date DESCENDING (latest first for ALAP)
    tasks.sort((a, b) => b.targetDateMs - a.targetDateMs);

    // 5. Initialize Schedule Map
    const scheduleMap: Record<string, DailyPlan> = {};
    const setupPenalty = baseConfig.setupPenalty || 0;

    const getDayPlan = (dateStr: string): DailyPlan => {
        if (!scheduleMap[dateStr]) {
            scheduleMap[dateStr] = {
                date: dateStr,
                patterns: [],
                totalTons: 0,
                producedItems: {},
                dailyYield: 0,
                capacityUsedPercent: 0,
                setupPenaltyTons: 0
            };
        }
        return scheduleMap[dateStr];
    };

    const msToDateStr = (ms: number): string => {
        return new Date(ms).toISOString().split('T')[0];
    };

    const getCapacityForDay = (dateStr: string): number => {
        const dayOfWeek = new Date(dateStr + 'T12:00:00Z').getUTCDay();
        return dayOfWeek === 0 ? globalCapacity * 0.5 : globalCapacity;
    };

    // 6. Place Each Task in Calendar (ALAP)
    tasks.forEach(task => {
        let candidateDateMs = task.targetDateMs;
        let placed = false;
        let attempts = 0;
        const MAX_LOOKBACK = 365 * 2;

        while (!placed && attempts < MAX_LOOKBACK) {
            const candidateDateStr = msToDateStr(candidateDateMs);
            const dayPlan = getDayPlan(candidateDateStr);
            const rawCapacity = getCapacityForDay(candidateDateStr);

            // Calculate setup penalty for this day
            const patternKey = `${task.coilCode}-${task.patternId}`;
            const existingPatterns = new Set(dayPlan.patterns.map(p => `${p.coilCode}-${p.patternId}`));
            const willAddNewPattern = !existingPatterns.has(patternKey);

            const projectedPenalty = (existingPatterns.size + (willAddNewPattern ? 1 : 0)) * setupPenalty;
            const availableCapacity = rawCapacity - projectedPenalty;

            // Check if task fits
            if (dayPlan.totalTons + task.weightPerCoil <= availableCapacity) {
                placed = true;

                // Add to day plan
                const existingPattern = dayPlan.patterns.find(
                    p => p.patternId === task.patternId && p.coilCode === task.coilCode
                );

                if (existingPattern) {
                    existingPattern.coils++;
                } else {
                    dayPlan.patterns.push({
                        patternId: task.patternId,
                        coils: 1,
                        pattern: task.pattern,
                        coilCode: task.coilCode,
                        coilDescription: descriptionMap[task.coilCode] || ''
                    });
                }

                dayPlan.totalTons += task.weightPerCoil;
                task.pattern.cuts.forEach(cut => {
                    dayPlan.producedItems[cut.width] =
                        (dayPlan.producedItems[cut.width] || 0) + cut.weightPerCut;
                });
                dayPlan.setupPenaltyTons = projectedPenalty;
            } else {
                // Day is full, move to previous day
                candidateDateMs -= DAY_MS;
                attempts++;
            }
        }
    });

    // 7. Convert to Array and Sort by Date (ascending)
    const resultArray = Object.values(scheduleMap).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // 8. Calculate Visual Metrics
    resultArray.forEach(day => {
        const rawCap = getCapacityForDay(day.date);
        day.capacityUsedPercent = ((day.totalTons + day.setupPenaltyTons) / rawCap) * 100;

        let totalInput = 0;
        let totalOutput = 0;
        day.patterns.forEach(p => {
            const weightPerCoil = p.pattern.totalProductionWeight / p.pattern.assignedCoils;
            const input = p.coils * weightPerCoil;
            const output = input * (p.pattern.yieldPercentage / 100);
            totalInput += input;
            totalOutput += output;
        });
        day.dailyYield = totalInput > 0 ? (totalOutput / totalInput) * 100 : 0;
    });

    return resultArray;
};
