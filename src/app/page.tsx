"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  UploadCloud, 
  Copy, 
  Check, 
  Clock, 
  AlertCircle, 
  Terminal, 
  ExternalLink,
  Shield,
  RefreshCw,
  Cpu
} from "lucide-react";

export default function Home() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "initiating" | "uploading" | "success" | "error">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  
  // Upload results
  const [shortId, setShortId] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Countdown timer (in seconds)
  const [timeLeft, setTimeLeft] = useState<number>(3600);

  // Helper to add system terminal logs
  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // Initialize logs on idle
  useEffect(() => {
    if (status === "idle") {
      setLogs([
        `[${new Date().toLocaleTimeString()}] Pipeline initialized. Ready for ingestion.`,
        `[${new Date().toLocaleTimeString()}] Max payload: 10MB | TTL: 60 minutes.`,
        `[${new Date().toLocaleTimeString()}] Global CORS enabled (*).`
      ]);
    }
  }, [status]);

  // Handle countdown logic
  useEffect(() => {
    if (!expiresAt || status !== "success") return;

    const targetTime = new Date(expiresAt).getTime();
    
    const updateTimer = () => {
      const diff = targetTime - Date.now();
      if (diff <= 0) {
        setTimeLeft(0);
        setStatus("idle");
        setFile(null);
        setImagePreview(null);
        setExpiresAt(null);
        addLog("CRITICAL: TTL expired. Image data self-destructed from memory and storage.");
      } else {
        setTimeLeft(Math.ceil(diff / 1000));
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, status]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (selectedFile: File) => {
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    
    if (!selectedFile.type.startsWith("image/")) {
      setErrorMsg("Ingestion rejected: Only raw image files (JPEG, PNG, WEBP, etc.) are allowed.");
      setStatus("error");
      addLog(`ERR: File "${selectedFile.name}" rejected. Type "${selectedFile.type}" is not supported.`);
      return;
    }

    if (selectedFile.size > MAX_SIZE) {
      setErrorMsg("Ingestion rejected: File exceeds the maximum allowable payload size of 10MB.");
      setStatus("error");
      addLog(`ERR: File "${selectedFile.name}" rejected. Size (${(selectedFile.size / 1024 / 1024).toFixed(2)}MB) exceeds 10MB limit.`);
      return;
    }

    // Set preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(selectedFile);

    setFile(selectedFile);
    setErrorMsg("");
    uploadImage(selectedFile);
  };

  const uploadImage = async (imgFile: File) => {
    setStatus("initiating");
    setLogs([]);
    setUploadProgress(0);
    
    addLog(`INIT: Preparing payload stream for "${imgFile.name}" (${(imgFile.size / 1024).toFixed(1)} KB)`);
    addLog(`POST: Dispatching pre-signed URL request to /api/upload/initiate...`);

    try {
      // 1. Get pre-signed URL from API
      const initResponse = await fetch("/api/upload/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: imgFile.name,
          fileType: imgFile.type,
          fileSize: imgFile.size,
        }),
      });

      if (!initResponse.ok) {
        const errorData = await initResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${initResponse.status}`);
      }

      const { uploadUrl, shortId: sId, downloadUrl: dUrl, expiresAt: expAt } = await initResponse.json();
      
      addLog(`SUCCESS: Pre-signed URL generated by cloud provider.`);
      addLog(`METADATA: Assigned index shortId -> "${sId}"`);
      addLog(`PIPELINE: Commencing direct PUT binary stream to S3 bucket...`);
      
      setStatus("uploading");

      // 2. PUT file directly to S3 with upload progress tracking
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl, true);
      xhr.setRequestHeader("Content-Type", imgFile.type);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 201) {
          addLog(`SUCCESS: S3 cloud ingestion completed (HTTP ${xhr.status}).`);
          addLog(`PIPELINE: Active streaming link spawned -> ${dUrl}`);
          addLog(`TTL: Self-destruction sequence initialized. T-minus 60 minutes.`);
          
          setShortId(sId);
          setDownloadUrl(dUrl);
          setExpiresAt(expAt);
          setStatus("success");
        } else {
          addLog(`ERR: S3 upload failed with HTTP status ${xhr.status}`);
          setStatus("error");
          setErrorMsg(`Cloud storage upload failed (HTTP status ${xhr.status}).`);
        }
      };

      xhr.onerror = () => {
        addLog(`ERR: S3 network transmission error.`);
        setStatus("error");
        setErrorMsg("Network transmission failure during S3 ingestion.");
      };

      xhr.send(imgFile);

    } catch (err: any) {
      addLog(`ERR: Ingestion aborted. Reason: ${err.message}`);
      setStatus("error");
      setErrorMsg(err.message || "Pipeline initiation failed.");
    }
  };

  const copyToClipboard = () => {
    if (!downloadUrl) return;
    navigator.clipboard.writeText(downloadUrl);
    setCopied(true);
    addLog(`SYS: Shared URL copied to system clipboard.`);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (h > 0) {
      return `${h}h ${m}m ${s}s`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const resetPipeline = () => {
    setFile(null);
    setImagePreview(null);
    setStatus("idle");
    setErrorMsg("");
    setUploadProgress(0);
    setShortId("");
    setDownloadUrl("");
    setExpiresAt(null);
  };

  // SVG ring progress calculations
  const totalDuration = 3600; // 1 hour in seconds
  const strokeRadius = 45;
  const strokeCircumference = 2 * Math.PI * strokeRadius;
  const strokeDashoffset = strokeCircumference - (timeLeft / totalDuration) * strokeCircumference;

  return (
    <div className="flex-1 min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* Background glowing gradient highlights */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Header Bar */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Cpu className="w-4.5 h-4.5 text-slate-900 stroke-[2.5]" />
            </div>
            <div>
              <span className="font-mono font-bold tracking-tight text-white">RAWINGEST</span>
              <span className="hidden sm:inline-block ml-2 text-xs font-mono px-1.5 py-0.5 rounded bg-slate-900 text-cyan-400 border border-cyan-500/20">v1.0.0-beta</span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <a 
              href="https://github.com" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-slate-400 hover:text-white text-xs font-mono transition-colors flex items-center space-x-1"
            >
              <span>DOCS</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="System operational" />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400">
            AI-First Raw Image Ingestion
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Standard hostings block AI agents with CAPTCHAs, ads, and HTML. We serve 
            <span className="text-cyan-400 font-mono"> raw, unencumbered binary streams </span> 
            with global CORS headers that automatically self-destruct after 60 minutes.
          </p>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: UPLOADER / SUCCESS STATE (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-900 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/40">
              
              {/* IDLE / ERROR / INGESTING STATE */}
              {(status === "idle" || status === "error" || status === "initiating" || status === "uploading") && (
                <div>
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all duration-300 ${
                      dragActive 
                        ? "border-cyan-500 bg-cyan-500/5 shadow-[0_0_20px_rgba(6,182,212,0.15)]Scale-102" 
                        : "border-slate-800 hover:border-slate-700 bg-slate-950/50"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      id="image-file-input"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                      disabled={status === "initiating" || status === "uploading"}
                    />

                    {status === "idle" || status === "error" ? (
                      <>
                        <div className="w-14 h-14 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-slate-400 group-hover:text-white transition-colors">
                          <UploadCloud className="w-7 h-7" />
                        </div>
                        <p className="text-sm font-semibold text-white mb-1">
                          Drag & drop raw image here, or{" "}
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-cyan-400 hover:text-cyan-300 underline font-medium transition-colors"
                          >
                            browse files
                          </button>
                        </p>
                        <p className="text-xs text-slate-400">
                          Supports JPEG, PNG, WEBP, GIF (Max size: 10MB)
                        </p>
                      </>
                    ) : (
                      <div className="w-full py-4">
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest animate-pulse flex items-center">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 mr-2 animate-ping" />
                            {status === "initiating" ? "Allocating S3 Stream..." : "Ingesting Binary Payload..."}
                          </span>
                          <span className="text-xs font-mono text-slate-400">{uploadProgress}%</span>
                        </div>
                        
                        <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-900">
                          <div 
                            className="bg-gradient-to-r from-cyan-500 to-indigo-600 h-1.5 rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(6,182,212,0.5)]" 
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        
                        <p className="text-xs text-slate-400 font-mono mt-4">
                          Streaming raw bytes directly to cloud node...
                        </p>
                      </div>
                    )}
                  </div>

                  {errorMsg && (
                    <div className="mt-4 p-3 rounded-lg bg-red-950/30 border border-red-900/50 flex items-start space-x-2 text-xs text-red-300">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}
                </div>
              )}

              {/* SUCCESS STATE */}
              {status === "success" && (
                <div className="space-y-6">
                  
                  {/* Top Success Banner */}
                  <div className="flex items-center space-x-3 pb-4 border-b border-slate-900">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold font-mono tracking-widest text-emerald-400 uppercase">
                        Ingestion Stream Active
                      </h3>
                      <p className="text-xs text-slate-400">
                        CORS headers attached. Public stream resolved.
                      </p>
                    </div>
                  </div>

                  {/* Split Preview and Countdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    
                    {/* Countdown Circular Ring */}
                    <div className="flex flex-col items-center justify-center p-4 bg-slate-950/60 rounded-xl border border-slate-900/50">
                      <div className="relative w-32 h-32 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                          {/* Inner track */}
                          <circle
                            cx="64"
                            cy="64"
                            r={strokeRadius}
                            className="stroke-slate-900"
                            strokeWidth="6"
                            fill="transparent"
                          />
                          {/* Active track with glow */}
                          <circle
                            cx="64"
                            cy="64"
                            r={strokeRadius}
                            className="stroke-cyan-500 transition-all duration-1000"
                            strokeWidth="6"
                            strokeDasharray={strokeCircumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            fill="transparent"
                          />
                        </svg>
                        
                        {/* Time in center */}
                        <div className="absolute flex flex-col items-center">
                          <Clock className="w-4 h-4 text-cyan-400/80 mb-0.5" />
                          <span className="font-mono text-lg font-bold text-white leading-none">
                            {formatTime(timeLeft)}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">
                            Until TTL
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-slate-400 mt-3 flex items-center">
                        <Shield className="w-3.5 h-3.5 text-cyan-500/80 mr-1.5" />
                        Dual-layer self-destruct armed
                      </span>
                    </div>

                    {/* Image Thumbnail */}
                    <div className="relative group overflow-hidden rounded-xl border border-slate-900 h-32 bg-slate-950 flex items-center justify-center">
                      {imagePreview ? (
                        <img 
                          src={imagePreview} 
                          alt="Ingested upload preview" 
                          className="object-cover w-full h-full opacity-60 group-hover:opacity-85 group-hover:scale-105 transition-all duration-300"
                        />
                      ) : (
                        <span className="text-xs font-mono text-slate-500">Preview Unavailable</span>
                      )}
                      <div className="absolute top-2 left-2 bg-slate-950/80 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
                        {file ? `${(file.size / 1024).toFixed(0)} KB` : "Image"}
                      </div>
                    </div>
                  </div>

                  {/* Shared Link Output */}
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-slate-400 block uppercase tracking-wider">
                      AI agent RAW ingestion link
                    </label>
                    <div className="flex space-x-2">
                      <div className="relative flex-1 bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex items-center px-3">
                        <span className="text-xs text-cyan-400 font-mono select-all truncate block w-full">
                          {downloadUrl}
                        </span>
                      </div>
                      <button
                        onClick={copyToClipboard}
                        className={`px-4 py-2.5 rounded-lg font-medium text-xs font-mono flex items-center space-x-1.5 transition-all duration-200 cursor-pointer ${
                          copied
                            ? "bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                            : "bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
                        }`}
                      >
                        {copied ? (
                          <>
                            <Check className="w-4 h-4 stroke-[2.5]" />
                            <span>COPIED</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>COPY URL</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Curl Command Helper */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 font-mono text-xs text-slate-400 space-y-2">
                    <div className="flex justify-between items-center text-[10px] text-slate-500 border-b border-slate-900 pb-1.5 mb-2">
                      <span>CURL INGESTION COMMAND</span>
                      <span className="text-cyan-500/80">GLOBAL CORS ACTIVE</span>
                    </div>
                    <code className="text-slate-300 block select-all break-all leading-relaxed bg-slate-900/50 p-2 rounded border border-slate-800">
                      curl -H "Origin: https://your-agent.ai" {downloadUrl}
                    </code>
                    <p className="text-[10px] text-slate-500 italic mt-1 leading-normal">
                      Note: Serving pure binary image data block. No HTML wrapping or Cloudflare blocks.
                    </p>
                  </div>

                  {/* Reset Button */}
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={resetPipeline}
                      className="px-4 py-2 text-xs font-mono text-slate-400 hover:text-white transition-colors flex items-center space-x-1.5 cursor-pointer bg-slate-950 hover:bg-slate-900 border border-slate-900 hover:border-slate-800 rounded-lg"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Ingest Another Image</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Architecture guidelines */}
            <div className="bg-slate-900/20 border border-slate-900/80 rounded-2xl p-6 flex items-start space-x-4">
              <Shield className="w-5 h-5 text-indigo-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-xs font-bold font-mono text-indigo-300 uppercase tracking-widest">
                  Zero-Bandwidth / Zero-Wrapper Architecture
                </h4>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  This system issues transient S3 pre-signed upload credentials to stream image bytes directly from your browser to storage. The backend handles only light metadata, maintaining zero server-side egress cost and preventing any bot-blocking page wrappers.
                </p>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: TERMINAL CONSOLE LOGS (5 cols) */}
          <div className="lg:col-span-5">
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-900 rounded-2xl overflow-hidden shadow-2xl">
              
              {/* Terminal Title Bar */}
              <div className="bg-slate-950 px-4 py-3 border-b border-slate-900 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-mono font-semibold tracking-wider text-slate-300">
                    CONSOLE LOGS
                  </span>
                </div>
                <div className="flex space-x-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-800" />
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-800" />
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-800" />
                </div>
              </div>

              {/* Terminal Logs Body */}
              <div className="p-4 bg-slate-950/80 font-mono text-xs leading-relaxed text-cyan-500/95 h-[340px] overflow-y-auto space-y-2 select-text selection:bg-cyan-500/20 scrollbar-thin">
                {logs.map((log, index) => (
                  <div 
                    key={index}
                    className={`border-l-2 pl-2 ${
                      log.includes("ERR:") 
                        ? "border-red-500/70 text-red-400" 
                        : log.includes("SUCCESS:") 
                          ? "border-emerald-500/70 text-emerald-400" 
                          : log.includes("METADATA:") || log.includes("TTL:")
                            ? "border-indigo-500/70 text-indigo-400"
                            : "border-slate-800 text-slate-400"
                    }`}
                  >
                    {log}
                  </div>
                ))}
                
                {/* Simulated cursor blinking */}
                {status !== "success" && (
                  <div className="flex items-center text-slate-500 pl-2">
                    <span>$ awaiting payload</span>
                    <span className="ml-1 w-1.5 h-4 bg-slate-500 animate-pulse" />
                  </div>
                )}
              </div>

              {/* Terminal footer details */}
              <div className="bg-slate-950/60 px-4 py-2.5 border-t border-slate-900 flex justify-between items-center text-[10px] font-mono text-slate-500">
                <span>BUFFER STATUS: NOMINAL</span>
                <span>ENGINE: NODE/NEXTJS</span>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t border-slate-900 py-8 bg-slate-950/40 text-center text-xs font-mono text-slate-600">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 RAWINGEST PIPELINE. AUTOMATED SELF-DESTRUCTION MECHANISMS ARMED.</p>
          <div className="flex space-x-4">
            <span className="hover:text-slate-400 transition-colors">SECURE ENDPOINT</span>
            <span>•</span>
            <span className="hover:text-slate-400 transition-colors">S3 DIRECT-TO-CLOUD</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
