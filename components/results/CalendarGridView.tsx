import React, { useState, useMemo } from 'react';
import { DailyPlan } from '../../types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarGridViewProps {
    schedule: DailyPlan[];
}

export const CalendarGridView: React.FC<CalendarGridViewProps> = ({ schedule }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const daysInMonth = (date: Date) => {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    };

    const firstDayOfMonth = (date: Date) => {
        // 0 = Sunday, 1 = Monday... we want to map to grid col start
        // Standard Calendar: Sun=0, Mon=1...
        return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    };

    const monthData = useMemo(() => {
        const days = [];
        const totalDays = daysInMonth(currentMonth);
        const startDay = firstDayOfMonth(currentMonth); // 0-6 (Sun-Sat)

        // Previous month filler
        for (let i = 0; i < startDay; i++) {
            days.push(null);
        }

        // Current month days
        for (let i = 1; i <= totalDays; i++) {
            const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dayPlan = schedule.find(d => d.date === dateStr);
            days.push({ day: i, dateStr, plan: dayPlan });
        }

        return days;
    }, [currentMonth, schedule]);

    const handlePrev = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };

    const handleNext = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    const monthName = currentMonth.toLocaleString('es-ES', { month: 'long', year: 'numeric' });

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <button onClick={handlePrev} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><ChevronLeft className="w-5 h-5 text-slate-600" /></button>
                <h3 className="text-lg font-bold text-slate-800 capitalize">{monthName}</h3>
                <button onClick={handleNext} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><ChevronRight className="w-5 h-5 text-slate-600" /></button>
            </div>

            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase text-center py-2">
                <div className="text-red-400">Dom</div>
                <div>Lun</div>
                <div>Mar</div>
                <div>Mié</div>
                <div>Jue</div>
                <div>Vie</div>
                <div>Sáb</div>
            </div>

            <div className="grid grid-cols-7 auto-rows-[100px] border-l border-slate-200">
                {monthData.map((cell, idx) => {
                    if (!cell) return <div key={idx} className="border-b border-r border-slate-200 bg-slate-50/30"></div>;

                    // Check if Sunday (Grid column index 0 is Sunday based on firstDayOfMonth logic usually, but let's check Date)
                    const dateObj = new Date(cell.dateStr);
                    const isSunday = dateObj.getUTCDay() === 0;

                    return (
                        <div key={idx} className={`border-b border-r border-slate-200 p-2 relative group hover:bg-blue-50/30 transition-colors ${isSunday ? 'bg-orange-50/30' : ''}`}>
                            <div className={`text-sm font-bold mb-1 ${isSunday ? 'text-red-500' : 'text-slate-700'}`}>
                                {cell.day}
                                {isSunday && <span className="ml-1 text-[9px] font-normal bg-red-100 text-red-600 px-1 rounded">1 Turno</span>}
                            </div>

                            {cell.plan ? (
                                <div className="flex flex-col gap-1">
                                    <div className="text-xs font-bold text-indigo-700">
                                        {cell.plan.totalTons.toFixed(1)} T
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                        {cell.plan.patterns.length} patrones
                                    </div>
                                    <div className={`text-[9px] px-1 rounded w-fit ${cell.plan.dailyYield >= 98 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {cell.plan.dailyYield.toFixed(1)}% Rend.
                                    </div>
                                </div>
                            ) : (
                                <span className="text-xs text-slate-300">-</span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
