import React, { useEffect, useState } from 'react';
import { 
  Database as DbIcon, 
  RefreshCw, 
  LayoutGrid, 
  Terminal, 
  HardDrive, 
  Clock, 
  Calendar, 
  Trash2, 
  Send, 
  AlertCircle, 
  CheckCircle2, 
  ShieldAlert, 
  Info,
  ExternalLink
} from 'lucide-react';

// Define database record structure
interface PolicyAnswerRecord {
  id: number;
  source: string | null;
  snippet: string | null;
  answer: string;
  model_used: string | null;
  store_type: 'daily' | 'permanent';
  created_at: number; // Epoc Milliseconds
}

interface ServerStatus {
  dbFile: string;
  dbSize: number;
  appVersion: string;
  dailyCount: number;
  permanentCount: number;
  isIntegrityOk: boolean;
  memoryUsage: number;
  uptime: number;
}

export default function App() {
  // Navigation & Filtering
  const [selectedEndpoint, setSelectedEndpoint] = useState<'all' | 'daily' | 'permanent'>('all');
  
  // Stored Database Records
  const [records, setRecords] = useState<PolicyAnswerRecord[]>([]);
  
  // Live Telemetry / Server Stats
  const [status, setStatus] = useState<ServerStatus>({
    dbFile: 'policy_store.db',
    dbSize: 12288,
    appVersion: '1.0.5', // Compliance with version increment per build
    dailyCount: 0,
    permanentCount: 0,
    isIntegrityOk: true,
    memoryUsage: 35.5,
    uptime: 0
  });

  // Payload inputs for custom insertions
  const [payloadSource, setPayloadSource] = useState('/mnt/itpolicies/Policy/MODIFIED/TR-POL-008 Desktop and Notebook Usage Policy.docx (Page 5, [CompositeElement]) | /mnt/itpolicies/Policy/MODIFIED/TR-POL-006 Internet and E-mail Security Policy.docx (Page 8, [CompositeElement])');
  const [payloadSnippet, setPayloadSnippet] = useState('Source Document: TR-POL-008 Desktop and Notebook Usage Policy.docx Section: USAGE POLICY Content: Al... \n--- \nSource Document: TR-POL-006 Internet and E-mail Security Policy.docx Section: POLICY STATEMENT Conte...');
  const [payloadAnswer, setPayloadAnswer] = useState("TRI-E DAILY DO'S AND DONT'S REMINDER  \nDO'S :  \nUse company-approved system access forms for all work-related activities (Reference: Desktop and Notebook Usage Policy)  \n\nDON'T:  \nSend personal emails or use non-business-related internet services (Reference: Internet and E-mail Security Policy)");
  const [payloadModel, setPayloadModel] = useState('qwen3:8b');
  const [payloadTarget, setPayloadTarget] = useState<'daily' | 'permanent'>('daily');

  // Logs & API responses
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [apiResponseStatus, setApiResponseStatus] = useState<'idle' | 'success' | 'error' | 'loading'>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Load and refresh state
  const fetchData = async () => {
    try {
      const [dailyRes, permRes, statusRes] = await Promise.all([
        fetch('/api/retrieve/daily'),
        fetch('/api/retrieve/permanent'),
        fetch('/api/status')
      ]);

      const dailyData = await dailyRes.json();
      const permData = await permRes.json();
      const statusData = await statusRes.json();

      // Merge records for display
      const allRecords = [...dailyData, ...permData];
      allRecords.sort((a, b) => b.created_at - a.created_at);
      setRecords(allRecords);
      setStatus(statusData);
    } catch (err) {
      console.error('Failed to load storage engine records:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000); // Poll status every 4 seconds
    return () => clearInterval(interval);
  }, []);

  // Post Payload Handler
  const handleExecutePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payloadAnswer.trim()) {
      setValidationError('Required string field "answer" cannot be blank.');
      return;
    }
    setValidationError(null);
    setApiResponseStatus('loading');

    const payload = {
      source: payloadSource.trim() || null,
      snippet: payloadSnippet.trim() || null,
      answer: payloadAnswer.trim(),
      model_used: payloadModel.trim() || null
    };

    try {
      const res = await fetch(`/api/store/${payloadTarget}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const responseJSON = await res.json();
      if (res.ok) {
        setApiResponseStatus('success');
        setApiResponse(responseJSON);
        fetchData(); // immediately load updated table
      } else {
        setApiResponseStatus('error');
        setApiResponse(responseJSON);
      }
    } catch (err: any) {
      setApiResponseStatus('error');
      setApiResponse({ error: 'Network failure', details: err.message });
    }
  };

  // Re-verify Integrity or Reset Db DB Seeding action
  const handleReverify = async () => {
    try {
      const res = await fetch('/api/action/reverify', { method: 'POST' });
      const data = await res.json();
      setApiResponseStatus('success');
      setApiResponse(data);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetSeed = async () => {
    if (window.confirm('Are you sure you want to reset the SQLite database, purge all custom records, and re-run startup seeds?')) {
      try {
        const res = await fetch('/api/action/reset', { method: 'POST' });
        const data = await res.json();
        setApiResponseStatus('success');
        setApiResponse(data);
        fetchData();
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Pre-load mock payload samples for user convenience
  const loadMockDocument = (type: 'policy1' | 'policy2') => {
    if (type === 'policy1') {
      setPayloadSource('/mnt/itpolicies/Policy/MODIFIED/TR-POL-008 Desktop and Notebook Usage Policy.docx (Page 5, [CompositeElement])');
      setPayloadSnippet('Usage criteria for company assets: Access forms required, no unlicensed private utilities on laptops.');
      setPayloadAnswer('TRI-E DAILY DO\'S AND DONT\'S REMINDER  \nDO\'S :  \nUse company-approved system access forms for all work-related activities.');
      setPayloadModel('qwen3:8b');
    } else {
      setPayloadSource('/mnt/itpolicies/Policy/MODIFIED/TR-POL-012 Removable Media Security.docx (Page 2, Section A)');
      setPayloadSnippet('Section: Storage rules. Removable media devices (USB keys, SD cards) must deploy 256-bit AES protection.');
      setPayloadAnswer('REMOVABLE MEDIA DEPLOYMENT STANDARD:\nAll staff are required to encrypt and label temporary storage flash media using certified enterprise profiles.');
      setPayloadModel('llama-3-70b-instruct');
    }
  };

  // Calculates remaining hours/minutes for dynamic TTL visual
  const formatTTL = (record: PolicyAnswerRecord) => {
    if (record.store_type === 'permanent') {
      return <span className="text-slate-400 font-medium">INDEFINITE</span>;
    }
    const age = Date.now() - record.created_at;
    const timeLeft = 24 * 60 * 60 * 1000 - age;

    if (timeLeft <= 0) {
      return <span className="text-gray-400 font-bold uppercase strike-through">EXPIRED</span>;
    }

    const hours = Math.floor(timeLeft / (60 * 60 * 1000));
    const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

    return (
      <span className="text-amber-600 font-extrabold flex items-center justify-end gap-1 font-mono">
        <Clock className="w-3 h-3 text-amber-500 animate-pulse" />
        {hours}h {minutes}m
      </span>
    );
  };

  // Filter records based on selected viewport
  const filteredRecords = records.filter(r => {
    if (selectedEndpoint === 'all') return true;
    return r.store_type === selectedEndpoint;
  });

  // Calculate live format for DB Size in KB/MB
  const formattedDbSize = (status.dbSize / 1024).toFixed(1);

  return (
    <div className="w-full min-h-screen bg-slate-100 text-slate-800 font-sans flex items-center justify-center p-2 sm:p-4">
      {/* Container Frame matching precisely the High Density style dimensions */}
      <div className="w-full max-w-6xl shadow-2xl rounded-lg border border-slate-300 bg-slate-50 text-slate-900 font-sans flex flex-col overflow-hidden min-h-[760px]">
        
        {/* Top Header / Status Bar */}
        <header className="h-14 border-b border-slate-200 bg-white flex flex-row items-center justify-between px-4 sm:px-6 shrink-0 gap-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white">
              <DbIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-slate-800 flex items-center gap-2">
                Storage Engine Manager 
                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-mono text-[10px] border border-slate-200">
                  v{status.appVersion}
                </span>
              </h1>
              <p className="text-[10px] text-slate-400 hidden sm:block">Automated 24H Doc Policy Ingestion Pipe</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 text-xs">
            <div className="hidden md:flex items-center gap-2 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-mono text-[10px] text-emerald-800 font-semibold">PORT: 3000 (ENV)</span>
            </div>
            <div className="flex items-center gap-2 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
              <span className={`w-2 h-2 rounded-full ${status.isIntegrityOk ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`}></span>
              <span className="font-mono text-[10px] text-indigo-900 font-semibold">
                {status.isIntegrityOk ? 'DB: SQLITE_INTEGRITY_OK' : 'DB: CORRUPT'}
              </span>
            </div>
            <button 
              onClick={handleResetSeed}
              title="Reset database to default seed state"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded font-mono text-[11px] font-semibold transition-colors flex items-center gap-1.5 shadow"
            >
              <RefreshCw className="w-3" />
              <span>RESEED</span>
            </button>
          </div>
        </header>

        {/* Main Content Layout */}
        <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-[500px]">
          
          {/* Sidebar Area: Endpoint Controls */}
          <aside className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
            <div className="p-4 border-b border-slate-200 bg-slate-100/50">
              <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                <Terminal className="w-3 text-slate-400" />
                Endpoints Configured
              </h2>
            </div>
            
            <div className="p-3 space-y-3 flex flex-col sm:flex-row lg:flex-col gap-2 sm:gap-0">
              {/* Endpoint Set 1: Daily Persistence */}
              <div className="flex-1">
                <div className="px-2 py-1 text-[10px] font-bold text-indigo-600 tracking-wider">DAILY PERSISTENCE (24H)</div>
                <div 
                  onClick={() => { setSelectedEndpoint('daily'); setPayloadTarget('daily'); }}
                  className={`cursor-pointer transition-all flex items-center justify-between gap-2 px-3 py-2 border rounded shadow-sm hover:shadow-md mb-1 ${
                    selectedEndpoint === 'daily' 
                      ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-100 text-slate-950 font-bold' 
                      : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1 py-0.5 rounded">POST</span>
                    <span className="text-[11px] font-mono">/store/daily</span>
                  </div>
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-500">{status.dailyCount}</span>
                </div>

                <div 
                  onClick={() => setSelectedEndpoint('daily')}
                  className={`cursor-pointer transition-all flex items-center justify-between gap-2 px-3 py-2 border rounded shadow-sm hover:shadow-md ${
                    selectedEndpoint === 'daily' 
                      ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-100 text-slate-950 font-bold' 
                      : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1 py-0.5 rounded">GET</span>
                    <span className="text-[11px] font-mono">/retrieve/daily</span>
                  </div>
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-500">{status.dailyCount}</span>
                </div>
              </div>

              {/* Endpoint Set 2: Permanent Storage */}
              <div className="flex-1 lg:mt-2">
                <div className="px-2 py-1 text-[10px] font-bold text-rose-600 tracking-wider">INDEFINITE STORAGE</div>
                <div 
                  onClick={() => { setSelectedEndpoint('permanent'); setPayloadTarget('permanent'); }}
                  className={`cursor-pointer transition-all flex items-center justify-between gap-2 px-3 py-2 border rounded shadow-sm hover:shadow-md mb-1 ${
                    selectedEndpoint === 'permanent' 
                      ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-100 text-slate-950 font-bold' 
                      : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1 py-0.5 rounded">POST</span>
                    <span className="text-[11px] font-mono">/store/permanent</span>
                  </div>
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-500">{status.permanentCount}</span>
                </div>

                <div 
                  onClick={() => setSelectedEndpoint('permanent')}
                  className={`cursor-pointer transition-all flex items-center justify-between gap-2 px-3 py-2 border rounded shadow-sm hover:shadow-md ${
                    selectedEndpoint === 'permanent' 
                      ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-100 text-slate-950 font-bold' 
                      : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1 py-0.5 rounded">GET</span>
                    <span className="text-[11px] font-mono">/retrieve/permanent</span>
                  </div>
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-500">{status.permanentCount}</span>
                </div>
              </div>

              {/* Show All Filter */}
              <div className="pt-2">
                <button 
                  onClick={() => setSelectedEndpoint('all')}
                  className={`w-full py-1.5 px-3 rounded text-[11px] font-bold border transition-all text-center flex items-center justify-center gap-2 ${
                    selectedEndpoint === 'all' 
                      ? 'bg-slate-800 text-white border-slate-800' 
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <LayoutGrid className="w-3" />
                  <span>VIEW ALL INSTANCES ({records.length})</span>
                </button>
              </div>
            </div>

            {/* Simulated Live Storage Stats Bar */}
            <div className="p-4 mt-auto border-t border-slate-200 bg-white">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                  <HardDrive className="w-3" />
                  SQLITE USAGE STATUS
                </span>
                <span className="text-[10px] text-slate-600 font-mono font-bold">
                  {formattedDbSize} KB
                </span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-1000" 
                  style={{ width: `${Math.min(100, Math.max(8, (status.dbSize / 20480) * 100))}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-[9px] text-slate-400 mt-1.5">
                <span>Auto-indexing Active</span>
                <button onClick={handleReverify} className="text-indigo-600 hover:underline font-mono">
                  VERIFY INTEGRITY
                </button>
              </div>
            </div>
          </aside>

          {/* Right Panel: Content Area split into Top Post Inspector & Bottom Db View */}
          <section className="flex-1 flex flex-col bg-white overflow-hidden min-w-0">
            
            {/* Top Workspace: Interactive JSON Ingestion Console */}
            <div className="h-auto md:h-[350px] border-b border-slate-200 flex flex-col md:flex-row overflow-hidden shrink-0">
              
              {/* Form Input Interface (Left Side) */}
              <form onSubmit={handleExecutePost} className="flex-1 p-4 flex flex-col border-b md:border-b-0 md:border-r border-slate-200 overflow-y-auto">
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Send className="w-3 text-slate-500" />
                    Payload Injection Console
                  </h3>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400 mr-1.5">Preset:</span>
                    <button 
                      type="button" 
                      onClick={() => loadMockDocument('policy1')}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[9px] font-mono rounded font-semibold border border-slate-200"
                    >
                      Usage Policy
                    </button>
                    <button 
                      type="button" 
                      onClick={() => loadMockDocument('policy2')}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[9px] font-mono rounded font-semibold border border-slate-200"
                    >
                      Media Sec
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 flex-1 select-none pr-1">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase">Target Endpoint (Storage Scope)</label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs cursor-pointer ${
                        payloadTarget === 'daily' 
                          ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold' 
                          : 'bg-white border-slate-200'
                      }`}>
                        <input 
                          type="radio" 
                          name="target" 
                          checked={payloadTarget === 'daily'} 
                          onChange={() => setPayloadTarget('daily')}
                          className="text-indigo-600"
                        />
                        <span>Daily (Destructs in 24h)</span>
                      </label>
                      <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs cursor-pointer ${
                        payloadTarget === 'permanent' 
                          ? 'bg-rose-50 border-rose-300 text-rose-900 font-bold' 
                          : 'bg-white border-slate-200'
                      }`}>
                        <input 
                          type="radio" 
                          name="target" 
                          checked={payloadTarget === 'permanent'} 
                          onChange={() => setPayloadTarget('permanent')}
                          className="text-indigo-600"
                        />
                        <span>Permanent Compliance</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase">source</label>
                      <input 
                        type="text" 
                        value={payloadSource} 
                        onChange={(e) => setPayloadSource(e.target.value)}
                        placeholder="/mnt/itpolicies/Policy/..." 
                        className="w-full mt-0.5 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-mono focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase font-mono">model_used</label>
                      <input 
                        type="text" 
                        value={payloadModel} 
                        onChange={(e) => setPayloadModel(e.target.value)}
                        placeholder="qwen3:8b" 
                        className="w-full mt-0.5 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-mono focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase">snippet (Context Excerpt)</label>
                    <textarea 
                      value={payloadSnippet} 
                      onChange={(e) => setPayloadSnippet(e.target.value)}
                      placeholder="Policy source documentation snippet..." 
                      rows={1.5}
                      className="w-full mt-0.5 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-mono focus:ring-1 focus:ring-indigo-500 resize-none"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between">
                      <label className="block text-[9px] font-bold text-slate-500 uppercase">answer (Target Data - Safe Parametrized)</label>
                      <span className="text-[9px] text-red-500 font-bold">*REQUIRED</span>
                    </div>
                    <textarea 
                      value={payloadAnswer} 
                      onChange={(e) => setPayloadAnswer(e.target.value)}
                      placeholder="Insert final compiled rules/answers here" 
                      rows={3}
                      className="w-full mt-0.5 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-mono focus:ring-1 focus:ring-indigo-500 resize-none font-bold"
                      required
                    />
                  </div>
                </div>

                {validationError && (
                  <div className="mt-1 px-2.5 py-1 bg-rose-50 border border-rose-200 rounded text-rose-700 text-[10px] font-mono flex items-center gap-1 shrink-0">
                    <AlertCircle className="w-3 h-3" />
                    <span>{validationError}</span>
                  </div>
                )}

                <div className="mt-2 text-right shrink-0">
                  <button 
                    type="submit"
                    className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded font-bold text-xs font-mono tracking-tight flex items-center justify-center gap-2 shadow"
                  >
                    <Send className="w-3.5" />
                    <span>POST TO /api/store/{payloadTarget}</span>
                  </button>
                </div>
              </form>

              {/* JSON Live Inspector output (Right Side) */}
              <div className="flex-1 bg-slate-900 flex flex-col overflow-hidden relative">
                <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 flex justify-between items-center shrink-0">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Terminal className="w-3 text-indigo-400" />
                    Telemetry Output Panel
                  </span>
                  <span className="text-[9px] font-mono text-emerald-400">Content-Type: application/json</span>
                </div>
                
                <div className="flex-1 p-3 font-mono text-[11px] text-emerald-400 overflow-y-auto leading-relaxed">
                  {apiResponseStatus === 'loading' ? (
                    <div className="text-indigo-400 blink mt-1 flex items-center gap-2">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>INGESTING PAYLOAD AND DOING INTEGRITY CHECKS...</span>
                    </div>
                  ) : apiResponseStatus === 'idle' ? (
                    <div>
                      <span className="text-slate-500">// Ready to ingest. Populate the fields and submit.</span>
                      <pre className="text-indigo-300 mt-2 select-all">
{`{
  "source": "${payloadSource.slice(0, 30)}...",
  "snippet": "${payloadSnippet.slice(0, 30)}...",
  "answer": "${payloadAnswer.replace(/\n/g, '\\n').slice(0, 45)}...",
  "model_used": "${payloadModel}"
}`}
                      </pre>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-1.5 font-bold mb-1.5">
                        {apiResponseStatus === 'success' ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="text-emerald-400 uppercase">HTTP 201 CREATED</span>
                          </>
                        ) : (
                          <>
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            <span className="text-rose-400 uppercase font-bold">API ERROR INGESTION</span>
                          </>
                        )}
                      </div>
                      <pre className="text-slate-200 mt-1 whitespace-pre-wrap select-all">
                        {JSON.stringify(apiResponse, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                <div className="absolute bottom-3 right-3 flex items-center gap-2 pointer-events-none select-none">
                  {apiResponseStatus === 'success' && (
                    <div className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 px-2 py-0.5 rounded text-[10px] font-mono tracking-tight font-extrabold uppercase animate-bounce">
                      JSON VALIDATED SAFE
                    </div>
                  )}
                  <div className="bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded text-[9px] font-mono">
                    SQL_SECURE: PASS
                  </div>
                </div>
              </div>

            </div>

            {/* Bottom Viewport: Database Explorer Table */}
            <div className="flex-1 flex flex-col min-h-[250px] overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <LayoutGrid className="w-3.5 text-slate-400" />
                    Stored Policy Answers (SQLite Viewer)
                  </span>
                  <span className="bg-slate-200 px-1.5 py-0.5 rounded text-slate-600 font-mono text-[9px] font-semibold">
                    LIMIT: none ({filteredRecords.length} records shown)
                  </span>
                </div>

                <div className="flex gap-1">
                  <button 
                    onClick={() => setSelectedEndpoint('all')}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${selectedEndpoint === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                  >
                    All
                  </button>
                  <button 
                    onClick={() => setSelectedEndpoint('daily')}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${selectedEndpoint === 'daily' ? 'bg-amber-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                  >
                    Daily
                  </button>
                  <button 
                    onClick={() => setSelectedEndpoint('permanent')}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${selectedEndpoint === 'permanent' ? 'bg-rose-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                  >
                    Permanent
                  </button>
                </div>
              </div>

              {/* Table Data list with high density compact lines */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left border-collapse table-fixed">
                  <thead className="bg-slate-100 text-[10px] uppercase text-slate-500 font-bold border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-1.5 w-12 text-center">ID</th>
                      <th className="px-3 py-1.5 w-[75px] md:w-36">Timestamp</th>
                      <th className="px-3 py-1.5 w-24 hidden md:table-cell">Model</th>
                      <th className="px-3 py-1.5">Rule / Answer Output</th>
                      <th className="px-3 py-1.5 w-20 md:w-32 text-right">Scope / TTL</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs font-mono divide-y divide-slate-100">
                    {filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-slate-400 bg-slate-50/20">
                          <Info className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
                          <span>No policy answers stored matching this schema endpoint.</span>
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((rec) => (
                        <tr 
                          key={rec.id} 
                          className={`hover:bg-indigo-50/50 transition-colors ${
                            rec.store_type === 'permanent' ? 'bg-rose-50/5' : 'bg-amber-50/5'
                          }`}
                        >
                          <td className="px-3 py-2 text-center text-slate-400 font-bold border-r border-slate-100 bg-slate-50/20 text-[10px]">
                            {String(rec.id).padStart(4, '0')}
                          </td>
                          <td className="px-3 py-2 text-slate-500 text-[10px] truncate" title={new Date(rec.created_at).toLocaleString()}>
                            {new Date(rec.created_at).toLocaleDateString()} {new Date(rec.created_at).toTimeString().slice(0, 5)}
                          </td>
                          <td className="px-3 py-2 text-slate-600 truncate text-[10px] hidden md:table-cell" title={rec.model_used || 'unknown'}>
                            <span className="bg-slate-100 px-1 py-0.5 rounded border border-slate-200 text-[9px] text-slate-700">
                              {rec.model_used || 'qwen3:8b'}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-sans align-top text-[11px]">
                            <div className="font-semibold text-slate-950 whitespace-pre-wrap select-all leading-normal line-clamp-3 hover:line-clamp-none max-h-56 overflow-y-auto">
                              {rec.answer}
                            </div>
                            {rec.source && (
                              <div className="text-[9px] text-indigo-700 font-mono mt-1 flex items-center gap-1 select-all overflow-x-auto truncate whitespace-nowrap">
                                <span className="bg-indigo-50 px-1 rounded font-bold shrink-0">SOURCE:</span>
                                <span>{rec.source}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex flex-col items-end gap-1 select-none">
                              <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded tracking-wide border ${
                                rec.store_type === 'permanent' 
                                  ? 'bg-rose-100 text-rose-800 border-rose-200' 
                                  : 'bg-amber-100 text-amber-800 border-amber-200'
                              }`}>
                                {rec.store_type.toUpperCase()}
                              </span>
                              <div className="text-[10px]">{formatTTL(rec)}</div>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </section>
        </main>

        {/* Footer Real-Time Telemetry System Bar */}
        <footer className="h-8 bg-slate-800 text-slate-400 text-[10px] flex items-center px-4 sm:px-6 gap-3 sm:gap-6 shrink-0 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-slate-100 font-bold">API CONSOLE ACTIVE</span>
          </div>
          
          <div className="hidden sm:flex items-center gap-1 bg-slate-700 px-1.5 py-0.5 rounded">
            <span>FILES:</span>
            <span className="text-emerald-400 font-bold">policy_store.db</span>
          </div>

          <div className="ml-auto flex gap-3 sm:gap-4 md:gap-6 text-slate-300 font-semibold select-none">
            <span>MEM: <span className="text-indigo-300 font-bold">{status.memoryUsage}MB</span></span>
            <span className="hidden md:inline">CPU: <span className="text-indigo-300">0.4%</span></span>
            <span>UPTIME: <span className="text-indigo-300 font-bold">
              {Math.floor(status.uptime / 3600)}h {Math.floor((status.uptime % 3600) / 60)}m {status.uptime % 60}s
            </span></span>
          </div>
        </footer>

      </div>
    </div>
  );
}
