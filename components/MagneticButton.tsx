import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { feedback } from '../utils/feedback';

interface MagneticButtonProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'> {
    children: React.ReactNode;
    className?: string;
    onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
    strength?: number; // Distance multiplier for magnetic pull (unused on mobile)
    scale?: number;    // Hover bump (unused on mobile)
}

export const MagneticButton: React.FC<MagneticButtonProps> = ({
    children,
    className = "",
    onClick,
    strength: _strength,
    scale: _scale,
    ...props
}) => {
    const shouldReduceMotion = useReducedMotion();

    const handlePointerDown = () => {
        feedback.tap();
    };

    return (
        <motion.div
            onClick={onClick}
            onPointerDown={handlePointerDown}
            whileTap={shouldReduceMotion ? {} : { scale: 0.95 }}
            transition={{ type: "spring", stiffness: 150, damping: 20, mass: 0.5 }}
            className={`relative cursor-pointer ${className}`}
            {...props}
        >
            {children}
        </motion.div>
    );
};
