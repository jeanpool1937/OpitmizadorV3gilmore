
export interface CoilMasterEntry {
    code: string;
    description: string;
    width: number;
    rhythm: number; // t/h
}

const STORAGE_KEY = 'OPTICORTE_COIL_MASTER_V1';

const INITIAL_DATA: CoilMasterEntry[] = [
    { code: "100436", description: "BLAC A-36 1.8MM X 1200MM", width: 1213, rhythm: 14.5 },
    { code: "100437", description: "BLAC A-36 1.9MM X 1200MM", width: 1213, rhythm: 15.3 },
    { code: "100438", description: "BLAC A-36 2.0MM X 1200MM", width: 1212, rhythm: 16.1 },
    { code: "100443", description: "BLAC A-36 2.4MM X 1200MM", width: 1213, rhythm: 17.4 },
    { code: "100448", description: "BLAC A-36 2.8MM X 1200MM", width: 1213, rhythm: 15.1 },
    { code: "100449", description: "BLAC A-36 2.9MM X 1200MM", width: 1213, rhythm: 15.6 },
    { code: "100450", description: "BLAC A-36 3.0MM X 1200MM", width: 1216, rhythm: 16.1 },
    { code: "100452", description: "BESTRUC A-36 3.0MM X 1500 MM", width: 1517, rhythm: 20.2 },
    { code: "100457", description: "BLAC A-36 4.0MM X 1200MM", width: 1213, rhythm: 16.1 },
    { code: "100479", description: "BLAF A1008 0.75MM X 1200MM", width: 1204, rhythm: 9.1 },
    { code: "100481", description: "BLAF A1008 0.8MM X 1200MM", width: 1204, rhythm: 9.7 },
    { code: "100482", description: "BLAF A1008 0.85MM X 1200MM", width: 1204, rhythm: 10.3 },
    { code: "100484", description: "BLAF A1008 0.9MM X 1200MM", width: 1204, rhythm: 10.9 },
    { code: "100486", description: "BLAF A1008 1.0MM X 1200MM", width: 1205, rhythm: 11.1 },
    { code: "100487", description: "BLAF A1008 1.15MM X 1200MM", width: 1204, rhythm: 12.8 },
    { code: "100489", description: "BLAF A1008 1.45MM X 1200MM", width: 1204, rhythm: 12.9 },
    { code: "100490", description: "BLAF A1008 1.5MM X 1200MM", width: 1205, rhythm: 13.3 },
    { code: "100499", description: "BZLI JISG3302 0.9MM X 1200MM", width: 1204, rhythm: 10.9 },
    { code: "100501", description: "BZLI JISG3302 1.2MM X 1200MM", width: 1204, rhythm: 13.3 },
    { code: "100502", description: "BZLI JISG3302 1.5MM X 1200MM", width: 1202, rhythm: 13.3 },
    { code: "100565", description: "BLAC A-36 1.5MM X 1200MM", width: 1213, rhythm: 13.3 },
    { code: "100585", description: "BLAC A-36 2.5MM X 1200MM", width: 1213, rhythm: 15.1 },
    { code: "100603", description: "BLAF A1008 0.96MM X 1200MM", width: 1204, rhythm: 11.6 },
    { code: "100610", description: "BZLI JISG3302 1.45MM X 1200MM", width: 1204, rhythm: 12.9 },
    { code: "100613", description: "BZLI JISG3302 1.75MM X 1200MM", width: 1204, rhythm: 14.1 },
    { code: "100647", description: "BLAC A-36 1.45MM X 1200MM", width: 1220, rhythm: 12.9 },
    { code: "100648", description: "BLAC A-36 1.75MM X 1200MM", width: 1214, rhythm: 14.1 },
    { code: "102170", description: "BZLI JISG3302 1.9MM X 1200MM", width: 1204, rhythm: 15.3 },
    { code: "102171", description: "BZLI JISG3302 2.4MM X 1200MM", width: 1203, rhythm: 17.4 },
    { code: "102290", description: "BZLI JISG3302 1.15MM X 1200MM", width: 1204, rhythm: 12.8 },
    { code: "102302", description: "BLAF A1008 0.95MM X 1200MM", width: 1204, rhythm: 11.5 },
    { code: "102390", description: "BLAC A-36 2.4MM X 1200MM GR. B", width: 1213, rhythm: 17.4 },
    { code: "102394", description: "BLAC A-36 2.8MM X 1200MM GR. B", width: 1213, rhythm: 15.1 },
    { code: "102395", description: "BLAC A-36 1.9MM X 1200MM GR. B", width: 1212, rhythm: 15.3 },
    { code: "102770", description: "BZLI JISG3302 2.8MM X 1200MM", width: 1203, rhythm: 15.1 },
    { code: "103130", description: "BLAC A-36 4.0MM X 1000MM", width: 1010, rhythm: 13.5 },
    { code: "103150", description: "BLAC EN10149 S500MC 2.2MM X 1200MM", width: 1187, rhythm: 16.0 },
    { code: "103200", description: "BLAC A-36 6.0MM X 1150MM", width: 1160, rhythm: 19.3 },
    { code: "103230", description: "BLAC A1011 HSLAS GR70 CL1 2.2MM X 1200MM", width: 1214, rhythm: 16.0 },
    { code: "103232", description: "BLAC A1011 HSLAS GR70 CL1 2.4MM X 1200MM", width: 1215, rhythm: 17.4 },
    { code: "103250", description: "BLAC A-36 2.0MM X 1200MM GR. B", width: 1214, rhythm: 16.1 },
    { code: "103255", description: "BZLI JISG3302 G-40 1.5MM X 1200MM", width: 1205, rhythm: 13.3 },
    { code: "103256", description: "BZLI JISG3302 G-40 1.2MM X 1200MM", width: 1205, rhythm: 13.3 },
    { code: "103260", description: "BLAC A-36 4.5MM X 1250MM", width: 1257, rhythm: 18.9 },
    { code: "103290", description: "BZLI JISG3302 1.2MM X 1200MM XZ", width: 1205, rhythm: 13.3 },
    { code: "103292", description: "BZLI JISG3302 1.75MM X 1200MM XZ", width: 1204, rhythm: 14.1 },
    { code: "103293", description: "BZLI JISG3302 1.9MM X 1200MM XZ", width: 1204, rhythm: 15.3 },
    { code: "103294", description: "BLAC EN10149 S500MC 2.4MM X 1200MM", width: 1215, rhythm: 17.4 },
    { code: "103315", description: "BZLI JISG3302 G-40 1.15MM X 1200MM", width: 1205, rhythm: 12.8 },
    { code: "103318", description: "BZLI JISG3302 G-40 1.9MM X 1200MM", width: 1205, rhythm: 15.3 },
    { code: "103330", description: "BLAC A1011 SS36-1 1.5MM X 1200MM", width: 1214, rhythm: 13.3 },
    { code: "103392", description: "BZLI JISG3302 G-20 1.45MM X 1200MM", width: 1205, rhythm: 12.9 },
    { code: "103394", description: "BZLI JISG3302 G-20 1.75MM X 1200MM", width: 1205, rhythm: 14.1 },
    { code: "103395", description: "BZLI JISG3302 G-20 1.9MM X 1200MM", width: 1204, rhythm: 15.3 },
    { code: "103396", description: "BZLI JISG3302 G-20 2.4MM X 1200MM", width: 1204, rhythm: 17.4 },
    { code: "103397", description: "BZLI JISG3302 G-20 2.8MM X 1200MM", width: 1204, rhythm: 15.1 },
    { code: "103398", description: "BLAC A1011 HSLAS GR70 CL2 2.2MM X 1200MM", width: 1216, rhythm: 16.0 },
    { code: "103399", description: "BLAC A1011 HSLAS GR70 CL2 2.4MM X 1200MM", width: 1208, rhythm: 17.4 },
    { code: "103410", description: "BLAC A-36 6.0MM X 1050MM", width: 1050, rhythm: 17.7 },
    { code: "103460", description: "BZLI JISG3302 1.75MM X 1200MM-G60", width: 1204, rhythm: 14.1 },
];

export const getCoilMasterData = (): CoilMasterEntry[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            // Merge with initial data to ensure updates are reflected if needed
            // However, local storage should prevail for user edits. 
            // Since this is a hard update request, we might want to version check or force update.
            // For this specific task, updating INITIAL_DATA is key, but if the user has data in LS, 
            // they might not see it unless they clear LS. 
            // Let's assume the user wants these defaults.
            return JSON.parse(stored);
        }
    } catch (e) {
        console.error("Failed to load coil master data", e);
    }
    return INITIAL_DATA;
};

export const saveCoilMasterData = (data: CoilMasterEntry[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const upsertCoilEntry = (entry: CoilMasterEntry) => {
    const current = getCoilMasterData();
    const idx = current.findIndex(c => c.code === entry.code);
    if (idx >= 0) {
        current[idx] = entry;
    } else {
        current.push(entry);
    }
    saveCoilMasterData(current);
    return current;
};

export const deleteCoilEntry = (code: string) => {
    const current = getCoilMasterData();
    const filtered = current.filter(c => c.code !== code);
    saveCoilMasterData(filtered);
    return filtered;
};

export const getCoilDetails = (code: string): CoilMasterEntry | undefined => {
    const data = getCoilMasterData();
    return data.find(c => c.code === code);
};
