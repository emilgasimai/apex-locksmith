// Shared utilities for both Forge and Steelyard directions.
// Live ETA simulator, ZIP check, service-finder data, photo placeholder.

const APEX = window.APEX;

function useLiveEta() {
  // Slow, deterministic-looking drift between 12–22 min based on time of day,
  // ticking down toward "AVAILABLE NOW" every ~6s for visual life.
  const [eta, setEta] = React.useState(() => {
    const h = new Date().getHours();
    // Night = slower, midday = fastest
    const base = (h >= 22 || h < 6) ? 22 : (h >= 7 && h <= 18 ? 14 : 17);
    return base;
  });
  const [techsOnRoad, setTechsOnRoad] = React.useState(4);
  React.useEffect(() => {
    const t = setInterval(() => {
      setEta(prev => {
        const delta = (Math.random() < 0.5 ? -1 : 1);
        const next = Math.max(11, Math.min(24, prev + delta));
        return next;
      });
      setTechsOnRoad(prev => Math.max(2, Math.min(7, prev + (Math.random() < 0.5 ? -1 : 1))));
    }, 5800);
    return () => clearInterval(t);
  }, []);
  return { eta, techsOnRoad };
}

function checkZip(input) {
  const z = (input || "").trim().slice(0,5);
  if (!/^\d{5}$/.test(z)) return { state: "invalid", message: "Enter a 5-digit ZIP" };
  if (APEX.serviceZips.includes(z)) {
    return { state: "in", zip: z, message: `In service area — Denver Metro` };
  }
  // Approximate Colorado vs out of state by leading digit
  if (z.startsWith("80") || z.startsWith("81")) {
    return { state: "edge", zip: z, message: `Outside primary area — call for surcharge quote` };
  }
  return { state: "out", zip: z, message: `Outside service area` };
}

const FINDER_OPTIONS = [
  { id:"home", label:"House / Apartment", icon:"home",
    diag:"Pin-tumbler / smart deadbolt",
    eta:"15 min", price:"$65–$95",
    instructions:["Stay near the door — tech will text on arrival","Have ID matching the address ready","Door opens in 5–10 minutes, no drilling on standard locks"] },
  { id:"car", label:"Car / Truck", icon:"car",
    diag:"Wedge + air bag, no damage",
    eta:"18 min", price:"$75–$135",
    instructions:["Confirm vehicle make, model, year","Tech brings programmer for transponder keys","If keys are inside, we'll wait for you to verify ownership"] },
  { id:"office", label:"Office / Business", icon:"office",
    diag:"Commercial mortise / panic bar",
    eta:"22 min", price:"$135–$220",
    instructions:["Bring proof of business affiliation","After-hours rate applies before 7am / after 7pm","Master keys can be cut on-site"] },
  { id:"safe", label:"Safe", icon:"safe",
    diag:"Mechanical or electronic",
    eta:"By appt", price:"$185+",
    instructions:["Photo of make/model speeds the quote","Most electronic safes open without drilling","Most mechanical safes do too — we manipulate, not destroy"] },
];

// Photo placeholder — striped SVG with mono label for "drop a real photo here"
function PhotoSlot({ label, w=600, h=400, tone="forge", className="", style={} }) {
  const palette = tone === "forge"
    ? { bg:"#e9e3d6", stripe:"#d4ccb8", text:"#3a342a" }
    : { bg:"#2a2a28", stripe:"#1f1f1d", text:"#a8a39a" };
  const id = `s-${Math.random().toString(36).slice(2,8)}`;
  return (
    <div className={`photo-slot ${className}`} style={{ position:"relative", width:"100%", aspectRatio:`${w}/${h}`, ...style }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" style={{ width:"100%", height:"100%", display:"block" }}>
        <defs>
          <pattern id={id} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="14" height="14" fill={palette.bg}/>
            <line x1="0" y1="0" x2="0" y2="14" stroke={palette.stripe} strokeWidth="7"/>
          </pattern>
        </defs>
        <rect width={w} height={h} fill={`url(#${id})`}/>
        <rect x="14" y="14" width={w-28} height={h-28} fill="none" stroke={palette.text} strokeWidth="1" strokeDasharray="4 6" opacity="0.4"/>
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
        <div style={{ fontFamily:"'JetBrains Mono', ui-monospace, monospace", fontSize:11, letterSpacing:".12em", color:palette.text, textTransform:"uppercase", textAlign:"center", background:`${palette.bg}cc`, padding:"6px 10px", border:`1px dashed ${palette.text}80` }}>
          {label}
        </div>
      </div>
    </div>
  );
}

// Tiny iconography drawn with primitives only (lines, rects, circles) — house, car, office, safe, lock, key, shield, star
function Icon({ name, size=22, stroke=1.6, color="currentColor" }) {
  const p = { fill:"none", stroke:color, strokeWidth:stroke, strokeLinecap:"square", strokeLinejoin:"miter" };
  switch (name) {
    case "home": return <svg width={size} height={size} viewBox="0 0 24 24"><path {...p} d="M3 11l9-7 9 7v9h-6v-6h-6v6H3z"/></svg>;
    case "car": return <svg width={size} height={size} viewBox="0 0 24 24"><path {...p} d="M3 14l2-6h14l2 6v5h-3v-2H6v2H3z"/><circle {...p} cx="7" cy="17" r="1.5"/><circle {...p} cx="17" cy="17" r="1.5"/></svg>;
    case "office": return <svg width={size} height={size} viewBox="0 0 24 24"><rect {...p} x="4" y="3" width="16" height="18"/><path {...p} d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M11 21v-3h2v3"/></svg>;
    case "safe": return <svg width={size} height={size} viewBox="0 0 24 24"><rect {...p} x="3" y="4" width="18" height="16"/><circle {...p} cx="14" cy="12" r="3.5"/><path {...p} d="M14 8.5v1M14 14.5v1M10.5 12h1M16.5 12h1M6 8v8"/></svg>;
    case "lock": return <svg width={size} height={size} viewBox="0 0 24 24"><rect {...p} x="5" y="11" width="14" height="10"/><path {...p} d="M8 11V7a4 4 0 018 0v4"/></svg>;
    case "key": return <svg width={size} height={size} viewBox="0 0 24 24"><circle {...p} cx="7" cy="12" r="3.5"/><path {...p} d="M10.5 12H21M18 12v3M15 12v2"/></svg>;
    case "shield": return <svg width={size} height={size} viewBox="0 0 24 24"><path {...p} d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/></svg>;
    case "phone": return <svg width={size} height={size} viewBox="0 0 24 24"><path {...p} d="M5 3h4l2 5-2 2a12 12 0 005 5l2-2 5 2v4a2 2 0 01-2 2A18 18 0 013 5a2 2 0 012-2z"/></svg>;
    case "star": return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 3l2.6 6.1 6.4.6-4.8 4.4 1.4 6.4L12 17.3 6.4 20.5 7.8 14 3 9.7l6.4-.6z" fill={color}/></svg>;
    case "check": return <svg width={size} height={size} viewBox="0 0 24 24"><path {...p} d="M4 12l5 5 11-12"/></svg>;
    case "x": return <svg width={size} height={size} viewBox="0 0 24 24"><path {...p} d="M5 5l14 14M19 5L5 19"/></svg>;
    case "arrow": return <svg width={size} height={size} viewBox="0 0 24 24"><path {...p} d="M4 12h16M14 6l6 6-6 6"/></svg>;
    case "clock": return <svg width={size} height={size} viewBox="0 0 24 24"><circle {...p} cx="12" cy="12" r="9"/><path {...p} d="M12 7v5l3 2"/></svg>;
    case "pin": return <svg width={size} height={size} viewBox="0 0 24 24"><path {...p} d="M12 21s7-6 7-12a7 7 0 10-14 0c0 6 7 12 7 12z"/><circle {...p} cx="12" cy="9" r="2.5"/></svg>;
    default: return null;
  }
}

function Stars({ value=5, color="currentColor", size=14 }) {
  return (
    <span style={{ display:"inline-flex", gap:2, color }}>
      {[0,1,2,3,4].map(i => <Icon key={i} name="star" size={size} color={i < Math.round(value) ? color : "transparent"} />)}
    </span>
  );
}

window.APEXShared = { useLiveEta, checkZip, FINDER_OPTIONS, PhotoSlot, Icon, Stars };
