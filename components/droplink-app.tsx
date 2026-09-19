"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { io, Socket } from "socket.io-client";
import CodeEditor from "./code-editor";
import { getWebRtcConfig } from "../lib/webrtc-config";
import {
  Check,
  Copy,
  Download,
  File,
  Link2,
  LoaderCircle,
  ShieldCheck,
  UploadCloud,
  Wifi,
} from "lucide-react";

type FileInfo = { name: string; size: number };
type Request = { requestId: string; from: string; files: FileInfo[]; kind?: "files" | "text" };
const CODE_MIME = "application/x-droplink-code";
const format = (value: number) =>
  value < 1048576
    ? `${Math.ceil(value / 1024)} KB`
    : `${(value / 1048576).toFixed(1)} MB`;
const newCode = () => String(Math.floor(100000 + Math.random() * 900000));

export default function DropLinkApp() {
  const [deviceCode, setDeviceCode] = useState("");
  const [targetCode, setTargetCode] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"files" | "text">("files");
  const [draft, setDraft] = useState("");
  const [receivedText, setReceivedText] = useState<string | null>(null);
  const [status, setStatus] = useState("Starting device listener…");
  const [error, setError] = useState("");
  const [incoming, setIncoming] = useState<Request | null>(null);
  const [requestId, setRequestId] = useState("");
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const socket = useRef<Socket | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const signalQueue = useRef<Promise<void>>(Promise.resolve());
  const channel = useRef<RTCDataChannel | null>(null);
  const pending = useRef<RTCIceCandidateInit[]>([]);
  const sender = useRef(false);
  const outgoingFiles = useRef<File[] | null>(null);
  const requestRef = useRef("");
  const chunks = useRef<ArrayBuffer[]>([]);
  const metadata = useRef<{ name: string; size: number; mime: string } | null>(
    null,
  );
  const signalUrl =
    process.env.NEXT_PUBLIC_SIGNALING_URL || "http://localhost:3001";
  const relay = useCallback(
    (payload: unknown) =>
      socket.current?.emit("signal", {
        requestId: requestRef.current,
        payload,
      }),
    [],
  );
  const sendFiles = useCallback(async (dc: RTCDataChannel, batch: File[]) => {
    try {
      setProgress(0);
      setError("");
      const total = batch.reduce((sum, file) => sum + file.size, 0);
      let sent = 0;
      for (const file of batch) {
        setStatus(`Sending ${file.name}...`);
        dc.send(JSON.stringify({ type: "meta", name: file.name, size: file.size, mime: file.type }));
        for (let offset = 0; offset < file.size; offset += 16384) {
          while (dc.bufferedAmount > 4_000_000) {
            if (dc.readyState !== "open") throw new Error("Connection closed during transfer. Please request the transfer again.");
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          const chunk = await file.slice(offset, offset + 16384).arrayBuffer();
          if (dc.readyState !== "open") throw new Error("Connection closed during transfer. Please request the transfer again.");
          dc.send(chunk);
          sent += chunk.byteLength;
          setProgress(Math.round((sent / total) * 100));
        }
        dc.send(JSON.stringify({ type: "end" }));
      }
      setProgress(100);
      setStatus("Files sent");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send files. Please request the transfer again.");
      setStatus("Transfer interrupted");
    }
  }, []);
  const attach = useCallback((dc: RTCDataChannel) => {
    channel.current = dc;
    dc.binaryType = "arraybuffer";
    dc.onopen = () => {
      setStatus("Encrypted direct connection ready");
      if (sender.current && outgoingFiles.current) {
        const batch = outgoingFiles.current;
        outgoingFiles.current = null;
        void sendFiles(dc, batch);
      }
    };
    dc.onmessage = ({ data }) => {
      if (typeof data === "string") {
        const m = JSON.parse(data);
        if (m.type === "meta") {
          metadata.current = m;
          chunks.current = [];
          setProgress(0);
          setStatus(`Receiving ${m.name}…`);
        } else if (m.type === "end" && metadata.current) {
          const blob = new Blob(chunks.current, {
            type: metadata.current.mime,
          });
          if (metadata.current.mime === CODE_MIME) {
            void blob.text().then((text) => {
              setReceivedText(text);
              setProgress(100);
              setStatus("Code received — ready to copy");
            }).catch(() => setError("Could not read received text."));
            metadata.current = null;
            chunks.current = [];
            return;
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = metadata.current.name;
          link.click();
          URL.revokeObjectURL(url);
          setProgress(100);
          setStatus(`Downloaded ${metadata.current.name}`);
        }
      } else if (metadata.current) {
        chunks.current.push(data);
        // React may run this updater after the end message clears metadata.
        // Capture the values now instead of reading a mutable ref in the updater.
        const totalBytes = metadata.current.size;
        const receivedBytes = (data as ArrayBuffer).byteLength;
        setProgress((value) =>
          Math.min(
            99,
            value + (totalBytes > 0 ? (receivedBytes / totalBytes) * 100 : 0),
          ),
        );
      }
    };
  }, [sendFiles]);
  const getPeer = useCallback(async () => {
    if (peer.current) return peer.current;
    const pc = new RTCPeerConnection(getWebRtcConfig());
    pc.onicecandidate = (event) =>
      event.candidate &&
      relay({ type: "candidate", candidate: event.candidate.toJSON() });
    pc.ondatachannel = (event) => attach(event.channel);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        setStatus("Direct connection failed");
        setError(
          "Could not connect directly. A router or firewall may be blocking WebRTC. Try another network and refresh both devices. TURN fallback is disabled.",
        );
      }
    };
    peer.current = pc;
    return pc;
  }, [attach, relay]);
  const handleSignal = useCallback(
    async ({ payload }: { payload: any }) => {
      try {
        const pc = await getPeer();
        if (payload.type === "offer") {
          await pc.setRemoteDescription(payload.description);
          for (const candidate of pending.current)
            await pc.addIceCandidate(candidate);
          pending.current = [];
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          relay({ type: "answer", description: answer });
        } else if (payload.type === "answer") {
          await pc.setRemoteDescription(payload.description);
          for (const candidate of pending.current) await pc.addIceCandidate(candidate);
          pending.current = [];
        } else if (payload.type === "candidate")
          pc.remoteDescription
            ? await pc.addIceCandidate(payload.candidate)
            : pending.current.push(payload.candidate);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not negotiate the secure connection.");
      }
    },
    [getPeer, relay],
  );
  useEffect(() => {
    const stored = localStorage.getItem("droplink-device-code") || newCode();
    localStorage.setItem("droplink-device-code", stored);
    setDeviceCode(stored);
    const client = io(signalUrl, {
      transports: ["polling", "websocket"],
      upgrade: false,
    });
    socket.current = client;
    client.on("connect", () => {
      client.emit("register-device", { code: stored });
      setStatus("Ready to receive requests");
    });
    client.on("device-ready", () => setStatus("Ready to receive requests"));
    client.on("incoming-transfer", setIncoming);
    client.on("app-error", setError);
    client.on("signal", (message) => { signalQueue.current = signalQueue.current.then(() => handleSignal(message)); });
    client.on("transfer-ready", async ({ requestId: id }) => {
      requestRef.current = id;
      setRequestId(id);
      if (sender.current) {
        try {
        const pc = await getPeer();
        const dc = pc.createDataChannel("droplink-files");
        attach(dc);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.current?.emit("signal", {
          requestId: id,
          payload: { type: "offer", description: offer },
        });
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Could not start a direct connection.");
        }
      }
    });
    return () => {
      client.disconnect();
      peer.current?.close();
    };
  }, [attach, getPeer, handleSignal, signalUrl]);
  const requestTransfer = () => {
    if (!/^\d{6}$/.test(targetCode) || targetCode === deviceCode)
      return setError("Enter another device’s six-digit code.");
    if (mode === "files" && !files.length) return setError("Choose at least one file.");
    if (mode === "text" && !draft.length) return setError("Paste some code or text first.");
    if (!socket.current?.connected) return setError("Wait for the signaling connection before sending.");
    const batch = mode === "text"
      ? [new globalThis.File([draft], "snippet.txt", { type: CODE_MIME })]
      : [...files];
    setError("");
    sender.current = true;
    outgoingFiles.current = batch;
    socket.current?.emit("request-transfer", {
      code: targetCode,
      kind: mode,
      files: batch.map((file) => ({ name: file.name, size: file.size })),
    });
    setStatus("Request sent — waiting for receiver approval");
  };
  const accept = () => {
    if (!incoming) return;
    sender.current = false;
    outgoingFiles.current = null;
    requestRef.current = incoming.requestId;
    setRequestId(incoming.requestId);
    socket.current?.emit("accept-transfer", { requestId: incoming.requestId });
    setStatus("Request accepted — establishing secure link…");
    setIncoming(null);
  };
  const drop = useDropzone({
    onDrop: (accepted) => setFiles((current) => [...current, ...accepted]),
  });
  return (
    <main className="canvas min-h-screen">
      <div className="fixed inset-0 noise pointer-events-none" />
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300 text-slate-950">
            <Link2 size={20} />
          </span>
          <div>
            <h1 className="text-lg font-semibold">
              DropLink <span className="text-cyan-300">/ P2P</span>
            </h1>
            <p className="font-mono text-xs text-slate-500">
              SIMPLE DEVICE TRANSFER
            </p>
          </div>
        </div>
        <span className="hidden items-center gap-2 font-mono text-xs text-emerald-300 sm:flex">
          <Wifi size={15} /> {status}
        </span>
      </header>
      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-12 pt-8 sm:pt-14">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[.24em] text-cyan-300">// PRIVATE_FILE_RELAY</p>
          <h2 className="mt-5 text-5xl font-semibold leading-[.95] tracking-[-.065em] sm:text-7xl">Send a file with <span className="text-cyan-300">one code.</span></h2>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">DropLink connects your browsers directly with encrypted WebRTC. No account, no file relay, and no cloud storage. Some networks may block direct connections.</p>
          <div className="mt-8 flex flex-wrap gap-3"><span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 font-mono text-xs text-cyan-100">01 / ENTER CODE</span><span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 font-mono text-xs text-cyan-100">02 / ACCEPT REQUEST</span><span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 font-mono text-xs text-cyan-100">03 / DIRECT DOWNLOAD</span></div>
        </div>
        <div className="mt-10 grid gap-3 md:grid-cols-3"><div className="glass rounded-2xl p-4"><p className="font-mono text-xs text-cyan-300">NO_CLOUD_BUCKET</p><p className="mt-2 text-sm text-slate-400">Encrypted files move directly between devices.</p></div><div className="glass rounded-2xl p-4"><p className="font-mono text-xs text-cyan-300">FIXED_DEVICE_CODE</p><p className="mt-2 text-sm text-slate-400">One persistent six-digit code per browser.</p></div><div className="glass rounded-2xl p-4"><p className="font-mono text-xs text-cyan-300">ACCEPT_ONCE</p><p className="mt-2 text-sm text-slate-400">Receiver reviews files before transfer begins.</p></div></div>
      </section>
      <div className="relative z-10 mx-auto grid max-w-6xl gap-5 px-5 pb-14 lg:grid-cols-[.8fr_1.2fr]">
        <aside className="dev-console rounded-[28px] p-6">
          <p className="font-mono text-xs uppercase tracking-[.2em] text-cyan-300">
            This device
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-[.18em]">
            {deviceCode.slice(0, 3)} {deviceCode.slice(3)}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Give this code to your other device. Keep this page open to receive
            files.
          </p>
          <button
            onClick={() => {
              navigator.clipboard.writeText(deviceCode);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="mt-5 rounded-xl border border-cyan-300/25 px-4 py-2.5 text-sm text-cyan-200"
          >
            {copied ? (
              <>
                <Check className="mr-2 inline" size={16} />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-2 inline" size={16} />
                Copy my code
              </>
            )}
          </button>
          <div className="mt-7 border-t border-white/10 pt-5">
            <p className="font-mono text-xs text-emerald-300">
              ● ONLINE / READY
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Receiver clicks Accept once. Files then download automatically.
            </p>
          </div>
        </aside>
        <section className="dev-console rounded-[28px] p-5 sm:p-7">
          <p className="font-mono text-xs uppercase tracking-[.2em] text-cyan-300">
            Send to a device
          </p>
          <div className="mt-5 flex gap-3">
            <input
              value={targetCode}
              onChange={(event) =>
                setTargetCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="ENTER 6-DIGIT CODE"
              className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-center font-mono tracking-[.22em] outline-none focus:border-cyan-300"
            />
            <button
              onClick={requestTransfer}
              className="rounded-xl bg-cyan-300 px-4 text-sm font-semibold text-slate-950"
            >
              {mode === "text" ? "Send text" : "Request"}
            </button>
          </div>
          <div className="mt-5 flex gap-2" aria-label="Transfer type">
            {(["files", "text"] as const).map((tab) => <button key={tab} type="button" aria-pressed={mode === tab} onClick={() => setMode(tab)} className={`rounded-lg px-4 py-2 font-mono text-xs ${mode === tab ? "bg-cyan-300 text-slate-950" : "bg-white/5 text-slate-400"}`}>{tab === "files" ? "FILES" : "</> CODE / TEXT"}</button>)}
          </div>
          {mode === "text" ? <>
            <CodeEditor label="outgoing / snippet.txt" value={draft} onChange={setDraft} />
            <p className="mt-2 text-xs text-slate-500">Paste code, enter the device code, and send. Indentation and blank lines are preserved. The receiver accepts once.</p>
          </> : <>
          <div
            {...drop.getRootProps()}
            className="mt-5 grid min-h-48 cursor-pointer place-items-center rounded-2xl border border-dashed border-cyan-300/25 bg-cyan-300/[.025] p-6 text-center hover:bg-cyan-300/[.06]"
          >
            <input {...drop.getInputProps()} />
            <div>
              <UploadCloud className="mx-auto mb-3 text-cyan-300" size={30} />
              <p className="font-medium">Drop files here</p>
              <p className="mt-1 text-sm text-slate-500">
                or click to choose files
              </p>
            </div>
          </div>
          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2"
                >
                  <File className="text-cyan-300" size={17} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {file.name}
                  </span>
                  <span className="text-xs text-slate-500">
                    {format(file.size)}
                  </span>
                </div>
              ))}
            </div>
          )}
          </>}
          {receivedText !== null && <CodeEditor label="received / snippet.txt" value={receivedText} onChange={setReceivedText} />}
          <p role="status" className="mt-4 text-xs text-cyan-200">{status}</p>
          {progress > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex justify-between text-xs text-slate-400">
                <span>{status}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-cyan-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
          {error && (
            <p className="mt-4 rounded-xl bg-red-400/15 p-3 text-sm text-red-100">
              {error}
            </p>
          )}
        </section>
      </div>
      {incoming && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5">
          <section className="dev-console w-full max-w-lg rounded-[28px] p-7">
            <p className="font-mono text-xs uppercase tracking-[.2em] text-cyan-300">
              Incoming {incoming.kind === "text" ? "code / text" : "file"} request
            </p>
            <h2 className="mt-3 text-2xl font-semibold">
              {incoming.kind === "text" ? "A device wants to send code / text." : `A device wants to send ${incoming.files.length} file${incoming.files.length === 1 ? "" : "s"}.`}
            </h2>
            <div className="mt-5 space-y-2">
              {incoming.files.map((file) => (
                <div
                  key={file.name}
                  className="flex justify-between rounded-xl bg-white/5 p-3 text-sm"
                >
                  <span>{file.name}</span>
                  <span className="text-slate-500">{format(file.size)}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setIncoming(null)}
                className="flex-1 rounded-xl bg-white/10 py-3 text-sm"
              >
                Reject
              </button>
              <button
                onClick={accept}
                className="flex-1 rounded-xl bg-cyan-300 py-3 text-sm font-semibold text-slate-950"
              >
                {incoming.kind === "text" ? "Accept & open editor" : "Accept & download"}
              </button>
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck size={14} /> Direct WebRTC transfer — files do not
              pass through Render.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
