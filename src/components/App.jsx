import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Target, CheckCircle, AlertTriangle,
  Upload, LayoutDashboard, PlusSquare as PlusCircle,
  ChevronDown, ChevronUp, Home, MapPin,
  Search, XCircle, Database, ThumbsDown, Building2, Calendar, Link as LinkIcon,
  RefreshCw, Send, Ban, MessageSquare, Clock, Archive, Check, FileText,
  PenTool, Clipboard, Clapperboard, BookOpen, Package, DollarSign
} from 'lucide-react';
import confetti from 'canvas-confetti';

import Button from './UI/Button';
import Card from './UI/Card';
import AppHeader from './UI/AppHeader';

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

    const statusOrder = { 'COMPILING': 1, 'SUBMITTED': 2, 'DEFERRED': 3, 'INTERVIEWED': 4 };

    const getFitScore = (report) => report.overallFitScore ?? report.skillsMatchPercent ?? 0;

    const sortByScoreAndOldest = (a, b) => {
      const scoreDiff = getFitScore(b) - getFitScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(a.createdAt) - new Date(b.createdAt);
    };

    const sortByNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

    return {
      analyzed: [...list].sort(sortByNewest),
      isFit: list
        .filter(r => (r.userDecision === 'FIT' || (r.userDecision === 'Pending' && getFitScore(r) >= 80)))
        .sort(sortByScoreAndOldest),
      notFit: list
        .filter(r => (r.userDecision === 'NO FIT' || (r.userDecision === 'Pending' && getFitScore(r) < 80)))
        .sort(sortByScoreAndOldest),
      applied: list
        .filter(r => r.userDecision === 'APPLY' || r.userDecision === 'Applied')
        .sort((a, b) => {
          const orderA = statusOrder[a.applicantStatus] || 0;
          const orderB = statusOrder[b.applicantStatus] || 0;
          if (orderA !== orderB) return orderA - orderB;

          const dateA = a.statusDate ? new Date(a.statusDate) : new Date(a.createdAt);
          const dateB = b.statusDate ? new Date(b.statusDate) : new Date(b.createdAt);
          return dateA - dateB;
        }),
      declined: list
        .filter(r => r.userDecision === 'DECLINE' || r.userDecision === 'Skipped' || (r.userDecision === 'Pending' && new Date(r.createdAt) < tenDaysAgo))
        .sort(sortByNewest)
    };
  };

  const buckets = getBuckets();

  return (
    <div className="relative w-full min-h-screen min-h-[100dvh] flex flex-col">
      <AppHeader
        step={step}
        setStep={setStep}
        setReportData={setReportData}
        setJobUrl={setJobUrl}
        setJobText={setJobText}
      />

      <main
        className="flex-1 w-full max-w-[var(--shell-max-w)] mx-auto px-[var(--shell-pad-x)] pt-8"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        <AnimatePresence mode="wait">
          {step === 'ONBOARD' && (
            <motion.div key="onboard" variants={staggerContainer} initial="hidden" animate="visible" exit="exit" className="w-full">
              <motion.div variants={fadeInUp} className="mb-10 text-left">
                <h1 className="text-5xl font-black mb-2 tracking-tighter leading-[0.9]">Gig Spottr</h1>
                <h2 className="text-brand-secondary text-lg">Establish your strategic baseline.</h2>
              </motion.div>
              <motion.div variants={fadeInUp}>
                <Card>
                  <h1 className="text-xs font-bold tracking-[0.2em] text-brand-tertiary mb-6 uppercase">Phase 1: Ingestion</h1>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-brand-secondary mb-2">Target Email</label>
                  <input
                    type="email"
                    className="w-full bg-brand-bg/80 border border-white/30 rounded-full px-6 py-4 mb-6 focus:outline-none focus:border-brand-primary placeholder:text-white/30"
                    placeholder="name@agency.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                  <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-brand-secondary mb-3">CV Resource</label>
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
                    <textarea className="w-full bg-brand-bg/80 border border-white/30 rounded-2xl px-6 py-4 min-h-[160px] mb-4 focus:outline-none focus:border-brand-primary transition-all placeholder:text-white/30" placeholder="Paste resume text..." value={cvText} onChange={e => setCvText(e.target.value)} />
                  )}

                  {inputMode === 'link' && (
                    <input type="url" className="w-full bg-brand-bg/80 border border-white/30 rounded-full px-6 py-4 mb-4 focus:outline-none focus:border-brand-tertiary transition-all placeholder:text-white/30" placeholder="https://linkedin.com/in/you" value={cvLink} onChange={e => setCvLink(e.target.value)} />
                  )}

                  {inputMode === 'file' && (
                    <div className="w-full bg-brand-bg/50 border border-white/30 hover:border-brand-secondary rounded-2xl p-8 mb-4 flex flex-col items-center justify-center cursor-pointer transition-all" onClick={() => fileInputRef.current?.click()}>
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
                  <h1 className="text-xs font-bold tracking-[0.2em] text-brand-tertiary mb-6 uppercase">Phase 2: Scrape & Scan</h1>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-brand-secondary mb-2">Job URL (Auto-Scrape)</label>
                  <input
                    type="url"
                    className="w-full bg-brand-bg/80 border border-white/30 rounded-full px-6 py-4 mb-6 focus:outline-none focus:border-brand-secondary placeholder:text-white/30"
                    placeholder="https://ashbyhq.com/..."
                    value={jobUrl}
                    onChange={e => setJobUrl(e.target.value)}
                  />
                  <div className="relative flex items-center mb-6">
                    <div className="flex-grow border-t border-white/30"></div>
                    <span className="flex-shrink mx-4 text-[10px] font-black text-white/80 tracking-widest">OR PASTE RAW</span>
                    <div className="flex-grow border-t border-white/30"></div>
                  </div>
                  <textarea
                    className="w-full bg-brand-bg/80 border border-white/30 rounded-2xl px-6 py-4 min-h-[160px] mb-4 focus:outline-none focus:border-brand-secondary transition-all placeholder:text-white/30"
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
                    <div className="text-6xl font-black text-brand-primary mb-2 tabular-nums">
                      {reportData.overallFitScore ?? reportData.skillsMatch?.score ?? 0}%
                    </div>
                    <div className="text-[10px] font-black tracking-[0.3em] uppercase opacity-30">Fit Probability</div>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden mb-6">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${reportData.overallFitScore ?? reportData.skillsMatch?.score ?? 0}%` }}
                      transition={{ duration: 1.5, ease: 'easeOut' }}
                      className="h-full bg-gradient-to-r from-brand-primary via-brand-tertiary to-brand-secondary rounded-full"
                    />
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
              <div className="mb-12 text-left">
                <h1 className="text-5xl font-black mb-2 tracking-tighter leading-[0.9]">Progress Log</h1>
                <h2 className="text-brand-secondary text-lg">Pipeline Status</h2>
              </div>

              <div className="flex flex-col gap-16 pb-24">
                {Object.entries(buckets).map(([key, list]) => (
                  <DashboardSection
                    key={key}
                    bucketKey={key}
                    list={list}
                    onUpdate={fetchDashboard}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div >
  );
}

function DashboardSection({ bucketKey, list, onUpdate }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-collapse when section becomes empty
  useEffect(() => {
    if (list.length === 0 && isExpanded) {
      setIsExpanded(false);
    }
  }, [list.length]);

  const config = {
    analyzed: { title: 'Analyzed', icon: <Search size={22} strokeWidth={2.5} /> },
    isFit: { title: 'Fit', icon: <CheckCircle size={22} strokeWidth={2.5} /> },
    notFit: { title: 'No Fit', icon: <XCircle size={22} strokeWidth={2.5} /> },
    applied: { title: 'Apply', icon: <Database size={22} strokeWidth={2.5} /> },
    declined: { title: 'Decline', icon: <ThumbsDown size={22} strokeWidth={2.5} /> }
  };
  const section = config[bucketKey] || { title: bucketKey, icon: null };

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div
          className="flex items-center gap-4 cursor-pointer group w-fit"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {/* Toggle Chevron */}
          <div className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all duration-300
            ${isExpanded
              ? 'bg-brand-tertiary border-brand-tertiary text-black'
              : 'bg-transparent border-brand-tertiary text-brand-tertiary'
            }`}
          >
            {isExpanded ? <ChevronUp size={18} strokeWidth={2.5} /> : <ChevronDown size={18} strokeWidth={2.5} />}
          </div>

          <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white flex items-center gap-3">
            {section.title}
            <span className="text-brand-tertiary opacity-40 group-hover:opacity-100 transition-opacity">
              {section.icon}
            </span>
          </h2>
        </div>

        {/* Item count on new line */}
        <p className="ml-[52px] text-[10px] font-bold tracking-[0.3em] uppercase opacity-30">
          {list.length} logs
        </p>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 gap-6">
              {list.length === 0 ? (
                <div className="py-12 border border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center opacity-20">
                  <p className="text-[10px] font-black tracking-[0.3em] uppercase">Still Hunting...</p>
                </div>
              ) : (
                list.map((report) => (
                  <ProgressItemCard
                    key={report.id}
                    report={report}
                    status={bucketKey}
                    onUpdate={onUpdate}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ProgressItemCard({ report, status, onUpdate }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assetReqs, setAssetReqs] = useState({});
  const [appStatus, setAppStatus] = useState('');
  const [isWon, setIsWon] = useState(false);
  const [notification, setNotification] = useState(null);
  const [movingTo, setMovingTo] = useState(null);

  const triggerConfetti = () => {
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#ff2f92', '#2de2e6', '#9b5cff'] // Brand colors
    });
  };

  const handleWonToggle = () => {
    if (appStatus === 'COMPILING' || !appStatus) {
      setNotification('CONGRATS on the offer. Update your APPLICANT STATUS and check WON again to celebrate.');
      return;
    }
    const newWon = !isWon;
    setIsWon(newWon);
    if (newWon) triggerConfetti();
  };

  const handleMove = async (newStatus) => {
    setMovingTo(newStatus);
    setLoading(true);

    // Artificial delay for mobile feedback
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      await fetch('/api/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: report.id, decision: newStatus }),
      });
      onUpdate();
    } catch (err) {
      console.error('Failed to move:', err);
      setMovingTo(null);
    } finally {
      setLoading(false);
    }
  };

  const isLightVersion = ['analyzed', 'applied'].includes(status);

  const fitScore = report.overallFitScore ?? report.skillsMatchPercent ?? 0;

  return (
    <motion.div
      layout
      className="vibe-glass rounded-3xl p-6 md:p-8 hover:border-brand-tertiary transition-colors group border-transparent"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <motion.div layout className="flex justify-between items-start gap-4">
        <div className="space-y-3 min-w-0">
          {/* Row 1: Date (Top Left) */}
          <div className="flex items-center gap-1.5 font-medium normal-case text-xs tracking-[0.25em]">
            <Calendar size={12} strokeWidth={2} className="text-brand-secondary" />
            <span className="text-white/70">{new Date(report.createdAt).toLocaleDateString()}</span>
          </div>

          {/* Row 2: H3 job title */}
          <h3 className="text-lg md:text-xl font-bold tracking-tight normal-case group-hover:text-brand-secondary transition-colors leading-tight">
            {report.jobTitle}
          </h3>

          {/* Row 3: Company (Under H3) */}
          <div className="flex items-center gap-1.5 font-medium normal-case text-xs tracking-[0.25em]">
            <Building2 size={12} strokeWidth={2} className="text-brand-secondary" />
            <span className="truncate text-white/70">{report.company || 'Unknown'}</span>
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end justify-between self-stretch min-h-[44px]">
          <div className="flex items-center gap-4">
            {!isLightVersion && (
              <span className="text-sm font-bold text-brand-secondary tabular-nums opacity-80">
                {fitScore}%
              </span>
            )}

            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              aria-expanded={isExpanded}
              className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all
                ${isExpanded
                  ? 'bg-brand-primary border-brand-primary text-black shadow-[0_0_15px_rgba(255,47,146,0.35)]'
                  : 'bg-transparent border-brand-primary text-brand-primary hover:shadow-[0_0_12px_rgba(255,47,146,0.35)]'
                }`}
            >
              {isExpanded
                ? <ChevronUp size={18} strokeWidth={2} />
                : <ChevronDown size={18} strokeWidth={1.5} />}
            </button>
          </div>

          {/* Rollback Icons (Closed State) */}
          {status === 'applied' && !isExpanded && (
            <motion.div
              layoutId={`rollback-${report.id}`}
              className="flex items-center justify-between w-9 text-white"
            >
              <Package
                size={14}
                strokeWidth={1.5}
                onClick={(e) => { e.stopPropagation(); handleMove(fitScore >= 80 ? 'FIT' : 'NO FIT'); }}
                className="cursor-pointer hover:text-brand-primary transition-colors"
              />
              <ThumbsDown
                size={14}
                strokeWidth={1.5}
                onClick={(e) => { e.stopPropagation(); handleMove('DECLINE'); }}
                className="cursor-pointer hover:text-brand-primary transition-colors"
              />
            </motion.div>
          )}
        </div>
      </motion.div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="pt-8 space-y-8">
              {!isLightVersion ? (
                /* Full view: Fit Analysis */
                <div className="flex gap-12">
                  <div>
                    <p className="text-xs font-black text-brand-tertiary uppercase tracking-[0.2em] mb-2">Fit Analysis</p>
                    <h4 className="text-2xl md:text-3xl font-black text-white tabular-nums">
                      {fitScore}%
                    </h4>
                  </div>
                  <div className="flex-1">
                    {status === 'notFit' ? (
                      <>
                        <p className="text-xs font-black text-brand-tertiary uppercase tracking-[0.2em] mb-2">Biggest Gap</p>
                        <p className="text-sm opacity-70 leading-relaxed">
                          "{report.weaknesses?.[0] || 'No critical gap identified.'}"
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-black text-brand-tertiary uppercase tracking-[0.2em] mb-2">Top Strength</p>
                        <p className="text-sm opacity-70 leading-relaxed">
                          "{report.strengths?.[0] || 'Strategic alignment detected.'}"
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                /* Light view: Job Link */
                <div className="flex justify-between items-center">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-black text-brand-tertiary uppercase tracking-[0.2em]">Job Link</p>
                      <LinkIcon size={12} strokeWidth={2} className="text-white" />
                    </div>
                    {report.jobUrl ? (
                      <a
                        href={report.jobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-mono text-white/70 hover:text-brand-primary hover:font-bold transition-all flex items-center gap-2"
                      >
                        View job post
                      </a>
                    ) : (
                      <span className="text-sm font-mono opacity-30 italic">No URL available</span>
                    )}
                  </div>

                  {/* Rollback Icons (Expanded State) */}
                  {status === 'applied' && isExpanded && (
                    <motion.div
                      layoutId={`rollback-${report.id}`}
                      className="flex items-center justify-between w-9 text-white self-end mb-1"
                    >
                      <Package
                        size={14}
                        strokeWidth={1.5}
                        onClick={(e) => { e.stopPropagation(); handleMove(fitScore >= 80 ? 'FIT' : 'NO FIT'); }}
                        className="cursor-pointer hover:text-brand-primary transition-colors"
                      />
                      <ThumbsDown
                        size={14}
                        strokeWidth={1.5}
                        onClick={(e) => { e.stopPropagation(); handleMove('DECLINE'); }}
                        className="cursor-pointer hover:text-brand-primary transition-colors"
                      />
                    </motion.div>
                  )}
                </div>
              )}

              {/* Apply Card Sections */}
              {status === 'applied' && (
                <div className="space-y-8 mt-8 border-t border-white/5 pt-8">
                  {/* Applicant Status */}
                  <div className="space-y-4">
                    <p className="text-xs font-black text-brand-tertiary uppercase tracking-[0.2em]">Applicant Status</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'COMPILING', icon: <RefreshCw size={14} />, target: 'COMPILING' },
                        { label: 'DEFERRED', icon: <Ban size={14} />, target: 'DEFERRED' },
                        { label: 'SUBMITTED', icon: <Send size={14} />, target: 'SUBMITTED' },
                        { label: 'INTERVIEWED', icon: <MessageSquare size={14} />, target: 'INTERVIEWED' }
                      ].map((btn) => (
                        <button
                          key={btn.label}
                          onClick={() => setAppStatus(btn.target)}
                          className={`flex items-center justify-center gap-2 py-3 px-4 rounded-full border text-[10px] font-bold tracking-widest transition-all
                            ${appStatus === btn.target
                              ? 'border-brand-primary text-brand-primary shadow-[0_0_10px_rgba(255,47,146,0.2)]'
                              : 'border-white/10 text-white/40 hover:border-brand-primary/50 hover:text-white'
                            }`}
                        >
                          {btn.icon}
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Submitted Assets Section */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-black text-brand-tertiary uppercase tracking-[0.2em]">Submitted Assets</p>
                      <Archive size={12} strokeWidth={2} className="text-white" />
                    </div>

                    <div className="space-y-4">
                      {/* Column Headers */}
                      <div className="flex gap-6 px-1">
                        <div className="w-6 flex justify-center">
                          <p className="text-[9px] font-black text-brand-secondary uppercase tracking-[0.2em]">Req</p>
                        </div>
                        <div className="flex-1">
                          <p className="text-[9px] font-black text-brand-secondary uppercase tracking-[0.2em]">Item Link</p>
                        </div>
                      </div>

                      {/* Asset Rows */}
                      <div className="space-y-3">
                        {[
                          { icon: <FileText size={14} />, label: 'CV', ghost: 'CV link' },
                          { icon: <PenTool size={14} />, label: 'Cov', ghost: 'Cover letter link' },
                          { icon: <Clipboard size={14} />, label: 'App', ghost: 'Application link' },
                          { icon: <Clapperboard size={14} />, label: 'Vid', ghost: 'Loom video link' },
                          { icon: <BookOpen size={14} />, label: 'Fol', ghost: 'Portfolio link' }
                        ].map((item) => (
                          <div key={item.label} className="flex items-center gap-6">
                            {/* Column 1: REQ (Tickbox) */}
                            <div
                              onClick={() => setAssetReqs(prev => ({ ...prev, [item.label]: !prev[item.label] }))}
                              className="w-6 h-6 shrink-0 rounded-lg border border-white/20 flex items-center justify-center cursor-pointer hover:border-brand-primary/50 transition-colors"
                            >
                              {assetReqs[item.label] && <Check size={14} strokeWidth={3} className="text-brand-primary" />}
                            </div>

                            {/* Column 2: ITEM LINK (Field) */}
                            <div className="flex-1 flex items-center gap-4 bg-transparent border border-white/10 rounded-2xl px-5 py-3 focus-within:border-brand-secondary transition-all">
                              <div className="flex items-center gap-2 shrink-0 text-brand-tertiary min-w-[50px]">
                                {item.icon}
                                <span className="text-[10px] font-black uppercase tracking-wider">{item.label}</span>
                              </div>
                              <input
                                type="text"
                                placeholder={item.ghost}
                                className="w-full bg-transparent border-none p-0 text-sm text-white placeholder:text-white/40 focus:ring-0 focus:outline-none"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Status Date & Salary/Won Row */}
                  <div className="grid grid-cols-1 gap-8">
                    {/* Status Date */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-black text-brand-tertiary uppercase tracking-[0.2em]">Status Date</p>
                        <Clock size={12} strokeWidth={2} className="text-white" />
                      </div>
                      <input
                        type="text"
                        placeholder="MM/DD/YYYY"
                        className="w-full bg-transparent border border-white/10 rounded-2xl px-6 py-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-brand-secondary transition-all"
                      />
                    </div>

                    {/* Salary & Won */}
                    <div className="grid grid-cols-[1fr_auto] gap-6 items-end">
                      {/* Salary Offered */}
                      <div className="space-y-4">
                        <p className="text-xs font-black text-brand-secondary uppercase tracking-[0.2em]">Salary Offered</p>
                        <div className="flex items-center gap-4 bg-transparent border border-white/10 rounded-2xl px-5 py-4 focus-within:border-brand-secondary transition-all">
                          <div className="flex items-center gap-1 shrink-0 text-brand-tertiary">
                            <DollarSign size={16} strokeWidth={2.5} />
                          </div>
                          <input
                            type="text"
                            placeholder="enter amount / frequency"
                            className="w-full bg-transparent border-none p-0 text-sm text-white placeholder:text-white/40 focus:ring-0 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Won Checkbox */}
                      <div className="flex flex-col items-center gap-4 pb-1">
                        <p className="text-xs font-black text-brand-secondary uppercase tracking-[0.2em]">Won</p>
                        <div
                          onClick={handleWonToggle}
                          className="w-10 h-10 rounded-xl border border-white/20 flex items-center justify-center cursor-pointer transition-all hover:border-brand-primary/50"
                        >
                          {isWon && <Check size={20} strokeWidth={4} className="text-brand-primary" />}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Notification Popup */}
              <AnimatePresence>
                {notification && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 20 }}
                      className="vibe-glass p-8 md:p-12 rounded-[2rem] shadow-2xl max-w-sm w-full space-y-8 border border-white/10"
                    >
                      <div className="space-y-4 text-left">
                        <h3 className="text-xl md:text-2xl font-black text-white leading-tight">
                          CONGRATS on the offer.
                        </h3>
                        <p className="text-sm font-mono text-white/60 leading-relaxed">
                          Update your APPLICANT STATUS and check WON again to celebrate.
                        </p>
                      </div>

                      <button
                        onClick={() => setNotification(null)}
                        className="rainbow-border w-full py-4 rounded-full bg-white/5 text-[10px] font-black uppercase tracking-[0.3em] text-white hover:bg-brand-primary hover:text-black transition-all"
                      >
                        Dismiss
                      </button>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* Status Pills (Move to buckets) */}
              {status !== 'analyzed' && status !== 'applied' && (
                <div className="space-y-4">
                  <p className="text-xs font-black text-brand-tertiary uppercase tracking-[0.2em]">Update Category</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'FIT', icon: <CheckCircle size={14} />, target: 'FIT' },
                      { label: 'NO FIT', icon: <XCircle size={14} />, target: 'NO FIT' },
                      { label: 'APPLY', icon: <Database size={14} />, target: 'APPLY' },
                      { label: 'DECLINE', icon: <ThumbsDown size={14} />, target: 'DECLINE' }
                    ].map((btn) => (
                      <button
                        key={btn.label}
                        disabled={loading}
                        onClick={() => handleMove(btn.target)}
                        className={`flex items-center justify-center gap-2 py-3 px-4 rounded-full border text-[10px] font-bold tracking-widest transition-all
                          ${movingTo === btn.target
                            ? 'border-brand-primary text-white bg-brand-primary/10 shadow-[0_0_15px_rgba(255,47,146,0.3)]'
                            : (status.toUpperCase() === btn.target || (status === 'isFit' && btn.target === 'FIT') || (status === 'notFit' && btn.target === 'NO FIT'))
                              ? 'bg-transparent border-brand-secondary text-brand-secondary shadow-[0_0_10px_rgba(45,226,230,0.15)]'
                              : 'bg-transparent border-white/10 text-white/40 hover:border-brand-primary/50 hover:text-white'
                          }`}
                      >
                        {btn.icon}
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

