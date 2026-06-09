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
  Cpu,
  Globe,
  Sparkles,
  Link2,
  Flame,
  Zap,
  Activity,
  Server,
  Layers,
  Fingerprint,
  Image as ImageIcon
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
  const [copiedImage, setCopiedImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Countdown timer (in seconds)
  const [timeLeft, setTimeLeft] = useState<number>(3600);

  // Simulated metrics
  const [simulatedMetrics, setSimulatedMetrics] = useState({
    bandwidth: "128.4 GB",
    activeUploads: 42,
    cpuLoad: "12%",
    latency: "34ms"
  });

  // Helper to add system terminal logs
  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // Initialize logs on idle
  useEffect(() => {
    if (status === "idle") {
      setLogs([
        `[${new Date().toLocaleTimeString()}] Pipeline initialized. Listening for raw binary stream.`,
        `[${new Date().toLocaleTimeString()}] Max payload configured: 10MB | TTL lifespan: 60 minutes.`,
        `[${new Date().toLocaleTimeString()}] Access policy: Global CORS enabled (*) for direct agent integrations.`,
        `[${new Date().toLocaleTimeString()}] Storage state: Connected | Supabase API operational.`
      ]);
    }
  }, [status]);

  // Update mock metrics periodically for high-tech dashboard feel
  useEffect(() => {
    const interval = setInterval(() => {
      setSimulatedMetrics({
        bandwidth: (128.4 + Math.random() * 2).toFixed(1) + " GB",
        activeUploads: Math.floor(35 + Math.random() * 15),
        cpuLoad: Math.floor(8 + Math.random() * 10) + "%",
        latency: Math.floor(28 + Math.random() * 12) + "ms"
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

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
        addLog("CRITICAL: TTL window expired. S3 binary purged & DB entry wiped.");
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
      addLog(`ERR: File "${selectedFile.name}" rejected. Type "${selectedFile.type}" is unsupported.`);
      return;
    }

    if (selectedFile.size > MAX_SIZE) {
      setErrorMsg("Ingestion rejected: File size exceeds the maximum allowable payload of 10MB.");
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

      addLog(`SUCCESS: Pre-signed URL generated securely by cloud provider.`);
      addLog(`METADATA: Assigned index shortId -> "${sId}"`);
      addLog(`PIPELINE: Commencing direct PUT binary stream to Supabase S3 bucket...`);

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
          addLog(`SUCCESS: Cloud ingestion completed (HTTP ${xhr.status}).`);
          addLog(`PIPELINE: Public streaming endpoint created -> ${dUrl}`);
          addLog(`SECURITY: Self-destruction armed. Purge trigger at: ${new Date(expAt).toLocaleTimeString()}`);

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
        addLog(`ERR: Supabase S3 network transmission error.`);
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

  const copyImageToClipboard = async () => {
    try {
      if (!imagePreview) return;

      const img = new Image();
      img.src = imagePreview;

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(async (blob) => {
          if (!blob) return;
          try {
            await navigator.clipboard.write([
              new ClipboardItem({
                "image/png": blob
              })
            ]);
            setCopiedImage(true);
            addLog("SYS: Raw image file copied to clipboard. Paste directly in Gemini/ChatGPT.");
            setTimeout(() => setCopiedImage(false), 2000);
          } catch (clipErr) {
            console.error("Clipboard write failed:", clipErr);
            addLog("ERR: Clipboard write failed. Please check browser permissions.");
          }
        }, "image/png");
      };
    } catch (err: any) {
      console.error("Failed to copy image:", err);
      addLog(`ERR: Clipboard conversion failed: ${err.message}`);
    }
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
    <div className="flex-1 min-h-screen bg-[#070913] text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-hidden cyber-grid">

      {/* Heavy Cyberpunk Neon Glowing Blobs */}
      <div className="absolute top-[-100px] left-[5%] w-[450px] h-[450px] bg-gradient-to-tr from-[#6366f1] to-[#a855f7] rounded-full blur-[140px] opacity-25 pointer-events-none -z-10 animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-[10%] right-[5%] w-[500px] h-[500px] bg-gradient-to-br from-[#06b6d4] to-[#3b82f6] rounded-full blur-[150px] opacity-20 pointer-events-none -z-10" />
      <div className="absolute top-[40%] left-[45%] w-[350px] h-[350px] bg-gradient-to-r from-[#ec4899] to-[#8b5cf6] rounded-full blur-[130px] opacity-15 pointer-events-none -z-10" />

      {/* Header Bar */}
      <header className="border-b border-[#131b35] bg-[#070913]/70 backdrop-blur-xl sticky top-0 z-50 transition-all duration-300">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3 group cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 via-[#6366f1] to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-black/20 group-hover:opacity-0 transition-opacity" />
              <Cpu className="w-5 h-5 text-white stroke-[2.5] relative z-10 animate-spin-slow" />
            </div>
            <div>
              <span className="font-mono font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-indigo-400 text-lg">
                RAWINGEST
              </span>
              <span className="block text-[9px] font-mono text-cyan-400/80 tracking-widest uppercase">
                EPHEMERAL STREAM GATEWAY
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-6">
            <div className="hidden md:flex items-center space-x-2 bg-slate-900/50 border border-slate-800 px-3 py-1 rounded-full text-xs font-mono text-slate-400">
              <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse mr-1" />
              <span>LATENCY: </span>
              <span className="text-cyan-400 font-bold">{simulatedMetrics.latency}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping absolute" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 relative" title="System operational" />
              <span className="text-[10px] font-mono text-emerald-400 tracking-wider hidden sm:inline-block">PIPELINE ONLINE</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 py-10 relative z-10">

        {/* Futuristic Hero Section */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center space-x-2 bg-gradient-to-r from-[#6366f1]/10 to-cyan-500/10 border border-cyan-500/30 px-3.5 py-1.5 rounded-full mb-6 relative overflow-hidden backdrop-blur-md">
            <Sparkles className="w-4 h-4 text-cyan-400 animate-bounce" />
            <span className="text-xs font-mono text-cyan-300 font-bold uppercase tracking-widest">
              Automated Zero-Persistence Infrastructure
            </span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400">
            Vaporize Images into <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-500">
              Raw Binary Streams
            </span>
          </h1>
          <p className="mt-5 text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed font-mono">
            Bypass bot protections, CAPTCHAs, and HTML wrappers. Ingest images to cloud nodes, receive immediate raw headers, and enforce a hard self-destruction sequence.
          </p>
        </div>

        {/* Live System Performance Grid (High Tech Stats) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mb-10">
          <div className="bg-[#0b0e1e]/60 border border-[#1b223d] p-3.5 rounded-xl backdrop-blur-md text-center font-mono">
            <span className="text-[10px] text-slate-500 uppercase block tracking-wider">TOTAL INGESTED</span>
            <span className="text-lg font-bold text-white block mt-1">{simulatedMetrics.bandwidth}</span>
          </div>
          <div className="bg-[#0b0e1e]/60 border border-[#1b223d] p-3.5 rounded-xl backdrop-blur-md text-center font-mono">
            <span className="text-[10px] text-slate-500 uppercase block tracking-wider">ACTIVE PIPES</span>
            <span className="text-lg font-bold text-cyan-400 block mt-1">{simulatedMetrics.activeUploads}</span>
          </div>
          <div className="bg-[#0b0e1e]/60 border border-[#1b223d] p-3.5 rounded-xl backdrop-blur-md text-center font-mono">
            <span className="text-[10px] text-slate-500 uppercase block tracking-wider">CPU ALLOCATION</span>
            <span className="text-lg font-bold text-[#a855f7] block mt-1">{simulatedMetrics.cpuLoad}</span>
          </div>
          <div className="bg-[#0b0e1e]/60 border border-[#1b223d] p-3.5 rounded-xl backdrop-blur-md text-center font-mono">
            <span className="text-[10px] text-slate-500 uppercase block tracking-wider">DB STORAGE STATUS</span>
            <span className="text-lg font-bold text-emerald-400 block mt-1">CONNECTED</span>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start max-w-6xl mx-auto">

          {/* LEFT COLUMN: UPLOADER / SUCCESS STATE (7 cols) */}
          <div className="lg:col-span-7 space-y-6">

            <div className="bg-[#0b0e1e]/40 backdrop-blur-2xl border border-[#171f3b] rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
              {/* Card Corner accents */}
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-500" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-500" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-500" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-500" />

              {/* IDLE / ERROR / INGESTING STATE */}
              {(status === "idle" || status === "error" || status === "initiating" || status === "uploading") && (
                <div>
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all duration-300 ${dragActive
                      ? "border-cyan-400 bg-cyan-500/5 shadow-[0_0_25px_rgba(6,182,212,0.2)] scale-102"
                      : "border-[#1c294d] hover:border-[#384c80] bg-[#070a17]/50"
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
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#10172d] to-[#1a254c] border border-[#2b3a69] flex items-center justify-center mb-5 text-cyan-400 shadow-lg relative overflow-hidden group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                          <UploadCloud className="w-8 h-8 group-hover:scale-110 transition-transform duration-300" />
                        </div>
                        <p className="text-sm font-semibold text-white mb-2">
                          Drag & drop raw payload here, or{" "}
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-cyan-400 hover:text-cyan-300 underline font-bold transition-colors font-mono"
                          >
                            [browse files]
                          </button>
                        </p>
                        <p className="text-xs text-slate-500 font-mono">
                          Format limits: JPEG, PNG, WEBP, GIF (Max size: 10MB)
                        </p>
                      </>
                    ) : (
                      <div className="w-full py-4">
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest animate-pulse flex items-center">
                            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 mr-2.5 animate-ping" />
                            {status === "initiating" ? "ALLOCATING S3 STORAGE ENDPOINT..." : "INGESTING BINARY STREAM..."}
                          </span>
                          <span className="text-xs font-mono text-cyan-400 font-bold">{uploadProgress}%</span>
                        </div>

                        <div className="w-full bg-[#070912] rounded-full h-2 overflow-hidden border border-[#1b2547]">
                          <div
                            className="bg-gradient-to-r from-cyan-400 via-[#6366f1] to-purple-600 h-2 rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(6,182,212,0.7)]"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>

                        <p className="text-[11px] text-slate-500 font-mono mt-4 italic">
                          Injecting raw segments directly into the cloud pipeline...
                        </p>
                      </div>
                    )}
                  </div>

                  {errorMsg && (
                    <div className="mt-4 p-4 rounded-xl bg-red-950/20 border border-red-900/40 flex items-start space-x-3 text-xs text-red-400 font-mono">
                      <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
                      <span>{errorMsg}</span>
                    </div>
                  )}
                </div>
              )}

              {/* SUCCESS STATE */}
              {status === "success" && (
                <div className="space-y-6">

                  {/* Top Success Banner */}
                  <div className="flex items-center space-x-3 pb-4 border-b border-[#1b2547]">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/55">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold font-mono tracking-widest text-emerald-400 uppercase">
                        INGESTION COMPLETE & CORRUPT-PROOF
                      </h3>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        Dual-layer auto-purging sequencing has been armed.
                      </p>
                    </div>
                  </div>

                  {/* Split Preview and Countdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">

                    {/* Countdown Circular Ring */}
                    <div className="flex flex-col items-center justify-center p-4 bg-[#070912]/80 rounded-xl border border-[#171f3a]/80">
                      <div className="relative w-32 h-32 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                          {/* Inner track */}
                          <circle
                            cx="64"
                            cy="64"
                            r={strokeRadius}
                            className="stroke-slate-900"
                            strokeWidth="5"
                            fill="transparent"
                          />
                          {/* Active track with glow */}
                          <circle
                            cx="64"
                            cy="64"
                            r={strokeRadius}
                            className="stroke-cyan-400 transition-all duration-1000"
                            strokeWidth="5"
                            strokeDasharray={strokeCircumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            fill="transparent"
                          />
                        </svg>

                        {/* Time in center */}
                        <div className="absolute flex flex-col items-center">
                          <Clock className="w-4 h-4 text-cyan-400 mb-1 animate-pulse" />
                          <span className="font-mono text-lg font-bold text-white leading-none">
                            {formatTime(timeLeft)}
                          </span>
                          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mt-1.5">
                            Until Purge
                          </span>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 mt-4 flex items-center bg-[#101428] px-2.5 py-1 rounded border border-[#1d264f]">
                        <Flame className="w-3.5 h-3.5 text-orange-500 mr-2 animate-pulse" />
                        AUTO-DESTRUCT ACTIVE
                      </span>
                    </div>

                    {/* Image Thumbnail with Hologram Scanlines */}
                    <div className="relative group overflow-hidden rounded-xl border border-[#1c284f] h-36 bg-[#070912] flex items-center justify-center animate-scan">
                      {imagePreview ? (
                        <img
                          src={imagePreview}
                          alt="Ingested upload preview"
                          className="object-cover w-full h-full opacity-50 group-hover:opacity-80 group-hover:scale-105 transition-all duration-300"
                        />
                      ) : (
                        <span className="text-xs font-mono text-slate-600">Preview Unavailable</span>
                      )}
                      <div className="absolute top-2 left-2 bg-[#070912]/95 border border-[#1b2547] rounded px-2 py-0.5 text-[9px] font-mono text-cyan-400">
                        {file ? `${(file.size / 1024).toFixed(0)} KB` : "Image"}
                      </div>
                    </div>
                  </div>

                  {/* Shared Link Output */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-cyan-400 block uppercase tracking-wider">
                        🎯 Binary Endpoint URL
                      </label>
                      <div className="flex space-x-2">
                        <div className="relative flex-1 bg-[#05060b] border border-[#1c264c] rounded-lg overflow-hidden flex items-center px-3 h-11">
                          <span className="text-xs text-white font-mono select-all truncate block w-full">
                            {downloadUrl}
                          </span>
                        </div>
                        <button
                          onClick={copyToClipboard}
                          className={`px-5 py-2.5 rounded-lg font-bold text-xs font-mono flex items-center space-x-2 transition-all duration-300 cursor-pointer ${copied
                            ? "bg-emerald-500 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.4)] border-emerald-400"
                            : "bg-[#10172e] hover:bg-[#1a254b] text-white border border-[#213064]"
                            }`}
                        >
                          {copied ? (
                            <>
                              <Check className="w-4 h-4 stroke-[2.5]" />
                              <span>COPIED!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              <span>COPY LINK</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={copyImageToClipboard}
                        className={`flex-1 py-3 rounded-lg font-bold text-xs font-mono flex items-center justify-center space-x-2 transition-all duration-300 cursor-pointer ${copiedImage
                          ? "bg-emerald-500 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.4)] border-emerald-400"
                          : "bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 hover:from-cyan-500/25 hover:to-indigo-500/25 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400/60"
                          }`}
                      >
                        {copiedImage ? (
                          <>
                            <Check className="w-4 h-4 stroke-[2.5]" />
                            <span>IMAGE FILE COPIED!</span>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="w-4 h-4 text-cyan-400" />
                            <span>COPY ACTUAL IMAGE (FOR PASTE IN GEMINI/CHATGPT)</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Curl Command Helper */}
                  <div className="bg-[#05060b] p-4 rounded-xl border border-[#171f3a] font-mono text-xs text-slate-400 space-y-2 relative">
                    <div className="flex justify-between items-center text-[9px] text-slate-500 border-b border-[#131b35] pb-2 mb-2">
                      <span>CURL IMAGE ACQUISITION</span>
                      <span className="text-cyan-400/80 font-bold">CROSS-ORIGIN CORS [*]</span>
                    </div>
                    <code className="text-slate-300 block select-all break-all leading-relaxed bg-[#0a0f21] p-2.5 rounded border border-[#131d3b] hover:border-cyan-500/40 transition-colors">
                      curl -H "Origin: https://agent-terminal.ai" {downloadUrl}
                    </code>
                    <p className="text-[10px] text-slate-500 italic mt-1 leading-normal">
                      Returns a pure binary image stream without wrapper HTML or client verification prompts.
                    </p>
                  </div>

                  {/* Reset Button */}
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={resetPipeline}
                      className="px-4 py-2.5 text-xs font-mono text-slate-400 hover:text-white transition-all duration-300 flex items-center space-x-2 cursor-pointer bg-[#05070e] hover:bg-[#0f1426] border border-[#1b254c] rounded-lg"
                    >
                      <RefreshCw className="w-4.5 h-4.5" />
                      <span>Purge Memory & Ingest Another</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Tech architecture specs */}
            <div className="bg-[#0b0e1e]/30 border border-[#171f3b] rounded-2xl p-6 flex items-start space-x-4 relative">
              <div className="absolute top-0 right-4 translate-y-[-50%] bg-[#6366f1]/10 border border-[#6366f1]/40 text-[#a5b4fc] text-[9px] font-mono px-2 py-0.5 rounded uppercase tracking-wider">
                System Specs
              </div>
              <Shield className="w-6 h-6 text-cyan-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-xs font-bold font-mono text-white uppercase tracking-widest">
                  Transient Ingest Architecture
                </h4>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed font-mono">
                  Incoming payloads bypass backend compute bottlenecks by uploading directly to bucket nodes via authenticated S3 presigners. This zero-persistence gateway enforces maximum throughput and complete privacy.
                </p>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: TERMINAL CONSOLE LOGS (5 cols) */}
          <div className="lg:col-span-5 space-y-6">

            {/* Terminal Panel */}
            <div className="bg-[#0b0e1e]/40 backdrop-blur-2xl border border-[#171f3b] rounded-2xl overflow-hidden shadow-2xl relative">
              <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-purple-500" />
              <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-purple-500" />

              {/* Terminal Title Bar */}
              <div className="bg-[#05060b] px-4 py-3 border-b border-[#131b35] flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-purple-400 animate-pulse" />
                  <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase">
                    SYS-DIAGNOSTIC PIPELINE
                  </span>
                </div>
                <div className="flex space-x-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500/60" />
                  <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                  <div className="w-2 h-2 rounded-full bg-green-500/60" />
                </div>
              </div>

              {/* Terminal Logs Body */}
              <div className="p-4 bg-[#05060b]/75 font-mono text-xs leading-relaxed text-[#59d5e0] h-[340px] overflow-y-auto space-y-2 select-text scrollbar-thin">
                {logs.map((log, index) => (
                  <div
                    key={index}
                    className={`border-l-2 pl-2.5 transition-all duration-300 ${log.includes("ERR:")
                      ? "border-red-500/70 text-red-400"
                      : log.includes("SUCCESS:")
                        ? "border-emerald-500/70 text-emerald-400"
                        : log.includes("METADATA:") || log.includes("SECURITY:") || log.includes("INIT:")
                          ? "border-purple-500/70 text-purple-400"
                          : "border-slate-800 text-slate-400"
                      }`}
                  >
                    {log}
                  </div>
                ))}

                {/* Simulated cursor blinking */}
                {status !== "success" && (
                  <div className="flex items-center text-slate-600 pl-2.5">
                    <span>$ listening for stream_packet...</span>
                    <span className="ml-1 w-2.5 h-4 bg-cyan-400/75 animate-pulse" />
                  </div>
                )}
              </div>

              {/* Terminal footer details */}
              <div className="bg-[#05060b]/90 px-4 py-3 border-t border-[#131b35] flex justify-between items-center text-[9px] font-mono text-slate-500">
                <span className="flex items-center">
                  <Server className="w-3.5 h-3.5 mr-1 text-[#6366f1]" />
                  NODE: AP-SOUTHEAST-1
                </span>
                <span className="flex items-center">
                  <Layers className="w-3.5 h-3.5 mr-1 text-purple-400" />
                  DB: PRISMA-POSTGRES
                </span>
              </div>
            </div>

            {/* Quick API access guide */}
            <div className="bg-[#0b0e1e]/20 border border-[#171f3b] rounded-2xl p-6 font-mono text-xs text-slate-400 space-y-3">
              <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest border-b border-[#121932] pb-2 flex items-center">
                <Fingerprint className="w-4 h-4 mr-2" />
                Integration Key
              </div>
              <p className="leading-relaxed text-[11px]">
                Any agent can programmatically write directly. Query `POST /api/upload/initiate` with JSON:
              </p>
              <pre className="bg-[#05070e] p-2.5 rounded border border-[#121830] text-slate-300 overflow-x-auto text-[10px]">
                {`{
  "fileName": "avatar.png",
  "fileType": "image/png",
  "fileSize": 204800
}`}
              </pre>
            </div>

          </div>

        </div>
      </main>

      {/* Cyberpunk Footer (Linked personal accounts) */}
      <footer className="mt-28 border-t border-[#131c3c] bg-[#05070f]/90 relative overflow-hidden py-12 text-center text-xs font-mono text-slate-500">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#6366f1]/40 to-transparent" />

        <div className="max-w-6xl mx-auto px-4 flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="text-left md:max-w-md">
            <p className="text-white font-extrabold tracking-widest text-sm">
              RAWINGEST PIPELINE
            </p>
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              Automated self-destruction mechanisms armed. All uploads are subject to absolute hard-wipe policies.
            </p>
          </div>

          {/* Social and Portfolio Accounts */}
          <div className="flex flex-wrap justify-center items-center gap-4">
            <a
              href="https://github.com/Ali-Arshad-110"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 bg-[#0c1023] hover:bg-[#121935] hover:text-cyan-400 text-slate-300 px-4 py-2 rounded-lg border border-[#1b254a] transition-all duration-300"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <span>GitHub</span>
            </a>

            <a
              href="https://linkedin.com/in/aliarshad110"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 bg-[#0c1023] hover:bg-[#121935] hover:text-cyan-400 text-slate-300 px-4 py-2 rounded-lg border border-[#1b254a] transition-all duration-300"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764.784 1.75 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
              </svg>
              <span>LinkedIn</span>
            </a>

            <a
              href="https://aliarshad.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 bg-[#0c1023] hover:bg-[#121935] hover:text-[#a855f7] text-slate-300 px-4 py-2 rounded-lg border border-[#1b254a] transition-all duration-300"
            >
              <Globe className="w-4.5 h-4.5" />
              <span>Portfolio</span>
            </a>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 mt-8 pt-6 border-t border-[#0e152f] flex flex-col md:flex-row items-center justify-between text-[10px] text-slate-600 gap-4">
          <p>© 2026 RAWINGEST PIPELINE. MAINTAINED BY ALI ARSHAD.</p>
          <div className="flex space-x-4">
            <span className="hover:text-slate-400 cursor-pointer">SECURE NODE</span>
            <span>•</span>
            <span className="hover:text-slate-400 cursor-pointer">ZERO LOG STORAGE</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
