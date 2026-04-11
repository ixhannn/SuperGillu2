import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigation } from '../App';
import { motion } from 'framer-motion';
import { PREMIUM_SPRING } from '../utils/constants';

interface ViewHeaderProps {
    title: string;
    subtitle?: string;
    onBack?: () => void;
    variant?: 'simple' | 'centered' | 'transparent';
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
    const { goBack } = useNavigation();
    const handleBack = onBack ?? goBack;

    return (
        <div className={`view-header ${(borderless || variant === 'transparent') ? 'view-header--borderless' : ''} flex items-center justify-between px-2`}>
            <motion.button
                initial={{ x: -8, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                onClick={(e) => { e.stopPropagation(); handleBack(); }}
                aria-label="Go back"
                className="p-3 -ml-1 min-h-[48px] min-w-[48px] flex items-center justify-center cursor-pointer rounded-full active:bg-black/5 transition-colors spring-press"
                style={{ color: 'var(--color-text-secondary)' }}
            >
                <ArrowLeft size={24} strokeWidth={2.2} />
            </motion.button>

            {variant === 'centered' ? (
                <motion.div 
                    initial={{ y: 5, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={PREMIUM_SPRING}
                    className="text-center absolute left-1/2 -translate-x-1/2 pointer-events-none w-max max-w-[65%]"
                >
                    <h2 className="text-xl font-serif font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
                    {subtitle && (
                        <p className="text-micro-bold mt-0.5" style={{ color: 'var(--color-pink-deep)' }}>{subtitle}</p>
                    )}
                </motion.div>
            ) : (
                <motion.div 
                    initial={{ x: 10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={PREMIUM_SPRING}
                    className="flex-1 ml-3"
                >
                    <h2 className="text-xl font-serif font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
                    {subtitle && (
                        <p className="text-micro-bold mt-0.5" style={{ color: 'var(--color-pink-deep)' }}>{subtitle}</p>
                    )}
                </motion.div>
            )}

            <div className="flex items-center gap-2">
                {rightSlot || <div className="w-[48px]" />}
            </div>
        </div>
    );
};
