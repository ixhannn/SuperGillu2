import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface ViewHeaderProps {
    title: string;
    subtitle?: string;
    onBack: () => void;
    variant?: 'simple' | 'centered';
    rightSlot?: React.ReactNode;
    borderless?: boolean;
}

export const ViewHeader: React.FC<ViewHeaderProps> = ({
    title,
    subtitle,
    onBack,
    variant = 'centered',
    rightSlot,
    borderless = false,
}) => {
    return (
        <div className={`view-header ${borderless ? 'view-header--borderless' : ''} flex items-center justify-between`}>
            <button
                onClick={onBack}
                aria-label="Go back"
                className="p-2 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 cursor-pointer focus-visible:ring-2 focus-visible:ring-tulika-500 focus-visible:rounded-full focus-visible:ring-offset-2"
            >
                <ArrowLeft size={24} />
            </button>

            {variant === 'centered' ? (
                <div className="text-center absolute left-1/2 -translate-x-1/2 pointer-events-none">
                    <h2 className="font-serif font-bold text-2xl text-gray-100">{title}</h2>
                    {subtitle && (
                        <p className="text-[10px] font-bold uppercase tracking-widest text-tulika-400">{subtitle}</p>
                    )}
                </div>
            ) : (
                <div className="flex-1 ml-2">
                    <h2 className="font-serif font-bold text-xl text-gray-100">{title}</h2>
                    {subtitle && (
                        <p className="text-[10px] font-bold uppercase tracking-widest text-tulika-400">{subtitle}</p>
                    )}
                </div>
            )}

            <div className="flex items-center gap-2">
                {rightSlot || <div className="w-[44px]" />}
            </div>
        </div>
    );
};
