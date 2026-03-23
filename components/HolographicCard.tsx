import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

interface HolographicCardProps extends HTMLMotionProps<"div"> {
    children: React.ReactNode;
}

export const HolographicCard: React.FC<HolographicCardProps> = ({ children, className = "", onClick, ...props }) => {
    return (
        <motion.div
            onClick={onClick}
            className={`relative ${className}`}
            {...props}
        >
            <div className="w-full h-full relative rounded-[inherit]">
                {children}
            </div>
        </motion.div>
    );
};
