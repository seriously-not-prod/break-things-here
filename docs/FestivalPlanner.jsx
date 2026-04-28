import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, AreaChart, Area, Legend
} from "recharts";
import {
  Calendar, Users, DollarSign, LayoutDashboard, Settings, LogOut,
  Menu, X, Plus, Edit2, Trash2, Search, Bell, CheckCircle,
  AlertTriangle, Eye, Shield, ChevronDown, Zap, Filter,
  MapPin, Mail, Phone, TrendingUp, ArrowUp, RotateCcw,
  Star, Clock, Upload, Download, UserCheck, CreditCard, BarChart2
} from "lucide-react";

/* ─────────────── THEME ─────────────── */
const T = {
  bg: "#080C14",
  surface: "#0F1623",
  card: "#141C2C",
  cardHover: "#1A2438",
  border: "rgba(255,255,255,0.07)",
  borderHover: "rgba(255,255,255,0.15)",
  primary: "#F97316",
  primaryDark: "#C2410C",
  primaryGlow: "rgba(249,115,22,0.2)",
  violet: "#7C3AED",
  violetGlow: "rgba(124,58,237,0.2)",
  cyan: "#06B6D4",
  cyanGlow: "rgba(6,182,212,0.15)",
  green: "#10B981",
  greenGlow: "rgba(16,185,129,0.15)",
  red: "#EF4444",
  redGlow: "rgba(239,68,68,0.15)",
  amber: "#F59E0B",
  amberGlow: "rgba(245,158,11,0.15)",
  text: "#F1F5F9",
  textSub: "#94A3B8",
  textDim: "#475569",
};

/* ─────────────── CONSTANTS ─────────────── */
const ROLES = ["admin","organizer","collaborator","viewer"];
const ROLE_META = {
  admin:        { label:"Admin",        color: T.red,    bg: T.redGlow },
  organizer:    { label:"Organizer",    color: T.primary, bg: T.primaryGlow },
  collaborator: { label:"Collaborator", color: T.violet,  bg: T.violetGlow },
  viewer:       { label:"Viewer",       color: T.textSub, bg: "rgba(148,163,184,0.12)" },
};
const PERMS = {
  admin:        ["all"],
  organizer:    ["events.w","guests.w","budget.w"],
  collaborator: ["events.r","guests.w","budget.r"],
  viewer:       ["events.r","guests.r","budget.r"],
};
const can = (u, p) => {
  if (!u) return false;
  const ps = PERMS[u.role] || [];
  return ps.includes("all") || ps.includes(p) || (p.endsWith(".r") && ps.includes(p.replace(".r",".w")));
};

const DEMO_USERS = [
  { id:"u1", name:"Alex Morgan",   email:"admin@festivo.com",     password:"admin123",  role:"admin",        avatar:"AM" },
  { id:"u2", name:"Jordan Kim",    email:"organizer@festivo.com", password:"org123",    role:"organizer",    avatar:"JK" },
  { id:"u3", name:"Sam Rivera",    email:"collab@festivo.com",    password:"col123",    role:"collaborator", avatar:"SR" },
  { id:"u4", name:"Taylor Lee",    email:"viewer@festivo.com",    password:"view123",   role:"viewer",       avatar:"TL" },
];

const EVENT_TYPES     = ["Festival","Concert","Conference","Wedding","Corporate","Sports","Exhibition","Other"];
const EVENT_STATUSES  = ["Upcoming","Ongoing","Completed","Cancelled"];
const RSVP_STATUSES   = ["Confirmed","Pending","Declined"];
const DIETARY_OPTIONS = ["None","Vegetarian","Vegan","Gluten-Free","Halal","Kosher"];
const BUDGET_CATS     = ["Venue","Catering","Entertainment","Decoration","Marketing","Security","Photography","Transport","Other"];

const STATUS_COLORS = {
  Upcoming: T.cyan, Ongoing: T.green, Completed: T.textSub, Cancelled: T.red,
  Confirmed: T.green, Pending: T.amber, Declined: T.red,
};

const INIT_EVENTS = [
  { id:"e1", title:"Summer Music Festival", type:"Festival",    date:"2026-07-15", endDate:"2026-07-17", location:"Central Park, NYC",           capacity:5000, status:"Upcoming",  description:"Annual summer music festival featuring top international artists and bands.",  budget:250000, color:T.primary, deleted:false, createdAt:"2026-03-01" },
  { id:"e2", title:"Tech Summit 2026",      type:"Conference",  date:"2026-05-20", endDate:"2026-05-22", location:"Convention Center, San Francisco", capacity:2000, status:"Upcoming",  description:"Premier technology conference for developers and innovators.",  budget:150000, color:T.violet, deleted:false, createdAt:"2026-02-15" },
  { id:"e3", title:"Charity Gala Night",    type:"Corporate",   date:"2026-04-30", endDate:"2026-04-30", location:"Grand Ballroom, Chicago",     capacity:500,  status:"Upcoming",  description:"Annual charity fundraising gala with dinner and auction.",      budget:80000,  color:T.green,  deleted:false, createdAt:"2026-02-01" },
  { id:"e4", title:"Jazz & Blues Night",    type:"Concert",     date:"2026-03-10", endDate:"2026-03-10", location:"Blue Note, New York",         capacity:800,  status:"Completed", description:"Intimate jazz and blues concert evening.",                      budget:45000,  color:T.cyan,   deleted:false, createdAt:"2026-01-10" },
];
const INIT_GUESTS = [
  { id:"g1", name:"Emma Johnson",  email:"emma@ex.com",   phone:"+1-555-0101", eventId:"e1", rsvp:"Confirmed", dietary:"Vegetarian",  plusOne:true,  checkedIn:false, notes:"" },
  { id:"g2", name:"Liam Smith",    email:"liam@ex.com",   phone:"+1-555-0102", eventId:"e1", rsvp:"Confirmed", dietary:"None",        plusOne:false, checkedIn:false, notes:"" },
  { id:"g3", name:"Olivia Brown",  email:"olivia@ex.com", phone:"+1-555-0103", eventId:"e1", rsvp:"Pending",   dietary:"Vegan",       plusOne:true,  checkedIn:false, notes:"Table near stage" },
  { id:"g4", name:"Noah Davis",    email:"noah@ex.com",   phone:"+1-555-0104", eventId:"e2", rsvp:"Confirmed", dietary:"None",        plusOne:false, checkedIn:true,  notes:"" },
  { id:"g5", name:"Ava Wilson",    email:"ava@ex.com",    phone:"+1-555-0105", eventId:"e2", rsvp:"Declined",  dietary:"None",        plusOne:false, checkedIn:false, notes:"" },
  { id:"g6", name:"Lucas Martinez",email:"lucas@ex.com",  phone:"+1-555-0106", eventId:"e3", rsvp:"Confirmed", dietary:"Gluten-Free", plusOne:true,  checkedIn:false, notes:"VIP table" },
  { id:"g7", name:"Mia Thompson",  email:"mia@ex.com",    phone:"+1-555-0107", eventId:"e3", rsvp:"Pending",   dietary:"Halal",       plusOne:false, checkedIn:false, notes:"" },
  { id:"g8", name:"Ethan Garcia",  email:"ethan@ex.com",  phone:"+1-555-0108", eventId:"e4", rsvp:"Confirmed", dietary:"None",        plusOne:true,  checkedIn:true,  notes:"" },
];
const INIT_BUDGET = [
  { id:"b1", eventId:"e1", category:"Venue",         allocated:80000,  spent:75000, description:"Central Park permit and stage setup" },
  { id:"b2", eventId:"e1", category:"Entertainment", allocated:100000, spent:95000, description:"Artist fees and sound/light equipment" },
  { id:"b3", eventId:"e1", category:"Catering",      allocated:40000,  spent:35000, description:"Food and beverage vendors" },
  { id:"b4", eventId:"e1", category:"Marketing",     allocated:30000,  spent:28000, description:"Social media and print advertising" },
  { id:"b5", eventId:"e2", category:"Venue",         allocated:50000,  spent:48000, description:"Convention center rental" },
  { id:"b6", eventId:"e2", category:"Catering",      allocated:30000,  spent:15000, description:"Conference lunch and coffee breaks" },
  { id:"b7", eventId:"e2", category:"Marketing",     allocated:20000,  spent:12000, description:"Digital and print promotion" },
  { id:"b8", eventId:"e3", category:"Venue",         allocated:25000,  spent:22000, description:"Grand Ballroom rental" },
  { id:"b9", eventId:"e3", category:"Decoration",    allocated:20000,  spent:19500, description:"Floral arrangements and lighting" },
  { id:"b10",eventId:"e3", category:"Catering",      allocated:25000,  spent:18000, description:"Gala dinner and drinks" },
  { id:"b11",eventId:"e4", category:"Venue",         allocated:15000,  spent:14000, description:"Blue Note venue rental" },
  { id:"b12",eventId:"e4", category:"Entertainment", allocated:20000,  spent:20000, description:"Artist fees" },
];

/* ─────────────── UTILS ─────────────── */
const uid  = () => Math.random().toString(36).slice(2,9);
const regionCurrency = (region) => {
  const map = { US: "USD", IN: "INR", GB: "GBP", DE: "EUR", FR: "EUR" };
  return map[region]?.toUpperCase() || "USD";
};

const fmtD = (d, locale) => {
  const loc = locale || (typeof window!=='undefined' && window.__FESTIVO_LOCALE) || "en-US";
  try { return d ? new Date(d).toLocaleDateString(loc,{month:"short",day:"numeric",year:"numeric"}) : ""; } catch { return d||""; }
};

const fmtC = (n, locale, region) => {
  const loc = locale || (typeof window!=='undefined' && window.__FESTIVO_LOCALE) || "en-US";
  const curr = regionCurrency(region || (typeof window!=='undefined' && window.__FESTIVO_REGION));
  try { return new Intl.NumberFormat(loc,{style:"currency",currency:curr,maximumFractionDigits:0}).format(n||0); } catch { return `${n||0}`; }
};
const pct  = (a,b) => b ? Math.min(100,Math.round((a/b)*100)) : 0;

const store = {
  g: (k,d) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):d; } catch { return d; } },
  s: (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} },
};

/* ─────────────── SMALL UI ─────────────── */
const Badge = ({label, color, bg}) => (
  <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,color,background:bg,letterSpacing:"0.03em",textTransform:"uppercase"}}>
    {label}
  </span>
);

const Btn = ({children,onClick,variant="primary",size="md",disabled,style:sx={}}) => {
  const base = {display:"inline-flex",alignItems:"center",gap:6,fontWeight:700,borderRadius:10,border:"none",cursor:disabled?"not-allowed":"pointer",transition:"all .18s",fontFamily:"inherit",letterSpacing:"0.01em",...sx};
  const pad  = size==="sm"?"5px 12px":size==="lg"?"12px 28px":"8px 18px";
  const fs   = size==="sm"?12:size==="lg"?15:13;
  const vars = {
    primary: {background:T.primary,color:"#fff"},
    violet:  {background:T.violet,color:"#fff"},
    ghost:   {background:"transparent",color:T.textSub,border:`1px solid ${T.border}`},
    danger:  {background:T.red,color:"#fff"},
    success: {background:T.green,color:"#fff"},
    subtle:  {background:"rgba(255,255,255,0.05)",color:T.textSub},
  };
  return <button type="button" onClick={!disabled?onClick:undefined} disabled={disabled} style={{...base,...vars[variant],padding:pad,fontSize:fs,opacity:disabled?0.5:1}}>{children}</button>;
};

const Inp = ({label,error,...props}) => (
  <div style={{marginBottom:16}}>
    {label&&<label style={{fontSize:12,fontWeight:700,color:T.textSub,display:"block",marginBottom:6,letterSpacing:"0.04em",textTransform:"uppercase"}}>{label}</label>}
    <input {...props} style={{width:"100%",padding:"10px 14px",background:T.surface,border:`1px solid ${error?T.red:T.border}`,borderRadius:10,color:T.text,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box",...props.style}}/>
    {error&&<p style={{fontSize:11,color:T.red,margin:"4px 0 0"}}>{error}</p>}
  </div>
);

const Sel = ({label,children,...props}) => (
  <div style={{marginBottom:16}}>
    {label&&<label style={{fontSize:12,fontWeight:700,color:T.textSub,display:"block",marginBottom:6,letterSpacing:"0.04em",textTransform:"uppercase"}}>{label}</label>}
    <select {...props} style={{width:"100%",padding:"10px 14px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}>{children}</select>
  </div>
);

const Textarea = ({label,...props}) => (
  <div style={{marginBottom:16}}>
    {label&&<label style={{fontSize:12,fontWeight:700,color:T.textSub,display:"block",marginBottom:6,letterSpacing:"0.04em",textTransform:"uppercase"}}>{label}</label>}
    <textarea {...props} style={{width:"100%",padding:"10px 14px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box",resize:"vertical",minHeight:80,...props.style}}/>
  </div>
);

const Card = ({children,style:sx={}}) => (
  <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,padding:24,...sx}}>{children}</div>
);

/* ─────────────── MODAL ─────────────── */
const Modal = ({title,onClose,children,width=520}) => {
  const ref = useRef(null);
  useEffect(()=>{ if(ref.current){ ref.current.focus(); } },[]);
  return (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} onKeyDown={e=>{ if(e.key==="Escape")onClose(); }}
         style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(4px)"}}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1}
           style={{background:T.card,borderRadius:20,width:"100%",maxWidth:width,border:`1px solid ${T.border}`,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 32px 80px rgba(0,0,0,.6)"}}>
        <div style={{padding:"20px 24px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:T.card,borderRadius:"20px 20px 0 0",zIndex:1}}>
          <h3 id="modal-title" style={{margin:0,fontSize:17,fontWeight:800,color:T.text}}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close dialog" style={{background:"none",border:"none",color:T.textSub,cursor:"pointer",display:"flex",padding:4,borderRadius:8}}><X size={18}/></button>
        </div>
        <div style={{padding:24}}>{children}</div>
      </div>
    </div>
  );
};

/* ─────────────── TOAST ─────────────── */
const ToastContainer = ({toasts}) => (
  <div aria-live="polite" aria-atomic="true" style={{position:"fixed",bottom:24,right:24,zIndex:9999,display:"flex",flexDirection:"column",gap:8,pointerEvents:"none"}}>
    {toasts.map(t=>(
      <div key={t.id} role="status" style={{background:t.type==="success"?T.green:t.type==="error"?T.red:t.type==="warning"?T.amber:T.violet,color:"#fff",padding:"12px 20px",borderRadius:14,fontSize:13,fontWeight:600,boxShadow:"0 8px 32px rgba(0,0,0,.5)",display:"flex",alignItems:"center",gap:10,minWidth:280,maxWidth:380}}>
        {t.type==="success"?<CheckCircle size={15}/>:t.type==="error"?<X size={15}/>:<AlertTriangle size={15}/>}
        {t.message}
      </div>
    ))}
  </div>
);

/* ─────────────── STAT CARD ─────────────── */
const StatCard = ({icon:Icon,label,value,sub,color,glow}) => (
  <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,padding:22,display:"flex",flexDirection:"column",gap:12}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div style={{background:glow,borderRadius:12,padding:10,display:"flex"}}><Icon size={20} color={color}/></div>
      <TrendingUp size={14} color={T.green}/>
    </div>
    <div>
      <div style={{fontSize:28,fontWeight:800,color:T.text,lineHeight:1}}>{value}</div>
      <div style={{fontSize:12,color:T.textSub,marginTop:4}}>{label}</div>
    </div>
    {sub&&<div style={{fontSize:11,color:T.textDim,borderTop:`1px solid ${T.border}`,paddingTop:10}}>{sub}</div>}
  </div>
);

/* ─────────────── LOGIN PAGE ─────────────── */
const LoginPage = ({onLogin,onGoRegister}) => {
  const [email,setEmail]=useState("admin@festivo.com");
  const [password,setPassword]=useState("admin123");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);

  const submit = () => {
    setErr("");
    setLoading(true);
    setTimeout(()=>{
      const ok = onLogin(email.trim(),password);
      if(!ok){setErr("Invalid email or password.");setLoading(false);}
    },600);
  };

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",fontFamily:"'Inter',sans-serif"}}>
      {/* Left panel */}
      <div style={{flex:"0 0 460px",background:T.surface,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",justifyContent:"space-between",padding:48}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:60}}>
            <div style={{width:40,height:40,borderRadius:12,background:T.primaryGlow,display:"flex",alignItems:"center",justifyContent:"center"}}><Zap size={22} color={T.primary}/></div>
            <span style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:"-0.02em"}}>Festivo</span>
          </div>
          <h1 style={{fontSize:34,fontWeight:900,color:T.text,margin:"0 0 12px",lineHeight:1.15,letterSpacing:"-0.02em"}}>Plan unforgettable<br/>events, beautifully.</h1>
          <p style={{fontSize:15,color:T.textSub,lineHeight:1.7,margin:"0 0 40px"}}>The all-in-one platform for event management, guest tracking, and budget planning.</p>

          <div style={{display:"flex",flexDirection:"column",gap:16,marginBottom:40}}>
            {[{icon:"🎪",text:"Manage events & guests effortlessly"},{icon:"📊",text:"Track budgets with real-time alerts"},{icon:"🔐",text:"Role-based access for your whole team"}].map((f,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",background:T.card,borderRadius:14,border:`1px solid ${T.border}`}}>
                <span style={{fontSize:20}}>{f.icon}</span>
                <span style={{fontSize:13,color:T.textSub,fontWeight:500}}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{borderTop:`1px solid ${T.border}`,paddingTop:24}}>
          <p style={{fontSize:12,color:T.textDim,marginBottom:12,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>Demo Accounts</p>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {DEMO_USERS.map(u=>(
              <button key={u.id} onClick={()=>{setEmail(u.email);setPassword(u.password);}}
                style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 14px",color:T.textSub,fontSize:12,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:10,fontFamily:"inherit",transition:"all .15s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=T.primary}
                onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
                <span style={{fontWeight:700,color:ROLE_META[u.role].color}}>{ROLE_META[u.role].label}</span>
                <span>{u.email}</span>
                <span style={{color:T.textDim}}>/ {u.password}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:40}}>
        <div style={{width:"100%",maxWidth:400}}>
          <h2 style={{fontSize:26,fontWeight:800,color:T.text,marginBottom:6}}>Sign in</h2>
          <p style={{fontSize:14,color:T.textSub,marginBottom:32}}>Enter your credentials to access your workspace.</p>

          <Inp label="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/>
          <Inp label="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"
               error={err} onKeyDown={e=>e.key==="Enter"&&submit()}/>

          <Btn onClick={submit} size="lg" disabled={loading} style={{width:"100%",justifyContent:"center",marginTop:8}}>
            {loading?"Signing in…":"Sign In"}
          </Btn>

          <p style={{textAlign:"center",fontSize:13,color:T.textSub,marginTop:24}}>
            Don't have an account?{" "}
            <button onClick={onGoRegister} style={{background:"none",border:"none",color:T.primary,cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>Create account</button>
          </p>
        </div>
      </div>
    </div>
  );
};

/* ─────────────── REGISTER PAGE ─────────────── */
const RegisterPage = ({onRegister,onGoLogin}) => {
  const [f,setF]=useState({name:"",email:"",password:"",confirm:"",role:"organizer"});
  const [errs,setErrs]=useState({});
  const [loading,setLoading]=useState(false);

  const validate = () => {
    const e={};
    if(!f.name.trim()) e.name="Name is required";
    if(!/\S+@\S+\.\S+/.test(f.email)) e.email="Valid email required";
    if(f.password.length<6) e.password="Min 6 characters";
    if(f.password!==f.confirm) e.confirm="Passwords don't match";
    return e;
  };

  const submit = () => {
    const e=validate();
    if(Object.keys(e).length){setErrs(e);return;}
    setLoading(true);
    setTimeout(()=>{onRegister(f);setLoading(false);},600);
  };

  const up = (k,v)=>setF(p=>({...p,[k]:v}));

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",padding:20}}>
      <div style={{width:"100%",maxWidth:440}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:36,justifyContent:"center"}}>
          <div style={{width:36,height:36,borderRadius:10,background:T.primaryGlow,display:"flex",alignItems:"center",justifyContent:"center"}}><Zap size={18} color={T.primary}/></div>
          <span style={{fontSize:20,fontWeight:800,color:T.text}}>Festivo</span>
        </div>
        <Card style={{padding:32}}>
          <h2 style={{fontSize:22,fontWeight:800,color:T.text,margin:"0 0 4px"}}>Create Account</h2>
          <p style={{fontSize:13,color:T.textSub,margin:"0 0 28px"}}>Join your team workspace</p>
          <Inp label="Full Name" value={f.name} onChange={e=>up("name",e.target.value)} placeholder="Jane Smith" error={errs.name}/>
          <Inp label="Email" type="email" value={f.email} onChange={e=>up("email",e.target.value)} placeholder="jane@company.com" error={errs.email}/>
          <Inp label="Password" type="password" value={f.password} onChange={e=>up("password",e.target.value)} placeholder="Min 6 characters" error={errs.password}/>
          <Inp label="Confirm Password" type="password" value={f.confirm} onChange={e=>up("confirm",e.target.value)} placeholder="Repeat password" error={errs.confirm}/>
          <Sel label="Role" value={f.role} onChange={e=>up("role",e.target.value)}>
            {ROLES.map(r=><option key={r} value={r}>{ROLE_META[r].label}</option>)}
          </Sel>
          <Btn onClick={submit} size="lg" disabled={loading} style={{width:"100%",justifyContent:"center",marginTop:4}}>
            {loading?"Creating…":"Create Account"}
          </Btn>
          <p style={{textAlign:"center",fontSize:13,color:T.textSub,marginTop:20,margin:0}}>
            Already have an account?{" "}
            <button onClick={onGoLogin} style={{background:"none",border:"none",color:T.primary,cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>Sign in</button>
          </p>
        </Card>
      </div>
    </div>
  );
};

/* ─────────────── SIDEBAR ─────────────── */
const NAV_ITEMS = [
  {id:"dashboard",label:"Dashboard",icon:LayoutDashboard},
  {id:"events",   label:"Events",   icon:Calendar},
  {id:"guests",   label:"Guests",   icon:Users},
  {id:"budget",   label:"Budget",   icon:DollarSign},
  {id:"settings", label:"Settings", icon:Settings},
];

const Sidebar = ({page,setPage,user,collapsed,onLogout}) => {
  const SIDEBAR_W = collapsed ? 70 : 240;
  return (
    <aside style={{width:SIDEBAR_W,minWidth:SIDEBAR_W,background:T.surface,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",height:"100vh",position:"sticky",top:0,transition:"width .25s",overflow:"hidden",flexShrink:0}}>
      {/* Logo */}
      <div style={{padding:collapsed?"18px 0":"20px 24px",display:"flex",alignItems:"center",gap:12,borderBottom:`1px solid ${T.border}`,minHeight:68,justifyContent:collapsed?"center":"flex-start"}}>
        <div style={{width:34,height:34,borderRadius:10,background:T.primaryGlow,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Zap size={18} color={T.primary}/></div>
        {!collapsed&&<span style={{fontSize:18,fontWeight:800,color:T.text,whiteSpace:"nowrap",letterSpacing:"-0.02em"}}>Festivo</span>}
      </div>

      {/* Nav */}
      <nav style={{flex:1,padding:"16px 12px",overflowY:"auto"}}>
        {!collapsed&&<p style={{fontSize:10,fontWeight:700,color:T.textDim,letterSpacing:"0.08em",textTransform:"uppercase",margin:"0 8px 10px"}}>Menu</p>}
        {NAV_ITEMS.map(({id,label,icon:Icon})=>{
          const active = page===id;
          return (
            <button key={id} onClick={()=>setPage(id)}
              style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:collapsed?"12px":"10px 12px",marginBottom:4,borderRadius:12,border:"none",cursor:"pointer",background:active?T.primaryGlow:"transparent",color:active?T.primary:T.textSub,fontFamily:"inherit",fontSize:13,fontWeight:active?700:500,transition:"all .15s",justifyContent:collapsed?"center":"flex-start"}}
              onMouseEnter={e=>{if(!active){e.currentTarget.style.background="rgba(255,255,255,0.05)";e.currentTarget.style.color=T.text;}}}
              onMouseLeave={e=>{if(!active){e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.textSub;}}}>
              <Icon size={18} style={{flexShrink:0}}/>
              {!collapsed&&<span style={{whiteSpace:"nowrap"}}>{label}</span>}
              {!collapsed&&active&&<div style={{marginLeft:"auto",width:4,height:4,borderRadius:2,background:T.primary}}/>}
            </button>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div style={{padding:"16px 12px",borderTop:`1px solid ${T.border}`}}>
        {!collapsed&&(
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:12,background:T.card,marginBottom:8}}>
            <div style={{width:32,height:32,borderRadius:10,background:T.primaryGlow,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:T.primary,flexShrink:0}}>{user?.avatar}</div>
            <div style={{overflow:"hidden"}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.name}</div>
              <Badge label={ROLE_META[user?.role]?.label} color={ROLE_META[user?.role]?.color} bg={ROLE_META[user?.role]?.bg}/>
            </div>
          </div>
        )}
        <button onClick={onLogout}
          style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:collapsed?"12px":"10px 12px",borderRadius:12,border:"none",cursor:"pointer",background:"transparent",color:T.textSub,fontFamily:"inherit",fontSize:13,fontWeight:500,transition:"all .15s",justifyContent:collapsed?"center":"flex-start"}}
          onMouseEnter={e=>{e.currentTarget.style.color=T.red;e.currentTarget.style.background=T.redGlow;}}
          onMouseLeave={e=>{e.currentTarget.style.color=T.textSub;e.currentTarget.style.background="transparent";}}>
          <LogOut size={17} style={{flexShrink:0}}/>{!collapsed&&"Log Out"}
        </button>
      </div>
    </aside>
  );
};

/* ─────────────── TOPBAR ─────────────── */
const Topbar = ({title,collapsed,setCollapsed,user,notifCount,locale,setLocale,region,setRegion}) => (
  <header style={{height:68,background:T.surface,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",padding:"0 28px",gap:16,position:"sticky",top:0,zIndex:100,flexShrink:0}}>
    <button onClick={()=>setCollapsed(p=>!p)} style={{background:"none",border:"none",color:T.textSub,cursor:"pointer",display:"flex",padding:6,borderRadius:8,transition:"all .15s"}}
      onMouseEnter={e=>e.currentTarget.style.color=T.text} onMouseLeave={e=>e.currentTarget.style.color=T.textSub}>
      <Menu size={20}/>
    </button>
    <h1 style={{fontSize:18,fontWeight:800,color:T.text,margin:0,flex:1}}>{title}</h1>
    <div style={{display:"flex",alignItems:"center",gap:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <select value={locale} onChange={e=>setLocale(e.target.value)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 8px",color:T.textSub,fontSize:12,fontFamily:"inherit",outline:"none",cursor:"pointer"}}>
          <option value="en-US">English (US)</option>
          <option value="en-GB">English (UK)</option>
          <option value="fr-FR">Français</option>
          <option value="hi-IN">हिन्दी</option>
        </select>
        <select value={region} onChange={e=>setRegion(e.target.value)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 8px",color:T.textSub,fontSize:12,fontFamily:"inherit",outline:"none",cursor:"pointer"}}>
          <option value="US">US</option>
          <option value="GB">UK</option>
          <option value="IN">IN</option>
          <option value="DE">DE</option>
          <option value="FR">FR</option>
        </select>
      </div>
      <div style={{position:"relative"}}>
        <button style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:8,cursor:"pointer",display:"flex",color:T.textSub}}>
          <Bell size={17}/>
        </button>
        {notifCount>0&&<span style={{position:"absolute",top:-4,right:-4,background:T.red,color:"#fff",fontSize:9,fontWeight:800,borderRadius:8,padding:"1px 5px",minWidth:16,textAlign:"center"}}>{notifCount}</span>}
      </div>
      <div style={{width:36,height:36,borderRadius:10,background:T.primaryGlow,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:T.primary}}>{user?.avatar}</div>
    </div>
  </header>
);

/* ─────────────── DASHBOARD ─────────────── */
const Dashboard = ({events,guests,budget,user}) => {
  const activeEvents = events.filter(e=>!e.deleted);
  const totalGuests  = guests.length;
  const confirmed    = guests.filter(g=>g.rsvp==="Confirmed").length;
  const pending      = guests.filter(g=>g.rsvp==="Pending").length;
  const declined     = guests.filter(g=>g.rsvp==="Declined").length;
  const totalBudget  = activeEvents.reduce((s,e)=>s+e.budget,0);
  const totalSpent   = budget.reduce((s,b)=>s+b.spent,0);

  const rsvpData = [
    {name:"Confirmed",value:confirmed,color:T.green},
    {name:"Pending",  value:pending,  color:T.amber},
    {name:"Declined", value:declined, color:T.red},
  ];

  const budgetByCat = BUDGET_CATS.map(cat=>({
    name:cat.slice(0,6),
    allocated:budget.filter(b=>b.category===cat).reduce((s,b)=>s+b.allocated,0),
    spent:budget.filter(b=>b.category===cat).reduce((s,b)=>s+b.spent,0),
  })).filter(d=>d.allocated>0);

  const monthlyData = [
    {month:"Jan",events:1,guests:45},{month:"Feb",events:2,guests:78},
    {month:"Mar",events:1,guests:32},{month:"Apr",events:3,guests:120},
    {month:"May",events:2,guests:89},{month:"Jun",events:4,guests:210},
  ];

  const upcomingEvents = activeEvents.filter(e=>e.status==="Upcoming").slice(0,4);
  const recentGuests   = guests.slice(-4).reverse();

  return (
    <div style={{padding:28,maxWidth:1400}}>
      <div style={{marginBottom:28}}>
        <h2 style={{fontSize:22,fontWeight:800,color:T.text,margin:"0 0 4px"}}>Welcome back, {user?.name?.split(" ")[0]} 👋</h2>
        <p style={{fontSize:14,color:T.textSub,margin:0}}>Here's what's happening with your events today.</p>
      </div>

      {/* Stat Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16,marginBottom:28}}>
        <StatCard icon={Calendar}    label="Active Events"  value={activeEvents.filter(e=>e.status!=="Completed").length} sub={`${activeEvents.length} total events`}       color={T.primary} glow={T.primaryGlow}/>
        <StatCard icon={Users}       label="Total Guests"   value={totalGuests}    sub={`${confirmed} confirmed RSVPs`}           color={T.violet}  glow={T.violetGlow}/>
        <StatCard icon={UserCheck}   label="RSVP Rate"      value={`${pct(confirmed,totalGuests)}%`} sub={`${pending} still pending`}    color={T.green}   glow={T.greenGlow}/>
        <StatCard icon={DollarSign}  label="Total Budget"   value={fmtC(totalBudget)} sub={`${fmtC(totalSpent)} spent (${pct(totalSpent,totalBudget)}%)`} color={T.cyan} glow={T.cyanGlow}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:20,marginBottom:24}}>
        {/* RSVP Pie */}
        <Card>
          <h3 style={{fontSize:14,fontWeight:700,color:T.text,margin:"0 0 16px"}}>RSVP Breakdown</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={rsvpData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                {rsvpData.map((e,i)=><Cell key={i} fill={e.color}/>)}
              </Pie>
              <Tooltip formatter={(v,n)=>[v,n]} contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:12}}/>
            </PieChart>
          </ResponsiveContainer>
          <div style={{display:"flex",justifyContent:"center",gap:16,flexWrap:"wrap"}}>
            {rsvpData.map(d=>(
              <div key={d.name} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:T.textSub}}>
                <span style={{width:8,height:8,borderRadius:2,background:d.color,display:"inline-block"}}/>
                {d.name}: <strong style={{color:T.text}}>{d.value}</strong>
              </div>
            ))}
          </div>
        </Card>

        {/* Budget Bar */}
        <Card style={{gridColumn:"span 2"}}>
          <h3 style={{fontSize:14,fontWeight:700,color:T.text,margin:"0 0 16px"}}>Budget by Category</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={budgetByCat} barSize={16}>
              <XAxis dataKey="name" tick={{fill:T.textSub,fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:T.textSub,fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`$${v/1000}k`:`$${v}`}/>
              <Tooltip contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:12}} formatter={v=>[fmtC(v)]}/>
              <Bar dataKey="allocated" fill={T.violetGlow} radius={[4,4,0,0]} name="Allocated"/>
              <Bar dataKey="spent"     fill={T.primary}    radius={[4,4,0,0]} name="Spent"/>
              <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:12,color:T.textSub}}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Guest trend + recent */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <Card>
          <h3 style={{fontSize:14,fontWeight:700,color:T.text,margin:"0 0 16px"}}>Guest Trend</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={monthlyData}>
              <defs><linearGradient id="grd" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.primary} stopOpacity={0.3}/><stop offset="95%" stopColor={T.primary} stopOpacity={0}/></linearGradient></defs>
              <XAxis dataKey="month" tick={{fill:T.textSub,fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:T.textSub,fontSize:11}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:12}}/>
              <Area type="monotone" dataKey="guests" stroke={T.primary} fill="url(#grd)" strokeWidth={2.5} name="Guests"/>
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h3 style={{fontSize:14,fontWeight:700,color:T.text,margin:"0 0 16px"}}>Upcoming Events</h3>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {upcomingEvents.length===0&&<p style={{color:T.textSub,fontSize:13}}>No upcoming events.</p>}
            {upcomingEvents.map(e=>(
              <div key={e.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:T.surface,borderRadius:12}}>
                <div style={{width:8,height:8,borderRadius:2,background:e.color,flexShrink:0}}/>
                <div style={{flex:1,overflow:"hidden"}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.title}</div>
                  <div style={{fontSize:11,color:T.textSub}}>{fmtD(e.date)} · {e.location.split(",")[0]}</div>
                </div>
                <Badge label={e.status} color={STATUS_COLORS[e.status]} bg={`${STATUS_COLORS[e.status]}22`}/>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

/* ─────────────── EVENTS PAGE ─────────────── */
const EventForm = ({ev,onSave,onClose,events=[]}) => {
  const [f,setF]=useState(ev||{title:"",type:"Festival",date:"",endDate:"",location:"",capacity:"",budget:"",status:"Upcoming",description:"",color:T.primary});
  const [errs,setErrs]=useState({});
  const [loading,setLoading]=useState(false);
  const up = (k,v)=>setF(p=>({...p,[k]:v}));
  const COLORS = [T.primary,T.violet,T.cyan,T.green,T.amber,"#EC4899","#8B5CF6"];
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{gridColumn:"span 2"}}><Inp label="Event Title" value={f.title} onChange={e=>up("title",e.target.value)} placeholder="Summer Music Festival"/></div>
        <Sel label="Type" value={f.type} onChange={e=>up("type",e.target.value)}>{EVENT_TYPES.map(t=><option key={t}>{t}</option>)}</Sel>
        <Sel label="Status" value={f.status} onChange={e=>up("status",e.target.value)}>{EVENT_STATUSES.map(s=><option key={s}>{s}</option>)}</Sel>
        <Inp label="Start Date" type="date" value={f.date} onChange={e=>up("date",e.target.value)}/>
        <Inp label="End Date"   type="date" value={f.endDate} onChange={e=>up("endDate",e.target.value)}/>
        <div style={{gridColumn:"span 2"}}><Inp label="Location" value={f.location} onChange={e=>up("location",e.target.value)} placeholder="Central Park, NYC"/></div>
        <Inp label="Capacity" type="number" value={f.capacity} onChange={e=>up("capacity",e.target.value)} placeholder="1000"/>
        <Inp label="Budget ($)" type="number" value={f.budget} onChange={e=>up("budget",e.target.value)} placeholder="50000"/>
      </div>
      <Textarea label="Description" value={f.description} onChange={e=>up("description",e.target.value)} placeholder="Event description..."/>
      <div style={{marginBottom:20}}>
        <label style={{fontSize:12,fontWeight:700,color:T.textSub,display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>Event Color</label>
        <div style={{display:"flex",gap:8}}>{COLORS.map(c=><button key={c} onClick={()=>up("color",c)} style={{width:28,height:28,borderRadius:8,background:c,border:f.color===c?`3px solid ${T.text}`:"3px solid transparent",cursor:"pointer"}}/>)}</div>
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn>
        <Btn onClick={async ()=>{
          const e={};
          if(!f.title.trim()) e.title='Title is required';
          if(!f.date) e.date='Start date is required';
          if(!f.location.trim()) e.location='Location is required';
          // duplicate check: same title on same start date
          const dup = events.find(ev=>ev.id!==f.id && ev.title.trim().toLowerCase()===f.title.trim().toLowerCase() && ev.date===f.date);
          if(dup) e.title='An event with this title and date already exists';
          setErrs(e);
          if(Object.keys(e).length) return;
          setLoading(true);
          try{ await new Promise(r=>setTimeout(r,400)); onSave(f); }
          finally{ setLoading(false); }
        }} disabled={loading}>{loading?"Saving…":"Save Event"}</Btn>
      </div>
    </div>
  );
};

const Events = ({events,setEvents,toast,user,regionFilterState}) => {
  const [modal,setModal]=useState(null);
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("all");
  const [showDeleted,setShowDeleted]=useState(false);
  const [regionFilter,setRegionFilter] = useState("all");

  const list = events.filter(e=>{
    const del = showDeleted ? e.deleted : !e.deleted;
    const s = e.title.toLowerCase().includes(search.toLowerCase()) || e.location.toLowerCase().includes(search.toLowerCase());
    const f = filter==="all" || e.status===filter || e.type===filter;
    const regionMatch = regionFilter==="all" || (e.location||"").split(",").slice(-1)[0].trim()===regionFilter;
    return del && s && f && regionMatch;
  });

  const saveEvent = (f) => {
    if(modal==="create") {
      setEvents(p=>[...p,{...f,id:uid(),deleted:false,createdAt:new Date().toISOString()}]);
      toast("Event created!","success");
    } else {
      setEvents(p=>p.map(e=>e.id===modal.id?{...e,...f}:e));
      toast("Event updated!","success");
    }
    setModal(null);
  };

  const del = (id) => {setEvents(p=>p.map(e=>e.id===id?{...e,deleted:true}:e));toast("Event deleted","warning");};
  const restore = (id) => {setEvents(p=>p.map(e=>e.id===id?{...e,deleted:false}:e));toast("Event restored","success");};
  const permdel = (id) => {setEvents(p=>p.filter(e=>e.id!==id));toast("Event permanently deleted","error");};

  return (
    <div style={{padding:28,maxWidth:1400}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24,flexWrap:"wrap"}}>
        <div style={{flex:1,display:"flex",alignItems:"center",gap:10,background:T.card,borderRadius:12,padding:"8px 14px",border:`1px solid ${T.border}`,minWidth:200}}>
          <Search size={16} color={T.textDim}/><input aria-label="Search events" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search events…" style={{background:"none",border:"none",outline:"none",color:T.text,fontSize:14,fontFamily:"inherit",flex:1,minWidth:0}}/>
        </div>
        <select value={filter} onChange={e=>setFilter(e.target.value)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"9px 14px",color:T.textSub,fontSize:13,fontFamily:"inherit",outline:"none",cursor:"pointer"}}>
          <option value="all">All Statuses</option>{EVENT_STATUSES.map(s=><option key={s}>{s}</option>)}{EVENT_TYPES.map(t=><option key={t}>{t}</option>)}
        </select>
        <select value={regionFilter} onChange={e=>setRegionFilter(e.target.value)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"9px 14px",color:T.textSub,fontSize:13,fontFamily:"inherit",outline:"none",cursor:"pointer"}}>
          <option value="all">All Regions</option>
          {[...new Set(events.map(ev=>(ev.location||"").split(",").slice(-1)[0].trim()).filter(Boolean))].map(r=><option key={r} value={r}>{r}</option>)}
        </select>
        <Btn variant="subtle" size="sm" onClick={()=>setShowDeleted(p=>!p)}><Trash2 size={14}/>{showDeleted?"Active":"Deleted"}</Btn>
        {can(user,"events.w")&&<Btn onClick={()=>setModal("create")}><Plus size={16}/>New Event</Btn>}
      </div>

      {list.length===0&&<div style={{textAlign:"center",padding:60,color:T.textSub}}><Calendar size={40} style={{margin:"0 auto 12px",display:"block",opacity:0.3}}/><p>No events found.</p></div>}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:20}}>
        {list.map(e=>{
          const guestCount = 0;
          const spent = 0;
          return (
            <div key={e.id} style={{background:T.card,borderRadius:18,border:`1px solid ${T.border}`,overflow:"hidden",transition:"transform .18s,border-color .18s",cursor:"default"}}
              onMouseEnter={ev=>ev.currentTarget.style.borderColor=T.borderHover}
              onMouseLeave={ev=>ev.currentTarget.style.borderColor=T.border}>
              <div style={{height:6,background:e.color}}/>
              <div style={{padding:20}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <div style={{flex:1,marginRight:12}}>
                    <div style={{fontSize:16,fontWeight:800,color:T.text,marginBottom:4,lineHeight:1.3}}>{e.title}</div>
                    <Badge label={e.type} color={T.textSub} bg="rgba(255,255,255,0.06)"/>
                  </div>
                  <Badge label={e.status} color={STATUS_COLORS[e.status]} bg={`${STATUS_COLORS[e.status]}22`}/>
                </div>

                <div style={{display:"flex",flexDirection:"column",gap:6,fontSize:12,color:T.textSub,marginBottom:16}}>
                  <span style={{display:"flex",alignItems:"center",gap:6}}><Clock size={12}/>{fmtD(e.date)}{e.endDate&&e.endDate!==e.date&&` — ${fmtD(e.endDate)}`}</span>
                  <span style={{display:"flex",alignItems:"center",gap:6}}><MapPin size={12}/>{e.location}</span>
                  <span style={{display:"flex",alignItems:"center",gap:6}}><Users size={12}/>{e.capacity} capacity · <DollarSign size={12}/>{fmtC(e.budget)} budget</span>
                </div>

                {e.description&&<p style={{fontSize:12,color:T.textDim,margin:"0 0 16px",lineHeight:1.5,WebkitLineClamp:2,display:"-webkit-box",WebkitBoxOrient:"vertical",overflow:"hidden"}}>{e.description}</p>}

                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {e.deleted ? (
                    <>
                      <Btn variant="ghost" size="sm" onClick={()=>restore(e.id)}><RotateCcw size={13}/>Restore</Btn>
                      <Btn variant="danger" size="sm" onClick={()=>permdel(e.id)}><Trash2 size={13}/>Delete Forever</Btn>
                    </>
                  ) : (
                    <>
                      {can(user,"events.w")&&<Btn variant="ghost" size="sm" onClick={()=>setModal(e)}><Edit2 size={13}/>Edit</Btn>}
                      {can(user,"events.w")&&<Btn variant="subtle" size="sm" onClick={()=>del(e.id)}><Trash2 size={13}/>Delete</Btn>}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {modal&&(
        <Modal title={modal==="create"?"New Event":"Edit Event"} onClose={()=>setModal(null)} width={640}>
          <EventForm ev={modal!=="create"?modal:null} events={events} onSave={saveEvent} onClose={()=>setModal(null)}/>
        </Modal>
      )}
    </div>
  );
};

/* ─────────────── GUESTS PAGE ─────────────── */
const GuestForm = ({guest,events,onSave,onClose}) => {
  const [f,setF]=useState(guest||{name:"",email:"",phone:"",eventId:events[0]?.id||"",rsvp:"Pending",dietary:"None",plusOne:false,notes:""});
  const [errs,setErrs]=useState({});
  const [loading,setLoading]=useState(false);
  const up=(k,v)=>setF(p=>({...p,[k]:v}));
  const submit = async ()=>{
    const e={};
    if(!f.name.trim()) e.name='Name required';
    if(!/\S+@\S+\.\S+/.test(f.email)) e.email='Valid email required';
    if(!f.eventId) e.eventId='Select an event';
    const dup = events.find(ev=>ev.id===f.eventId) && f.email && events && false; // placeholder for more checks
    setErrs(e);
    if(Object.keys(e).length) return;
    setLoading(true);
    try{ await new Promise(r=>setTimeout(r,300)); onSave(f); }
    finally{ setLoading(false); }
  };

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{gridColumn:"span 2"}}><Inp label="Full Name" value={f.name} onChange={e=>up("name",e.target.value)} placeholder="Jane Smith"/></div>
        <Inp label="Email" type="email" value={f.email} onChange={e=>up("email",e.target.value)} placeholder="jane@example.com"/>
        <Inp label="Phone" value={f.phone} onChange={e=>up("phone",e.target.value)} placeholder="+1-555-0100"/>
        <Sel label="Event" value={f.eventId} onChange={e=>up("eventId",e.target.value)}>
          {events.filter(ev=>!ev.deleted).map(ev=><option key={ev.id} value={ev.id}>{ev.title}</option>)}
        </Sel>
        <Sel label="RSVP Status" value={f.rsvp} onChange={e=>up("rsvp",e.target.value)}>
          {RSVP_STATUSES.map(s=><option key={s}>{s}</option>)}
        </Sel>
        <Sel label="Dietary" value={f.dietary} onChange={e=>up("dietary",e.target.value)}>
          {DIETARY_OPTIONS.map(d=><option key={d}>{d}</option>)}
        </Sel>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0"}}>
          <input type="checkbox" id="po" checked={f.plusOne} onChange={e=>up("plusOne",e.target.checked)} style={{width:16,height:16,cursor:"pointer"}}/>
          <label htmlFor="po" style={{fontSize:13,color:T.textSub,cursor:"pointer"}}>Has +1 guest</label>
        </div>
      </div>
      <Textarea label="Notes" value={f.notes} onChange={e=>up("notes",e.target.value)} placeholder="Special requests…" style={{minHeight:60}}/>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn>
        <Btn onClick={submit} disabled={loading}>{loading?"Saving…":"Save Guest"}</Btn>
      </div>
    </div>
  );
};

const Guests = ({guests,setGuests,events,toast,user}) => {
  const [modal,setModal]=useState(null);
  const [search,setSearch]=useState("");
  const [rsvpFilter,setRsvpFilter]=useState("all");
  const [eventFilter,setEventFilter]=useState("all");

  const list = guests.filter(g=>{
    const s = g.name.toLowerCase().includes(search.toLowerCase()) || g.email.toLowerCase().includes(search.toLowerCase());
    const r = rsvpFilter==="all" || g.rsvp===rsvpFilter;
    const e = eventFilter==="all" || g.eventId===eventFilter;
    return s&&r&&e;
  });

  const saveGuest = (f) => {
    if(modal==="create") { setGuests(p=>[...p,{...f,id:uid(),checkedIn:false}]); toast("Guest added!","success"); }
    else { setGuests(p=>p.map(g=>g.id===modal.id?{...g,...f}:g)); toast("Guest updated!","success"); }
    setModal(null);
  };

  const del = (id)=>{setGuests(p=>p.filter(g=>g.id!==id));toast("Guest removed","warning");};
  const toggleCheckIn = (id)=>{setGuests(p=>p.map(g=>g.id===id?{...g,checkedIn:!g.checkedIn}:g));};
  const updateRSVP = (id,rsvp)=>{setGuests(p=>p.map(g=>g.id===id?{...g,rsvp}:g));toast(`RSVP updated to ${rsvp}`,"success");};

  const stats = {
    total: guests.length,
    confirmed: guests.filter(g=>g.rsvp==="Confirmed").length,
    pending: guests.filter(g=>g.rsvp==="Pending").length,
    declined: guests.filter(g=>g.rsvp==="Declined").length,
    checkedIn: guests.filter(g=>g.checkedIn).length,
  };

  return (
    <div style={{padding:28,maxWidth:1400}}>
      {/* Stats row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:24}}>
        {[
          {l:"Total",v:stats.total,c:T.primary},
          {l:"Confirmed",v:stats.confirmed,c:T.green},
          {l:"Pending",v:stats.pending,c:T.amber},
          {l:"Declined",v:stats.declined,c:T.red},
          {l:"Checked In",v:stats.checkedIn,c:T.cyan},
        ].map(s=>(
          <div key={s.l} style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"14px 18px",textAlign:"center"}}>
            <div style={{fontSize:24,fontWeight:800,color:s.c}}>{s.v}</div>
            <div style={{fontSize:11,color:T.textSub,marginTop:2}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20,flexWrap:"wrap"}}>
        <div style={{flex:1,display:"flex",alignItems:"center",gap:10,background:T.card,borderRadius:12,padding:"8px 14px",border:`1px solid ${T.border}`,minWidth:200}}>
          <Search size={16} color={T.textDim}/><input aria-label="Search guests" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search guests…" style={{background:"none",border:"none",outline:"none",color:T.text,fontSize:14,fontFamily:"inherit",flex:1,minWidth:0}}/>
        </div>
        <select value={rsvpFilter} onChange={e=>setRsvpFilter(e.target.value)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"9px 14px",color:T.textSub,fontSize:13,fontFamily:"inherit",outline:"none"}}>
          <option value="all">All RSVPs</option>{RSVP_STATUSES.map(s=><option key={s}>{s}</option>)}
        </select>
        <select value={eventFilter} onChange={e=>setEventFilter(e.target.value)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"9px 14px",color:T.textSub,fontSize:13,fontFamily:"inherit",outline:"none"}}>
          <option value="all">All Events</option>
          {events.filter(e=>!e.deleted).map(e=><option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        {can(user,"guests.w")&&<Btn onClick={()=>setModal("create")}><Plus size={16}/>Add Guest</Btn>}
      </div>

      {/* Table */}
      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${T.border}`}}>
                {["Guest","Event","RSVP","Dietary","+1","Check-In","Actions"].map(h=>(
                  <th key={h} style={{padding:"14px 16px",textAlign:"left",fontSize:11,fontWeight:700,color:T.textSub,textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.length===0&&(
                <tr><td colSpan={7} style={{padding:40,textAlign:"center",color:T.textSub,fontSize:14}}>No guests found.</td></tr>
              )}
              {list.map((g,i)=>{
                const ev = events.find(e=>e.id===g.eventId);
                return (
                  <tr key={g.id} style={{borderBottom:`1px solid ${T.border}`,transition:"background .12s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.02)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{padding:"12px 16px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:32,height:32,borderRadius:10,background:T.primaryGlow,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:T.primary,flexShrink:0}}>{g.name.slice(0,2).toUpperCase()}</div>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:T.text}}>{g.name}</div>
                          <div style={{fontSize:11,color:T.textSub}}>{g.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{padding:"12px 16px",fontSize:12,color:T.textSub}}>{ev?.title||"—"}</td>
                    <td style={{padding:"12px 16px"}}>
                      {can(user,"guests.w")?(
                        <select value={g.rsvp} onChange={e=>updateRSVP(g.id,e.target.value)}
                          style={{background:"transparent",border:`1px solid ${STATUS_COLORS[g.rsvp]}44`,borderRadius:8,padding:"4px 8px",color:STATUS_COLORS[g.rsvp],fontSize:12,fontFamily:"inherit",fontWeight:700,cursor:"pointer",outline:"none"}}>
                          {RSVP_STATUSES.map(s=><option key={s} value={s} style={{color:T.text,background:T.card}}>{s}</option>)}
                        </select>
                      ):<Badge label={g.rsvp} color={STATUS_COLORS[g.rsvp]} bg={`${STATUS_COLORS[g.rsvp]}22`}/>}
                    </td>
                    <td style={{padding:"12px 16px",fontSize:12,color:T.textSub}}>{g.dietary}</td>
                    <td style={{padding:"12px 16px",fontSize:12,color:g.plusOne?T.green:T.textDim}}>{g.plusOne?"Yes":"No"}</td>
                    <td style={{padding:"12px 16px"}}>
                      {can(user,"guests.w")?(
                        <button onClick={()=>toggleCheckIn(g.id)}
                          style={{background:g.checkedIn?T.greenGlow:"transparent",border:`1px solid ${g.checkedIn?T.green:T.border}`,borderRadius:8,padding:"5px 12px",color:g.checkedIn?T.green:T.textSub,fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                          <CheckCircle size={13}/>{g.checkedIn?"In":"Mark In"}
                        </button>
                      ):<span style={{fontSize:12,color:g.checkedIn?T.green:T.textSub}}>{g.checkedIn?"Checked In":"—"}</span>}
                    </td>
                    <td style={{padding:"12px 16px"}}>
                      <div style={{display:"flex",gap:6}}>
                        {can(user,"guests.w")&&<button onClick={()=>setModal(g)} style={{background:"none",border:"none",color:T.textSub,cursor:"pointer",padding:6,borderRadius:8,display:"flex"}}><Edit2 size={14}/></button>}
                        {can(user,"guests.w")&&<button onClick={()=>del(g.id)} style={{background:"none",border:"none",color:T.textSub,cursor:"pointer",padding:6,borderRadius:8,display:"flex"}}><Trash2 size={14}/></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {modal&&(
        <Modal title={modal==="create"?"Add Guest":"Edit Guest"} onClose={()=>setModal(null)}>
          <GuestForm guest={modal!=="create"?modal:null} events={events} onSave={saveGuest} onClose={()=>setModal(null)}/>
        </Modal>
      )}
    </div>
  );
};

/* ─────────────── BUDGET PAGE ─────────────── */
const BudgetForm = ({item,events,onSave,onClose}) => {
  const [f,setF]=useState(item||{eventId:events[0]?.id||"",category:"Venue",allocated:"",spent:"",description:""});
  const [errs,setErrs]=useState({});
  const [loading,setLoading]=useState(false);
  const up=(k,v)=>setF(p=>({...p,[k]:v}));
  const submit = async ()=>{
    const e={};
    if(!f.eventId) e.eventId='Select event';
    if(!f.category) e.category='Select category';
    if(f.allocated!=="" && isNaN(Number(f.allocated))) e.allocated='Invalid number';
    if(f.spent!=="" && isNaN(Number(f.spent))) e.spent='Invalid number';
    setErrs(e);
    if(Object.keys(e).length) return;
    setLoading(true);
    try{ await new Promise(r=>setTimeout(r,300)); onSave({...f,allocated:+f.allocated,spent:+f.spent}); }
    finally{ setLoading(false); }
  };
  return (
    <div>
      <Sel label="Event" value={f.eventId} onChange={e=>up("eventId",e.target.value)}>
        {events.filter(ev=>!ev.deleted).map(ev=><option key={ev.id} value={ev.id}>{ev.title}</option>)}
      </Sel>
      <Sel label="Category" value={f.category} onChange={e=>up("category",e.target.value)}>
        {BUDGET_CATS.map(c=><option key={c}>{c}</option>)}
      </Sel>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Inp label="Allocated ($)" type="number" value={f.allocated} onChange={e=>up("allocated",e.target.value)} placeholder="50000" error={errs.allocated}/>
        <Inp label="Spent ($)"     type="number" value={f.spent}     onChange={e=>up("spent",e.target.value)}     placeholder="35000" error={errs.spent}/>
      </div>
      <Inp label="Description" value={f.description} onChange={e=>up("description",e.target.value)} placeholder="What is this budget for?"/>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn>
        <Btn onClick={submit} disabled={loading}>{loading?"Saving…":"Save"}</Btn>
      </div>
    </div>
  );
};

const Budget = ({budget,setBudget,events,toast,user}) => {
  const [modal,setModal]=useState(null);
  const [eventFilter,setEventFilter]=useState("all");

  const list = budget.filter(b=>eventFilter==="all"||b.eventId===eventFilter);

  const totalAllocated = list.reduce((s,b)=>s+(+b.allocated||0),0);
  const totalSpent     = list.reduce((s,b)=>s+(+b.spent||0),0);
  const totalRemaining = totalAllocated - totalSpent;
  const usagePct       = pct(totalSpent,totalAllocated);
  const overBudget     = usagePct>=90;

  const saveBudget = (f) => {
    const data = {...f,allocated:+f.allocated,spent:+f.spent};
    if(modal==="create") { setBudget(p=>[...p,{...data,id:uid()}]); toast("Budget item added!","success"); }
    else { setBudget(p=>p.map(b=>b.id===modal.id?{...b,...data}:b)); toast("Budget updated!","success"); }
    setModal(null);
  };

  const del=(id)=>{setBudget(p=>p.filter(b=>b.id!==id));toast("Item removed","warning");};

  const catData = BUDGET_CATS.map(cat=>({
    name:cat,
    allocated:list.filter(b=>b.category===cat).reduce((s,b)=>s+(+b.allocated||0),0),
    spent:list.filter(b=>b.category===cat).reduce((s,b)=>s+(+b.spent||0),0),
  })).filter(d=>d.allocated>0);

  const PIE_COLORS = [T.primary,T.violet,T.cyan,T.green,T.amber,T.red,"#EC4899","#8B5CF6","#06B6D4"];

  return (
    <div style={{padding:28,maxWidth:1400}}>
      {overBudget&&(
        <div style={{background:T.amberGlow,border:`1px solid ${T.amber}`,borderRadius:14,padding:"14px 20px",marginBottom:24,display:"flex",alignItems:"center",gap:12}}>
          <AlertTriangle size={18} color={T.amber}/>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:T.amber}}>Budget Alert — {usagePct}% Used</div>
            <div style={{fontSize:12,color:T.textSub}}>You have used over 90% of your allocated budget. Review expenses.</div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:24}}>
        {[
          {l:"Total Allocated",v:fmtC(totalAllocated),c:T.primary},
          {l:"Total Spent",    v:fmtC(totalSpent),    c:usagePct>=90?T.red:T.green},
          {l:"Remaining",      v:fmtC(totalRemaining), c:T.cyan},
          {l:"Usage",          v:`${usagePct}%`,       c:usagePct>=90?T.red:usagePct>=70?T.amber:T.green},
        ].map(s=>(
          <div key={s.l} style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"18px 20px"}}>
            <div style={{fontSize:22,fontWeight:800,color:s.c}}>{s.v}</div>
            <div style={{fontSize:12,color:T.textSub,marginTop:4}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <Card style={{marginBottom:24,padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
          <span style={{fontSize:13,fontWeight:700,color:T.text}}>Overall Budget Usage</span>
          <span style={{fontSize:13,fontWeight:700,color:usagePct>=90?T.red:T.green}}>{usagePct}%</span>
        </div>
        <div style={{background:T.surface,borderRadius:8,height:10,overflow:"hidden"}}>
          <div style={{height:"100%",borderRadius:8,background:usagePct>=90?T.red:usagePct>=70?T.amber:T.green,width:`${usagePct}%`,transition:"width .5s"}}/>
        </div>
      </Card>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:24}}>
        {/* Category breakdown pie */}
        <Card>
          <h3 style={{fontSize:14,fontWeight:700,color:T.text,margin:"0 0 16px"}}>Spending by Category</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={catData} dataKey="spent" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3}>
                {catData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
              </Pie>
              <Tooltip formatter={v=>[fmtC(v)]} contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:12}}/>
            </PieChart>
          </ResponsiveContainer>
          <div style={{display:"flex",flexWrap:"wrap",gap:"6px 14px",marginTop:8}}>
            {catData.map((d,i)=>(
              <div key={d.name} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:T.textSub}}>
                <span style={{width:8,height:8,borderRadius:2,background:PIE_COLORS[i%PIE_COLORS.length],display:"inline-block"}}/>
                {d.name}
              </div>
            ))}
          </div>
        </Card>

        {/* Allocated vs Spent bar */}
        <Card>
          <h3 style={{fontSize:14,fontWeight:700,color:T.text,margin:"0 0 16px"}}>Allocated vs Spent</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={catData} barSize={12}>
              <XAxis dataKey="name" tick={{fill:T.textSub,fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:T.textSub,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`$${v/1000}k`}/>
              <Tooltip contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:12}} formatter={v=>[fmtC(v)]}/>
              <Bar dataKey="allocated" fill={T.violet} radius={[4,4,0,0]} name="Allocated" opacity={0.7}/>
              <Bar dataKey="spent"     fill={T.primary} radius={[4,4,0,0]} name="Spent"/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Filter + Add */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <select value={eventFilter} onChange={e=>setEventFilter(e.target.value)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"9px 14px",color:T.textSub,fontSize:13,fontFamily:"inherit",outline:"none"}}>
          <option value="all">All Events</option>
          {events.filter(e=>!e.deleted).map(e=><option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        {can(user,"budget.w")&&<Btn onClick={()=>setModal("create")}><Plus size={16}/>Add Item</Btn>}
      </div>

      {/* Budget Items Table */}
      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${T.border}`}}>
                {["Event","Category","Allocated","Spent","Remaining","Usage","Description",""].map(h=>(
                  <th key={h} style={{padding:"14px 16px",textAlign:"left",fontSize:11,fontWeight:700,color:T.textSub,textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.length===0&&<tr><td colSpan={8} style={{padding:40,textAlign:"center",color:T.textSub}}>No budget items found.</td></tr>}
              {list.map(b=>{
                const ev=events.find(e=>e.id===b.eventId);
                const rem=(+b.allocated||0)-(+b.spent||0);
                const u=pct(b.spent,b.allocated);
                return (
                  <tr key={b.id} style={{borderBottom:`1px solid ${T.border}`}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.02)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{padding:"12px 16px",fontSize:12,color:T.textSub}}>{ev?.title||"—"}</td>
                    <td style={{padding:"12px 16px"}}><Badge label={b.category} color={T.cyan} bg={T.cyanGlow}/></td>
                    <td style={{padding:"12px 16px",fontSize:13,fontWeight:700,color:T.text}}>{fmtC(b.allocated)}</td>
                    <td style={{padding:"12px 16px",fontSize:13,fontWeight:700,color:u>=90?T.red:T.green}}>{fmtC(b.spent)}</td>
                    <td style={{padding:"12px 16px",fontSize:13,color:rem<0?T.red:T.textSub}}>{fmtC(rem)}</td>
                    <td style={{padding:"12px 16px",minWidth:100}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{flex:1,background:T.surface,borderRadius:4,height:6,overflow:"hidden"}}>
                          <div style={{height:"100%",background:u>=90?T.red:u>=70?T.amber:T.green,width:`${u}%`,borderRadius:4}}/>
                        </div>
                        <span style={{fontSize:11,color:u>=90?T.red:T.textSub,fontWeight:700,minWidth:32}}>{u}%</span>
                      </div>
                    </td>
                    <td style={{padding:"12px 16px",fontSize:12,color:T.textDim,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.description}</td>
                    <td style={{padding:"12px 16px"}}>
                      <div style={{display:"flex",gap:6}}>
                        {can(user,"budget.w")&&<button onClick={()=>setModal(b)} style={{background:"none",border:"none",color:T.textSub,cursor:"pointer",padding:6,borderRadius:8,display:"flex"}}><Edit2 size={14}/></button>}
                        {can(user,"budget.w")&&<button onClick={()=>del(b.id)} style={{background:"none",border:"none",color:T.textSub,cursor:"pointer",padding:6,borderRadius:8,display:"flex"}}><Trash2 size={14}/></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {modal&&(
        <Modal title={modal==="create"?"Add Budget Item":"Edit Budget Item"} onClose={()=>setModal(null)}>
          <BudgetForm item={modal!=="create"?modal:null} events={events} onSave={saveBudget} onClose={()=>setModal(null)}/>
        </Modal>
      )}
    </div>
  );
};

/* ─────────────── SETTINGS PAGE ─────────────── */
const SettingsPage = ({user,setUser,toast}) => {
  const [profile,setProfile]=useState({name:user.name,email:user.email,phone:user.phone||"",bio:user.bio||""});
  const [pwds,setPwds]=useState({current:"",next:"",confirm:""});
  const [tab,setTab]=useState("profile");

  const saveProfile = () => {
    setUser(p=>({...p,...profile}));
    toast("Profile updated!","success");
  };

  const changePwd = () => {
    if(pwds.next!==pwds.confirm){toast("Passwords don't match","error");return;}
    if(pwds.next.length<6){toast("Min 6 characters","error");return;}
    toast("Password changed!","success");
    setPwds({current:"",next:"",confirm:""});
  };

  const TABS = [{id:"profile",label:"Profile"},{id:"security",label:"Security"},{id:"roles",label:"Roles & Permissions"},{id:"about",label:"About"}];

  return (
    <div style={{padding:28,maxWidth:800}}>
      <div style={{display:"flex",gap:4,marginBottom:28,background:T.card,borderRadius:14,padding:4,border:`1px solid ${T.border}`,width:"fit-content"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"8px 18px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,transition:"all .15s",background:tab===t.id?T.primary:"transparent",color:tab===t.id?"#fff":T.textSub}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==="profile"&&(
        <Card>
          <div style={{display:"flex",alignItems:"center",gap:20,marginBottom:28,paddingBottom:24,borderBottom:`1px solid ${T.border}`}}>
            <div style={{width:72,height:72,borderRadius:18,background:T.primaryGlow,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:800,color:T.primary,border:`2px solid ${T.primary}`}}>{user.avatar}</div>
            <div>
              <h3 style={{margin:"0 0 4px",fontSize:18,fontWeight:800,color:T.text}}>{user.name}</h3>
              <Badge label={ROLE_META[user.role]?.label} color={ROLE_META[user.role]?.color} bg={ROLE_META[user.role]?.bg}/>
              <p style={{margin:"6px 0 0",fontSize:12,color:T.textDim}}>{user.email}</p>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div style={{gridColumn:"span 2"}}><Inp label="Full Name" value={profile.name} onChange={e=>setProfile(p=>({...p,name:e.target.value}))}/></div>
            <Inp label="Email" type="email" value={profile.email} onChange={e=>setProfile(p=>({...p,email:e.target.value}))}/>
            <Inp label="Phone" value={profile.phone} onChange={e=>setProfile(p=>({...p,phone:e.target.value}))} placeholder="+1-555-0100"/>
          </div>
          <Textarea label="Bio" value={profile.bio} onChange={e=>setProfile(p=>({...p,bio:e.target.value}))} placeholder="Tell us about yourself…" style={{minHeight:80}}/>
          <Btn onClick={saveProfile}>Save Profile</Btn>
        </Card>
      )}

      {tab==="security"&&(
        <Card>
          <h3 style={{margin:"0 0 24px",fontSize:16,fontWeight:700,color:T.text}}>Change Password</h3>
          <Inp label="Current Password" type="password" value={pwds.current} onChange={e=>setPwds(p=>({...p,current:e.target.value}))}/>
          <Inp label="New Password"     type="password" value={pwds.next}    onChange={e=>setPwds(p=>({...p,next:e.target.value}))}/>
          <Inp label="Confirm New"      type="password" value={pwds.confirm} onChange={e=>setPwds(p=>({...p,confirm:e.target.value}))}/>
          <Btn onClick={changePwd} variant="violet">Update Password</Btn>

          <div style={{marginTop:32,paddingTop:24,borderTop:`1px solid ${T.border}`}}>
            <h3 style={{margin:"0 0 12px",fontSize:14,fontWeight:700,color:T.text}}>Active Sessions</h3>
            {[{device:"Chrome · Windows",loc:"Mumbai, IN",time:"Now (current)"}].map((s,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:T.surface,borderRadius:12,border:`1px solid ${T.border}`}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:T.text}}>{s.device}</div>
                  <div style={{fontSize:11,color:T.textSub}}>{s.loc} · {s.time}</div>
                </div>
                <Badge label="Active" color={T.green} bg={T.greenGlow}/>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab==="roles"&&(
        <Card>
          <h3 style={{margin:"0 0 20px",fontSize:16,fontWeight:700,color:T.text}}>Role Permissions</h3>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {ROLES.map(r=>(
              <div key={r} style={{padding:"16px 20px",background:T.surface,borderRadius:14,border:`1px solid ${T.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <Badge label={ROLE_META[r].label} color={ROLE_META[r].color} bg={ROLE_META[r].bg}/>
                  {user.role===r&&<span style={{fontSize:11,color:T.textDim}}>(Your role)</span>}
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {PERMS[r].map(p=>(
                    <span key={p} style={{fontSize:11,padding:"4px 10px",borderRadius:6,background:T.card,color:T.textSub,border:`1px solid ${T.border}`,fontFamily:"monospace"}}>{p}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab==="about"&&(
        <Card>
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{width:64,height:64,borderRadius:18,background:T.primaryGlow,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><Zap size={32} color={T.primary}/></div>
            <h2 style={{fontSize:22,fontWeight:900,color:T.text,margin:"0 0 6px"}}>Festivo</h2>
            <p style={{fontSize:13,color:T.textSub,margin:"0 0 24px"}}>Festival & Event Planner · v1.0.0</p>
            <div style={{display:"flex",flexDirection:"column",gap:8,maxWidth:320,margin:"0 auto"}}>
              {[["Events","Create & manage events with full lifecycle"],["Guests","Track RSVPs, dietary needs & check-ins"],["Budget","Plan budgets & track spending in real-time"],["RBAC","Role-based access for your entire team"]].map(([h,d])=>(
                <div key={h} style={{display:"flex",gap:12,padding:"10px 16px",background:T.surface,borderRadius:12,textAlign:"left"}}>
                  <CheckCircle size={16} color={T.green} style={{flexShrink:0,marginTop:1}}/>
                  <div><div style={{fontSize:12,fontWeight:700,color:T.text}}>{h}</div><div style={{fontSize:11,color:T.textSub}}>{d}</div></div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

/* ─────────────── PAGE TITLES ─────────────── */
const PAGE_TITLES = {dashboard:"Dashboard",events:"Events",guests:"Guest Management",budget:"Budget Tracker",settings:"Settings"};

/* ─────────────── MAIN APP ─────────────── */
export default function App() {
  const [view,setView]   = useState("login");
  const [user,setUser]   = useState(null);
  const [page,setPage]   = useState("dashboard");
  const [collapsed,setCollapsed] = useState(false);
  const [toasts,setToasts]   = useState([]);
  const [events,setEvents]   = useState(()=>store.g("festivo_events",INIT_EVENTS));
  const [guests,setGuests]   = useState(()=>store.g("festivo_guests",INIT_GUESTS));
  const [budget,setBudget]   = useState(()=>store.g("festivo_budget",INIT_BUDGET));
  const [users,setUsers]     = useState(()=>store.g("festivo_users",DEMO_USERS));
  const [locale,setLocale] = useState(()=>store.g("festivo_locale",(typeof navigator!=='undefined'&&navigator.language)||"en-US"));
  const [region,setRegion] = useState(()=>store.g("festivo_region",(typeof navigator!=='undefined'&&navigator.language&&navigator.language.split("-")[1])||"US"));

  useEffect(()=>{ store.s("festivo_events",events); },[events]);
  useEffect(()=>{ store.s("festivo_guests",guests); },[guests]);
  useEffect(()=>{ store.s("festivo_budget",budget); },[budget]);
  useEffect(()=>{ store.s("festivo_users",users);   },[users]);
  useEffect(()=>{ store.s("festivo_locale",locale); window.__FESTIVO_LOCALE=locale; },[locale]);
  useEffect(()=>{ store.s("festivo_region",region); window.__FESTIVO_REGION=region; },[region]);

  const toast = useCallback((message,type="success")=>{
    const id=uid();
    setToasts(p=>[...p,{id,message,type}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3500);
  },[]);

  const handleLogin = (email,password) => {
    const u = users.find(u=>u.email.toLowerCase()===email.toLowerCase()&&u.password===password);
    if(u){ setUser(u); setView("app"); return true; }
    return false;
  };

  const handleRegister = (f) => {
    const exists = users.find(u=>u.email.toLowerCase()===f.email.toLowerCase());
    if(exists){ toast("Email already registered","error"); return; }
    const newUser = {...f,id:uid(),avatar:f.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()};
    setUsers(p=>[...p,newUser]);
    setUser(newUser);
    setView("app");
    toast(`Welcome, ${f.name}!`,"success");
  };

  const handleLogout = () => { setUser(null); setView("login"); setPage("dashboard"); };

  const budgetAlerts = budget.filter(b=>pct(b.spent,b.allocated)>=90).length;

  /* ── INJECT FONT ── */
  useEffect(()=>{
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap";
    document.head.appendChild(link);
    document.body.style.margin="0";
    document.body.style.fontFamily="'Inter',sans-serif";
    document.body.style.background=T.bg;
    document.body.style.color=T.text;
    window.__FESTIVO_LOCALE = locale;
    window.__FESTIVO_REGION = region;
    return ()=>{document.head.removeChild(link);};
  },[]);

  if(view==="login")    return <><LoginPage    onLogin={handleLogin} onGoRegister={()=>setView("register")}/><ToastContainer toasts={toasts}/></>;
  if(view==="register") return <><RegisterPage onRegister={handleRegister} onGoLogin={()=>setView("login")}/><ToastContainer toasts={toasts}/></>;

  return (
    <div style={{display:"flex",minHeight:"100vh",background:T.bg,fontFamily:"'Inter',sans-serif",color:T.text}}>
      <Sidebar page={page} setPage={setPage} user={user} collapsed={collapsed} onLogout={handleLogout}/>
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflowX:"hidden"}}>
        <Topbar title={PAGE_TITLES[page]} collapsed={collapsed} setCollapsed={setCollapsed} user={user} notifCount={budgetAlerts}
          locale={locale} setLocale={setLocale} region={region} setRegion={setRegion}/>
        <main style={{flex:1,overflowY:"auto"}}>
          {page==="dashboard"&&<Dashboard events={events} guests={guests} budget={budget} user={user}/>}
          {page==="events"   &&<Events  events={events} setEvents={setEvents} toast={toast} user={user}/>}
          {page==="guests"   &&<Guests  guests={guests} setGuests={setGuests} events={events} toast={toast} user={user}/>}
          {page==="budget"   &&<Budget  budget={budget} setBudget={setBudget} events={events} toast={toast} user={user}/>}
          {page==="settings" &&<SettingsPage user={user} setUser={u=>setUser(p=>({...p,...u}))} toast={toast}/>}
        </main>
      </div>
      <ToastContainer toasts={toasts}/>
    </div>
  );
}
