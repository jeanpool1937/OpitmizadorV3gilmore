

export interface Demand {
  id: string;
  width: number;
  targetTons: number; // This maps to "Por Fabricar" (Col G) - The amount to be optimized
  date: string; // YYYY-MM-DD

  // New fields for extended planning
  plannedConsumption?: number; // Col E: "Plan" (Real Consumption)
  reservedStock?: number; // Col F: "Stock Reservado" (Already on hand)

  remainingTons?: number; // Optional for internal solver state
  // New fields for Multi-Coil
  coilCode?: string;
  coilDescription?: string;
}

export interface Cut {
  width: number;
  count: number;
  weightPerCut: number; // The weight of a single strip of this width from one parent coil
}

export interface Pattern {
  id: number;
  cuts: Cut[];
  assignedCoils: number;
  usedWidth: number;
  wasteWidth: number;
  yieldPercentage: number;
  totalProductionWeight: number; // Total weight processed by this pattern (Parent Weight * Coils)
}

export interface ScheduledPattern {
  patternId: number;
  coils: number;
  pattern: Pattern;
  coilCode?: string; // Reference to which coil this belongs
  coilDescription?: string; // Description of the coil
}

export interface DailyPlan {
  date: string;
  patterns: ScheduledPattern[];
  totalTons: number;
  dailyYield: number; // Weighted average yield for the day
  producedItems: Record<number, number>; // Width -> Tons
  capacityUsedPercent: number; // Visualization of capacity
  setupPenaltyTons: number; // How much capacity was lost due to setups
}

export interface OptimizationResult {
  patterns: Pattern[];
  fulfillment: Record<number, number>; // Width -> Actual Tons Produced
  totalCoilsUsed: number;
  globalYield: number;
  globalWaste: number;
  unmetDemands: string[]; // List of warnings if any
  schedule: DailyPlan[]; // Original schedule based on Due Dates
  capacitySchedule: DailyPlan[]; // New schedule based on Production Capacity
}

export interface CoilSummary {
  coilCode: string;
  description: string;
  totalInputTons: number;
  totalOutputTons: number;
  yield: number;
  waste: number;
  parentWidth: number;
}

export interface BatchOptimizationResult {
  summary: CoilSummary[];
  results: Record<string, OptimizationResult>;
  isBatch: boolean;
  totalGlobalYield: number; // Weighted average
  totalGlobalInput: number;
  totalGlobalOutput: number;
  globalCapacitySchedule: DailyPlan[]; // Global schedule across all coils
}

export interface CoilGroupConfig {
  coilCode: string;
  description: string;
  detectedWidth: number;
  totalDemand: number;
}

export interface SolverConfig {
  parentWidth: number;
  edgeTrim: number; // Total trim (sum of both sides)
  parentWeight: number; // Weight of one parent coil
  toleranceMin: number; // Percentage Min (e.g. 10 for -10%)
  toleranceMax: number; // Percentage Max (e.g. 10 for +10%)
  maxCuts: number; // Maximum number of cuts (knives) per pattern
  dailyCapacity: number; // Max tons to process per day
  setupPenalty: number; // Tons lost per pattern setup
  scheduleStartDate?: string; // YYYY-MM-DD
}

// Única estrategia disponible
export type SolverStrategy = 'linear_hybrid';

// Modos de entrada de datos
export type InputMode = 'simple' | 'dated' | 'multi-coil';

// Tabla vacía por defecto
export const INITIAL_DEMANDS: Demand[] = [];

export const INITIAL_CONFIG: SolverConfig = {
  parentWidth: 1210,
  edgeTrim: 10,
  parentWeight: 11,
  toleranceMin: 10,
  toleranceMax: 10,
  maxCuts: 16,
  dailyCapacity: 300, // Updated to 300T/day
  setupPenalty: 10, // Updated to 10T penalty per setup
  scheduleStartDate: new Date().toISOString().split('T')[0],
};