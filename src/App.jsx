import { useState, useEffect, useRef, useCallback } from "react";

const DEFAULT_SERVICES = [
  { id: "sonarr",       name: "Sonarr",       icon: "📺", port: 8989,  enabled: true,  configPath: "/config/sonarr",      mediaPath: "/media/tv",     apiKey: "", restartPolicy: "unless-stopped", startOnBoot: true, vmid: 200, cores: 1, mem: 512,  disk: 4,  ip: "", gw: "" },
  { id: "radarr",       name: "Radarr",       icon: "🎬", port: 7878,  enabled: true,  configPath: "/config/radarr",      mediaPath: "/media/movies", apiKey: "", restartPolicy: "unless-stopped", startOnBoot: true, vmid: 201, cores: 1, mem: 512,  disk: 4,  ip: "", gw: "" },
  { id: "prowlarr",     name: "Prowlarr",     icon: "🔍", port: 9696,  enabled: true,  configPath: "/config/prowlarr",    mediaPath: "",              apiKey: "", restartPolicy: "unless-stopped", startOnBoot: true, vmid: 202, cores: 1, mem: 256,  disk: 2,  ip: "", gw: "" },
  { id: "lidarr",       name: "Lidarr",       icon: "🎵", port: 8686,  enabled: false, configPath: "/config/lidarr",      mediaPath: "/media/music",  apiKey: "", restartPolicy: "unless-stopped", startOnBoot: true, vmid: 203, cores: 1, mem: 512,  disk: 4,  ip: "", gw: "" },
  { id: "jackett",      name: "Jackett",      icon: "🧥", port: 9117,  enabled: false, configPath: "/config/jackett",     mediaPath: "",              apiKey: "", restartPolicy: "unless-stopped", startOnBoot: true, vmid: 204, cores: 1, mem: 256,  disk: 2,  ip: "", gw: "" },
  { id: "bazarr",       name: "Bazarr",       icon: "💬", port: 6767,  enabled: false, configPath: "/config/bazarr",      mediaPath: "/media",        apiKey: "", restartPolicy: "unless-stopped", startOnBoot: true, vmid: 205, cores: 1, mem: 256,  disk: 2,  ip: "", gw: "" },
  { id: "qbittorrent",  name: "qBittorrent",  icon: "⬇️", port: 8080,  enabled: true,  configPath: "/config/qbittorrent", mediaPath: "/downloads",    apiKey: "", restartPolicy: "unless-stopped", startOnBoot: true, vmid: 206, cores: 2, mem: 1024, disk: 8,  ip: "", gw: "" },
  { id: "overseerr",    name: "Overseerr",    icon: "🎟️", port: 5055,  enabled: false, configPath: "/config/overseerr",   mediaPath: "",              apiKey: "", restartPolicy: "unless-stopped", startOnBoot: true, vmid: 207, cores: 1, mem: 512,  disk: 4,  ip: "", gw: "" },
  { id: "jellyfin",     name: "Jellyfin",     icon: "🍇", port: 8096,  enabled: false, configPath: "/config/jellyfin",    mediaPath: "/media",        apiKey: "", restartPolicy: "unless-stopped", startOnBoot: true, vmid: 208, cores: 2, mem: 2048, disk: 8,  ip: "", gw: "" },
  { id: "plex",         name: "Plex",         icon: "🟡", port: 32400, enabled: false, configPath: "/config/plex",        mediaPath: "/media",        apiKey: "", restartPolicy: "unless-stopped", startOnBoot: true, vmid: 209, cores: 2, mem: 2048, disk: 8,  ip: "", gw: "" },
  { id: "tautulli",     name: "Tautulli",     icon: "📊", port: 8181,  enabled: false, configPath: "/config/tautulli",    mediaPath: "",              apiKey: "", restartPolicy: "unless-stopped", startOnBoot: true, vmid: 210, cores: 1, mem: 256,  disk: 2,  ip: "", gw: "" },
  { id: "flaresolverr", name: "FlareSolverr", icon: "🔓", port: 8191,  enabled: false, configPath: "",                    mediaPath: "",              apiKey: "", restartPolicy: "unless-stopped", startOnBoot: true, vmid: 211, cores: 1, mem: 256,  disk: 2,  ip: "", gw: "" },
  { id: "sabnzbd",      name: "SABnzbd",      icon: "📡", port: 8090,  enabled: false, configPath: "/config/sabnzbd",     mediaPath: "/downloads",    apiKey: "", restartPolicy: "unless-stopped", startOnBoot: true, vmid: 212, cores: 1, mem: 512,  disk: 4,  ip: "", gw: "" },
  { id: "mylar3",       name: "Mylar3",       icon: "📰", port: 8090,  enabled: false, configPath: "/config/mylar3",      mediaPath: "/media/comics", apiKey: "", restartPolicy: "unless-stopped", startOnBoot: true, vmid: 213, cores: 1, mem: 256,  disk: 2,  ip: "", gw: "" },
];

const RESTART_POLICIES = ["no","always","on-failure","unless-stopped"];
const NETWORK_DRIVERS  = ["bridge","host","overlay","macvlan"];
const PVE_STORAGE_OPTS = ["local-lvm","local","local-zfs","ceph","nfs"];

const DEFAULT_NETWORK = { name:"arr-network", driver:"bridge", subnet:"172.20.0.0/16", gateway:"172.20.0.1", enableIPv6:false, internal:false };
const DEFAULT_VOLUMES  = { baseConfigPath:"/opt/arr/config", baseMediaPath:"/mnt/media", baseDownloadPath:"/mnt/downloads", puid:"1000", pgid:"1000", tz:"Europe/Berlin" };
const DEFAULT_SSH      = { host: import.meta.env.VITE_WS_HOST || "", user:"root", port:"22", keyPath:"~/.ssh/id_rsa", deployPath:"/opt/arr", useKey:true, wsPort: import.meta.env.VITE_WS_PORT || "2222" };
const DEFAULT_PVE      = { node:"pve", bridge:"vmbr0", storage:"local-lvm", osTemplate:"local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst", defaultGw:"192.168.1.1", subnetCidr:"24", nameserver:"1.1.1.1", unprivileged:true, startOnBoot:true, osType:"debian" };

// ── styles ──────────────────────────────────────────────────────────────────
const st = {
  app:   { minHeight:"100vh", background:"#0f1117", color:"#e2e8f0", fontFamily:"'Inter',system-ui,sans-serif" },
  hdr:   { background:"#161b27", borderBottom:"1px solid #ffffff11", padding:"16px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 },
  title: { fontSize:20, fontWeight:700, color:"#fff", margin:0 },
  tabs:  { display:"flex", gap:4, padding:"16px 24px 0", background:"#161b27", flexWrap:"wrap" },
  tab:   a=>({ padding:"8px 13px", borderRadius:"8px 8px 0 0", border:"1px solid "+(a?"#3b82f6":"#ffffff11"), borderBottom:a?"1px solid #161b27":"1px solid #ffffff11", background:a?"#1e3a5f":"transparent", color:a?"#60a5fa":"#94a3b8", cursor:"pointer", fontSize:13, fontWeight:500, transition:"all .2s" }),
  body:  { padding:"clamp(10px, 3vw, 24px)" },
  card:  { background:"#161b27", border:"1px solid #ffffff11", borderRadius:12, padding:18, marginBottom:10 },
  row:   { display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 },
  btn:   c=>({ background:c+"22", border:`1px solid ${c}44`, color:c, borderRadius:6, padding:"5px 11px", cursor:"pointer", fontSize:12, fontWeight:600, transition:"all .2s", whiteSpace:"nowrap" }),
  inp:   { background:"#0f1117", border:"1px solid #ffffff22", borderRadius:6, color:"#e2e8f0", padding:"7px 11px", fontSize:13, width:"100%", outline:"none", boxSizing:"border-box" },
  lbl:   { fontSize:11, color:"#64748b", marginBottom:4, display:"block", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em" },
  modal: { position:"fixed", inset:0, background:"#000000bb", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:24 },
  mbox:  { background:"#161b27", border:"1px solid #ffffff22", borderRadius:14, padding:28, width:"100%", maxWidth:520, maxHeight:"90vh", overflowY:"auto" },
  pre:   { background:"#0a0e17", border:"1px solid #ffffff0f", borderRadius:8, padding:16, fontSize:12, color:"#a5f3fc", overflowX:"auto", lineHeight:1.75, margin:0, whiteSpace:"pre-wrap", wordBreak:"break-all" },
  tgl:   on=>({ width:36, height:20, borderRadius:10, background:on?"#3b82f6":"#334155", border:"none", cursor:"pointer", position:"relative", transition:"background .2s", flexShrink:0, outline:"none" }),
  stat:  { background:"#1e293b", borderRadius:10, padding:"14px 16px", textAlign:"center", flex:1, minWidth:90 },
  sname: { fontWeight:600, fontSize:15, color:"#f1f5f9", display:"flex", alignItems:"center", gap:8 },
  sec:   { fontSize:12, fontWeight:700, color:"#60a5fa", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:14, marginTop:4 },
  bdg:   c=>({ fontSize:10, color:c, background:c+"22", border:`1px solid ${c}44`, padding:"2px 8px", borderRadius:20, fontWeight:600 }),
  term:  { background:"#0a0e17", border:"1px solid #22c55e33", borderRadius:10, fontFamily:"'Fira Mono','Cascadia Code',monospace", fontSize:12, color:"#d4d4d4", overflowY:"auto", padding:"14px 16px", lineHeight:1.7, whiteSpace:"pre-wrap", wordBreak:"break-all" },
};

// ── helpers ──────────────────────────────────────────────────────────────────
function CopyBtn({ text, label="Kopieren" }) {
  const [ok,setOk]=useState(false);
  return <button onClick={()=>{navigator.clipboard.writeText(text);setOk(true);setTimeout(()=>setOk(false),2000);}} style={{background:ok?"#22c55e22":"#ffffff11",border:`1px solid ${ok?"#22c55e":"#ffffff22"}`,color:ok?"#22c55e":"#aaa",borderRadius:6,padding:"6px 14px",cursor:"pointer",fontSize:12,transition:"all .2s",whiteSpace:"nowrap"}}>{ok?"✓ Kopiert!":label}</button>;
}
function Toggle({ value, onChange }) {
  return <button style={st.tgl(value)} onClick={()=>onChange(!value)}><span style={{position:"absolute",top:3,left:value?18:3,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/></button>;
}
function CodeBlock({ code, title }) {
  return (
    <div style={{marginBottom:14}}>
      <div style={{...st.row,marginBottom:8}}>
        {title&&<span style={{fontSize:12,color:"#64748b"}}>{title}</span>}
        <CopyBtn text={code}/>
      </div>
      <pre style={st.pre}>{code}</pre>
    </div>
  );
}

// ── native install helpers (same as containerSetup) ──────────────────────────
const INSTALL_CMDS = {
  sonarr:       `curl -o /tmp/sonarr.tar.gz -L "https://services.sonarr.tv/v1/download/main/latest?version=4&os=linux&arch=x64" && mkdir -p /opt/sonarr && tar -xzf /tmp/sonarr.tar.gz -C /opt/sonarr --strip-components=1`,
  radarr:       `curl -o /tmp/radarr.tar.gz -L "https://radarr.servarr.com/v1/update/master/updatefile?os=linux&runtime=netcore&arch=x64" && mkdir -p /opt/radarr && tar -xzf /tmp/radarr.tar.gz -C /opt/radarr --strip-components=1`,
  prowlarr:     `curl -o /tmp/prowlarr.tar.gz -L "https://prowlarr.servarr.com/v1/update/master/updatefile?os=linux&runtime=netcore&arch=x64" && mkdir -p /opt/prowlarr && tar -xzf /tmp/prowlarr.tar.gz -C /opt/prowlarr --strip-components=1`,
  lidarr:       `curl -o /tmp/lidarr.tar.gz -L "https://github.com/Lidarr/Lidarr/releases/latest/download/Lidarr.master.linux-core-x64.tar.gz" && mkdir -p /opt/lidarr && tar -xzf /tmp/lidarr.tar.gz -C /opt/lidarr --strip-components=1`,
  jackett:      `curl -o /tmp/jackett.tar.gz -L "https://github.com/Jackett/Jackett/releases/latest/download/Jackett.Binaries.LinuxAMDx64.tar.gz" && mkdir -p /opt/jackett && tar -xzf /tmp/jackett.tar.gz -C /opt/jackett --strip-components=1`,
  bazarr:       `apt-get install -y python3 python3-pip python3-venv unzip && curl -o /tmp/bazarr.zip -L "https://github.com/morpheus65535/bazarr/releases/latest/download/bazarr.zip" && mkdir -p /opt/bazarr && unzip -q /tmp/bazarr.zip -d /opt/bazarr`,
  qbittorrent:  `apt-get install -y qbittorrent-nox`,
  overseerr:    `apt-get install -y nodejs npm && npm install -g overseerr`,
  jellyfin:     `curl -fsSL https://repo.jellyfin.org/install-debuntu.sh | bash`,
  plex:         `curl -o /tmp/plexmediaserver.deb -L "https://downloads.plex.tv/plex-media-server-new/1.40.1.8227-c0dd5a73e/debian/plexmediaserver_1.40.1.8227-c0dd5a73e_amd64.deb" && dpkg -i /tmp/plexmediaserver.deb`,
  tautulli:     `apt-get install -y python3 python3-pip && curl -o /tmp/tautulli.tar.gz -L "https://github.com/Tautulli/Tautulli/archive/refs/heads/master.tar.gz" && mkdir -p /opt/tautulli && tar -xzf /tmp/tautulli.tar.gz -C /opt/tautulli --strip-components=1`,
  flaresolverr: `apt-get install -y python3 chromium chromium-driver && curl -o /tmp/flaresolverr.tar.gz -L "https://github.com/FlareSolverr/FlareSolverr/releases/latest/download/flaresolverr_linux_x64.tar.gz" && mkdir -p /opt/flaresolverr && tar -xzf /tmp/flaresolverr.tar.gz -C /opt/flaresolverr --strip-components=1`,
  sabnzbd:      `apt-get install -y sabnzbd`,
  mylar3:       `apt-get install -y python3 python3-pip && curl -o /tmp/mylar3.tar.gz -L "https://github.com/mylar3/mylar3/archive/refs/heads/master.tar.gz" && mkdir -p /opt/mylar3 && tar -xzf /tmp/mylar3.tar.gz -C /opt/mylar3 --strip-components=1`,
};
const BINARY_PATHS = {
  sonarr:       svc=>"/opt/sonarr/Sonarr -nobrowser -data=/config",
  radarr:       svc=>"/opt/radarr/Radarr -nobrowser -data=/config",
  prowlarr:     svc=>"/opt/prowlarr/Prowlarr -nobrowser -data=/config",
  lidarr:       svc=>"/opt/lidarr/Lidarr -nobrowser -data=/config",
  jackett:      svc=>"/opt/jackett/jackett --NoRestart --DataFolder /config",
  bazarr:       svc=>"python3 /opt/bazarr/bazarr.py",
  qbittorrent:  svc=>`qbittorrent-nox --webui-port=${svc.port}`,
  overseerr:    svc=>"overseerr start",
  jellyfin:     svc=>"jellyfin",
  plex:         svc=>"plexmediaserver",
  tautulli:     svc=>"python3 /opt/tautulli/Tautulli.py",
  flaresolverr: svc=>"/opt/flaresolverr/flaresolverr",
  sabnzbd:      svc=>"sabnzbd",
  mylar3:       svc=>"python3 /opt/mylar3/Mylar.py",
};
const API_KEY_CMD = {
  // Servarr-Apps – /config/config.xml
  sonarr:   v=>`pct exec ${v} -- bash -c 'grep -oP "(?<=<ApiKey>)[^<]+" /config/config.xml 2>/dev/null'`,
  radarr:   v=>`pct exec ${v} -- bash -c 'grep -oP "(?<=<ApiKey>)[^<]+" /config/config.xml 2>/dev/null'`,
  prowlarr: v=>`pct exec ${v} -- bash -c 'grep -oP "(?<=<ApiKey>)[^<]+" /config/config.xml 2>/dev/null'`,
  lidarr:   v=>`pct exec ${v} -- bash -c 'grep -oP "(?<=<ApiKey>)[^<]+" /config/config.xml 2>/dev/null'`,
  // Jackett – /config/ServerConfig.json
  jackett:  v=>`pct exec ${v} -- bash -c 'grep APIKey /config/ServerConfig.json | cut -d: -f2 | tr -d " \\","'`,
  // Bazarr – /config/config/config.ini
  bazarr:   v=>`pct exec ${v} -- bash -c 'grep -oP "(?<=apikey = )\\S+" /config/config/config.ini 2>/dev/null'`,
  // Tautulli – /config/config.ini
  tautulli: v=>`pct exec ${v} -- bash -c 'grep -oP "(?<=api_key = )\\S+" /config/config.ini 2>/dev/null'`,
  // SABnzbd – /config/sabnzbd.ini
  sabnzbd:  v=>`pct exec ${v} -- bash -c 'grep -oP "(?<=api_key = )\\S+" /config/sabnzbd.ini 2>/dev/null'`,
};

function buildDeployCommands(svc, pve, volumes) {
  const hasMedia = !!svc.mediaPath;
  const hasDl    = ["qbittorrent","sabnzbd","nzbget"].includes(svc.id);
  const bin      = (BINARY_PATHS[svc.id]?.(svc)) || `/opt/${svc.id}/${svc.id}`;
  const dirs     = `/config${hasMedia?" /data":""}${hasDl?" /downloads":""}`;

  const unitLines = [
    "[Unit]",`Description=${svc.name}`,"After=network.target","",
    "[Service]","Type=simple",`User=${svc.id}`,`Group=${svc.id}`,
    `Environment=TZ=${volumes.tz}`,
    svc.apiKey?`Environment=API_KEY=${svc.apiKey}`:"",
    `ExecStart=${bin}`,"Restart=on-failure","RestartSec=5","",
    "[Install]","WantedBy=multi-user.target",
  ].filter(l=>l!==null);

  // pct create
  const ip = svc.ip ? `${svc.ip}/${pve.subnetCidr},gw=${svc.gw||pve.defaultGw}` : "dhcp";
  const pctCmd = [
    `pct create ${svc.vmid} ${pve.osTemplate}`,
    `  --hostname ${svc.id}`,
    `  --cores ${svc.cores}`,
    `  --memory ${svc.mem}`,
    `  --swap 128`,
    `  --storage ${pve.storage}`,
    `  --rootfs ${pve.storage}:${svc.disk}`,
    `  --net0 name=eth0,bridge=${pve.bridge},ip=${ip}`,
    `  --nameserver ${pve.nameserver}`,
    `  --features nesting=1`,
    `  --unprivileged ${pve.unprivileged?1:0}`,
    `  --start 0`,
    `  --onboot ${pve.startOnBoot?1:0}`,
    `  --ostype ${pve.osType}`,
    `  --mp0 ${volumes.baseConfigPath}/${svc.id},mp=/config`,
    svc.mediaPath?`  --mp1 ${volumes.baseMediaPath},mp=/data`:"",
    hasDl?`  --mp2 ${volumes.baseDownloadPath},mp=/downloads`:"",
  ].filter(Boolean).join(" \\\n");

  // sequence of commands sent one by one via WS
  return [
    `# ── Erstelle LXC für ${svc.name} (VMID ${svc.vmid}) ──`,
    `mkdir -p ${volumes.baseConfigPath}/${svc.id} && chown 100000:100000 ${volumes.baseConfigPath}/${svc.id}`,
    pctCmd,
    `pct start ${svc.vmid}`,
    `sleep 6`,
    `pct exec ${svc.vmid} -- bash -c 'set -e; apt-get update -qq && apt-get install -y -qq curl ca-certificates libicu-dev'`,
    `pct exec ${svc.vmid} -- bash -c 'useradd -r -s /bin/false ${svc.id} 2>/dev/null || true'`,
    `pct exec ${svc.vmid} -- bash -c 'mkdir -p ${dirs}'`,
    `pct exec ${svc.vmid} -- bash -c 'chown -R ${svc.id}:${svc.id} /config'`,
    `pct exec ${svc.vmid} -- bash -c '${INSTALL_CMDS[svc.id]||`echo no installer for ${svc.id}`}'`,
    `pct exec ${svc.vmid} -- bash -c 'chown -R ${svc.id}:${svc.id} /opt/${svc.id} 2>/dev/null || true'`,
    `pct exec ${svc.vmid} -- bash -c 'printf "%s\\n" ${unitLines.map(l=>`'\\''${l}'\\''`).join(" ")} > /etc/systemd/system/${svc.id}.service'`,
    `pct exec ${svc.vmid} -- bash -c 'systemctl daemon-reload && systemctl enable --now ${svc.id}'`,
    `echo "✅ ${svc.name} deployed auf VMID ${svc.vmid}, Port ${svc.port}"`,
  ].filter(Boolean);
}

// ── WS Backend Setup Script ───────────────────────────────────────────────
function wsBackendScript() {
  return `Siehe separates Artifact: arr-ws-bridge.js\nDieses Script auf Proxmox speichern und mit "node arr-ws-bridge.js" starten.`;
}

// ── SSH Console Hook ──────────────────────────────────────────────────────
function useSSHConsole(ssh) {
  const wsRef     = useRef(null);
  const [connected, setConnected] = useState(false);
  const [sshReady,  setSshReady]  = useState(false);
  const [lines,     setLines]     = useState([]);
  const [busy,      setBusy]      = useState(false);

  const appendLine = useCallback((text, type="out") => {
    const color = type==="err"?"#f87171":type==="info"?"#60a5fa":type==="ok"?"#22c55e":"#d4d4d4";
    setLines(p=>[...p, { text, color, ts: new Date().toLocaleTimeString() }]);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(`wss://${ssh.host}:${ssh.wsPort||2222}`);
    wsRef.current = ws;
    ws.onopen  = () => { setConnected(true); appendLine("🔌 WebSocket verbunden…","info"); };
    ws.onclose = () => { setConnected(false); setSshReady(false); appendLine("🔴 Verbindung getrennt","err"); };
    ws.onerror = () => { setConnected(false); setSshReady(false); appendLine("⚠️  WebSocket-Fehler – läuft arr-ws-bridge.js?","err"); };
    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.type==="status" && msg.msg==="ssh_connected") { appendLine("✅ SSH verbunden","ok"); setSshReady(true); }
      if (msg.type==="stdout") appendLine(msg.data.trimEnd(),"out");
      if (msg.type==="stderr") appendLine(msg.data.trimEnd(),"err");
      if (msg.type==="done")   { appendLine(`[exit ${msg.code}]`, msg.code===0?"ok":"err"); setBusy(false); }
      if (msg.type==="error")  { appendLine(`Fehler: ${msg.msg}`,"err"); setBusy(false); }
    };
  }, [ssh, appendLine]);

  const disconnect = useCallback(() => { wsRef.current?.close(); }, []);

  const sendCmd = useCallback((cmd) => {
    if (!wsRef.current || wsRef.current.readyState!==1) { appendLine("⚠️  Nicht verbunden","err"); return false; }
    wsRef.current.send(JSON.stringify({ cmd }));
    appendLine(`$ ${cmd}`, "info");
    return true;
  }, [appendLine]);

  const runSequence = useCallback(async (cmds, onDone) => {
    if (busy) return;
    setBusy(true);
    let i = 0;
    const next = () => {
      if (i >= cmds.length) { setBusy(false); onDone?.(); return; }
      const cmd = cmds[i++];
      if (cmd.startsWith("#")) { appendLine(cmd,"info"); next(); return; }
      const sent = sendCmd(cmd);
      if (!sent) { setBusy(false); return; }
    };
    // listen for done events to chain commands
    const origOnMsg = wsRef.current.onmessage;
    wsRef.current.onmessage = e => {
      origOnMsg(e);
      const msg = JSON.parse(e.data);
      if (msg.type==="done") {
        if (msg.code!==0) { setBusy(false); appendLine("❌ Abgebrochen (Fehler)","err"); wsRef.current.onmessage=origOnMsg; return; }
        next();
      }
      if (msg.type==="error") { setBusy(false); wsRef.current.onmessage=origOnMsg; }
    };
    next();
  }, [busy, sendCmd, appendLine]);

  const runCapture = useCallback((cmd, onResult, silent=false) => {
    if (!wsRef.current || wsRef.current.readyState!==1) { appendLine("⚠️  Nicht verbunden","err"); return; }
    if (busy) return;
    setBusy(true);
    let stdout = "";
    if (!silent) appendLine(`$ ${cmd}`,"info");
    wsRef.current.send(JSON.stringify({ cmd }));
    const origOnMsg = wsRef.current.onmessage;
    wsRef.current.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.type==="stdout") { stdout += msg.data; if (!silent) appendLine(msg.data.trimEnd(),"out"); }
      if (msg.type==="stderr") { if (!silent) appendLine(msg.data.trimEnd(),"err"); }
      if (msg.type==="done")  { setBusy(false); wsRef.current.onmessage=origOnMsg; if (!silent) appendLine(`[exit ${msg.code}]`,msg.code===0?"ok":"err"); onResult(msg.code===0?stdout.trim():null); }
      if (msg.type==="error") { setBusy(false); wsRef.current.onmessage=origOnMsg; onResult(null); }
    };
  }, [busy, appendLine]);

  const clearLog = useCallback(() => setLines([]), []);

  return { connected, sshReady, lines, busy, connect, disconnect, sendCmd, runSequence, runCapture, appendLine, clearLog };
}

// ── pct create helper ─────────────────────────────────────────────────────
function pctCreate(svc, pve, volumes) {
  const ip = svc.ip ? `${svc.ip}/${pve.subnetCidr},gw=${svc.gw||pve.defaultGw}` : "dhcp";
  const hasDl = ["qbittorrent","sabnzbd","nzbget"].includes(svc.id);
  return [
    `pct create ${svc.vmid} ${pve.osTemplate}`,
    `  --hostname ${svc.id} --cores ${svc.cores} --memory ${svc.mem} --swap 128`,
    `  --storage ${pve.storage} --rootfs ${pve.storage}:${svc.disk}`,
    `  --net0 name=eth0,bridge=${pve.bridge},ip=${ip}`,
    `  --nameserver ${pve.nameserver} --features nesting=1`,
    `  --unprivileged ${pve.unprivileged?1:0}`,
    `  --start 0 --onboot ${(svc.startOnBoot??pve.startOnBoot)?1:0} --ostype ${pve.osType}`,
    `  --mp0 ${volumes.baseConfigPath}/${svc.id},mp=/config`,
    svc.mediaPath?`  --mp1 ${volumes.baseMediaPath},mp=/data`:"",
    hasDl?`  --mp2 ${volumes.baseDownloadPath},mp=/downloads`:"",
  ].filter(Boolean).join(" \\\n");
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const [services,   setServices]   = useState(DEFAULT_SERVICES);
  const [network,    setNetwork]    = useState(DEFAULT_NETWORK);
  const [volumes,    setVolumes]    = useState(DEFAULT_VOLUMES);
  const [ssh,        setSsh]        = useState(DEFAULT_SSH);
  const [pve,        setPve]        = useState(DEFAULT_PVE);
  const [tab,        setTab]        = useState("config");
  const [editId,     setEditId]     = useState(null);
  const [editBuf,    setEditBuf]    = useState({});
  const [lxcSub,     setLxcSub]    = useState("global");
  const [selSvc,     setSelSvc]    = useState(null);
  const [saveState,  setSaveState] = useState("idle");
  const [deploying,  setDeploying] = useState({});
  const [sshOpen,    setSshOpen]   = useState(false);
  const [volOpen,    setVolOpen]   = useState(false);
  const [pveOpen,    setPveOpen]   = useState(false);
  const [destroying, setDestroying] = useState({});
  const [storageList, setStorageList] = useState(PVE_STORAGE_OPTS);
  const consoleRef = useRef(null);

  const console_ = useSSHConsole(ssh);

  // auto-scroll terminal
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [console_.lines]);

  // Storage-Liste vom Host abfragen sobald SSH bereit
  const fetchStorages = useCallback((silent=false) => {
    console_.runCapture("pvesm status 2>/dev/null | awk 'NR>1 {print $1}'", result => {
      if (result) {
        const list = result.split('\n').map(s=>s.trim()).filter(Boolean);
        if (list.length > 0) { setStorageList(list); if (!list.includes(pve.storage)) setPve(p=>({...p,storage:list[0]})); }
      }
    }, silent);
  }, [console_, pve.storage]);

  useEffect(() => { if (console_.sshReady) fetchStorages(true); }, [console_.sshReady]);

  const updateSvc = (id,ch) => setServices(p=>p.map(s=>s.id===id?{...s,...ch}:s));
  const openEdit  = svc => { setEditBuf({...svc}); setEditId(svc.id); };
  const saveEdit  = ()  => { updateSvc(editId,editBuf); setEditId(null); };

  const handleSave = () => {
    try {
      localStorage.setItem("arr-tool-config", JSON.stringify({ services,network,volumes,ssh,pve }));
      setSaveState("saved");
    } catch { setSaveState("error"); }
    setTimeout(()=>setSaveState("idle"),2500);
  };
  const handleLoad = () => {
    try {
      const raw = localStorage.getItem("arr-tool-config");
      if (raw) {
        const d = JSON.parse(raw);
        if (d.services) setServices(d.services);
        if (d.network)  setNetwork(d.network);
        if (d.volumes)  setVolumes(d.volumes);
        if (d.ssh)      setSsh(d.ssh);
        if (d.pve)      setPve(d.pve);
      }
    } catch {}
  };
  useState(()=>{ handleLoad(); });

  const handleExportConfig = () => {
    const configData = {
      pve,
      volumes,
      services: services.map(svc => ({
        id: svc.id,
        name: svc.name,
        enabled: svc.enabled,
        port: svc.port,
        vmid: svc.vmid,
        cores: svc.cores,
        mem: svc.mem,
        disk: svc.disk,
        ip: svc.ip || "",
        gw: svc.gw || "",
        mediaPath: svc.mediaPath || "",
        ...(["qbittorrent","sabnzbd"].includes(svc.id) ? { downloadPath: volumes.baseDownloadPath } : {}),
        startOnBoot: svc.startOnBoot ?? true,
      })),
    };
    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "services.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const deployService = (svc) => {
    setDeploying(p=>({...p,[svc.id]:"running"}));
    setTab("config");
    const cmds = buildDeployCommands(svc, pve, volumes);
    console_.runSequence(cmds, () => {
      setDeploying(p=>({...p,[svc.id]:"done"}));
    });
  };

  const destroyService = (svc) => {
    if (!window.confirm(`Container ${svc.name} (VMID ${svc.vmid}) wirklich stoppen und löschen?`)) return;
    setDestroying(p=>({...p,[svc.id]:"running"}));
    setTab("config");
    const cmds = [
      `# ── Destroy ${svc.name} (VMID ${svc.vmid}) ──`,
      `bash -c 'pct stop ${svc.vmid} 2>/dev/null; for i in $(seq 1 15); do pct destroy ${svc.vmid} --purge 2>/dev/null && exit 0; echo "Warte auf Stop ($i/15)..."; sleep 2; done; pct destroy ${svc.vmid} --purge'`,
      `echo "🗑 ${svc.name} (VMID ${svc.vmid}) gelöscht"`,
    ];
    console_.runSequence(cmds, () => {
      setDestroying(p=>({...p,[svc.id]:"done"}));
    });
  };

  const enabled = services.filter(s=>s.enabled);

  const TABS = [
    ["overview","📋 Übersicht"],["config","⚙️ Services"],
    ["lxc","🖥 Proxmox LXC"],
    ["ssh","📦 WS-Bridge"],
    ["compose","🐳 Compose"],
  ];

  return (
    <div style={st.app}>
      {/* HEADER */}
      <div style={st.hdr}>
        <h1 style={st.title}>🚀 *arr Deployment Tool</h1>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <span style={st.bdg(console_.connected?"#22c55e":"#64748b")}>
            {console_.connected?"🟢 Console verbunden":"⚫ Console getrennt"}
          </span>
          {ssh.host&&<span style={st.bdg("#22c55e")}>SSH: {ssh.user}@{ssh.host}</span>}
          <span style={st.bdg("#a78bfa")}>PVE: {pve.node}</span>
          <span style={{fontSize:13,color:"#64748b"}}>{enabled.length}/{services.length} aktiv</span>
          <button onClick={handleSave} style={{background:saveState==="saved"?"#22c55e22":saveState==="error"?"#ef444422":"#3b82f622",border:`1px solid ${saveState==="saved"?"#22c55e":saveState==="error"?"#ef4444":"#3b82f6"}`,color:saveState==="saved"?"#22c55e":saveState==="error"?"#ef4444":"#60a5fa",borderRadius:8,padding:"6px 16px",cursor:"pointer",fontSize:13,fontWeight:600,transition:"all .2s"}}>
            {saveState==="saved"?"✓ Gespeichert!":saveState==="error"?"✗ Fehler":"💾 Speichern"}
          </button>
          <button onClick={handleExportConfig} style={{background:"#f59e0b22",border:"1px solid #f59e0b44",color:"#f59e0b",borderRadius:8,padding:"6px 16px",cursor:"pointer",fontSize:13,fontWeight:600,transition:"all .2s"}}>
            📤 Export Config
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={st.tabs}>
        {TABS.map(([k,l])=><button key={k} style={st.tab(tab===k)} onClick={()=>setTab(k)}>{l}</button>)}
      </div>

      <div style={st.body}>

        {/* ── OVERVIEW ── */}
        {tab==="overview"&&<>
          <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
            {[["Aktiv",enabled.length,"#22c55e"],["LXC-VMs",enabled.length,"#a78bfa"],["PVE-Node",pve.node,"#60a5fa"],["WS-Port",ssh.wsPort||2222,"#f59e0b"]].map(([l,v,c])=>(
              <div key={l} style={st.stat}><div style={{fontSize:20,fontWeight:700,color:c,wordBreak:"break-all"}}>{v}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>{l}</div></div>
            ))}
          </div>
          {services.map(svc=>(
            <div key={svc.id} style={{...st.card,opacity:svc.enabled?1:0.45}}>
              <div style={st.row}>
                <div style={st.sname}>
                  <span style={{fontSize:20}}>{svc.icon}</span> {svc.name}
                  {svc.enabled?<span style={st.bdg("#a78bfa")}>VMID {svc.vmid}</span>:<span style={{fontSize:10,color:"#475569",background:"#1e293b",padding:"2px 7px",borderRadius:4}}>OFF</span>}
                  {deploying[svc.id]==="running"&&<span style={st.bdg("#f59e0b")}>⏳ deploying…</span>}
                  {deploying[svc.id]==="done"   &&<span style={st.bdg("#22c55e")}>✅ deployed</span>}
                  {deploying[svc.id]==="error"  &&<span style={st.bdg("#ef4444")}>❌ Fehler</span>}
                </div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {svc.enabled&&<a href={`http://${svc.ip||ssh.host||"localhost"}:${svc.port}`} target="_blank" rel="noreferrer" style={{...st.btn("#60a5fa"),textDecoration:"none"}}>🌐 UI</a>}
                  <button style={st.btn(svc.enabled?"#ef4444":"#22c55e")} onClick={()=>updateSvc(svc.id,{enabled:!svc.enabled})}>
                    {svc.enabled?"⏼ OFF":"⏻ ON"}
                  </button>
                  {svc.enabled&&(
                    <button
                      style={{...st.btn(console_.connected?"#a78bfa":"#475569"),opacity:console_.connected?1:0.5}}
                      disabled={!console_.connected||console_.busy}
                      onClick={()=>deployService(svc)}
                      title={!console_.connected?"Console nicht verbunden – SSH/Console Tab öffnen":"LXC deployen"}
                    >
                      {deploying[svc.id]==="running"?"⏳ läuft…":"🚀 Deploy"}
                    </button>
                  )}
                </div>
              </div>
              {svc.enabled&&(
                <div style={{marginTop:8,display:"flex",gap:14,flexWrap:"wrap"}}>
                  {[["Port",svc.port],["VMID",svc.vmid],["RAM",svc.mem+"MB"],["Cores",svc.cores],["IP",svc.ip||"DHCP"]].map(([k,v])=>(
                    <span key={k} style={{fontSize:12,color:"#64748b"}}>{k}: <span style={{color:"#94a3b8"}}>{v}</span></span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>}

        {/* ── SERVICE CONFIG ── */}
        {tab==="config"&&<>
          {/* ── SSH Console (eingebettet) ── */}
          <div style={{...st.card,marginBottom:16}}>
            {/* Console-Header */}
            <div style={{...st.row,marginBottom:8}}>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span style={st.sec}>SSH Console</span>
                <span style={st.bdg(console_.connected?"#22c55e":"#64748b")}>{console_.connected?"verbunden":"getrennt"}</span>
                {console_.busy&&<span style={st.bdg("#f59e0b")}>⏳ läuft…</span>}
                <span style={{fontSize:12,color:"#475569"}}>wss://{ssh.host||"<host>"}:{ssh.wsPort||2222}</span>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button style={st.btn("#22c55e")} onClick={console_.connect} disabled={console_.connected}>🔌 Verbinden</button>
                <button style={st.btn("#ef4444")} onClick={console_.disconnect} disabled={!console_.connected}>⏹ Trennen</button>
                <button style={st.btn("#64748b")} onClick={console_.clearLog}>🗑 Leeren</button>
              </div>
            </div>
            {/* SSH-Einstellungen */}
            <div style={{...st.row,marginTop:8,marginBottom:sshOpen?14:8,cursor:"pointer"}} onClick={()=>setSshOpen(o=>!o)}>
              <span style={st.sec}>SSH-Einstellungen</span>
              <span style={{fontSize:13,color:"#475569",transition:"transform .2s",display:"inline-block",transform:sshOpen?"rotate(90deg)":"rotate(0deg)"}}>›</span>
            </div>
            {sshOpen&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))",gap:10,marginBottom:14}}>
              <div style={{gridColumn:"1/-1"}}><label style={st.lbl}>Proxmox Host (IP/Domain)</label><input style={{...st.inp,borderColor:ssh.host?"#3b82f644":"#ef444444"}} placeholder="192.168.1.100" value={ssh.host} onChange={e=>setSsh(v=>({...v,host:e.target.value}))}/></div>
              <div><label style={st.lbl}>Benutzer</label><input style={st.inp} value={ssh.user} onChange={e=>setSsh(v=>({...v,user:e.target.value}))}/></div>
              <div><label style={st.lbl}>SSH-Port</label><input style={st.inp} value={ssh.port} onChange={e=>setSsh(v=>({...v,port:e.target.value}))}/></div>
              <div><label style={st.lbl}>WS-Bridge Port</label><input style={st.inp} value={ssh.wsPort||"2222"} onChange={e=>setSsh(v=>({...v,wsPort:e.target.value}))}/></div>
              <div style={{gridColumn:"1/-1",display:"flex",alignItems:"center",gap:12}}><Toggle value={ssh.useKey} onChange={v=>setSsh(s=>({...s,useKey:v}))}/><span style={{fontSize:13,color:"#94a3b8"}}>SSH-Key verwenden</span></div>
              {ssh.useKey&&<div style={{gridColumn:"1/-1"}}><label style={st.lbl}>Key-Pfad (lokal)</label><input style={st.inp} value={ssh.keyPath} onChange={e=>setSsh(v=>({...v,keyPath:e.target.value}))}/></div>}
            </div>}
            <div ref={consoleRef} style={{...st.term,height:260}}>
              {console_.lines.length===0&&<span style={{color:"#475569"}}>Noch keine Ausgabe. Verbinden und Service deployen.</span>}
              {console_.lines.map((l,i)=>(
                <div key={i} style={{color:l.color}}>
                  <span style={{color:"#334155",userSelect:"none"}}>[{l.ts}] </span>{l.text}
                </div>
              ))}
              {console_.busy&&<div style={{color:"#f59e0b"}}>█</div>}
            </div>
            <div style={{marginTop:10,display:"flex",gap:8,flexWrap:"wrap"}}>
              {enabled.map(svc=>(
                <button key={svc.id} style={{...st.btn(deploying[svc.id]==="done"?"#22c55e":deploying[svc.id]==="running"?"#f59e0b":console_.connected?"#a78bfa":"#475569"),opacity:console_.connected?1:0.5}} disabled={!console_.connected||console_.busy} onClick={()=>deployService(svc)}>
                  {svc.icon} {deploying[svc.id]==="running"?"⏳":deploying[svc.id]==="done"?"✅":""} {svc.name}
                </button>
              ))}
            </div>
          </div>

          <div style={{...st.card,marginBottom:16}}>
            <div style={{...st.row,cursor:"pointer"}} onClick={()=>setVolOpen(o=>!o)}>
              <span style={st.sec}>Volumes-Konfiguration</span>
              <span style={{fontSize:13,color:"#475569",transition:"transform .2s",display:"inline-block",transform:volOpen?"rotate(90deg)":"rotate(0deg)"}}>›</span>
            </div>
            {volOpen&&<>
              <div style={{marginTop:14}}>
                <div style={{fontSize:11,color:"#60a5fa",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Basis-Pfade</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))",gap:14}}>
                  {[["Config-Basispfad","baseConfigPath"],["Media-Basispfad","baseMediaPath"],["Download-Basispfad","baseDownloadPath"]].map(([l,k])=>(
                    <div key={k} style={{gridColumn:k==="baseConfigPath"?"1/-1":"auto"}}><label style={st.lbl}>{l}</label><input style={st.inp} value={volumes[k]} onChange={e=>setVolumes(v=>({...v,[k]:e.target.value}))}/></div>
                  ))}
                </div>
              </div>
              <div style={{marginTop:18,paddingTop:14,borderTop:"1px solid #ffffff0a"}}>
                <div style={{fontSize:11,color:"#60a5fa",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Umgebungsvariablen</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))",gap:14}}>
                  {[["PUID","puid"],["PGID","pgid"],["Timezone","tz"]].map(([l,k])=>(
                    <div key={k}><label style={st.lbl}>{l}</label><input style={st.inp} value={volumes[k]} onChange={e=>setVolumes(v=>({...v,[k]:e.target.value}))}/></div>
                  ))}
                </div>
              </div>
              <div style={{marginTop:18,paddingTop:14,borderTop:"1px solid #ffffff0a"}}>
                <div style={{fontSize:11,color:"#60a5fa",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Verzeichnisse erstellen</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button style={{...st.btn(console_.connected?"#22c55e":"#475569"),opacity:console_.connected?1:0.5}} disabled={!console_.connected||console_.busy} onClick={()=>console_.runSequence([`# ── Basis-Pfade erstellen ──`,`mkdir -p ${volumes.baseConfigPath} ${volumes.baseMediaPath} ${volumes.baseDownloadPath}`,`echo "✅ Basis-Pfade erstellt"`])}>📁 Basis-Pfade erstellen</button>
                  <button style={{...st.btn(console_.connected?"#a78bfa":"#475569"),opacity:console_.connected?1:0.5}} disabled={!console_.connected||console_.busy} onClick={()=>console_.runSequence([`# ── Service Config-Pfade erstellen ──`,...enabled.map(svc=>`mkdir -p ${volumes.baseConfigPath}/${svc.id} && chown 100000:100000 ${volumes.baseConfigPath}/${svc.id}`),`echo "✅ Config-Pfade für ${enabled.length} Services erstellt"`])}>🗂 Service-Pfade erstellen</button>
                  <button style={{...st.btn(console_.connected?"#60a5fa":"#475569"),opacity:console_.connected?1:0.5}} disabled={!console_.connected||console_.busy} onClick={()=>console_.runSequence([`# ── Alle Pfade erstellen ──`,`mkdir -p ${volumes.baseConfigPath} ${volumes.baseMediaPath} ${volumes.baseDownloadPath}`,...enabled.map(svc=>`mkdir -p ${volumes.baseConfigPath}/${svc.id} && chown 100000:100000 ${volumes.baseConfigPath}/${svc.id}`),`echo "✅ Alle Pfade erstellt"`])}>🚀 Alle erstellen</button>
                </div>
              </div>
            </>}
          </div>

          <p style={{color:"#64748b",fontSize:13,marginBottom:16}}>Individuelle Service-Einstellungen & LXC-Ressourcen bearbeiten.</p>
          {services.map(svc=>(
            <div key={svc.id} style={{...st.card,opacity:svc.enabled?1:0.55}}>
              <div style={st.row}>
                <span style={st.sname}>{svc.icon} {svc.name}</span>
                <div style={{display:"flex",gap:6}}>
                  {svc.enabled&&(
                    <button
                      style={{...st.btn(console_.connected?"#22c55e":"#475569"),opacity:console_.connected?1:0.5}}
                      disabled={!console_.connected||console_.busy}
                      onClick={()=>deployService(svc)}
                    >
                      {deploying[svc.id]==="running"?"⏳ läuft…":"🚀 Deploy"}
                    </button>
                  )}
                  <button style={st.btn("#f59e0b")} onClick={()=>openEdit(svc)}>✏️ Bearbeiten</button>
                  {svc.enabled&&API_KEY_CMD[svc.id]&&(
                    <button
                      style={{...st.btn(console_.connected?"#f59e0b":"#475569"),opacity:console_.connected?1:0.5}}
                      disabled={!console_.connected||console_.busy}
                      onClick={()=>console_.runCapture(API_KEY_CMD[svc.id](svc.vmid),key=>{
                        if(key){updateSvc(svc.id,{apiKey:key});console_.appendLine(`🔑 API-Key für ${svc.name} gesetzt: ${key}`,"ok");}
                        else{console_.appendLine(`⚠️  Kein API-Key gefunden (Container läuft? Schon gestartet?)`, "err");}
                      })}
                      title="API-Key aus laufendem Container auslesen"
                    >🔑 API-Key</button>
                  )}
                  <button style={st.btn(svc.enabled?"#f59e0b":"#22c55e")} onClick={()=>updateSvc(svc.id,{enabled:!svc.enabled})}>
                    {svc.enabled?"⏼ OFF":"⏻ ON"}
                  </button>
                  {svc.enabled&&(
                    <button
                      style={{...st.btn(console_.connected?"#ef4444":"#475569"),opacity:console_.connected?1:0.5}}
                      disabled={!console_.connected||console_.busy}
                      onClick={()=>destroyService(svc)}
                      title={`VMID ${svc.vmid} stoppen & löschen`}
                    >
                      {destroying[svc.id]==="running"?"⏳ läuft…":"🗑 Destroy"}
                    </button>
                  )}
                </div>
              </div>
              <div style={{marginTop:10,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
                {[["Port",svc.port],["VMID",svc.vmid],["Cores",svc.cores],["RAM",svc.mem+"MB"],["Disk",svc.disk+"GB"],["IP",svc.ip||"DHCP"],["API-Key",svc.apiKey?"••••":"—"]].map(([k,v])=>(
                  <div key={k}><div style={{fontSize:10,color:"#475569",textTransform:"uppercase"}}>{k}</div><div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{v}</div></div>
                ))}
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <Toggle value={svc.startOnBoot??true} onChange={v=>updateSvc(svc.id,{startOnBoot:v})}/>
                  <span style={{fontSize:11,color:"#64748b",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>Start on Boot</span>
                </div>
              </div>
            </div>
          ))}
        </>}

        {/* ── PROXMOX LXC ── */}
        {tab==="lxc"&&<>
          <div style={{display:"flex",gap:6,marginBottom:18,flexWrap:"wrap"}}>
            {[["global","⚙️ PVE-Einstellungen"],["create","🛠 pct create"],["conf","📄 .conf Dateien"],["setup","📦 Container-Setup"],["script","📜 Full Deploy Script"],["apikeys","🔑 API-Keys"]].map(([k,l])=>(
              <button key={k} style={{...st.btn(lxcSub===k?"#a78bfa":"#64748b"),background:lxcSub===k?"#2d1a4d":"transparent"}} onClick={()=>setLxcSub(k)}>{l}</button>
            ))}
          </div>

          {lxcSub==="global"&&<>
            <div style={st.card}>
              <div style={{...st.row,cursor:"pointer"}} onClick={()=>setPveOpen(o=>!o)}>
                <span style={st.sec}>Proxmox-Konfiguration</span>
                <span style={{fontSize:13,color:"#475569",transition:"transform .2s",display:"inline-block",transform:pveOpen?"rotate(90deg)":"rotate(0deg)"}}>›</span>
              </div>
              {pveOpen&&<>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))",gap:14,marginTop:14}}>
                {[["Node-Name","node"],["Bridge","bridge"],["Default Gateway","defaultGw"],["Nameserver","nameserver"],["Subnetz-Prefix","subnetCidr"],["OS-Typ","osType"]].map(([l,k])=>(
                  <div key={k}><label style={st.lbl}>{l}</label><input style={st.inp} value={pve[k]} onChange={e=>setPve(p=>({...p,[k]:e.target.value}))}/></div>
                ))}
                <div style={{gridColumn:"1/-1"}}>
                  <label style={st.lbl}>Storage</label>
                  <div style={{display:"flex",gap:8}}>
                    <select style={{...st.inp,flex:1}} value={pve.storage} onChange={e=>setPve(p=>({...p,storage:e.target.value}))}>
                      {storageList.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                    <button style={{...st.btn(console_.connected?"#60a5fa":"#475569"),opacity:console_.connected?1:0.5,whiteSpace:"nowrap"}} disabled={!console_.connected||console_.busy} onClick={fetchStorages} title="Storage-Liste vom Host aktualisieren">🔄 Aktualisieren</button>
                  </div>
                </div>
                <div style={{gridColumn:"1/-1"}}><label style={st.lbl}>OS-Template</label><input style={st.inp} value={pve.osTemplate} onChange={e=>setPve(p=>({...p,osTemplate:e.target.value}))}/></div>
              </div>
              <div style={{marginTop:14,display:"flex",gap:24}}>
                {[["Unprivileged","unprivileged"],["Start on Boot","startOnBoot"]].map(([l,k])=>(
                  <label key={k} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:13,color:"#94a3b8"}}>
                    <Toggle value={pve[k]} onChange={v=>setPve(p=>({...p,[k]:v}))}/> {l}
                  </label>
                ))}
              </div>
              </>}
            </div>
            <div style={st.card}>
              <div style={st.sec}>Pro-Service Ressourcen & IP</div>
              {enabled.map(svc=>(
                <div key={svc.id} style={{padding:"12px 0",borderBottom:"1px solid #ffffff08"}}>
                  <div style={{fontWeight:600,fontSize:13,color:"#94a3b8",marginBottom:8}}>{svc.icon} {svc.name} <span style={st.bdg("#a78bfa")}>VMID {svc.vmid}</span></div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
                    {[["VMID","vmid","number"],["Cores","cores","number"],["RAM (MB)","mem","number"],["Disk (GB)","disk","number"],["Statische IP","ip","text"],["Gateway","gw","text"]].map(([l,k,t])=>(
                      <div key={k}><label style={st.lbl}>{l}</label><input style={st.inp} type={t} value={svc[k]||""} onChange={e=>updateSvc(svc.id,{[k]:t==="number"?+e.target.value:e.target.value})} placeholder={k==="ip"?"DHCP":k==="gw"?pve.defaultGw:""}/></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>}

          {lxcSub==="create"&&<>
            <CodeBlock code={`pveam update\npveam download local debian-12-standard_12.7-1_amd64.tar.zst`} title="0. OS-Template"/>
            <CodeBlock code={`mkdir -p ${volumes.baseConfigPath} ${volumes.baseMediaPath} ${volumes.baseDownloadPath}\n${enabled.map(s=>`mkdir -p ${volumes.baseConfigPath}/${s.id}`).join("\n")}`} title="1. Verzeichnisse"/>
            {enabled.map(svc=><CodeBlock key={svc.id} title={`${svc.icon} ${svc.name} (VMID ${svc.vmid})`} code={pctCreate(svc,pve,volumes)}/>)}
          </>}

          {lxcSub==="conf"&&<>
            <p style={{color:"#64748b",fontSize:13,marginBottom:16}}>Fertige <code style={{color:"#a5f3fc"}}>.conf</code>-Dateien für <code style={{color:"#a5f3fc"}}>/etc/pve/lxc/</code>.</p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
              {enabled.map(svc=><button key={svc.id} style={{...st.btn(selSvc===svc.id?"#a78bfa":"#64748b"),background:selSvc===svc.id?"#2d1a4d":"transparent"}} onClick={()=>setSelSvc(selSvc===svc.id?null:svc.id)}>{svc.icon} {svc.name}</button>)}
            </div>
            {(selSvc?enabled.filter(s=>s.id===selSvc):enabled).map(svc=>{
              const ip=svc.ip?`${svc.ip}/${pve.subnetCidr},gw=${svc.gw||pve.defaultGw}`:"dhcp";
              const hasDl=["qbittorrent","sabnzbd","nzbget"].includes(svc.id);
              const conf=`arch: amd64\ncores: ${svc.cores}\nmemory: ${svc.mem}\nswap: 128\nhostname: ${svc.id}\nostype: ${pve.osType}\nrootfs: ${pve.storage}:${svc.disk}\nnet0: name=eth0,bridge=${pve.bridge},ip=${ip},firewall=0\nfeatures: nesting=1\nunprivileged: ${pve.unprivileged?1:0}\nonboot: ${pve.startOnBoot?1:0}\nnameserver: ${pve.nameserver}\nmp0: ${volumes.baseConfigPath}/${svc.id},mp=/config${svc.mediaPath?`\nmp1: ${volumes.baseMediaPath},mp=/data`:""}${hasDl?`\nmp2: ${volumes.baseDownloadPath},mp=/downloads`:""}`;
              return <CodeBlock key={svc.id} title={`/etc/pve/lxc/${svc.vmid}.conf`} code={conf}/>;
            })}
          </>}

          {lxcSub==="setup"&&<>
            <p style={{color:"#64748b",fontSize:13,marginBottom:16}}>Native Installation ohne Docker – direkt als systemd-Service.</p>
            {enabled.map(svc=>{
              const hasMedia=!!svc.mediaPath;
              const hasDl=["qbittorrent","sabnzbd","nzbget"].includes(svc.id);
              const bin=(BINARY_PATHS[svc.id]?.(svc))||`/opt/${svc.id}/${svc.id}`;
              const dirs=`/config${hasMedia?" /data":""}${hasDl?" /downloads":""}`;
              const unitFile=`[Unit]\nDescription=${svc.name}\nAfter=network.target\n\n[Service]\nType=simple\nUser=${svc.id}\nGroup=${svc.id}\nEnvironment=TZ=${volumes.tz}\n${svc.apiKey?`Environment=API_KEY=${svc.apiKey}\n`:""}ExecStart=${bin}\nRestart=on-failure\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target`;
              const script=[
                `# ── Native Setup für ${svc.name} (VMID ${svc.vmid}) ──`,
                `pct exec ${svc.vmid} -- bash -c '`,
                `set -e`,``,
                `apt-get update -qq && apt-get install -y -qq curl ca-certificates libicu-dev`,
                `useradd -r -s /bin/false ${svc.id} 2>/dev/null || true`,
                `mkdir -p ${dirs} && chown -R ${svc.id}:${svc.id} ${dirs}`,
                INSTALL_CMDS[svc.id]||`echo "kein installer für ${svc.id}"`,
                `chown -R ${svc.id}:${svc.id} /opt/${svc.id} 2>/dev/null || true`,
                `cat > /etc/systemd/system/${svc.id}.service <<EOF\n${unitFile}\nEOF`,
                `systemctl daemon-reload && systemctl enable --now ${svc.id}`,
                `echo "✅ ${svc.name} läuft auf Port ${svc.port}"`,`'`,
              ].join("\n");
              return <CodeBlock key={svc.id} title={`${svc.icon} ${svc.name}`} code={script}/>;
            })}
          </>}

          {lxcSub==="script"&&<>
            <p style={{color:"#64748b",fontSize:13,marginBottom:12}}>Vollständiges Bash-Skript. <code style={{color:"#a5f3fc"}}>chmod +x deploy-lxc.sh && ./deploy-lxc.sh</code></p>
            <CodeBlock title="deploy-lxc.sh" code={(() => {
              const sshCmd=ssh.host?(ssh.useKey?`ssh -i ${ssh.keyPath} -p ${ssh.port} ${ssh.user}@${ssh.host}`:`ssh -p ${ssh.port} ${ssh.user}@${ssh.host}`):"ssh root@<PROXMOX-HOST>";
              const svcBlock=svc=>{
                const hasMedia=!!svc.mediaPath;const hasDl=["qbittorrent","sabnzbd","nzbget"].includes(svc.id);
                const bin=(BINARY_PATHS[svc.id]?.(svc))||`/opt/${svc.id}/${svc.id}`;
                const dirs=`/config${hasMedia?" /data":""}${hasDl?" /downloads":""}`;
                const unitFile=`[Unit]\\nDescription=${svc.name}\\nAfter=network.target\\n\\n[Service]\\nType=simple\\nUser=${svc.id}\\nGroup=${svc.id}\\nEnvironment=TZ=${volumes.tz}\\n${svc.apiKey?`Environment=API_KEY=${svc.apiKey}\\n`:""}ExecStart=${bin}\\nRestart=on-failure\\nRestartSec=5\\n\\n[Install]\\nWantedBy=multi-user.target`;
                return [`# ── ${svc.icon} ${svc.name} (VMID ${svc.vmid}) ──`,`$SSH "mkdir -p ${volumes.baseConfigPath}/${svc.id}"`,`$SSH "${pctCreate(svc,pve,volumes).replace(/\\\n/g," ").replace(/"/g,'\\"')}"`,`$SSH "pct start ${svc.vmid} && sleep 6"`,`$SSH "pct exec ${svc.vmid} -- bash -c 'set -e; apt-get update -qq && apt-get install -y -qq curl ca-certificates libicu-dev'"`,`$SSH "pct exec ${svc.vmid} -- bash -c 'useradd -r -s /bin/false ${svc.id} 2>/dev/null || true'"`,`$SSH "pct exec ${svc.vmid} -- bash -c 'mkdir -p ${dirs} && chown -R ${svc.id}:${svc.id} ${dirs}'"`,`$SSH "pct exec ${svc.vmid} -- bash -c '${(INSTALL_CMDS[svc.id]||"echo no installer").replace(/'/g,"'\\''")}'"`
                ,`$SSH "pct exec ${svc.vmid} -- bash -c 'printf \\"${unitFile}\\" > /etc/systemd/system/${svc.id}.service'"`,`$SSH "pct exec ${svc.vmid} -- bash -c 'systemctl daemon-reload && systemctl enable --now ${svc.id}'"`,`$SSH "echo '✅ ${svc.name} – VMID ${svc.vmid}, Port ${svc.port}'"`,``].join("\n");};
              return `#!/bin/bash\n# *arr LXC Native Deploy – ${new Date().toLocaleString("de-DE")}\nset -e\nSSH="${sshCmd}"\n\n$SSH "pveam update && pveam download local debian-12-standard_12.7-1_amd64.tar.zst 2>/dev/null || true"\n$SSH "mkdir -p ${volumes.baseConfigPath} ${volumes.baseMediaPath} ${volumes.baseDownloadPath}"\n\n${enabled.map(svcBlock).join("\n")}\necho "🎉 Deploy abgeschlossen!"\n$SSH "pct list"`;
            })()}/>
          </>}

          {lxcSub==="apikeys"&&<>
            <p style={{color:"#64748b",fontSize:13,marginBottom:16}}>API-Keys aus laufenden Containern auslesen.</p>
            {enabled.filter(s=>!["qbittorrent","flaresolverr","sabnzbd","nzbget"].includes(s.id)).map(svc=>{
              const cmd=svc.id==="overseerr"?`pct exec ${svc.vmid} -- bash -c "cat /config/settings.json | python3 -c \\"import sys,json; d=json.load(sys.stdin); print('API-Key:', d.get('apiKey','nicht gefunden'))\\""`
                :svc.id==="tautulli"?`pct exec ${svc.vmid} -- bash -c "grep -i 'api_key' /config/config.ini"`
                :svc.id==="plex"?`pct exec ${svc.vmid} -- bash -c "grep -o 'PlexOnlineToken=\\"[^\\"]*\\"' /config/Preferences.xml"`
                :svc.id==="jellyfin"?`pct exec ${svc.vmid} -- bash -c "grep -o '<ApiKey>[^<]*</ApiKey>' /config/data/system.xml | head -1"`
                :`pct exec ${svc.vmid} -- bash -c "grep -o '<ApiKey>[^<]*</ApiKey>' /config/config.xml | sed 's/<[^>]*>//g'"`;
              return <CodeBlock key={svc.id} title={`${svc.icon} ${svc.name} (VMID ${svc.vmid})`} code={cmd}/>;
            })}
            <CodeBlock title="Alle API-Keys auf einmal" code={[`set -e`,...enabled.filter(s=>!["qbittorrent","flaresolverr","sabnzbd","nzbget","overseerr","plex","tautulli","jellyfin"].includes(s.id)).map(s=>`echo "${s.icon} ${s.name}:"; pct exec ${s.vmid} -- bash -c "grep -o '<ApiKey>[^<]*</ApiKey>' /config/config.xml | sed 's/<[^>]*>//g'" 2>/dev/null || echo "  → noch nicht verfügbar"`)].join("\n")}/>
            <div style={{...st.card,background:"#1a1a0f",border:"1px solid #f59e0b44",marginTop:8}}>
              <div style={{fontSize:12,color:"#f59e0b",fontWeight:600,marginBottom:6}}>⚠️ Hinweis</div>
              <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.7}}>Die <code style={{color:"#a5f3fc"}}>config.xml</code> wird erst beim ersten Start des Services erzeugt. Warte ~30–60 Sekunden nach Container-Start.</div>
            </div>
          </>}
        </>}


        {/* ── SSH / CONSOLE ── */}
        {tab==="ssh"&&<>
          <div style={{...st.card,background:"#0f1a0f",border:"1px solid #22c55e33",marginBottom:16}}>
            <div style={{fontSize:13,color:"#22c55e",fontWeight:600,marginBottom:6}}>ℹ️ So funktioniert die SSH-Console</div>
            <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.8}}>
              Da Browser keine direkten SSH-Verbindungen aufbauen können, wird eine kleine <strong style={{color:"#e2e8f0"}}>WebSocket-Bridge</strong> benötigt.<br/>
              Das Bridge-Script <code style={{color:"#a5f3fc"}}>arr-ws-bridge.js</code> befindet sich im separaten Artifact rechts.<br/>
              Auf Proxmox speichern und starten – das Tool verbindet sich dann darüber.
            </div>
          </div>
          <CodeBlock title="1. Abhängigkeiten installieren" code={`cd /opt/arr-bridge\nnpm install ws ssh2`}/>
          <CodeBlock title="2. Script speichern & starten" code={`# arr-ws-bridge.js aus dem Artifact kopieren nach /opt/arr-bridge/arr-ws-bridge.js\nnode /opt/arr-bridge/arr-ws-bridge.js`}/>
          <CodeBlock title="3. Als systemd-Dienst einrichten" code={`cat > /etc/systemd/system/arr-bridge.service << 'EOF'\n[Unit]\nDescription=arr WebSocket SSH Bridge\nAfter=network.target\n\n[Service]\nType=simple\nWorkingDirectory=/opt/arr-bridge\nExecStart=/usr/bin/node arr-ws-bridge.js\nRestart=on-failure\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target\nEOF\n\nsystemctl daemon-reload\nsystemctl enable --now arr-bridge\nsystemctl status arr-bridge`}/>
          <CodeBlock title="4. SSH-Tunnel (auf lokalem Rechner)" code={`ssh -N -L 2222:127.0.0.1:2222 root@<PROXMOX-IP>`}/>
          <div style={{...st.card,background:"#1a1a0f",border:"1px solid #f59e0b44"}}>
            <div style={{fontSize:12,color:"#f59e0b",fontWeight:600,marginBottom:6}}>⚠️ Sicherheitshinweis</div>
            <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.7}}>Die Bridge lauscht nur auf <code style={{color:"#a5f3fc"}}>127.0.0.1</code> – nie direkt ins Internet exponieren. Zugriff immer über SSH-Tunnel.</div>
          </div>
        </>}

        {/* ── COMPOSE ── */}
        {tab==="compose"&&<>
          <div style={{...st.card,marginBottom:16}}>
            <div style={st.sec}>Docker-Netzwerk</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))",gap:14}}>
              {[["Netzwerkname","name"],["Subnetz","subnet"],["Gateway","gateway"]].map(([l,k])=>(
                <div key={k}><label style={st.lbl}>{l}</label><input style={st.inp} value={network[k]} onChange={e=>setNetwork(n=>({...n,[k]:e.target.value}))}/></div>
              ))}
              <div><label style={st.lbl}>Treiber</label><select style={st.inp} value={network.driver} onChange={e=>setNetwork(n=>({...n,driver:e.target.value}))}>{NETWORK_DRIVERS.map(d=><option key={d} value={d}>{d}</option>)}</select></div>
            </div>
            <div style={{marginTop:14,display:"flex",gap:24}}>
              {[["IPv6","enableIPv6"],["Internes Netz","internal"]].map(([l,k])=>(
                <label key={k} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:13,color:"#94a3b8"}}><Toggle value={network[k]} onChange={v=>setNetwork(n=>({...n,[k]:v}))}/> {l}</label>
              ))}
            </div>
          </div>
          <div style={{...st.row,marginBottom:14}}>
            <span style={{color:"#64748b",fontSize:13}}>{enabled.length} Services</span>
            <CopyBtn text={(() => {
              let y=`version: "3.8"\n\nservices:\n`;
              enabled.forEach(svc=>{y+=`\n  ${svc.id}:\n    image: ${svc.image||`lscr.io/linuxserver/${svc.id}:latest`}\n    container_name: ${svc.id}\n    restart: ${svc.restartPolicy}\n`;y+=`    environment:\n      - PUID=${volumes.puid}\n      - PGID=${volumes.pgid}\n      - TZ=${volumes.tz}\n`;if(svc.apiKey)y+=`      - API_KEY=${svc.apiKey}\n`;y+=`    volumes:\n      - ${volumes.baseConfigPath}/${svc.id}:/config\n`;if(svc.mediaPath)y+=`      - ${volumes.baseMediaPath}:/data\n`;if(["qbittorrent","sabnzbd","nzbget"].includes(svc.id))y+=`      - ${volumes.baseDownloadPath}:/downloads\n`;y+=`    ports:\n      - "${svc.port}:${svc.port}"\n    networks:\n      - ${network.name}\n`;});
              y+=`\nnetworks:\n  ${network.name}:\n    driver: ${network.driver}\n`;y+=`\nvolumes:\n`;enabled.forEach(s=>{y+=`  ${s.id}-config:\n    driver: local\n`;});return y;
            })()} label="📋 Kopieren"/>
          </div>
          <pre style={st.pre}>{(() => {
            let y=`version: "3.8"\n\nservices:\n`;
            enabled.forEach(svc=>{y+=`\n  ${svc.id}:\n    image: ${svc.image||`lscr.io/linuxserver/${svc.id}:latest`}\n    container_name: ${svc.id}\n    restart: ${svc.restartPolicy}\n`;y+=`    environment:\n      - PUID=${volumes.puid}\n      - PGID=${volumes.pgid}\n      - TZ=${volumes.tz}\n`;if(svc.apiKey)y+=`      - API_KEY=${svc.apiKey}\n`;y+=`    volumes:\n      - ${volumes.baseConfigPath}/${svc.id}:/config\n`;if(svc.mediaPath)y+=`      - ${volumes.baseMediaPath}:/data\n`;if(["qbittorrent","sabnzbd","nzbget"].includes(svc.id))y+=`      - ${volumes.baseDownloadPath}:/downloads\n`;y+=`    ports:\n      - "${svc.port}:${svc.port}"\n    networks:\n      - ${network.name}\n`;});
            y+=`\nnetworks:\n  ${network.name}:\n    driver: ${network.driver}\n`;y+=`\nvolumes:\n`;enabled.forEach(s=>{y+=`  ${s.id}-config:\n    driver: local\n`;});return y;
          })()}</pre>
        </>}
      </div>

      {/* ── EDIT MODAL ── */}
      {editId&&(
        <div style={st.modal} onClick={e=>e.target===e.currentTarget&&setEditId(null)}>
          <div style={st.mbox}>
            <h3 style={{margin:"0 0 20px",color:"#f1f5f9"}}>{editBuf.icon} {editBuf.name}</h3>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))",gap:14}}>
              {[["Port","port","number"],["VMID","vmid","number"],["Cores","cores","number"],["RAM (MB)","mem","number"],["Disk (GB)","disk","number"],["Statische IP","ip","text"],["Gateway","gw","text"],["Media-Pfad","mediaPath","text"],["API-Key","apiKey","text"]].map(([l,k,t])=>(
                <div key={k} style={{gridColumn:["mediaPath"].includes(k)?"1/-1":"auto"}}>
                  <label style={st.lbl}>{l}</label>
                  <input style={st.inp} type={t} value={editBuf[k]||""} onChange={e=>setEditBuf(b=>({...b,[k]:t==="number"?+e.target.value:e.target.value}))}/>
                </div>
              ))}
              <div style={{display:"flex",alignItems:"center",gap:12,gridColumn:"1/-1"}}><Toggle value={editBuf.startOnBoot??true} onChange={v=>setEditBuf(b=>({...b,startOnBoot:v}))}/><span style={{fontSize:13,color:"#94a3b8"}}>Start on Boot</span></div>
            </div>
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