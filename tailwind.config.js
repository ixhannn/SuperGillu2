/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./views/**/*.{js,ts,jsx,tsx}",
        "./App.tsx",
        "./index.tsx"
    ],
    theme: {
        extend: {
            colors: {
                tulika: {
                    50: '#fff1f2',
                    100: '#ffe4e6',
                    200: '#fecdd3',
                    300: '#fda4af',
                    400: '#fb7185',
                    500: '#f43f5e',
                    600: '#e11d48',
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                serif: ['Playfair Display', 'serif'],
            },
            transitionTimingFunction: {
                'spring': 'cubic-bezier(0.32, 0.72, 0, 1)',
                'spring-bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                'spring-snappy': 'cubic-bezier(0.22, 0.68, 0, 1.71)',
                'ease-out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
                'ease-out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
            },
            animation: {
                'float': 'float 6s ease-in-out infinite',
                'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'slide-up': 'slideUp 0.6s cubic-bezier(0.23, 1, 0.32, 1) both',
                'slide-down': 'slideDown 0.5s cubic-bezier(0.23, 1, 0.32, 1) both',
                'fade-in': 'fadeIn 0.4s ease-out both',
                'pop-in': 'popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both',
                'wiggle': 'wiggle 0.3s ease-in-out infinite',
                'spring-in': 'springIn 0.6s cubic-bezier(0.23, 1, 0.32, 1) both',
                'elastic-pop': 'elasticPop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both',
                'tilt-in': 'tiltIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
                'shimmer': 'shimmerSweep 3s ease-in-out infinite',
                'glow-pulse': 'glowPulse 3s ease-in-out infinite',
                'breathe': 'breatheGlow 4s ease-in-out infinite',
                'morph-blob': 'morphBlob 20s ease-in-out infinite',
                'number-roll': 'numberRoll 0.8s cubic-bezier(0.23, 1, 0.32, 1) both',
                'wiggle-spring': 'wiggleSpring 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                'spin-slow': 'spin 8s linear infinite',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0) rotate(0deg)', opacity: '0' },
                    '10%': { opacity: '0.8' },
                    '90%': { opacity: '0.8' },
                    '100%': { transform: 'translateY(-100vh) rotate(20deg)', opacity: '0' },
                },
                wiggle: {
                    '0%, 100%': { transform: 'rotate(-3deg) scale(1.05)' },
                    '50%': { transform: 'rotate(3deg) scale(1.05)' },
                },
                slideUp: {
                    '0%': { transform: 'translate3d(0, 24px, 0)', opacity: '0' },
                    '100%': { transform: 'translate3d(0, 0, 0)', opacity: '1' },
                },
                slideDown: {
                    '0%': { transform: 'translate3d(0, -20px, 0)', opacity: '0' },
                    '100%': { transform: 'translate3d(0, 0, 0)', opacity: '1' },
                },
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                popIn: {
                    '0%': { transform: 'scale(0.85) translateY(5px)', opacity: '0' },
                    '100%': { transform: 'scale(1) translateY(0)', opacity: '1' },
                },
                springIn: {
                    '0%': { transform: 'translate3d(0, 24px, 0) scale(0.92)', opacity: '0' },
                    '50%': { transform: 'translate3d(0, -4px, 0) scale(1.02)', opacity: '1' },
                    '75%': { transform: 'translate3d(0, 2px, 0) scale(0.99)' },
                    '100%': { transform: 'translate3d(0, 0, 0) scale(1)', opacity: '1' },
                },
                elasticPop: {
                    '0%': { transform: 'scale(0.6)', opacity: '0' },
                    '40%': { transform: 'scale(1.08)', opacity: '1' },
                    '65%': { transform: 'scale(0.96)' },
                    '85%': { transform: 'scale(1.02)' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                },
                tiltIn: {
                    '0%': { opacity: '0', transform: 'perspective(600px) rotateX(8deg) translate3d(0, 30px, -20px)' },
                    '100%': { opacity: '1', transform: 'perspective(600px) rotateX(0deg) translate3d(0, 0, 0)' },
                },
                shimmerSweep: {
                    '0%': { backgroundPosition: '-200% center' },
                    '100%': { backgroundPosition: '200% center' },
                },
                glowPulse: {
                    '0%, 100%': { boxShadow: '0 0 20px rgba(244,63,94,0.15), 0 0 60px rgba(244,63,94,0.05)' },
                    '50%': { boxShadow: '0 0 30px rgba(244,63,94,0.3), 0 0 80px rgba(244,63,94,0.1)' },
                },
                breatheGlow: {
                    '0%, 100%': { transform: 'scale(1)', opacity: '0.7' },
                    '50%': { transform: 'scale(1.04)', opacity: '1' },
                },
                morphBlob: {
                    '0%, 100%': { borderRadius: '40% 60% 70% 30% / 40% 50% 60% 50%', transform: 'translate3d(0,0,0) rotate(0deg)' },
                    '25%': { borderRadius: '60% 40% 30% 70% / 50% 60% 40% 60%', transform: 'translate3d(5%,3%,0) rotate(3deg)' },
                    '50%': { borderRadius: '50% 60% 50% 40% / 60% 30% 70% 40%', transform: 'translate3d(-3%,6%,0) rotate(-2deg)' },
                    '75%': { borderRadius: '30% 60% 40% 70% / 50% 40% 60% 50%', transform: 'translate3d(4%,-2%,0) rotate(1deg)' },
                },
                numberRoll: {
                    '0%': { transform: 'translate3d(0, 100%, 0)', opacity: '0' },
                    '60%': { transform: 'translate3d(0, -5%, 0)', opacity: '1' },
                    '100%': { transform: 'translate3d(0, 0, 0)', opacity: '1' },
                },
                wiggleSpring: {
                    '0%': { transform: 'rotate(0deg)' },
                    '20%': { transform: 'rotate(-6deg)' },
                    '40%': { transform: 'rotate(5deg)' },
                    '60%': { transform: 'rotate(-3deg)' },
                    '80%': { transform: 'rotate(2deg)' },
                    '100%': { transform: 'rotate(0deg)' },
                },
            }
        }
    },
    plugins: [],
}
