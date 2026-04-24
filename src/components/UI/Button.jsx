import { Target } from 'lucide-react';

export default function Button({ children, disabled, loading, onClick }) {
    return (
        <button 
            type="button"
            className={`rainbow-border relative overflow-hidden w-full rounded-full py-5 px-8 text-xs uppercase tracking-[0.2em] text-white font-bold transition-all duration-300 hover:bg-brand-primary hover:text-[#050505] hover:shadow-[0_0_30px_rgba(255,47,146,0.6)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-white disabled:hover:shadow-none
                ${loading ? 'border border-white/80' : ''}
            `}
            onClick={onClick}
            disabled={disabled || loading}
        >
            <div className={`relative z-10 flex items-center justify-center gap-3 transition-all ${loading ? 'text-brand-primary animate-pulse-opacity' : ''}`}>
                <span>{children}</span>
                {loading && <Target size={16} className="text-brand-tertiary" />}
            </div>
        </button>
    );
}
