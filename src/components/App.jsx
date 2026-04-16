import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { 
  Rocket, Target, CheckCircle, AlertTriangle, 
  Upload, LayoutDashboard, PlusSquare as PlusCircle, 
  ChevronDown, ChevronUp, Home, MapPin
} from 'lucide-react';

import Button from './UI/Button';
import Card from './UI/Card';
import confetti from 'canvas-confetti';

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: -30, transition: { duration: 0.4 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  exit: { opacity: 0, transition: { duration: 0.3 } }
};

export default function App() {
  const [step, setStep] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('gig-spottr-step');
      return ['ONBOARD', 'ANALYZE', 'DASHBOARD'].includes(saved) ? saved : 'ONBOARD';
    }
    return 'ONBOARD';
  });
  const [email, setEmail] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('gig-spottr-email')) || '';
  });
  
  const [inputMode, setInputMode] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('gig-spottr-input-mode')) || 'text';
  });
  const [cvText, setCvText] = useState('');
  const [cvLink, setCvLink] = useState('');
  const [cvFile, setCvFile] = useState(null);
  const fileInputRef = useRef(null);
  
  const [jobUrl, setJobUrl] = useState('');
  const [jobText, setJobText] = useState('');
  
  const [reportData, setReportData] = useState(null);
  const [dashboardData, setDashboardData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastDecision, setLastDecision] = useState('');
  
  // Persistence logic: Save to localStorage on change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('gig-spottr-email', email);
      localStorage.setItem('gig-spottr-step', step);
      localStorage.setItem('gig-spottr-input-mode', inputMode);
    }
  }, [email, step, inputMode]);

  // Auto-fetch dashboard on email entry
  useEffect(() => {
    if (email.includes('@') && step === 'DASHBOARD') {
      fetchDashboard();
    }
  }, [step, email]);

  const fetchDashboard = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/get-dashboard?email=${encodeURIComponent(email)}`);
      if (resp.ok) {
        const data = await resp.json();
        setDashboardData(data.reports || []);
      }
    } catch (err) {
      console.error('Dashboard fetch failed', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOnboard = async () => {
    if (!email.trim()) return setError('Please provide your email');
    if (inputMode === 'text' && !cvText.trim()) return setError('Please paste your CV text');
    if (inputMode === 'link' && !cvLink.trim()) return setError('Please enter a valid URL');
    if (inputMode === 'file' && !cvFile) return setError('Please upload a PDF or TXT file');

    setLoading(true); setError('');
    try {
      const formData = new FormData();
      formData.append('email', email);
      formData.append('mode', inputMode);
      if (inputMode === 'text') formData.append('cvText', cvText);
      if (inputMode === 'link') formData.append('cvLink', cvLink);
      if (inputMode === 'file') formData.append('cvFile', cvFile);

      const response = await fetch('/api/onboard', { method: 'POST', body: formData });
      if (!response.ok) {
         const errData = await response.json().catch(() => ({}));
         throw new Error(errData.error || 'Failed to onboard');
      }
      setStep('ANALYZE');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!email || !email.trim()) {
      setError('Session lost. Please return home and re-enter your email');
      setStep('ONBOARD');
      return;
    }
    // If no text, jobUrl is required for scraping
    if (!jobText.trim() && !jobUrl.trim()) {
      setError('Please provide a Job URL OR paste the Description');
      return;
    }
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/analyze-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, jobText, jobUrl })
      });
      if (!response.ok) {
         const errData = await response.json().catch(() => ({}));
         throw new Error(errData.error || 'Failed to analyze job');
      }
      const data = await response.json();
      setReportData(data);
      setStep('REPORT');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fireConfetti = () => {
    confetti({
      particleCount: 150, spread: 70, origin: { y: 0.6 },
      colors: ['#FF2F92', '#3CFF9E', '#2DE2E6', '#FFE44D', '#9B5CFF']
    });
  };

  const handleDecision = async (decision) => {
    setLoading(true);
    try {
      await fetch('/api/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: reportData.reportId, decision })
      });
      setLastDecision(decision);
      if (decision === 'Applied') fireConfetti();
      setJobText(''); setJobUrl(''); 
      setStep('SUCCESS');
    } catch (error) {
      setError('Failed to update status. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // Helper: Filter dashboard buckets with specific sorting
  const getBuckets = () => {
    const list = dashboardData || [];
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const sortOldestAndScore = (a, b) => {
        // Normalize to day level for primary sort
        const dateA = new Date(a.createdAt).setHours(0, 0, 0, 0);
        const dateB = new Date(b.createdAt).setHours(0, 0, 0, 0);
        
        // Primary: Oldest Day first
        if (dateA - dateB !== 0) return dateA - dateB;
        
        // Secondary: Highest score first (within that day)
        return (b.skillsMatchPercent || 0) - (a.skillsMatchPercent || 0);
    };

    const sortOldestOnly = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);

    return {
      analyzed: list,
      isFit: list
        .filter(r => (r.userDecision === 'FIT' || (r.userDecision === 'Pending' && (r.skillsMatchPercent || 0) >= 80)))
        .sort(sortOldestAndScore),
      notFit: list
        .filter(r => (r.userDecision === 'NO FIT' || (r.userDecision === 'Pending' && (r.skillsMatchPercent || 0) < 80)))
        .sort(sortOldestAndScore),
      applied: list
        .filter(r => r.userDecision === 'APPLY' || r.userDecision === 'Applied')
        .sort(sortOldestOnly),
      declined: list
        .filter(r => r.userDecision === 'DECLINE' || r.userDecision === 'Skipped' || (r.userDecision === 'Pending' && new Date(r.createdAt) < tenDaysAgo))
        .sort(sortOldestOnly)
    };
  };

  const buckets = getBuckets();

  return (
    <div className="relative w-full min-h-screen flex flex-col">
      {/* Sticky Header Bar */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }} 
        animate={{ y: 0, opacity: 1 }} 
        className="sticky top-0 z-50 w-full bg-brand-bg/80 backdrop-blur-md border-b border-white/5"
      >
        <div className="max-w-3xl mx-auto px-6 py-6 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 flex items-center justify-center">
                   <img src="/logo.png" className="w-full h-full object-contain" alt="Gig Spottr Logo" />
                </div>
               <h1 className="text-sm font-black tracking-widest uppercase">Gig Spottr</h1>
            </div>
            
            <div className="flex items-center gap-2">
               <button onClick={() => setStep('ONBOARD')} className={`p-2.5 rounded-xl transition-all ${step === 'ONBOARD' ? 'text-brand-primary bg-white/5 border border-white/10' : 'text-white/40 hover:text-white'}`}>
                  <Home size={18} />
               </button>
               <button onClick={() => setStep('DASHBOARD')} className={`p-2.5 rounded-xl transition-all ${step === 'DASHBOARD' ? 'text-brand-secondary bg-white/5 border border-white/10' : 'text-white/40 hover:text-white'}`}>
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
               >
                  <PlusCircle size={18} />
               </button>
            </div>
        </div>
      </motion.div>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        {step === 'ONBOARD' && (
          <motion.div key="onboard" variants={staggerContainer} initial="hidden" animate="visible" exit="exit" className="w-full">
            <motion.div variants={fadeInUp} className="mb-10 text-left">
              <h1 className="text-5xl font-black mb-2 tracking-tighter leading-[0.9]">Gig Spottr</h1>
              <h2 className="text-brand-secondary text-lg">Establish your strategic baseline.</h2>
            </motion.div>
            <motion.div variants={fadeInUp}>
              <Card>
                <h1 className="text-xs font-bold tracking-[0.2em] text-brand-tertiary mb-6 uppercase">Phase 1: Ingestion</h1>
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2">Target Email</label>
                <input 
                  type="email" 
                  className="w-full bg-brand-bg/80 border border-white/10 rounded-full px-6 py-4 mb-6 focus:outline-none focus:border-brand-primary placeholder:text-white/10"
                  placeholder="name@agency.com" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                />
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-3">CV Resource</label>
                <div className="flex gap-2 mb-6">
                  {['text', 'file', 'link'].map(mode => (
                    <button 
                      key={mode}
                      onClick={() => setInputMode(mode)} 
                      className={`flex-1 flex gap-2 justify-center items-center py-3 rounded-xl border text-[10px] font-bold tracking-widest transition-all ${inputMode === mode ? 'bg-brand-primary border-brand-primary text-black' : 'border-white/10 text-white/40 hover:bg-white/5'}`}
                    >
                      {mode.toUpperCase()}
                    </button>
                  ))}
                </div>

                {inputMode === 'text' && (
                  <textarea className="w-full bg-brand-bg/80 border border-white/10 rounded-2xl px-6 py-4 min-h-[160px] mb-4 focus:outline-none focus:border-brand-primary transition-all placeholder:text-white/10" placeholder="Paste resume text..." value={cvText} onChange={e => setCvText(e.target.value)} />
                )}
                
                {inputMode === 'link' && (
                  <input type="url" className="w-full bg-brand-bg/80 border border-white/10 rounded-full px-6 py-4 mb-4 focus:outline-none focus:border-brand-tertiary transition-all placeholder:text-white/10" placeholder="https://linkedin.com/in/you" value={cvLink} onChange={e => setCvLink(e.target.value)} />
                )}
                
                {inputMode === 'file' && (
                  <div className="w-full bg-brand-bg/50 border border-white/10 hover:border-brand-secondary rounded-2xl p-8 mb-4 flex flex-col items-center justify-center cursor-pointer transition-all" onClick={() => fileInputRef.current?.click()}>
                      <input type="file" className="hidden" ref={fileInputRef} accept=".pdf,.txt" onChange={e => setCvFile(e.target.files[0])} />
                      <Upload size={24} className="text-brand-secondary mb-3 opacity-50" />
                      <span className="text-[10px] font-bold tracking-widest uppercase opacity-40">{cvFile ? cvFile.name : 'Drop PDF Resume'}</span>
                  </div>
                )}
                <Button onClick={handleOnboard} loading={loading}>
                  {loading ? 'Syncing Baseline' : 'Sync Baseline'}
                </Button>
                {/* Fixed Alignment for Error */}
                {error && <p className="text-brand-primary mt-4 text-[10px] font-black uppercase tracking-widest text-left leading-relaxed">{error}</p>}
              </Card>
            </motion.div>
          </motion.div>
        )}

        {step === 'ANALYZE' && (
          <motion.div key="analyze" variants={staggerContainer} initial="hidden" animate="visible" exit="exit" className="w-full">
            <motion.div variants={fadeInUp} className="mb-10 text-left">
              <h1 className="text-5xl font-black mb-2 tracking-tighter leading-[0.9]">Ask Analyst</h1>
              <h2 className="text-brand-secondary text-lg">Analyze Job Market Fit</h2>
            </motion.div>
            <motion.div variants={fadeInUp}>
              <Card>
                <h1 className="text-xs font-bold tracking-[0.2em] text-brand-secondary mb-6 uppercase">Phase 2: Scrape & Scan</h1>
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2">Job URL (Auto-Scrape)</label>
                <input 
                  type="url" 
                  className="w-full bg-brand-bg/80 border border-white/10 rounded-full px-6 py-4 mb-6 focus:outline-none focus:border-brand-secondary placeholder:text-white/10"
                  placeholder="https://ashbyhq.com/..." 
                  value={jobUrl} 
                  onChange={e => setJobUrl(e.target.value)} 
                />
                <div className="relative flex items-center mb-6">
                  <div className="flex-grow border-t border-white/5"></div>
                  <span className="flex-shrink mx-4 text-[10px] font-black opacity-20 tracking-widest">OR PASTE RAW</span>
                  <div className="flex-grow border-t border-white/5"></div>
                </div>
                <textarea 
                  className="w-full bg-brand-bg/80 border border-white/10 rounded-2xl px-6 py-4 min-h-[160px] mb-4 focus:outline-none focus:border-brand-secondary transition-all placeholder:text-white/10"
                  placeholder="Paste job description..." 
                  value={jobText} 
                  onChange={e => setJobText(e.target.value)} 
                />
                <Button onClick={handleAnalyze} loading={loading}>
                  {loading ? 'Analyzing Fit' : 'Analyze Fit'}
                </Button>
                {/* Fixed Alignment for Error */}
                {error && <p className="text-brand-primary mt-4 text-[10px] font-black uppercase tracking-widest text-left leading-relaxed">{error}</p>}
              </Card>
            </motion.div>
          </motion.div>
        )}

        {step === 'REPORT' && reportData && (
          <motion.div key="report" variants={staggerContainer} initial="hidden" animate="visible" exit="exit" className="w-full">
            <motion.div variants={fadeInUp} className="mb-10 text-left">
              <h1 className="text-5xl font-black mb-2 tracking-tighter leading-[0.9]">Match Audit</h1>
              <h2 className="text-brand-tertiary text-lg">Structural Probability Report</h2>
            </motion.div>
            
            <motion.div variants={fadeInUp}>
              <Card>
                  <div className="text-center mb-6">
                      <div className="text-6xl font-black text-brand-primary mb-2 tabular-nums">{reportData.skillsMatch?.score || 0}%</div>
                      <div className="text-[10px] font-black tracking-[0.3em] uppercase opacity-30">Fit Probability</div>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden mb-6">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${reportData.skillsMatch?.score || 0}%` }} transition={{ duration: 1.5, ease: 'easeOut' }} className="h-full bg-gradient-to-r from-brand-primary via-brand-tertiary to-brand-secondary rounded-full" />
                  </div>
              </Card>
            </motion.div>

            <motion.div variants={fadeInUp} className="mt-4 grid grid-cols-1 gap-4">
              <Card className="border-l-2 border-l-[#3cff9e]">
                <h3 className="text-[10px] font-black tracking-widest text-[#3cff9e] mb-4 flex items-center gap-2 uppercase">
                  <CheckCircle size={14} className="opacity-50" /> Competitive Edge
                </h3>
                <ul className="space-y-2">
                  {reportData.strengths?.map((s, i) => (
                    <li key={i} className="text-xs leading-relaxed opacity-70">• {s}</li>
                  ))}
                </ul>
              </Card>
              <Card className="border-l-2 border-l-brand-primary">
                <h3 className="text-[10px] font-black tracking-widest text-brand-primary mb-4 flex items-center gap-2 uppercase">
                  <AlertTriangle size={14} className="opacity-50" /> Resistance Points
                </h3>
                <ul className="space-y-2">
                  {reportData.weaknesses?.map((w, i) => (
                    <li key={i} className="text-xs leading-relaxed opacity-70">• {w}</li>
                  ))}
                </ul>
              </Card>
            </motion.div>

            <motion.div variants={fadeInUp} className="mt-8 flex flex-col gap-3">
               <Button onClick={() => handleDecision('Applied')} loading={loading}>
                 {loading ? 'Marking Applied' : 'Confirm Application'}
               </Button>
               <button onClick={() => handleDecision('Skipped')} disabled={loading} className="w-full text-[10px] font-black uppercase tracking-[0.3em] py-4 text-white/20 hover:text-white transition-all">Abort Search</button>
            </motion.div>
          </motion.div>
        )}

        {step === 'SUCCESS' && (
            <motion.div key="success" variants={fadeInUp} initial="hidden" animate="visible" exit="exit" className="w-full h-[70vh] flex flex-col items-center justify-center text-center">
                <div className="w-24 h-24 bg-brand-secondary/20 rounded-full flex items-center justify-center mb-8 border border-brand-secondary/30 ring-8 ring-brand-secondary/5">
                    <CheckCircle size={48} className="text-brand-secondary" />
                </div>
                <h1 className="text-4xl font-black tracking-tighter mb-4">Move Locked.</h1>
                <p className="text-white/50 text-sm mb-10 max-w-[280px] leading-relaxed">
                    {lastDecision === 'Applied' 
                        ? "Your move has been recorded. The Notion courier is currently syncing your pipeline." 
                        : "Log updated. Aborting this pursuit and clearing search fields."}
                </p>
                <div className="flex flex-col w-full gap-4">
                    <Button onClick={() => { setStep('ANALYZE'); setReportData(null); }}>
                        ANALYZE NEXT JOB
                    </Button>
                    <button onClick={() => setStep('DASHBOARD')} className="text-[10px] uppercase font-black tracking-widest text-white/30 hover:text-brand-secondary transition-all">
                        View Progress Dashboard
                    </button>
                </div>
            </motion.div>
        )}

        {step === 'DASHBOARD' && (
            <motion.div key="dashboard" variants={staggerContainer} initial="hidden" animate="visible" exit="exit" className="w-full">
                <div className="mb-10 text-left">
                    <h1 className="text-4xl font-black mb-2 tracking-tighter">Progress Log</h1>
                    <h2 className="text-brand-secondary text-lg">Pipeline Status</h2>
                </div>

                <div className="flex flex-col gap-4 pb-20">
                    {Object.entries(buckets).map(([key, list], idx) => {
                        const categoryTitles = {
                            analyzed: 'Analyzed',
                            isFit: 'Fit',
                            notFit: 'No Fit',
                            applied: 'Apply',
                            declined: 'Decline'
                        };
                        return (
                            <DashboardCategory 
                                key={key} 
                                title={categoryTitles[key] || key} 
                                items={list} 
                                idx={idx}
                                status={key}
                                onStatusChange={fetchDashboard}
                            />
                        );
                    })}
                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DashboardCategory({ title, items, idx, status, onStatusChange }) {
    const [expanded, setExpanded] = useState(false);
    
    return (
        <Card className={`transition-all ${expanded ? 'h-auto pb-12' : 'h-auto'} overflow-hidden relative pt-10 pb-16`}>
            <div className="flex justify-between items-start cursor-pointer px-2" onClick={() => setExpanded(!expanded)}>
                <div className="flex flex-col gap-2">
                    <h3 className="leading-none">{title}</h3>
                    <p className="text-[10px] font-bold opacity-30 uppercase tracking-[0.25em]">{items.length} LOGS</p>
                </div>
                <div className={`toggle-circle ${expanded ? 'active' : ''} -mt-2 transition-all duration-500`}>
                    {expanded ? <ChevronUp size={20} strokeWidth={3} /> : <ChevronDown size={20} strokeWidth={3} />}
                </div>
            </div>

            <AnimatePresence>
                {expanded && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-4 pt-4 border-t border-white/5 dashboard-list-container space-y-2 pr-2"
                    >
                        {items.length === 0 ? (
                            <p className="text-[10px] font-black opacity-20 text-center py-8 tracking-widest">STILL HUNTING...</p>
                        ) : (
                            items.map((report) => (
                                <DashboardListing 
                                    key={report.id} 
                                    report={report} 
                                    status={status}
                                    onUpdate={onStatusChange}
                                />
                            ))
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
}

function DashboardListing({ report, status, onUpdate }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleMove = async (newStatus) => {
        setLoading(true);
        try {
            await fetch('/api/update-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reportId: report.id, decision: newStatus })
            });
            onUpdate();
        } catch (err) {
            console.error('Failed to move:', err);
        } finally {
            setLoading(false);
        }
    };

    if (status === 'analyzed') {
        const Content = () => (
            <div className={`flex justify-between items-center py-2 px-4 transition-all group ${report.jobUrl ? 'cursor-pointer' : 'opacity-60'}`}>
                <div className="text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                    <span className={`transition-colors ${report.jobUrl ? 'text-white/80 group-hover:text-brand-primary' : 'text-white/80'}`}>{report.jobTitle}</span>
                    {report.company && !['UNKNOWN', 'Unknown', 'Unknown Company'].includes(report.company) && (
                        <>
                            <span className="mx-2 opacity-10">|</span>
                            <span className="text-white/40">{report.company}</span>
                        </>
                    )}
                    <span className="mx-2 opacity-10">|</span>
                    <span className="text-white/10 transition-colors">{new Date(report.createdAt).toLocaleDateString()}</span>
                </div>
            </div>
        );

        return report.jobUrl ? (
            <a href={report.jobUrl} target="_blank" rel="noopener noreferrer" className="block hover:bg-white/[0.02] rounded-lg transition-all">
                <Content />
            </a>
        ) : <Content />;
    }

    return (
        <div className="group">
            <div 
                onClick={() => setOpen(!open)}
                className={`flex justify-between items-center py-4 px-4 rounded-xl border border-white/5 hover:bg-white/[0.02] cursor-pointer transition-all ${open ? 'bg-white/[0.03] border-brand-secondary/30' : ''}`}
            >
                <div className="flex flex-col gap-1 max-w-[75%]">
                    <span className="text-[11px] font-black tracking-tight text-white/90 group-hover:text-brand-primary transition-colors uppercase leading-tight">{report.jobTitle}</span>
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{report.company || 'Unknown'}</span>
                        <span className="text-[9px] font-bold text-white/10 uppercase tracking-widest">•</span>
                        <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{new Date(report.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                    <span className="text-[10px] font-black text-brand-secondary tabular-nums opacity-60">
                        {report.skillsMatchPercent}%
                    </span>
                    <div className="opacity-20 group-hover:opacity-100 transition-opacity">
                        <ChevronDown size={14} className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {open && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-6 bg-white/[0.01] rounded-b-xl border-x border-b border-white/5 space-y-6">
                            <div className="flex gap-12">
                                <div>
                                    <p className="text-[9px] font-black text-brand-secondary uppercase tracking-[0.2em] mb-4">Fit Analysis</p>
                                    <h4 className="text-3xl font-black text-brand-primary tabular-nums">{report.skillsMatchPercent}%</h4>
                                </div>
                                <div className="flex-1">
                                    <p className="text-[9px] font-black text-brand-secondary uppercase tracking-[0.2em] mb-3">Top Strength</p>
                                    <p className="text-[10px] opacity-60 italic leading-relaxed">"{report.strengths?.[0] || 'Strategic alignment detected.'}"</p>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-white/5 flex flex-wrap gap-x-6 gap-y-4 justify-start">
                                {['FIT', 'NO FIT', 'APPLY', 'DECLINE'].map(status => (
                                    status.toUpperCase() !== report.userDecision.toUpperCase() && (
                                        <button 
                                            key={status}
                                            disabled={loading}
                                            onClick={(e) => { e.stopPropagation(); handleMove(status); }}
                                            className="group/btn transition-all flex items-center gap-2 cursor-pointer"
                                        >
                                            <MapPin size={10} className="text-brand-tertiary" />
                                            <span className="text-[9px] font-black uppercase tracking-widest text-white/40 group-hover/btn:text-brand-primary transition-colors">{status}</span>
                                        </button>
                                    )
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
      </AnimatePresence>
      </main>
    </div>
  );
}

