// Apex Locksmith — Direction B: Steelyard — page composer

const { useLiveEta, checkZip, FINDER_OPTIONS, PhotoSlot, Icon, Stars } = window.APEXShared;
const A = window.APEX;
const { S, sPalette, CautionStripe, HazardTag, SteelEtaWidget, SteelServiceFinder, SteelZipChecker } = window.SteelAtoms;

const SPAGES = [
  { id:"home", label:"HOME", num:"01" },
  { id:"services", label:"SERVICES", num:"02" },
  { id:"about", label:"ABOUT", num:"03" },
  { id:"reviews", label:"REVIEWS", num:"04" },
  { id:"contact", label:"CONTACT", num:"05" },
];

// ── Top bar + Header ──────────────────────────────────────────────────
function SteelTopBar({ P }) {
  return (
    <>
      <CautionStripe height={6} colorA={P.caution} colorB={P.ink}/>
      <div style={{ background:P.ink, color:P.inv, fontFamily:"'Space Grotesk', monospace", fontSize:11, letterSpacing:".18em", textTransform:"uppercase", fontWeight:600 }}>
        <div style={{ maxWidth:1180, margin:"0 auto", padding:"8px 32px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", gap:18, alignItems:"center" }}>
            <span style={{ display:"inline-flex", gap:6, alignItems:"center" }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:P.green }}/>
              ON-DUTY · 24/7
            </span>
            <span style={{ opacity:.6 }}>{A.license}</span>
          </div>
          <a href={A.phoneHref} style={{ color:P.hivis, textDecoration:"none", display:"inline-flex", gap:8, alignItems:"center", fontFamily:"'Archivo Black', sans-serif", fontSize:14, letterSpacing:".06em" }}>
            <Icon name="phone" size={12}/> {A.phone}
          </a>
        </div>
      </div>
    </>
  );
}

function SteelHeader({ P, page, setPage }) {
  return (
    <header style={{ background:P.bg, borderBottom:`3px solid ${P.ink}` }}>
      <div style={{ maxWidth:1180, margin:"0 auto", padding:"22px 32px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <button onClick={()=>setPage('home')} style={{ all:"unset", cursor:"pointer", display:"flex", gap:14, alignItems:"center" }}>
          {/* Logo: bold A in a stamp */}
          <div style={{ position:"relative", width:48, height:48, background:P.hivis, color:P.invInk, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:32, lineHeight:1 }}>A</div>
            <div style={{ position:"absolute", inset:0, border:`2px solid ${P.ink}` }}/>
          </div>
          <div>
            <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:24, letterSpacing:".02em", lineHeight:1, color:P.ink, textTransform:"uppercase" }}>{A.name}</div>
            <div style={{ fontFamily:"'Space Grotesk', monospace", fontSize:10, letterSpacing:".22em", color:P.inkDim, marginTop:2, textTransform:"uppercase" }}>UNIT 04 · DENVER YARD</div>
          </div>
        </button>
        <nav style={{ display:"flex", gap:0, alignItems:"center" }}>
          {SPAGES.map(pg => (
            <button key={pg.id} onClick={()=>setPage(pg.id)} style={{
              all:"unset", cursor:"pointer", padding:"10px 14px",
              fontFamily:"'Archivo Black', sans-serif", fontSize:12, letterSpacing:".12em",
              color: page===pg.id ? P.invInk : P.ink,
              background: page===pg.id ? P.ink : "transparent",
              display:"inline-flex", gap:6, alignItems:"baseline",
            }}>
              <span style={{ opacity:.5, fontFamily:"'Space Grotesk', monospace", fontSize:10 }}>{pg.num}</span>
              {pg.label}
            </button>
          ))}
          <a href={A.phoneHref} style={{
            marginLeft:14, padding:"14px 18px", background:P.hivis, color:P.invInk,
            textDecoration:"none", fontFamily:"'Archivo Black', sans-serif", fontSize:14, letterSpacing:".06em",
            display:"inline-flex", gap:8, alignItems:"center",
            border:`2px solid ${P.ink}`,
          }}>
            <Icon name="phone" size={12}/> CALL NOW
          </a>
        </nav>
      </div>
    </header>
  );
}

// Section heading
function SteelSection({ no, sub, title, color, children }) {
  return (
    <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:24, paddingBottom:14, borderBottom:`3px solid ${color}`, marginBottom:32 }}>
      <div style={{ display:"flex", gap:16, alignItems:"flex-end" }}>
        <HazardTag color={color} bg="transparent" sub={null}>NO.{no}</HazardTag>
        <div>
          <div style={{ fontFamily:"'Space Grotesk', monospace", fontSize:11, letterSpacing:".22em", textTransform:"uppercase", color, opacity:.6 }}>{sub}</div>
          <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:56, lineHeight:.95, letterSpacing:"-.005em", color, textTransform:"uppercase", marginTop:4 }}>{title}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

// ── HOME PAGE ─────────────────────────────────────────────────────────
function SteelHome({ P, sections }) {
  return (
    <>
      {/* HERO */}
      <section style={{ position:"relative", padding:"56px 32px 64px", maxWidth:1180, margin:"0 auto" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1.3fr 1fr", gap:40 }}>
          <div>
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:18 }}>
              <HazardTag color={P.ink} bg={P.caution}>EMERGENCY · 24/7</HazardTag>
              <HazardTag color={P.ink} bg="transparent">{A.serviceAreaName}</HazardTag>
            </div>
            <h1 style={{
              fontFamily:"'Archivo Black', sans-serif", fontSize:144, lineHeight:.85, letterSpacing:"-.025em",
              color:P.ink, margin:"0 0 16px", textTransform:"uppercase", textWrap:"balance",
            }}>
              We open<br/>
              <span style={{ background:P.hivis, color:P.invInk, padding:"0 8px", display:"inline-block", marginRight:8 }}>locked</span>
              things.
            </h1>
            <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:19, lineHeight:1.45, color:P.inkDim, maxWidth:540, marginTop:20 }}>
              Doors. Cars. Safes. Offices. Front gates of warehouses at three in the morning. Apex Locksmith has answered the phone in {A.serviceAreaName} since {A.founded}.
            </p>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:0, marginTop:32, border:`3px solid ${P.ink}` }}>
              <a href={A.phoneHref} style={{
                padding:"22px 24px", background:P.hivis, color:P.invInk, textDecoration:"none",
                display:"flex", flexDirection:"column", gap:4,
                borderRight:`3px solid ${P.ink}`,
              }}>
                <span style={{ fontFamily:"'Space Grotesk', monospace", fontSize:11, letterSpacing:".22em", opacity:.8 }}>TAP TO CALL</span>
                <span style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:34, letterSpacing:".02em", lineHeight:1 }}>{A.phone}</span>
              </a>
              <button style={{
                padding:"22px 24px", background:P.bg, color:P.ink, border:"none", cursor:"pointer",
                fontFamily:"'Archivo Black', sans-serif", fontSize:16, letterSpacing:".06em", textTransform:"uppercase", textAlign:"left",
                display:"flex", flexDirection:"column", justifyContent:"center", gap:4,
              }}>
                <span style={{ fontFamily:"'Space Grotesk', monospace", fontSize:11, letterSpacing:".22em", opacity:.6, fontWeight:600 }}>OR</span>
                <span>Get a quote ↗</span>
              </button>
            </div>
            {/* trust rivets */}
            <div style={{ marginTop:32, display:"flex", gap:22, alignItems:"center", flexWrap:"wrap" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <Icon name="shield" size={20} color={P.hivis}/>
                <span style={{ fontFamily:"'Space Grotesk', monospace", fontSize:11, letterSpacing:".2em", color:P.ink, fontWeight:600, textTransform:"uppercase" }}>LICENSED · BONDED · INSURED</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <Stars value={5} color={P.hivis} size={14}/>
                <span style={{ fontFamily:"'Space Grotesk', monospace", fontSize:11, letterSpacing:".2em", color:P.ink, fontWeight:600, textTransform:"uppercase" }}>{A.rating} · {A.reviewCount} GOOGLE</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <Icon name="clock" size={18} color={P.hivis}/>
                <span style={{ fontFamily:"'Space Grotesk', monospace", fontSize:11, letterSpacing:".2em", color:P.ink, fontWeight:600, textTransform:"uppercase" }}>{A.yearsInBusiness} YRS · EST. {A.founded}</span>
              </div>
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <SteelEtaWidget P={P}/>
            <div style={{ position:"relative" }}>
              <PhotoSlot label="HERO PHOTO · van at warehouse loading dock" tone="steel" w={620} h={420}/>
              <div style={{ position:"absolute", bottom:0, left:0, right:0 }}>
                <CautionStripe height={6} colorA={P.caution} colorB={P.ink}/>
              </div>
              <div style={{ position:"absolute", top:14, left:14 }}>
                <HazardTag color={P.invInk} bg={P.caution}>UNIT 04</HazardTag>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST STRIP — heavy bar */}
      {sections.trust !== false && (
      <section style={{ background:P.ink, color:P.inv, position:"relative" }}>
        <CautionStripe height={6} colorA={P.caution} colorB={P.ink}/>
        <div style={{ maxWidth:1180, margin:"0 auto", padding:"32px 32px", display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:0 }}>
          {[
            { big:`${A.yearsInBusiness}`, label:"YRS / DENVER", sub:`EST. ${A.founded}` },
            { big:`${A.rating}`, label:`${A.reviewCount} REVIEWS`, sub:"GOOGLE / 5-STAR AVG" },
            { big:"15m", label:"MEDIAN ETA", sub:"24/7 DISPATCH" },
            { big:"5", label:"FIELD TECHS", sub:"OWNER-OPERATED" },
          ].map((b,i)=>(
            <div key={i} style={{ borderRight: i<3 ? `2px solid ${P.inv}25` : "none", paddingLeft: i>0 ? 24 : 0, paddingRight: i<3 ? 24 : 0 }}>
              <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:72, lineHeight:.9, color:P.hivis, letterSpacing:"-.02em" }}>{b.big}</div>
              <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:14, color:P.inv, marginTop:8, letterSpacing:".06em" }}>{b.label}</div>
              <div style={{ fontFamily:"'Space Grotesk', monospace", fontSize:10, color:P.inv, opacity:.55, marginTop:4, letterSpacing:".18em" }}>{b.sub}</div>
            </div>
          ))}
        </div>
      </section>)}

      {/* SERVICE FINDER + ZIP */}
      {sections.finder !== false && (
      <section style={{ padding:"72px 32px", maxWidth:1180, margin:"0 auto" }}>
        <SteelSection no="02" sub="Triage" title="What's locked?" color={P.ink}/>
        <div style={{ display:"grid", gridTemplateColumns:"1.5fr 1fr", gap:24 }}>
          <SteelServiceFinder P={P}/>
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <SteelZipChecker P={P}/>
            <div style={{ background:P.ink, color:P.inv, padding:"22px 24px", position:"relative" }}>
              <CautionStripe height={4} colorA={P.caution} colorB={P.ink} style={{ position:"absolute", top:0, left:0 }}/>
              <div style={{ fontFamily:"'Space Grotesk', monospace", fontSize:11, color:P.hivis, letterSpacing:".22em", textTransform:"uppercase", marginTop:6 }}>FAIR PRICE GUARANTEE</div>
              <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:14, lineHeight:1.5, color:P.inv, margin:"6px 0 0" }}>
                The number you hear on the phone is the number on the receipt. No "discovery fee", no upsell at the door. If we ever drill a standard lock that didn't need it, the job is on us.
              </p>
            </div>
          </div>
        </div>
      </section>)}

      {/* SERVICES GRID */}
      {sections.services !== false && (
      <section style={{ padding:"72px 32px", maxWidth:1180, margin:"0 auto", borderTop:`3px solid ${P.ink}` }}>
        <SteelSection no="03" sub="Service catalogue" title="Five trades" color={P.ink}/>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:0, border:`3px solid ${P.ink}` }}>
          {A.services.map((s, i) => (
            <article key={s.id} style={{
              padding:"24px 24px 26px", background:P.bg2,
              borderRight: ((i+1) % 3 !== 0) ? `2px solid ${P.ink}` : "none",
              borderBottom: i < 3 ? `2px solid ${P.ink}` : "none",
              position:"relative",
              display:"flex", flexDirection:"column", justifyContent:"space-between", minHeight:240,
            }}>
              <div style={{ position:"absolute", top:0, left:0, padding:"4px 10px", background:P.ink, color:P.inv, fontFamily:"'Space Grotesk', monospace", fontSize:10, letterSpacing:".22em" }}>SVC·{(i+1).toString().padStart(2,'0')}</div>
              <div style={{ marginTop:24 }}>
                <Icon name={s.id==='emergency'?'phone':s.id==='residential'?'home':s.id==='commercial'?'office':s.id==='smart'?'lock':'safe'} size={36} stroke={2.2} color={P.hivis}/>
                <h3 style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:26, lineHeight:1, letterSpacing:".01em", color:P.ink, margin:"14px 0 10px", textTransform:"uppercase", textWrap:"balance" }}>{s.name}</h3>
                <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:14, lineHeight:1.5, color:P.inkDim, margin:0 }}>{s.blurb}</p>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:18, paddingTop:14, borderTop:`1px solid ${P.rule}`, alignItems:"flex-end" }}>
                <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:22, color:P.hivis, letterSpacing:".02em" }}>FROM ${s.priceFrom}</div>
                <div style={{ fontFamily:"'Space Grotesk', monospace", fontSize:10, color:P.inkDim, letterSpacing:".18em", textTransform:"uppercase" }}>{s.eta}</div>
              </div>
            </article>
          ))}
          {/* sixth — CTA tile */}
          <article style={{
            padding:"24px 26px 26px", background:P.hivis, color:P.invInk, display:"flex", flexDirection:"column", justifyContent:"space-between",
            minHeight:240, position:"relative",
          }}>
            <div style={{ position:"absolute", top:0, left:0, padding:"4px 10px", background:P.ink, color:P.inv, fontFamily:"'Space Grotesk', monospace", fontSize:10, letterSpacing:".22em" }}>HELP</div>
            <div style={{ marginTop:24 }}>
              <h3 style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:30, lineHeight:.95, margin:0, textTransform:"uppercase" }}>Not sure which? We'll figure it out.</h3>
              <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:14, lineHeight:1.5, marginTop:10 }}>One phone call. Ninety seconds of triage.</p>
            </div>
            <a href={A.phoneHref} style={{ marginTop:14, color:P.invInk, textDecoration:"none", fontFamily:"'Archivo Black', sans-serif", fontSize:28, letterSpacing:".02em" }}>{A.phone} →</a>
          </article>
        </div>
      </section>)}

      {/* PROCESS */}
      {sections.process !== false && (
      <section style={{ padding:"72px 32px", maxWidth:1180, margin:"0 auto" }}>
        <SteelSection no="04" sub="Procedure" title="Three steps" color={P.ink}/>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:18 }}>
          {A.process.map((p, i) => (
            <div key={p.n} style={{ background:P.bg2, border:`2px solid ${P.ink}`, padding:"24px 26px 28px", position:"relative" }}>
              <div style={{ position:"absolute", top:0, left:0, right:0 }}>
                <CautionStripe height={6} colorA={P.caution} colorB={P.ink}/>
              </div>
              <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:96, lineHeight:.85, color:P.hivis, letterSpacing:"-.04em", marginTop:14 }}>0{p.n}</div>
              <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:24, color:P.ink, letterSpacing:".02em", textTransform:"uppercase", marginTop:14 }}>{p.title}</div>
              <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:14, lineHeight:1.5, color:P.inkDim, marginTop:8 }}>{p.body}</p>
            </div>
          ))}
        </div>
      </section>)}

      {/* REVIEWS */}
      {sections.reviews !== false && (
      <section style={{ padding:"72px 32px", maxWidth:1180, margin:"0 auto", borderTop:`3px solid ${P.ink}` }}>
        <SteelSection no="05" sub={`${A.reviewCount} Google reviews`} title={`${A.rating}★ on Google`} color={P.ink}>
          <a href="#" style={{ fontFamily:"'Space Grotesk', monospace", fontSize:11, letterSpacing:".18em", color:P.ink, textTransform:"uppercase", textDecoration:"none", borderBottom:`2px solid ${P.hivis}`, paddingBottom:2 }}>READ ALL {A.reviewCount} ↗</a>
        </SteelSection>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:18 }}>
          {A.reviews.slice(0,3).map((r, i) => (
            <article key={i} style={{ background:P.bg2, border:`2px solid ${P.ink}`, padding:"22px 24px", display:"flex", flexDirection:"column" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <Stars value={r.stars} color={P.hivis} size={14}/>
                <span style={{ fontFamily:"'Space Grotesk', monospace", fontSize:10, color:P.inkDim, letterSpacing:".18em", textTransform:"uppercase" }}>{r.date}</span>
              </div>
              <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:15, lineHeight:1.55, color:P.ink, margin:"14px 0 16px", flex:1, textWrap:"pretty" }}>"{r.body}"</p>
              <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:16, color:P.ink, letterSpacing:".03em", textTransform:"uppercase", borderTop:`1px solid ${P.rule}`, paddingTop:12 }}>{r.name}</div>
            </article>
          ))}
        </div>
      </section>)}

      {/* ABOUT SNIPPET */}
      {sections.about !== false && (
      <section style={{ padding:"72px 32px", maxWidth:1180, margin:"0 auto" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:48, alignItems:"center" }}>
          <div>
            <SteelSection no="06" sub="The shop" title="Owner-operated" color={P.ink}/>
            <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:17, lineHeight:1.55, color:P.ink, margin:"0 0 14px" }}>
              Five techs. One dispatcher. Every truck owned by Apex, every tech on staff. The person at your door is the person we'd send to our mom's house at 2 AM.
            </p>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:18 }}>
              {A.badges.map(b => (
                <HazardTag key={b} color={P.ink} bg={P.bg2}>{b}</HazardTag>
              ))}
            </div>
          </div>
          <div style={{ position:"relative" }}>
            <PhotoSlot label="OWNER · Marcus, in shop" tone="steel" w={520} h={620}/>
            <div style={{ position:"absolute", top:14, left:14 }}>
              <HazardTag color={P.invInk} bg={P.hivis}>FOUNDER · {A.owner.split(" ")[1].toUpperCase()}</HazardTag>
            </div>
          </div>
        </div>
      </section>)}
    </>
  );
}

// ── SERVICES PAGE ─────────────────────────────────────────────────────
function SteelServicesPage({ P }) {
  return (
    <section style={{ padding:"64px 32px", maxWidth:1180, margin:"0 auto" }}>
      <SteelSection no="02" sub="Full service catalogue" title="Five trades. One number." color={P.ink}/>
      <div style={{ display:"grid", gap:0, border:`3px solid ${P.ink}` }}>
        {A.services.map((s, i) => (
          <article key={s.id} style={{
            display:"grid", gridTemplateColumns:"260px 1fr 240px",
            borderBottom: i < A.services.length - 1 ? `2px solid ${P.ink}` : "none",
            background: i % 2 === 0 ? P.bg2 : P.bg,
          }}>
            <div style={{ borderRight:`2px solid ${P.ink}` }}>
              <PhotoSlot label={`${s.id.toUpperCase()} · field photo`} tone="steel" w={400} h={300}/>
            </div>
            <div style={{ padding:"24px 32px" }}>
              <HazardTag color={P.ink} bg={P.caution}>SVC·{(i+1).toString().padStart(2,'0')}</HazardTag>
              <h3 style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:42, lineHeight:1, color:P.ink, letterSpacing:"-.01em", margin:"10px 0 12px", textTransform:"uppercase" }}>{s.name}</h3>
              <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:15, lineHeight:1.55, color:P.inkDim, margin:0, maxWidth:540 }}>{s.blurb}</p>
              <div style={{ display:"flex", gap:8, marginTop:18, flexWrap:"wrap" }}>
                {(s.id==="emergency" ? ["House","Car","Office","Safe","Mailbox","Gate"] :
                  s.id==="residential" ? ["Rekey","Deadbolts","Smart locks","Mortise","Patio doors","Mailbox"] :
                  s.id==="commercial" ? ["Master key","Panic bars","High-security","Restricted keyways","Door closers"] :
                  s.id==="smart" ? ["Z-Wave","Zigbee","Keypad","Biometric","Camera + lock","Schlage Encode","Yale","August"] :
                  ["Combo recovery","Electronic","In-floor install","Move + anchor","Boltwork"]
                ).map(tag => <HazardTag key={tag} color={P.ink} bg="transparent">{tag}</HazardTag>)}
              </div>
            </div>
            <div style={{ padding:"24px 24px", borderLeft:`2px solid ${P.ink}`, background:P.ink, color:P.inv, display:"flex", flexDirection:"column", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontFamily:"'Space Grotesk', monospace", fontSize:10, letterSpacing:".22em", opacity:.6, textTransform:"uppercase" }}>FROM</div>
                <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:56, lineHeight:1, color:P.hivis, letterSpacing:"-.02em", marginTop:4 }}>${s.priceFrom}</div>
                <div style={{ fontFamily:"'Space Grotesk', monospace", fontSize:10, letterSpacing:".18em", opacity:.6, marginTop:14, textTransform:"uppercase" }}>ETA · {s.eta}</div>
              </div>
              <a href={A.phoneHref} style={{ marginTop:14, padding:"14px 14px", background:P.hivis, color:P.invInk, textDecoration:"none", fontFamily:"'Archivo Black', sans-serif", fontSize:14, letterSpacing:".06em", textTransform:"uppercase", textAlign:"center" }}>
                Book this →
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ── ABOUT PAGE ────────────────────────────────────────────────────────
function SteelAboutPage({ P }) {
  return (
    <section style={{ padding:"64px 32px", maxWidth:1180, margin:"0 auto" }}>
      <SteelSection no="03" sub="The shop" title="Owner-operated since 2008" color={P.ink}/>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:48 }}>
        <div>
          <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:18, lineHeight:1.55, color:P.ink, marginTop:0 }}>
            Marcus Holloway started Apex out of a Ford E-150 with a milling machine bolted to the deck. Eighteen years later he still picks up overnight dispatch on Saturdays — which is more than we can say for any of the companies that mailbox-spam your neighborhood with fridge magnets.
          </p>
          <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:15, lineHeight:1.55, color:P.inkDim }}>
            We are deliberately small. Every Apex truck is owned by Apex. Every tech on it has been trained in-house for at least six months. We carry restricted-keyway blanks most shops don't bother stocking, and we'll cut you a key for your 1948 Schlage if that's the door you need open.
          </p>
          <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:15, lineHeight:1.55, color:P.inkDim }}>
            We don't subcontract. We don't run a referral mill. The number on the truck is the number you called.
          </p>
        </div>
        <div style={{ display:"grid", gap:14 }}>
          <PhotoSlot label="THE SHOP · CURTIS STREET" tone="steel" w={600} h={380}/>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <PhotoSlot label="VAN 04" tone="steel" w={300} h={220}/>
            <PhotoSlot label="KEY MACHINE" tone="steel" w={300} h={220}/>
          </div>
        </div>
      </div>
      <div style={{ marginTop:56, paddingTop:32, borderTop:`3px solid ${P.ink}` }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:14, marginBottom:24 }}>
          <HazardTag color={P.ink} bg={P.caution}>ROSTER</HazardTag>
          <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:32, color:P.ink, letterSpacing:".01em", textTransform:"uppercase" }}>The team</div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:14 }}>
          {A.team.map((m, i) => (
            <div key={i} style={{ background:P.bg2, border:`2px solid ${P.ink}` }}>
              <PhotoSlot label={m.name} tone="steel" w={240} h={260}/>
              <div style={{ padding:"14px 14px 16px", borderTop:`2px solid ${P.ink}` }}>
                <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:16, letterSpacing:".02em", color:P.ink, textTransform:"uppercase", lineHeight:1.1 }}>{m.name}</div>
                <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:12, color:P.inkDim, marginTop:4 }}>{m.role}</div>
                <div style={{ fontFamily:"'Space Grotesk', monospace", fontSize:10, color:P.hivis, marginTop:6, letterSpacing:".18em", fontWeight:700 }}>SINCE {m.since}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── REVIEWS PAGE ──────────────────────────────────────────────────────
function SteelReviewsPage({ P }) {
  return (
    <section style={{ padding:"64px 32px", maxWidth:1180, margin:"0 auto" }}>
      <SteelSection no="04" sub={`${A.reviewCount} verified Google reviews`} title={`${A.rating} stars`} color={P.ink}/>
      <div style={{ display:"grid", gridTemplateColumns:"320px 1fr", gap:32 }}>
        <aside>
          <div style={{ background:P.ink, color:P.inv, padding:"24px 24px" }}>
            <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:96, lineHeight:1, color:P.hivis, letterSpacing:"-.04em" }}>{A.rating}</div>
            <Stars value={5} color={P.hivis} size={20}/>
            <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:14, color:P.inv, marginTop:8, opacity:.75 }}>OUT OF {A.reviewCount} · GOOGLE</div>
            <div style={{ marginTop:24, display:"grid", gap:6 }}>
              {[[5, 92],[4, 6],[3, 1],[2, 0],[1, 1]].map(([star, pct]) => (
                <div key={star} style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontFamily:"'Space Grotesk', monospace", fontSize:11, color:P.inv, width:14, opacity:.7 }}>{star}★</span>
                  <span style={{ flex:1, height:6, background:`${P.inv}20`, position:"relative" }}>
                    <span style={{ position:"absolute", inset:0, width:`${pct}%`, background:P.hivis }}/>
                  </span>
                  <span style={{ fontFamily:"'Space Grotesk', monospace", fontSize:10, color:P.inv, opacity:.6, width:30, textAlign:"right" }}>{pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop:14, padding:"14px 16px", border:`2px solid ${P.rule}`, background:P.bg2, fontFamily:"'DM Sans', sans-serif", fontSize:13, color:P.inkDim, lineHeight:1.55 }}>
            We don't filter. Every review lives at our Google Business listing — click any one to verify.
          </div>
        </aside>
        <div style={{ display:"grid", gap:14 }}>
          {A.reviews.map((r, i) => (
            <article key={i} style={{ background:P.bg2, border:`2px solid ${P.ink}`, padding:"22px 26px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:20, letterSpacing:".02em", color:P.ink, textTransform:"uppercase" }}>{r.name}</div>
                  <div style={{ display:"flex", gap:10, alignItems:"center", marginTop:4 }}>
                    <Stars value={r.stars} color={P.hivis} size={14}/>
                    <span style={{ fontFamily:"'Space Grotesk', monospace", fontSize:10, color:P.inkDim, letterSpacing:".18em", textTransform:"uppercase" }}>{r.date}</span>
                  </div>
                </div>
                <HazardTag color={P.ink} bg="transparent">VERIFIED · GOOGLE</HazardTag>
              </div>
              <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:15, lineHeight:1.55, color:P.ink, margin:"14px 0 0", textWrap:"pretty" }}>"{r.body}"</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── CONTACT PAGE ──────────────────────────────────────────────────────
function SteelContactPage({ P }) {
  return (
    <section style={{ padding:"64px 32px", maxWidth:1180, margin:"0 auto" }}>
      <SteelSection no="05" sub="Reach us" title="Pick up the phone." color={P.ink}/>
      <div style={{ display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:32 }}>
        <div>
          <a href={A.phoneHref} style={{
            display:"flex", flexDirection:"column", padding:"30px 36px",
            background:P.hivis, color:P.invInk, textDecoration:"none", border:`3px solid ${P.ink}`, position:"relative",
          }}>
            <CautionStripe height={6} colorA={P.caution} colorB={P.ink} style={{ position:"absolute", top:0, left:0 }}/>
            <span style={{ fontFamily:"'Space Grotesk', monospace", fontSize:12, letterSpacing:".24em", marginTop:10, fontWeight:700 }}>DISPATCH · OPEN NOW</span>
            <span style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:104, lineHeight:1, letterSpacing:"-.025em", marginTop:8 }}>{A.phone}</span>
            <span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:14, marginTop:8 }}>Real human · 24 hours · 365 days</span>
          </a>
          <div style={{ marginTop:18, display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div style={{ background:P.bg2, border:`2px solid ${P.ink}`, padding:"18px 20px" }}>
              <HazardTag color={P.ink} bg="transparent">HOURS</HazardTag>
              <div style={{ marginTop:10, fontFamily:"'DM Sans', sans-serif", fontSize:14, color:P.ink, lineHeight:1.7 }}>
                Dispatch: <strong>24/7</strong><br/>
                Shop walk-ins: Mon–Sat 8a–6p
              </div>
            </div>
            <div style={{ background:P.bg2, border:`2px solid ${P.ink}`, padding:"18px 20px" }}>
              <HazardTag color={P.ink} bg="transparent">SHOP</HazardTag>
              <div style={{ marginTop:10, fontFamily:"'DM Sans', sans-serif", fontSize:14, color:P.ink, lineHeight:1.7 }}>
                2244 Curtis St<br/>Denver, CO 80205
              </div>
            </div>
            <div style={{ background:P.bg2, border:`2px solid ${P.ink}`, padding:"18px 20px" }}>
              <HazardTag color={P.ink} bg="transparent">EMAIL</HazardTag>
              <div style={{ marginTop:10, fontFamily:"'DM Sans', sans-serif", fontSize:14, color:P.ink, lineHeight:1.7 }}>{A.email}</div>
            </div>
            <div style={{ background:P.bg2, border:`2px solid ${P.ink}`, padding:"18px 20px" }}>
              <HazardTag color={P.ink} bg="transparent">CREDENTIALS</HazardTag>
              <div style={{ marginTop:10, fontFamily:"'DM Sans', sans-serif", fontSize:13, color:P.ink, lineHeight:1.55 }}>{A.license}<br/>Bonded $1M · Insured · ALOA</div>
            </div>
          </div>
        </div>
        <form style={{ background:P.bg2, border:`3px solid ${P.ink}`, padding:"26px 26px", display:"grid", gap:14 }}
              onSubmit={(e)=>{ e.preventDefault(); alert("Not a real form — call us, it's faster."); }}>
          <HazardTag color={P.ink} bg={P.caution}>NON-URGENT REQUEST</HazardTag>
          <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:30, lineHeight:1, color:P.ink, letterSpacing:"-.01em", textTransform:"uppercase" }}>Send a note</div>
          {[
            { label:"NAME", ph:"Marcus H." },
            { label:"PHONE", ph:"(303) 555-1234" },
            { label:"ZIP", ph:"80202" },
          ].map(f => (
            <label key={f.label} style={{ display:"grid", gap:4 }}>
              <span style={{ fontFamily:"'Space Grotesk', monospace", fontSize:10, letterSpacing:".22em", color:P.inkDim, fontWeight:700, textTransform:"uppercase" }}>{f.label}</span>
              <input placeholder={f.ph} style={{ border:`2px solid ${P.rule}`, background:P.bg, padding:"10px 12px", fontFamily:"'DM Sans', sans-serif", fontSize:15, color:P.ink, outline:"none" }}/>
            </label>
          ))}
          <label style={{ display:"grid", gap:4 }}>
            <span style={{ fontFamily:"'Space Grotesk', monospace", fontSize:10, letterSpacing:".22em", color:P.inkDim, fontWeight:700, textTransform:"uppercase" }}>WHAT'S UP?</span>
            <textarea rows={4} placeholder="Rekey after move-in, smart lock install, etc." style={{ border:`2px solid ${P.rule}`, background:P.bg, padding:"10px 12px", fontFamily:"'DM Sans', sans-serif", fontSize:15, color:P.ink, outline:"none", resize:"vertical" }}/>
          </label>
          <button style={{ padding:"14px 22px", background:P.hivis, color:P.invInk, border:`2px solid ${P.ink}`, cursor:"pointer", fontFamily:"'Archivo Black', sans-serif", fontSize:16, letterSpacing:".06em", textTransform:"uppercase" }}>
            Send →
          </button>
        </form>
      </div>
    </section>
  );
}

// ── Footer + CTA ──────────────────────────────────────────────────────
function SteelFooter({ P }) {
  return (
    <>
      <section style={{ background:P.ink, color:P.inv, padding:"56px 32px 64px", position:"relative" }}>
        <CautionStripe height={6} colorA={P.caution} colorB={P.ink} style={{ position:"absolute", top:0, left:0 }}/>
        <div style={{ maxWidth:1180, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center", gap:32, paddingTop:10 }}>
          <div>
            <HazardTag color={P.caution} bg="transparent">IF YOU'RE LOCKED OUT</HazardTag>
            <div style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:80, lineHeight:.9, letterSpacing:"-.025em", textTransform:"uppercase", marginTop:14 }}>
              Stop reading.<br/>Start dialing.
            </div>
          </div>
          <a href={A.phoneHref} style={{ background:P.hivis, color:P.invInk, padding:"22px 36px", textDecoration:"none", display:"inline-flex", flexDirection:"column", border:`2px solid ${P.caution}` }}>
            <span style={{ fontFamily:"'Space Grotesk', monospace", fontSize:10, letterSpacing:".24em", fontWeight:700 }}>CALL DISPATCH</span>
            <span style={{ fontFamily:"'Archivo Black', sans-serif", fontSize:52, lineHeight:1, letterSpacing:"-.02em" }}>{A.phone}</span>
          </a>
        </div>
      </section>
      <footer style={{ background:P.bg, color:P.ink, padding:"22px 32px", borderTop:`3px solid ${P.ink}` }}>
        <div style={{ maxWidth:1180, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center", fontFamily:"'Space Grotesk', monospace", fontSize:10, letterSpacing:".18em", textTransform:"uppercase", opacity:.7, fontWeight:600 }}>
          <span>© {new Date().getFullYear()} {A.name}</span>
          <span>{A.license}</span>
          <span>DENVER METRO · COLORADO</span>
          <span>PRIVACY · TERMS · WARRANTY</span>
        </div>
      </footer>
    </>
  );
}

// ── Top-level Steelyard artboard ──────────────────────────────────────
function SteelyardSite({ dark=true, sections={} }) {
  const [page, setPage] = React.useState("home");
  const P = sPalette(dark);
  return (
    <div style={{ background:P.bg, color:P.ink, fontFamily:"'DM Sans', sans-serif", minHeight:"100%", width:"100%" }}>
      <SteelTopBar P={P}/>
      <SteelHeader P={P} page={page} setPage={setPage}/>
      {page === "home" && <SteelHome P={P} sections={sections}/>}
      {page === "services" && <SteelServicesPage P={P}/>}
      {page === "about" && <SteelAboutPage P={P}/>}
      {page === "reviews" && <SteelReviewsPage P={P}/>}
      {page === "contact" && <SteelContactPage P={P}/>}
      <SteelFooter P={P}/>
    </div>
  );
}

window.SteelyardSite = SteelyardSite;
