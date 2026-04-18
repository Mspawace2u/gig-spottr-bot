import { motion } from 'framer-motion';
import { Home, LayoutDashboard, PlusSquare as PlusCircle } from 'lucide-react';

export default function AppHeader({ step, setStep, setReportData, setJobUrl, setJobText }) {
    return (
        <motion.header
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="sticky top-0 z-50 w-full bg-brand-bg/45 backdrop-blur-xl backdrop-saturate-150 border-b border-white/5"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
            <div className="max-w-[var(--shell-max-w)] mx-auto px-[var(--shell-pad-x)] py-6 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 flex items-center justify-center">
                        <img src="/logo.png" className="w-full h-full object-contain" alt="Gig Spottr Logo" />
                    </div>
                    <h1 className="text-sm font-black tracking-widest uppercase">Gig Spottr</h1>
                </div>

                {/* Active-state colors are intentional per-route: Home=pink, Dashboard=turquoise, New=none */}
                <nav className="flex items-center gap-2">
                    <button
                        onClick={() => setStep('ONBOARD')}
                        className={`p-2.5 rounded-xl transition-all ${step === 'ONBOARD' ? 'text-brand-primary bg-white/5 border border-white/10' : 'text-white/40 hover:text-white'}`}
                        aria-label="Home"
                    >
                        <Home size={18} />
                    </button>
                    <button
                        onClick={() => setStep('DASHBOARD')}
                        className={`p-2.5 rounded-xl transition-all ${step === 'DASHBOARD' ? 'text-brand-secondary bg-white/5 border border-white/10' : 'text-white/40 hover:text-white'}`}
                        aria-label="Dashboard"
                    >
                        <LayoutDashboard size={18} />
                    </button>
                    <button
                        onClick={() => {
                            setStep('ANALYZE');
                            setReportData(null);
                            setJobUrl('');
                            setJobText('');
                        }}
                        className="p-2.5 rounded-xl text-white/40 hover:text-white border border-transparent hover:border-white/10 transition-all"
                        aria-label="New analysis"
                    >
                        <PlusCircle size={18} />
                    </button>
                </nav>
            </div>
        </motion.header>
    );
}
