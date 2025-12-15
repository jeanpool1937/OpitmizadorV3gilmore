
import React, { useState, useRef } from 'react';
import { Demand, InputMode } from '../types';
import { Trash2, Plus, FileSpreadsheet, Eraser, Clipboard, Zap, Database, FolderInput } from 'lucide-react';
import * as XLSX from 'xlsx';

interface DemandInputProps {
  demands: Demand[];
  setDemands: React.Dispatch<React.SetStateAction<Demand[]>>;
  inputMode: InputMode;
  setInputMode: (mode: InputMode) => void;
}

export const DemandInput: React.FC<DemandInputProps> = ({ demands, setDemands, inputMode, setInputMode }) => {
  const [newWidth, setNewWidth] = useState('');
  const [newTons, setNewTons] = useState('');
  const tableRef = useRef<HTMLDivElement>(null);

  const RAPID_COIL_CODE = "BOBINA-RAPIDA";

  // Filter demands for display based on mode
  const displayedDemands = demands.filter(d =>
    inputMode === 'simple'
      ? d.coilCode === RAPID_COIL_CODE
      : d.coilCode !== RAPID_COIL_CODE
  );

  const addDemand = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newWidth || !newTons) return;

    const tons = parseFloat(newTons);
    const newItem: Demand = {
      id: Date.now().toString(),
      width: parseFloat(newWidth),
      targetTons: tons, // For simple mode, Target = Plan, Stock = 0
      plannedConsumption: tons,
      reservedStock: 0,
      date: new Date().toISOString().split('T')[0],
      coilCode: inputMode === 'multi-coil' ? 'MANUAL' : RAPID_COIL_CODE,
      coilDescription: inputMode === 'multi-coil' ? 'Entrada Manual' : 'Bobina Única'
    };

    setDemands([...demands, newItem]);
    setNewWidth('');
    setNewTons('');
  };

  const removeDemand = (id: string) => {
    setDemands(demands.filter(d => d.id !== id));
  };

  const clearCurrentTab = () => {
    const label = inputMode === 'simple' ? 'Rápida' : 'Multi-Bobina';
    if (window.confirm(`¿Estás seguro de que quieres borrar los datos de la pestaña ${label}?`)) {
      // Keep only demands that DO NOT belong to the current mode
      const toKeep = demands.filter(d =>
        inputMode === 'simple'
          ? d.coilCode !== RAPID_COIL_CODE
          : d.coilCode === RAPID_COIL_CODE
      );
      setDemands(toKeep);
    }
  };

  const updateDemand = (id: string, field: keyof Demand, value: string | number) => {
    setDemands(demands.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const excelDateToJSDate = (serial: number): string => {
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    const year = date_info.getFullYear();
    const month = String(date_info.getMonth() + 1).padStart(2, '0');
    const day = String(date_info.getDate() + 1).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Improved parser favoring DD/MM/YYYY
  const parseTextDate = (dateStr: string): string => {
    dateStr = String(dateStr).trim();
    if (!dateStr) return new Date().toISOString().split('T')[0];

    // Handle Excel Serial Number as string
    if (/^\d{5}$/.test(dateStr)) {
      return excelDateToJSDate(parseInt(dateStr));
    }

    // Handle DD/MM/YYYY or D/M/YYYY
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        return `${year}-${month}-${day}`;
      }
    }

    // Fallback
    const dateObj = new Date(dateStr);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString().split('T')[0];
    }

    return new Date().toISOString().split('T')[0];
  };

  const processWorkbook = (workbook: XLSX.WorkBook) => {
    try {
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Array<string | number>>(sheet, { header: 1 });

      const parsedDemands: Demand[] = [];

      jsonData.forEach((row, index) => {
        if (row.length < 2) return;

        // Multi-Coil Import Updated
        // Format: Code(0) | Desc(1) | Date(2) | Width(3) | Plan(4) | Stock(5) | ToMake(6)
        if (inputMode === 'multi-coil') {
          const code = String(row[0] || '').trim();
          const desc = String(row[1] || '').trim();
          const dateRaw = row[2];
          const width = parseFloat(String(row[3]));

          // New Columns
          const plan = parseFloat(String(row[4] || 0));
          const stock = parseFloat(String(row[5] || 0));
          let toMake = parseFloat(String(row[6]));

          // If Col G (ToMake) is missing, calculate it
          if (isNaN(toMake)) {
            toMake = Math.max(0, plan - stock);
          }

          if (code && !isNaN(width)) {
            let date = new Date().toISOString().split('T')[0];
            if (typeof dateRaw === 'number') date = excelDateToJSDate(dateRaw);
            else date = parseTextDate(String(dateRaw));

            parsedDemands.push({
              id: `xlsx-mc-${Date.now()}-${index}`,
              width,
              targetTons: toMake, // The amount to manufacture
              plannedConsumption: plan,
              reservedStock: stock,
              date,
              coilCode: code,
              coilDescription: desc
            });
          }
        } else {
          // Standard Import (Col A: Width, Col B: Tons)
          const w = parseFloat(String(row[0]));
          const t = parseFloat(String(row[1]));
          const d = new Date().toISOString().split('T')[0];

          if (!isNaN(w) && !isNaN(t) && typeof row[0] === 'number') {
            parsedDemands.push({
              id: `xlsx-${Date.now()}-${index}`,
              width: w,
              targetTons: t,
              plannedConsumption: t,
              reservedStock: 0,
              date: d,
              coilCode: RAPID_COIL_CODE,
              coilDescription: 'Bobina Única'
            });
          }
        }
      });

      if (parsedDemands.length > 0) {
        setDemands(prev => [...prev, ...parsedDemands]);
      } else {
        alert("No se encontraron datos válidos.");
      }

    } catch (error) {
      console.error(error);
      alert("Error procesando los datos del Excel.");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      if (!data) return;

      try {
        const workbook = XLSX.read(data, { type: 'binary' });
        processWorkbook(workbook);
      } catch (error) {
        console.error(error);
        alert("Error leyendo archivo Excel.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const clipboardData = e.clipboardData.getData('text');
    if (!clipboardData) return;

    const rows = clipboardData.split(/\r\n|\n|\r/).filter(row => row.trim() !== '');
    const isTabular = rows.length > 1 || rows[0].includes('\t');

    if (!isTabular) return;

    e.preventDefault();

    const newDemands: Demand[] = [];

    rows.forEach((row, idx) => {
      let cols = row.split('\t');
      if (cols.length < 2) cols = row.split(',');

      // MULTI-COIL PASTE: Code | Desc | Date | Width | Plan | Stock | ToMake
      if (inputMode === 'multi-coil') {
        // It might be 5 cols (Old format) or 7 cols (New format)
        if (cols.length >= 4) {
          const code = cols[0].trim();
          const desc = cols[1].trim();
          const d = parseTextDate(cols[2]);
          const w = parseFloat(cols[3].trim());

          let plan = 0;
          let stock = 0;
          let toMake = 0;

          if (cols.length >= 7) {
            // Full 7 columns
            plan = parseFloat(cols[4].trim());
            stock = parseFloat(cols[5].trim());
            toMake = parseFloat(cols[6].trim());
          } else if (cols.length >= 5) {
            // Old format (Col 4 was Demand/ToMake)
            toMake = parseFloat(cols[4].trim());
            plan = toMake; // Assume Plan = Make if missing
          }

          if (code && !isNaN(w) && !isNaN(toMake)) {
            newDemands.push({
              id: `paste-mc-${Date.now()}-${idx}`,
              width: w,
              targetTons: toMake,
              plannedConsumption: plan,
              reservedStock: stock,
              date: d,
              coilCode: code,
              coilDescription: desc
            });
          }
        }
      } else {
        // STANDARD PASTE
        if (cols.length >= 2) {
          const w = parseFloat(cols[0].trim());
          const t = parseFloat(cols[1].trim());
          const d = new Date().toISOString().split('T')[0];

          if (!isNaN(w) && !isNaN(t)) {
            newDemands.push({
              id: `paste-${Date.now()}-${idx}`,
              width: w,
              targetTons: t,
              plannedConsumption: t,
              reservedStock: 0,
              date: d,
              coilCode: RAPID_COIL_CODE,
              coilDescription: 'Bobina Única'
            });
          }
        }
      }
    });

    if (newDemands.length > 0) {
      setDemands(prev => [...prev, ...newDemands]);
    }
  };

  return (
    <div
      ref={tableRef}
      className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full outline-none focus:ring-2 focus:ring-blue-500/50 transition-shadow"
      tabIndex={0}
      onPaste={handlePaste}
    >
      {/* Header & Tabs */}
      <div className="bg-slate-50 border-b border-slate-200">
        <div className="flex">
          <button
            onClick={() => setInputMode('multi-coil')}
            className={`flex-1 py-3 text-xs md:text-sm font-medium flex items-center justify-center gap-2 transition-colors ${inputMode === 'multi-coil'
              ? 'bg-white text-orange-600 border-r border-slate-200 shadow-[inset_0_-2px_0_0_#ea580c]'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
          >
            <Database className="w-4 h-4" />
            Multi-Bobina
          </button>
          <button
            onClick={() => setInputMode('simple')}
            className={`flex-1 py-3 text-xs md:text-sm font-medium flex items-center justify-center gap-2 transition-colors ${inputMode === 'simple'
              ? 'bg-white text-blue-600 border-l border-slate-200 shadow-[inset_0_-2px_0_0_#2563eb]'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
          >
            <Zap className="w-4 h-4" />
            <span className="inline">Rápida (Bobina Única)</span>
          </button>
        </div>

        <div className="p-4 flex justify-between items-center flex-wrap gap-2">
          <div className="flex flex-col">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              Tabla de Demanda {inputMode === 'simple' ? '(Bobina Única)' : '(Múltiple)'}
              <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-normal hidden sm:inline-block">
                Pegar Activado (Ctrl+V)
              </span>
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {inputMode === 'multi-coil'
                ? 'Código | Desc | Fecha | Ancho | Plan | Stock | Por Fabricar'
                : 'Ancho (mm) | Demanda (Ton)'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearCurrentTab}
              className="text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded transition-colors flex items-center gap-1 cursor-pointer"
              title="Borrar datos de la pestaña actual"
            >
              <Eraser className="w-3 h-3" /> Borrar
            </button>

            <button
              type="button"
              onClick={() => {
                // FUNCTION TO LOAD FROM LOCAL FOLDER API
                fetch('/api/list-input')
                  .then(res => {
                    if (!res.ok) throw new Error('Error listando archivos');
                    return res.json();
                  })
                  .then(files => {
                    if (files.length === 0) {
                      alert('No se encontraron archivos Excel en la carpeta OpitmizadorV3gilmore/input');
                      return;
                    }
                    // Load the most recent file
                    const newestFile = files[0].name;
                    if (window.confirm(`Se encontró el archivo: ${newestFile}\n¿Deseas cargarlo?`)) {
                      return fetch(`/api/read-input?file=${encodeURIComponent(newestFile)}`)
                        .then(res => res.arrayBuffer())
                        .then(buffer => {
                          const workbook = XLSX.read(buffer, { type: 'array' });
                          // Reuse existing logic by creating a synthetic event or extracting logic
                          processWorkbook(workbook);
                        });
                    }
                  })
                  .catch(err => {
                    console.error(err);
                    alert("Error: No se pudo conectar con la carpeta local. Asegúrate de estar corriendo el servidor de desarrollo.");
                  });
              }}
              className="cursor-pointer flex items-center gap-2 text-xs font-medium text-indigo-700 hover:text-indigo-800 transition-colors bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded border border-indigo-200"
              title="Leer carpeta input del servidor"
            >
              <FolderInput className="w-4 h-4" />
              Cargar desde Input
            </button>

            <label className="cursor-pointer flex items-center gap-2 text-xs font-medium text-emerald-700 hover:text-emerald-800 transition-colors bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded border border-emerald-200">
              <FileSpreadsheet className="w-4 h-4" />
              Importar
              <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
            </label>
          </div>
        </div>
      </div>

      {/* Manual Input Row (Only for simple) */}
      {inputMode === 'simple' && (
        <div className="p-3 bg-white border-b border-slate-200 shadow-[inset_0_2px_4px_rgb(0_0_0/0.05)]">
          <form onSubmit={addDemand} className="flex gap-2 items-center">
            <input
              type="number"
              placeholder="Ancho (mm)"
              className="w-32 border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={newWidth}
              onChange={(e) => setNewWidth(e.target.value)}
            />
            <input
              type="number"
              placeholder="Toneladas"
              className="w-32 border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={newTons}
              onChange={(e) => setNewTons(e.target.value)}
            />

            <button
              type="submit"
              className="text-white rounded px-4 py-1.5 flex items-center justify-center shadow-sm bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Spreadsheet-like Grid */}
      <div className="overflow-y-auto flex-1 bg-white relative">
        {displayedDemands.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none p-4 text-center">
            <Clipboard className="w-12 h-12 mb-2 opacity-20" />
            <p className="text-sm font-medium">Pega datos de Excel aquí</p>
            <p className="text-xs opacity-70 mt-1 max-w-xs">
              {inputMode === 'multi-coil'
                ? 'Formato: CODIGO | DESCRIPCION | FECHA | ANCHO | PLAN (E) | STOCK (F) | POR FABRICAR (G)'
                : 'Formato: ANCHO | DEMANDA'
              }
            </p>
          </div>
        )}

        <table className="w-full text-sm text-left border-collapse">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm">
            <tr>
              {inputMode === 'multi-coil' && (
                <>
                  <th className="px-4 py-2 border-b border-r border-slate-200 font-semibold w-24">Código</th>
                  <th className="px-4 py-2 border-b border-r border-slate-200 font-semibold w-40">Descripción</th>
                  <th className="px-4 py-2 border-b border-r border-slate-200 font-semibold w-24">Fecha</th>
                </>
              )}
              <th className="px-4 py-2 border-b border-r border-slate-200 font-semibold w-24">Ancho</th>
              {inputMode === 'multi-coil' && (
                <>
                  <th className="px-4 py-2 border-b border-r border-slate-200 font-semibold text-slate-400 bg-slate-50/50">Plan (E)</th>
                  <th className="px-4 py-2 border-b border-r border-slate-200 font-semibold text-slate-400 bg-slate-50/50">Stock (F)</th>
                </>
              )}
              <th className="px-4 py-2 border-b border-slate-200 font-semibold bg-blue-50 text-blue-700 border-l border-blue-100">
                {inputMode === 'multi-coil' ? 'A Fabricar (G)' : 'Demanda'}
              </th>
              <th className="px-2 py-2 border-b border-slate-200 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {displayedDemands.map((demand) => (
              <tr key={demand.id} className="group hover:bg-blue-50/50">
                {inputMode === 'multi-coil' && (
                  <>
                    <td className="px-4 py-2 border-b border-r border-slate-100 text-xs font-mono">{demand.coilCode}</td>
                    <td className="px-4 py-2 border-b border-r border-slate-100 text-xs truncate max-w-[150px]" title={demand.coilDescription}>{demand.coilDescription}</td>
                    <td className="px-4 py-2 border-b border-r border-slate-100 text-xs">{demand.date}</td>
                  </>
                )}

                <td className="p-0 border-b border-r border-slate-100 relative">
                  <input
                    type="number"
                    className="w-full h-full px-4 py-2 bg-transparent outline-none focus:bg-blue-50 font-mono text-slate-700"
                    value={demand.width}
                    onChange={(e) => updateDemand(demand.id, 'width', parseFloat(e.target.value))}
                  />
                </td>

                {inputMode === 'multi-coil' && (
                  <>
                    <td className="p-0 border-b border-r border-slate-100 relative">
                      <input
                        type="number"
                        className="w-full h-full px-4 py-2 bg-transparent outline-none text-slate-400 text-xs"
                        value={demand.plannedConsumption || 0}
                        onChange={(e) => updateDemand(demand.id, 'plannedConsumption', parseFloat(e.target.value))}
                      />
                    </td>
                    <td className="p-0 border-b border-r border-slate-100 relative">
                      <input
                        type="number"
                        className="w-full h-full px-4 py-2 bg-transparent outline-none text-slate-400 text-xs"
                        value={demand.reservedStock || 0}
                        onChange={(e) => updateDemand(demand.id, 'reservedStock', parseFloat(e.target.value))}
                      />
                    </td>
                  </>
                )}

                <td className="p-0 border-b border-slate-100 relative bg-blue-50/10">
                  <input
                    type="number"
                    className="w-full h-full px-4 py-2 bg-transparent outline-none focus:bg-blue-50 font-bold text-blue-700"
                    value={demand.targetTons}
                    onChange={(e) => updateDemand(demand.id, 'targetTons', parseFloat(e.target.value))}
                  />
                </td>
                <td className="p-0 border-b border-slate-100 text-center">
                  <button
                    onClick={() => removeDemand(demand.id)}
                    type="button"
                    className="text-slate-300 hover:text-red-500 transition-colors p-2 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    tabIndex={-1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};