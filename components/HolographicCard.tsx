import React, { useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, useSpring, HTMLMotionProps } from 'framer-motion';

interface HolographicCardProps extends HTMLMotionProps<"div"> {
    children: React.ReactNode;
}

export const HolographicCard: React.FC<HolographicCardProps> = ({ children, className = "", onClick, ...props }) => {
    const ref = useRef<HTMLDivElement>(null);
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    // Cinematic floating spring — graceful tracking, no rigid locking
    const mouseXSpring = useSpring(x, { stiffness: 100, damping: 30, mass: 0.5 });
    const mouseYSpring = useSpring(y, { stiffness: 100, damping: 30, mass: 0.5 });

    // 3D rotation — keep subtle to avoid repaint-heavy transforms
    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["8deg", "-8deg"]);
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-8deg", "8deg"]);

    // Glare position — simple transform maps (no callback, no string templates)
    const glareXPx = useTransform(mouseXSpring, [-0.5, 0.5], [100, 0]);
    const glareYPx = useTransform(mouseYSpring, [-0.5, 0.5], [100, 0]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        x.set((e.clientX - rect.left) / rect.width - 0.5);
        y.set((e.clientY - rect.top) / rect.height - 0.5);
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    // Device orientation for mobile tilt
    useEffect(() => {
        const handleOrientation = (e: DeviceOrientationEvent) => {
            if (e.gamma !== null && e.beta !== null) {
                const gamma = Math.min(Math.max(e.gamma, -45), 45) / 45;
                const beta = Math.min(Math.max(e.beta - 45, -45), 45) / 45;
                x.set(gamma * 0.3);
                y.set(beta * 0.3);
            }
        };

        if (window.DeviceOrientationEvent && typeof (DeviceOrientationEvent as any).requestPermission !== 'function') {
            window.addEventListener('deviceorientation', handleOrientation, { passive: true });
        }
        return () => window.removeEventListener('deviceorientation', handleOrientation);
    }, [x, y]);

    return (
        <motion.div
            ref={ref}
            onClick={onClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
                rotateX,
                rotateY,
                transformStyle: "preserve-3d",
                perspective: 800,
            }}
            className={`relative ${className}`}
            {...props}
        >
            {/* Z-depth wrapper — NO overflow-hidden here to allow decorative elements to bleed out slightly */}
            <div style={{ transform: "translateZ(10px)", transformStyle: "preserve-3d" }} className="w-full h-full relative rounded-[inherit]">
                {children}

                {/* Glare effect — in its own overflow-hidden container to keep it clipped to the card */}
                <div className="absolute inset-0 z-50 pointer-events-none rounded-[inherit] overflow-hidden">
                    <motion.div
                        className="absolute inset-0"
                        style={{
                            background: 'radial-gradient(circle at center, rgba(255,255,255,0.25) 0%, transparent 55%)',
                            left: useTransform(glareXPx, v => `${v - 50}%`),
                            top: useTransform(glareYPx, v => `${v - 50}%`),
                            width: '200%',
                            height: '200%',
                            mixBlendMode: 'overlay',
                        }}
                    />
                </div>
            </div>

        </motion.div>
    );
};
