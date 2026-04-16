import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Upload, 
  Mic, 
  Square, 
  Play, 
  Pause, 
  Activity, 
  Settings2, 
  Download, 
  Music2, 
  Zap, 
  Waves, 
  RefreshCw,
  Info,
  ChevronRight,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
const ASSETS_BASE = API_BASE.replace('/api', '');

const SpectrogramCanvas = ({ data }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { values, freqs, times } = data;

    const width = canvas.width;
    const height = canvas.height;
    
    // Clear
    ctx.clearRect(0, 0, width, height);

    const cellWidth = width / times.length;
    const cellHeight = height / freqs.length;

    // Normalization helper
    const allValues = values.flat();
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min || 1;

    values.forEach((row, fIdx) => {
      row.forEach((val, tIdx) => {
        const normalized = (val - min) / range;
        // Invert Y axis for frequency
        const x = tIdx * cellWidth;
        const y = height - (fIdx + 1) * cellHeight;
        
        // Color mapping: Purple -> Blue -> Cyan -> Green -> Yellow -> Red
        const hue = 280 - (normalized * 280); 
        ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
        ctx.fillRect(x, y, cellWidth + 1, cellHeight + 1);
      });
    });
  }, [data]);

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-3xl overflow-hidden border border-white/5">
       <canvas ref={canvasRef} width={800} height={400} className="w-full h-full object-cover" />
       <div className="absolute top-2 left-2 flex flex-col gap-1">
         <div className="text-[8px] font-mono text-white/40 uppercase">High Freq</div>
         <div className="flex-1" />
         <div className="text-[8px] font-mono text-white/40 uppercase">Low Freq</div>
       </div>
    </div>
  );
};

const App = () => {
  // --- State ---
  const [activeSignal, setActiveSignal] = useState(null); // { filename, url, type }
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Operations Parameters
  const [params, setParams] = useState({
    shift: 0,
    scaling: 1.0,
    gain: 1.0,
    reversal: false,
    noise: 0,
    echo: false,
    lowCutoff: 0,
    highCutoff: 0
  });

  const [advancedMode, setAdvancedMode] = useState(false);

  // Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // --- Actions ---

  // Upload Logic
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('audio', file);

    try {
      const { data } = await axios.post(`${API_BASE}/upload`, formData);
      setActiveSignal({ filename: data.filename, url: data.url, type: 'upload' });
      triggerProcess(data.filename);
    } catch (err) {
      setError("Failed to upload file.");
    } finally {
      setLoading(false);
    }
  };

  // Recording Logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const file = new File([audioBlob], "recording.wav", { type: 'audio/wav' });
        
        const formData = new FormData();
        formData.append('audio', file);
        
        setLoading(true);
        try {
          const { data } = await axios.post(`${API_BASE}/upload`, formData);
          setActiveSignal({ 
            filename: data.filename, 
            url: data.url, 
            type: 'record',
            mimeType: audioBlob.type 
          });
          triggerProcess(data.filename);
        } catch (err) {
          setError("Failed to save recording. Your browser might use an unsupported format (WebM/OGG).");
        } finally {
          setLoading(false);
        }
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      setError("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  // Synthetic Signal Generation
  const generateSignal = async (type) => {
    setLoading(true);
    try {
      const { data } = await axios.post(`${API_BASE}/generate`, {
        type,
        frequency: 440,
        duration: 2
      });
      setActiveSignal({ filename: data.filename, url: data.url, type: 'generated' });
      triggerProcess(data.filename);
    } catch (err) {
      setError("Generation failed.");
    } finally {
      setLoading(false);
    }
  };

  // Processing Logic
  const triggerProcess = useCallback(async (filename, currentParams = params) => {
    if (!filename) return;
    setLoading(true);
    try {
      const { data } = await axios.post(`${API_BASE}/process`, {
        inputFilename: filename,
        operations: currentParams
      });
      setResult(data);
      setError(null);
    } catch (err) {
      setError("Processing error.");
    } finally {
      setLoading(false);
    }
  }, [params]);

  // Debounced effect for parameters
  useEffect(() => {
    if (!activeSignal) return;
    
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    
    debounceTimerRef.current = setTimeout(() => {
      triggerProcess(activeSignal.filename, params);
    }, 600);
    
    return () => clearTimeout(debounceTimerRef.current);
  }, [params, activeSignal, triggerProcess]);

  // Chart Data Helpers
  const getChartData = (data, label, color) => ({
    labels: (data || []).map((_, i) => i),
    datasets: [{
      label,
      data,
      borderColor: color,
      backgroundColor: color + '22',
      borderWidth: 1.5,
      pointRadius: 0,
      fill: true,
      tension: 0.2
    }]
  });

  const getFFTData = (freqs, mags) => ({
    labels: (freqs || []).map(f => Math.round(f)),
    datasets: [{
      label: 'Magnitude Spectrum (FFT)',
      data: mags,
      borderColor: '#f472b6',
      backgroundColor: '#f472b644',
      borderWidth: 2,
      pointRadius: 0,
      fill: true
    }]
  });

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false },
      y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b' } }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Navbar */}
      <nav className="border-b border-white/5 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 accent-gradient rounded-xl shadow-lg ring-1 ring-white/20">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gradient">SignalVisualizer Pro</h1>
          </div>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-full text-xs font-mono text-slate-400">
               <div className={`w-2 h-2 rounded-full ${activeSignal ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
               {activeSignal ? 'Signal Active' : 'System Idle'}
             </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Input & Controls */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* 1. Input Source */}
          <section className="glass-morphism rounded-3xl p-6">
            <div className="flex items-center gap-2 mb-6 text-primary">
              <Music2 className="w-5 h-5" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Input Source</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => fileInputRef.current.click()}
                className="flex flex-col items-center justify-center gap-3 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-2xl transition-all group"
              >
                <Upload className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors" />
                <span className="text-xs font-medium">Upload File</span>
              </button>
              <input type="file" ref={fileInputRef} onChange={handleUpload} accept="audio/*" className="hidden" />

              <button 
                onClick={recording ? stopRecording : startRecording}
                className={`flex flex-col items-center justify-center gap-3 p-4 border rounded-2xl transition-all ${
                  recording 
                    ? 'bg-red-500/10 border-red-500 text-red-500 animate-pulse' 
                    : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800'
                }`}
              >
                {recording ? <Square className="w-6 h-6" /> : <Mic className="w-6 h-6 text-slate-400" />}
                <span className="text-xs font-medium">{recording ? 'Stop' : 'Record'}</span>
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Generate Basics</p>
              <div className="flex gap-2">
                <button 
                  onClick={() => generateSignal('sine')}
                  className="flex-1 py-2 bg-slate-800/30 hover:bg-slate-800 border border-slate-700 rounded-lg text-[10px] font-bold uppercase tracking-tighter transition-all"
                >
                  Sine Wave
                </button>
                <button 
                  onClick={() => generateSignal('step')}
                  className="flex-1 py-2 bg-slate-800/30 hover:bg-slate-800 border border-slate-700 rounded-lg text-[10px] font-bold uppercase tracking-tighter transition-all"
                >
                  Unit Step
                </button>
              </div>
            </div>
          </section>

          {/* 2. Operations */}
          <section className={`glass-morphism rounded-3xl p-6 transition-all ${!activeSignal ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
            <div className="flex items-center gap-2 mb-6 text-secondary">
              <Settings2 className="w-5 h-5" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Signal Operations</h2>
            </div>

            <div className="space-y-6">
              {/* Time Shift */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-slate-400">Time Shift (s)</label>
                  <span className="text-xs font-mono text-primary">{params.shift}s</span>
                </div>
                <input 
                  type="range" min="-1" max="1" step="0.1" 
                  value={params.shift}
                  onChange={(e) => setParams(p => ({ ...p, shift: parseFloat(e.target.value) }))}
                  className="w-full h-1 bg-slate-800 rounded-full appearance-none accent-primary"
                />
              </div>

              {/* Time Scale */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-slate-400">Time Scaling (Speed)</label>
                  <span className="text-xs font-mono text-secondary">{params.scaling}x</span>
                </div>
                <input 
                  type="range" min="0.5" max="2.0" step="0.1" 
                  value={params.scaling}
                  onChange={(e) => setParams(p => ({ ...p, scaling: parseFloat(e.target.value) }))}
                  className="w-full h-1 bg-slate-800 rounded-full appearance-none accent-secondary"
                />
              </div>

              {/* Amplitude Gain */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-slate-400">Amplitude Gain</label>
                  <span className="text-xs font-mono text-accent">{params.gain}x</span>
                </div>
                <input 
                  type="range" min="0" max="3" step="0.1" 
                  value={params.gain}
                  onChange={(e) => setParams(p => ({ ...p, gain: parseFloat(e.target.value) }))}
                  className="w-full h-1 bg-slate-800 rounded-full appearance-none accent-accent"
                />
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
                <button 
                  onClick={() => setParams(p => ({ ...p, reversal: !p.reversal }))}
                  className={`py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all ${
                    params.reversal ? 'bg-primary/20 border-primary text-primary' : 'bg-slate-800/40 border-slate-700 text-slate-500'
                  }`}
                >
                  Time Folding
                </button>
                <button 
                  onClick={() => setParams(p => ({ ...p, echo: !p.echo }))}
                  className={`py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all ${
                    params.echo ? 'bg-secondary/20 border-secondary text-secondary' : 'bg-slate-800/40 border-slate-700 text-slate-500'
                  }`}
                >
                  Echo Effect
                </button>
              </div>
            </div>
          </section>

          {/* 3. Advanced Tools Toggle */}
          <div className="px-2">
            <button 
              onClick={() => setAdvancedMode(!advancedMode)}
              className="w-full py-4 glass-morphism rounded-2xl flex items-center justify-between px-6 group transition-all"
            >
              <div className="flex items-center gap-3">
                <Activity className={`w-5 h-5 ${advancedMode ? 'text-primary' : 'text-slate-500'}`} />
                <span className="text-xs font-bold uppercase tracking-widest">Advanced Audio Suite</span>
              </div>
              <ChevronRight className={`w-4 h-4 transition-transform ${advancedMode ? 'rotate-90 text-primary' : 'text-slate-500'}`} />
            </button>
          </div>

          <AnimatePresence>
            {advancedMode && (
              <motion.section 
                initial={{ opacity: 0, height: 0, y: -20 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -20 }}
                className="glass-morphism rounded-3xl p-6 overflow-hidden"
              >
                <div className="flex items-center gap-2 mb-6 text-emerald-400">
                  <Activity className="w-5 h-5" />
                  <h2 className="text-sm font-bold uppercase tracking-wider">Passive Filters</h2>
                </div>

                <div className="space-y-6">
                  {/* Low Cutoff */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-slate-400">Low-pass Cutoff</label>
                      <span className="text-xs font-mono text-emerald-400">{params.lowCutoff}Hz</span>
                    </div>
                    <input 
                      type="range" min="0" max="10000" step="100" 
                      value={params.lowCutoff}
                      onChange={(e) => setParams(p => ({ ...p, lowCutoff: parseInt(e.target.value) }))}
                      className="w-full h-1 bg-slate-800 rounded-full appearance-none accent-emerald-500"
                    />
                  </div>

                  {/* High Cutoff */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-slate-400">High-pass Cutoff</label>
                      <span className="text-xs font-mono text-sky-400">{params.highCutoff}Hz</span>
                    </div>
                    <input 
                      type="range" min="0" max="10000" step="100" 
                      value={params.highCutoff}
                      onChange={(e) => setParams(p => ({ ...p, highCutoff: parseInt(e.target.value) }))}
                      className="w-full h-1 bg-slate-800 rounded-full appearance-none accent-sky-500"
                    />
                  </div>
                  
                  <p className="text-[10px] text-slate-600 leading-relaxed italic border-t border-white/5 pt-4">
                    Butterworth 4th-order filters are used for active frequency rejection.
                  </p>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column: Visualization & Playback */}
        <div className="lg:col-span-8 space-y-6">
          <section className="glass-morphism rounded-[2.5rem] p-8 min-h-[600px] flex flex-col relative overflow-hidden">
            
            {/* Playback Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className={`p-4 rounded-3xl border transition-all ${activeSignal ? 'bg-slate-800/40 border-slate-700 shadow-lg' : 'bg-slate-900 border-slate-800 opacity-30'}`}>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-3">Original Signal</p>
                <audio controls src={activeSignal ? `${ASSETS_BASE}${activeSignal.url}` : null} className="w-full h-10 filter invert grayscale opacity-80" />
              </div>

              <div className={`p-4 rounded-3xl border transition-all ${result ? 'bg-sky-500/10 border-sky-500/30' : 'bg-slate-900 border-slate-800 opacity-30'}`}>
                <div className="flex justify-between items-center mb-3">
                   <p className="text-[10px] font-bold text-sky-400 uppercase tracking-[0.2em]">Processed Output</p>
                   {result && (
                     <a href={`${ASSETS_BASE}${result.outputUrl}`} download className="p-1 hover:text-white transition-colors">
                       <Download className="w-4 h-4" />
                     </a>
                   )}
                </div>
                <audio controls src={result ? `${ASSETS_BASE}${result.outputUrl}` : null} className="w-full h-10 filter invert grayscale" />
              </div>
            </div>

            {/* Main Visualizers */}
            <div className="flex-1 space-y-8 relative z-10">
              <div className="h-64 bg-slate-900/50 rounded-3xl p-6 border border-white/5 relative group">
                <div className="absolute top-4 right-4 text-[10px] font-mono text-slate-600 group-hover:text-slate-400 transition-colors">TIME DOMAIN</div>
                {result ? (
                  <Line data={getChartData(result.waveform, 'Processed Signal', '#38bdf8')} options={chartOptions} />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-700">
                    <Waves className="w-12 h-12 mb-2 opacity-10 animate-pulse" />
                    <p className="text-xs font-medium uppercase tracking-[0.3em]">Waiting for Signal</p>
                  </div>
                )}
              </div>

              <div className="h-64 bg-slate-900/50 rounded-3xl p-6 border border-white/5 relative group">
                <div className="absolute top-4 right-4 text-[10px] font-mono text-slate-600 group-hover:text-slate-400 transition-colors">SPECTROGRAM</div>
                {result && result.spectrogram ? (
                  <SpectrogramCanvas data={result.spectrogram} />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-700">
                    <RefreshCw className="w-12 h-12 mb-2 opacity-10" />
                    <p className="text-xs font-medium uppercase tracking-[0.3em]">Analysis Pending</p>
                  </div>
                )}
              </div>
            </div>

            {/* Status Overlays */}
            {error && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm">
                <div className="bg-red-500/90 backdrop-blur-md text-white text-xs font-bold p-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-red-400">
                  <div className="p-1 bg-white/20 rounded-full">!</div>
                  {error}
                </div>
              </div>
            )}

            {loading && (
              <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center rounded-[2.5rem]">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-bold text-primary animate-pulse tracking-widest uppercase">Processing</span>
                </div>
              </div>
            )}
          </section>

          {/* Educational Info */}
          <section className="p-6 bg-slate-900 border border-white/5 rounded-3xl flex items-start gap-4">
            <div className="p-2 bg-slate-800 rounded-lg">
              <Info className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-300 mb-2">Systems Note</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Time scaling x(at) adjusts the independent variable t, resulting in temporal compression or expansion. 
                Folding x(-t) reflects the signal across the vertical axis. Frequency analysis (FFT) reveals the spectral content X(f) of your processed signal.
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto p-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-2 grayscale opacity-50">
           < Zap className="w-4 h-4" />
           <span className="text-xs font-bold uppercase tracking-widest">Real-Time Signal Visualizer v1.0</span>
        </div>
        <p className="text-xs text-slate-600 italic">"Understanding Signal Dynamics through Visualization"</p>
      </footer>
    </div>
  );
};

export default App;
