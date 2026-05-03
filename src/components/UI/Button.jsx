import { Target } from 'lucide-react';

export default function Button({ children, disabled, loading, onClick }) {
    return (
        <button
            type="button"
            className={`rainbow-border relative overflow-hidden w-full rounded-full py-5 px-8 text-xs uppercase tracking-[0.2em] text-white font-bold transition-all duration-300
                ${loading
                    ? 'cursor-wait shadow-[0_0_16px_rgba(155,92,255,0.35)] hover:bg-transparent hover:text-white hover:shadow-[0_0_16px_rgba(155,92,255,0.35)]'
                    : 'hover:bg-brand-primary hover:text-[#050505] hover:shadow-[0_0_30px_rgba(255,47,146,0.6)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-white disabled:hover:shadow-none'
                }
            `}
            onClick={onClick}
            disabled={disabled || loading}
        >
            <div className={`relative z-10 flex items-center justify-center gap-3 transition-all ${loading ? 'animate-pulse-opacity' : ''}`}>
                <span>{children}</span>
                {loading && <Target size={16} className="text-brand-tertiary" />}
            </div>
        </button>
    );
}
