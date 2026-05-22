// Apex Locksmith — Direction B: "Steelyard"
// Brutalist heavy industrial. Gunmetal default w/ light mode. High-vis safety orange.
// Caution stripes. Archivo Black / DM Sans / Space Grotesk.

const { useLiveEta, checkZip, FINDER_OPTIONS, PhotoSlot, Icon, Stars } = window.APEXShared;
const A = window.APEX;

const S = {
  steel:    "#18181a",
  steel2:   "#26262a",
  steel3:   "#34343a",
  bone:     "#ece6da",
  bone2:    "#dcd5c3",
  hivis:    "#ee5a1a",
  hivisDk:  "#c64210",
  caution:  "#f4c20a",
  green:    "#5cd97a",
  // light mode
  lt_paper:  "#ebe7df",
  lt_paper2: "#dcd5c3",
  lt_ink:    "#18181a",
};

function sPalette(dark) {
  return dark
    ? { bg:S.steel, bg2:S.steel2, bg3:S.steel3, ink:S.bone, inkDim:"#a8a39a", rule:"#3a3a3e", hivis:S.hivis, caution:S.caution, green:S.green, inv:S.bone, invInk:S.steel }
    : { bg:S.lt_paper, bg2:S.lt_paper2, bg3:"#cdc4ad", ink:S.lt_ink, inkDim:"#5a5852", rule:"#bbb2a0", hivis:S.hivisDk, caution:"#c79a08", green:"#2a8a3e", inv:S.steel, invInk:S.bone };
}

// Diagonal caution stripes — yellow/black or yellow/dark
function CautionStripe({ height=8, colorA, colorB, style={} }) {
  return (
    <div style={{
      height, width:"100%",
      backgroundImage: `repeating-linear-gradient(135deg, ${colorA} 0 14px, ${colorB} 14px 28px)`,
      ...style,
    }}/>
  );
}

// Hazard tag — NFPA-diamond inspired but rectangular, numbered/lettered
function HazardTag({ children, color, bg, sub }) {
  return (
    <div style={{ display:"inline-flex", flexDirection:"column", alignItems:"flex-start", gap:0, lineHeight:1 }}>
      <div style={{
        background:bg, color,
        padding:"4px 10px",
        fontFamily:"'Space Grotesk', monospace", fontSize:11, fontWeight:700, letterSpacing:".22em", textTransform:"uppercase",
        border:`2px solid ${color}`,
      }}>{children}</div>
      {sub && <div style={{ fontFamily:"'Space Grotesk', monospace", fontSize:9, color, opacity:.7, letterSpacing:".18em", textTransform:"uppercase", marginTop:6 }}>{sub}</div>}
    </div>
  );
}

// ── Live ETA — bar gauge w/ huge minutes display ──────────────────────
function SteelEtaWidget({ P }) {
  const { eta, techsOnRoad } = useLiveEta();
  const pct = Math.min(1, Math.max(0, (24 - eta) / (24 - 11)));
  return (
    <div style={{ padding:"22px 26px", background:P.bg2, border:`2px solid ${P.hivis}`, position:"relative" }}>
      <CautionStripe height={6} colorA={P.caution} colorB={P.bg} style={{ position:"absolute", top:-6, left:0 }}/>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ width:10, height:10, borderRadius:"50%", background:P.green, boxShadow:`0 0 0 3px ${P.green}40` }}/>
          <span style={{ fontFamily:"'Space Grotesk', monospace", fontSize:11, fontWeight:700, letterSpacing:".22em", textTransform:"uppercase", color:P.ink }}>
            LIVE · DISPATCH OPEN
          </span>
        </div>
        <span style={{ fontFamily:"'Space Grotesk', monospace", fontSize:11, color:P.inkDim, letterSpacing:".18em", textTransform:"uppercase" }}>
          {techsOnRoad} ON ROAD
        </span>
      </div>
      <div style={{ display:"flex", alignItems:"baseline", gap:10, marginTop:6 }}>
        <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:104, lineHeight:.85, color:P.hivis, letterSpacing:"-.04em" }}>{eta}</div>
        <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:32, lineHeight:1, color:P.ink, letterSpacing:".02em", textTransform:"uppercase" }}>MIN</div>
        <div style={{ flex:1, fontFamily:"'DM Sans', sans-serif", fontSize:13, color:P.inkDim, paddingLeft:16, paddingBottom:6, letterSpacing:".05em" }}>
          to your door, anywhere in {A.serviceAreaName}
        </div>
      </div>
      <div style={{ marginTop:16, height:14, background:P.bg, position:"relative", border:`1px solid ${P.rule}` }}>
        <div style={{ position:"absolute", inset:0, width:`${pct*100}%`, background:`repeating-linear-gradient(135deg, ${P.hivis} 0 10px, ${P.hivisDk||P.hivis} 10px 20px)` }}/>
        {[0,25,50,75,100].map(t => (
          <div key={t} style={{ position:"absolute", top:0, left:`${t}%`, width:1, height:14, background:P.inkDim, opacity:.4 }}/>
        ))}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, fontFamily:"'Space Grotesk', monospace", fontSize:10, color:P.inkDim, letterSpacing:".18em" }}>
        <span>FASTEST · 11 MIN</span>
        <span>NIGHT MAX · 24 MIN</span>
      </div>
    </div>
  );
}

// ── Service Finder ────────────────────────────────────────────────────
function SteelServiceFinder({ P }) {
  const [sel, setSel] = React.useState("home");
  const opt = FINDER_OPTIONS.find(o => o.id === sel);
  return (
    <div style={{ background:P.bg2, border:`2px solid ${P.ink}` }}>
      <div style={{ background:P.ink, color:P.inv, padding:"14px 18px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:20, letterSpacing:".04em", textTransform:"uppercase" }}>SERVICE FINDER</div>
        <div style={{ fontFamily:"'Space Grotesk', monospace", fontSize:11, opacity:.7, letterSpacing:".18em", textTransform:"uppercase" }}>STEP 1 OF 1</div>
      </div>
      <div style={{ padding:"24px 26px" }}>
        <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:15, color:P.inkDim, marginBottom:14 }}>What did you lock yourself out of?</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:10 }}>
          {FINDER_OPTIONS.map(o => (
            <button key={o.id} onClick={()=>setSel(o.id)} style={{
              all:"unset", cursor:"pointer",
              padding:"16px 14px",
              background: sel===o.id ? P.hivis : P.bg,
              color: sel===o.id ? P.invInk : P.ink,
              border:`2px solid ${sel===o.id ? P.hivis : P.rule}`,
              display:"flex", flexDirection:"column", gap:10, alignItems:"flex-start",
            }}>
              <Icon name={o.icon} size={26} stroke={2}/>
              <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:14, letterSpacing:".04em", textTransform:"uppercase", textWrap:"balance" }}>{o.label}</div>
            </button>
          ))}
        </div>

        <div style={{ marginTop:24, padding:"20px 22px", background:P.bg, border:`2px solid ${P.hivis}`, position:"relative" }}>
          <CautionStripe height={4} colorA={P.caution} colorB={P.ink} style={{ position:"absolute", top:0, left:0 }}/>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14, paddingTop:6 }}>
            <div>
              <div style={{ fontFamily:"'Space Grotesk', monospace", fontSize:10, letterSpacing:".22em", color:P.hivis, textTransform:"uppercase" }}>▸ DISPATCH PLAN</div>
              <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:28, letterSpacing:".02em", color:P.ink, textTransform:"uppercase", marginTop:4, lineHeight:1 }}>
                {opt.label} lockout
              </div>
            </div>
            <div style={{ display:"flex", gap:18 }}>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontFamily:"'Space Grotesk', monospace", fontSize:10, color:P.inkDim, letterSpacing:".18em" }}>ETA</div>
                <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:24, color:P.ink, marginTop:2 }}>{opt.eta}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontFamily:"'Space Grotesk', monospace", fontSize:10, color:P.inkDim, letterSpacing:".18em" }}>PRICE</div>
                <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:24, color:P.hivis, marginTop:2 }}>{opt.price}</div>
              </div>
            </div>
          </div>
          <ul style={{ listStyle:"none", padding:0, margin:0, display:"grid", gap:8 }}>
            {opt.instructions.map((line, i) => (
              <li key={i} style={{ display:"flex", gap:12, alignItems:"baseline", fontFamily:"'DM Sans', sans-serif", fontSize:14, color:P.ink, lineHeight:1.5 }}>
                <span style={{ display:"inline-block", padding:"2px 6px", background:P.ink, color:P.inv, fontFamily:"'Space Grotesk', monospace", fontSize:10, letterSpacing:".1em", fontWeight:700 }}>{i+1}</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <a href={A.phoneHref} style={{
            marginTop:20, display:"flex", alignItems:"center", justifyContent:"center", gap:10,
            background:P.ink, color:P.inv, padding:"16px 22px", textDecoration:"none",
            fontFamily:"'Archivo Black', sans-serif", fontSize:18, letterSpacing:".06em", textTransform:"uppercase",
          }}>
            <Icon name="phone" size={16}/> Dispatch · {A.phone}
          </a>
        </div>
      </div>
    </div>
  );
}

// ── ZIP Checker ───────────────────────────────────────────────────────
function SteelZipChecker({ P }) {
  const [val, setVal] = React.useState("");
  const [result, setResult] = React.useState(null);
  const submit = (e) => { e?.preventDefault?.(); setResult(checkZip(val)); };
  return (
    <form onSubmit={submit} style={{ background:P.bg2, border:`2px solid ${P.ink}`, padding:0 }}>
      <div style={{ background:P.ink, color:P.inv, padding:"14px 18px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:18, letterSpacing:".04em", textTransform:"uppercase" }}>ZONE CHECK</div>
        <div style={{ fontFamily:"'Space Grotesk', monospace", fontSize:11, opacity:.7, letterSpacing:".18em", textTransform:"uppercase" }}>BY ZIP</div>
      </div>
      <div style={{ padding:"22px 24px" }}>
        <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:14, color:P.inkDim, marginBottom:12 }}>
          We dispatch across {A.serviceAreaName}. Check your ZIP — we'll tell you immediately.
        </div>
        <div style={{ display:"flex" }}>
          <input
            value={val}
            onChange={(e)=>{ setVal(e.target.value.replace(/\D/g,"").slice(0,5)); if (result) setResult(null); }}
            placeholder="80202"
            inputMode="numeric"
            style={{
              flex:1, padding:"16px 18px", border:`2px solid ${P.ink}`, borderRight:"none", background:P.bg,
              fontFamily:"'Archivo Black', sans-serif", fontSize:28, letterSpacing:".08em", color:P.ink, outline:"none",
            }}/>
          <button type="submit" style={{
            padding:"0 24px", background:P.hivis, color:P.invInk, border:`2px solid ${P.ink}`,
            fontFamily:"'Archivo Black', sans-serif", fontSize:16, letterSpacing:".06em", textTransform:"uppercase", cursor:"pointer",
          }}>
            Check
          </button>
        </div>
        {result && (
          <div style={{ marginTop:14, padding:"14px 16px", border:`2px solid ${result.state==='in'?P.green:result.state==='edge'?P.caution:P.rule}`, background: result.state==='in' ? `${P.green}22` : "transparent" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <Icon name={result.state==='in' ? 'check' : result.state==='out' ? 'x' : 'pin'} size={20} color={result.state==='in'?P.green:result.state==='edge'?P.caution:P.ink}/>
              <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:18, color:P.ink, letterSpacing:".03em", textTransform:"uppercase" }}>
                {result.state==='in' ? `${result.zip} · COVERED` : result.state==='edge' ? `${result.zip} · FRINGE` : result.state==='invalid' ? "INVALID" : `${result.zip} · OUT`}
              </div>
            </div>
            <div style={{ marginTop:6, fontFamily:"'DM Sans', sans-serif", fontSize:13, color:P.inkDim }}>{result.message}</div>
          </div>
        )}
        <div style={{ marginTop:10, fontFamily:"'Space Grotesk', monospace", fontSize:10, color:P.inkDim, opacity:.7, letterSpacing:".14em", textTransform:"uppercase" }}>
          Try 80205 · 80439 · 90210
        </div>
      </div>
    </form>
  );
}

window.SteelAtoms = { S, sPalette, CautionStripe, HazardTag, SteelEtaWidget, SteelServiceFinder, SteelZipChecker };
