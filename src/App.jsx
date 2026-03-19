import { useState, useEffect, useRef, useCallback } from "react";

// ── Proxmox REST API Client ──────────────────────────────────────────────────
class PveAPI {
  constructor(cfg) {
    this.target  = `${cfg.host}:${cfg.apiPort||8006}`;
    this.base    = `/pve-api`;
    this.node    = cfg.node || "pve";
    this.mode    = cfg.authMode || "token";
    this.tokenId = cfg.tokenId || "";
    this.secret  = cfg.secret  || "";
    this.user    = cfg.user    || "root@pam";
    this.password= cfg.password|| "";
    this.ticket  = null;
    this.csrf    = null;
  }
  headers(isForm) {
    const base = { "X-PVE-Target": this.target };
    if (this.mode === "token") return { ...base, "Authorization":`PVEAPIToken=${this.tokenId}=${this.secret}`, ...(isForm?{}:{"Content-Type":"application/json"}) };
    const h = { ...base, ...(isForm ? {} : { "Content-Type":"application/json" }) };
    if (this.ticket) { h["Cookie"]=`PVEAuthCookie=${this.ticket}`; h["CSRFPreventionToken"]=this.csrf; }
    return h;
  }
  async login() {
    if (this.mode==="token") return true;
    const r = await fetch(`${this.base}/access/ticket`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","X-PVE-Target":this.target},body:new URLSearchParams({username:this.user,password:this.password})});
    const j = await r.json();
    if (j?.data) { this.ticket=j.data.ticket; this.csrf=j.data.CSRFPreventionToken; return true; }
    return false;
  }
  async req(method, path, body) {
    const isForm = method==="POST"&&typeof body==="object"&&!(body instanceof FormData);
    const opts = { method, headers: this.headers(isForm) };
    if (body) opts.body = isForm ? new URLSearchParams(body) : JSON.stringify(body);
    if (isForm) opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
    const r = await fetch(this.base+path, opts);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }
  get(p)       { return this.req("GET",   p); }
  post(p,b)    { return this.req("POST",  p, b||{}); }
  del(p)       { return this.req("DELETE",p); }
  nodeStatus() { return this.get(`/nodes/${this.node}/status`); }
  storages()   { return this.get(`/nodes/${this.node}/storage`); }
  containers() { return this.get(`/nodes/${this.node}/lxc`); }
  ctStatus(v)  { return this.get(`/nodes/${this.node}/lxc/${v}/status/current`); }
  ctConfig(v)  { return this.get(`/nodes/${this.node}/lxc/${v}/config`); }
  ctStart(v)   { return this.post(`/nodes/${this.node}/lxc/${v}/status/start`); }
  ctStop(v)    { return this.post(`/nodes/${this.node}/lxc/${v}/status/stop`); }
  ctRestart(v) { return this.post(`/nodes/${this.node}/lxc/${v}/status/reboot`); }
  ctDestroy(v) { return this.del(`/nodes/${this.node}/lxc/${v}`); }
  ctCreate(p)  { return this.post(`/nodes/${this.node}/lxc`, p); }
  taskStatus(u){ return this.get(`/nodes/${this.node}/tasks/${encodeURIComponent(u)}/status`); }
}

async function waitTask(api, upid, onLog) {
  for (let i=0; i<120; i++) {
    await new Promise(r=>setTimeout(r,2000));
    try { const t=await api.taskStatus(upid); if(t?.data?.status==="stopped") return t.data.exitstatus==="OK"; if(onLog&&t?.data?.status) onLog(t.data.status); } catch{}
  }
  return false;
}

// ── Services & Defaults ──────────────────────────────────────────────────────
const DEFAULT_SERVICES = [
  { id:"sonarr",       name:"Sonarr",       icon:"📺", port:8989,  enabled:true,  mediaPath:"/media/tv",     configPath:"/config/sonarr",        apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2000, cores:1, mem:512,  disk:4,  ip:"", gw:"", deployMode:"oci", ociImage:"lscr.io/linuxserver/sonarr:latest" },
  { id:"radarr",       name:"Radarr",       icon:"🎬", port:7878,  enabled:true,  mediaPath:"/media/movies", configPath:"/config/radarr",        apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2001, cores:1, mem:512,  disk:4,  ip:"", gw:"", deployMode:"oci", ociImage:"lscr.io/linuxserver/radarr:latest" },
  { id:"lidarr",       name:"Lidarr",       icon:"🎵", port:8686,  enabled:false, mediaPath:"/media/music",  configPath:"/config/lidarr",        apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2002, cores:1, mem:512,  disk:4,  ip:"", gw:"", deployMode:"oci", ociImage:"lscr.io/linuxserver/lidarr:latest" },
  { id:"whisparr",     name:"Whisparr",     icon:"🔞", port:6969,  enabled:false, mediaPath:"/media/xxx",    configPath:"/config/whisparr",      apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2003, cores:1, mem:512,  disk:4,  ip:"", gw:"", deployMode:"oci", ociImage:"ghcr.io/hotio/whisparr:v3" },
  { id:"prowlarr",     name:"Prowlarr",     icon:"🔍", port:9696,  enabled:true,  mediaPath:"",              configPath:"/config/prowlarr",      apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2004, cores:1, mem:256,  disk:2,  ip:"", gw:"", deployMode:"oci", ociImage:"lscr.io/linuxserver/prowlarr:latest" },
  { id:"jackett",      name:"Jackett",      icon:"🧥", port:9117,  enabled:false, mediaPath:"",              configPath:"/config/jackett",       apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2005, cores:1, mem:256,  disk:2,  ip:"", gw:"", deployMode:"oci", ociImage:"lscr.io/linuxserver/jackett:latest" },
  { id:"nzbhydra2",    name:"NZBHydra2",    icon:"🐙", port:5076,  enabled:false, mediaPath:"",              configPath:"/config/nzbhydra2",     apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2006, cores:1, mem:256,  disk:2,  ip:"", gw:"", deployMode:"oci", ociImage:"lscr.io/linuxserver/nzbhydra2:latest" },
  { id:"recyclarr",    name:"Recyclarr",    icon:"♻️", port:0,     enabled:false, mediaPath:"",              configPath:"/config/recyclarr",     apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2007, cores:1, mem:128,  disk:2,  ip:"", gw:"", deployMode:"oci", ociImage:"ghcr.io/recyclarr/recyclarr:latest" },
  { id:"qbittorrent",  name:"qBittorrent",  icon:"⬇️", port:8080,  enabled:true,  mediaPath:"/downloads",    configPath:"/config/qbittorrent",   apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2008, cores:2, mem:1024, disk:8,  ip:"", gw:"", deployMode:"oci", ociImage:"lscr.io/linuxserver/qbittorrent:latest" },
  { id:"sabnzbd",      name:"SABnzbd",      icon:"📡", port:8090,  enabled:false, mediaPath:"/downloads",    configPath:"/config/sabnzbd",       apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2009, cores:1, mem:512,  disk:4,  ip:"", gw:"", deployMode:"oci", ociImage:"lscr.io/linuxserver/sabnzbd:latest" },
  { id:"netnzb",       name:"NetNZB",       icon:"📰", port:5076,  enabled:false, mediaPath:"/downloads",    configPath:"/config/netnzb",        apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2010, cores:1, mem:256,  disk:2,  ip:"", gw:"", deployMode:"oci", ociImage:"ghcr.io/netnzb/netnzb:latest" },
  { id:"flaresolverr", name:"FlareSolverr", icon:"🔓", port:8191,  enabled:false, mediaPath:"",              configPath:"",                      apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2011, cores:1, mem:256,  disk:2,  ip:"", gw:"", deployMode:"oci", ociImage:"ghcr.io/flaresolverr/flaresolverr:latest" },
  { id:"plex",         name:"Plex",         icon:"🟡", port:32400, enabled:false, mediaPath:"/media",        configPath:"/config/plex",          apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2012, cores:2, mem:2048, disk:8,  ip:"", gw:"", deployMode:"oci", ociImage:"lscr.io/linuxserver/plex:latest" },
  { id:"jellyfin",     name:"Jellyfin",     icon:"🍇", port:8096,  enabled:false, mediaPath:"/media",        configPath:"/config/jellyfin",      apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2013, cores:2, mem:2048, disk:8,  ip:"", gw:"", deployMode:"oci", ociImage:"lscr.io/linuxserver/jellyfin:latest" },
  { id:"bazarr",       name:"Bazarr",       icon:"💬", port:6767,  enabled:false, mediaPath:"/media",        configPath:"/config/bazarr",        apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2014, cores:1, mem:256,  disk:2,  ip:"", gw:"", deployMode:"oci", ociImage:"lscr.io/linuxserver/bazarr:latest" },
  { id:"overseerr",    name:"Overseerr",    icon:"🎟️", port:5055,  enabled:false, mediaPath:"",              configPath:"/config/overseerr",     apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2015, cores:1, mem:512,  disk:4,  ip:"", gw:"", deployMode:"oci", ociImage:"lscr.io/linuxserver/overseerr:latest" },
  { id:"tautulli",     name:"Tautulli",     icon:"📊", port:8181,  enabled:false, mediaPath:"",              configPath:"/config/tautulli",      apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2016, cores:1, mem:256,  disk:2,  ip:"", gw:"", deployMode:"oci", ociImage:"lscr.io/linuxserver/tautulli:latest" },
  { id:"mylar3",       name:"Mylar3",       icon:"📰", port:8090,  enabled:false, mediaPath:"/media/comics", configPath:"/config/mylar3",        apiKey:"", restartPolicy:"unless-stopped", startOnBoot:true, vmid:2017, cores:1, mem:256,  disk:2,  ip:"", gw:"", deployMode:"oci", ociImage:"lscr.io/linuxserver/mylar3:latest" },
];

const RESTART_POLICIES = ["no","always","on-failure","unless-stopped"];
const NETWORK_DRIVERS  = ["bridge","host","overlay","macvlan"];
const PVE_STORAGE_OPTS = ["local-lvm","local","local-zfs","ceph","nfs"];

const DEFAULT_NETWORK = { name:"arr-network", driver:"bridge", subnet:"172.20.0.0/16", gateway:"172.20.0.1", enableIPv6:false, internal:false };
const DEFAULT_VOLUMES = { baseConfigPath:"/opt/arr/config", baseMediaPath:"/mnt/media", baseDownloadPath:"/mnt/downloads", puid:"1000", pgid:"1000", tz:"Europe/Berlin" };
const DEFAULT_PVE     = { node:"netcup", bridge:"vmbr1", storage:"netcup-data", osTemplate:"local:vztmpl/debian-13-standard_13.1-2_amd64.tar.zst", defaultGw:"10.10.10.1", subnetCidr:"24", nameserver:"1.1.1.1", unprivileged:true, startOnBoot:true, osType:"debian", vmidRangeFrom:2000, vmidRangeTo:3000 };
const DEFAULT_API     = { host:"netcup.acidhosting.de", apiPort:"8006", authMode:"token", tokenId:"root@pam!proxarr", secret:"ff9aaab8-644e-4564-8fd8-3de00dbc417a", user:"root@pam", password:"" };

// ── VMID helpers ─────────────────────────────────────────────────────────────
function assignVmidsFromRange(svcs, from, to) {
  const used = new Set();
  return svcs.map(svc => {
    const ok = svc.vmid>=from && svc.vmid<=to && !used.has(svc.vmid);
    if (ok) { used.add(svc.vmid); return svc; }
    let next=from; while(used.has(next)&&next<=to) next++;
    if (next>to) { used.add(svc.vmid); return svc; }
    used.add(next); return {...svc, vmid:next};
  });
}
function resolveVmid(svc, allSvcs, from, to) {
  const used = new Set(allSvcs.filter(s=>s.id!==svc.id).map(s=>s.vmid));
  if (svc.vmid>=from && svc.vmid<=to && !used.has(svc.vmid)) return svc.vmid;
  for (let id=from; id<=to; id++) if(!used.has(id)) return id;
  return svc.vmid;
}

// ── Create params ─────────────────────────────────────────────────────────────
function buildCreateParams(svc, pve, volumes) {
  const ip    = svc.ip ? `ip=${svc.ip}/${pve.subnetCidr},gw=${svc.gw||pve.defaultGw}` : "ip=dhcp";
  const hasDl = ["qbittorrent","sabnzbd","nzbget"].includes(svc.id);
  const isOCI = svc.deployMode==="oci";
  const p = {
    vmid:        svc.vmid,
    ostemplate:  isOCI ? svc.ociImage : pve.osTemplate,
    hostname:    svc.id,
    cores:       svc.cores,
    memory:      svc.mem,
    swap:        128,
    storage:     pve.storage,
    rootfs:      `${pve.storage}:${svc.disk}`,
    net0:        `name=eth0,bridge=${pve.bridge},${ip}`,
    nameserver:  pve.nameserver,
    features:    "nesting=1",
    onboot:      (svc.startOnBoot??pve.startOnBoot) ? 1 : 0,
    start:       0,
    unprivileged:pve.unprivileged ? 1 : 0,
  };
  if (isOCI) { p.arch="amd64"; p.ostype="unmanaged"; }
  else        p.ostype = pve.osType;
  // Bind mount points – extracted separately (API tokens can't set bind mounts)
  const mounts = {};
  mounts.mp0 = `${volumes.baseConfigPath}/${svc.id},mp=/config`;
  if (svc.mediaPath) mounts.mp1 = `${volumes.baseMediaPath},mp=/data`;
  if (hasDl)         mounts.mp2 = `${volumes.baseDownloadPath},mp=/downloads`;
  const envs = [`PUID=1000`,`PGID=1000`,`TZ=${volumes.tz}`,svc.apiKey?`API_KEY=${svc.apiKey}`:null].filter(Boolean);
  p.description = envs.join("\n");
  p.tags = [svc.id, isOCI?"oci":"lxc", "arr-tool"].join(";");
  return { params: p, mounts };
}

// ── pct create string (for display only) ─────────────────────────────────────
function pctCreateStr(svc, pve, volumes) {
  const { params, mounts } = buildCreateParams(svc, pve, volumes);
  const all = { ...params, ...mounts };
  return Object.entries(all).map(([k,v])=>`  --${k} ${v}`).join(" \\\n").replace(/^  /,"pct create ");
}

// ── Styles ───────────────────────────────────────────────────────────────────
const st = {
  app:   { minHeight:"100vh", background:"#0f1117", color:"#e2e8f0", fontFamily:"'Inter',system-ui,sans-serif" },
  hdr:   { background:"#161b27", borderBottom:"1px solid #ffffff11", padding:"16px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 },
  title: { fontSize:20, fontWeight:700, color:"#fff", margin:0 },
  tabs:  { display:"flex", gap:4, padding:"16px 24px 0", background:"#161b27", flexWrap:"wrap" },
  tab:   a=>({ padding:"8px 13px", borderRadius:"8px 8px 0 0", border:"1px solid "+(a?"#3b82f6":"#ffffff11"), borderBottom:a?"1px solid #161b27":"1px solid #ffffff11", background:a?"#1e3a5f":"transparent", color:a?"#60a5fa":"#94a3b8", cursor:"pointer", fontSize:13, fontWeight:500 }),
  body:  { padding:"clamp(10px,3vw,24px)" },
  card:  { background:"#161b27", border:"1px solid #ffffff11", borderRadius:12, padding:18, marginBottom:10 },
  row:   { display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 },
  btn:   c=>({ background:c+"22", border:`1px solid ${c}44`, color:c, borderRadius:6, padding:"5px 11px", cursor:"pointer", fontSize:12, fontWeight:600, whiteSpace:"nowrap" }),
  inp:   { background:"#0f1117", border:"1px solid #ffffff22", borderRadius:6, color:"#e2e8f0", padding:"7px 11px", fontSize:13, width:"100%", outline:"none", boxSizing:"border-box" },
  lbl:   { fontSize:11, color:"#64748b", marginBottom:4, display:"block", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em" },
  modal: { position:"fixed", inset:0, background:"#000000bb", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:24 },
  mbox:  { background:"#161b27", border:"1px solid #ffffff22", borderRadius:14, padding:28, width:"100%", maxWidth:520, maxHeight:"90vh", overflowY:"auto" },
  pre:   { background:"#0a0e17", border:"1px solid #ffffff0f", borderRadius:8, padding:16, fontSize:12, color:"#a5f3fc", overflowX:"auto", lineHeight:1.75, margin:0, whiteSpace:"pre-wrap", wordBreak:"break-all" },
  tgl:   on=>({ width:36, height:20, borderRadius:10, background:on?"#3b82f6":"#334155", border:"none", cursor:"pointer", position:"relative", flexShrink:0, outline:"none" }),
  stat:  { background:"#1e293b", borderRadius:10, padding:"14px 16px", textAlign:"center", flex:1, minWidth:90 },
  sname: { fontWeight:600, fontSize:15, color:"#f1f5f9", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" },
  sec:   { fontSize:12, fontWeight:700, color:"#60a5fa", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:14, marginTop:4 },
  bdg:   c=>({ fontSize:10, color:c, background:c+"22", border:`1px solid ${c}44`, padding:"2px 8px", borderRadius:20, fontWeight:600 }),
  term:  { background:"#0a0e17", border:"1px solid #22c55e33", borderRadius:10, fontFamily:"monospace", fontSize:12, color:"#d4d4d4", overflowY:"auto", padding:"14px 16px", lineHeight:1.7, whiteSpace:"pre-wrap", wordBreak:"break-all" },
};

function CopyBtn({ text, label="Kopieren" }) {
  const [ok,setOk]=useState(false);
  return <button onClick={()=>{navigator.clipboard.writeText(text);setOk(true);setTimeout(()=>setOk(false),2000);}} style={{background:ok?"#22c55e22":"#ffffff11",border:`1px solid ${ok?"#22c55e":"#ffffff22"}`,color:ok?"#22c55e":"#aaa",borderRadius:6,padding:"6px 14px",cursor:"pointer",fontSize:12,whiteSpace:"nowrap"}}>{ok?"✓ Kopiert!":label}</button>;
}
function Toggle({ value, onChange }) {
  return <button style={st.tgl(value)} onClick={()=>onChange(!value)}><span style={{position:"absolute",top:3,left:value?18:3,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/></button>;
}
function CodeBlock({ code, title }) {
  return (
    <div style={{marginBottom:14}}>
      <div style={{...st.row,marginBottom:8}}>{title&&<span style={{fontSize:12,color:"#64748b"}}>{title}</span>}<CopyBtn text={code}/></div>
      <pre style={st.pre}>{code}</pre>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [services,    setServices]   = useState(DEFAULT_SERVICES);
  const [network,     setNetwork]    = useState(DEFAULT_NETWORK);
  const [volumes,     setVolumes]    = useState(DEFAULT_VOLUMES);
  const [pve,         setPve]        = useState(DEFAULT_PVE);
  const [pveApi,      setPveApi]     = useState(DEFAULT_API);
  const [tab,         setTab]        = useState("config");
  const [lxcSub,      setLxcSub]    = useState("global");
  const [selSvc,      setSelSvc]    = useState(null);
  const [editId,      setEditId]    = useState(null);
  const [editBuf,     setEditBuf]   = useState({});
  const [saveState,   setSaveState] = useState("idle");
  const [deploying,   setDeploying] = useState({});
  const [destroying,  setDestroying]= useState({});
  const [lxcStatus,   setLxcStatus] = useState({});
  const [apiStatus,   setApiStatus] = useState("disconnected");
  const [apiLog,      setApiLog]    = useState([]);
  const [storageList, setStorageList]=useState(PVE_STORAGE_OPTS);
  const [volOpen,     setVolOpen]   = useState(false);
  const [pveOpen,     setPveOpen]   = useState(false);
  const [apiOpen,     setApiOpen]   = useState(true);
  const [vmidWarnings,setVmidWarnings]=useState({});
  const apiRef = useRef(null);
  const logRef = useRef(null);

  useEffect(()=>{ if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight; },[apiLog]);

  const log = useCallback((msg,type="info")=>{
    const color = type==="err"?"#f87171":type==="ok"?"#22c55e":type==="warn"?"#f59e0b":"#60a5fa";
    setApiLog(p=>[...p,{msg,color,ts:new Date().toLocaleTimeString()}]);
  },[]);

  // ── VMID validation ──
  useEffect(()=>{
    const {vmidRangeFrom:from,vmidRangeTo:to}=pve;
    const w={},seen=new Set();
    services.filter(s=>s.enabled).forEach(svc=>{
      if(svc.vmid<from||svc.vmid>to) w[svc.id]=`VMID ${svc.vmid} außerhalb ${from}–${to}`;
      else if(seen.has(svc.vmid)) w[svc.id]=`VMID ${svc.vmid} doppelt`;
      else seen.add(svc.vmid);
    });
    setVmidWarnings(w);
  },[services,pve.vmidRangeFrom,pve.vmidRangeTo]);

  // ── Persist ──
  const handleSave = ()=>{
    try{ const s=JSON.stringify({services,network,volumes,pve,pveApi}); try{window.storage?.set("arr-tool-config",s);}catch{} localStorage.setItem("arr-tool-config",s); setSaveState("saved"); }catch{ setSaveState("error"); }
    setTimeout(()=>setSaveState("idle"),2500);
  };
  const handleLoad = ()=>{
    try{
      let raw=null;
      try{ window.storage?.get("arr-tool-config").then(r=>{ if(r?.value) applyConfig(JSON.parse(r.value)); }); }catch{}
      raw=localStorage.getItem("arr-tool-config");
      if(raw) applyConfig(JSON.parse(raw));
    }catch{}
  };
  const applyConfig = d=>{
    if(d.services) setServices(d.services);
    if(d.network)  setNetwork(d.network);
    if(d.volumes)  setVolumes(d.volumes);
    if(d.pve)      setPve(d.pve);
    if(d.pveApi)   setPveApi(d.pveApi);
  };
  useState(()=>{ handleLoad(); });

  // ── API ──
  const connectApi = async()=>{
    if(!pveApi.host){ log("Bitte Host eingeben","err"); return; }
    setApiStatus("connecting"); log(`Verbinde mit https://${pveApi.host}:${pveApi.apiPort}…`);
    try{
      const api=new PveAPI({...pveApi,node:pve.node});
      if(pveApi.authMode==="password"){ const ok=await api.login(); if(!ok) throw new Error("Login fehlgeschlagen"); log("🔑 Ticket erhalten","ok"); }
      const ns=await api.nodeStatus();
      if(!ns?.data) throw new Error("Keine Antwort");
      apiRef.current=api;
      setApiStatus("connected");
      log(`✅ Verbunden – ${pve.node}, PVE ${ns.data.pveversion||""}`, "ok");
      const st=await api.storages().catch(()=>null);
      if(st?.data){ const l=st.data.map(s=>s.storage); setStorageList(l); }
      fetchAllStatus(api);
    }catch(e){
      setApiStatus("error");
      log(`❌ ${e.message}`,"err");
      if(e.message.includes("fetch")||e.message.includes("Network"))
        log(`💡 Self-signed Zertifikat? Öffne https://${pveApi.host}:${pveApi.apiPort} im Browser und akzeptiere es einmalig.`,"warn");
    }
  };

  const disconnectApi = ()=>{ apiRef.current=null; setApiStatus("disconnected"); setLxcStatus({}); log("Verbindung getrennt"); };

  const fetchAllStatus = async(api)=>{
    const a=api||apiRef.current; if(!a) return;
    await Promise.all(services.filter(s=>s.enabled).map(async svc=>{
      try{
        setLxcStatus(p=>({...p,[svc.id]:{...p[svc.id],loading:true}}));
        const [sr,cr]=await Promise.all([a.ctStatus(svc.vmid).catch(()=>null),a.ctConfig(svc.vmid).catch(()=>null)]);
        const sd=sr?.data, cd=cr?.data;
        if(!sd&&!cd){ setLxcStatus(p=>({...p,[svc.id]:{loading:false,error:true,online:false}})); return; }
        const ipM=(cd?.net0||"").match(/ip=([^/,]+)/);
        setLxcStatus(p=>({...p,[svc.id]:{
          loading:false, error:false,
          online:sd?.status==="running", status:sd?.status||"unknown",
          cores:cd?.cores||"—", mem:cd?.memory||"—",
          disk:cd?.rootfs?.match(/size=([^,]+)/)?.[1]||"—",
          ip:ipM?.[1]||"DHCP",
          cpu:sd?.cpu!=null?(sd.cpu*100).toFixed(1)+"%":null,
          memUsed:sd?.mem&&sd?.maxmem?Math.round(sd.mem/1024/1024)+"MB / "+Math.round(sd.maxmem/1024/1024)+"MB":null,
        }}));
      }catch{ setLxcStatus(p=>({...p,[svc.id]:{loading:false,error:true,online:false}})); }
    }));
  };

  const ctAction = async(svc,action)=>{
    const a=apiRef.current; if(!a) return;
    log(`${action} ${svc.name} (VMID ${svc.vmid})…`);
    try{
      if(action==="start")   await a.ctStart(svc.vmid);
      if(action==="stop")    await a.ctStop(svc.vmid);
      if(action==="restart") await a.ctRestart(svc.vmid);
      log(`✅ ${svc.name} ${action}`,"ok");
      setTimeout(()=>fetchAllStatus(),3000);
    }catch(e){ log(`❌ ${e.message}`,"err"); }
  };

  const deployServiceApi = async(svc)=>{
    const a=apiRef.current; if(!a) return;
    const vmid=resolveVmid(svc,services,pve.vmidRangeFrom,pve.vmidRangeTo);
    if(vmid!==svc.vmid){ updateSvc(svc.id,{vmid}); log(`ℹ️ VMID ${svc.vmid} → ${vmid}`,"warn"); }
    const svcR={...svc,vmid};
    setDeploying(p=>({...p,[svc.id]:"running"}));
    try{
      log(`🚀 Deploy ${svc.name} (VMID ${vmid}, ${(svc.deployMode||"oci").toUpperCase()})…`);
      const { params, mounts } = buildCreateParams(svcR,pve,volumes);
      // Step 1: Create container (without bind mounts – API tokens can't set them)
      const res=await a.ctCreate(params);
      const upid=res?.data;
      if(!upid) throw new Error("Kein Task-UPID");
      log(`⏳ Container wird erstellt…`);
      const ok=await waitTask(a,upid,s=>{ if(s) log(s); });
      if(!ok) throw new Error("Container-Erstellung fehlgeschlagen");
      // Step 2: Add bind mounts via local pct set (runs on PVE host)
      if (Object.keys(mounts).length) {
        log(`📁 Bind-Mounts werden gesetzt…`);
        const mpRes = await fetch('/pve-local/pct-mountpoints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vmid, ...mounts })
        });
        if (!mpRes.ok) {
          const err = await mpRes.json().catch(()=>({}));
          log(`⚠️ Bind-Mounts fehlgeschlagen: ${err.error||mpRes.statusText} – Container erstellt aber ohne Mounts`,"warn");
        } else {
          log(`✅ Bind-Mounts gesetzt`);
        }
      }
      // Step 3: Start container
      await a.ctStart(vmid);
      log(`✅ ${svc.name} deployed & gestartet`,"ok");
      setDeploying(p=>({...p,[svc.id]:"done"}));
      setTimeout(()=>fetchAllStatus(),4000);
    }catch(e){
      log(`❌ ${svc.name}: ${e.message}`,"err");
      setDeploying(p=>({...p,[svc.id]:"error"}));
    }
  };

  const destroyServiceApi = async(svc)=>{
    if(!window.confirm(`${svc.name} (VMID ${svc.vmid}) wirklich löschen?`)) return;
    const a=apiRef.current; if(!a) return;
    setDestroying(p=>({...p,[svc.id]:"running"}));
    try{
      log(`🛑 Stoppe ${svc.name}…`);
      await a.ctStop(svc.vmid).catch(()=>{});
      await new Promise(r=>setTimeout(r,3000));
      const res=await a.ctDestroy(svc.vmid);
      const upid=res?.data;
      if(upid) await waitTask(a,upid);
      log(`🗑 ${svc.name} gelöscht`,"ok");
      setDestroying(p=>({...p,[svc.id]:"done"}));
      setLxcStatus(p=>{const n={...p}; delete n[svc.id]; return n;});
    }catch(e){ log(`❌ ${e.message}`,"err"); setDestroying(p=>({...p,[svc.id]:"error"})); }
  };

  const updateSvc  = (id,ch)=>setServices(p=>p.map(s=>s.id===id?{...s,...ch}:s));
  const openEdit   = svc=>{ setEditBuf({...svc}); setEditId(svc.id); };
  const saveEdit   = ()=>{ updateSvc(editId,editBuf); setEditId(null); };
  const enabled    = services.filter(s=>s.enabled);

  const TABS=[["overview","📋 Übersicht"],["config","⚙️ Services"],["lxc","🖥 Proxmox LXC"],["compose","🐳 Compose"]];

  const apiConnected = apiStatus==="connected";

  return (
    <div style={st.app}>
      {/* HEADER */}
      <div style={st.hdr}>
        <h1 style={st.title}>🚀 *arr Deployment Tool</h1>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <span style={st.bdg(apiConnected?"#22c55e":apiStatus==="connecting"?"#f59e0b":apiStatus==="error"?"#ef4444":"#64748b")}>
            {apiConnected?"🟢 API":apiStatus==="connecting"?"⏳ verbindet…":apiStatus==="error"?"🔴 Fehler":"⚫ getrennt"}
          </span>
          {apiConnected&&<span style={{fontSize:12,color:"#475569"}}>{pveApi.host}:{pveApi.apiPort}</span>}
          {Object.keys(vmidWarnings).length>0&&<span style={st.bdg("#ef4444")}>⚠️ {Object.keys(vmidWarnings).length} VMID</span>}
          <span style={{fontSize:13,color:"#64748b"}}>{enabled.length}/{services.length} aktiv</span>
          <button onClick={handleSave} style={{background:saveState==="saved"?"#22c55e22":saveState==="error"?"#ef444422":"#3b82f622",border:`1px solid ${saveState==="saved"?"#22c55e":saveState==="error"?"#ef4444":"#3b82f6"}`,color:saveState==="saved"?"#22c55e":saveState==="error"?"#ef4444":"#60a5fa",borderRadius:8,padding:"6px 16px",cursor:"pointer",fontSize:13,fontWeight:600}}>
            {saveState==="saved"?"✓ Gespeichert!":saveState==="error"?"✗ Fehler":"💾 Speichern"}
          </button>
        </div>
      </div>

      <div style={st.tabs}>{TABS.map(([k,l])=><button key={k} style={st.tab(tab===k)} onClick={()=>setTab(k)}>{l}</button>)}</div>

      <div style={st.body}>

        {/* ── OVERVIEW ── */}
        {tab==="overview"&&<>
          <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
            {[["Aktiv",enabled.length,"#22c55e"],["VMIDs",`${pve.vmidRangeFrom}–${pve.vmidRangeTo}`,"#a78bfa"],["Node",pve.node,"#60a5fa"],["Konflikte",Object.keys(vmidWarnings).length||"✓",Object.keys(vmidWarnings).length?"#ef4444":"#22c55e"]].map(([l,v,c])=>(
              <div key={l} style={st.stat}><div style={{fontSize:20,fontWeight:700,color:c}}>{v}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>{l}</div></div>
            ))}
          </div>
          {services.map(svc=>{
            const ls=lxcStatus[svc.id];
            const sc=ls?.online?"#22c55e":ls?.status==="stopped"?"#ef4444":"#64748b";
            return (
              <div key={svc.id} style={{...st.card,opacity:svc.enabled?1:0.45,borderColor:vmidWarnings[svc.id]?"#ef444444":"#ffffff11"}}>
                <div style={st.row}>
                  <div style={st.sname}>
                    <span style={{fontSize:20}}>{svc.icon}</span>{svc.name}
                    {svc.enabled&&<span style={st.bdg(vmidWarnings[svc.id]?"#ef4444":"#a78bfa")}>VMID {svc.vmid}</span>}
                    {ls&&<span style={{...st.bdg(sc),display:"inline-flex",alignItems:"center",gap:4}}><span style={{width:6,height:6,borderRadius:"50%",background:sc,display:"inline-block"}}/>{ls.loading?"…":ls.status||"—"}</span>}
                    {!svc.enabled&&<span style={{fontSize:10,color:"#475569",background:"#1e293b",padding:"2px 7px",borderRadius:4}}>OFF</span>}
                    {deploying[svc.id]==="running"&&<span style={st.bdg("#f59e0b")}>⏳</span>}
                    {deploying[svc.id]==="done"&&<span style={st.bdg("#22c55e")}>✅</span>}
                  </div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {svc.enabled&&ls?.ip&&ls.ip!=="DHCP"&&<a href={`http://${ls.ip}:${svc.port}`} target="_blank" rel="noreferrer" style={{...st.btn("#60a5fa"),textDecoration:"none"}}>🌐 UI</a>}
                    {svc.enabled&&<><button style={{...st.btn(apiConnected?"#22c55e":"#475569"),opacity:apiConnected?1:0.5}} disabled={!apiConnected} onClick={()=>ctAction(svc,"start")}>▶</button><button style={{...st.btn(apiConnected?"#ef4444":"#475569"),opacity:apiConnected?1:0.5}} disabled={!apiConnected} onClick={()=>ctAction(svc,"stop")}>■</button><button style={{...st.btn(apiConnected?"#f59e0b":"#475569"),opacity:apiConnected?1:0.5}} disabled={!apiConnected} onClick={()=>ctAction(svc,"restart")}>↻</button></>}
                    <button style={st.btn(svc.enabled?"#ef4444":"#22c55e")} onClick={()=>updateSvc(svc.id,{enabled:!svc.enabled})}>{svc.enabled?"OFF":"ON"}</button>
                    {svc.enabled&&<button style={{...st.btn(apiConnected?"#a78bfa":"#475569"),opacity:apiConnected?1:0.5}} disabled={!apiConnected} onClick={()=>deployServiceApi(svc)}>{deploying[svc.id]==="running"?"⏳":"🚀 Deploy"}</button>}
                  </div>
                </div>
                {svc.enabled&&ls&&!ls.loading&&!ls.error&&(
                  <div style={{marginTop:8,display:"flex",gap:16,flexWrap:"wrap"}}>
                    {[["IP",ls.ip],["Cores",ls.cores],["RAM",ls.memUsed||ls.mem+"MB"],["CPU",ls.cpu],["Disk",ls.disk]].filter(([,v])=>v&&v!=="—").map(([k,v])=>(
                      <span key={k} style={{fontSize:12,color:"#64748b"}}>{k}: <span style={{color:"#94a3b8"}}>{v}</span></span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>}

        {/* ── SERVICES ── */}
        {tab==="config"&&<>
          {/* API Panel */}
          <div style={{...st.card,marginBottom:16}}>
            <div style={st.row}>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span style={st.sec}>Proxmox API</span>
                <span style={st.bdg(apiConnected?"#22c55e":apiStatus==="connecting"?"#f59e0b":apiStatus==="error"?"#ef4444":"#64748b")}>
                  {apiConnected?"verbunden":apiStatus==="connecting"?"verbindet…":apiStatus==="error"?"Fehler":"getrennt"}
                </span>
              </div>
              <div style={{display:"flex",gap:6}}>
                {!apiConnected
                  ? <button style={st.btn("#22c55e")} onClick={connectApi} disabled={apiStatus==="connecting"||!pveApi.host}>🔌 Verbinden</button>
                  : <><button style={st.btn("#60a5fa")} onClick={()=>fetchAllStatus()}>🔄 Status</button><button style={st.btn("#ef4444")} onClick={disconnectApi}>⏹ Trennen</button></>
                }
              </div>
            </div>

            {/* Settings toggle */}
            <div style={{...st.row,cursor:"pointer",marginTop:10,marginBottom:apiOpen?12:0}} onClick={()=>setApiOpen(o=>!o)}>
              <span style={{fontSize:12,color:"#475569",fontWeight:600}}>API-Einstellungen</span>
              <span style={{fontSize:13,color:"#475569",transform:apiOpen?"rotate(90deg)":"none",display:"inline-block",transition:"transform .2s"}}>›</span>
            </div>
            {apiOpen&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10,marginBottom:12}}>
              <div style={{gridColumn:"1/-1"}}><label style={st.lbl}>Host (IP/Domain)</label><input style={{...st.inp,borderColor:pveApi.host?"#3b82f644":"#ef444444"}} placeholder="192.168.1.100" value={pveApi.host} onChange={e=>setPveApi(v=>({...v,host:e.target.value}))}/></div>
              <div><label style={st.lbl}>API Port</label><input style={st.inp} value={pveApi.apiPort} onChange={e=>setPveApi(v=>({...v,apiPort:e.target.value}))}/></div>
              <div>
                <label style={st.lbl}>Auth-Modus</label>
                <div style={{display:"flex",borderRadius:6,overflow:"hidden",border:"1px solid #ffffff11"}}>
                  {["token","password"].map(m=>(
                    <button key={m} onClick={()=>setPveApi(v=>({...v,authMode:m}))} style={{flex:1,padding:"7px",fontSize:11,fontWeight:600,cursor:"pointer",border:"none",background:pveApi.authMode===m?"#1e3a5f":"transparent",color:pveApi.authMode===m?"#60a5fa":"#475569",textTransform:"uppercase"}}>
                      {m==="token"?"🔑 Token":"👤 Passwort"}
                    </button>
                  ))}
                </div>
              </div>
              {pveApi.authMode==="token"&&<>
                <div style={{gridColumn:"1/-1"}}><label style={st.lbl}>Token ID</label><input style={st.inp} value={pveApi.tokenId} onChange={e=>setPveApi(v=>({...v,tokenId:e.target.value}))} placeholder="root@pam!arr-tool"/></div>
                <div style={{gridColumn:"1/-1"}}><label style={st.lbl}>Token Secret</label><input style={st.inp} type="password" value={pveApi.secret} onChange={e=>setPveApi(v=>({...v,secret:e.target.value}))}/></div>
              </>}
              {pveApi.authMode==="password"&&<>
                <div><label style={st.lbl}>Benutzer</label><input style={st.inp} value={pveApi.user} onChange={e=>setPveApi(v=>({...v,user:e.target.value}))} placeholder="root@pam"/></div>
                <div><label style={st.lbl}>Passwort</label><input style={st.inp} type="password" value={pveApi.password} onChange={e=>setPveApi(v=>({...v,password:e.target.value}))}/></div>
              </>}
              <div style={{gridColumn:"1/-1",background:"#1a1a0f",border:"1px solid #f59e0b33",borderRadius:6,padding:"8px 12px",fontSize:12,color:"#f59e0b"}}>
                💡 Self-signed Zertifikat? Öffne <code style={{color:"#a5f3fc"}}>https://{pveApi.host||"<host>"}:{pveApi.apiPort}</code> einmalig im Browser und akzeptiere es.
              </div>
            </div>}

            {/* API Log */}
            <div ref={logRef} style={{...st.term,height:150}}>
              {apiLog.length===0&&<span style={{color:"#475569"}}>API-Log…</span>}
              {apiLog.map((l,i)=><div key={i} style={{color:l.color}}><span style={{color:"#334155",userSelect:"none"}}>[{l.ts}] </span>{l.msg}</div>)}
            </div>
            <button style={{...st.btn("#64748b"),marginTop:6,fontSize:11}} onClick={()=>setApiLog([])}>🗑 Log leeren</button>
          </div>

          {/* Volumes */}
          <div style={{...st.card,marginBottom:16}}>
            <div style={{...st.row,cursor:"pointer"}} onClick={()=>setVolOpen(o=>!o)}>
              <span style={st.sec}>Volumes</span>
              <span style={{fontSize:13,color:"#475569",transform:volOpen?"rotate(90deg)":"none",display:"inline-block",transition:"transform .2s"}}>›</span>
            </div>
            {volOpen&&<div style={{marginTop:14,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14}}>
              {[["Config-Basispfad","baseConfigPath"],["Media-Basispfad","baseMediaPath"],["Download-Basispfad","baseDownloadPath"]].map(([l,k])=>(
                <div key={k} style={{gridColumn:k==="baseConfigPath"?"1/-1":"auto"}}><label style={st.lbl}>{l}</label><input style={st.inp} value={volumes[k]} onChange={e=>setVolumes(v=>({...v,[k]:e.target.value}))}/></div>
              ))}
              {[["PUID","puid"],["PGID","pgid"],["Timezone","tz"]].map(([l,k])=>(
                <div key={k}><label style={st.lbl}>{l}</label><input style={st.inp} value={volumes[k]} onChange={e=>setVolumes(v=>({...v,[k]:e.target.value}))}/></div>
              ))}
            </div>}
          </div>

          {/* Service Cards */}
          <div style={st.row}>
            <p style={{color:"#64748b",fontSize:13,margin:0}}>Services & LXC-Ressourcen</p>
            <button style={{...st.btn(apiConnected?"#60a5fa":"#475569"),opacity:apiConnected?1:0.5}} disabled={!apiConnected} onClick={()=>fetchAllStatus()}>🔄 Alle aktualisieren</button>
          </div>
          <div style={{height:10}}/>

          {services.map(svc=>{
            const ls=lxcStatus[svc.id];
            const sc=ls?.online?"#22c55e":ls?.status==="stopped"?"#ef4444":"#64748b";
            return (
              <div key={svc.id} style={{...st.card,opacity:svc.enabled?1:0.55,borderColor:vmidWarnings[svc.id]?"#ef444433":"#ffffff11"}}>
                <div style={st.row}>
                  <span style={st.sname}>
                    {svc.icon} {svc.name}
                    {vmidWarnings[svc.id]&&<span style={st.bdg("#ef4444")}>⚠️</span>}
                    {ls&&!ls.loading&&<span style={{...st.bdg(sc),display:"inline-flex",alignItems:"center",gap:4}}><span style={{width:6,height:6,borderRadius:"50%",background:sc}}/>{ls.status}</span>}
                    {ls?.loading&&<span style={st.bdg("#f59e0b")}>⏳</span>}
                  </span>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {svc.enabled&&<button style={{...st.btn(apiConnected?"#22c55e":"#475569"),opacity:apiConnected?1:0.5}} disabled={!apiConnected} onClick={()=>deployServiceApi(svc)}>{deploying[svc.id]==="running"?"⏳":deploying[svc.id]==="done"?"✅":"🚀"}</button>}
                    {svc.enabled&&svc.deployMode==="oci"&&<button style={{...st.btn(apiConnected?"#60a5fa":"#475569"),opacity:apiConnected?1:0.5}} disabled={!apiConnected} onClick={async()=>{await destroyServiceApi(svc);setTimeout(()=>deployServiceApi(svc),2000);}} title="Update (destroy+recreate)">🔄</button>}
                    <button style={st.btn("#f59e0b")} onClick={()=>openEdit(svc)}>✏️</button>
                    <button style={st.btn(svc.enabled?"#f59e0b":"#22c55e")} onClick={()=>updateSvc(svc.id,{enabled:!svc.enabled})}>{svc.enabled?"OFF":"ON"}</button>
                    {svc.enabled&&<><button style={{...st.btn(apiConnected?"#22c55e":"#475569"),opacity:apiConnected?1:0.5,fontSize:11}} disabled={!apiConnected} onClick={()=>ctAction(svc,"start")}>▶</button><button style={{...st.btn(apiConnected?"#ef4444":"#475569"),opacity:apiConnected?1:0.5,fontSize:11}} disabled={!apiConnected} onClick={()=>ctAction(svc,"stop")}>■</button><button style={{...st.btn(apiConnected?"#f59e0b":"#475569"),opacity:apiConnected?1:0.5,fontSize:11}} disabled={!apiConnected} onClick={()=>ctAction(svc,"restart")}>↻</button></>}
                    {svc.enabled&&<button style={{...st.btn(apiConnected?"#ef4444":"#475569"),opacity:apiConnected?1:0.5}} disabled={!apiConnected} onClick={()=>destroyServiceApi(svc)}>{destroying[svc.id]==="running"?"⏳":"🗑"}</button>}
                    {apiConnected&&<button style={{...st.btn("#60a5fa"),fontSize:11,padding:"3px 8px"}} onClick={()=>fetchAllStatus()}>↺</button>}
                  </div>
                </div>

                {/* Static config */}
                <div style={{marginTop:10,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:8}}>
                  {[["Port",svc.port],["VMID",svc.vmid],["Cores",svc.cores],["RAM",svc.mem+"MB"],["Disk",svc.disk+"GB"],["IP",svc.ip||"DHCP"],["API-Key",svc.apiKey?"••••":"—"]].map(([k,v])=>(
                    <div key={k}><div style={{fontSize:10,color:"#475569",textTransform:"uppercase"}}>{k}</div><div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{String(v)}</div></div>
                  ))}
                  <div style={{display:"flex",alignItems:"center",gap:6}}><Toggle value={svc.startOnBoot??true} onChange={v=>updateSvc(svc.id,{startOnBoot:v})}/><span style={{fontSize:10,color:"#475569",textTransform:"uppercase"}}>Boot</span></div>
                </div>

                {/* Live status */}
                {ls&&!ls.error&&!ls.loading&&(
                  <div style={{marginTop:10,background:"#0f1117",border:"1px solid #ffffff08",borderRadius:8,padding:"10px 14px"}}>
                    <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
                      <span style={{fontSize:10,color:"#475569",fontWeight:700,textTransform:"uppercase"}}>Live</span>
                      {[["IP",ls.ip],["Cores",ls.cores],["RAM",ls.memUsed||ls.mem+"MB"],["CPU",ls.cpu],["Disk",ls.disk]].filter(([,v])=>v&&v!=="—").map(([k,v])=>{
                        const mismatch=(k==="Cores"&&+ls.cores!==svc.cores)||(k==="IP"&&ls.ip!=="DHCP"&&ls.ip!==svc.ip);
                        return <div key={k}>
                          <div style={{fontSize:10,color:"#475569",textTransform:"uppercase"}}>{k}</div>
                          <div style={{fontSize:12,color:mismatch?"#f59e0b":"#22c55e",fontWeight:600}}>{v}{mismatch&&" ⚠"}</div>
                        </div>;
                      })}
                      {ls.ip&&ls.ip!=="DHCP"&&ls.ip!==svc.ip&&<button style={{...st.btn("#f59e0b"),fontSize:10,padding:"2px 7px"}} onClick={()=>updateSvc(svc.id,{ip:ls.ip})}>← IP übernehmen</button>}
                    </div>
                  </div>
                )}
                {ls?.error&&<div style={{marginTop:8,fontSize:12,color:"#ef4444"}}>⚠️ Container nicht erreichbar oder nicht vorhanden</div>}

                {/* Deploy mode */}
                <div style={{marginTop:10,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <div style={{display:"flex",borderRadius:6,overflow:"hidden",border:"1px solid #ffffff11"}}>
                    {["oci","debian"].map(m=>(
                      <button key={m} onClick={()=>updateSvc(svc.id,{deployMode:m})} style={{padding:"4px 12px",fontSize:11,fontWeight:600,cursor:"pointer",border:"none",background:svc.deployMode===m?(m==="oci"?"#1e3a5f":"#1a2a1a"):"transparent",color:svc.deployMode===m?(m==="oci"?"#60a5fa":"#22c55e"):"#475569",textTransform:"uppercase"}}>
                        {m==="oci"?"🐳 OCI":"🐧 Debian"}
                      </button>
                    ))}
                  </div>
                  {svc.deployMode==="oci"&&<span style={{fontSize:11,color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:260}} title={svc.ociImage}>{svc.ociImage}</span>}
                </div>
              </div>
            );
          })}
        </>}

        {/* ── LXC ── */}
        {tab==="lxc"&&<>
          <div style={{display:"flex",gap:6,marginBottom:18,flexWrap:"wrap"}}>
            {[["global","⚙️ PVE"],["oci","🐳 OCI"],["create","🛠 pct create"],["conf","📄 .conf"],["script","📜 Script"],["apikeys","🔑 API-Keys"]].map(([k,l])=>(
              <button key={k} style={{...st.btn(lxcSub===k?"#a78bfa":"#64748b"),background:lxcSub===k?"#2d1a4d":"transparent"}} onClick={()=>setLxcSub(k)}>{l}</button>
            ))}
          </div>

          {lxcSub==="global"&&<>
            <div style={st.card}>
              <div style={{...st.row,cursor:"pointer"}} onClick={()=>setPveOpen(o=>!o)}>
                <span style={st.sec}>Proxmox-Konfiguration</span>
                <span style={{fontSize:13,color:"#475569",transform:pveOpen?"rotate(90deg)":"none",display:"inline-block",transition:"transform .2s"}}>›</span>
              </div>
              {pveOpen&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:14,marginTop:14}}>
                {[["Node","node"],["Bridge","bridge"],["Default GW","defaultGw"],["Nameserver","nameserver"],["Subnetz-Prefix","subnetCidr"],["OS-Typ","osType"]].map(([l,k])=>(
                  <div key={k}><label style={st.lbl}>{l}</label><input style={st.inp} value={pve[k]} onChange={e=>setPve(p=>({...p,[k]:e.target.value}))}/></div>
                ))}
                <div style={{gridColumn:"1/-1"}}>
                  <label style={st.lbl}>Storage</label>
                  <div style={{display:"flex",gap:8}}>
                    <select style={{...st.inp,flex:1}} value={pve.storage} onChange={e=>setPve(p=>({...p,storage:e.target.value}))}>{storageList.map(s=><option key={s} value={s}>{s}</option>)}</select>
                    <button style={{...st.btn(apiConnected?"#60a5fa":"#475569"),opacity:apiConnected?1:0.5}} disabled={!apiConnected} onClick={async()=>{ const r=await apiRef.current?.storages().catch(()=>null); if(r?.data) setStorageList(r.data.map(s=>s.storage)); }}>🔄</button>
                  </div>
                </div>
                <div style={{gridColumn:"1/-1"}}><label style={st.lbl}>OS-Template</label><input style={st.inp} value={pve.osTemplate} onChange={e=>setPve(p=>({...p,osTemplate:e.target.value}))}/></div>
                <div style={{gridColumn:"1/-1",background:"#0f1117",border:"1px solid #a78bfa33",borderRadius:8,padding:14}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#a78bfa",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>VMID-Range</div>
                  <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
                    <div><label style={st.lbl}>Von</label><input style={{...st.inp,width:100}} type="number" value={pve.vmidRangeFrom} onChange={e=>setPve(p=>({...p,vmidRangeFrom:+e.target.value}))}/></div>
                    <div><label style={st.lbl}>Bis</label><input style={{...st.inp,width:100}} type="number" value={pve.vmidRangeTo} onChange={e=>setPve(p=>({...p,vmidRangeTo:+e.target.value}))}/></div>
                    <button style={st.btn("#a78bfa")} onClick={()=>setServices(s=>assignVmidsFromRange(s,pve.vmidRangeFrom,pve.vmidRangeTo))}>↺ Neu vergeben</button>
                    {Object.keys(vmidWarnings).length>0&&<button style={st.btn("#ef4444")} onClick={()=>setServices(s=>assignVmidsFromRange(s,pve.vmidRangeFrom,pve.vmidRangeTo))}>⚠️ Konflikte beheben</button>}
                  </div>
                  {Object.keys(vmidWarnings).length>0&&<div style={{marginTop:8,fontSize:11,color:"#ef4444"}}>{Object.entries(vmidWarnings).map(([id,msg])=><div key={id}>• {services.find(s=>s.id===id)?.name}: {msg}</div>)}</div>}
                </div>
              </div>}
              <div style={{marginTop:14,display:"flex",gap:24}}>
                {[["Unprivileged","unprivileged"],["Start on Boot","startOnBoot"]].map(([l,k])=>(
                  <label key={k} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:13,color:"#94a3b8"}}><Toggle value={pve[k]} onChange={v=>setPve(p=>({...p,[k]:v}))}/> {l}</label>
                ))}
              </div>
            </div>
            <div style={st.card}>
              <div style={st.sec}>Pro-Service Ressourcen & IP</div>
              {enabled.map(svc=>(
                <div key={svc.id} style={{padding:"12px 0",borderBottom:"1px solid #ffffff08"}}>
                  <div style={{fontWeight:600,fontSize:13,color:"#94a3b8",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
                    {svc.icon} {svc.name}
                    <span style={st.bdg(vmidWarnings[svc.id]?"#ef4444":"#a78bfa")}>VMID {svc.vmid}</span>
                    {vmidWarnings[svc.id]&&<span style={{fontSize:11,color:"#ef4444"}}>{vmidWarnings[svc.id]}</span>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:10}}>
                    {[["VMID","vmid","number"],["Cores","cores","number"],["RAM (MB)","mem","number"],["Disk (GB)","disk","number"],["IP","ip","text"],["Gateway","gw","text"]].map(([l,k,t])=>(
                      <div key={k}><label style={st.lbl}>{l}</label><input style={{...st.inp,borderColor:k==="vmid"&&vmidWarnings[svc.id]?"#ef444466":"#ffffff22"}} type={t} value={svc[k]||""} placeholder={k==="ip"?"DHCP":k==="gw"?pve.defaultGw:""} onChange={e=>updateSvc(svc.id,{[k]:t==="number"?+e.target.value:e.target.value})}/></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>}

          {lxcSub==="oci"&&<>
            <div style={{...st.card,background:"#0f1a2a",border:"1px solid #3b82f633",marginBottom:16}}>
              <div style={{fontSize:13,color:"#60a5fa",fontWeight:600,marginBottom:6}}>🐳 OCI-Modus</div>
              <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.8}}>Proxmox erstellt LXC-Container direkt aus linuxserver.io OCI-Images. Kein manuelles Setup nötig.</div>
            </div>
            <div style={st.card}>
              <div style={st.sec}>OCI-Images pro Service</div>
              <div style={{display:"flex",gap:8,marginBottom:14}}>
                <button style={st.btn("#60a5fa")} onClick={()=>setServices(s=>s.map(svc=>({...svc,deployMode:"oci"})))}>🐳 Alle OCI</button>
                <button style={st.btn("#22c55e")} onClick={()=>setServices(s=>s.map(svc=>({...svc,deployMode:"debian"})))}>🐧 Alle Debian</button>
                {["latest","develop","nightly"].map(tag=>(
                  <button key={tag} style={st.btn("#a78bfa")} onClick={()=>setServices(s=>s.map(svc=>({...svc,ociImage:svc.ociImage.replace(/:.*$/,`:${tag}`)})))}>{tag}</button>
                ))}
              </div>
              {enabled.map(svc=>(
                <div key={svc.id} style={{padding:"10px 0",borderBottom:"1px solid #ffffff08",display:"grid",gridTemplateColumns:"130px 1fr auto",gap:10,alignItems:"center"}}>
                  <span style={{fontSize:13,color:"#94a3b8",display:"flex",alignItems:"center",gap:6}}>{svc.icon} {svc.name}<span style={st.bdg(svc.deployMode==="oci"?"#60a5fa":"#22c55e")}>{svc.deployMode}</span></span>
                  <input style={st.inp} value={svc.ociImage||""} onChange={e=>updateSvc(svc.id,{ociImage:e.target.value})}/>
                  <button style={st.btn(svc.deployMode==="oci"?"#60a5fa":"#475569")} onClick={()=>updateSvc(svc.id,{deployMode:svc.deployMode==="oci"?"debian":"oci"})}>
                    {svc.deployMode==="oci"?"→ Debian":"→ OCI"}
                  </button>
                </div>
              ))}
            </div>
            <div style={st.card}>
              <div style={st.sec}>Update-Skript (alle OCI)</div>
              <CodeBlock title="oci-update-all.sh" code={[
                "#!/bin/bash","set -e","# OCI Update – destroy & recreate mit aktuellem Image","",
                ...enabled.filter(s=>s.deployMode==="oci").flatMap(svc=>[
                  `# ${svc.icon} ${svc.name}`,
                  `pct stop ${svc.vmid} 2>/dev/null || true`,
                  `pct destroy ${svc.vmid} --purge`,
                  pctCreateStr(svc,pve,volumes),
                  `pct start ${svc.vmid}`,
                  `echo "✅ ${svc.name} aktualisiert"`,""
                ]),
              ].join("\n")}/>
            </div>
          </>}

          {lxcSub==="create"&&<>
            {enabled.map(svc=><CodeBlock key={svc.id} title={`${svc.icon} ${svc.name} (VMID ${svc.vmid}) – ${svc.deployMode.toUpperCase()}`} code={pctCreateStr(svc,pve,volumes)}/>)}
          </>}

          {lxcSub==="conf"&&<>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
              {enabled.map(svc=><button key={svc.id} style={{...st.btn(selSvc===svc.id?"#a78bfa":"#64748b"),background:selSvc===svc.id?"#2d1a4d":"transparent"}} onClick={()=>setSelSvc(selSvc===svc.id?null:svc.id)}>{svc.icon} {svc.name}</button>)}
            </div>
            {(selSvc?enabled.filter(s=>s.id===selSvc):enabled).map(svc=>{
              const ip=svc.ip?`${svc.ip}/${pve.subnetCidr},gw=${svc.gw||pve.defaultGw}`:"dhcp";
              const hasDl=["qbittorrent","sabnzbd","nzbget"].includes(svc.id);
              const conf=`arch: amd64\ncores: ${svc.cores}\nmemory: ${svc.mem}\nswap: 128\nhostname: ${svc.id}\nostype: ${svc.deployMode==="oci"?"unmanaged":pve.osType}\nrootfs: ${pve.storage}:${svc.disk}\nnet0: name=eth0,bridge=${pve.bridge},ip=${ip},firewall=0\nfeatures: nesting=1\nunprivileged: ${pve.unprivileged?1:0}\nonboot: ${(svc.startOnBoot??pve.startOnBoot)?1:0}\nnameserver: ${pve.nameserver}\nmp0: ${volumes.baseConfigPath}/${svc.id},mp=/config${svc.mediaPath?`\nmp1: ${volumes.baseMediaPath},mp=/data`:""}${hasDl?`\nmp2: ${volumes.baseDownloadPath},mp=/downloads`:""}`;
              return <CodeBlock key={svc.id} title={`/etc/pve/lxc/${svc.vmid}.conf`} code={conf}/>;
            })}
          </>}

          {lxcSub==="script"&&<>
            <CodeBlock title="deploy-all.sh" code={[
              "#!/bin/bash","# *arr Full Deploy Script","set -e","",
              `# Proxmox API: https://${pveApi.host||"<host>"}:${pveApi.apiPort}`,
              `# Node: ${pve.node} | Storage: ${pve.storage}`,
              `# VMID Range: ${pve.vmidRangeFrom}–${pve.vmidRangeTo}`,"",
              ...enabled.map(svc=>[
                `# ${svc.icon} ${svc.name} (VMID ${svc.vmid})`,
                `mkdir -p ${volumes.baseConfigPath}/${svc.id}`,
                pctCreateStr(svc,pve,volumes),
                `pct start ${svc.vmid}`,
                `echo "✅ ${svc.name}"`,""
              ].join("\n")),
              `echo "🎉 Deploy abgeschlossen"`
            ].join("\n")}/>
          </>}

          {lxcSub==="apikeys"&&<>
            <p style={{color:"#64748b",fontSize:13,marginBottom:12}}>Nach dem Deploy API-Keys in der jeweiligen Web-UI unter Einstellungen → Allgemein abrufen.</p>
            {enabled.map(svc=>(
              <div key={svc.id} style={st.card}>
                <div style={{fontWeight:600,fontSize:13,color:"#94a3b8",marginBottom:6}}>{svc.icon} {svc.name}</div>
                <div style={{fontSize:12,color:"#64748b"}}>Web-UI: <a href={`http://${svc.ip||pveApi.host||"<ip>"}:${svc.port}`} target="_blank" rel="noreferrer" style={{color:"#60a5fa"}}>http://{svc.ip||pveApi.host||"<ip>"}:{svc.port}</a></div>
                <div style={{fontSize:12,color:"#475569",marginTop:4}}>Einstellungen → Allgemein → API-Key</div>
              </div>
            ))}
          </>}
        </>}

        {/* ── COMPOSE ── */}
        {tab==="compose"&&<>
          <div style={{...st.card,marginBottom:14}}>
            <div style={st.sec}>Docker-Netzwerk</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:14}}>
              {[["Name","name"],["Subnetz","subnet"],["Gateway","gateway"]].map(([l,k])=>(
                <div key={k}><label style={st.lbl}>{l}</label><input style={st.inp} value={network[k]} onChange={e=>setNetwork(n=>({...n,[k]:e.target.value}))}/></div>
              ))}
              <div><label style={st.lbl}>Treiber</label><select style={st.inp} value={network.driver} onChange={e=>setNetwork(n=>({...n,driver:e.target.value}))}>{NETWORK_DRIVERS.map(d=><option key={d} value={d}>{d}</option>)}</select></div>
            </div>
          </div>
          {(()=>{
            let y=`version: "3.8"\n\nservices:\n`;
            enabled.forEach(svc=>{ y+=`\n  ${svc.id}:\n    image: ${svc.ociImage||`lscr.io/linuxserver/${svc.id}:latest`}\n    container_name: ${svc.id}\n    restart: ${svc.restartPolicy}\n    environment:\n      - PUID=${volumes.puid}\n      - PGID=${volumes.pgid}\n      - TZ=${volumes.tz}\n`; if(svc.apiKey)y+=`      - API_KEY=${svc.apiKey}\n`; y+=`    volumes:\n      - ${volumes.baseConfigPath}/${svc.id}:/config\n`; if(svc.mediaPath)y+=`      - ${volumes.baseMediaPath}:/data\n`; if(["qbittorrent","sabnzbd","nzbget"].includes(svc.id))y+=`      - ${volumes.baseDownloadPath}:/downloads\n`; y+=`    ports:\n      - "${svc.port}:${svc.port}"\n    networks:\n      - ${network.name}\n`; });
            y+=`\nnetworks:\n  ${network.name}:\n    driver: ${network.driver}\n\nvolumes:\n`;
            enabled.forEach(s=>{ y+=`  ${s.id}-config:\n    driver: local\n`; });
            return <><div style={{...st.row,marginBottom:10}}><span style={{fontSize:13,color:"#64748b"}}>{enabled.length} Services</span><CopyBtn text={y} label="📋 Kopieren"/></div><pre style={st.pre}>{y}</pre></>;
          })()}
        </>}
      </div>

      {/* EDIT MODAL */}
      {editId&&(
        <div style={st.modal} onClick={e=>e.target===e.currentTarget&&setEditId(null)}>
          <div style={st.mbox}>
            <h3 style={{margin:"0 0 20px",color:"#f1f5f9"}}>{editBuf.icon} {editBuf.name}</h3>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:14}}>
              {[["Port","port","number"],["VMID","vmid","number"],["Cores","cores","number"],["RAM (MB)","mem","number"],["Disk (GB)","disk","number"],["IP","ip","text"],["Gateway","gw","text"],["Media-Pfad","mediaPath","text"],["API-Key","apiKey","text"]].map(([l,k,t])=>(
                <div key={k} style={{gridColumn:k==="mediaPath"?"1/-1":"auto"}}>
                  <label style={{...st.lbl,color:k==="vmid"&&(editBuf.vmid<pve.vmidRangeFrom||editBuf.vmid>pve.vmidRangeTo)?"#ef4444":"#64748b"}}>{l}{k==="vmid"?` (${pve.vmidRangeFrom}–${pve.vmidRangeTo})`:""}</label>
                  <input style={{...st.inp,borderColor:k==="vmid"&&(editBuf.vmid<pve.vmidRangeFrom||editBuf.vmid>pve.vmidRangeTo)?"#ef444466":"#ffffff22"}} type={t} value={editBuf[k]||""} onChange={e=>setEditBuf(b=>({...b,[k]:t==="number"?+e.target.value:e.target.value}))}/>
                </div>
              ))}
              <div style={{gridColumn:"1/-1"}}>
                <label style={st.lbl}>Deploy-Modus</label>
                <div style={{display:"flex",borderRadius:6,overflow:"hidden",border:"1px solid #ffffff11",width:"fit-content"}}>
                  {["oci","debian"].map(m=>(
                    <button key={m} onClick={()=>setEditBuf(b=>({...b,deployMode:m}))} style={{padding:"6px 18px",fontSize:12,fontWeight:600,cursor:"pointer",border:"none",background:editBuf.deployMode===m?(m==="oci"?"#1e3a5f":"#1a2a1a"):"transparent",color:editBuf.deployMode===m?(m==="oci"?"#60a5fa":"#22c55e"):"#475569",textTransform:"uppercase"}}>
                      {m==="oci"?"🐳 OCI":"🐧 Debian"}
                    </button>
                  ))}
                </div>
              </div>
              {editBuf.deployMode==="oci"&&<div style={{gridColumn:"1/-1"}}><label style={st.lbl}>OCI Image</label><input style={st.inp} value={editBuf.ociImage||""} onChange={e=>setEditBuf(b=>({...b,ociImage:e.target.value}))}/></div>}
              <div style={{display:"flex",alignItems:"center",gap:12,gridColumn:"1/-1"}}><Toggle value={editBuf.startOnBoot??true} onChange={v=>setEditBuf(b=>({...b,startOnBoot:v}))}/><span style={{fontSize:13,color:"#94a3b8"}}>Start on Boot</span></div>
            </div>
            {editBuf.vmid!=null&&(editBuf.vmid<pve.vmidRangeFrom||editBuf.vmid>pve.vmidRangeTo)&&(
              <div style={{background:"#1a0f0f",border:"1px solid #ef444433",borderRadius:6,padding:"8px 12px",marginTop:8,fontSize:12,color:"#ef4444"}}>⚠️ VMID außerhalb der Range – beim Deploy wird automatisch eine freie VMID verwendet.</div>
            )}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:22}}>
              <button style={st.btn("#64748b")} onClick={()=>setEditId(null)}>Abbrechen</button>
              <button style={{...st.btn("#3b82f6"),background:"#1e3a5f",padding:"7px 20px"}} onClick={saveEdit}>💾 Speichern</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}