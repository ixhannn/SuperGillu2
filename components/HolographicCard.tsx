import React, { useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, useSpring, HTMLMotionProps } from 'framer-motion';

interface HolographicCardProps extends HTMLMotionProps<"div"> {
    children: React.ReactNode;
}

export const HolographicCard: React.FC<HolographicCardProps> = ({ children, className = "", onClick, ...props }) => {
    const ref = useRef<HTMLDivElement>(null);
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    // Spring physics for smooth tilt
    const mouseXSpring = useSpring(x, { stiffness: 150, damping: 20, mass: 0.5 });
    const mouseYSpring = useSpring(y, { stiffness: 150, damping: 20, mass: 0.5 });

    // 3D rotation based on mouse position
    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["15deg", "-15deg"]);
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-15deg", "15deg"]);

    // Glare position mapped opposite to mouse for realism
    const glareX = useTransform(mouseXSpring, [-0.5, 0.5], ["100%", "0%"]);
    const glareY = useTransform(mouseYSpring, [-0.5, 0.5], ["100%", "0%"]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const xPct = mouseX / width - 0.5;
        const yPct = mouseY / height - 0.5;
        x.set(xPct);
        y.set(yPct);
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    // Device orientation for mobile tilt
    useEffect(() => {
        const handleOrientation = (e: DeviceOrientationEvent) => {
            if (e.gamma !== null && e.beta !== null) {
                // Gamma: left-to-right tilt in degrees (-90 to 90)
                // Beta: front-to-back tilt in degrees (-180 to 180)
                const gamma = Math.min(Math.max(e.gamma, -45), 45) / 45; // -1 to 1
                const beta = Math.min(Math.max(e.beta - 45, -45), 45) / 45; // -1 to 1 assuming 45 rest angle
                x.set(gamma * 0.5);
                y.set(beta * 0.5);
            }
        };

        if (window.DeviceOrientationEvent && typeof (DeviceOrientationEvent as any).requestPermission !== 'function') {
            window.addEventListener('deviceorientation', handleOrientation);
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
                perspective: 1000,
            }}
            className={`relative cursor-pointer ${className}`}
            {...props}
        >
            {/* Inner Wrapper giving content Z-depth */}
            <div style={{ transform: "translateZ(20px)", transformStyle: "preserve-3d" }} className="w-full h-full relative rounded-[inherit]">
                {children}

                {/* Dynamic Holographic Glare */}
                <motion.div
                    className="absolute inset-0 z-50 pointer-events-none rounded-[inherit] overflow-hidden"
                    style={{
                        background: useTransform(() =>
                            `radial-gradient(circle at ${glareX.get()} ${glareY.get()}, rgba(255,255,255,0.4) 0%, transparent 60%)`
                        ),
                        mixBlendMode: 'overlay',
                    }}
                />
            </div>
        </motion.div>
    );
};
