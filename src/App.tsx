import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart3, 
  Wallet, 
  TrendingUp, 
  ShieldCheck, 
  MessageSquare, 
  Zap, 
  PieChart, 
  Settings, 
  Bell, 
  Search,
  ArrowUpRight,
  ArrowDownRight,
  BrainCircuit,
  Activity,
  Calendar,
  ChevronRight,
  Plus,
  CreditCard,
  History,
  AlertTriangle,
  CheckCircle2,
  X,
  FileText,
  UserCheck,
  Upload,
  Loader2,
  Clock,
  Users,
  Gem,
  Target,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Transaction, FinancialStats, AIDecision, Bill, ApprovalRequest, Investor, TreasuryStrategy } from './types';
import Markdown from 'react-markdown';
import { GoogleGenAI } from '@google/genai';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'simulations' | 'payments' | 'history' | 'bills' | 'approvals' | 'fundraising' | 'treasury'>('overview');
  const [stats, setStats] = useState<FinancialStats>({
    totalCash: 0,
    monthlyBurn: 0,
    runwayMonths: 0,
    healthScore: 0
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [treasuryStrategies, setTreasuryStrategies] = useState<TreasuryStrategy[]>([]);
  const [fundraisingAnalysis, setFundraisingAnalysis] = useState<string | null>(null);
  const [isAnalyzingFundraising, setIsAnalyzingFundraising] = useState(false);
  const [isOptimizingTreasury, setIsOptimizingTreasury] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([
    { role: 'ai', content: "Hello. I'm your Autonomous CFO. Phase 3 is active: Fully autonomous treasury management and AI-driven fundraising advisor are now online. How can I help you today?" }
  ]);
  const [input, setInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAddingInvestor, setIsAddingInvestor] = useState(false);
  const [newInvestor, setNewInvestor] = useState({ name: '', firm: '', stage: '', focus: '', status: 'Contacted' });
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchStats();
    fetchTransactions();
    fetchBills();
    fetchApprovals();
    fetchInvestors();
    fetchTreasuryStrategies();
    seedData();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchInvestors = async () => {
    try {
      const res = await fetch('/api/investors');
      const data = await res.json();
      setInvestors(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTreasuryStrategies = async () => {
    try {
      const res = await fetch('/api/treasury/strategies');
      const data = await res.json();
      setTreasuryStrategies(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleFundraisingAnalysis = async () => {
    setIsAnalyzingFundraising(true);
    try {
      const res = await fetch('/api/fundraising/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          transactions, 
          budgets: [], // Add budgets if available
          companyContext: { name: 'Acme Corp', sector: 'SaaS', stage: 'Seed' } 
        }),
      });
      const data = await res.json();
      setFundraisingAnalysis(data.analysis);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzingFundraising(false);
    }
  };

  const handleTreasuryOptimization = async () => {
    setIsOptimizingTreasury(true);
    try {
      const res = await fetch('/api/treasury/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          cashBalance: stats.totalCash,
          monthlyBurn: stats.monthlyBurn,
          currentStrategies: treasuryStrategies
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', content: `Treasury Optimization complete. I've identified ${data.length} new strategies to improve yield.` }]);
      fetchTreasuryStrategies();
    } catch (err) {
      console.error(err);
    } finally {
      setIsOptimizingTreasury(false);
    }
  };

  const handleAddInvestor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch('/api/investors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newInvestor, id: Math.random().toString(36).substr(2, 9) }),
      });
      fetchInvestors();
      setIsAddingInvestor(false);
      setNewInvestor({ name: '', firm: '', stage: '', focus: '', status: 'Contacted' });
      setMessages(prev => [...prev, { role: 'ai', content: `New investor **${newInvestor.name}** from **${newInvestor.firm}** added to your tracking list.` }]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleActivateStrategy = async (id: string) => {
    try {
      await fetch(`/api/treasury/strategies/${id}/activate`, { method: 'POST' });
      fetchTreasuryStrategies();
      setMessages(prev => [...prev, { role: 'ai', content: `Treasury strategy activated. Funds are being reallocated for optimal yield.` }]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRunSimulation = async () => {
    setIsAiThinking(true);
    try {
      const res = await fetch('/api/simulations/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          scenario: 'Custom Scenario',
          parameters: { 
            hiring: 2, 
            marketingSpend: 5000 
          } 
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', content: data.analysis }]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiThinking(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      const res = await fetch('/api/transactions');
      const data = await res.json();
      setTransactions(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchBills = async () => {
    try {
      const res = await fetch('/api/bills');
      const data = await res.json();
      setBills(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchApprovals = async () => {
    try {
      const res = await fetch('/api/approvals');
      const data = await res.json();
      setApprovals(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Image = (reader.result as string).split(',')[1];
      try {
        const res = await fetch('/api/bills/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Image, fileName: file.name }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        setMessages(prev => [...prev, { role: 'ai', content: `I've processed the bill from **${data.extracted.vendor}** for **${data.extracted.amount}**. An approval request has been sent to Slack.` }]);
        fetchBills();
        fetchApprovals();
      } catch (err) {
        console.error(err);
        setMessages(prev => [...prev, { role: 'ai', content: "Failed to process the bill. Please ensure it's a clear image." }]);
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApprovalResponse = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await fetch(`/api/approvals/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: `Responded via Dashboard` }),
      });
      fetchApprovals();
      fetchBills();
      setMessages(prev => [...prev, { role: 'ai', content: `Approval request ${status === 'approved' ? 'granted' : 'denied'}. Slack notification sent.` }]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setIsAiThinking(true);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are an Autonomous CFO Multi-Agent System. 
        Current Financial State:
        - Total Cash: $${stats.totalCash}
        - Monthly Burn: $${stats.monthlyBurn}
        - Runway: ${stats.runwayMonths.toFixed(1)} months
        - Pending Approvals: ${approvals.length}
        - Recent Bills: ${JSON.stringify(bills.slice(0, 3))}
        
        User Query: ${userMsg}
        
        Act as:
        1. Financial Analyst (Analyze trends)
        2. Risk Manager (Identify threats)
        3. Strategic Planner (Suggest actions)
        
        Provide a unified, professional response. Phase 3 is active, so you can discuss fundraising strategies, investor relations, and treasury optimization.`,
      });
      
      setMessages(prev => [...prev, { role: 'ai', content: response.text || "I'm processing your request." }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', content: "I encountered an error analyzing your data. Please try again." }]);
    } finally {
      setIsAiThinking(false);
    }
  };

  const seedData = async () => {
    try {
      await fetch('/api/seed', { method: 'POST' });
      fetchStats();
      fetchTransactions();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex h-screen bg-[#0A0A0B] text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/5 bg-[#0F0F11] flex flex-col p-6">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <BrainCircuit className="text-black w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">AutoCFO</h1>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarItem icon={<Activity size={20} />} label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <SidebarItem icon={<Zap size={20} />} label="Simulations" active={activeTab === 'simulations'} onClick={() => setActiveTab('simulations')} />
          <SidebarItem icon={<FileText size={20} />} label="Bills" active={activeTab === 'bills'} onClick={() => setActiveTab('bills')} />
          <SidebarItem icon={<UserCheck size={20} />} label="Approvals" active={activeTab === 'approvals'} onClick={() => setActiveTab('approvals')}>
            {approvals.length > 0 && (
              <span className="ml-auto bg-emerald-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {approvals.length}
              </span>
            )}
          </SidebarItem>
          <SidebarItem icon={<CreditCard size={20} />} label="Payments" active={activeTab === 'payments'} onClick={() => setActiveTab('payments')} />
          <SidebarItem icon={<History size={20} />} label="History" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
          <SidebarItem icon={<Users size={20} />} label="Fundraising" active={activeTab === 'fundraising'} onClick={() => setActiveTab('fundraising')} />
          <SidebarItem icon={<Gem size={20} />} label="Treasury" active={activeTab === 'treasury'} onClick={() => setActiveTab('treasury')} />
        </nav>

        <div className="pt-6 border-t border-white/5 space-y-2">
          <SidebarItem icon={<Settings size={20} />} label="Settings" />
          <div className="p-4 bg-white/5 rounded-2xl mt-4">
            <p className="text-xs text-white/40 mb-2 uppercase tracking-widest font-bold">System Status</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium">AI Agent Active</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-20 border-b border-white/5 px-8 flex items-center justify-between bg-[#0A0A0B]/80 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-4 bg-white/5 px-4 py-2 rounded-full border border-white/5 w-96">
            <Search size={18} className="text-white/40" />
            <input 
              type="text" 
              placeholder="Search transactions, insights, or documents..." 
              className="bg-transparent border-none outline-none text-sm w-full placeholder:text-white/20"
            />
          </div>
          <div className="flex items-center gap-6">
            <button className="relative p-2 text-white/60 hover:text-white transition-colors">
              <Bell size={22} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-[#0A0A0B]" />
            </button>
            <div className="flex items-center gap-3 pl-6 border-l border-white/10">
              <div className="text-right">
                <p className="text-sm font-bold">Acme Corp</p>
                <p className="text-xs text-white/40">Admin Access</p>
              </div>
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full border-2 border-white/10" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div 
                key="overview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">Financial Control Center</h2>
                    <p className="text-white/40 mt-1">Autonomous intelligence monitoring 4 connected accounts.</p>
                  </div>
                  <div className="flex gap-3">
                    <button className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all flex items-center gap-2">
                      <Calendar size={16} />
                      Last 30 Days
                    </button>
                    <button className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20">
                      <Plus size={18} />
                      New Allocation
                    </button>
                  </div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <StatCard 
                    title="Total Liquidity" 
                    value={`$${(stats.totalCash / 1000).toFixed(1)}k`} 
                    change="+12.5%" 
                    positive 
                    icon={<Wallet className="text-emerald-400" />} 
                  />
                  <StatCard 
                    title="Monthly Burn" 
                    value={`$${(stats.monthlyBurn / 1000).toFixed(1)}k`} 
                    change="-2.4%" 
                    positive 
                    icon={<TrendingUp className="text-orange-400" />} 
                  />
                  <StatCard 
                    title="Projected Runway" 
                    value={`${stats.runwayMonths.toFixed(1)} mo`} 
                    change="+0.5 mo" 
                    positive 
                    icon={<Zap className="text-yellow-400" />} 
                  />
                  <StatCard 
                    title="Health Score" 
                    value={`${stats.healthScore}/100`} 
                    change="Stable" 
                    positive 
                    icon={<ShieldCheck className="text-blue-400" />} 
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-8">
                    <div className="bg-[#0F0F11] border border-white/5 rounded-3xl p-8">
                      <div className="flex items-center justify-between mb-8">
                        <h3 className="text-xl font-bold">Cash Flow Forecast</h3>
                        <div className="flex gap-2">
                          <button className="px-3 py-1 text-xs font-bold bg-white/10 rounded-lg">1M</button>
                          <button className="px-3 py-1 text-xs font-bold text-white/40 hover:text-white transition-colors">3M</button>
                          <button className="px-3 py-1 text-xs font-bold text-white/40 hover:text-white transition-colors">6M</button>
                        </div>
                      </div>
                      <div className="h-64 flex items-end gap-4 px-4">
                        {[45, 52, 48, 61, 55, 67, 72, 68, 75, 82, 78, 85].map((h, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-3 group">
                            <div className="w-full bg-white/5 rounded-t-lg relative overflow-hidden h-full">
                              <motion.div 
                                initial={{ height: 0 }}
                                animate={{ height: `${h}%` }}
                                transition={{ delay: i * 0.05, duration: 0.8 }}
                                className={`absolute bottom-0 w-full ${i > 7 ? 'bg-emerald-500/20 border-t border-emerald-500' : 'bg-white/10 border-t border-white/20'}`}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-white/20 group-hover:text-white/60 transition-colors uppercase">
                              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-[#0F0F11] border border-white/5 rounded-3xl overflow-hidden">
                      <div className="p-8 border-b border-white/5 flex items-center justify-between">
                        <h3 className="text-xl font-bold">Recent Activity</h3>
                        <button className="text-emerald-400 text-sm font-bold hover:underline">View All</button>
                      </div>
                      <div className="divide-y divide-white/5">
                        {transactions.map((tx) => (
                          <div key={tx.id} className="p-6 flex items-center justify-between hover:bg-white/[0.02] transition-colors group">
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${tx.amount > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-white/5 text-white/60'}`}>
                                {tx.amount > 0 ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                              </div>
                              <div>
                                <p className="font-bold">{tx.merchant}</p>
                                <p className="text-xs text-white/40">{tx.category} • {tx.date}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-bold ${tx.amount > 0 ? 'text-emerald-400' : 'text-white'}`}>
                                {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                              </p>
                              <p className="text-[10px] uppercase tracking-widest font-bold text-white/20 group-hover:text-white/40 transition-colors">{tx.status}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="bg-gradient-to-br from-emerald-500/20 to-indigo-500/20 border border-emerald-500/20 rounded-3xl p-8 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4">
                        <Zap className="text-emerald-400 animate-pulse" size={24} />
                      </div>
                      <h3 className="text-xl font-bold mb-4">AI Optimization</h3>
                      <p className="text-sm text-white/60 mb-6 leading-relaxed">
                        I've identified 3 redundant SaaS subscriptions costing <span className="text-white font-bold">$420/mo</span>. Would you like me to initiate cancellation?
                      </p>
                      <div className="flex gap-3">
                        <button className="flex-1 py-3 bg-emerald-500 text-black rounded-xl text-sm font-bold hover:bg-emerald-400 transition-all">Execute</button>
                        <button className="flex-1 py-3 bg-white/10 text-white rounded-xl text-sm font-bold hover:bg-white/20 transition-all">Review</button>
                      </div>
                    </div>

                    <ChatInterface 
                      messages={messages} 
                      input={input} 
                      setInput={setInput} 
                      onSend={handleSendMessage} 
                      isThinking={isAiThinking} 
                      chatEndRef={chatEndRef}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'simulations' && (
              <motion.div 
                key="simulations"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">Scenario Simulations</h2>
                    <p className="text-white/40 mt-1">Model the financial impact of strategic decisions before executing.</p>
                  </div>
                  <button className="px-4 py-2 bg-emerald-500 text-black rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20">
                    <Plus size={18} />
                    New Scenario
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-[#0F0F11] border border-white/5 rounded-3xl p-8 space-y-6">
                    <h3 className="text-xl font-bold">Active Scenarios</h3>
                    <div className="space-y-4">
                      <SimulationItem 
                        title="Hire 4 Senior Engineers" 
                        impact="Runway -3.2 months" 
                        risk="Medium"
                        color="orange"
                      />
                      <SimulationItem 
                        title="Double Marketing Spend" 
                        impact="Burn +$45k/mo" 
                        risk="High"
                        color="red"
                      />
                      <SimulationItem 
                        title="Expand to EU Market" 
                        impact="Runway -5.1 months" 
                        risk="Medium"
                        color="yellow"
                      />
                    </div>
                  </div>
                  
                  <div className="bg-[#0F0F11] border border-white/5 rounded-3xl p-8">
                    <h3 className="text-xl font-bold mb-6">Interactive Playground</h3>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-white/40 uppercase">Scenario Name</label>
                        <input type="text" placeholder="e.g. Raise Series A" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none focus:border-emerald-500/50" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-white/40 uppercase">Capital Influx</label>
                          <input type="number" placeholder="$0" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none focus:border-emerald-500/50" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-white/40 uppercase">Monthly Expense Increase</label>
                          <input type="number" placeholder="$0" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none focus:border-emerald-500/50" />
                        </div>
                      </div>
                      <button 
                        onClick={handleRunSimulation}
                        className="w-full py-4 bg-emerald-500 text-black rounded-xl font-bold hover:bg-emerald-400 transition-all"
                      >
                        Run Simulation
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'bills' && (
              <motion.div 
                key="bills"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">Bill Management</h2>
                    <p className="text-white/40 mt-1">Upload invoices for AI-powered OCR extraction and approval.</p>
                  </div>
                  <div className="flex gap-3">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      className="hidden" 
                      accept="image/*"
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-4 py-2 bg-emerald-500 text-black rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                    >
                      {isUploading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                      {isUploading ? 'Processing...' : 'Upload Bill'}
                    </button>
                  </div>
                </div>

                <div className="bg-[#0F0F11] border border-white/5 rounded-3xl overflow-hidden">
                  <div className="p-8 border-b border-white/5">
                    <h3 className="text-xl font-bold">Pending & Recent Bills</h3>
                  </div>
                  <div className="divide-y divide-white/5">
                    {bills.length === 0 ? (
                      <div className="p-12 text-center text-white/20">No bills processed yet.</div>
                    ) : (
                      bills.map((bill) => (
                        <div key={bill.id} className="p-6 flex items-center justify-between hover:bg-white/[0.02] transition-colors group">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white/60">
                              <FileText size={20} />
                            </div>
                            <div>
                              <p className="font-bold">{bill.vendor || 'Unknown Vendor'}</p>
                              <p className="text-xs text-white/40">{bill.category || 'Uncategorized'} • Due {bill.due_date || 'N/A'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-8">
                            <div className="text-right">
                              <p className="font-bold">${bill.amount?.toLocaleString() || '0.00'}</p>
                              <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg ${
                                bill.status === 'approved' ? 'bg-emerald-500/10 text-emerald-500' : 
                                bill.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' : 
                                'bg-red-500/10 text-red-500'
                              }`}>
                                {bill.status}
                              </span>
                            </div>
                            <ChevronRight size={20} className="text-white/10 group-hover:text-white/40 transition-colors" />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'approvals' && (
              <motion.div 
                key="approvals"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">Approval Queue</h2>
                    <p className="text-white/40 mt-1">Review and approve financial actions initiated by the AI Agent.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {approvals.length === 0 ? (
                    <div className="bg-[#0F0F11] border border-white/5 rounded-3xl p-12 text-center text-white/20">
                      All caught up! No pending approvals.
                    </div>
                  ) : (
                    approvals.map((req) => (
                      <div key={req.id} className="bg-[#0F0F11] border border-white/5 rounded-3xl p-8 flex items-center justify-between">
                        <div className="flex items-center gap-6">
                          <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center">
                            <Zap size={32} />
                          </div>
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <h3 className="text-xl font-bold">
                                {req.type === 'bill_payment' ? `Pay ${req.vendor}` : 'Budget Allocation'}
                              </h3>
                              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/5 px-2 py-1 rounded-lg text-white/40">
                                {req.type.replace('_', ' ')}
                              </span>
                            </div>
                            <p className="text-sm text-white/60 max-w-md">
                              AI Agent has processed a bill for **${req.amount}** from **${req.vendor}**. 
                              Runway impact: <span className="text-emerald-400">-{((req.amount / stats.totalCash) * 100).toFixed(2)}%</span>.
                            </p>
                            <div className="flex items-center gap-4 mt-4 text-xs text-white/30">
                              <span className="flex items-center gap-1"><Clock size={12} /> Requested {new Date(req.requested_at).toLocaleTimeString()}</span>
                              <span className="flex items-center gap-1"><BrainCircuit size={12} /> Initiated by AutoCFO</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <button 
                            onClick={() => handleApprovalResponse(req.id, 'rejected')}
                            className="px-6 py-3 bg-white/5 hover:bg-red-500/10 hover:text-red-500 border border-white/10 rounded-xl text-sm font-bold transition-all"
                          >
                            Reject
                          </button>
                          <button 
                            onClick={() => handleApprovalResponse(req.id, 'approved')}
                            className="px-6 py-3 bg-emerald-500 text-black rounded-xl text-sm font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
                          >
                            Approve & Pay
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'payments' && (
              <motion.div 
                key="payments"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-2xl mx-auto space-y-8"
              >
                <div className="text-center space-y-2">
                  <h2 className="text-3xl font-bold tracking-tight">Autonomous Payments</h2>
                  <p className="text-white/40">Securely allocate capital or pay vendors via Stripe.</p>
                </div>
                
                <div className="bg-[#0F0F11] border border-white/5 rounded-3xl p-8">
                  <Elements stripe={stripePromise}>
                    <PaymentForm />
                  </Elements>
                </div>
              </motion.div>
            )}

            {activeTab === 'fundraising' && (
              <motion.div 
                key="fundraising"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">AI Fundraising Advisor</h2>
                    <p className="text-white/40 mt-1">Strategic capital raising and investor relationship management.</p>
                  </div>
                  <button 
                    onClick={handleFundraisingAnalysis}
                    disabled={isAnalyzingFundraising}
                    className="px-6 py-3 bg-emerald-500 text-black rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {isAnalyzingFundraising ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                    {isAnalyzingFundraising ? 'Analyzing...' : 'Generate Fundraising Strategy'}
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-8">
                    {fundraisingAnalysis ? (
                      <div className="bg-[#0F0F11] border border-emerald-500/20 rounded-3xl p-8 prose prose-invert max-w-none">
                        <Markdown>{fundraisingAnalysis}</Markdown>
                      </div>
                    ) : (
                      <div className="bg-[#0F0F11] border border-white/5 rounded-3xl p-12 text-center text-white/20">
                        Click the button above to generate a custom fundraising strategy based on your current financials.
                      </div>
                    )}
                  </div>

                  <div className="space-y-8">
                    <div className="bg-[#0F0F11] border border-white/5 rounded-3xl p-8">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-bold">Target Investors</h3>
                        <button 
                          onClick={() => setIsAddingInvestor(true)}
                          className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                      <div className="space-y-4">
                        {investors.length === 0 ? (
                          <p className="text-center text-white/20 text-sm py-4">No investors tracked yet.</p>
                        ) : (
                          investors.map((investor) => (
                            <div key={investor.id} className="p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-all">
                              <div className="flex items-center justify-between mb-2">
                                <p className="font-bold">{investor.name}</p>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  investor.status === 'Lead' ? 'bg-emerald-500/10 text-emerald-500' :
                                  investor.status === 'Interested' ? 'bg-blue-500/10 text-blue-500' :
                                  'bg-white/10 text-white/40'
                                }`}>
                                  {investor.status}
                                </span>
                              </div>
                              <p className="text-xs text-white/40">{investor.firm} • {investor.stage}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'treasury' && (
              <motion.div 
                key="treasury"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">Autonomous Treasury</h2>
                    <p className="text-white/40 mt-1">AI-driven yield optimization and risk management.</p>
                  </div>
                  <button 
                    onClick={handleTreasuryOptimization}
                    disabled={isOptimizingTreasury}
                    className="px-6 py-3 bg-indigo-500 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                  >
                    {isOptimizingTreasury ? <Loader2 className="animate-spin" size={18} /> : <Target size={18} />}
                    {isOptimizingTreasury ? 'Optimizing...' : 'Optimize Yield'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {treasuryStrategies.map((strategy) => (
                    <div key={strategy.id} className="bg-[#0F0F11] border border-white/5 rounded-3xl p-8 relative overflow-hidden group">
                      <div className={`absolute top-0 right-0 p-4 ${strategy.status === 'Active' ? 'text-emerald-400' : 'text-white/20'}`}>
                        {strategy.status === 'Active' ? <CheckCircle2 size={24} /> : <Clock size={24} />}
                      </div>
                      <div className="mb-6">
                        <h3 className="text-xl font-bold mb-2">{strategy.name}</h3>
                        <p className="text-sm text-white/60 leading-relaxed">{strategy.description}</p>
                      </div>
                      <div className="flex items-center justify-between pt-6 border-t border-white/5">
                        <div>
                          <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Est. Yield</p>
                          <p className="text-2xl font-bold text-emerald-400">{strategy.potential_yield}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Risk</p>
                          <p className={`text-sm font-bold ${
                            strategy.risk_level === 'Low' ? 'text-emerald-400' :
                            strategy.risk_level === 'Medium' ? 'text-yellow-400' :
                            'text-red-400'
                          }`}>{strategy.risk_level}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleActivateStrategy(strategy.id)}
                        className={`w-full mt-8 py-3 rounded-xl text-sm font-bold transition-all ${
                        strategy.status === 'Active' 
                          ? 'bg-white/5 text-white/40 cursor-not-allowed' 
                          : 'bg-white/10 text-white hover:bg-white/20'
                      }`}>
                        {strategy.status === 'Active' ? 'Currently Active' : 'Activate Strategy'}
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Add Investor Modal */}
      <AnimatePresence>
        {isAddingInvestor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingInvestor(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[#0F0F11] border border-white/10 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-2xl font-bold mb-6">Add Target Investor</h3>
              <form onSubmit={handleAddInvestor} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-white/40 uppercase mb-2 block">Investor Name</label>
                  <input 
                    required
                    value={newInvestor.name}
                    onChange={e => setNewInvestor({...newInvestor, name: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none focus:border-emerald-500/50" 
                    placeholder="e.g. Sarah Chen"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-white/40 uppercase mb-2 block">Firm</label>
                  <input 
                    required
                    value={newInvestor.firm}
                    onChange={e => setNewInvestor({...newInvestor, firm: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none focus:border-emerald-500/50" 
                    placeholder="e.g. Sequoia Capital"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-white/40 uppercase mb-2 block">Stage</label>
                    <input 
                      required
                      value={newInvestor.stage}
                      onChange={e => setNewInvestor({...newInvestor, stage: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none focus:border-emerald-500/50" 
                      placeholder="e.g. Series A"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-white/40 uppercase mb-2 block">Status</label>
                    <select 
                      value={newInvestor.status}
                      onChange={e => setNewInvestor({...newInvestor, status: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none focus:border-emerald-500/50"
                    >
                      <option value="Contacted">Contacted</option>
                      <option value="Interested">Interested</option>
                      <option value="Lead">Lead</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAddingInvestor(false)}
                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-emerald-500 text-black rounded-xl font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
                  >
                    Add Investor
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PaymentForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    try {
      const res = await fetch('/api/payments/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 5000 }), // $50.00 for demo
      });
      const { clientSecret } = await res.json();

      const { error } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement) as any,
        },
      });

      if (error) setStatus('error');
      else setStatus('success');
    } catch (e) {
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'success') {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 size={32} />
        </div>
        <h3 className="text-xl font-bold">Payment Successful</h3>
        <p className="text-white/40">The capital has been allocated and the transaction is being indexed.</p>
        <button onClick={() => setStatus('idle')} className="text-emerald-400 font-bold hover:underline">Make another payment</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="text-xs font-bold text-white/40 uppercase">Amount (USD)</label>
        <div className="relative">
          <span className="absolute left-4 top-4 text-white/40">$</span>
          <input type="number" defaultValue="50.00" className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-8 pr-4 outline-none focus:border-emerald-500/50" />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-white/40 uppercase">Card Details</label>
        <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
          <CardElement options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#fff',
                '::placeholder': { color: 'rgba(255,255,255,0.2)' },
              },
            },
          }} />
        </div>
      </div>
      <button 
        disabled={loading || !stripe} 
        className="w-full py-4 bg-emerald-500 text-black rounded-xl font-bold hover:bg-emerald-400 transition-all disabled:opacity-50"
      >
        {loading ? 'Processing...' : 'Confirm Allocation'}
      </button>
      {status === 'error' && (
        <div className="flex items-center gap-2 text-red-500 text-sm justify-center">
          <AlertTriangle size={16} />
          Payment failed. Please check your card details.
        </div>
      )}
    </form>
  );
}

function SidebarItem({ icon, label, active = false, onClick, children }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void, children?: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
      active 
        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
        : 'text-white/40 hover:text-white hover:bg-white/5'
    }`}>
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {children}
    </button>
  );
}

function StatCard({ title, value, change, positive, icon }: { title: string, value: string, change: string, positive: boolean, icon: React.ReactNode }) {
  return (
    <div className="bg-[#0F0F11] border border-white/5 rounded-3xl p-6 hover:border-white/10 transition-all group">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${positive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
          {change}
        </span>
      </div>
      <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-1">{title}</p>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function SimulationItem({ title, impact, risk, color }: { title: string, impact: string, risk: string, color: string }) {
  const colors: Record<string, string> = {
    orange: 'text-orange-400 bg-orange-400/10',
    red: 'text-red-400 bg-red-400/10',
    yellow: 'text-yellow-400 bg-yellow-400/10',
  };
  return (
    <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between hover:border-white/10 transition-all group cursor-pointer">
      <div>
        <p className="font-bold">{title}</p>
        <p className="text-xs text-white/40">{impact}</p>
      </div>
      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg ${colors[color]}`}>
        {risk} Risk
      </span>
    </div>
  );
}

function ChatInterface({ messages, input, setInput, onSend, isThinking, chatEndRef }: any) {
  return (
    <div className="bg-[#0F0F11] border border-white/5 rounded-3xl flex flex-col h-[500px]">
      <div className="p-6 border-b border-white/5 flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
          <MessageSquare size={16} className="text-black" />
        </div>
        <h3 className="font-bold">CFO Assistant</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg: any, i: number) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'user' 
                ? 'bg-emerald-500 text-black font-medium' 
                : 'bg-white/5 text-white/80 border border-white/5'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-white/5 text-white/40 p-4 rounded-2xl text-sm flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-1 h-1 bg-white/40 rounded-full animate-bounce" />
                <div className="w-1 h-1 bg-white/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-1 h-1 bg-white/40 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
              Analyzing data...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 border-t border-white/5">
        <div className="relative">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSend()}
            placeholder="Ask about runway, hiring, or taxes..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-4 pr-12 text-sm outline-none focus:border-emerald-500/50 transition-all"
          />
          <button 
            onClick={onSend}
            className="absolute right-2 top-2 w-10 h-10 bg-emerald-500 text-black rounded-xl flex items-center justify-center hover:bg-emerald-400 transition-all"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
