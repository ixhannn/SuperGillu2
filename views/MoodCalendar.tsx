import React, { useState, useEffect } from 'react';
import { ViewState, Memory, Note } from '../types';
import { StorageService } from '../services/storage';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ArrowLeft, Heart, Sparkles } from 'lucide-react';
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    isToday,
    parseISO
} from 'date-fns';

interface MoodCalendarProps {
    setView: (view: ViewState) => void;
}

// Map of mood colors
const moodColors: Record<string, string> = {
    'happy': 'bg-yellow-400 shadow-yellow-200',
    'loved': 'bg-pink-400 shadow-pink-200',
    'excited': 'bg-orange-400 shadow-orange-200',
    'relaxed': 'bg-blue-300 shadow-blue-200',
    'sad': 'bg-indigo-400 shadow-indigo-200',
    'angry': 'bg-red-500 shadow-red-200',
    'anxious': 'bg-purple-400 shadow-purple-200',
    'default': 'bg-tulika-400 shadow-tulika-200'
};

export const MoodCalendar: React.FC<MoodCalendarProps> = ({ setView }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [memories, setMemories] = useState<Memory[]>([]);
    const [notes, setNotes] = useState<Note[]>([]);
    const [selectedDayContent, setSelectedDayContent] = useState<Memory | Note | null>(null);

    useEffect(() => {
        setMemories(StorageService.getMemories());
        setNotes(StorageService.getNotes());
    }, []);

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Add padding for the first week
    const startDayOfWeek = monthStart.getDay();
    const paddingDays = Array.from({ length: startDayOfWeek }).map((_, i) => i);

    const getDayContent = (day: Date) => {
        // Check memories first
        const memory = memories.find(m => isSameDay(parseISO(m.date), day));
        if (memory) return { type: 'memory', item: memory };

        // Check notes
        const note = notes.find(n => isSameDay(parseISO(n.createdAt), day));
        if (note) return { type: 'note', item: note };

        return null;
    };

    const getMoodClass = (content: any) => {
        if (!content) return 'bg-white/50 border-white text-gray-400 hover:bg-white/80';
        if (content.type === 'memory') {
            const mood = content.item.mood?.toLowerCase() || 'default';
            return `${moodColors[mood] || moodColors['default']} text-white shadow-lg animate-pulse-slow font-bold scale-[1.05] z-10`;
        }
        // Notes are always red/pink
        return `bg-red-400 text-white shadow-lg shadow-red-200 animate-pulse-slow font-bold scale-[1.05] z-10`;
    };

    const DayDetails = ({ content, onClose }: { content: Memory | Note, onClose: () => void }) => {
        const isMemory = 'mood' in content;

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
                <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl relative animate-spring-up overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-br from-tulika-100 to-white -z-10"></div>

                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-serif font-bold text-xl text-gray-800 flex items-center gap-2">
                            <Sparkles size={20} className="text-tulika-400" />
                            {format(parseISO('date' in content ? content.date : content.createdAt), 'MMMM do, yyyy')}
                        </h3>
                    </div>

                    <div className="bg-gray-50 rounded-2xl p-6 shadow-inner italic text-gray-600 font-serif leading-relaxed min-h-[100px] flex items-center justify-center relative">
                        <div className="absolute -top-3 -left-3 text-tulika-200 opacity-50"><Heart size={40} fill="currentColor" /></div>
                        <p className="relative z-10 text-lg">"{'text' in content ? content.text : content.content}"</p>
                    </div>

                    <button onClick={onClose} className="w-full mt-6 py-4 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-colors spring-press">
                        Close
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-tulika-50 p-6 pt-12 flex flex-col relative pb-32">
            {selectedDayContent && <DayDetails content={selectedDayContent} onClose={() => setSelectedDayContent(null)} />}

            <header className="mb-8 flex items-center gap-4 animate-slide-down">
                <button
                    onClick={() => setView('home')}
                    className="p-3 bg-white rounded-full shadow-sm border border-tulika-100 text-tulika-500 spring-press hover:bg-tulika-50"
                >
                    <ArrowLeft size={24} />
                </button>
                <div>
                    <h1 className="font-serif text-3xl text-gray-800 font-bold">Mood Board</h1>
                    <p className="text-sm font-medium text-tulika-500 uppercase tracking-widest mt-1">Our Daily Colors</p>
                </div>
            </header>

            <div className="bg-white/70 backdrop-blur-md rounded-[2.5rem] p-6 shadow-xl shadow-tulika-100/50 border border-white flex-1 flex flex-col animate-spring-up">

                {/* Calendar Header */}
                <div className="flex justify-between items-center mb-8">
                    <h2 className="font-serif text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <CalendarIcon size={24} className="text-tulika-400" />
                        {format(currentDate, 'MMMM yyyy')}
                    </h2>
                    <div className="flex gap-2">
                        <button onClick={prevMonth} className="p-2 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors text-gray-600"><ChevronLeft size={20} /></button>
                        <button onClick={nextMonth} className="p-2 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors text-gray-600"><ChevronRight size={20} /></button>
                    </div>
                </div>

                {/* Days of week */}
                <div className="grid grid-cols-7 gap-2 mb-4">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                        <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">{d}</div>
                    ))}
                </div>

                {/* Grid */}
                <div className="grid grid-cols-7 gap-2 flex-1 auto-rows-fr">
                    {paddingDays.map(p => (
                        <div key={`pad-${p}`} className="p-2 bg-transparent"></div>
                    ))}

                    {daysInMonth.map(day => {
                        const content = getDayContent(day);
                        const classes = getMoodClass(content);
                        const isTodayDate = isToday(day);

                        return (
                            <button
                                key={day.toISOString()}
                                onClick={() => content && setSelectedDayContent(content.item)}
                                disabled={!content}
                                className={`
                  relative rounded-2xl flex flex-col items-center justify-center transition-all duration-500
                  ${classes}
                  ${isTodayDate && !content ? 'ring-2 ring-tulika-300 ring-offset-2' : ''}
                  ${content ? 'spring-press cursor-pointer hover:rotate-2' : 'cursor-default'}
                `}
                            >
                                <span className={`text-sm ${content ? 'font-bold' : 'font-medium'}`}>{format(day, 'd')}</span>
                                {isTodayDate && <div className="absolute -bottom-1 w-1 h-1 bg-tulika-500 rounded-full"></div>}
                            </button>
                        );
                    })}
                </div>

                {/* Legend */}
                <div className="mt-8 pt-6 border-t border-gray-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 text-center">Mood Legend</p>
                    <div className="flex flex-wrap justify-center gap-4">
                        {Object.entries({ Happy: 'happy', Loved: 'loved', Excited: 'excited', Relaxed: 'relaxed', Sad: 'sad', Angry: 'angry' }).map(([label, val]) => (
                            <div key={val} className="flex items-center gap-1.5">
                                <div className={`w-3 h-3 rounded-full ${moodColors[val].split(' ')[0]}`}></div>
                                <span className="text-xs font-medium text-gray-500">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
