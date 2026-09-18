"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { QRCodeSVG } from "qrcode.react";
import { io, Socket } from "socket.io-client";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clipboard,
  Code2,
  Copy,
  Download,
  File,
  FileImage,
  FileText,
  FolderOpen,
  History,
  Image as ImageIcon,
  Laptop,
  Link2,
  LoaderCircle,
  LockKeyhole,
  MoreHorizontal,
  Pause,
  Phone,
  Play,
  Plus,
  QrCode,
  ScanLine,
  Settings,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Wifi,
  X,
  Zap,
} from "lucide-react";

type Screen = "home" | "send" | "receive" | "transfer" | "settings" | "history";
type TransferFile = {
  name: string;
  size: number;
  kind: string;
  progress: number;
};
type Session = { connect: (code: string, sender: boolean) => void; send: (files: File[]) => Promise<void>; connected: boolean; status: string; error: string; progress: number; received: TransferFile[] };
const useSession = (): Session => {
  const [connected, setConnected] = useState(false), [status, setStatus] = useState("Waiting for receiver..."), [error, setError] = useState(""), [progress, setProgress] = useState(0), [received, setReceived] = useState<TransferFile[]>([]);
  const socket = useRef<Socket | null>(null), peer = useRef<RTCPeerConnection | null>(null), channel = useRef<RTCDataChannel | null>(null), codeRef = useRef(""), pending = useRef<RTCIceCandidateInit[]>([]), chunks = useRef<ArrayBuffer[]>([]), meta = useRef<{ name: string; size: number; mime: string } | null>(null);
  const relay = useCallback((payload: unknown) => socket.current?.emit("signal", { code: codeRef.current, payload }), []);
  const attach = useCallback((dc: RTCDataChannel) => { channel.current = dc; dc.binaryType = "arraybuffer"; dc.onopen = () => { setConnected(true); setStatus("Secure connection established"); }; dc.onmessage = ({ data }) => { if (typeof data === "string") { const m = JSON.parse(data); if (m.type === "meta") { meta.current = m; chunks.current = []; setReceived([{ name: m.name, size: m.size / 1048576, kind: "file", progress: 0 }]); } else if (m.type === "end" && meta.current) { const blob = new Blob(chunks.current, { type: meta.current.mime }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = meta.current.name; a.click(); URL.revokeObjectURL(url); setReceived(x => x.map(f => ({ ...f, progress: 100 }))); setStatus(`Downloaded ${meta.current.name}`); } } else if (meta.current) { chunks.current.push(data); setReceived(x => x.map(f => ({ ...f, progress: Math.min(99, f.progress + ((data as ArrayBuffer).byteLength / meta.current!.size) * 100) }))); } }; }, []);
  const getPeer = useCallback(() => { if (peer.current) return peer.current; const pc = new RTCPeerConnection({ iceServers: [{ urls: (process.env.NEXT_PUBLIC_STUN_URLS || "stun:stun.l.google.com:19302").split(",") }] }); pc.onicecandidate = e => e.candidate && relay({ type: "candidate", candidate: e.candidate.toJSON() }); pc.ondatachannel = e => attach(e.channel); pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") setError("Direct connection failed. Try another network or configure TURN."); }; peer.current = pc; return pc; }, [attach, relay]);
  const connect = useCallback((code: string, sender: boolean) => { const clean = code.replace(/\D/g, ""); if (!/^\d{6}$/.test(clean)) return setError("Enter a valid six-digit code."); socket.current?.disconnect(); peer.current?.close(); socket.current = null; peer.current = null; channel.current = null; pending.current = []; codeRef.current = clean; setConnected(false); setError(""); const signalUrl = process.env.NEXT_PUBLIC_SIGNALING_URL || "http://localhost:3001"; setStatus(`Connecting to ${signalUrl}`); const client = io(signalUrl); socket.current = client; client.on("connect", () => { client.emit("join", { code: clean }); setStatus("Waiting for the other device..."); }); client.on("pairing-error", setError); client.on("connect_error", (reason) => setError(`Signaling error at ${signalUrl}: ${reason.message || "connection failed"}`)); client.on("signal", async (m: any) => { try { const pc = getPeer(); if (m.type === "offer") { await pc.setRemoteDescription(m.description); for (const c of pending.current) await pc.addIceCandidate(c); pending.current = []; const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); relay({ type: "answer", description: answer }); } else if (m.type === "answer") await pc.setRemoteDescription(m.description); else if (m.type === "candidate") pc.remoteDescription ? await pc.addIceCandidate(m.candidate) : pending.current.push(m.candidate); } catch { setError("Could not negotiate connection."); } }); if (sender) client.on("peer-ready", async () => { const pc = getPeer(); const dc = pc.createDataChannel("files"); attach(dc); const offer = await pc.createOffer(); await pc.setLocalDescription(offer); relay({ type: "offer", description: offer }); }); }, [attach, getPeer, relay]);
  const send = useCallback(async (files: File[]) => { const dc = channel.current; if (!dc || dc.readyState !== "open") return setError("Wait until the receiver connects."); const total = files.reduce((n, f) => n + f.size, 0); let done = 0; for (const f of files) { dc.send(JSON.stringify({ type: "meta", name: f.name, size: f.size, mime: f.type })); for (let i = 0; i < f.size; i += 16384) { while (dc.bufferedAmount > 4_000_000) await new Promise(r => setTimeout(r, 20)); dc.send(await f.slice(i, i + 16384).arrayBuffer()); done += Math.min(16384, f.size - i); setProgress(Math.round(done / total * 100)); } dc.send(JSON.stringify({ type: "end" })); } setStatus("All files sent."); }, []);
  useEffect(() => () => { channel.current?.close(); peer.current?.close(); socket.current?.disconnect(); }, []);
  return { connect, send, connected, status, error, progress, received };
};
const starters: TransferFile[] = [
  { name: "Summer-reel.mp4", size: 48.2, kind: "file", progress: 72 },
  { name: "design-notes.pdf", size: 2.4, kind: "pdf", progress: 100 },
  { name: "dashboard.png", size: 1.8, kind: "image", progress: 100 },
];
const fmt = (n: number) =>
  n < 1 ? `${Math.round(n * 1024)} KB` : `${n.toFixed(n < 10 ? 1 : 0)} MB`;

export default function DropLinkApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [files, setFiles] = useState<TransferFile[]>([]);
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const session = useSession();
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [device, setDevice] = useState("Tanishq’s MacBook Pro");
  const [theme, setTheme] = useState("Dark");
  const go = (x: Screen) => {
    setScreen(x);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("join")?.replace(/\D/g, "") ?? "";
    if (/^\d{6}$/.test(code)) {
      setJoinCode(code);
      setScreen("receive");
    }
  }, []);
  return (
    <main className="canvas">
      <div className="fixed inset-0 noise pointer-events-none" />
      <Navbar screen={screen} go={go} />
      <AnimatePresence mode="wait">
        {screen === "home" && <Landing key="home" go={go} />}{" "}
        {screen === "send" && (
          <Send
            key="send"
            go={go}
            files={files}
            setFiles={setFiles}
            rawFiles={rawFiles}
            setRawFiles={setRawFiles}
            session={session}
            copied={copied}
            setCopied={setCopied}
          />
        )}{" "}
        {screen === "receive" && (
          <Receive
            key="receive"
            go={go}
            session={session}
            initialCode={joinCode}
          />
        )}{" "}
        {screen === "transfer" && (
          <Transfer
            key="transfer"
            go={go}
            files={files.length ? files : starters}
            session={session}
          />
        )}{" "}
        {screen === "settings" && (
          <SettingsPage
            key="settings"
            device={device}
            setDevice={setDevice}
            theme={theme}
            setTheme={setTheme}
          />
        )}{" "}
        {screen === "history" && <HistoryPage key="history" />}
      </AnimatePresence>
    </main>
  );
}

function Navbar({ screen, go }: { screen: Screen; go: (s: Screen) => void }) {
  return (
    <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
      <button
        onClick={() => go("home")}
        className="flex items-center gap-2 font-semibold tracking-tight"
      >
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-400 to-blue-700 shadow-glow">
          <Link2 size={19} />
        </span>
        <span className="text-xl">
          Drop<span className="text-blue-400">Link</span>
        </span>
      </button>
      <nav className="glass hidden items-center gap-1 rounded-full p-1 text-sm md:flex">
        {(["home", "send", "receive", "history"] as Screen[]).map((x) => (
          <button
            key={x}
            onClick={() => go(x)}
            className={`rounded-full px-4 py-2 capitalize ${screen === x ? "bg-white/13 text-white" : "navlink"}`}
          >
            {x === "home" ? "Home" : x}
          </button>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <button
          onClick={() => go("settings")}
          className="grid h-10 w-10 place-items-center rounded-full text-slate-300 hover:bg-white/10"
        >
          <Settings size={18} />
        </button>
        <button
          onClick={() => go("send")}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-blue-50"
        >
          New transfer
        </button>
      </div>
    </header>
  );
}

const Page = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.35 }}
    className="relative z-10 mx-auto max-w-7xl px-5 pb-14 lg:px-8"
  >
    {children}
  </motion.div>
);
function Landing({ go }: { go: (s: Screen) => void }) {
  const cards = [
    [QrCode, "QR pairing", "Connect in one scan"],
    [Code2, "6-digit pairing", "Private, simple connection"],
    [LockKeyhole, "End-to-end encrypted", "Only your devices can read"],
    [Zap, "No uploads", "Files stay device-to-device"],
    [FolderOpen, "Unlimited file size", "Send what you need"],
    [Laptop, "Phone + PC", "Works wherever you are"],
  ];
  return (
    <Page>
      <section className="grid min-h-[570px] items-center gap-10 py-12 lg:grid-cols-[1.05fr_.95fr] lg:py-20">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1.5 text-sm text-blue-200">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-300" />
            Private device-to-device transfers
          </div>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.04] tracking-[-.055em] sm:text-7xl">
            Instantly transfer files{" "}
            <span className="bg-gradient-to-r from-blue-300 to-white bg-clip-text text-transparent">
              between your devices.
            </span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">
            Share anything directly from your laptop to your phone. No accounts,
            no uploads, no limits.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <button
              onClick={() => go("send")}
              className="flex items-center gap-2 rounded-full bg-white px-6 py-3.5 font-semibold text-slate-950 shadow-xl shadow-blue-950/30"
            >
              Send files <ArrowRight size={18} />
            </button>
            <button
              onClick={() => go("receive")}
              className="glass flex items-center gap-2 rounded-full px-6 py-3.5 font-semibold"
            >
              Receive files <Download size={18} />
            </button>
          </div>
          <div className="mt-10 flex items-center gap-4 text-sm text-slate-400">
            <div className="flex -space-x-2">
              <span className="grid h-7 w-7 place-items-center rounded-full border border-[#0d1e35] bg-blue-500">
                <Laptop size={13} />
              </span>
              <span className="grid h-7 w-7 place-items-center rounded-full border border-[#0d1e35] bg-sky-400">
                <Phone size={13} />
              </span>
            </div>
            <span>Encrypted with WebRTC · No cloud storage</span>
          </div>
        </div>
        <DeviceScene />
      </section>
      <section className="grid gap-3 pb-12 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([Icon, title, text], i) => {
          const I = Icon as any;
          return (
            <motion.div
              whileHover={{ y: -4 }}
              key={title as string}
              className="glass rounded-3xl p-5"
            >
              <span className="mb-5 grid h-10 w-10 place-items-center rounded-2xl bg-blue-400/15 text-blue-300">
                <I size={20} />
              </span>
              <h3 className="font-medium">{title as string}</h3>
              <p className="mt-1 text-sm text-slate-400">{text as string}</p>
            </motion.div>
          );
        })}
      </section>
    </Page>
  );
}
function DeviceScene() {
  return (
    <div className="relative mx-auto h-[400px] w-full max-w-[510px]">
      <div className="absolute left-[8%] top-[20%] h-56 w-56 rounded-full bg-blue-500/20 blur-[80px]" />
      <div className="glass float absolute left-3 top-28 w-[295px] rounded-[22px] p-2 shadow-2xl">
        <div className="rounded-[15px] border border-white/10 bg-[#0b1c35] p-4">
          <div className="mb-7 flex gap-1">
            <i className="h-2 w-2 rounded-full bg-red-400" />
            <i className="h-2 w-2 rounded-full bg-yellow-300" />
            <i className="h-2 w-2 rounded-full bg-green-400" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 h-20 rounded-xl bg-gradient-to-br from-blue-500/45 to-violet-500/20" />
            <div className="h-20 rounded-xl bg-white/5" />
            <div className="h-16 rounded-xl bg-white/5" />
            <div className="col-span-2 h-16 rounded-xl bg-white/5" />
          </div>
        </div>
      </div>
      <div className="absolute right-[2%] top-5 h-64 w-[129px] rounded-[29px] border-[5px] border-slate-700 bg-[#08172c] p-2 shadow-2xl">
        <div className="mx-auto h-4 w-12 rounded-b-xl bg-slate-700" />
        <div className="mt-7 h-32 rounded-2xl bg-gradient-to-b from-blue-400/60 via-blue-700/20 to-transparent" />
        <div className="mt-3 flex justify-center gap-1">
          <i className="h-1 w-8 rounded-full bg-white/20" />
        </div>
      </div>
      <div className="absolute left-[42%] top-[37%] grid h-16 w-16 place-items-center rounded-full border border-blue-200/30 bg-blue-500 shadow-glow">
        <Wifi className="animate-pulse" />
      </div>
      {[...Array(7)].map((_, i) => (
        <span
          key={i}
          className="pulse-dot absolute h-2 w-2 rounded-full bg-blue-200"
          style={{
            left: `${37 + i * 8}%`,
            top: `${38 + (i % 2) * 13}%`,
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

function Send({
  go,
  files,
  setFiles,
  rawFiles,
  setRawFiles,
  session,
  copied,
  setCopied,
}: {
  go: (s: Screen) => void;
  files: TransferFile[];
  setFiles: (x: TransferFile[]) => void;
  rawFiles: File[];
  setRawFiles: (x: File[]) => void;
  session: Session;
  copied: boolean;
  setCopied: (x: boolean) => void;
}) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      setRawFiles([...rawFiles, ...accepted]);
      setFiles([
        ...files,
        ...accepted.map((f) => ({
          name: f.name,
          size: f.size / 1024 / 1024,
          kind: f.type.includes("image")
            ? "image"
            : f.name.endsWith(".pdf")
              ? "pdf"
              : f.name.match(/\.(ts|js|py|css|json)$/)
                ? "code"
                : "file",
          progress: 0,
        })),
      ]);
    },
    [files, rawFiles, setFiles, setRawFiles],
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });
  const [code] = useState(() => String(Math.floor(100000 + Math.random() * 900000)));
  const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}?join=${code}`;
  return (
    <Page>
      <Top
        title="Send files"
        text="Your files travel directly between your devices — never through our servers."
      />
      <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <section className="glass rounded-[28px] p-4 sm:p-6">
          <div
            {...getRootProps()}
            className={`grid min-h-[260px] cursor-pointer place-items-center rounded-[22px] border border-dashed p-8 text-center transition ${isDragActive ? "border-blue-300 bg-blue-500/15" : "border-white/20 bg-black/10 hover:border-blue-300/60 hover:bg-white/[.035]"}`}
          >
            <input {...getInputProps()} />
            <div>
              <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-blue-400 to-blue-700 shadow-glow">
                <UploadCloud size={27} />
              </span>
              <h3 className="text-xl font-medium">Drop files to send</h3>
              <p className="mt-2 text-sm text-slate-400">
                or click to browse your device
              </p>
              <span className="mt-5 inline-block rounded-full bg-white/10 px-4 py-2 text-sm">
                Files, folders, images & more
              </span>
            </div>
          </div>
          {files.length > 0 && (
            <div className="mt-5">
              <div className="mb-3 flex items-center justify-between text-sm text-slate-400">
                <span>
                  {files.length} files selected ·{" "}
                  {fmt(files.reduce((a, b) => a + b.size, 0))}
                </span>
                <button
                  onClick={() => setFiles([])}
                  className="hover:text-white"
                >
                  Clear all
                </button>
              </div>
              <div className="space-y-2">
                {files.map((f, i) => (
                  <FileRow
                    key={i}
                    file={f}
                    action={() => setFiles(files.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
        <aside className="glass rounded-[28px] p-6">
          <p className="text-sm font-medium text-slate-300">
            Your sharing code
          </p>
          <div className="mt-2 flex items-center gap-2">
            <strong className="text-4xl tracking-[.14em]">{code.slice(0, 3)} {code.slice(3)}</strong>
            <button
              onClick={() => navigator.clipboard?.writeText(code)}
              className="rounded-lg p-2 text-slate-400 hover:bg-white/10"
            >
              <Copy size={17} />
            </button>
          </div>
          <div className="my-6 flex justify-center rounded-2xl bg-white p-4">
            <QRCodeSVG
              value={shareUrl}
              size={144}
              fgColor="#06101e"
            />
          </div>
          <p className="text-center text-sm text-slate-400">
            Scan with your phone to connect
          </p>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(shareUrl); setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-3 text-sm hover:bg-white/15"
          >
            {copied ? (
              <>
                <Check size={16} className="text-emerald-300" />
                Link copied
              </>
            ) : (
              <>
                <Link2 size={16} />
                Copy share link
              </>
            )}
          </button>
          <div className="mt-6 rounded-2xl border border-blue-300/10 bg-blue-400/5 p-4">
            <div className="flex items-center gap-2 text-sm">
              <LoaderCircle className="animate-spin text-blue-300" size={16} />
              {session.connected ? "Connected to receiver" : session.status}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Keep this page open while pairing.
            </p>
            {!session.connected && (
              <button
                onClick={() => session.connect(code, true)}
                className="mt-3 text-xs text-blue-300"
              >
                Demo: simulate connection →
              </button>
            )}
            {session.connected && (
              <button
                onClick={() => { session.send(rawFiles); go("transfer"); }}
                className="mt-3 text-xs text-blue-300"
              >
                Open transfer dashboard →
              </button>
            )}
          </div>
        </aside>
      </div>
    </Page>
  );
}
function Receive({
  go,
  session,
  initialCode,
}: {
  go: (s: Screen) => void;
  session: Session;
  initialCode: string;
}) {
  const [code, setCode] = useState(initialCode);
  useEffect(() => setCode(initialCode), [initialCode]);
  return (
    <Page>
      <Top
        title="Receive files"
        text="Connect to a nearby device securely, then choose exactly what to receive."
      />
      <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-3">
        <Method
          icon={ScanLine}
          title="Scan QR code"
          text="Open your camera and point it at the sender’s code."
          button="Open camera"
          onClick={() => session.connect(code, false)}
        />
        <div className="glass rounded-[28px] p-6">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-400/15 text-blue-300">
            <Code2 size={21} />
          </span>
          <h3 className="mt-5 font-medium">Enter pairing code</h3>
          <p className="mt-2 min-h-10 text-sm leading-5 text-slate-400">
            Type the six-digit code shown on the sending device.
          </p>
          <input
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="000 000"
            className="mt-5 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-center tracking-[.28em] outline-none placeholder:text-slate-600 focus:border-blue-400"
          />
          <button
            onClick={() => session.connect(code, false)}
            className="mt-3 w-full rounded-xl bg-white py-3 text-sm font-semibold text-slate-950"
          >
            Connect
          </button>
        </div>
        <Method
          icon={Clipboard}
          title="Paste share link"
          text="Got a link from another device? Paste it here to pair."
          button="Paste link"
          onClick={() => navigator.clipboard.readText().then(text => { setCode(text.replace(/\D/g, "").slice(0, 6)); })}
        />
      </div>
      <div className="mx-auto mt-5 max-w-4xl text-center text-sm text-slate-400">{session.status}{session.error && <p className="mt-2 rounded-xl bg-red-400/15 px-4 py-3 text-red-100">{session.error}</p>}</div>
      {session.connected && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass mx-auto mt-8 max-w-4xl rounded-[28px] p-6 sm:flex sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-300 to-blue-600">
              <Laptop />
            </span>
            <div>
              <span className="flex items-center gap-1 text-sm text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Secure connection established
              </span>
              <h3 className="mt-1 font-medium">
                Tanishq’s MacBook Pro wants to send 3 files
              </h3>
              <p className="text-sm text-slate-400">
                52.4 MB · End-to-end encrypted
              </p>
            </div>
          </div>
          <div className="mt-5 flex gap-2 sm:mt-0">
            <button
              className="rounded-xl bg-white/10 px-4 py-2.5 text-sm"
              onClick={() => window.location.reload()}
            >
              Reject
            </button>
            <button
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950"
              onClick={() => go("transfer")}
            >
              Accept files
            </button>
          </div>
        </motion.div>
      )}
    </Page>
  );
}
function Method({
  icon: Icon,
  title,
  text,
  button,
  onClick,
}: {
  icon: any;
  title: string;
  text: string;
  button: string;
  onClick: () => void;
}) {
  return (
    <div className="glass rounded-[28px] p-6">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-400/15 text-blue-300">
        <Icon size={21} />
      </span>
      <h3 className="mt-5 font-medium">{title}</h3>
      <p className="mt-2 min-h-10 text-sm leading-5 text-slate-400">{text}</p>
      <button
        onClick={onClick}
        className="mt-5 w-full rounded-xl bg-white/10 py-3 text-sm hover:bg-white/15"
      >
        {button}
      </button>
    </div>
  );
}

function Transfer({
  go,
  files,
  session,
}: {
  go: (s: Screen) => void;
  files: TransferFile[];
  session: Session;
}) {
  const items = session.received.length ? session.received : files.map(file => ({ ...file, progress: session.progress }));
  const avg = session.received.length ? Math.round(items.reduce((a, b) => a + b.progress, 0) / items.length) : session.progress;
  return (
    <Page>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <Top
          title="Transfer in progress"
          text="Sending directly to Arun’s iPhone · encrypted end to end"
        />
        <div className="flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Peer-to-peer connected
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
        <section className="glass overflow-hidden rounded-[28px]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <h3 className="font-medium">
                {items.length} files · {fmt(items.reduce((a, b) => a + b.size, 0))}
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                {avg}% complete · live transfer
              </p>
            </div>
            <span className="text-xs text-slate-400">Live progress</span>
          </div>
          <div className="p-3">
            {items.map((f, i) => (
              <FileRow
                key={i}
                file={f}
                transfer
                action={() => undefined}
              />
            ))}
          </div>
        </section>
        <aside className="glass rounded-[28px] p-6">
          <div
            className="mx-auto grid h-44 w-44 place-items-center rounded-full ring"
            style={{ "--p": `${avg * 3.6}deg` } as React.CSSProperties}
          >
            <div className="grid h-[134px] w-[134px] place-items-center rounded-full bg-[#0b1b31]">
              <div className="text-center">
                <strong className="text-3xl">{avg}%</strong>
                <p className="mt-1 text-xs text-slate-400">transferred</p>
              </div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Metric label="Connection" value={session.connected ? "Secure" : "Closed"} />
            <Metric label="Status" value={avg === 100 ? "Complete" : "Sending"} />
          </div>
          <div className="mt-5 rounded-2xl bg-blue-400/10 p-4 text-sm text-blue-100">
            <ShieldCheck className="mb-2 text-blue-300" size={18} />
            Verifying file integrity as each file completes.
          </div>
          <button
            onClick={() => go("history")}
            className="mt-4 w-full rounded-xl bg-white py-3 text-sm font-semibold text-slate-950"
          >
            View completed transfers
          </button>
        </aside>
      </div>
    </Page>
  );
}
function FileRow({
  file,
  action,
  transfer,
  pause,
}: {
  file: TransferFile;
  action: () => void;
  transfer?: boolean;
  pause?: boolean;
}) {
  const I =
    file.kind === "image"
      ? FileImage
      : file.kind === "pdf"
        ? FileText
        : file.kind === "code"
          ? Code2
          : File;
  return (
    <div className="flex items-center gap-3 rounded-2xl p-3 hover:bg-white/[.045]">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-400/12 text-blue-300">
        <I size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <span className="shrink-0 text-xs text-slate-400">
            {transfer
              ? `${file.progress}% · ${fmt(file.size)}`
              : fmt(file.size)}
          </span>
        </div>
        {transfer && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-400 to-sky-200"
              style={{ width: `${file.progress}%` }}
            />
          </div>
        )}
      </div>
      <button
        onClick={action}
        className="rounded-lg p-2 text-slate-500 hover:bg-white/10 hover:text-white"
      >
        {transfer ? <X size={16} /> : <X size={16} />}
      </button>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[.06] p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
function SettingsPage({
  device,
  setDevice,
  theme,
  setTheme,
}: {
  device: string;
  setDevice: (x: string) => void;
  theme: string;
  setTheme: (x: string) => void;
}) {
  return (
    <Page>
      <Top
        title="Settings"
        text="Make DropLink feel at home on your devices."
      />
      <div className="mx-auto max-w-3xl space-y-4">
        <Panel title="Your device">
          <label className="text-sm text-slate-400">Device name</label>
          <div className="mt-2 flex gap-2">
            <input
              value={device}
              onChange={(e) => setDevice(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-blue-400"
            />
            <button className="rounded-xl bg-white px-4 text-sm font-semibold text-slate-950">
              Save
            </button>
          </div>
        </Panel>
        <Panel title="Appearance">
          <div className="flex gap-2">
            {["Dark", "Light", "System"].map((x) => (
              <button
                key={x}
                onClick={() => setTheme(x)}
                className={`rounded-xl px-4 py-2.5 text-sm ${theme === x ? "bg-blue-500 text-white" : "bg-white/7 text-slate-300"}`}
              >
                {x}
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Transfer preferences">
          <Setting title="Download folder" value="Ask every time" />
          <Setting title="Chunk size" value="256 KB · Balanced" />
          <Setting title="Connection quality" value="Excellent · 34 ms" good />
        </Panel>
        <Panel title="Privacy">
          <p className="text-sm leading-6 text-slate-400">
            Transfer history is stored only in this browser. Clearing it cannot
            affect files on your devices.
          </p>
          <button className="mt-4 rounded-xl border border-red-300/20 bg-red-400/10 px-4 py-2.5 text-sm text-red-200">
            Clear transfer history
          </button>
        </Panel>
      </div>
    </Page>
  );
}
function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass rounded-[26px] p-6">
      <h3 className="mb-5 font-medium">{title}</h3>
      {children}
    </section>
  );
}
function Setting({
  title,
  value,
  good,
}: {
  title: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-t border-white/10 py-4 first:border-0 first:pt-0">
      <span className="text-sm">{title}</span>
      <span
        className={`text-sm ${good ? "text-emerald-300" : "text-slate-400"}`}
      >
        {value} <ChevronRight className="ml-1 inline" size={15} />
      </span>
    </div>
  );
}
function HistoryPage() {
  const rows = [
    ["Today, 10:42 AM", "Arun’s iPhone", "3 files", "52.4 MB"],
    ["Yesterday, 8:15 PM", "Tanishq’s MacBook Pro", "project.zip", "18.6 MB"],
    ["Sep 10, 9:30 AM", "Arun’s iPhone", "notes.pdf", "2.4 MB"],
  ];
  return (
    <Page>
      <Top
        title="Transfer history"
        text="A private local record of files sent and received on this browser."
      />
      <section className="glass mx-auto max-w-4xl overflow-hidden rounded-[28px]">
        <div className="flex items-center justify-between border-b border-white/10 p-6">
          <span className="text-sm text-slate-400">Recent transfers</span>
          <button className="text-sm text-slate-400 hover:text-white">
            Clear history
          </button>
        </div>
        {rows.map((r) => (
          <div
            key={r[0] as string}
            className="flex items-center gap-4 border-b border-white/10 p-5 last:border-0"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
              <Check size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{r[2]}</p>
              <p className="mt-1 text-xs text-slate-400">
                To {r[1]} · {r[0]}
              </p>
            </div>
            <span className="text-sm text-slate-400">{r[3]}</span>
            <button className="p-2 text-slate-400">
              <MoreHorizontal size={18} />
            </button>
          </div>
        ))}
      </section>
    </Page>
  );
}
function Top({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-4xl font-semibold tracking-[-.04em] sm:text-5xl">
        {title}
      </h1>
      <p className="mt-3 text-slate-300">{text}</p>
    </div>
  );
}
