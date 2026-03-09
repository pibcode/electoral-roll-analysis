import { useState, useCallback, useRef, useMemo, useEffect, Component } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LabelList,
  LineChart, Line, ReferenceLine
} from "recharts";
import { exportChartGraphic, exportTableGraphic } from "./exportUtils";

let xlsxPromise = null;
async function loadXLSX(){
  if(!xlsxPromise){
    xlsxPromise = import("xlsx");
  }
  return xlsxPromise;
}

let classifierModelPromise = null;
function loadClassifierModel(){
  if(!classifierModelPromise){
    classifierModelPromise = import("./classifierModel.js");
  }
  return classifierModelPromise;
}
const FALLBACK_CLASSIFIER = {
  NAME_SCORES:{},
  classifyReligion:()=>({ rel:"Unknown", conf:0, via:"fallback" }),
};


function getAgeGroup(age) {
  const a = parseInt(age);
  if (isNaN(a)) return "Unknown";
  if (a < 18)             return "<18";
  if (a <= 22)            return "18–22";
  if (a <= 30)            return "23–30";
  if (a <= 39)            return "31–39";
  if (a <= 44)            return "40–44★";
  if (a <= 60)            return "45–60";
  return "60+";
}
// ★ = self-mapped (were 18-20 in 2002, now 40-44)
function isSelfMapped(age) { const a=parseInt(age); return a>=40&&a<=44; }
function canonicalStatusFromStamp(stampType){
  const s=String(stampType||"").trim().toUpperCase();
  if(s.includes("ADJUDICATION") || s==="UA" || s==="UNDER ADJ" || s==="UNDER_ADJ") return "Under Adjudication";
  if(s.includes("DELETED") || s==="DEL") return "Deleted";
  return "Active";
}
function canonicalStampFromStatus(status){
  if(status==="Under Adjudication") return "UNDER ADJUDICATION";
  if(status==="Deleted") return "DELETED";
  return "";
}
function uid(){
  try{
    if(typeof crypto!=="undefined" && crypto.randomUUID) return crypto.randomUUID();
  }catch{}
  return `uid_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
}

// ── Colours & theme ──────────────────────────────────────────────────────────
const THEME_DARK = {
  bg:"#0a0f1e", panel:"#111827", border:"#1f2d45", text:"#f1f5f9",
  muted:"#94a3b8", dim:"#475569", blue:"#3b82f6", red:"#ef4444",
  orange:"#f97316", green:"#22c55e", yellow:"#fbbf24",
  Muslim:"#10b981", Hindu:"#f87171", Uncertain:"#fbbf24", Unknown:"#6b7280",
  adj:"#ef4444", del:"#be123c", active:"#2563eb",
};
const THEME_LIGHT = {
  bg:"#f7fafc", panel:"#ffffff", border:"#d9e2ec", text:"#102a43",
  muted:"#486581", dim:"#829ab1", blue:"#1d4ed8", red:"#c81e1e",
  orange:"#f97316", green:"#22c55e", yellow:"#fbbf24",
  Muslim:"#0f766e", Hindu:"#b91c1c", Uncertain:"#b45309", Unknown:"#64748b",
  adj:"#dc2626", del:"#9f1239", active:"#2563eb",
};
const C = { ...THEME_DARK };
const FONT="'Inter','Segoe UI',sans-serif";
const MONO="'JetBrains Mono','Fira Code','Courier New',monospace";
const CLAUDE_VOLUNTEER_MESSAGE=`SIR এর বিষয়ে কিছু হেল্প করতে পারেন বিনামূল্যে মাত্র 5 মিনিট ব্যয় করে।

প্রথমে Claude অ্যাপ ইন্সটল করুন

https://play.google.com/store/apps/details?id=com.anthropic.claude

বা claude.ai সাইটটি ভিজিট করে একাউন্ট বানান। Login with Google অপশন ব্যবহার করতে পারেন।

এরপর আপনার বিধানসভার অন্তত একটি বুথের ফাইনাল লিস্ট ডাউনলোড করুন এই লিংক থেকে। অবশ্যই ENGLISH অপশন বেছে নেবেন।

https://voters.eci.gov.in/download-eroll?stateCode=S25

এরপর নিচে দেওয়া লেখাটি কপি করে Claude এর chatbox এ পেস্ট করুন। + বাটন টিপে Files option টিপে ভোটার লিস্টটি সিলেক্ট করুন। এরপর কমলা ⬆️ বাটনটি টিপে দিলেই কাজ শুরু। এই অবস্থায় অ্যাপ মিনিমাইজ করে অন্য কাজ করতে পারেন। কিছুক্ষন পর এক্সেল ফাইলটি তৈরি হয়ে গেলে ডাউনলোড বাটন টিপে দিলেই কাজ শেষ।

এক্সেল ফাইলটি আমাদের পাঠিয়ে দিন।

Send files to:
- wbsir2025@gmail.com
- wbsir2026@gmail.com`;
const CLAUDE_EXTRACTION_PROMPT=`I have a West Bengal Electoral Roll image based PDF. First two pages contain booth details. Last page is summary. From page 3 the voter details are in the form of cards (maximum three columns and ten rows). Extract all voter entries (stamped and unstamped) into an XLSX using your vision.

STEP 1 - Read the cover page
Extract once and apply to every row:
* ac_no - number before the hyphen in the AC name field (e.g. "287 - NANOOR (SC)" -> 287)
* ac_name - name after the hyphen, without reservation brackets (e.g. -> NANOOR)
* part_no - value next to "Part No." top-right of the header table

STEP 2 - Skip non-voter pages
Process only pages with voter boxes. Skip: cover, maps, photos, blank, List of Additions, List of Deletions, Summary of Electors.

STEP 3 - Extract every voter box
Field Source
ac_no, ac_name, part_no Cover page - same for all rows
serial_no Top-left of box
voter_id Top-right of box (formats: AEM1234567 / LVD1234567 / WB/41/284/051234 / IIX1234567 etc.)
name "Name :" label
relation_type Father / Husband / Mother / Guardian / Other
relation_name Name following relation label
house_no "House Number :" label
age "Age :" label
gender Male / Female / Other
page_no Printed footer bottom-right e.g. "Total Pages 47 - Page 11" -> 11
stamp_type See Step 4

STEP 4 - Stamp detection
Inspect every box for a diagonal stamp:
* UNDER ADJUDICATION - stamp text reads "ADJUDICATION"
* DELETED - stamp text reads "DELETED" or serial number has a "Q" prefix
* blank - no stamp
Stamps are diagonal and may obscure text. Extract all other fields as fully as possible from readable portions.

STEP 5 - XLSX output
Sheet 1 - "Voter Roll"
* Columns in order: ac_no, ac_name, part_no, serial_no, voter_id, name, relation_type, relation_name, house_no, age, gender, page_no, stamp_type
* Widths: ac_no=8, ac_name=16, part_no=8, serial_no=10, voter_id=22, name=28, relation_type=14, relation_name=30, house_no=12, age=6, gender=8, page_no=9, stamp_type=22
* Header: dark blue (#1F3864), white bold Arial 10pt, height 22
* Rows: alternating white / light blue (#D6E4F0), Arial 10pt
* stamp_type cell: red fill (#FF0000) + white bold text if UNDER ADJUDICATION or DELETED
* All cells: thin black border, freeze top row

Sheet 2 - "Summary"
* Source filename, AC No, AC Name, Part No
* Formula-based counts: total entries, UNDER ADJUDICATION, DELETED, unstamped
* Same formatting as Sheet 1

STEP 6 - Verify before saving
* No unexpected gaps in serial_no sequence
* No blank voter_id values
* ac_no / ac_name / part_no identical in every row
* stamp_type contains only "UNDER ADJUDICATION", "DELETED", or blank
* Total rows match "Net Electors -> Total" on the cover page - flag any discrepancy

Notes:
* Never hardcode AC name, number or part - always read from the cover page
* Never skip a voter box
* Leave fields blank if genuinely unreadable - do not guess
* Always use the printed footer page number, never the PDF page index
Don't overthink. The filename should be VoterRoll_{AC No}_{AC Name}_Part{part_no}.xlsx`;
const INSIGHTS_SCHEMA_VERSION="eim_insights.v1";
const INSIGHTS_SHEETS={
  meta:"Insights_Metadata",
  part:"Part_Insights",
  ac:"AC_Insights",
  religionStatus:"Religion_x_Status",
  ageReligion:"Age_x_Religion",
  ageStatus:"Age_x_Status",
};

async function copyPlainText(text, label="Text"){
  try{
    if(navigator?.clipboard?.writeText){
      await navigator.clipboard.writeText(text);
    }else{
      const ta=document.createElement("textarea");
      ta.value=text;
      ta.setAttribute("readonly","");
      ta.style.position="fixed";
      ta.style.left="-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    window.alert(`${label} copied.`);
  }catch(err){
    window.alert(`Copy failed: ${err?.message||"unknown error"}`);
  }
}

function useWindowWidth(){
  const [w,setW]=useState(typeof window!=="undefined"?window.innerWidth:1200);
  useEffect(()=>{
    const h=()=>setW(window.innerWidth);
    window.addEventListener("resize",h);
    return()=>window.removeEventListener("resize",h);
  },[]);
  return w;
}

const pct=(n,d)=>d>0?(n/d*100).toFixed(1)+"%":"–";
const ratioStr=(a,b)=>b>0?(a/b).toFixed(2)+"x":a>0?"∞":"–";

function chi2test(a,b,c,d){
  const n=a+b+c+d; if(!n) return {chi2:0,p:1,sig:false,label:"n.s."};
  const ea=(a+b)*(a+c)/n,eb=(a+b)*(b+d)/n,ec=(c+d)*(a+c)/n,ed=(c+d)*(b+d)/n;
  const minE=Math.min(ea,eb,ec,ed);
  if(minE<5) return {chi2:null,sig:null,label:"n<5"};
  const x=(a-ea)**2/ea+(b-eb)**2/eb+(c-ec)**2/ec+(d-ed)**2/ed;
  const label=x>=10.83?"p<0.001":x>=6.63?"p<0.01":x>=3.84?"p<0.05":"n.s.";
  return {chi2:x.toFixed(2),sig:x>=3.84,label};
}

function erfApprox(x){
  const sign=x<0?-1:1;
  const ax=Math.abs(x);
  const t=1/(1+0.3275911*ax);
  const y=1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-0.284496736)*t+0.254829592)*t)*Math.exp(-ax*ax);
  return sign*y;
}
function normalCdf(x){ return 0.5*(1+erfApprox(x/Math.SQRT2)); }
function chiSquarePValueDf1(chi2){
  if(chi2===null||chi2===undefined||Number.isNaN(+chi2)) return 1;
  const z=Math.sqrt(Math.max(0,+chi2));
  return Math.max(0,Math.min(1,2*(1-normalCdf(z))));
}
function bhAdjust(pvals){
  const n=pvals.length;
  const idx=pvals.map((p,i)=>({p:Number.isFinite(p)?p:1,i})).sort((a,b)=>a.p-b.p);
  const q=new Array(n).fill(1);
  let prev=1;
  for(let k=n-1;k>=0;k--){
    const rank=k+1;
    const val=Math.min(prev,(idx[k].p*n)/rank);
    prev=val;
    q[idx[k].i]=Math.max(0,Math.min(1,val));
  }
  return q;
}

function normalizeHexColor(v, fallback="#ffffff"){
  const s=String(v||"").trim();
  if(/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if(/^#[0-9a-fA-F]{3}$/.test(s)){
    const r=s[1], g=s[2], b=s[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if(/^#[0-9a-fA-F]{8}$/.test(s)) return `#${s.slice(1,7)}`; // strip alpha
  return fallback;
}
function isDarkHexColor(v){
  const hex=normalizeHexColor(v,"#ffffff");
  const r=parseInt(hex.slice(1,3),16);
  const g=parseInt(hex.slice(3,5),16);
  const b=parseInt(hex.slice(5,7),16);
  const lum=(0.299*r+0.587*g+0.114*b)/255;
  return lum<0.45;
}

// ── Small UI primitives ──────────────────────────────────────────────────────
const Tag=({c="children",color=C.blue,bg,style={}})=>(
  <span style={{display:"inline-block",padding:"1px 7px",borderRadius:4,fontSize:11,
    fontWeight:700,color,background:bg||color+"22",letterSpacing:0.3,...style}}>{c}</span>
);
const Pill=({children,active,onClick})=>(
  <button onClick={onClick} style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${active?C.blue:C.border}`,
    background:active?C.blue+"22":"transparent",color:active?C.blue:C.muted,fontSize:12,
    cursor:"pointer",fontFamily:FONT,fontWeight:active?700:400,transition:"all 0.15s"}}>
    {children}
  </button>
);
const Panel=({children,style={}})=>(
  <div style={{background:C.panel,borderRadius:10,padding:20,border:`1px solid ${C.border}`,...style}}>{children}</div>
);
const SH=({children,sub,onExport})=>(
  <div style={{marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
    <div>
      <div style={{fontSize:11,fontWeight:700,color:C.blue,textTransform:"uppercase",
        letterSpacing:2.5,fontFamily:MONO}}>{children}</div>
      {sub&&<div style={{fontSize:11,color:C.dim,marginTop:2,lineHeight:1.6}}>{sub}</div>}
    </div>
    {onExport&&<button onClick={onExport}
      style={{padding:"3px 9px",background:"transparent",border:`1px solid ${C.border}`,
        borderRadius:5,color:C.dim,fontSize:10,cursor:"pointer",flexShrink:0,marginLeft:8,
        fontFamily:MONO}}>Export</button>}
  </div>
);

const EXPORT_REGISTRY = [
  { kind:"chart", tabId:"overview", containerId:"chartBias", filename:"overview_bias_assessment", title:"Bias Assessment", subtitle:"Comparative rate cards", chartType:"Comparative rate cards" },
  { kind:"chart", tabId:"overview", containerId:"chartAdjPieBlock", filename:"overview_adj_religion_pie", title:"Under Adjudication by Religion", subtitle:"Distribution by religion", chartType:"Donut/Pie" },
  { kind:"chart", tabId:"overview", containerId:"chartRelStatus", filename:"overview_status_by_religion", title:"Status by Religion", subtitle:"Count of voters in each status category by religion", chartType:"Grouped bars" },
  { kind:"chart", tabId:"overview", containerId:"chartDiverg", filename:"overview_status_composition", title:"Voter Status Composition by Religion", subtitle:"Stacked composition by religion", chartType:"Horizontal stacked bar" },
  { kind:"chart", tabId:"religion", containerId:"chartAdjRate", filename:"religion_adj_del_rate", title:"Rates by Religion", subtitle:"Adjudication and deletion rates by religion", chartType:"Horizontal bars" },
  { kind:"chart", tabId:"religion", containerId:"chartH2H", filename:"religion_head_to_head", title:"Muslim vs Hindu: Under Adjudication", subtitle:"Head-to-head grouped comparison", chartType:"Grouped bars" },
  { kind:"chart", tabId:"age", containerId:"chartAgeStatus", filename:"age_group_status", title:"Age Group x Status", subtitle:"Status distribution by age cohort", chartType:"Grouped bars" },
  { kind:"chart", tabId:"age", containerId:"chartAgeTrend", filename:"age_cohort_trend", title:"Age Cohort Trends", subtitle:"Adj% trend by age", chartType:"Line chart" },
  { kind:"chart", tabId:"custom", containerId:"chartCustomAnalytics", filename:"custom_analytics", title:"Custom Analytics", subtitle:"Configurable analytics chart", chartType:"Configurable" },
  { kind:"chart", tabId:"trends", containerId:"chartPartTrends", filename:"part_trend_decomposition", title:"Part Trend Decomposition", subtitle:"Per-part trend lines", chartType:"Trend lines" },
  { kind:"table", tabId:"religion", containerId:"tblReligionCrosstab", filename:"religion_status_crosstab", title:"Religion x Status Cross-tabulation", subtitle:"Tabular summary" },
  { kind:"table", tabId:"age", containerId:"tblAgeReligionAdj", filename:"age_religion_adjudication_table", title:"Age x Religion x Adjudication Rate", subtitle:"Tabular summary" },
  { kind:"table", tabId:"custom", containerId:"tblCustomAnalytics", filename:"custom_analytics_table", title:"Custom Analytics Table", subtitle:"Tabular summary" },
  { kind:"table", tabId:"booths", containerId:"tblBoothSummary", filename:"booths_summary_table", title:"All Booths Summary", subtitle:"Tabular summary" },
  { kind:"table", tabId:"booths", containerId:"tblBoothVoterList", filename:"booth_voter_list_table", title:"Part Voter List", subtitle:"Tabular summary" },
  { kind:"table", tabId:"voters", containerId:"tblVotersGlobal", filename:"voters_table", title:"Voters Table", subtitle:"Tabular summary" },
  { kind:"table", tabId:"duplicates", containerId:"tblSameContentFiles", filename:"duplicate_files_table", title:"Same-content files", subtitle:"Tabular summary" },
  { kind:"table", tabId:"duplicates", containerId:"tblDuplicateVoters", filename:"duplicate_voter_rows_table", title:"Duplicate voter rows", subtitle:"Tabular summary" },
  { kind:"table", tabId:"review", containerId:"tblReviewQueue", filename:"review_queue_table", title:"Religion Review Queue", subtitle:"Tabular summary" },
  { kind:"page", tabId:"overview", containerId:"tabContentRoot", filename:"page_overview", title:"Overview Page", subtitle:"Full page snapshot" },
  { kind:"page", tabId:"religion", containerId:"tabContentRoot", filename:"page_religion", title:"Religion Page", subtitle:"Full page snapshot" },
  { kind:"page", tabId:"age", containerId:"tabContentRoot", filename:"page_age", title:"Age Cohorts Page", subtitle:"Full page snapshot" },
  { kind:"page", tabId:"custom", containerId:"tabContentRoot", filename:"page_custom", title:"Custom Analytics Page", subtitle:"Full page snapshot" },
  { kind:"page", tabId:"trends", containerId:"tabContentRoot", filename:"page_trends", title:"Trends Page", subtitle:"Full page snapshot" },
  { kind:"page", tabId:"booths", containerId:"tabContentRoot", filename:"page_booths", title:"Booths Page", subtitle:"Full page snapshot" },
  { kind:"page", tabId:"duplicates", containerId:"tabContentRoot", filename:"page_duplicates", title:"Duplicates Page", subtitle:"Full page snapshot" },
  { kind:"page", tabId:"voters", containerId:"tabContentRoot", filename:"page_voters", title:"Voters Page", subtitle:"Full page snapshot" },
  { kind:"page", tabId:"review", containerId:"tabContentRoot", filename:"page_review", title:"Review Page", subtitle:"Full page snapshot" },
  { kind:"page", tabId:"tokens", containerId:"tabContentRoot", filename:"page_tokens", title:"Tokens Page", subtitle:"Full page snapshot" },
  { kind:"page", tabId:"methodology", containerId:"tabContentRoot", filename:"page_methodology", title:"Methodology Page", subtitle:"Full page snapshot" },
];

function exportRowsCsv(rows, filename="chart_data"){
  if(!Array.isArray(rows)||rows.length===0){ window.alert("No data rows to export."); return; }
  const keys=[...new Set(rows.flatMap(r=>Object.keys(r||{})))];
  const esc=(v)=>`"${String(v??"").replace(/"/g,'""')}"`;
  const lines=[keys.map(esc).join(",")];
  rows.forEach(r=>lines.push(keys.map(k=>esc(r?.[k])).join(",")));
  const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");
  const safe=(String(filename||"chart_data").replace(/[<>:"/\\|?*\x00-\x1F]/g," ").trim()||"chart_data");
  a.download=`${safe}.csv`;
  a.href=URL.createObjectURL(blob);
  a.click();
  URL.revokeObjectURL(a.href);
}

class AppErrorBoundary extends Component{
  constructor(props){
    super(props);
    this.state={error:null};
  }
  static getDerivedStateFromError(error){
    return {error};
  }
  componentDidCatch(error,info){
    try{
      console.error("App render failed",error,info);
    }catch{}
  }
  render(){
    if(this.state.error){
      return(
        <div style={{minHeight:"100vh",background:"#0a0f1e",color:"#e2e8f0",padding:"24px",fontFamily:"Inter, Segoe UI, sans-serif"}}>
          <div style={{maxWidth:760,margin:"0 auto",padding:"20px",border:"1px solid #1f2d45",borderRadius:12,background:"#111827"}}>
            <div style={{fontSize:24,fontWeight:800,marginBottom:8}}>App Render Failed</div>
            <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.7,marginBottom:12}}>
              A runtime error occurred after load. This screen is shown instead of a blank page so the failure can be diagnosed.
            </div>
            <pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",fontSize:12,color:"#fca5a5",background:"#0a0f1e",padding:12,borderRadius:8,border:"1px solid #1f2d45"}}>
              {String(this.state.error?.stack||this.state.error?.message||this.state.error||"Unknown render error")}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
function exportTableImage(containerId, filename="table_export", meta={}){
  return exportTableGraphic({
    containerId,
    filename,
    format:"png",
    scale:2,
    background:normalizeHexColor(meta.background||"#ffffff","#ffffff"),
    title:meta.title||"Table Export",
    subtitle:meta.subtitle||"",
    note:meta.note||"Table capture",
    includeTimestamp:meta.includeTimestamp!==false,
    borderMode:meta.borderMode||"auto",
  });
}

// Custom bar label rendered inside/top of bars
const BarLabel=({x,y,width,height,value,color="#fff",pos="top"})=>{
  if(!value&&value!==0) return null;
  const label=typeof value==="number"?
    (value%1===0?value.toLocaleString():(value.toFixed(1)+"%")):value;
  if(pos==="top") return(
    <text x={x+width/2} y={y-4} textAnchor="middle"
      fill={color} fontSize={11} fontFamily="Inter,sans-serif" fontWeight={700}>{label}</text>
  );
  if(pos==="inside"&&height>18) return(
    <text x={x+width/2} y={y+height/2+4} textAnchor="middle"
      fill="#fff" fontSize={11} fontFamily="Inter,sans-serif" fontWeight={700}>{label}</text>
  );
  // right of bar (horizontal)
  return(
    <text x={x+width+5} y={y+height/2+4} textAnchor="start"
      fill={color} fontSize={11} fontFamily="Inter,sans-serif">{label}</text>
  );
};

const StatCard=({label,value,sub,color=C.blue})=>(
  <div style={{background:C.panel,borderRadius:10,padding:"14px 18px",
    border:`1px solid ${color}33`,flex:1,minWidth:120}}>
    <div style={{fontSize:24,fontWeight:800,color,fontFamily:MONO}}>{value}</div>
    <div style={{fontSize:12,color:C.text,fontWeight:600,margin:"3px 0 1px"}}>{label}</div>
    {sub&&<div style={{fontSize:11,color:C.dim}}>{sub}</div>}
  </div>
);
const BiasBadge=({r})=>{
  if(r===null||r===undefined)return <Tag c="N/A" color={C.dim}/>;
  const rn=typeof r==="number"?r:0;
  if(rn>=3||r===Infinity)return <Tag c={r===Infinity?"∞ EXTREME":`${rn.toFixed(2)}x HIGH`} color={C.red} bg={C.red+"22"}/>;
  if(rn>=1.5)return <Tag c={`${rn.toFixed(2)}x MOD`} color={C.orange} bg={C.orange+"22"}/>;
  if(rn>=0.8)return <Tag c={`${rn.toFixed(2)}x OK`} color={C.green} bg={C.green+"22"}/>;
  return <Tag c={`${rn.toFixed(2)}x REV`} color="#a78bfa" bg="#a78bfa22"/>;
};
const TT={contentStyle:{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,color:C.text,fontFamily:FONT}};
const ResizableChartFrame=({height=220,minHeight=160,minWidth=280,style={},children})=>(
  <div
    style={{
      width:"100%",
      maxWidth:"100%",
      height,
      minHeight,
      minWidth,
      resize:"both",
      overflow:"hidden",
      boxSizing:"border-box",
      ...style,
    }}
    data-export-sizable="true"
  >
    <ResponsiveContainer width="100%" height="100%">
      {children}
    </ResponsiveContainer>
  </div>
);

function measureExportBox(el, fallbackWidth=1200, fallbackHeight=520){
  if(!el) return {width:fallbackWidth,height:fallbackHeight};
  const sizable=Array.from(el.querySelectorAll?.('[data-export-sizable="true"]')||[]);
  const rootWidth=Math.max(
    Math.round(el.scrollWidth||0),
    Math.round(el.clientWidth||0),
    Math.round(el.getBoundingClientRect?.().width||0),
  );
  const rootHeight=Math.max(
    Math.round(el.scrollHeight||0),
    Math.round(el.clientHeight||0),
    Math.round(el.getBoundingClientRect?.().height||0),
  );
  const widths=sizable.map(node=>{
    const explicit=Number(node?.dataset?.exportWidth||0);
    return Math.max(
      explicit,
      Math.round(node?.clientWidth||0),
      Math.round(node?.getBoundingClientRect?.().width||0),
    );
  });
  const heights=sizable.map(node=>{
    const explicit=Number(node?.dataset?.exportHeight||0);
    return Math.max(
      explicit,
      Math.round(node?.clientHeight||0),
      Math.round(node?.getBoundingClientRect?.().height||0),
    );
  });
  if(sizable.length===1){
    return {
      width:Math.max(360,widths[0]||rootWidth||fallbackWidth),
      height:Math.max(220,heights[0]||rootHeight||fallbackHeight),
    };
  }
  return {
    width:Math.max(400,rootWidth||fallbackWidth,...widths),
    height:Math.max(240,rootHeight||fallbackHeight,...heights),
  };
}

// ── Status badge ─────────────────────────────────────────────────────────────
const StatusBadge=({s})=>{
  const cfg={
    "Under Adjudication":{c:C.adj, bg:C.adj+"22", label:"UA"},
    "Deleted":{c:C.del, bg:C.del+"22", label:"DEL"},
    "Active":{c:"#60a5fa", bg:"#3b82f622", label:"OK"},
  }[s]||{c:C.dim, bg:"#ffffff11", label:s};
  return <Tag c={cfg.label} color={cfg.c} bg={cfg.bg}/>;
};

// ── Religion badge ────────────────────────────────────────────────────────────
const VIA_ICON={"relation":"↩","suffix":"~","suffix-rel":"~↩","uncertain":"?","none":"✗"};
const RelBadge=({rel,conf,via,override})=>{
  const color=C[override||rel]||C.dim;
  const label=override?override:(rel||"?");
  const icon=VIA_ICON[via];
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:3}}>
      <span style={{color,fontWeight:700,fontSize:12}}>{label}</span>
      {conf>0&&!override&&<span style={{color:C.dim,fontSize:10}}>{Math.round(conf*100)}%</span>}
      {icon&&!override&&<span title={via} style={{color:via==="none"?C.adj:C.dim,fontSize:9}}>{icon}</span>}
      {override&&<span title="Manually overridden" style={{color:C.yellow,fontSize:9}}>✎</span>}
    </span>
  );
};

// ── Export helpers ────────────────────────────────────────────────────────────
function sanitizeSheetName(name="Data"){
  return String(name).replace(/[\\/?*:[\]]/g," ").trim().slice(0,31) || "Data";
}

function sanitizeFileName(name="export.xlsx"){
  const base=String(name).replace(/[<>:"/\\|?*\x00-\x1F]/g," ").trim();
  const safe=base || "export";
  return safe.toLowerCase().endsWith(".xlsx") ? safe : `${safe}.xlsx`;
}

async function exportXLSX(data, filename, sheetName="Data") {
  if(!Array.isArray(data)||data.length===0){
    window.alert("No rows to export for this selection.");
    return;
  }
  try{
    const XLSX=await loadXLSX();
    const ws=XLSX.utils.json_to_sheet(data);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,sanitizeSheetName(sheetName));
    XLSX.writeFile(wb,sanitizeFileName(filename),{compression:true});
  }catch(err){
    window.alert(`Export failed: ${err?.message||"unknown error"}`);
  }
}

async function exportFullDataset(voters) {
  if(!Array.isArray(voters)||voters.length===0){
    window.alert("No voters loaded to export.");
    return;
  }
  try{
    const XLSX=await loadXLSX();
    const wb=XLSX.utils.book_new();
    // Group by part
    const byPart={};
    voters.forEach(v=>{
      const k=`Part_${String(v.part_no).padStart(3,"0")}`;
      (byPart[k]=byPart[k]||[]).push(v);
    });
    Object.entries(byPart).sort(([a],[b])=>a.localeCompare(b)).forEach(([name,rows])=>{
      const data=rows.map(v=>toExportRow(v));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data),sanitizeSheetName(name));
    });
    // Summary sheet
    const summary=buildSummaryRows(voters);
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summary),"Summary");
    XLSX.writeFile(wb,sanitizeFileName(`VoterRoll_Export_${new Date().toISOString().slice(0,10)}.xlsx`),{compression:true});
  }catch(err){
    window.alert(`Export failed: ${err?.message||"unknown error"}`);
  }
}

async function exportFilteredDatasetWorkbook(voters, meta={}){
  if(!Array.isArray(voters)||voters.length===0){
    window.alert("No voters available in the current filtered view.");
    return;
  }
  try{
    const XLSX=await loadXLSX();
    const wb=XLSX.utils.book_new();
    const sample=voters[0]||{};
    const filters=meta.filters||{};
    const summary=[{
      "Generated At": new Date().toISOString(),
      "AC No": sample.ac_no||"",
      "AC Name": sample.ac_name||"",
      "Rows Exported": voters.length,
      "Part Filter": filters.part||"All Parts",
      "Status Filter": filters.status||"All Statuses",
      "Religion Filter": filters.religion||"All Religions",
      "Age Filter": filters.age||"All Ages",
      "Gender Filter": filters.gender||"All Genders",
      "Search Query": filters.search||"",
      "Scope": meta.scope||"Filtered voter export",
    }];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summary),"Export_Metadata");
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(voters.map(v=>toExportRow(v))),"Filtered_Voters");
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(buildSummaryRows(voters)),"Filtered_Parts");
    XLSX.writeFile(wb,sanitizeFileName(meta.filename||`FilteredVoters_${new Date().toISOString().slice(0,10)}.xlsx`),{compression:true});
  }catch(err){
    window.alert(`Export failed: ${err?.message||"unknown error"}`);
  }
}

function toExportRow(v){
  return {
    "AC No": v.ac_no||"",
    "AC Name": v.ac_name||"",
    "Part Number": v.part_no,
    "Part No": v.part_no, "Serial No": v.serial_no, "Voter ID": v.voter_id,
    "Name": v.name, "Relation Type": v.relation_type||"", "Relation Name": v.relation_name||"",
    "Age": v.age, "Gender": v.gender, "House No": v.house_no||"",
    "Status": v.status,
    "Religion (Auto)": v.religion, "Religion (Final)": v.override||v.religion,
    "Religion Confidence": v.relConf?Math.round(v.relConf*100)+"%":"",
    "Religion Via": v.relVia||"",
    "Age Group": v.ageGroup, "Self-mapped": v.isSelfMapped?"Yes":"No",
    "Page No": v.page_no||"", "Stamp Type": v.stamp_type||"",
    "Source File": v.sourceFile||"",
  };
}

function buildSummaryRows(voters){
  const parts=[...new Set(voters.map(v=>v.part_no))].sort((a,b)=>+a-+b);
  return parts.map(pt=>{
    const pv=voters.filter(v=>v.part_no===pt);
    const sample=pv[0]||{};
    const getRel=v=>v.override||v.religion;
    const m=pv.filter(v=>getRel(v)==="Muslim");
    const h=pv.filter(v=>getRel(v)==="Hindu");
    const adj=pv.filter(v=>v.status==="Under Adjudication");
    const del=pv.filter(v=>v.status==="Deleted");
    return {
      "AC No": sample.ac_no||"",
      "AC Name": sample.ac_name||"",
      "Part Number":pt,
      "Part":pt, "Total":pv.length,
      "Active":pv.filter(v=>v.status==="Active").length,
      "Under Adjudication":adj.length, "Adj%":pct(adj.length,pv.length),
      "Deleted":del.length, "Del%":pct(del.length,pv.length),
      "Muslim":m.length, "Hindu":h.length,
      "Muslim Adj":m.filter(v=>v.status==="Under Adjudication").length,
      "Hindu Adj":h.filter(v=>v.status==="Under Adjudication").length,
      "Muslim Adj%":pct(m.filter(v=>v.status==="Under Adjudication").length,m.length),
      "Hindu Adj%":pct(h.filter(v=>v.status==="Under Adjudication").length,h.length),
      "Muslim Del":m.filter(v=>v.status==="Deleted").length,
      "Hindu Del":h.filter(v=>v.status==="Deleted").length,
      "Self-mapped Adj":adj.filter(v=>v.isSelfMapped).length,
    };
  });
}

function duplicateKeyOf(v){
  const part=String(v.part_no??"").trim();
  const voter=String(v.voter_id??"").trim().toUpperCase();
  if(voter) return `${part}|${voter}`;
  const serial=String(v.serial_no??"").trim();
  const name=String(v.name??"").trim().toUpperCase();
  return `${part}|${serial}|${name}`;
}

function exactDuplicateSignatureOf(v){
  return JSON.stringify({
    ac_no:String(v.ac_no??"").trim(),
    ac_name:String(v.ac_name??"").trim(),
    part_no:String(v.part_no??"").trim(),
    serial_no:String(v.serial_no??"").trim(),
    voter_id:String(v.voter_id??"").trim().toUpperCase(),
    name:String(v.name??"").trim().toUpperCase(),
    relation_type:String(v.relation_type??"").trim(),
    relation_name:String(v.relation_name??"").trim().toUpperCase(),
    house_no:String(v.house_no??"").trim(),
    age:String(v.age??"").trim(),
    gender:String(v.gender??"").trim().toUpperCase(),
    page_no:String(v.page_no??"").trim(),
    status:String(v.status??"").trim(),
    religion:String(v.religion??"").trim(),
  });
}

function buildInsightsWorkbookData(voters){
  const rows=Array.isArray(voters)?voters:[];
  const parts=[...new Set(rows.map(v=>String(v.part_no||"").trim()).filter(Boolean))].sort((a,b)=>(+a||0)-(+b||0));
  const acKeys=[...new Set(rows.map(v=>`${String(v.ac_no||"").trim()}|${String(v.ac_name||"").trim()}`))];
  const getRel=v=>v.override||v.religion||"Unknown";
  const ageBuckets=["18–22","23–30","31–39","40–44★","45–60","60+","Unknown"];
  const partInsights=parts.map(pt=>{
    const pv=rows.filter(v=>String(v.part_no||"").trim()===pt);
    const sample=pv[0]||{};
    const statusCount=(s)=>pv.filter(v=>v.status===s).length;
    const relCount=(r)=>pv.filter(v=>getRel(v)===r).length;
    const relStatusCount=(r,s)=>pv.filter(v=>getRel(v)===r&&v.status===s).length;
    const ageCount=(ag)=>pv.filter(v=>v.ageGroup===ag).length;
    const out={
      "AC No":sample.ac_no||"",
      "AC Name":sample.ac_name||"",
      "Part Number":pt,
      "Total":pv.length,
      "Active":statusCount("Active"),
      "Under Adjudication":statusCount("Under Adjudication"),
      "Deleted":statusCount("Deleted"),
      "Muslim":relCount("Muslim"),
      "Hindu":relCount("Hindu"),
      "Uncertain":relCount("Uncertain"),
      "Unknown":relCount("Unknown"),
      "Muslim Adj":relStatusCount("Muslim","Under Adjudication"),
      "Hindu Adj":relStatusCount("Hindu","Under Adjudication"),
      "Muslim Del":relStatusCount("Muslim","Deleted"),
      "Hindu Del":relStatusCount("Hindu","Deleted"),
    };
    ageBuckets.forEach(ag=>{ out[`Age ${ag}`]=ageCount(ag); });
    return out;
  });
  const acInsights=acKeys.filter(k=>k!=="|").map(k=>{
    const [acNo,acName]=k.split("|");
    const av=rows.filter(v=>String(v.ac_no||"").trim()===acNo&&String(v.ac_name||"").trim()===acName);
    return {
      "AC No":acNo,
      "AC Name":acName,
      "Part Count":[...new Set(av.map(v=>String(v.part_no||"").trim()).filter(Boolean))].length,
      "Total":av.length,
      "Active":av.filter(v=>v.status==="Active").length,
      "Under Adjudication":av.filter(v=>v.status==="Under Adjudication").length,
      "Deleted":av.filter(v=>v.status==="Deleted").length,
      "Muslim":av.filter(v=>getRel(v)==="Muslim").length,
      "Hindu":av.filter(v=>getRel(v)==="Hindu").length,
      "Uncertain":av.filter(v=>getRel(v)==="Uncertain").length,
      "Unknown":av.filter(v=>getRel(v)==="Unknown").length,
    };
  });
  const religionStatus=["Muslim","Hindu","Uncertain","Unknown"].map(rel=>{
    const rv=rows.filter(v=>getRel(v)===rel);
    return {
      Religion:rel,
      Total:rv.length,
      Active:rv.filter(v=>v.status==="Active").length,
      "Under Adjudication":rv.filter(v=>v.status==="Under Adjudication").length,
      Deleted:rv.filter(v=>v.status==="Deleted").length,
    };
  }).filter(r=>r.Total>0);
  const ageReligion=ageBuckets.map(ag=>{
    const av=rows.filter(v=>v.ageGroup===ag);
    return {
      "Age Group":ag,
      Total:av.length,
      Muslim:av.filter(v=>getRel(v)==="Muslim").length,
      Hindu:av.filter(v=>getRel(v)==="Hindu").length,
      Uncertain:av.filter(v=>getRel(v)==="Uncertain").length,
      Unknown:av.filter(v=>getRel(v)==="Unknown").length,
    };
  }).filter(r=>r.Total>0);
  const ageStatus=ageBuckets.map(ag=>{
    const av=rows.filter(v=>v.ageGroup===ag);
    return {
      "Age Group":ag,
      Total:av.length,
      Active:av.filter(v=>v.status==="Active").length,
      "Under Adjudication":av.filter(v=>v.status==="Under Adjudication").length,
      Deleted:av.filter(v=>v.status==="Deleted").length,
    };
  }).filter(r=>r.Total>0);
  const meta=[{
    schemaVersion:INSIGHTS_SCHEMA_VERSION,
    createdAt:new Date().toISOString(),
    appVersion:"1.0",
    totalVoters:rows.length,
    totalParts:parts.length,
    totalACs:acInsights.length,
    source:"Electoral Integrity Monitor",
  }];
  return {meta,partInsights,acInsights,religionStatus,ageReligion,ageStatus};
}

async function exportInsightsWorkbook(voters){
  if(!Array.isArray(voters)||!voters.length){
    window.alert("No voter data loaded.");
    return;
  }
  try{
    const XLSX=await loadXLSX();
    const {meta,partInsights,acInsights,religionStatus,ageReligion,ageStatus}=buildInsightsWorkbookData(voters);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(meta),INSIGHTS_SHEETS.meta);
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(partInsights),INSIGHTS_SHEETS.part);
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(acInsights),INSIGHTS_SHEETS.ac);
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(religionStatus),INSIGHTS_SHEETS.religionStatus);
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(ageReligion),INSIGHTS_SHEETS.ageReligion);
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(ageStatus),INSIGHTS_SHEETS.ageStatus);
    XLSX.writeFile(wb,sanitizeFileName(`Insights_${new Date().toISOString().slice(0,10)}.xlsx`),{compression:true});
  }catch(err){
    window.alert(`Insights export failed: ${err?.message||"unknown error"}`);
  }
}

function readInsightsWorkbookData(wb, XLSX){
  return {
    meta:XLSX.utils.sheet_to_json(wb.Sheets[INSIGHTS_SHEETS.meta],{defval:""}),
    partInsights:XLSX.utils.sheet_to_json(wb.Sheets[INSIGHTS_SHEETS.part],{defval:""}),
    acInsights:XLSX.utils.sheet_to_json(wb.Sheets[INSIGHTS_SHEETS.ac],{defval:""}),
    religionStatus:XLSX.utils.sheet_to_json(wb.Sheets[INSIGHTS_SHEETS.religionStatus],{defval:""}),
    ageReligion:XLSX.utils.sheet_to_json(wb.Sheets[INSIGHTS_SHEETS.ageReligion],{defval:""}),
    ageStatus:XLSX.utils.sheet_to_json(wb.Sheets[INSIGHTS_SHEETS.ageStatus],{defval:""}),
  };
}

async function sha256HexArrayBuffer(buf){
  try{
    if(typeof crypto!=="undefined"&&crypto.subtle){
      const h=await crypto.subtle.digest("SHA-256",buf);
      return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,"0")).join("");
    }
  }catch{}
  const bytes=new Uint8Array(buf);
  let x=2166136261;
  for(const b of bytes){ x^=b; x=(x*16777619)>>>0; }
  return `fnv1a_${x.toString(16)}`;
}

async function sha256HexString(str){
  try{
    if(typeof crypto!=="undefined"&&crypto.subtle){
      const data=new TextEncoder().encode(str);
      const h=await crypto.subtle.digest("SHA-256",data);
      return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,"0")).join("");
    }
  }catch{}
  let x=2166136261;
  for(let i=0;i<str.length;i++){ x^=str.charCodeAt(i); x=(x*16777619)>>>0; }
  return `fnv1a_${x.toString(16)}`;
}

function rowSemanticSignature(row){
  const part=String(row.part_no??"").trim();
  const serial=String(row.serial_no??"").trim();
  const voterId=String(row.voter_id??"").trim().toUpperCase();
  const name=String(row.name??"").trim().toUpperCase();
  const rel=String(row.relation_name??"").trim().toUpperCase();
  const age=String(row.age??"").trim();
  const gender=String(row.gender??"").trim().toUpperCase();
  const stamp=String(row.stamp_type??"").trim().toUpperCase();
  return [part,serial,voterId,name,rel,age,gender,stamp].join("|");
}

// ── Filter bar (top-level component, props passed from App) ─────────────────
function FilterBar({gSearch,setGSearch,gPart,setGPart,gStatus,setGStatus,
  gRel,setGRel,gAge,setGAge,gGender,setGGender,parts,ageGroups,
  filteredLen,totalLen,setVPage,setBoothPage}){
  const isMobile=useWindowWidth()<640;
  const [mobileFiltersOpen,setMobileFiltersOpen]=useState(false);
  useEffect(()=>{
    if(!isMobile) setMobileFiltersOpen(false);
  },[isMobile]);
  const ageGroups2=["18–22","23–30","31–39","40–44★","45–60","60+","Unknown"];
  const hasActiveFilters=(gPart!=="all"||gStatus!=="all"||gRel!=="all"||gAge!=="all"||gGender!=="all"||gSearch);
  const filterControls=(
    <>
      {[
        ["Part",gPart,setGPart,["all",...parts]],
        ["Status",gStatus,setGStatus,["all","Active","Under Adjudication","Deleted"]],
        ["Religion",gRel,setGRel,["all","Muslim","Hindu","Uncertain","Unknown"]],
        ["Age",gAge,setGAge,["all",...ageGroups2]],
        ["Gender",gGender,setGGender,["all","M","F"]],
      ].map(([lbl,val,set,opts])=>(
        <select key={lbl} value={val}
          onChange={e=>{set(e.target.value);setVPage(0);setBoothPage(0);}}
          style={{padding:isMobile?"8px 10px":"5px 8px",background:C.bg,border:`1px solid ${C.border}`,
            borderRadius:6,color:val!=="all"?C.blue:C.muted,fontSize:isMobile?13:12,fontFamily:FONT}}>
          {opts.map(o=><option key={o} value={o}>{o==="all"?`All ${lbl}s`:o}</option>)}
        </select>
      ))}
      <span style={{fontSize:isMobile?12:11,color:C.dim,whiteSpace:"nowrap",fontFamily:MONO}}>
        {filteredLen.toLocaleString()} / {totalLen.toLocaleString()}
      </span>
      {hasActiveFilters&&(
        <button onClick={()=>{
          setGPart("all");setGStatus("all");setGRel("all");setGAge("all");setGGender("all");setGSearch("");
        }}
          style={{padding:isMobile?"7px 12px":"4px 10px",background:C.red+"22",border:`1px solid ${C.red}44`,
            borderRadius:5,color:C.red,fontSize:isMobile?12:11,cursor:"pointer",fontFamily:FONT}}>
          ✕ Clear
        </button>
      )}
    </>
  );
  return(
    <div style={{display:"flex",gap:isMobile?8:6,flexWrap:"wrap",padding:isMobile?"10px 12px":"8px 12px",
      background:C.panel,borderBottom:`1px solid ${C.border}`,alignItems:"center"}}>
      <input value={gSearch} onChange={e=>{setGSearch(e.target.value);setVPage(0);}}
        placeholder="🔍 Search name / voter ID / relation…"
        style={{padding:isMobile?"8px 12px":"5px 10px",background:C.bg,border:`1px solid ${C.border}`,
          borderRadius:6,color:C.text,fontSize:isMobile?14:12,flex:"1 1 220px",fontFamily:FONT}}/>
      {isMobile?(
        <>
          <button onClick={()=>setMobileFiltersOpen(v=>!v)}
            style={{padding:"8px 12px",background:C.bg,border:`1px solid ${C.border}`,
              borderRadius:6,color:mobileFiltersOpen||hasActiveFilters?C.blue:C.muted,fontSize:13,cursor:"pointer",fontFamily:FONT,fontWeight:mobileFiltersOpen||hasActiveFilters?700:500}}>
            Filters{hasActiveFilters?" •":""}
          </button>
          <span style={{fontSize:12,color:C.dim,whiteSpace:"nowrap",fontFamily:MONO}}>
            {filteredLen.toLocaleString()} / {totalLen.toLocaleString()}
          </span>
          {mobileFiltersOpen&&(
            <div style={{width:"100%",display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,paddingTop:4}}>
              {filterControls}
            </div>
          )}
        </>
      ):(
        filterControls
      )}
    </div>
  );
}

// ══ UPLOAD SCREEN ════════════════════════════════════════════════════════════
function UploadScreen({onFiles,loading,theme,setTheme,onImportSession}){
  const ref=useRef();
  const isMobile=useWindowWidth()<920;
  const uploadFeatureCardBg=theme==="dark" ? "#0d1526" : "#ffffff";
  const uploadSubpanelBg=theme==="dark" ? C.bg : "#f8fbff";
  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:FONT,
      display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{maxWidth:1180,width:"100%",padding:"24px"}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
            <button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}
              style={{padding:"6px 12px",background:C.panel,border:`1px solid ${C.border}`,
                borderRadius:7,color:C.muted,fontSize:12,cursor:"pointer"}}>
              {theme==="dark"?"☀ Light":"🌙 Dark"}
            </button>
          </div>
          <div style={{fontSize:10,letterSpacing:5,color:C.dim,marginBottom:10,
            textTransform:"uppercase",fontFamily:MONO}}>Electoral Integrity Monitor · v1.0</div>
          <h1 style={{fontSize:32,fontWeight:800,color:C.text,margin:"0 0 10px",letterSpacing:-1}}>
            Electoral Roll Analysis Dashboard
          </h1>
          <p style={{color:C.muted,fontSize:13,maxWidth:500,margin:"0 auto 6px",lineHeight:1.7}}>
            West Bengal 2026 · Data quality checks · Statistical anomaly analysis
          </p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"minmax(420px, 1.05fr) minmax(360px, 0.95fr)",gap:18,alignItems:"start"}}>
          <div style={{display:"flex",flexDirection:"column",gap:18}}>
            <div onDrop={e=>{e.preventDefault();const f=Array.from(e.dataTransfer.files).filter(x=>x.name.endsWith(".xlsx"));if(f.length)onFiles(f);}}
              onDragOver={e=>e.preventDefault()} onClick={()=>ref.current?.click()}
              style={{border:`2px dashed ${C.border}`,borderRadius:14,padding:"54px 32px",
                textAlign:"center",cursor:"pointer",background:C.panel,transition:"all 0.2s",
                boxShadow:`inset 0 0 0 1px ${C.bg}`}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=C.blue}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border}}>
              <div style={{fontSize:40,marginBottom:12}}>📊</div>
              <p style={{fontSize:18,color:C.text,marginBottom:5,fontWeight:700}}>
                {loading?"Processing…":"Drop VoterRoll Excel files here"}
              </p>
              <p style={{fontSize:12,color:C.dim}}>Multiple `.xlsx` files · All parts of any AC · Supports 300+ booths</p>
              <p style={{fontSize:11,color:C.dim,marginTop:6}}>🔒 Fully local processing. Only volunteer PDF extraction uses Claude outside this app.</p>
              <div style={{display:"flex",justifyContent:"center",gap:8,flexWrap:"wrap",marginTop:14}}>
                <button onClick={(e)=>{e.stopPropagation();ref.current?.click();}}
                  style={{padding:"7px 14px",background:C.blue+"22",border:`1px solid ${C.blue}66`,borderRadius:8,color:C.blue,fontSize:12,cursor:"pointer",fontWeight:700}}>
                  Choose Excel Files
                </button>
                <button onClick={(e)=>{e.stopPropagation();onImportSession?.();}}
                  style={{padding:"7px 14px",background:C.green+"18",border:`1px solid ${C.green}55`,borderRadius:8,color:C.green,fontSize:12,cursor:"pointer",fontWeight:700}}>
                  Import Session / Resume Work
                </button>
                <button onClick={(e)=>{e.stopPropagation();copyPlainText(CLAUDE_EXTRACTION_PROMPT,"Claude extraction prompt");}}
                  style={{padding:"7px 14px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,fontSize:12,cursor:"pointer"}}>
                  Copy Claude Prompt
                </button>
              </div>
              <input ref={ref} type="file" accept=".xlsx" multiple style={{display:"none"}}
                onChange={e=>onFiles(Array.from(e.target.files))}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
          {[
            ["🧠 Classification", "Name + relation assisted classification · review queue · manual overrides"],
            ["📊 Statistical Checks", "Adjudication/deletion rates · chi-square tests · trend decomposition"],
            ["🧾 Duplicate Detection", "Row-level duplicates · same-content file hash detection"],
                ["📦 Reporting", "One-click report pack · filtered voter export workbook · charts + printable report"],
          ].map(([t,d])=>(
            <div key={t} style={{padding:14,background:uploadFeatureCardBg,borderRadius:8,border:`1px solid ${C.border}`,
              boxShadow:theme==="light"?"0 10px 24px rgba(15, 23, 42, 0.05)":"none"}}>
              <div style={{fontWeight:700,color:C.text,marginBottom:4,fontSize:13}}>{t}</div>
              <div style={{color:C.dim,fontSize:11,lineHeight:1.6}}>{d}</div>
            </div>
          ))}
            </div>
          </div>
          <div style={{background:C.panel,borderRadius:14,border:`1px solid ${C.border}`,padding:18}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"flex-start",marginBottom:10,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:C.blue,textTransform:"uppercase",letterSpacing:2.5,fontFamily:MONO}}>Input Preparation</div>
                <div style={{fontSize:18,fontWeight:800,color:C.text,marginTop:4}}>How the Excel input is generated</div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button onClick={()=>copyPlainText(CLAUDE_VOLUNTEER_MESSAGE,"Volunteer request message")}
                  style={{padding:"6px 10px",borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontSize:12,cursor:"pointer"}}>
                  Copy Message
                </button>
                <button onClick={()=>copyPlainText(CLAUDE_EXTRACTION_PROMPT,"Claude extraction prompt")}
                  style={{padding:"6px 10px",borderRadius:7,border:`1px solid ${C.blue}66`,background:C.blue+"18",color:C.blue,fontSize:12,cursor:"pointer"}}>
                  Copy Prompt
                </button>
              </div>
            </div>
            <div style={{fontSize:12,color:C.muted,lineHeight:1.75,marginBottom:12}}>
              This tool expects Excel files. Those are produced from ECI image-based PDFs by uploading the PDF to{" "}
              <a href="https://claude.ai" target="_blank" rel="noreferrer"
                style={{color:C.blue,textDecoration:"underline"}}>Claude</a>
              {" "}and using a fixed extraction prompt that reads booth metadata, extracts each voter box, detects `UNDER ADJUDICATION` / `DELETED`, and writes a structured `Voter Roll` sheet. Claude usually takes about <b>5-15 minutes</b> depending on PDF size and queue time.
            </div>
            <div style={{display:"grid",gap:10}}>
              {[
                ["1. Download PDF", <>Get the English electoral-roll PDF from the{" "}
                  <a href="https://voters.eci.gov.in/download-eroll?stateCode=S25" target="_blank" rel="noreferrer"
                    style={{color:C.blue,textDecoration:"underline"}}>ECI electoral roll download portal</a>
                  {" "}for at least one booth.</>],
                ["2. Open Claude", <>Use the{" "}
                  <a href="https://play.google.com/store/apps/details?id=com.anthropic.claude" target="_blank" rel="noreferrer"
                    style={{color:C.blue,textDecoration:"underline"}}>Claude Android app</a>
                  {" "}or{" "}
                  <a href="https://claude.ai" target="_blank" rel="noreferrer"
                    style={{color:C.blue,textDecoration:"underline"}}>claude.ai</a>
                  {" "}and attach the PDF file.</>],
                ["3. Paste prompt", "Use the extraction prompt so Claude outputs a formatted XLSX with `Voter Roll` and `Summary` sheets. Wait roughly 5-15 minutes for generation."],
                ["4. Upload here", "Load the generated `.xlsx` into this dashboard for analysis, review, duplicates, and reporting."],
              ].map(([t,d])=>(
                <div key={t} style={{padding:"10px 12px",border:`1px solid ${C.border}`,borderRadius:9,background:uploadSubpanelBg}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:3}}>{t}</div>
                  <div style={{fontSize:11,color:C.dim,lineHeight:1.6}}>{d}</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:12,padding:"10px 12px",border:`1px solid ${C.border}`,borderRadius:9,background:uploadSubpanelBg}}>
              <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:4}}>Contribute extracted Excel files</div>
              <div style={{fontSize:11.5,color:C.muted,lineHeight:1.7}}>
                Send volunteer-generated Excel files to <b>wbsir2025@gmail.com</b> or <b>wbsir2026@gmail.com</b>.
              </div>
            </div>
            <div style={{marginTop:12,padding:"10px 12px",border:`1px solid ${C.border}`,borderRadius:9,background:uploadSubpanelBg}}>
              <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:4}}>Resume someone else&apos;s work</div>
              <div style={{fontSize:11.5,color:C.muted,lineHeight:1.7}}>
                Use <b>Import Session</b> to continue from another person&apos;s exported session. The companion session workbook <b>.xlsx</b> is usually smaller than <b>.eimpack</b>, while <b>.eimpack</b> preserves the full portable app state.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══ MAIN APP ═════════════════════════════════════════════════════════════════
function AppInner(){
  const ww=useWindowWidth();
  const mobile=ww<640;
  const tablet=ww<1024;
  const compactViewport=ww<760;
  const [theme,setTheme]=useState(()=>{
    try{
      const t=localStorage.getItem("eim_theme");
      return t==="light"?"light":"dark";
    }catch{return "dark";}
  });
  const [voters,setVoters]=useState([]);
  const [overrides,setOverrides]=useState({}); // voter_id → religion
  const [loading,setLoading]=useState(false);
  const [tab,setTab]=useState("overview");
  const [allowHeavyCharts,setAllowHeavyCharts]=useState(false);
  const swipeRef=useRef({x:0,y:0,active:false});
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);

  // File warnings (column errors, missing sheets)
  const [fileWarnings,setFileWarnings]=useState([]);
  const [uploadSummary,setUploadSummary]=useState(null);
  const [reportBusy,setReportBusy]=useState(false);
  // Review queue tab state (must be top-level — Rules of Hooks)
  const [rvFilter,setRvFilter]=useState("all");
  const [rvSearch,setRvSearch]=useState("");
  const [rvPage,setRvPage]=useState(0);

  // Global filters
  const [gPart,setGPart]=useState("all");
  const [gStatus,setGStatus]=useState("all");
  const [gRel,setGRel]=useState("all");
  const [gAge,setGAge]=useState("all");
  const [gGender,setGGender]=useState("all");
  const [gSearch,setGSearch]=useState("");
  const [caGroupBy,setCaGroupBy]=useState("part_no");
  const [caMetric,setCaMetric]=useState("adj_rate");
  const [caCompare,setCaCompare]=useState("all");
  const [caMode,setCaMode]=useState("grouped");
  const [caStackBy,setCaStackBy]=useState("status");
  const [partBarsSplit,setPartBarsSplit]=useState("religion"); // religion | age
  const [partBarsMode,setPartBarsMode]=useState("absolute"); // absolute | share

  // Voter list state
  const [vPage,setVPage]=useState(0);
  const [vSort,setVSort]=useState("serial_no");
  const [vSortD,setVSortD]=useState("asc");
  const [editingId,setEditingId]=useState(null);
  const [voterEditModal,setVoterEditModal]=useState(null); // {uid,draft}

  // Booth tab state
  const [boothPart,setBoothPart]=useState(null);
  const [boothPartsSelected,setBoothPartsSelected]=useState([]);
  const [boothSelectionTouched,setBoothSelectionTouched]=useState(false);
  const [boothSearch,setBoothSearch]=useState("");
  const [boothRelFilter,setBoothRelFilter]=useState("all");
  const [boothStatusFilter,setBoothStatusFilter]=useState("all");
  const [boothPage,setBoothPage]=useState(0);
  const [boothSort,setBoothSort]=useState("serial_no");
  const [boothSortD,setBoothSortD]=useState("asc");

  // Token editor state
  const [tokenOverrides,setTokenOverrides]=useState(()=>{ // token→value (user edits / learned memory)
    try{
      const v=localStorage.getItem("eim_tokenOverrides");
      return v?JSON.parse(v):{};
    }catch{return {};}
  });
  const [tokSearch,setTokSearch]=useState("");
  const [tokFilter,setTokFilter]=useState("all"); // all|muslim|hindu|user
  const [tokPage,setTokPage]=useState(0);
  const [newTokName,setNewTokName]=useState("");
  const [newTokVal,setNewTokVal]=useState("0.99");
  const [tokEditId,setTokEditId]=useState(null);
  const [tokEditVal,setTokEditVal]=useState("");
  const [tokRenameId,setTokRenameId]=useState(null);
  const [tokRenameVal,setTokRenameVal]=useState("");
  const [tokenImportSummary,setTokenImportSummary]=useState(null);
  const [localAiEndpoint,setLocalAiEndpoint]=useState("http://localhost:11434/api/generate");
  const [localAiModel,setLocalAiModel]=useState("llama3.1");
  const [aiLoading,setAiLoading]=useState(false);
  const [aiBrief,setAiBrief]=useState("");
  const [chartExportModal,setChartExportModal]=useState(null);
  const [tableExportModal,setTableExportModal]=useState(null);

  useEffect(()=>{
    if(!compactViewport){
      setAllowHeavyCharts(true);
      return;
    }
    setAllowHeavyCharts(false);
  },[compactViewport,voters.length]);

  useEffect(()=>{
    if(!mobile) setMobileMenuOpen(false);
  },[mobile]);

  const canRenderHeavyCharts=!compactViewport || allowHeavyCharts;
  const renderCompactViewportNotice=(title, detail="Charts are deferred on narrow screens to keep Android Chrome stable after upload.")=>(
    <Panel>
      <div style={{fontSize:18,fontWeight:800,color:C.text,marginBottom:6}}>{title}</div>
      <div style={{fontSize:12,color:C.muted,lineHeight:1.7,maxWidth:680}}>
        {detail}
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
        <button onClick={()=>setAllowHeavyCharts(true)}
          style={{padding:"8px 12px",background:C.blue+"22",border:`1px solid ${C.blue}55`,borderRadius:8,color:C.blue,fontSize:12,cursor:"pointer",fontWeight:700}}>
          Load Charts
        </button>
        <button onClick={()=>setTab("voters")}
          style={{padding:"8px 12px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,fontSize:12,cursor:"pointer"}}>
          Go to Voters Table
        </button>
      </div>
    </Panel>
  );
  const [chartStudioOpen,setChartStudioOpen]=useState(false);
  const [boothFigureSettingsOpen,setBoothFigureSettingsOpen]=useState(false);
  const [chartPrefs,setChartPrefs]=useState({
    showLegend:true,
    showValueLabels:true,
    valueLabelPos:"top", // top|inside|right
    xAxisLabel:"",
    yAxisLabel:"",
    chartScale:1,
    customAnalyticsHeight:300,
    boothReportHeight:320,
    boothReportCols:2,
    activeColor:"#3b82f6",
    underAdjColor:"#ef4444",
    deletedColor:"#be123c",
    muslimColor:"#10b981",
    hinduColor:"#f87171",
  });

  // ── File registry: tracks which filenames are loaded (for replace/cancel dialog) ──
  const [loadedFiles,setLoadedFiles]=useState(()=>{
    try{ const v=localStorage.getItem("eim_loadedFiles"); return v?JSON.parse(v):{}; }catch{return {};}
  }); // { filename → part_no[] }
  const [loadedFileMeta,setLoadedFileMeta]=useState(()=>{
    try{ const v=localStorage.getItem("eim_loadedFileMeta"); return v?JSON.parse(v):{}; }catch{return {};}
  }); // { filename -> metadata including raw/content hashes }
  const [loadedInsightsMeta,setLoadedInsightsMeta]=useState(()=>{
    try{ const v=localStorage.getItem("eim_loadedInsightsMeta"); return v?JSON.parse(v):{}; }catch{return {};}
  });
  const [replaceModal,setReplaceModal]=useState(null); // {plans:[{file,buffer,rows,...}], ...} pending replace prompt
  const [ingestPlanModal,setIngestPlanModal]=useState(null);
  const [resolvedDuplicateKeys,setResolvedDuplicateKeys]=useState({});
  const [resolvedFileHashes,setResolvedFileHashes]=useState({});
  const [dupStatusFilter,setDupStatusFilter]=useState("all");
  const [colMapModal,setColMapModal]=useState(null); // {file, actualCols, mapping, missing, resolve}
  const [tokenLearnCount,setTokenLearnCount]=useState(()=>{
    try{
      const v=localStorage.getItem("eim_tokenLearnCount");
      return v?Math.max(0,parseInt(v,10)||0):0;
    }catch{return 0;}
  }); // tokens auto-learned from review actions
  const jointReclassDoneRef=useRef(false);
  const [classifierModel,setClassifierModel]=useState(FALLBACK_CLASSIFIER);

  const ensureClassifierModel=useCallback(async()=>{
    if(Object.keys(classifierModel.NAME_SCORES||{}).length) return classifierModel;
    const mod=await loadClassifierModel();
    const next={
      NAME_SCORES:mod.NAME_SCORES||{},
      classifyReligion:mod.classifyReligion||FALLBACK_CLASSIFIER.classifyReligion,
    };
    setClassifierModel(prev=>Object.keys(prev.NAME_SCORES||{}).length?prev:next);
    return next;
  },[classifierModel]);
  useEffect(()=>{
    ensureClassifierModel().catch(err=>console.warn("eim: classifier model load failed",err));
  },[ensureClassifierModel]);
  const baseNameScores=classifierModel.NAME_SCORES||{};
  const classifierReady=Object.keys(baseNameScores).length>0;

  // Effective token scores (base + user overrides); -1 sentinel = deleted/suppressed
  const effectiveScores=useMemo(()=>{
    const merged={...baseNameScores,...tokenOverrides};
    // Remove deleted tokens (sentinel -1)
    Object.keys(merged).forEach(k=>{ if(merged[k]===-1) delete merged[k]; });
    return merged;
  },[baseNameScores,tokenOverrides]);

  // Re-classify all voters when user edits tokens (preserves manual overrides)
  useEffect(()=>{
    if(!classifierReady) return;
    if(!Object.keys(tokenOverrides).length) return;
    setVoters(prev=>prev.map(v=>{
      if(v._manualRel) return v; // don't touch manual overrides
      const {rel,conf,via}=classifierModel.classifyReligion(v.name,v.relation_name,effectiveScores);
      return {...v,religion:rel,relConf:conf,relVia:via};
    }));
  },[classifierModel,effectiveScores,classifierReady,tokenOverrides]); // eslint-disable-line

  // One-time reclassification pass so stored voters also use enforced joint name+relation logic.
  useEffect(()=>{
    if(jointReclassDoneRef.current) return;
    if(!classifierReady) return;
    if(!voters.length) return;
    setVoters(prev=>prev.map(v=>{
      if(v._manualRel) return v;
      const {rel,conf,via}=classifierModel.classifyReligion(v.name,v.relation_name,effectiveScores);
      return {...v,religion:rel,relConf:conf,relVia:via};
    }));
    jointReclassDoneRef.current=true;
  },[voters.length,effectiveScores,classifierModel,classifierReady]);

  // ── LocalStorage: restore on mount ──────────────────────────────────────────
  useEffect(()=>{
    try{
      const savedOverrides=localStorage.getItem("eim_overrides");
      if(savedOverrides) setOverrides(JSON.parse(savedOverrides));
      // Voters are large — restore only if within budget (5 MB guard)
      const savedVoters=localStorage.getItem("eim_voters");
      if(savedVoters && savedVoters.length < 5*1024*1024){
        const parsed=JSON.parse(savedVoters);
        if(Array.isArray(parsed)&&parsed.length) setVoters(parsed);
      }
    }catch(e){ console.warn("eim: localStorage restore failed",e); }
  },[]); // eslint-disable-line

  // ── LocalStorage: persist on change ─────────────────────────────────────────
  useEffect(()=>{
    try{ localStorage.setItem("eim_overrides",JSON.stringify(overrides)); }catch{}
  },[overrides]);
  useEffect(()=>{
    try{ localStorage.setItem("eim_tokenOverrides",JSON.stringify(tokenOverrides)); }catch{}
  },[tokenOverrides]);
  useEffect(()=>{
    try{ localStorage.setItem("eim_tokenLearnCount",String(tokenLearnCount||0)); }catch{}
  },[tokenLearnCount]);
  useEffect(()=>{
    try{ localStorage.setItem("eim_loadedFiles",JSON.stringify(loadedFiles)); }catch{}
  },[loadedFiles]);
  useEffect(()=>{
    try{ localStorage.setItem("eim_loadedFileMeta",JSON.stringify(loadedFileMeta)); }catch{}
  },[loadedFileMeta]);
  useEffect(()=>{
    try{ localStorage.setItem("eim_loadedInsightsMeta",JSON.stringify(loadedInsightsMeta)); }catch{}
  },[loadedInsightsMeta]);
  // Voters: defer persistence off the immediate render path and skip obviously oversized payloads.
  const votersSaveKey=voters.length+"_"+voters.filter(v=>v.status!=="Active").length;
  useEffect(()=>{
    if(!voters.length) return;
    const id=setTimeout(()=>{
      try{
        const sample=voters[0]?JSON.stringify(voters[0]).length:256;
        const estimatedSize=Math.ceil(sample*voters.length*1.15);
        if(estimatedSize>=5*1024*1024) return;
        const s=JSON.stringify(voters);
        if(s.length<5*1024*1024) localStorage.setItem("eim_voters",s);
      }catch(e){ console.warn("eim: voters too large to persist",e); }
    },300);
    return ()=>clearTimeout(id);
  },[votersSaveKey]); // eslint-disable-line

  const fileRef=useRef();
  const tokenFileRef=useRef();
  const tokenPackFileRef=useRef();
  const sessionFileRef=useRef();
  const PAGE_SIZE=50;

  // Apply active theme palette during render for immediate UI repaint on toggle.
  Object.assign(C,theme==="light"?THEME_LIGHT:THEME_DARK);

  useEffect(()=>{
    try{ localStorage.setItem("eim_theme",theme); }catch{}
    if(typeof document!=="undefined"){
      document.body.style.background=C.bg;
      document.body.style.color=C.text;
    }
  },[theme]);

  const chartScale=Math.max(0.75,Math.min(2,Number(chartPrefs.chartScale)||1));
  const customAnalyticsBaseHeight=Math.max(240,Math.min(900,Number(chartPrefs.customAnalyticsHeight)||300));
  const boothReportBaseHeight=Math.max(240,Math.min(900,Number(chartPrefs.boothReportHeight)||320));
  const chartH=useCallback((base)=>Math.max(120,Math.round(base*chartScale)),[chartScale]);

  const importLabeledNamesFile=useCallback(async(file)=>{
    if(!file) return;
    try{
      const XLSX=await loadXLSX();
      const model=await ensureClassifierModel();
      const baseScores=model.NAME_SCORES||{};
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:"array"});
      const ws=wb.Sheets[wb.SheetNames[0]];
      if(!ws){ window.alert("No sheet found in labeled names file."); return; }
      const rows=XLSX.utils.sheet_to_json(ws,{defval:""});
      if(!rows.length){ window.alert("Labeled names file is empty."); return; }

      const cols=Object.keys(rows[0]);
      const norm=(s)=>String(s||"").trim().toLowerCase();
      const nameCol=cols.find(c=>norm(c)==="name"||norm(c).includes("name"));
      const labelCol=cols.find(c=>c!==nameCol&&(norm(c)==="label"||norm(c)==="religion"||norm(c)==="is_muslim"||norm(c)==="muslim"||norm(c)==="false"||norm(c).includes("relig")));
      if(!nameCol||!labelCol){
        window.alert(`Could not detect columns.\nFound: ${cols.join(", ")}`);
        return;
      }

      const tokenStats={};
      let usedRows=0;
      let skippedRows=0;
      const parseLabel=(v)=>{
        if(typeof v==="boolean") return v?1:0;
        const s=String(v||"").trim().toLowerCase();
        if(!s) return null;
        if(["1","true","yes","y","muslim","m"].includes(s)) return 1;
        if(["0","false","no","n","hindu","other","non-muslim","non muslim","h"].includes(s)) return 0;
        return null;
      };

      rows.forEach(r=>{
        const nm=String(r[nameCol]||"").toUpperCase().trim();
        const label=parseLabel(r[labelCol]);
        if(!nm||label===null){ skippedRows++; return; }
        usedRows++;
        const toks=[...new Set(nm.split(/\s+/).map(t=>t.replace(/[.,\-']+$/,"")).filter(t=>t.length>=3))];
        toks.forEach(t=>{
          if(!tokenStats[t]) tokenStats[t]={m:0,h:0,n:0};
          tokenStats[t].n++;
          if(label===1) tokenStats[t].m++;
          else tokenStats[t].h++;
        });
      });

      const added={};
      let addedN=0, updatedN=0, skippedN=0;
      Object.entries(tokenStats).forEach(([tok,s])=>{
        if(s.n<3) return;
        const score=(s.m+1)/(s.m+s.h+2); // Laplace smoothing
        const strong = score>=0.80 || score<=0.20;
        if(!strong){ skippedN++; return; }
        const val=+score.toFixed(3);
        if(tok in baseScores){
          if(!(tok in tokenOverrides)){ added[tok]=val; updatedN++; }
        }else{
          added[tok]=val; addedN++;
        }
      });

      setTokenOverrides(prev=>({...prev,...added}));
      setTokenImportSummary({
        file:file.name, rows:rows.length, usedRows, skippedRows,
        addedN, updatedN, skippedN, totalImported:Object.keys(added).length,
      });
      window.alert(`Imported token evidence from ${file.name}\nRows used: ${usedRows}/${rows.length}\nTokens merged: ${Object.keys(added).length} (new ${addedN}, overrides ${updatedN})`);
    }catch(err){
      window.alert(`Token import failed: ${err?.message||"unknown error"}`);
    }
  },[ensureClassifierModel,tokenOverrides]);

  const importTokenPackFile=useCallback(async(file)=>{
    if(!file) return;
    try{
      const XLSX=await loadXLSX();
      const lower=String(file.name||"").toLowerCase();
      let rows=[];
      if(lower.endsWith(".json")){
        const txt=await file.text();
        const parsed=JSON.parse(txt);
        rows=Array.isArray(parsed)?parsed:(Array.isArray(parsed?.tokens)?parsed.tokens:[]);
      }else if(lower.endsWith(".csv")){
        const txt=await file.text();
        const wb=XLSX.read(txt,{type:"string"});
        const ws=wb.Sheets[wb.SheetNames[0]];
        if(!ws) throw new Error("No sheet found.");
        rows=XLSX.utils.sheet_to_json(ws,{defval:""});
      }else{
        const buf=await file.arrayBuffer();
        const wb=XLSX.read(buf,{type:"array"});
        const ws=wb.Sheets[wb.SheetNames[0]];
        if(!ws) throw new Error("No sheet found.");
        rows=XLSX.utils.sheet_to_json(ws,{defval:""});
      }
      if(!rows.length) throw new Error("No token rows found.");
      const norm=s=>String(s||"").trim().toLowerCase();
      const cols=Object.keys(rows[0]||{});
      const tokenCol=cols.find(c=>["token","name"].includes(norm(c))) || cols.find(c=>norm(c).includes("token"));
      const scoreCol=cols.find(c=>["current score","score","current_score"].includes(norm(c))) || cols.find(c=>norm(c).includes("score"));
      if(!tokenCol||!scoreCol) throw new Error(`Could not detect token/score columns. Found: ${cols.join(", ")}`);
      const mode=window.confirm("Token import mode:\nOK = replace current token edits\nCancel = merge/update into current token edits")?"replace":"merge";
      const imported={};
      let applied=0, skipped=0;
      rows.forEach(r=>{
        const tok=String(r[tokenCol]||"").trim().toUpperCase();
        const raw=r[scoreCol];
        const num=raw===-1||String(raw).trim()==="-1"?-1:parseFloat(raw);
        if(!tok || (num!==-1 && (Number.isNaN(num)||num<0||num>1))){ skipped++; return; }
        imported[tok]=num===-1?-1:+num.toFixed(3);
        applied++;
      });
      if(mode==="replace") setTokenOverrides(imported);
      else setTokenOverrides(prev=>({...prev,...imported}));
      setTokenImportSummary({
        file:file.name,
        rows:rows.length,
        usedRows:applied,
        skippedRows:skipped,
        addedN:applied,
        updatedN:0,
        skippedN:skipped,
        totalImported:applied,
      });
      window.alert(`Token pack import complete.\nApplied: ${applied}\nSkipped: ${skipped}\nMode: ${mode}`);
    }catch(err){
      window.alert(`Token pack import failed: ${err?.message||"unknown error"}`);
    }
  },[]);

  // ── Column alias map: canonical → list of accepted aliases (all lowercase) ──
  const COLUMN_ALIASES={
    name:           ["name","voter_name","voter name","full_name","fullname","first_name","firstname","elector name","elector_name"],
    relation_name:  ["relation_name","relation name","father_name","father name","husband_name","husband name","guardian_name","guardian name","relative_name","relative name","guardian","father/husband","father / husband","father/husband name"],
    voter_id:       ["voter_id","voter_id_card","voter id","voter_id_no","id","epic_no","epic no","epic","voter card no","voter_card_no","id_no","id no","electoral_no","electoral no","voter no","voter number"],
    serial_no:      ["serial_no","serial no","sl_no","sl no","slno","s.no","s no","sno","sr_no","sr no","srno","sequence_no","sequence no","roll_no","roll no","row_no","row no","#"],
    part_no:        ["part_no","part no","part","booth_no","booth no","booth","polling_booth","polling booth","part number","partno","ward_no","ward no","segment_no"],
    age:            ["age","voter_age","age_years","years","age (years)"],
    gender:         ["gender","sex","m/f","voter_gender","voter gender"],
    stamp_type:     ["stamp_type","stamp type","stamp","status","voter_status","voter status","deletion_status","deletion status","flag","type","adjudication","deleted_flag"],
  };
  const OPTIONAL_ALIASES={
    ac_no:         ["ac_no","ac no","ac number","assembly constituency no","assembly constituency number","constituency no","constituency number"],
    ac_name:       ["ac_name","ac name","assembly constituency name","constituency name"],
    house_no:      ["house_no","house no","house number","house_number"],
    page_no:       ["page_no","page no","page number","page_number"],
    relation_type: ["relation_type","relation type","relation","father/husband type","relation label"],
  };
  const OPTIONAL_COLS=Object.keys(OPTIONAL_ALIASES);
  const ALL_COL_ALIASES={...COLUMN_ALIASES,...OPTIONAL_ALIASES};

  // Build a remapping from actual columns → canonical names using aliases
  const buildColMap=(actualCols)=>{
    const map={}; // canonical → actual col key (original case)
    const usedActual=new Set();
    const allCanonicals=Object.keys(ALL_COL_ALIASES);
    for(const canonical of allCanonicals){
      const aliases=ALL_COL_ALIASES[canonical];
      for(const actual of actualCols){
        const lc=actual.toLowerCase().trim();
        if(aliases.includes(lc) && !usedActual.has(actual)){
          map[canonical]=actual;
          usedActual.add(actual);
          break;
        }
      }
    }
    return map;
  };

  // Remap a raw XLSX row using a colMap {canonical→actualKey}
  const remapRow=(row,colMap)=>{
    const out={...row};
    for(const [canonical,actual] of Object.entries(colMap)){
      if(actual!==canonical && actual in row){
        out[canonical]=row[actual];
      }
    }
    return out;
  };

  // Prompt user to resolve unmapped columns — returns Promise<map|null>
  const askColMapping=(fileName,actualCols,currentMap,stillMissing)=>
    new Promise(resolve=>{
      setColMapModal({file:fileName,actualCols,mapping:{...currentMap},missing:stillMissing,resolve});
    });

  const parseCoverageFromRows=useCallback((rows)=>({
    acPairs:[...new Set(rows.map(r=>`${String(r.ac_no||r["AC No"]||"").trim()}|${String(r.ac_name||r["AC Name"]||"").trim()}`).filter(k=>k!=="|"))],
    parts:[...new Set(rows.map(r=>String(r.part_no||r["Part Number"]||r.Part||r["Part No"]||"").trim()).filter(Boolean))].sort((a,b)=>(+a||0)-(+b||0)),
  }),[]);

  const readUploadEntries=useCallback(async(files)=>(
    Promise.all(files.map(async(file)=>{
      const lower=String(file.name||"").toLowerCase();
      const entry={ file, lower };
      if(lower.endsWith(".xlsx")) entry.buffer=await file.arrayBuffer();
      return entry;
    }))
  ),[]);

  const detectWorkbookInfo=useCallback((wb,fileName="",XLSX)=>{
    const lower=String(fileName||"").toLowerCase();
    const localImportSheetName=(()=>{
      const preferred=["Voter Roll","Filtered_Voters","Session_Voters","All_Voters","Voters"];
      const exact=preferred.find(name=>wb?.Sheets?.[name]);
      if(exact) return exact;
      const normalized=(wb?.SheetNames||[]).map(name=>({name,key:String(name||"").trim().toLowerCase()}));
      const fuzzy=normalized.find(({key})=>[
        "voter roll","filtered_voters","filtered voters","session_voters","session voters","all_voters","all voters","voters",
      ].includes(key));
      return fuzzy?.name||null;
    })();
    if(lower.endsWith(".eimpack")||lower.endsWith(".json")){
      return {kind:"session_pack",label:"Session Pack",coverage:{acPairs:[],parts:[]},sheetNames:[]};
    }
    const sheets=wb?.SheetNames||[];
    const has=(name)=>!!wb?.Sheets?.[name];
    if(has(INSIGHTS_SHEETS.meta)&&has(INSIGHTS_SHEETS.part)){
      const metaRows=XLSX.utils.sheet_to_json(wb.Sheets[INSIGHTS_SHEETS.meta],{defval:""});
      const partRows=XLSX.utils.sheet_to_json(wb.Sheets[INSIGHTS_SHEETS.part],{defval:""});
      return {
        kind:"insights_xlsx",
        label:"Insights Workbook",
        schemaVersion:metaRows[0]?.schemaVersion||"",
        coverage:parseCoverageFromRows(partRows),
        datasets:readInsightsWorkbookData(wb,XLSX),
        sheetNames:sheets,
      };
    }
    if(has("Session_Metadata")&&has("Session_Voters")){
      const rows=XLSX.utils.sheet_to_json(wb.Sheets["Session_Voters"],{defval:""});
      return {kind:"session_xlsx",label:"Session Workbook",coverage:parseCoverageFromRows(rows),sheetNames:sheets};
    }
    if(has("Export_Metadata")&&has("Filtered_Voters")){
      const rows=XLSX.utils.sheet_to_json(wb.Sheets["Filtered_Voters"],{defval:""});
      return {kind:"filtered_export",label:"Filtered Export Workbook",rows,importSheetName:"Filtered_Voters",coverage:parseCoverageFromRows(rows),sheetNames:sheets};
    }
    const importSheetName=localImportSheetName;
    if(importSheetName){
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[importSheetName],{defval:""});
      return {
        kind:importSheetName==="Voter Roll"?"raw_roll_xlsx":"voter_export_xlsx",
        label:importSheetName==="Voter Roll"?"Raw Roll Workbook":"Voter-Level Export Workbook",
        importSheetName,
        rows,
        coverage:parseCoverageFromRows(rows),
        sheetNames:sheets,
      };
    }
    return {kind:"unknown_xlsx",label:"Unknown Workbook",coverage:{acPairs:[],parts:[]},sheetNames:sheets};
  },[parseCoverageFromRows]);

  const planUploadBatch=useCallback(async(entries)=>{
    const XLSX=await loadXLSX();
    const plans=[];
    for(const entry of entries){
      const { file, lower }=entry;
      if(lower.endsWith(".eimpack")||lower.endsWith(".json")){
        plans.push({file,kind:"session_pack",label:"Session Pack",coverage:{acPairs:[],parts:[]},plannedAction:"not-loadable-from-main-upload"});
        continue;
      }
      if(!lower.endsWith(".xlsx")){
        plans.push({file,kind:"unsupported",label:"Unsupported File",coverage:{acPairs:[],parts:[]},plannedAction:"skip"});
        continue;
      }
      try{
        const buf=entry.buffer;
        const wb=XLSX.read(buf,{type:"array"});
        const info=detectWorkbookInfo(wb,file.name,XLSX);
        const rawHash=await sha256HexArrayBuffer(buf);
        plans.push({
          entry,
          file,
          buffer:buf,
          rawHash,
          ...info,
          plannedAction:(info.kind==="raw_roll_xlsx"||info.kind==="voter_export_xlsx"||info.kind==="filtered_export")?"load-voters":
            info.kind==="insights_xlsx"?"catalog-insights":
            info.kind==="session_xlsx"?"use-import-session":
            "skip",
        });
      }catch(err){
        plans.push({file,kind:"corrupt",label:"Unreadable Workbook",coverage:{acPairs:[],parts:[]},plannedAction:"skip",error:err?.message||"read failed"});
      }
    }
    const partOwners={};
    plans.forEach(p=>{
      (p.coverage?.parts||[]).forEach(part=>{
        const key=(p.coverage?.acPairs?.[0]||"?")+"|"+part;
        (partOwners[key]=partOwners[key]||[]).push(p.file.name);
      });
    });
    const overlaps=Object.entries(partOwners)
      .filter(([,names])=>names.length>1)
      .map(([key,names])=>({key,files:names}));
    return {plans,overlaps};
  },[detectWorkbookInfo]);

  const enrichUploadPlan=useCallback((plan)=>{
    const existingRawKeys=new Set(voters.map(v=>`${String(v.ac_no||"").trim()}|${String(v.ac_name||"").trim()}|${String(v.part_no||"").trim()}`));
    const existingInsightPartMap={};
    Object.values(loadedInsightsMeta||{}).forEach(src=>{
      (src.partInsights||[]).forEach(r=>{
        const key=`${String(r["AC No"]||r.ac_no||"").trim()}|${String(r["AC Name"]||r.ac_name||"").trim()}|${String(r["Part Number"]||r.part_no||r.Part||"").trim()}`;
        if(!key || key==="||") return;
        (existingInsightPartMap[key]=existingInsightPartMap[key]||[]).push(src.fileName);
      });
    });
    const plans=(plan?.plans||[]).map(p=>{
      const partRows=p.datasets?.partInsights||[];
      const overlapWithRaw=[];
      const overlapWithInsights=[];
      const internalConflicts=[];
      const seenParts={};
      partRows.forEach(r=>{
        const key=`${String(r["AC No"]||r.ac_no||"").trim()}|${String(r["AC Name"]||r.ac_name||"").trim()}|${String(r["Part Number"]||r.part_no||r.Part||"").trim()}`;
        if(!key || key==="||") return;
        if(existingRawKeys.has(key)) overlapWithRaw.push(key);
        if(existingInsightPartMap[key]?.length) overlapWithInsights.push({key,files:existingInsightPartMap[key]});
        const sig=JSON.stringify(r);
        if(seenParts[key] && seenParts[key]!==sig) internalConflicts.push(key);
        seenParts[key]=sig;
      });
      return {
        ...p,
        overlapWithRaw:[...new Set(overlapWithRaw)],
        overlapWithInsights:overlapWithInsights.filter((v,i,a)=>a.findIndex(x=>x.key===v.key)===i),
        internalConflicts:[...new Set(internalConflicts)],
      };
    });
    return {...plan,plans};
  },[voters,loadedInsightsMeta]);

  const findImportSheetName=useCallback((wb)=>{
    const preferred=[
      "Voter Roll",
      "Filtered_Voters",
      "Session_Voters",
      "All_Voters",
      "Voters",
    ];
    const exact=preferred.find(name=>wb?.Sheets?.[name]);
    if(exact) return exact;
    const normalized=(wb?.SheetNames||[]).map(name=>({name,key:String(name||"").trim().toLowerCase()}));
    const fuzzy=normalized.find(({key})=>[
      "voter roll",
      "filtered_voters",
      "filtered voters",
      "session_voters",
      "session voters",
      "all_voters",
      "all voters",
      "voters",
    ].includes(key));
    return fuzzy?.name||null;
  },[]);

  // ── Load files (with duplicate-file detection & replace/cancel modal) ────────
  const doLoadFiles=useCallback(async(items, replaceNames=new Set())=>{
    setLoading(true);
    const REQUIRED=Object.keys(COLUMN_ALIASES);
    const newWarnings=[];
    try{
      const plans=(items||[]).map(item=>item?.file?item:{file:item});
      const needsWorkbookRead=plans.some(p=>!Array.isArray(p.rows));
      const XLSX=needsWorkbookRead?await loadXLSX():null;
      const model=await ensureClassifierModel();
      const classifyReligion=model.classifyReligion||FALLBACK_CLASSIFIER.classifyReligion;
      // If replacing, remove existing voters from those files first
      let baseVoters=voters;
      let baseFileMeta={...loadedFileMeta};
      if(replaceNames.size>0){
        baseVoters=voters.filter(v=>!replaceNames.has(v.sourceFile));
        replaceNames.forEach(n=>delete baseFileMeta[n]);
      }

      const all=[];
      const perFileMeta={};
      const existingDupKeys=new Set(baseVoters.map(v=>duplicateKeyOf(v)));
      const existingRawHashes=new Map(Object.entries(baseFileMeta).map(([fn,m])=>[m?.rawHash,fn]).filter(([h])=>!!h));
      const existingSemanticHashes=new Map(Object.entries(baseFileMeta).map(([fn,m])=>[m?.semanticHash,fn]).filter(([h])=>!!h));
      const batchRawHashes=new Map();
      const batchSemanticHashes=new Map();
      let uploadedDupRows=0;
      for(const item of plans){
        const file=item.file;
        const buf=item.buffer;
        const rawHash=item.rawHash || (buf?await sha256HexArrayBuffer(buf):"");
        if(batchRawHashes.has(rawHash)){
          newWarnings.push({file:file.name,type:"warn",msg:`Skipped: exact binary duplicate of ${batchRawHashes.get(rawHash)} in same upload batch`});
          continue;
        }
        if(existingRawHashes.has(rawHash)){
          newWarnings.push({file:file.name,type:"warn",msg:`Skipped: exact same file content already loaded as ${existingRawHashes.get(rawHash)}`});
          continue;
        }
        let rows=Array.isArray(item.rows)?item.rows:null;
        let importSheetName=item.importSheetName||null;
        if(!rows){
          const wb=XLSX.read(buf,{type:"array"});
          importSheetName=findImportSheetName(wb);
          if(!importSheetName){
            newWarnings.push({file:file.name,type:"error",
              msg:`Missing importable voter sheet. Expected one of: Voter Roll, Filtered_Voters, Session_Voters, All_Voters, Voters. Found sheets: ${wb.SheetNames.join(", ")}`});
            continue;
          }
          rows=XLSX.utils.sheet_to_json(wb.Sheets[importSheetName],{defval:""});
        }
        if(importSheetName && importSheetName!=="Voter Roll"){
          newWarnings.push({file:file.name,type:"info",
            msg:`Importing from "${importSheetName}" sheet (exported workbook compatibility mode)`});
        }
        if(!rows.length){
          newWarnings.push({file:file.name,type:"error",msg:"Sheet is empty"});
          continue;
        }
        const actualCols=Object.keys(rows[0]);

        // Auto-map using aliases
        let colMap=buildColMap(actualCols);
        let missing=REQUIRED.filter(r=>!colMap[r]);

        // If auto-map leaves gaps, ask user to resolve
        if(missing.length){
          setLoading(false);
          const userMap=await askColMapping(file.name,actualCols,colMap,missing);
          setLoading(true);
          if(!userMap){
            // User cancelled
            newWarnings.push({file:file.name,type:"error",
              msg:`Skipped — column mapping cancelled by user`});
            continue;
          }
          colMap=userMap;
          missing=REQUIRED.filter(r=>!colMap[r]);
          if(missing.length){
            newWarnings.push({file:file.name,type:"error",
              msg:`Missing required columns (still unmapped): ${missing.join(", ")}`});
            continue;
          }
        }

        // Note any auto-remapped columns for transparency
        const remapped=Object.entries(colMap)
          .filter(([can,act])=>act!==can)
          .map(([can,act])=>`${act}→${can}`);
        if(remapped.length){
          newWarnings.push({file:file.name,type:"info",
            msg:`Auto-mapped columns: ${remapped.join(", ")}`});
        }

        // Any unrecognised extra columns
        const mappedActuals=new Set(Object.values(colMap));
        const extra=actualCols.filter(c=>{
          const lc=c.toLowerCase().trim();
          return !mappedActuals.has(c)&&![...REQUIRED,...OPTIONAL_COLS].includes(lc);
        });
        if(extra.length){
          newWarnings.push({file:file.name,type:"warn",
            msg:`Unknown columns (will be preserved): ${extra.join(", ")}`});
        }

        let emptyNames=0;
        const semanticSignatures=[];
        rows.forEach((row,rowIdx)=>{
          const mapped=remapRow(row,colMap);
          const name=String(mapped.name||"").trim();
          if(!name){emptyNames++;return;}
          const partNo=mapped.part_no!==undefined?String(mapped.part_no):"?";
          const relName=String(mapped.relation_name||"").trim();
          const stamp=String(mapped.stamp_type||"").trim().toUpperCase();
          const status=stamp.includes("ADJUDICATION")?"Under Adjudication":
                       stamp==="DELETED"?"Deleted":"Active";
          const {rel,conf,via}=classifyReligion(name,relName,effectiveScores);
          semanticSignatures.push(rowSemanticSignature(mapped));
          const dupProbe={part_no:partNo,voter_id:mapped.voter_id,serial_no:mapped.serial_no,name};
          const dupKey=duplicateKeyOf(dupProbe);
          const isExistingDuplicate=existingDupKeys.has(dupKey);
          if(isExistingDuplicate) uploadedDupRows+=1;
          all.push({
            ...mapped,
            part_no:partNo,
            name,relation_name:relName,
            status,religion:rel,relConf:conf,relVia:via,
            ageGroup:getAgeGroup(mapped.age),
            isSelfMapped:isSelfMapped(mapped.age),
            duplicateKey:dupKey,
            isExistingDuplicate,
            sourceFile:file.name,
            _uid:`${mapped.voter_id||""}_${mapped.serial_no||""}_${partNo}_${file.name}_${rowIdx}`,
          });
        });
        if(emptyNames>0)
          newWarnings.push({file:file.name,type:"warn",
            msg:`${emptyNames} rows skipped (empty name field)`});

        const semanticBase=semanticSignatures.sort().join("\n");
        const semanticHash=await sha256HexString(semanticBase);
        if(batchSemanticHashes.has(semanticHash)){
          newWarnings.push({file:file.name,type:"warn",msg:`Same logical Voter Roll content as ${batchSemanticHashes.get(semanticHash)} in this upload batch`});
        }
        if(existingSemanticHashes.has(semanticHash)){
          newWarnings.push({file:file.name,type:"warn",msg:`Same logical Voter Roll content already loaded as ${existingSemanticHashes.get(semanticHash)}`});
        }
        batchRawHashes.set(rawHash,file.name);
        batchSemanticHashes.set(semanticHash,file.name);
        perFileMeta[file.name]={
          fileName:file.name,
          size:file.size,
          lastModified:file.lastModified,
          rowCount:semanticSignatures.length,
          acNo:String(rows[0]?.ac_no||rows[0]?.["AC No"]||"").trim(),
          acName:String(rows[0]?.ac_name||rows[0]?.["AC Name"]||"").trim(),
          parts:[...new Set(rows.map(r=>String(r.part_no||r["Part Number"]||r.Part||"").trim()).filter(Boolean))],
          rawHash,
          semanticHash,
          importedAt:new Date().toISOString(),
          duplicateRawOf:existingRawHashes.get(rawHash)||null,
          duplicateSemanticOf:existingSemanticHashes.get(semanticHash)||null,
        };
      }
      if(uploadedDupRows>0){
        newWarnings.push({file:"upload",type:"warn",msg:`${uploadedDupRows} row(s) appear to duplicate already loaded voters`});
      }
      if(newWarnings.length) setFileWarnings(prev=>[...prev,...newWarnings]);

      const merged=[...baseVoters,...all];
      setVoters(merged);

      // Update loadedFiles registry
      setLoadedFiles(prev=>{
        const next={...prev};
        // Remove replaced entries
        replaceNames.forEach(n=>delete next[n]);
        // Add/update new files
        plans.forEach(({file:f})=>{
          const parts=[...new Set(all.filter(v=>v.sourceFile===f.name).map(v=>v.part_no))];
          if(parts.length) next[f.name]=parts;
        });
        return next;
      });
      setLoadedFileMeta(prev=>{
        const next={...prev};
        replaceNames.forEach(n=>delete next[n]);
        Object.entries(perFileMeta).forEach(([k,v])=>{ next[k]=v; });
        return next;
      });

      if(all.length){
        const partMap={};
        const batchCounts={};
        all.forEach(v=>{ batchCounts[v.duplicateKey]=(batchCounts[v.duplicateKey]||0)+1; });
        const duplicateKeysInBatch=Object.keys(batchCounts).filter(k=>batchCounts[k]>1);
        const duplicateRowsInBatch=duplicateKeysInBatch.reduce((s,k)=>s+batchCounts[k],0);
        all.forEach(v=>{
          const key=String(v.part_no??"?");
          if(!partMap[key]) partMap[key]={
            acNo:"",acName:"",
            part:key,total:0,active:0,adj:0,del:0,
            muslim:0,hindu:0,uncertain:0,unknown:0,duplicates:0,
            below45:0,age45Plus:0,review:0,
          };
          const p=partMap[key];
          const rowAcNo=String(v.ac_no||"").trim();
          const rowAcName=String(v.ac_name||"").trim();
          if(!p.acNo&&rowAcNo) p.acNo=rowAcNo;
          if(!p.acName&&rowAcName) p.acName=rowAcName;
          p.total+=1;
          if(v.status==="Under Adjudication") p.adj+=1;
          else if(v.status==="Deleted") p.del+=1;
          else p.active+=1;
          if(v.religion==="Muslim") p.muslim+=1;
          else if(v.religion==="Hindu") p.hindu+=1;
          else if(v.religion==="Uncertain"){p.uncertain+=1;p.review+=1;}
          else{p.unknown+=1;p.review+=1;}
          const a=parseInt(v.age,10);
          if(!Number.isNaN(a)){if(a>=45)p.age45Plus+=1;else p.below45+=1;}
          if((batchCounts[v.duplicateKey]||0)>1||v.isExistingDuplicate) p.duplicates+=1;
        });
        const partRows=Object.values(partMap).sort((a,b)=>(+a.part||0)-(+b.part||0));
        const totalReview=partRows.reduce((s,r)=>s+r.review,0);
        const acCoverage=[...new Set(
          partRows.map(r=>`${r.acNo||"?"} - ${r.acName||"?"}`)
        )].join(" ; ");
        setUploadSummary({
          files:plans.length,loaded:all.length,parts:partRows.length,
          acCoverage,
          unknown:partRows.reduce((s,r)=>s+r.unknown,0),
          uncertain:partRows.reduce((s,r)=>s+r.uncertain,0),
          review:totalReview,
          duplicates:partRows.reduce((s,r)=>s+r.duplicates,0),
          duplicateGroups:duplicateKeysInBatch.length,
          duplicateRowsInBatch,
          partRows,
          isReplace:replaceNames.size>0,
        });
      }
      const allMergedParts=[...new Set(merged.map(v=>v.part_no))].sort((a,b)=>+a-+b);
      if(allMergedParts.length&&boothPart===null){
        setBoothPart(allMergedParts[0]);
        setBoothPartsSelected(prev=>prev.length?prev:[allMergedParts[0]]);
      }
    }catch(e){
      setFileWarnings(prev=>[...prev,{file:"unknown",type:"error",msg:e.message}]);
    }
    setLoading(false);
  },[boothPart,voters,effectiveScores,loadedFileMeta,findImportSheetName,ensureClassifierModel]);

  const executePlannedUpload=useCallback(async(plans)=>{
    const insights=plans.filter(p=>p.plannedAction==="catalog-insights");
    if(insights.length){
      setLoadedInsightsMeta(prev=>{
        const next={...prev};
        insights.forEach(p=>{
          next[p.file.name]={
            fileName:p.file.name,
            schemaVersion:p.schemaVersion||INSIGHTS_SCHEMA_VERSION,
            importedAt:new Date().toISOString(),
            acPairs:p.coverage?.acPairs||[],
            parts:p.coverage?.parts||[],
            kind:p.kind,
            meta:p.datasets?.meta||[],
            partInsights:p.datasets?.partInsights||[],
            acInsights:p.datasets?.acInsights||[],
            religionStatus:p.datasets?.religionStatus||[],
            ageReligion:p.datasets?.ageReligion||[],
            ageStatus:p.datasets?.ageStatus||[],
            overlapWithRaw:p.overlapWithRaw||[],
            overlapWithInsights:p.overlapWithInsights||[],
            internalConflicts:p.internalConflicts||[],
          };
        });
        return next;
      });
      setFileWarnings(prev=>[...prev,...insights.map(p=>({
        file:p.file.name,
        type:"info",
        msg:`Detected Insights Workbook v1; loaded ${(p.coverage?.parts||[]).length} parts in analysis-only dataset${p.overlapWithRaw?.length?` · raw-overlap ${p.overlapWithRaw.length}`:""}${p.overlapWithInsights?.length?` · insight-overlap ${p.overlapWithInsights.length}`:""}.`,
      }))]);
    }
    const skipped=plans.filter(p=>["session_xlsx","session_pack","unsupported","unknown_xlsx","corrupt"].includes(p.kind));
    if(skipped.length){
      setFileWarnings(prev=>[...prev,...skipped.map(p=>({
        file:p.file.name,
        type:p.kind==="corrupt"?"error":"warn",
        msg:p.kind==="session_xlsx"||p.kind==="session_pack"
          ?"Detected session file in main uploader. Use the Import Session button instead."
          :p.error||`Unsupported file type: ${p.label}`,
      }))]);
    }
    const voterPlans=plans.filter(p=>p.plannedAction==="load-voters");
    if(!voterPlans.length) return;
    const byName=voterPlans.filter(p=>p.file.name in loadedFiles);
    const byContent=[];
    const seenRaw=new Map();
    const existingRawToName=new Map(
      Object.entries(loadedFileMeta||{})
        .map(([name,m])=>[m?.rawHash,name])
        .filter(([h])=>!!h)
    );
    for(const plan of voterPlans){
      if(byName.some(x=>x.file.name===plan.file.name)) continue;
      const raw=plan.rawHash;
      if(seenRaw.has(raw)) continue;
      seenRaw.set(raw,plan.file.name);
      if(existingRawToName.has(raw)){
        byContent.push({ plan, existingName:existingRawToName.get(raw), rawHash:raw });
      }
    }
    const conflictNewNames=new Set([
      ...byName.map(p=>p.file.name),
      ...byContent.map(x=>x.plan.file.name),
    ]);
    const newOnly=voterPlans.filter(p=>!conflictNewNames.has(p.file.name));
    if(byName.length>0 || byContent.length>0){
      setReplaceModal({ conflicting:byName, contentConflicts:byContent, newOnly, all:voterPlans });
      return;
    }
    await doLoadFiles(voterPlans);
  },[loadedFiles,loadedFileMeta,doLoadFiles]);

  // ── Public loadFiles: detect workbook types, plan mixed uploads, then load ──
  const loadFiles=useCallback(async(files)=>{
    const entries=await readUploadEntries(files);
    const plan=enrichUploadPlan(await planUploadBatch(entries));
    const typeSet=[...new Set(plan.plans.map(p=>p.kind))];
    const shouldShowPlanner=
      plan.overlaps.length>0 ||
      typeSet.length>1 ||
      typeSet.includes("insights_xlsx") ||
      typeSet.includes("session_xlsx") ||
      typeSet.includes("unknown_xlsx") ||
      plan.plans.some(p=>p.overlapWithRaw?.length||p.overlapWithInsights?.length||p.internalConflicts?.length);
    if(shouldShowPlanner){
      setIngestPlanModal(plan);
      return;
    }
    await executePlannedUpload(plan.plans);
  },[readUploadEntries,planUploadBatch,enrichUploadPlan,executePlannedUpload]);

  const openVoterEditor=useCallback((v)=>{
    setVoterEditModal({
      uid:v._uid,
      draft:{
        name:String(v.name||""),
        relation_name:String(v.relation_name||""),
        age:String(v.age??""),
        gender:String(v.gender||""),
        voter_id:String(v.voter_id||""),
        serial_no:String(v.serial_no||""),
        house_no:String(v.house_no||""),
        page_no:String(v.page_no||""),
        status:String(v.status||canonicalStatusFromStamp(v.stamp_type)),
        religion_override:String(overrides[v._uid]||""),
      },
    });
  },[overrides]);

  const saveVoterEdit=useCallback(()=>{
    if(!voterEditModal?.uid) return;
    const uid=voterEditModal.uid;
    const d=voterEditModal.draft||{};
    setVoters(prev=>prev.map(v=>{
      if(v._uid!==uid) return v;
      const name=String(d.name||"").trim();
      const relation=String(d.relation_name||"").trim();
      const status=["Active","Under Adjudication","Deleted"].includes(d.status)?d.status:"Active";
      const stamp=canonicalStampFromStatus(status);
      const {rel,conf,via}=classifierModel.classifyReligion(name,relation,effectiveScores);
      const manualRel=["Muslim","Hindu","Uncertain","Unknown"].includes(d.religion_override)?d.religion_override:"";
      return {
        ...v,
        name,
        relation_name:relation,
        age:String(d.age??""),
        gender:String(d.gender||""),
        voter_id:String(d.voter_id||""),
        serial_no:String(d.serial_no||""),
        house_no:String(d.house_no||""),
        page_no:String(d.page_no||""),
        stamp_type:stamp,
        status,
        religion:manualRel||rel,
        relConf:conf,
        relVia:manualRel?"manual-edit":via,
        _manualRel:!!manualRel,
        ageGroup:getAgeGroup(d.age),
        isSelfMapped:isSelfMapped(d.age),
        duplicateKey:duplicateKeyOf({part_no:v.part_no,voter_id:d.voter_id,serial_no:d.serial_no,name}),
      };
    }));
    setOverrides(prev=>{
      const n={...prev};
      const mr=["Muslim","Hindu","Uncertain","Unknown"].includes(d.religion_override)?d.religion_override:"";
      if(mr) n[uid]=mr;
      else delete n[uid];
      return n;
    });
    setVoterEditModal(null);
  },[voterEditModal,effectiveScores,classifierModel]);

  // Effective religion (auto or override)
  const effRel=useCallback((v)=>overrides[v._uid]||v.religion,[overrides]);

  const parts=useMemo(()=>[...new Set(voters.map(v=>v.part_no))].sort((a,b)=>+a-+b),[voters]);
  useEffect(()=>{
    if(!parts.length){
      setBoothPart(null);
      if(!boothSelectionTouched) setBoothPartsSelected([]);
      return;
    }
    const validSelected=boothPartsSelected.filter(p=>parts.includes(p));
    if(validSelected.length!==boothPartsSelected.length) setBoothPartsSelected(validSelected);
    if(!boothSelectionTouched && validSelected.length===0){
      setBoothPartsSelected([parts[0]]);
      setBoothPart(parts[0]);
      return;
    }
    if(validSelected.length>0 && !validSelected.includes(boothPart)) setBoothPart(validSelected[0]);
    if(validSelected.length===0 && boothPart && !parts.includes(boothPart)) setBoothPart(null);
  },[parts,boothPartsSelected,boothPart,boothSelectionTouched]);
  const ageGroups=["18–22","23–30","31–39","40–44★","45–60","60+","Unknown"];
  const insightSources=useMemo(()=>Object.values(loadedInsightsMeta||{}),[loadedInsightsMeta]);
  const analysisOnly=(!voters.length && insightSources.length>0);
  const analysisOnlyData=useMemo(()=>{
    const byPart={};
    const duplicateCoverage=[];
    const conflictingCoverage=[];
    const sourceRows=[];
    const partSigMap={};
    insightSources.forEach(src=>{
      const importedAt=src.importedAt||"";
      sourceRows.push({
        fileName:src.fileName||"",
        type:"Insights Workbook",
        importedAt,
        acCoverage:(src.acPairs||[]).map(p=>p.replace("|"," - ")).join("; "),
        partCount:(src.parts||[]).length,
        rowCount:(src.partInsights||[]).length,
      });
      (src.partInsights||[]).forEach(row=>{
        const acNo=String(row["AC No"]||row.ac_no||"").trim();
        const acName=String(row["AC Name"]||row.ac_name||"").trim();
        const partNo=String(row["Part Number"]||row.part_no||row.Part||"").trim();
        const key=`${acNo}|${acName}|${partNo}`;
        if(!partNo) return;
        const normalized={
          ac_no:acNo,
          ac_name:acName,
          part_no:partNo,
          total:+(row.Total||0),
          active:+(row.Active||0),
          adj:+(row["Under Adjudication"]||row["Under Adj"]||0),
          del:+(row.Deleted||0),
          muslim:+(row.Muslim||0),
          hindu:+(row.Hindu||0),
          uncertain:+(row.Uncertain||0),
          unknown:+(row.Unknown||0),
          muslimAdj:+(row["Muslim Adj"]||0),
          hinduAdj:+(row["Hindu Adj"]||0),
          muslimDel:+(row["Muslim Del"]||0),
          hinduDel:+(row["Hindu Del"]||0),
          age18_22:+(row["Age 18–22"]||0),
          age23_30:+(row["Age 23–30"]||0),
          age31_39:+(row["Age 31–39"]||0),
          age40_44:+(row["Age 40–44★"]||0),
          age45_60:+(row["Age 45–60"]||0),
          age60p:+(row["Age 60+"]||0),
          ageUnknown:+(row["Age Unknown"]||0),
          __source:src.fileName||"",
          __importedAt:importedAt,
        };
        const sig=JSON.stringify({...normalized,__source:undefined,__importedAt:undefined});
        if(partSigMap[key] && partSigMap[key]!==sig){
          conflictingCoverage.push({key,files:[byPart[key]?.__source,src.fileName].filter(Boolean)});
        }else if(partSigMap[key]){
          duplicateCoverage.push({key,files:[byPart[key]?.__source,src.fileName].filter(Boolean)});
        }
        partSigMap[key]=sig;
        if(!byPart[key] || String(byPart[key].__importedAt||"")<importedAt){
          byPart[key]=normalized;
        }
      });
    });
    const partRows=Object.values(byPart).sort((a,b)=>(+a.part_no||0)-(+b.part_no||0));
    const religionRows=[
      {religion:"Muslim",total:partRows.reduce((s,r)=>s+r.muslim,0),adj:partRows.reduce((s,r)=>s+r.muslimAdj,0),del:partRows.reduce((s,r)=>s+r.muslimDel,0)},
      {religion:"Hindu",total:partRows.reduce((s,r)=>s+r.hindu,0),adj:partRows.reduce((s,r)=>s+r.hinduAdj,0),del:partRows.reduce((s,r)=>s+r.hinduDel,0)},
      {religion:"Uncertain",total:partRows.reduce((s,r)=>s+r.uncertain,0),adj:null,del:null},
      {religion:"Unknown",total:partRows.reduce((s,r)=>s+r.unknown,0),adj:null,del:null},
    ].map(r=>({...r,active:r.adj===null?null:(r.total-r.adj-r.del),adjRate:r.adj===null?null:pct(r.adj,r.total),delRate:r.del===null?null:pct(r.del,r.total)}))
      .filter(r=>r.total>0);
    const ageRows=[
      {age:"18–22",total:partRows.reduce((s,r)=>s+r.age18_22,0)},
      {age:"23–30",total:partRows.reduce((s,r)=>s+r.age23_30,0)},
      {age:"31–39",total:partRows.reduce((s,r)=>s+r.age31_39,0)},
      {age:"40–44★",total:partRows.reduce((s,r)=>s+r.age40_44,0)},
      {age:"45–60",total:partRows.reduce((s,r)=>s+r.age45_60,0)},
      {age:"60+",total:partRows.reduce((s,r)=>s+r.age60p,0)},
      {age:"Unknown",total:partRows.reduce((s,r)=>s+r.ageUnknown,0)},
    ].filter(r=>r.total>0);
    const totals={
      total:partRows.reduce((s,r)=>s+r.total,0),
      adj:partRows.reduce((s,r)=>s+r.adj,0),
      del:partRows.reduce((s,r)=>s+r.del,0),
      muslim:partRows.reduce((s,r)=>s+r.muslim,0),
      hindu:partRows.reduce((s,r)=>s+r.hindu,0),
      uncertain:partRows.reduce((s,r)=>s+r.uncertain,0),
      unknown:partRows.reduce((s,r)=>s+r.unknown,0),
    };
    const mAR=totals.muslim?partRows.reduce((s,r)=>s+r.muslimAdj,0)/totals.muslim:0;
    const hAR=totals.hindu?partRows.reduce((s,r)=>s+r.hinduAdj,0)/totals.hindu:0;
    return {partRows,religionRows,ageRows,totals,mAR,hAR,sourceRows,duplicateCoverage,conflictingCoverage};
  },[insightSources]);
  const provenanceRows=useMemo(()=>{
    const rawRows=Object.entries(loadedFileMeta||{}).map(([name,m])=>({
      fileName:name,
      type:"Raw/Voter Workbook",
      importedAt:m?.importedAt||"",
      acCoverage:`${m?.acNo||"?"} - ${m?.acName||"?"}`,
      partCount:(m?.parts||[]).length,
      rowCount:m?.rowCount||0,
      duplicateOf:m?.duplicateSemanticOf||m?.duplicateRawOf||"",
    }));
    const insightRows=insightSources.map(src=>({
      fileName:src.fileName||"",
      type:"Insights Workbook",
      importedAt:src.importedAt||"",
      acCoverage:(src.acPairs||[]).map(p=>p.replace("|"," - ")).join("; "),
      partCount:(src.parts||[]).length,
      rowCount:(src.partInsights||[]).length,
      duplicateOf:"",
    }));
    return [...rawRows,...insightRows].sort((a,b)=>String(b.importedAt).localeCompare(String(a.importedAt)));
  },[loadedFileMeta,insightSources]);
  const provenanceConflicts=useMemo(()=>{
    const rawByPart={};
    voters.forEach(v=>{
      const key=`${String(v.ac_no||"").trim()}|${String(v.ac_name||"").trim()}|${String(v.part_no||"").trim()}`;
      (rawByPart[key]=rawByPart[key]||new Set()).add(v.sourceFile||"Loaded raw");
    });
    const insightByPart={};
    insightSources.forEach(src=>{
      (src.partInsights||[]).forEach(r=>{
        const key=`${String(r["AC No"]||r.ac_no||"").trim()}|${String(r["AC Name"]||r.ac_name||"").trim()}|${String(r["Part Number"]||r.part_no||r.Part||"").trim()}`;
        if(!key || key==="||") return;
        (insightByPart[key]=insightByPart[key]||new Set()).add(src.fileName||"Insights");
      });
    });
    const keys=[...new Set([...Object.keys(rawByPart),...Object.keys(insightByPart)])];
    return keys.map(key=>({
      key,
      rawFiles:[...(rawByPart[key]||[])],
      insightFiles:[...(insightByPart[key]||[])],
      status:(rawByPart[key]&&insightByPart[key])?"Raw preferred":
        ((insightByPart[key]&&insightByPart[key].size>1)?"Multiple insights":"Single source"),
    })).filter(r=>r.rawFiles.length||r.insightFiles.length)
      .filter(r=>r.rawFiles.length&&r.insightFiles.length || r.insightFiles.length>1);
  },[voters,insightSources]);
  useEffect(()=>{
    if(analysisOnly && !["overview","religion","age","sources","methodology"].includes(tab)){
      setTab("overview");
    }
  },[analysisOnly,tab]);

  const needDuplicateData=!compactViewport || tab==="duplicates";
  const needTrendData=!compactViewport || tab==="trends";
  const needCustomAnalyticsData=!compactViewport || tab==="custom";

  // ── Global filtered set ─────────────────────────────────────────────────────
  const filtered=useMemo(()=>voters.filter(v=>{
    if(gPart!=="all"&&v.part_no!==gPart)return false;
    if(gStatus!=="all"&&v.status!==gStatus)return false;
    if(gRel!=="all"&&effRel(v)!==gRel)return false;
    if(gAge!=="all"&&v.ageGroup!==gAge)return false;
    if(gGender!=="all"&&String(v.gender||"")[0]!==gGender)return false;
    if(gSearch){
      const s=gSearch.toLowerCase();
      return v.name.toLowerCase().includes(s)||
             String(v.voter_id).toLowerCase().includes(s)||
             v.relation_name.toLowerCase().includes(s);
    }
    return true;
  }),[voters,gPart,gStatus,gRel,gAge,gGender,gSearch,overrides]);

  // Voters needing religion review
  const needsReview=useMemo(()=>voters.filter(v=>!overrides[v._uid]&&(v.religion==="Unknown"||v.religion==="Uncertain")),[voters,overrides]);

  const duplicateGroups=useMemo(()=>{
    if(!needDuplicateData) return [];
    const map={};
    voters.forEach(v=>{
      const k=v.duplicateKey||duplicateKeyOf(v);
      (map[k]=map[k]||[]).push(v);
    });
    return Object.entries(map)
      .filter(([,rows])=>rows.length>1)
      .map(([key,rows])=>{
        const sigSet=new Set(rows.map(exactDuplicateSignatureOf));
        const autoResolved=sigSet.size===1;
        const manualResolved=!!resolvedDuplicateKeys[key];
        return {
          key,
          count:rows.length,
          part:rows[0]?.part_no,
          voter_id:rows[0]?.voter_id,
          name:rows[0]?.name,
          rows,
          autoResolved,
          resolved:autoResolved||manualResolved,
          resolution:autoResolved?"auto-exact-match":(manualResolved?"manual":"open"),
        };
      })
      .sort((a,b)=>b.count-a.count);
  },[voters,resolvedDuplicateKeys,needDuplicateData]);

  const fileDuplicateGroups=useMemo(()=>{
    if(!needDuplicateData) return [];
    const arr=Object.values(loadedFileMeta||{});
    const map={};
    arr.forEach(m=>{
      const k=m.semanticHash||m.rawHash;
      if(!k) return;
      (map[k]=map[k]||[]).push(m);
    });
    return Object.entries(map)
      .filter(([,rows])=>rows.length>1)
      .map(([hash,rows])=>({
        hash,
        count:rows.length,
        rows:rows.sort((a,b)=>String(a.fileName).localeCompare(String(b.fileName))),
        autoResolved:true,
        resolved:true,
        resolution:resolvedFileHashes[hash]?"manual":"auto-same-content",
      }))
      .sort((a,b)=>b.count-a.count);
  },[loadedFileMeta,resolvedFileHashes,needDuplicateData]);

  const partTrendRows=useMemo(()=>{
    if(!needTrendData) return [];
    const pts=[...new Set(voters.map(v=>v.part_no))].sort((a,b)=>(+a||0)-(+b||0));
    const rows=pts.map(pt=>{
      const pv=voters.filter(v=>v.part_no===pt);
      const m=pv.filter(v=>effRel(v)==="Muslim");
      const h=pv.filter(v=>effRel(v)==="Hindu");
      const mA=m.filter(v=>v.status==="Under Adjudication").length;
      const hA=h.filter(v=>v.status==="Under Adjudication").length;
      const mN=m.length, hN=h.length;
      const mR=mN?mA/mN:0, hR=hN?hA/hN:0;
      const rd=mR-hR;
      const rr=(mN&&hN&&hR>0)?(mR/hR):null;
      const oddsRatio=(mA>0&&hA>0&&(mN-mA)>0&&(hN-hA)>0)?((mA*(hN-hA))/((mN-mA)*hA)):null;
      const seRD=Math.sqrt((mN?mR*(1-mR)/mN:0)+(hN?hR*(1-hR)/hN:0));
      const rdL=rd-1.96*seRD, rdU=rd+1.96*seRD;
      const chi=chi2test(mA,hA,mN-mA,hN-hA);
      const p=chiSquarePValueDf1(chi.chi2?+chi.chi2:null);
      return {
        part:pt,total:pv.length,mN,hN,mA,hA,
        mRate:+(mR*100).toFixed(2),hRate:+(hR*100).toFixed(2),
        diffPct:+(rd*100).toFixed(2),
        diffCI:`[${(rdL*100).toFixed(2)}%, ${(rdU*100).toFixed(2)}%]`,
        rr:rr===null?null:+rr.toFixed(3),
        or:oddsRatio===null?null:+oddsRatio.toFixed(3),
        chi2:chi.chi2?+chi.chi2:null,
        p,
      };
    });
    const q=bhAdjust(rows.map(r=>r.p));
    return rows.map((r,i)=>({...r,q:q[i],fdrSig:q[i]<0.05}));
  },[voters,overrides,effRel,needTrendData]);

  const customAnalyticsRows=useMemo(()=>{
    if(!needCustomAnalyticsData) return [];
    const groupVal=(v)=>{
      if(caGroupBy==="part_no") return v.part_no;
      if(caGroupBy==="ageGroup") return v.ageGroup;
      if(caGroupBy==="gender") return String(v.gender||"")[0]||"Unknown";
      if(caGroupBy==="status") return v.status;
      return effRel(v)||"Unknown";
    };
    const comparePass=(v)=>{
      if(caCompare==="all") return true;
      if(caCompare==="muslim") return effRel(v)==="Muslim";
      if(caCompare==="hindu") return effRel(v)==="Hindu";
      if(caCompare==="adj") return v.status==="Under Adjudication";
      if(caCompare==="deleted") return v.status==="Deleted";
      return true;
    };
    const g={};
    filtered.forEach(v=>{
      if(!comparePass(v)) return;
      const k=groupVal(v);
      if(!g[k]) g[k]={
        group:k,total:0,adj:0,del:0,active:0,m:0,h:0,u:0,male:0,female:0,other:0,
        mAdj:0,hAdj:0,uAdj:0,mDel:0,hDel:0,uDel:0,mActive:0,hActive:0,uActive:0,
        maleAdj:0,femaleAdj:0,otherAdj:0,maleDel:0,femaleDel:0,otherDel:0,maleActive:0,femaleActive:0,otherActive:0,
      };
      const rel=effRel(v);
      const isMale=String(v.gender||"").toUpperCase().startsWith("M");
      const isFemale=String(v.gender||"").toUpperCase().startsWith("F");
      g[k].total++;
      if(v.status==="Under Adjudication") g[k].adj++;
      else if(v.status==="Deleted") g[k].del++;
      else g[k].active++;
      if(rel==="Muslim") g[k].m++;
      else if(rel==="Hindu") g[k].h++;
      else g[k].u++;
      if(isMale) g[k].male++;
      else if(isFemale) g[k].female++;
      else g[k].other++;

      if(v.status==="Under Adjudication"){
        if(rel==="Muslim") g[k].mAdj++;
        else if(rel==="Hindu") g[k].hAdj++;
        else g[k].uAdj++;
        if(isMale) g[k].maleAdj++;
        else if(isFemale) g[k].femaleAdj++;
        else g[k].otherAdj++;
      }else if(v.status==="Deleted"){
        if(rel==="Muslim") g[k].mDel++;
        else if(rel==="Hindu") g[k].hDel++;
        else g[k].uDel++;
        if(isMale) g[k].maleDel++;
        else if(isFemale) g[k].femaleDel++;
        else g[k].otherDel++;
      }else{
        if(rel==="Muslim") g[k].mActive++;
        else if(rel==="Hindu") g[k].hActive++;
        else g[k].uActive++;
        if(isMale) g[k].maleActive++;
        else if(isFemale) g[k].femaleActive++;
        else g[k].otherActive++;
      }
    });
    const rows=Object.values(g).map(r=>({
      ...r,
      adj_rate:+(r.total?(r.adj/r.total*100):0).toFixed(2),
      del_rate:+(r.total?(r.del/r.total*100):0).toFixed(2),
      muslim_share:+(r.total?(r.m/r.total*100):0).toFixed(2),
      hindu_share:+(r.total?(r.h/r.total*100):0).toFixed(2),
    }));
    rows.sort((a,b)=>(+a.group||0)-(+b.group||0));
    return rows;
  },[filtered,caGroupBy,caCompare,caMetric,effRel,overrides,needCustomAnalyticsData]);

  // ── Core stats (on filtered set) ───────────────────────────────────────────
  // Booth voter list (must be top-level, not inside renderBooths)
  const activeBoothParts=useMemo(
    ()=>boothPartsSelected.filter(p=>parts.includes(p)),
    [boothPartsSelected,parts]
  );
  const boothVoters=useMemo(()=>{
    if(!activeBoothParts.length) return [];
    return voters.filter(v=>{
      if(!activeBoothParts.includes(v.part_no)) return false;
      if(boothRelFilter!=="all"&&(overrides[v._uid]||v.religion)!==boothRelFilter) return false;
      if(boothStatusFilter!=="all"&&v.status!==boothStatusFilter) return false;
      if(boothSearch){
        const s=boothSearch.toLowerCase();
        return v.name.toLowerCase().includes(s)||
               String(v.voter_id).toLowerCase().includes(s)||
               v.relation_name.toLowerCase().includes(s);
      }
      return true;
    }).sort((a,b)=>{
      let av=a[boothSort],bv=b[boothSort];
      if(typeof av==="string")av=av.toLowerCase();
      if(typeof bv==="string")bv=bv.toLowerCase();
      return boothSortD==="asc"?(av<bv?-1:av>bv?1:0):(av>bv?-1:av<bv?1:0);
    });
  },[activeBoothParts,boothSearch,boothRelFilter,boothStatusFilter,boothSort,boothSortD,voters,overrides]);

  const stats=useMemo(()=>{
    const adj=filtered.filter(v=>v.status==="Under Adjudication");
    const del=filtered.filter(v=>v.status==="Deleted");
    const mV=filtered.filter(v=>effRel(v)==="Muslim");
    const hV=filtered.filter(v=>effRel(v)==="Hindu");
    const mAdj=mV.filter(v=>v.status==="Under Adjudication").length;
    const hAdj=hV.filter(v=>v.status==="Under Adjudication").length;
    const mDel=mV.filter(v=>v.status==="Deleted").length;
    const hDel=hV.filter(v=>v.status==="Deleted").length;
    const mAR=mV.length>0?mAdj/mV.length:0;
    const hAR=hV.length>0?hAdj/hV.length:0;
    const mDR=mV.length>0?mDel/mV.length:0;
    const hDR=hV.length>0?hDel/hV.length:0;
    return {
      total:filtered.length, adj:adj.length, del:del.length,
      mV:mV.length, hV:hV.length,
      mAdj, hAdj, mDel, hDel,
      mAR, hAR, mDR, hDR,
      adjRatio:hAR>0?mAR/hAR:mAR>0?Infinity:null,
      delRatio:mDR>0?hDR/mDR:hDR>0?Infinity:null,
      chiAdj:chi2test(mAdj,hAdj,mV.length-mAdj,hV.length-hAdj),
      chiDel:chi2test(mDel,hDel,mV.length-mDel,hV.length-hDel),
    };
  },[filtered,overrides]);

  const anomalyRows=useMemo(()=>{
    const rows=[];
    if(filtered.length){
      const adjPct=+(stats.adj/Math.max(1,stats.total)*100).toFixed(2);
      if(adjPct>=15) rows.push({Severity:"High",Category:"Adjudication",Metric:"Overall adjudication rate",Value:`${adjPct}%`,Threshold:">=15%",Interpretation:"Unusually high overall adjudication"});
      if(stats.adjRatio!==null&&stats.adjRatio!==Infinity&&stats.adjRatio>=1.5)
        rows.push({Severity:stats.adjRatio>=3?"High":"Medium",Category:"Bias",Metric:"Muslim/Hindu adjudication ratio",Value:stats.adjRatio.toFixed(2),Threshold:">=1.5",Interpretation:"Potential religious targeting signal"});
      if(needsReview.length/Math.max(1,voters.length)>=0.05)
        rows.push({Severity:"Medium",Category:"Data quality",Metric:"Unknown+Uncertain share",Value:`${((needsReview.length/voters.length)*100).toFixed(2)}%`,Threshold:">=5%",Interpretation:"Classifier confidence is low for many records"});
      if(duplicateGroups.length>0)
        rows.push({Severity:duplicateGroups.length>=10?"High":"Medium",Category:"Duplicate rolls",Metric:"Duplicate groups",Value:String(duplicateGroups.length),Threshold:">0",Interpretation:"Potential duplicate voter entries across uploaded rolls"});
      if(fileDuplicateGroups.length>0)
        rows.push({Severity:fileDuplicateGroups.length>=3?"High":"Medium",Category:"Duplicate files",Metric:"Same-content file groups",Value:String(fileDuplicateGroups.length),Threshold:">0",Interpretation:"Uploaded files may contain repeated roll content"});
      const sm=voters.filter(v=>v.isSelfMapped);
      const smAdj=sm.filter(v=>v.status==="Under Adjudication");
      const smAdjPct=sm.length?smAdj.length/sm.length:0;
      if(smAdjPct>=0.10)
        rows.push({Severity:"Medium",Category:"Self-mapped cohort",Metric:"40–44 self-mapped adjudication",Value:`${(smAdjPct*100).toFixed(2)}%`,Threshold:">=10%",Interpretation:"Self-mapped voters show elevated adjudication"});
    }
    return rows;
  },[filtered,stats,needsReview,voters,duplicateGroups,fileDuplicateGroups]);

  const reindexImportedVoters=useCallback((rows)=>{
    return (rows||[]).map(v=>{
      const name=String(v.name||"").trim();
      const relation=String(v.relation_name||"").trim();
      const status=v.status||canonicalStatusFromStamp(v.stamp_type);
      const stamp_type=canonicalStampFromStatus(status);
      const manualRel=v._manualRel||overrides[v._uid]?String(overrides[v._uid]||v.religion||""):"";
      const inferred=classifierModel.classifyReligion(name,relation,effectiveScores);
      const finalRel=manualRel||v.religion||inferred.rel;
      return {
        ...v,
        name,
        relation_name:relation,
        status,
        stamp_type,
        ageGroup:getAgeGroup(v.age),
        isSelfMapped:isSelfMapped(v.age),
        duplicateKey:duplicateKeyOf({part_no:v.part_no,voter_id:v.voter_id,serial_no:v.serial_no,name}),
        religion:finalRel,
        relConf:v.relConf??inferred.conf,
        relVia:manualRel?"manual-restore":(v.relVia||inferred.via),
        _manualRel:!!manualRel,
      };
    });
  },[effectiveScores,overrides,classifierModel]);

  const exportSessionPack=useCallback(async()=>{
    if(!voters.length){
      window.alert("Load voter data first.");
      return;
    }
    const nowIso=new Date().toISOString();
    const payload={
      schemaVersion:"eimpack.v1",
      createdAt:nowIso,
      appVersion:"1.0",
      summary:{
        totalVoters:voters.length,
        parts:[...new Set(voters.map(v=>v.part_no))].length,
        acCoverage:[...new Set(voters.map(v=>`${v.ac_no||"?"}-${v.ac_name||"?"}`))],
        tokenLearnCount,
      },
      voters,
      overrides,
      tokenOverrides,
      loadedFiles,
      loadedFileMeta,
      chartPrefs,
      ui:{
        theme,
        filters:{gPart,gStatus,gRel,gAge,gGender,gSearch},
        tab,
      },
    };
    const safeDate=nowIso.slice(0,10);
    const baseName=sanitizeFileName(`Session_${safeDate}`);
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
    const a=document.createElement("a");
    a.download=`${baseName}.eimpack`;
    a.href=URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);

    // Companion XLSX for human-readable transfer.
    const XLSX=await loadXLSX();
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{
      schemaVersion:payload.schemaVersion,
      createdAt:payload.createdAt,
      appVersion:payload.appVersion,
      totalVoters:payload.summary.totalVoters,
      totalParts:payload.summary.parts,
      tokenLearnCount:payload.summary.tokenLearnCount||0,
      theme:payload.ui.theme,
      acCoverage:payload.summary.acCoverage.join("; "),
    }]),"Session_Metadata");
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(voters.map(v=>toExportRow({...v,override:overrides[v._uid]||null}))),"Session_Voters");
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(Object.entries(overrides).map(([uid,rel])=>({uid,religion:rel}))),"Overrides");
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(Object.entries(tokenOverrides).map(([token,score])=>({token,score}))),"Token_Overrides");
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(Object.values(loadedFileMeta||{}).map(m=>({
      fileName:m.fileName||"", rawHash:m.rawHash||"", semanticHash:m.semanticHash||"", rowCount:m.rowCount||"",
      acNo:m.acNo||"", acName:m.acName||"", importedAt:m.importedAt||"",
    }))),"Loaded_Files");
    XLSX.writeFile(wb,`${baseName}.xlsx`,{compression:true});
  },[voters,overrides,tokenOverrides,tokenLearnCount,loadedFiles,loadedFileMeta,chartPrefs,theme,gPart,gStatus,gRel,gAge,gGender,gSearch,tab]);

  const handleImportSessionFile=useCallback(async(file)=>{
    if(!file) return;
    try{
      const XLSX=await loadXLSX();
      let payload=null;
      const lower=String(file.name||"").toLowerCase();
      if(lower.endsWith(".xlsx")){
        const buf=await file.arrayBuffer();
        const wb=XLSX.read(buf,{type:"array"});
        const wsMeta=wb.Sheets["Session_Metadata"];
        const wsVoters=wb.Sheets["Session_Voters"];
        if(!wsVoters) throw new Error("Session_Voters sheet missing.");
        const metaRows=wsMeta?XLSX.utils.sheet_to_json(wsMeta,{defval:""}):[];
        const voterRows=XLSX.utils.sheet_to_json(wsVoters,{defval:""});
        payload={
          schemaVersion:(metaRows[0]?.schemaVersion||"eimpack.v1"),
          createdAt:metaRows[0]?.createdAt||new Date().toISOString(),
          appVersion:metaRows[0]?.appVersion||"1.0",
          tokenLearnCount:Number(metaRows[0]?.tokenLearnCount||0),
          voters:voterRows.map(r=>({
            ac_no:r["AC No"]||r.ac_no||"",
            ac_name:r["AC Name"]||r.ac_name||"",
            part_no:String(r["Part Number"]||r.part_no||r.Part||""),
            serial_no:String(r["Serial No"]||r.serial_no||r.Serial||""),
            voter_id:String(r["Voter ID"]||r.voter_id||""),
            name:String(r.Name||r.name||""),
            relation_name:String(r["Relation Name"]||r.relation_name||""),
            age:String(r.Age??r.age??""),
            gender:String(r.Gender||r.gender||""),
            status:String(r.Status||r.status||"Active"),
            stamp_type:canonicalStampFromStatus(String(r.Status||r.status||"Active")),
            religion:String(r["Religion (Final)"]||r.religion||r["Religion (Auto)"]||"Unknown"),
            relConf:r["Confidence %"]?Number(r["Confidence %"])/100:0,
            relVia:String(r.Via||r.relVia||"import"),
            _uid:String(r._uid||uid()),
          })),
          overrides:{},
          tokenOverrides:{},
          loadedFiles:{},
          loadedFileMeta:{},
          chartPrefs:{},
          ui:{},
        };
      }else{
        const txt=await file.text();
        payload=JSON.parse(txt);
      }

      if(!payload || payload.schemaVersion!=="eimpack.v1") throw new Error("Unsupported or invalid session schema.");
      const incomingVoters=Array.isArray(payload.voters)?payload.voters:[];
      const summary=`Records: ${incomingVoters.length.toLocaleString()} | Parts: ${new Set(incomingVoters.map(v=>v.part_no)).size} | Overrides: ${Object.keys(payload.overrides||{}).length}`;
      const mode=window.confirm(`Import session summary\n${summary}\n\nOK = Replace current session\nCancel = Merge into current session`)?"replace":"merge";
      const indexedIncoming=reindexImportedVoters(incomingVoters.map(v=>({
        ...v,
        _uid:v._uid||uid(),
      })));

      if(mode==="replace"){
        setVoters(indexedIncoming);
        setOverrides(payload.overrides||{});
        setTokenOverrides(payload.tokenOverrides||{});
        setTokenLearnCount(Number(payload.tokenLearnCount||payload.summary?.tokenLearnCount||0));
        setLoadedFiles(payload.loadedFiles||{});
        setLoadedFileMeta(payload.loadedFileMeta||{});
        if(payload.chartPrefs) setChartPrefs(prev=>({...prev,...payload.chartPrefs}));
        if(payload.ui?.theme==="dark"||payload.ui?.theme==="light") setTheme(payload.ui.theme);
      }else{
        setVoters(prev=>reindexImportedVoters([...prev,...indexedIncoming]));
        setOverrides(prev=>({...prev,...(payload.overrides||{})}));
        setTokenOverrides(prev=>({...prev,...(payload.tokenOverrides||{})}));
        setTokenLearnCount(prev=>prev+Number(payload.tokenLearnCount||payload.summary?.tokenLearnCount||0));
        setLoadedFiles(prev=>({...prev,...(payload.loadedFiles||{})}));
        setLoadedFileMeta(prev=>({...prev,...(payload.loadedFileMeta||{})}));
        if(payload.chartPrefs) setChartPrefs(prev=>({...prev,...payload.chartPrefs}));
      }
      window.alert("Session import complete.");
    }catch(err){
      window.alert(`Session import failed: ${err?.message||"unknown error"}`);
    }
  },[reindexImportedVoters]);

  const exportReportPack=useCallback(async()=>{
    if(!voters.length){
      window.alert("Load voter data first.");
      return;
    }
    setReportBusy(true);
    try{
      const XLSX=await loadXLSX();
      const wb=XLSX.utils.book_new();
      const votersFinal=voters.map(v=>({...v,override:overrides[v._uid]||null}));
      const eff=(v)=>v.override||v.religion;
      const acPairs=[...new Map(voters.map(v=>[
        `${String(v.ac_no||"").trim()}|${String(v.ac_name||"").trim()}`,
        { acNo:String(v.ac_no||"").trim(), acName:String(v.ac_name||"").trim() },
      ])).values()].filter(x=>x.acNo||x.acName);
      const acPrimary=acPairs[0]||{acNo:"",acName:""};
      const acCoverage=acPairs.map(x=>`${x.acNo||"?"} - ${x.acName||"?"}`).join("; ");
      const partCount=new Set(voters.map(v=>String(v.part_no||"").trim()).filter(Boolean)).size;
      const overview=[{
        "Generated At": new Date().toISOString(),
        "AC No": acPrimary.acNo,
        "AC Name": acPrimary.acName,
        "Part Count": partCount,
        "AC Coverage": acCoverage||"",
        "Total Voters": stats.total,
        "Active": stats.total-stats.adj-stats.del,
        "Under Adjudication": stats.adj,
        "Deleted": stats.del,
        "Muslim Voters": stats.mV,
        "Hindu Voters": stats.hV,
        "Muslim Adj Rate": `${(stats.mAR*100).toFixed(2)}%`,
        "Hindu Adj Rate": `${(stats.hAR*100).toFixed(2)}%`,
        "Adj Bias Ratio (M/H)": stats.adjRatio===null?"NA":(stats.adjRatio===Infinity?"Infinity":stats.adjRatio.toFixed(2)),
        "Chi2 Adj": stats.chiAdj?.chi2||"",
        "Chi2 Adj Significance": stats.chiAdj?.label||"",
        "Review Needed": needsReview.length,
        "Duplicate Groups": duplicateGroups.length,
        "Duplicate File Groups": fileDuplicateGroups.length,
      }];
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(overview),"Overview");
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(buildSummaryRows(votersFinal)),"Part_Summary");
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(anomalyRows.length?anomalyRows:[{Severity:"Info",Category:"Anomaly",Metric:"No major anomaly triggered",Value:"-",Threshold:"-",Interpretation:"Review manually"}]),"Anomalies");

      const relCats=["Muslim","Hindu","Uncertain","Unknown"];
      const religionRows=relCats.map(r=>{
        const rv=votersFinal.filter(v=>eff(v)===r);
        const adj=rv.filter(v=>v.status==="Under Adjudication").length;
        const del=rv.filter(v=>v.status==="Deleted").length;
        return {
          Religion:r,
          Total:rv.length,
          Active:rv.filter(v=>v.status==="Active").length,
          "Under Adjudication":adj,
          "Adj %":rv.length?`${(adj/rv.length*100).toFixed(2)}%`:"0.00%",
          Deleted:del,
          "Del %":rv.length?`${(del/rv.length*100).toFixed(2)}%`:"0.00%",
        };
      });
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(religionRows),"Religion_Crosstab");

      const ageBuckets=["18–22","23–30","31–39","40–44★","45–60","60+","Unknown"];
      const ageRows=ageBuckets.map(ag=>{
        const av=votersFinal.filter(v=>v.ageGroup===ag);
        const a=av.filter(v=>v.status==="Under Adjudication").length;
        const d=av.filter(v=>v.status==="Deleted").length;
        return {
          "Age Group":ag,
          Total:av.length,
          Active:av.filter(v=>v.status==="Active").length,
          "Under Adjudication":a,
          Deleted:d,
          "Adj %":av.length?`${(a/av.length*100).toFixed(2)}%`:"0.00%",
          "Del %":av.length?`${(d/av.length*100).toFixed(2)}%`:"0.00%",
          "Self-mapped in bucket":av.filter(v=>v.isSelfMapped).length,
        };
      });
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(ageRows),"Age_Cohorts");

      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(partTrendRows.map(r=>({
        Part:r.part, Total:r.total,
        "Muslim Adj %":r.mRate, "Hindu Adj %":r.hRate,
        "Risk Diff %":r.diffPct, "Risk Diff CI":r.diffCI,
        RR:r.rr??"", OR:r.or??"", "Chi2":r.chi2??"", p:r.p??"", q:r.q??"",
        "FDR Sig":r.fdrSig?"Yes":"No",
      }))),"Part_Trends");

      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(customAnalyticsRows.map(r=>({
        Group:r.group, Total:r.total, Active:r.active, "Under Adjudication":r.adj, Deleted:r.del,
        "Adj Rate %":r.adj_rate, "Del Rate %":r.del_rate, "Muslim Share %":r.muslim_share, "Hindu Share %":r.hindu_share,
      }))),"Custom_Analytics");

      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(needsReview.map(v=>({
        "AC No":v.ac_no||"", "AC Name":v.ac_name||"", "Part Number":v.part_no, "Serial":v.serial_no, "Voter ID":v.voter_id,
        Name:v.name, "Relation Name":v.relation_name, Age:v.age, Gender:v.gender, Status:v.status,
        "Religion (Auto)":v.religion, "Confidence %":v.relConf?Math.round(v.relConf*100):"", "Via":v.relVia||"",
      }))),"Review_Queue");

      const dupRows=duplicateGroups.flatMap(g=>g.rows.map(v=>({
        "Duplicate Group": g.key,
        "Group Size": g.count,
        "AC No": v.ac_no||"",
        "AC Name": v.ac_name||"",
        "Part Number": v.part_no,
        "Part": v.part_no,
        "Voter ID": v.voter_id,
        "Serial": v.serial_no,
        "Name": v.name,
        "Age": v.age,
        "Gender": v.gender,
        "Status": v.status,
        "Religion": overrides[v._uid]||v.religion,
        "Source File": v.sourceFile||"",
      })));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(dupRows.length?dupRows:[{"Duplicate Group":"None","Group Size":0}]),"Duplicates");
      const dupFiles=fileDuplicateGroups.flatMap(g=>g.rows.map(r=>({
        "Content Hash":g.hash,
        "Group Size":g.count,
        "File":r.fileName,
        "Rows":r.rowCount||"",
        "Size(bytes)":r.size||"",
        "Imported At":r.importedAt||"",
      })));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(dupFiles.length?dupFiles:[{"Content Hash":"None","Group Size":0}]),"File_Duplicates");
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(votersFinal.map(v=>toExportRow(v))),"All_Voters");

      const chartCatalog=EXPORT_REGISTRY
        .filter(x=>x.kind==="chart")
        .map(x=>({
          Tab:x.tabId, Container:x.containerId, Title:x.title||"", Subtitle:x.subtitle||"",
          Type:x.chartType||"Chart", Legend:chartPrefs.showLegend?"On":"Off",
          XAxis:chartPrefs.xAxisLabel||"", YAxis:chartPrefs.yAxisLabel||"",
        }));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(chartCatalog),"Chart_Catalog");

      const previousTab=tab;
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const manifestRows=[];
      const captures=EXPORT_REGISTRY.filter(x=>x.kind==="chart"||x.kind==="table");
      const pages=EXPORT_REGISTRY.filter(x=>x.kind==="page");
      for(const p of captures){
        if(tab!==p.tabId){ setTab(p.tabId); await wait(320); }
        if(!document.getElementById(p.containerId)){
          manifestRows.push({
            Type:p.kind, Tab:p.tabId, Container:p.containerId, File:`${p.filename}.png`,
            Status:"missing", Message:"container not found",
          });
          continue;
        }
        try{
          await exportChartGraphic({
            containerId:p.containerId,
            filename:p.filename,
            format:"png",
            scale:2,
            background:normalizeHexColor(C.bg,"#ffffff"),
            title:p.title||"",
            subtitle:`AC ${acPrimary.acNo||"-"} · ${acPrimary.acName||"-"}`,
            note:p.kind==="table"?"Table Export":`Chart Type: ${p.chartType||"Chart"}`,
            includeTimestamp:true,
          });
          manifestRows.push({
            Type:p.kind, Tab:p.tabId, Container:p.containerId, File:`${p.filename}.png`,
            Status:"ok", Message:"",
          });
        }catch(e){
          manifestRows.push({
            Type:p.kind, Tab:p.tabId, Container:p.containerId, File:`${p.filename}.png`,
            Status:"failed", Message:e?.message||"capture failed",
          });
        }
      }
      for(const p of pages){
        if(tab!==p.tabId){ setTab(p.tabId); await wait(320); }
        if(!document.getElementById(p.containerId)){
          manifestRows.push({
            Type:"page", Tab:p.tabId, Container:p.containerId, File:`${p.filename}.png`,
            Status:"missing", Message:"container not found",
          });
          continue;
        }
        try{
          await exportChartGraphic({
            containerId:p.containerId,
            filename:p.filename,
            format:"png",
            scale:2,
            background:normalizeHexColor(C.bg,"#ffffff"),
            title:p.title||`${p.tabId[0].toUpperCase()+p.tabId.slice(1)} Page Snapshot`,
            subtitle:`AC ${acPrimary.acNo||"-"} · ${acPrimary.acName||"-"}`,
            includeTimestamp:true,
          });
          manifestRows.push({
            Type:"page", Tab:p.tabId, Container:p.containerId, File:`${p.filename}.png`,
            Status:"ok", Message:"",
          });
        }catch(e){
          manifestRows.push({
            Type:"page", Tab:p.tabId, Container:p.containerId, File:`${p.filename}.png`,
            Status:"failed", Message:e?.message||"capture failed",
          });
        }
      }
      setTab(previousTab);
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(manifestRows.length?manifestRows:[{Status:"none"}]),"Export_Manifest");
      XLSX.writeFile(wb,sanitizeFileName(`Publication_Report_${new Date().toISOString().slice(0,10)}.xlsx`),{compression:true});
      const misses=manifestRows.filter(r=>r.Status!=="ok");
      if(misses.length){
        window.alert(`Report pack exported with partial capture warnings.\nCheck Export_Manifest sheet for details.`);
      }

      const html=`
      <html><head><title>Electoral Roll Analysis Report</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.45}h1,h2{margin:0 0 8px}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #cbd5e1;padding:6px;font-size:12px;text-align:left}th{background:#f1f5f9}.warn{color:#b91c1c;font-weight:bold}</style>
      </head><body>
      <h1>Electoral Roll Anomaly Assessment</h1>
      <div>Generated: ${new Date().toLocaleString()}</div>
      <div>AC Coverage: ${acCoverage||"Not available"}</div>
      <div>Part Count: ${partCount}</div>
      <h2>Executive Summary</h2>
      <ul>
        <li>Total voters analyzed: <b>${stats.total.toLocaleString()}</b></li>
        <li>Under adjudication: <b>${stats.adj}</b> (${pct(stats.adj,stats.total)})</li>
        <li>Deletion count: <b>${stats.del}</b> (${pct(stats.del,stats.total)})</li>
        <li>Adjudication bias ratio (Muslim/Hindu): <b>${stats.adjRatio===null?"NA":stats.adjRatio===Infinity?"Infinity":stats.adjRatio.toFixed(2)}</b></li>
        <li>Records requiring manual review: <b>${needsReview.length}</b></li>
        <li>Duplicate roll groups detected: <b>${duplicateGroups.length}</b></li>
        <li>Duplicate file-content groups detected: <b>${fileDuplicateGroups.length}</b></li>
      </ul>
      <h2>Flagged Indicators</h2>
      <table><thead><tr><th>Severity</th><th>Category</th><th>Metric</th><th>Value</th><th>Threshold</th><th>Interpretation</th></tr></thead>
      <tbody>${(anomalyRows.length?anomalyRows:[{Severity:"Info",Category:"Anomaly",Metric:"No major anomaly triggered",Value:"-",Threshold:"-",Interpretation:"Review manually"}]).map(r=>`<tr><td class="${r.Severity==="High"?"warn":""}">${r.Severity}</td><td>${r.Category}</td><td>${r.Metric}</td><td>${r.Value}</td><td>${r.Threshold}</td><td>${r.Interpretation}</td></tr>`).join("")}</tbody></table>
      <p style="margin-top:14px">Attach the generated Excel workbook and PNG charts as annexures for court/media-ready submissions.</p>
      </body></html>`;
      const w=window.open("","_blank","noopener,noreferrer");
      if(w){
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(()=>w.print(),250);
      }
    }finally{
      setReportBusy(false);
    }
  },[voters,stats,needsReview,duplicateGroups,fileDuplicateGroups,anomalyRows,overrides,partTrendRows,customAnalyticsRows,chartPrefs,tab]);

  const generateLocalAiBrief=useCallback(async()=>{
    if(!voters.length){ window.alert("Load voter data first."); return; }
    setAiLoading(true);
    try{
      const prompt=`You are preparing a professional, neutral public-interest analysis note on potential electoral-roll anomalies.\n`+
        `Write in formal report style with sections: Executive Summary, Methods, Findings, Statistical Strength, Caveats, Recommended Next Steps.\n`+
        `Avoid definitive legal conclusions; use cautious language.\n\n`+
        `Data summary:\n`+
        `- Total voters: ${stats.total}\n`+
        `- Under adjudication: ${stats.adj} (${pct(stats.adj,stats.total)})\n`+
        `- Deleted: ${stats.del} (${pct(stats.del,stats.total)})\n`+
        `- Muslim adj rate: ${(stats.mAR*100).toFixed(2)}%\n`+
        `- Hindu adj rate: ${(stats.hAR*100).toFixed(2)}%\n`+
        `- Adj ratio (M/H): ${stats.adjRatio===null?"NA":(stats.adjRatio===Infinity?"Infinity":stats.adjRatio.toFixed(2))}\n`+
        `- Chi-square adjudication: ${stats.chiAdj?.chi2||"NA"} (${stats.chiAdj?.label||"NA"})\n`+
        `- Review needed (Unknown+Uncertain): ${needsReview.length}\n`+
        `- Duplicate row groups: ${duplicateGroups.length}\n`+
        `- Duplicate file groups (same content hash): ${fileDuplicateGroups.length}\n\n`+
        `Flagged anomalies:\n${(anomalyRows.length?anomalyRows:[{Severity:"Info",Category:"Anomaly",Metric:"No major anomaly triggered",Value:"-",Threshold:"-",Interpretation:"Manual review advised"}]).map(r=>`- [${r.Severity}] ${r.Category}: ${r.Metric} = ${r.Value} (threshold ${r.Threshold}); ${r.Interpretation}`).join("\n")}\n`;

      const resp=await fetch(localAiEndpoint,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:localAiModel,prompt,stream:false}),
      });
      if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data=await resp.json();
      const text=data?.response||data?.output||JSON.stringify(data,null,2);
      setAiBrief(String(text||""));
    }catch(err){
      window.alert(`Local AI request failed: ${err?.message||"unknown error"}\nCheck endpoint/model (e.g. Ollama at http://localhost:11434).`);
    }finally{
      setAiLoading(false);
    }
  },[voters,stats,needsReview,duplicateGroups,fileDuplicateGroups,anomalyRows,localAiEndpoint,localAiModel]);

  const openChartExport=useCallback((cfg)=>{
    const el=cfg?.containerId?document.getElementById(cfg.containerId):null;
    const measured=measureExportBox(el,1200,520);
    const autoWidth=Math.max(420,measured.width);
    const autoHeight=Math.max(260,measured.height);
    const reg=EXPORT_REGISTRY.find(r=>r.containerId===cfg?.containerId);
    const acNo=voters[0]?.ac_no||"-";
    const acName=voters[0]?.ac_name||"-";
    const chartType=cfg?.chartType||reg?.chartType||"Chart";
    const acNote=`AC ${acNo} · ${acName}`;
    setChartExportModal({
      ...cfg,
      format:"png",
      width:autoWidth,
      height:autoHeight,
      scale:2,
      background:normalizeHexColor(C.bg,"#ffffff"),
      headerAlign:cfg?.headerAlign||"left",
      title:cfg?.title||reg?.title||"",
      subtitle:cfg?.subtitle||reg?.subtitle||"",
      note:cfg?.note||`Chart Type: ${chartType} · ${acNote}`,
      includeTimestamp:true,
    });
  },[voters]);

  const openTableExport=useCallback((cfg)=>{
    const el=cfg?.containerId?document.getElementById(cfg.containerId):null;
    const tableEl=el?.querySelector?.("table");
    const measured=measureExportBox(el,1200,520);
    const autoWidth=Math.max(
      520,
      measured.width,
      Math.round(tableEl?.scrollWidth||0),
      Math.round(tableEl?.getBoundingClientRect?.().width||0),
    );
    const autoHeight=Math.max(
      220,
      measured.height,
      Math.round(tableEl?.scrollHeight||0),
      Math.round(tableEl?.getBoundingClientRect?.().height||0),
    );
    const reg=EXPORT_REGISTRY.find(r=>r.containerId===cfg?.containerId);
    const acNo=voters[0]?.ac_no||"-";
    const acName=voters[0]?.ac_name||"-";
    setTableExportModal({
      ...cfg,
      format:"png",
      width:autoWidth,
      height:autoHeight,
      scale:2,
      background:normalizeHexColor(C.bg,"#ffffff"),
      title:cfg?.title||reg?.title||"Table Export",
      subtitle:cfg?.subtitle||reg?.subtitle||"",
      note:cfg?.note||`Tabular export · AC ${acNo} · ${acName}`,
      includeTimestamp:true,
      borderMode:cfg?.borderMode||"auto",
      sheetName:cfg?.sheetName||reg?.title||"Data",
    });
  },[voters]);

  const runChartExport=useCallback(async()=>{
    if(!chartExportModal) return;
    const cfg=chartExportModal;
    try{
      if(cfg.format==="csv"){
        exportRowsCsv(cfg.rows||[],cfg.filename||"chart_data");
      }else{
        await exportChartGraphic({
          containerId:cfg.containerId,
          filename:cfg.filename||"chart",
          format:cfg.format||"png",
          width:+cfg.width||1400,
          height:+cfg.height||800,
          scale:+cfg.scale||2,
          background:normalizeHexColor(cfg.background,normalizeHexColor(C.bg,"#ffffff")),
          title:cfg.title||"",
          subtitle:cfg.subtitle||"",
          note:cfg.note||"",
          includeTimestamp:!!cfg.includeTimestamp,
          headerAlign:cfg.headerAlign||"left",
        });
      }
      setChartExportModal(null);
    }catch(err){
      window.alert(`Export failed: ${err?.message||"unknown error"}`);
    }
  },[chartExportModal]);

  const runTableExport=useCallback(async()=>{
    if(!tableExportModal) return;
    const cfg=tableExportModal;
    try{
      if(cfg.format==="csv"){
        exportRowsCsv(cfg.rows||[],cfg.filename||"table_data");
      }else if(cfg.format==="xlsx"){
        exportXLSX(cfg.rows||[],cfg.filename||"table_data",cfg.sheetName||"Data");
      }else{
        await exportTableGraphic({
          containerId:cfg.containerId,
          filename:cfg.filename||"table_export",
          format:cfg.format||"png",
          width:+cfg.width||1200,
          height:+cfg.height||800,
          scale:+cfg.scale||2,
          background:normalizeHexColor(cfg.background,normalizeHexColor(C.bg,"#ffffff")),
          title:cfg.title||"",
          subtitle:cfg.subtitle||"",
          note:cfg.note||"",
          includeTimestamp:!!cfg.includeTimestamp,
          borderMode:cfg.borderMode||"auto",
        });
      }
      setTableExportModal(null);
    }catch(err){
      window.alert(`Export failed: ${err?.message||"unknown error"}`);
    }
  },[tableExportModal]);

  const chartColor=useMemo(()=>({
    Active:normalizeHexColor(chartPrefs.activeColor,C.active),
    UnderAdj:normalizeHexColor(chartPrefs.underAdjColor,C.adj),
    Deleted:normalizeHexColor(chartPrefs.deletedColor,C.del),
    Muslim:normalizeHexColor(chartPrefs.muslimColor,C.Muslim),
    Hindu:normalizeHexColor(chartPrefs.hinduColor,C.Hindu),
  }),[chartPrefs,theme]);

  const labelPos=chartPrefs.valueLabelPos==="inside"?"insideTop":(chartPrefs.valueLabelPos==="right"?"right":"top");

  // ── TAB: OVERVIEW ───────────────────────────────────────────────────────────
  const renderOverview=()=>{
    const relBarData=["Muslim","Hindu","Uncertain"].map(r=>{
      const rv=filtered.filter(v=>effRel(v)===r);
      const adj=rv.filter(v=>v.status==="Under Adjudication").length;
      const del=rv.filter(v=>v.status==="Deleted").length;
      return{name:r,
        Active:rv.filter(v=>v.status==="Active").length,
        "Under Adj":adj,
        Deleted:del,
        "Adj%":rv.length>0?+(adj/rv.length*100).toFixed(1):0,
        total:rv.length,
      };
    });
    const adjPie=["Muslim","Hindu","Uncertain","Unknown"].map(r=>({
      name:r,value:filtered.filter(v=>v.status==="Under Adjudication"&&effRel(v)===r).length
    })).filter(d=>d.value>0);
    const sm=stats;

    // Diverging bar — adjudication rate comparison
    const divData=[
      {name:"Muslim",value:+(sm.mAR*100).toFixed(1),fill:C.Muslim},
      {name:"Hindu", value:+(sm.hAR*100).toFixed(1),fill:C.Hindu},
    ];

    return(
      <div style={{display:"flex",flexDirection:"column",gap:18}}>
        {/* KPI row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>
          <StatCard label="Total Voters" value={sm.total.toLocaleString()} sub={`${parts.length} part(s) loaded`} color={C.blue}/>
          <StatCard label="Under Adjudication" value={sm.adj} sub={pct(sm.adj,sm.total)+" of total"} color={C.adj}/>
          <StatCard label="Deleted" value={sm.del} sub={pct(sm.del,sm.total)+" of total"} color={C.del}/>
          <StatCard label="Muslim Adj Rate" value={pct(sm.mAdj,sm.mV)} sub={`${sm.mAdj}/${sm.mV} voters`} color={C.Muslim}/>
          <StatCard label="Hindu Adj Rate" value={pct(sm.hAdj,sm.hV)} sub={`${sm.hAdj}/${sm.hV} voters`} color={C.Hindu}/>
          <StatCard label="Bias Ratio" value={ratioStr(sm.mAR,sm.hAR)} sub="Muslim÷Hindu adj rate" color={sm.adjRatio>2?C.adj:C.green}/>
        </div>

        {/* Bias assessment + adj rate comparison */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16}}>
          <Panel>
            <SH onExport={()=>openChartExport({containerId:"chartBias",filename:"bias_assessment",rows:[
              {metric:"Adjudication",muslim_rate_pct:+(sm.mAR*100).toFixed(2),hindu_rate_pct:+(sm.hAR*100).toFixed(2),ratio:sm.adjRatio},
              {metric:"Deletion",muslim_rate_pct:+(sm.mDR*100).toFixed(2),hindu_rate_pct:+(sm.hDR*100).toFixed(2),ratio:sm.delRatio},
            ]})}>Bias Assessment</SH>
            <div id="chartBias">
            {[
              {label:"Adjudication",mR:sm.mAR*100,hR:sm.hAR*100,biasR:sm.adjRatio,chi:sm.chiAdj},
              {label:"Deletion",mR:sm.mDR*100,hR:sm.hDR*100,biasR:sm.delRatio,chi:sm.chiDel},
            ].map(({label,mR,hR,biasR,chi})=>(
              <div key={label} style={{marginBottom:12,padding:12,background:C.bg,
                borderRadius:8,border:`1px solid ${C.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:13,color:C.text,fontWeight:600}}>{label}</span>
                  <div style={{display:"flex",gap:6}}>
                    <BiasBadge r={biasR}/>
                    <Tag c={chi.label} color={chi.sig?C.adj:C.dim}/>
                    {chi.chi2&&<Tag c={`χ²=${chi.chi2}`} color={C.dim}/>}
                  </div>
                </div>
                {/* Stacked rate bars */}
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {[{label:"Muslim",val:mR,color:C.Muslim,n:sm.mV},{label:"Hindu",val:hR,color:C.Hindu,n:sm.hV}].map(({label:rl,val,color,n})=>(
                    <div key={rl}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}>
                        <span style={{color}}>{rl}</span>
                        <span style={{color:C.text,fontWeight:700,fontFamily:MONO}}>{val.toFixed(2)}%</span>
                      </div>
                      <div style={{height:10,borderRadius:3,background:C.border+"44",overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${Math.min(val/Math.max(mR,hR,0.1)*100,100)}%`,
                          background:color,borderRadius:3,transition:"width 0.4s"}}/>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:6,fontSize:11,color:C.dim,textAlign:"right"}}>
                  Ratio: <span style={{color:biasR>2?C.adj:C.text,fontWeight:700}}>{ratioStr(mR,hR)}</span>
                </div>
              </div>
            ))}
            </div>
          </Panel>

          {/* Adjudication pie */}
          <Panel>
            <SH onExport={()=>openChartExport({
              containerId:"chartAdjPieBlock",
              filename:"adj_religion_pie",
              rows:adjPie,
              title:"Under Adjudication by Religion",
              subtitle:"Donut chart with category distribution",
              chartType:"Donut/Pie",
              note:"Legend: category and count",
            })}>
              Under Adjudication — by Religion
            </SH>
            <div id="chartAdjPieBlock">
              <div id="chartAdjPie">
                <ResizableChartFrame height={200}>
                  <PieChart>
                    <Pie data={adjPie} cx="50%" cy="50%" outerRadius={78} innerRadius={32}
                      isAnimationActive={false}
                      dataKey="value" paddingAngle={2}
                      label={({name,value,percent})=>`${name[0]}: ${value} (${(percent*100).toFixed(0)}%)`}
                      labelLine={false} fontSize={11}>
                      {adjPie.map((e,i)=><Cell key={i} fill={C[e.name]||"#6b7280"}/>)}
                    </Pie>
                    <Tooltip {...TT} formatter={(v,n)=>[v+" voters",n]}/>
                  </PieChart>
                </ResizableChartFrame>
              </div>
              {/* Legend */}
              <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap",marginTop:4}}>
                {adjPie.map(e=>(
                  <div key={e.name} style={{display:"flex",gap:4,alignItems:"center"}}>
                    <div style={{width:10,height:10,borderRadius:2,background:C[e.name]||C.dim}}/>
                    <span style={{fontSize:11,color:C.muted}}>{e.name}: {e.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>

        {/* Status by religion — grouped bars with value labels */}
        <Panel>
          <SH onExport={()=>openChartExport({containerId:"chartRelStatus",filename:"status_by_religion",rows:relBarData,title:"Status by Religion",subtitle:"Count of voters in each status category by religion"})}
            sub="Count of voters in each status category, by religion">
            Status by Religion
          </SH>
          <div id="chartRelStatus" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:16}}>
            <div>
              <div style={{fontSize:11,color:C.dim,marginBottom:6,textAlign:"center"}}>Voter Counts</div>
              <ResizableChartFrame height={220}>
                <BarChart data={relBarData} margin={{top:20,right:10,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                  <XAxis dataKey="name" tick={{fill:C.muted,fontSize:12}}
                    label={chartPrefs.xAxisLabel?{value:chartPrefs.xAxisLabel,position:"insideBottom",offset:-6,fill:C.dim,fontSize:11}:undefined}/>
                  <YAxis tick={{fill:C.muted,fontSize:11}}
                    label={chartPrefs.yAxisLabel?{value:chartPrefs.yAxisLabel,angle:-90,position:"insideLeft",fill:C.dim,fontSize:11}:undefined}/>
                  <Tooltip {...TT}/>
                  {chartPrefs.showLegend&&<Legend iconSize={10} wrapperStyle={{fontSize:11}}/>}
                  <Bar dataKey="Active" fill={chartColor.Active} radius={[3,3,0,0]} isAnimationActive={false}>
                    {chartPrefs.showValueLabels&&<LabelList dataKey="Active" position={labelPos} style={{fill:C.dim,fontSize:10}}/>}
                  </Bar>
                  <Bar dataKey="Under Adj" fill={chartColor.UnderAdj} radius={[3,3,0,0]} isAnimationActive={false}>
                    {chartPrefs.showValueLabels&&<LabelList dataKey="Under Adj" position={labelPos} style={{fill:chartColor.UnderAdj,fontSize:10,fontWeight:700}}/>}
                  </Bar>
                  <Bar dataKey="Deleted" fill={chartColor.Deleted} radius={[3,3,0,0]} isAnimationActive={false}>
                    {chartPrefs.showValueLabels&&<LabelList dataKey="Deleted" position={labelPos} style={{fill:chartColor.Deleted,fontSize:10}}/>}
                  </Bar>
                </BarChart>
              </ResizableChartFrame>
            </div>
            <div>
              <div style={{fontSize:11,color:C.dim,marginBottom:6,textAlign:"center"}}>Adjudication Rate %</div>
              <ResizableChartFrame height={220}>
                <BarChart data={relBarData} layout="vertical" margin={{top:5,right:60,left:10,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                  <XAxis type="number" unit="%" tick={{fill:C.muted,fontSize:11}} domain={[0,"auto"]}/>
                  <YAxis type="category" dataKey="name" tick={{fill:C.muted,fontSize:13}} width={70}/>
                  <Tooltip {...TT} formatter={v=>[v+"%","Adj Rate"]}/>
                  <Bar dataKey="Adj%" name="Adj%" fill={chartColor.UnderAdj} radius={[0,4,4,0]} isAnimationActive={false}>
                    {chartPrefs.showValueLabels&&<LabelList dataKey="Adj%" position="right"
                      formatter={v=>v+"%"}
                      style={{fill:chartColor.UnderAdj,fontSize:12,fontWeight:700}}/>}
                  </Bar>
                </BarChart>
              </ResizableChartFrame>
            </div>
          </div>
        </Panel>

        {/* Relative impact — diverging comparison */}
        <Panel>
          <SH onExport={()=>openChartExport({containerId:"chartDiverg",filename:"adjudication_comparison",rows:relBarData,title:"Voter Status Composition by Religion",subtitle:"Stacked composition by religion"})}
            sub="Stacked bar showing composition of each religion's voter pool">
            Voter Status Composition by Religion
          </SH>
          <div id="chartDiverg">
            <ResizableChartFrame height={160}>
              <BarChart data={relBarData.filter(r=>r.total>0)} layout="vertical"
                margin={{top:5,right:30,left:10,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                <XAxis type="number" tick={{fill:C.muted,fontSize:10}} unit=" voters"/>
                <YAxis type="category" dataKey="name" tick={{fill:C.muted,fontSize:13}} width={70}/>
                <Tooltip {...TT}/>
                {chartPrefs.showLegend&&<Legend iconSize={10} wrapperStyle={{fontSize:11}}/>}
                <Bar dataKey="Active" stackId="s" fill={chartColor.Active} isAnimationActive={false}/>
                <Bar dataKey="Under Adj" stackId="s" fill={chartColor.UnderAdj} isAnimationActive={false}>
                  {chartPrefs.showValueLabels&&<LabelList dataKey="Under Adj" position="insideRight"
                    style={{fill:"#fff",fontSize:11,fontWeight:700}}/>}
                </Bar>
                <Bar dataKey="Deleted" stackId="s" fill={chartColor.Deleted} radius={[0,3,3,0]} isAnimationActive={false}/>
              </BarChart>
            </ResizableChartFrame>
          </div>
        </Panel>
      </div>
    );
  };

  // ── TAB: RELIGION ───────────────────────────────────────────────────────────
  const renderReligion=()=>{
    const rows=["Muslim","Hindu","Uncertain","Unknown"].map(r=>{
      const rv=filtered.filter(v=>effRel(v)===r);
      const a=rv.filter(v=>v.status==="Under Adjudication").length;
      const d=rv.filter(v=>v.status==="Deleted").length;
      const sm=rv.filter(v=>v.isSelfMapped).length;
      const smA=rv.filter(v=>v.isSelfMapped&&v.status==="Under Adjudication").length;
      return{r,tot:rv.length,a,d,sm,smA,
        adjR:rv.length>0?+(a/rv.length*100).toFixed(2):0,
        delR:rv.length>0?+(d/rv.length*100).toFixed(2):0};
    }).filter(x=>x.tot>0);
    const {mV,hV,mAdj,hAdj,mDel,hDel,chiAdj,chiDel,adjRatio,delRatio}=stats;
    const adjBarData=rows.map(r=>({name:r.r, "Adj%":r.adjR, "Del%":r.delR, total:r.tot, adj:r.a}));
    if(!canRenderHeavyCharts){
      return renderCompactViewportNotice("Religion charts are paused on this screen size.","Load charts only when needed, or use Voters / Booths first.");
    }
    return(
      <div style={{display:"flex",flexDirection:"column",gap:18}}>
        <Panel>
          <SH onExport={()=>openTableExport({
            containerId:"tblReligionCrosstab",
            filename:"religion_status_crosstab",
            title:"Religion x Status Cross-tabulation",
            subtitle:"Counts and rates by religion",
            note:`AC ${voters[0]?.ac_no||"-"} · ${voters[0]?.ac_name||"-"}`,
            background:normalizeHexColor(C.bg,"#ffffff"),
            sheetName:"Religion_Status",
            rows:rows.map(({r,tot,a,d,sm,smA,adjR,delR})=>({
              Religion:r,
              Total:tot,
              Active:tot-a-d,
              "Under Adj":a,
              "Adj%":adjR,
              Deleted:d,
              "Del%":delR,
              "Self-mapped":sm,
              "Self-mapped Adj":smA,
            })),
          })}>
            Religion × Status Cross-tabulation
          </SH>
          <div id="tblReligionCrosstab" style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:500,fontSize:12}}>
              <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                {["Religion","Total","Active","Under Adj","Adj%","Deleted","Del%","Self-mapped","Self-mapped Adj"].map(h=>(
                  <th key={h} style={{padding:"7px 10px",textAlign:h==="Religion"?"left":"right",
                    color:C.dim,fontSize:10,fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map(({r,tot,a,d,sm,smA,adjR,delR})=>(
                  <tr key={r} style={{borderBottom:`1px solid ${C.border}22`}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.bg}
                    onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <td style={{padding:"9px 10px",fontWeight:700,color:C[r]||C.text}}>{r}</td>
                    <td style={{padding:"9px 10px",textAlign:"right",color:C.muted}}>{tot.toLocaleString()}</td>
                    <td style={{padding:"9px 10px",textAlign:"right",color:C.blue}}>{(tot-a-d).toLocaleString()}</td>
                    <td style={{padding:"9px 10px",textAlign:"right",color:C.adj,fontWeight:a>0?700:400}}>{a}</td>
                    <td style={{padding:"9px 10px",textAlign:"right"}}>
                      <span style={{color:adjR>10?C.adj:C.muted,fontWeight:adjR>5?700:400}}>{adjR}%</span>
                    </td>
                    <td style={{padding:"9px 10px",textAlign:"right",color:C.del}}>{d}</td>
                    <td style={{padding:"9px 10px",textAlign:"right",color:"#fda4af"}}>{delR}%</td>
                    <td style={{padding:"9px 10px",textAlign:"right",color:C.muted}}>{sm}</td>
                    <td style={{padding:"9px 10px",textAlign:"right",color:"#67e8f9"}}>{smA}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16}}>
          <Panel>
            <SH>Statistical Significance (χ²)</SH>
            {[
              {label:"Under Adjudication: Muslim vs Hindu",
               a:mAdj,b:hAdj,c:mV-mAdj,d:hV-hAdj,chi:chiAdj,biasR:adjRatio},
              {label:"Deletion: Hindu vs Muslim",
               a:mDel,b:hDel,c:mV-mDel,d:hV-hDel,chi:chiDel,biasR:delRatio},
            ].map(({label,a,b,c,d,chi,biasR})=>(
              <div key={label} style={{marginBottom:12,padding:12,background:C.bg,
                borderRadius:8,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:12,color:C.text,fontWeight:600,marginBottom:7}}>{label}</div>
                <pre style={{fontSize:11,color:C.dim,margin:"0 0 7px",fontFamily:MONO,lineHeight:1.6}}>
                  {`Muslim: ${a} adj / ${a+c} total\nHindu:  ${b} adj / ${b+d} total`}
                </pre>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <BiasBadge r={biasR}/>
                  <Tag c={chi.label} color={chi.sig?C.adj:C.dim}/>
                  {chi.chi2&&<Tag c={`χ²=${chi.chi2}`} color={C.dim}/>}
                </div>
              </div>
            ))}
          </Panel>

          <Panel>
            <SH onExport={()=>openChartExport({containerId:"chartAdjRate",filename:"adj_del_rate_by_religion",rows:adjBarData,title:"Rates by Religion",subtitle:"Adjudication and deletion rates by religion"})}
              sub="Horizontal bars — adjudication and deletion rates">
              Rates by Religion
            </SH>
            <div id="chartAdjRate">
              <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Adjudication Rate %</div>
              <ResizableChartFrame height={130}>
                <BarChart data={adjBarData} layout="vertical" margin={{top:4,right:70,left:10,bottom:4}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                  <XAxis type="number" unit="%" tick={{fill:C.muted,fontSize:10}} domain={[0,"auto"]}/>
                  <YAxis type="category" dataKey="name" tick={{fill:C.muted,fontSize:12}} width={70}/>
                  <Tooltip {...TT} formatter={v=>[v+"%","Adj%"]}/>
                  <Bar dataKey="Adj%" fill={chartColor.UnderAdj} radius={[0,4,4,0]} isAnimationActive={false}>
                    {chartPrefs.showValueLabels&&<LabelList dataKey="Adj%" position="right"
                      formatter={v=>v+"%"}
                      style={{fill:chartColor.UnderAdj,fontSize:12,fontWeight:800}}/>}
                  </Bar>
                </BarChart>
              </ResizableChartFrame>
              <div style={{fontSize:11,color:C.dim,marginTop:10,marginBottom:4}}>Deletion Rate %</div>
              <ResizableChartFrame height={130}>
                <BarChart data={adjBarData} layout="vertical" margin={{top:4,right:70,left:10,bottom:4}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                  <XAxis type="number" unit="%" tick={{fill:C.muted,fontSize:10}} domain={[0,"auto"]}/>
                  <YAxis type="category" dataKey="name" tick={{fill:C.muted,fontSize:12}} width={70}/>
                  <Tooltip {...TT} formatter={v=>[v+"%","Del%"]}/>
                  <Bar dataKey="Del%" fill={chartColor.Deleted} radius={[0,4,4,0]} isAnimationActive={false}>
                    {chartPrefs.showValueLabels&&<LabelList dataKey="Del%" position="right"
                      formatter={v=>v+"%"}
                      style={{fill:chartColor.Deleted,fontSize:12,fontWeight:800}}/>}
                  </Bar>
                </BarChart>
              </ResizableChartFrame>
            </div>
          </Panel>
        </div>

        {/* Head-to-head comparison card */}
        <Panel>
          <SH onExport={()=>openChartExport({containerId:"chartH2H",filename:"adjudication_head_to_head",rows:[
            {metric:"Adj Rate %",Muslim:+(stats.mAR*100).toFixed(2),Hindu:+(stats.hAR*100).toFixed(2)},
            {metric:"Share of Adj'd",Muslim:stats.mV>0?+(stats.mAdj/(stats.adj||1)*100).toFixed(1):0,Hindu:stats.hV>0?+(stats.hAdj/(stats.adj||1)*100).toFixed(1):0},
          ],title:"Muslim vs Hindu: Under Adjudication",subtitle:"Head-to-head grouped comparison"})}
            sub="Muslim adjudication rate vs Hindu — grouped comparison">
            Muslim vs Hindu: Under Adjudication — Head to Head
          </SH>
          <div id="chartH2H">
            <ResizableChartFrame height={180}>
              <BarChart
                data={[{name:"Adj Rate %", Muslim:+(stats.mAR*100).toFixed(2), Hindu:+(stats.hAR*100).toFixed(2)},
                       {name:"Share of Adj'd", Muslim:stats.mV>0?+(stats.mAdj/(stats.adj||1)*100).toFixed(1):0,
                         Hindu:stats.hV>0?+(stats.hAdj/(stats.adj||1)*100).toFixed(1):0}]}
                margin={{top:24,right:20,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                <XAxis dataKey="name" tick={{fill:C.muted,fontSize:12}}/>
                <YAxis unit="%" tick={{fill:C.muted,fontSize:11}}/>
                <Tooltip {...TT} formatter={v=>[v+"%"]}/>
                {chartPrefs.showLegend&&<Legend iconSize={10} wrapperStyle={{fontSize:11}}/>}
                <Bar dataKey="Muslim" fill={chartColor.Muslim} radius={[4,4,0,0]} isAnimationActive={false}>
                  {chartPrefs.showValueLabels&&<LabelList dataKey="Muslim" position={labelPos} style={{fill:chartColor.Muslim,fontSize:12,fontWeight:800}} formatter={v=>v+"%"}/>}
                </Bar>
                <Bar dataKey="Hindu" fill={chartColor.Hindu} radius={[4,4,0,0]} isAnimationActive={false}>
                  {chartPrefs.showValueLabels&&<LabelList dataKey="Hindu" position={labelPos} style={{fill:chartColor.Hindu,fontSize:12,fontWeight:800}} formatter={v=>v+"%"}/>}
                </Bar>
              </BarChart>
            </ResizableChartFrame>
          </div>
        </Panel>
      </div>
    );
  };

  // ── TAB: AGE ─────────────────────────────────────────────────────────────────
  const renderAge=()=>{
    const ageData=["18–22","23–30","31–39","40–44★","45–60","60+"].map(ag=>{
      const agV=filtered.filter(v=>v.ageGroup===ag);
      const agM=agV.filter(v=>effRel(v)==="Muslim");
      const agH=agV.filter(v=>effRel(v)==="Hindu");
      const mA=agM.filter(v=>v.status==="Under Adjudication").length;
      const hA=agH.filter(v=>v.status==="Under Adjudication").length;
      const mAR=agM.length>0?mA/agM.length:0;
      const hAR=agH.length>0?hA/agH.length:0;
      const c=chi2test(mA,hA,agM.length-mA,agH.length-hA);
      return{
        ag:ag.replace("★"," ★"),
        total:agV.length,
        Active:agV.filter(v=>v.status==="Active").length,
        "Under Adj":agV.filter(v=>v.status==="Under Adjudication").length,
        Deleted:agV.filter(v=>v.status==="Deleted").length,
        mTotal:agM.length, hTotal:agH.length,
        mAdj:mA, hAdj:hA,
        mAdjPct:+(mAR*100).toFixed(2), hAdjPct:+(hAR*100).toFixed(2),
        biasR:hAR>0?+(mAR/hAR).toFixed(2):null, chi:c,
        isSM:ag.includes("★"),
      };
    });
    const overallAdjPct=filtered.length
      ? +((filtered.filter(v=>v.status==="Under Adjudication").length/filtered.length)*100).toFixed(2)
      : 0;
    if(!canRenderHeavyCharts){
      return renderCompactViewportNotice("Age-cohort charts are paused on this screen size.");
    }
    return(
      <div style={{display:"flex",flexDirection:"column",gap:18}}>
        <Panel>
          <SH onExport={()=>openChartExport({
            containerId:"chartAgeStatus",
            filename:"age_group_status",
            rows:ageData,
            title:"Age Group x Status",
            subtitle:"Status distribution by age cohort",
            chartType:"Grouped bars",
          })} sub="★ = Self-mapped cohort: were 18–20 in 2002, now 40–44. Should carry forward without re-adjudication per ECI norms.">
            Age Group × Status
          </SH>
          <div id="chartAgeStatus">
            <ResizableChartFrame height={210}>
              <BarChart data={ageData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                <XAxis dataKey="ag" tick={{fill:C.muted,fontSize:10}} angle={-10} textAnchor="end" height={44}/>
                <YAxis tick={{fill:C.muted,fontSize:11}}/>
                <Tooltip {...TT}/><Legend iconSize={10} wrapperStyle={{fontSize:11}}/>
                <Bar dataKey="Active" fill={C.active} radius={[3,3,0,0]}/>
                <Bar dataKey="Under Adj" fill={C.adj} radius={[3,3,0,0]}/>
                <Bar dataKey="Deleted" fill={C.del} radius={[3,3,0,0]}/>
              </BarChart>
            </ResizableChartFrame>
          </div>
        </Panel>
        <Panel>
          <SH onExport={()=>openTableExport({
            containerId:"tblAgeReligionAdj",
            filename:"age_religion_adjudication_table",
            title:"Age x Religion x Adjudication Rate",
            subtitle:"Detailed age-cohort analysis",
            background:normalizeHexColor(C.bg,"#ffffff"),
            sheetName:"Age_Religion_Adj",
            rows:ageData.map(row=>({
              "Age Group":row.ag,
              Total:row.total,
              "Under Adj":row["Under Adj"],
              "Muslim Adj%":row.mAdjPct,
              "Hindu Adj%":row.hAdjPct,
              "Bias Ratio":row.biasR ?? "",
              Significance:row.chi?.label||"",
            })),
          })}>
            Age × Religion × Adjudication Rate
          </SH>
          <div id="tblAgeReligionAdj" style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:500,fontSize:12}}>
              <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                {["Age Group","Total","Under Adj","Muslim Adj%","Hindu Adj%","Bias Ratio","Significance"].map(h=>(
                  <th key={h} style={{padding:"7px 10px",textAlign:h==="Age Group"?"left":"right",
                    color:C.dim,fontSize:10,fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {ageData.map(row=>(
                  <tr key={row.ag} style={{borderBottom:`1px solid ${C.border}22`,
                    background:row.isSM?"#0891b211":""}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.bg}
                    onMouseLeave={e=>e.currentTarget.style.background=row.isSM?"#0891b211":""}>
                    <td style={{padding:"8px 10px",color:row.isSM?C.blue:C.text,fontWeight:600}}>{row.ag}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:C.muted}}>{row.total}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:C.adj,fontWeight:row["Under Adj"]>0?700:400}}>{row["Under Adj"]}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:"#86efac"}}>{row.mAdjPct}% ({row.mAdj}/{row.mTotal})</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:"#fca5a5"}}>{row.hAdjPct}% ({row.hAdj}/{row.hTotal})</td>
                    <td style={{padding:"8px 10px",textAlign:"right"}}><BiasBadge r={row.biasR}/></td>
                    <td style={{padding:"8px 10px",textAlign:"right"}}>
                      {row.chi.chi2?<Tag c={`${row.chi.label} χ²=${row.chi.chi2}`} color={row.chi.sig?C.red:C.dim}/>
                        :<span style={{color:C.dim,fontSize:11}}>{row.chi.label}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel>
          <SH onExport={()=>openChartExport({
            containerId:"chartAgeTrend",
            filename:"age_cohort_trend",
            rows:ageData,
            title:"Muslim vs Hindu Adjudication % by Age Group",
            subtitle:"Age-cohort trend lines",
            chartType:"Line chart",
          })}>Muslim vs Hindu Adjudication % by Age Group</SH>
          <div id="chartAgeTrend">
          <ResizableChartFrame height={190}>
            <LineChart data={ageData} margin={{top:10,right:20,left:4,bottom:6}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="ag" tick={{fill:C.muted,fontSize:10}} angle={-10} textAnchor="end" height={44}/>
              <YAxis unit="%" tick={{fill:C.muted,fontSize:11}}/>
              <Tooltip {...TT} formatter={(v)=>[`${v}%`,`Adj Rate`]}/>
              <Legend iconSize={10} wrapperStyle={{fontSize:11}}/>
              <ReferenceLine y={overallAdjPct} stroke={C.dim} strokeDasharray="4 4"
                label={{value:`Overall ${overallAdjPct}%`,fill:C.dim,fontSize:10,position:"insideTopRight"}}/>
              <Line type="monotone" dataKey="mAdjPct" name="Muslim Adj%" stroke={C.Muslim}
                strokeWidth={2.5} dot={{r:3,fill:C.Muslim}} activeDot={{r:5}}>
                <LabelList dataKey="mAdjPct" position="top" formatter={(v)=>`${v}%`}
                  style={{fill:C.Muslim,fontSize:10,fontWeight:700}}/>
              </Line>
              <Line type="monotone" dataKey="hAdjPct" name="Hindu Adj%" stroke={C.Hindu}
                strokeWidth={2.5} dot={{r:3,fill:C.Hindu}} activeDot={{r:5}}>
                <LabelList dataKey="hAdjPct" position="bottom" formatter={(v)=>`${v}%`}
                  style={{fill:C.Hindu,fontSize:10,fontWeight:700}}/>
              </Line>
            </LineChart>
          </ResizableChartFrame>
          </div>
        </Panel>
      </div>
    );
  };

  const renderCustomAnalytics=()=>{
    if(!canRenderHeavyCharts){
      return renderCompactViewportNotice("Custom analytics charts are paused on this screen size.","This builder is chart-heavy. Load charts explicitly when you want to explore it on mobile.");
    }
    const metricKey=caMetric;
    const pctTotal=(n,d)=>d?+((n/d)*100).toFixed(2):0;
    const baseData=customAnalyticsRows.map(r=>({
      group:r.group,
      value:r[metricKey]??0,
      total:r.total,
      adj:r.adj,
      del:r.del,
      active:r.active,
      m:r.m,
      h:r.h,
      u:r.u||0,
      male:r.male||0,
      female:r.female||0,
      other:r.other||0,
      mAdj:r.mAdj||0,
      hAdj:r.hAdj||0,
      uAdj:r.uAdj||0,
      mDel:r.mDel||0,
      hDel:r.hDel||0,
      uDel:r.uDel||0,
      mActive:r.mActive||0,
      hActive:r.hActive||0,
      uActive:r.uActive||0,
      maleAdj:r.maleAdj||0,
      femaleAdj:r.femaleAdj||0,
      otherAdj:r.otherAdj||0,
      maleDel:r.maleDel||0,
      femaleDel:r.femaleDel||0,
      otherDel:r.otherDel||0,
      maleActive:r.maleActive||0,
      femaleActive:r.femaleActive||0,
      otherActive:r.otherActive||0,
    }));
    const unsupportedStackCombo=
      (["muslim_share","hindu_share"].includes(caMetric) && caStackBy==="gender");
    const effectiveChartMode=(caMode!=="grouped" && unsupportedStackCombo) ? "grouped" : caMode;
    const stackedData=baseData.map(r=>{
      let keys={};
      if(caMetric==="total"){
        if(caStackBy==="religion"){
          keys={Muslim:r.m||0,Hindu:r.h||0,Uncertain:r.u||0};
        }else if(caStackBy==="gender"){
          keys={Male:r.male||0,Female:r.female||0,Other:r.other||0};
        }else{
          keys={Active:r.active||0,"Under Adj":r.adj||0,Deleted:r.del||0};
        }
      }else if(caMetric==="adj_rate"){
        if(caStackBy==="religion"){
          keys={Muslim:pctTotal(r.mAdj,r.total),Hindu:pctTotal(r.hAdj,r.total),Uncertain:pctTotal(r.uAdj,r.total)};
        }else if(caStackBy==="gender"){
          keys={Male:pctTotal(r.maleAdj,r.total),Female:pctTotal(r.femaleAdj,r.total),Other:pctTotal(r.otherAdj,r.total)};
        }else{
          keys={Active:0,"Under Adj":pctTotal(r.adj,r.total),Deleted:0};
        }
      }else if(caMetric==="del_rate"){
        if(caStackBy==="religion"){
          keys={Muslim:pctTotal(r.mDel,r.total),Hindu:pctTotal(r.hDel,r.total),Uncertain:pctTotal(r.uDel,r.total)};
        }else if(caStackBy==="gender"){
          keys={Male:pctTotal(r.maleDel,r.total),Female:pctTotal(r.femaleDel,r.total),Other:pctTotal(r.otherDel,r.total)};
        }else{
          keys={Active:0,"Under Adj":0,Deleted:pctTotal(r.del,r.total)};
        }
      }else if(caMetric==="muslim_share"){
        if(caStackBy==="religion"){
          keys={Muslim:pctTotal(r.m,r.total),Hindu:pctTotal(r.h,r.total),Uncertain:pctTotal(r.u,r.total)};
        }else{
          keys={Active:pctTotal(r.mActive,r.total),"Under Adj":pctTotal(r.mAdj,r.total),Deleted:pctTotal(r.mDel,r.total)};
        }
      }else if(caMetric==="hindu_share"){
        if(caStackBy==="religion"){
          keys={Muslim:pctTotal(r.m,r.total),Hindu:pctTotal(r.h,r.total),Uncertain:pctTotal(r.u,r.total)};
        }else{
          keys={Active:pctTotal(r.hActive,r.total),"Under Adj":pctTotal(r.hAdj,r.total),Deleted:pctTotal(r.hDel,r.total)};
        }
      }
      if(effectiveChartMode==="stacked100"){
        const denom=Math.max(1,Object.values(keys).reduce((s,n)=>s+(Number(n)||0),0));
        Object.keys(keys).forEach(k=>{ keys[k]=+(((Number(keys[k])||0)/denom)*100).toFixed(2); });
      }
      return {...r,...keys};
    });
    const metricLabel={
      adj_rate:"Adjudication Rate %",
      del_rate:"Deletion Rate %",
      total:"Total Voters",
      muslim_share:"Muslim Share %",
      hindu_share:"Hindu Share %",
    }[caMetric]||caMetric;
    const stackKeys=caStackBy==="religion"
      ?["Muslim","Hindu","Uncertain"]
      :caStackBy==="gender"
        ?["Male","Female","Other"]
        :["Active","Under Adj","Deleted"];
    const stackColors={
      Active:chartColor.Active,
      "Under Adj":chartColor.UnderAdj,
      Deleted:chartColor.Deleted,
      Muslim:chartColor.Muslim,
      Hindu:chartColor.Hindu,
      Uncertain:C.Uncertain,
      Male:C.blue,
      Female:C.Hindu,
      Other:C.dim,
    };
    const stackLabels=(()=>{
      if(caMetric==="total"){
        if(caStackBy==="religion") return {Muslim:"Muslim voters",Hindu:"Hindu voters",Uncertain:"Uncertain voters"};
        if(caStackBy==="gender") return {Male:"Male voters",Female:"Female voters",Other:"Other-gender voters"};
        return {Active:"Active voters","Under Adj":"Under adjudication",Deleted:"Deleted voters"};
      }
      if(caMetric==="adj_rate"){
        if(caStackBy==="religion") return {Muslim:"Muslim contribution to adj %",Hindu:"Hindu contribution to adj %",Uncertain:"Uncertain contribution to adj %"};
        if(caStackBy==="gender") return {Male:"Male contribution to adj %",Female:"Female contribution to adj %",Other:"Other contribution to adj %"};
        return {Active:"Active share","Under Adj":"Under adjudication rate",Deleted:"Deleted share"};
      }
      if(caMetric==="del_rate"){
        if(caStackBy==="religion") return {Muslim:"Muslim contribution to del %",Hindu:"Hindu contribution to del %",Uncertain:"Uncertain contribution to del %"};
        if(caStackBy==="gender") return {Male:"Male contribution to del %",Female:"Female contribution to del %",Other:"Other contribution to del %"};
        return {Active:"Active share","Under Adj":"Under adjudication share",Deleted:"Deletion rate"};
      }
      if(caMetric==="muslim_share"){
        if(caStackBy==="religion") return {Muslim:"Muslim share",Hindu:"Non-Muslim Hindu share",Uncertain:"Non-Muslim uncertain share"};
        return {Active:"Muslim active share","Under Adj":"Muslim UA share",Deleted:"Muslim deleted share"};
      }
      if(caMetric==="hindu_share"){
        if(caStackBy==="religion") return {Muslim:"Non-Hindu Muslim share",Hindu:"Hindu share",Uncertain:"Non-Hindu uncertain share"};
        return {Active:"Hindu active share","Under Adj":"Hindu UA share",Deleted:"Hindu deleted share"};
      }
      return {};
    })();
    const isPercentMetric=["adj_rate","del_rate","muslim_share","hindu_share"].includes(caMetric);
    const preferReadableLongMode=
      caGroupBy==="part_no" ||
      baseData.length>12 ||
      (isPercentMetric && baseData.length>8);
    const groupedLongMode=effectiveChartMode==="grouped" && preferReadableLongMode;
    const stackedLongMode=effectiveChartMode!=="grouped" && (
      caGroupBy==="part_no" ||
      stackedData.length>10 ||
      isPercentMetric
    );
    const metricMax=Math.max(0,...baseData.map(r=>Number(r.value)||0));
    const groupedDomain=isPercentMetric
      ? [0,Math.max(10,Math.min(100,Math.ceil(metricMax*1.25)))]
      : [0,Math.max(5,Math.ceil(metricMax*1.15))];
    const groupedChartHeight=Math.max(chartH(customAnalyticsBaseHeight-20),Math.round(baseData.length*30*chartScale)+50);
    const stackedCanvasWidth=Math.max(900,(effectiveChartMode==="stacked100"?60:52)*Math.max(1,stackedData.length));
    const stackedChartHeight=Math.max(chartH(customAnalyticsBaseHeight),Math.round(stackedData.length*32*chartScale)+56);
    const stackedMax=Math.max(0,...stackedData.map(r=>stackKeys.reduce((s,k)=>s+(Number(r[k])||0),0)));
    const stackedDomain=effectiveChartMode==="stacked100"
      ? [0,100]
      : isPercentMetric
        ? [0,Math.max(5,Math.min(100,Math.ceil(stackedMax*1.25)))]
        : [0,Math.max(5,Math.ceil(stackedMax*1.15))];
    const formatMetricValue=(v)=>{
      const num=Number(v)||0;
      return isPercentMetric ? `${num.toFixed(2)}%` : num.toLocaleString();
    };
    const metricTooltipFormatter=(v)=>[formatMetricValue(v),metricLabel];
    const stackedExplanation=effectiveChartMode==="grouped" ? "" : (
      effectiveChartMode==="stacked100"
        ? `Each bar is normalized to 100%. Segments show the relative composition of ${metricLabel.toLowerCase()} by ${caStackBy}.`
        : `Each bar shows absolute contributions to ${metricLabel.toLowerCase()} within each ${caGroupBy==="part_no"?"part":caGroupBy}. Segments are split by ${caStackBy}.`
    );
    if(!canRenderHeavyCharts){
      return(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>
            <StatCard label="Total Voters" value={sm.total.toLocaleString()} sub={`${parts.length} part(s) loaded`} color={C.blue}/>
            <StatCard label="Under Adjudication" value={sm.adj} sub={pct(sm.adj,sm.total)+" of total"} color={C.adj}/>
            <StatCard label="Deleted" value={sm.del} sub={pct(sm.del,sm.total)+" of total"} color={C.del}/>
            <StatCard label="Muslim Adj Rate" value={pct(sm.mAdj,sm.mV)} sub={`${sm.mAdj}/${sm.mV} voters`} color={C.Muslim}/>
            <StatCard label="Hindu Adj Rate" value={pct(sm.hAdj,sm.hV)} sub={`${sm.hAdj}/${sm.hV} voters`} color={C.Hindu}/>
            <StatCard label="Bias Ratio" value={ratioStr(sm.mAR,sm.hAR)} sub="Muslim÷Hindu adj rate" color={sm.adjRatio>2?C.adj:C.green}/>
          </div>
          {renderCompactViewportNotice("Overview charts are paused on this screen size.")}
        </div>
      );
    }
    return(
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <Panel>
          <SH sub={
            unsupportedStackCombo
              ?"Selected metric/stack pair is not supported for stacked view - showing grouped bars instead."
              : groupedLongMode
                ?"Large group count detected - using readable horizontal layout"
                : stackedLongMode
                  ?"Large group count detected - using readable horizontal stacked layout"
                  :"Switch group / metric / mode to explore the filtered dataset"
          }>
            Custom Analytics Builder
          </SH>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
            <select value={caGroupBy} onChange={e=>setCaGroupBy(e.target.value)}
              style={{padding:"6px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}}>
              <option value="part_no">Group by Part</option>
              <option value="ageGroup">Group by Age Group</option>
              <option value="gender">Group by Gender</option>
              <option value="status">Group by Status</option>
              <option value="religion">Group by Religion</option>
            </select>
            <select value={caMetric} onChange={e=>setCaMetric(e.target.value)}
              style={{padding:"6px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}}>
              <option value="adj_rate">Adjudication Rate %</option>
              <option value="del_rate">Deletion Rate %</option>
              <option value="total">Total Voters</option>
              <option value="muslim_share">Muslim Share %</option>
              <option value="hindu_share">Hindu Share %</option>
            </select>
            <select value={caCompare} onChange={e=>setCaCompare(e.target.value)}
              style={{padding:"6px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}}>
              <option value="all">Filter: All</option>
              <option value="muslim">Filter: Muslim only</option>
              <option value="hindu">Filter: Hindu only</option>
              <option value="adj">Filter: Under Adjudication</option>
              <option value="deleted">Filter: Deleted</option>
            </select>
            <select value={caMode} onChange={e=>setCaMode(e.target.value)}
              style={{padding:"6px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}}>
              <option value="grouped">Mode: Grouped</option>
              <option value="stacked">Mode: Stacked</option>
              <option value="stacked100">Mode: 100% Stacked</option>
            </select>
            {(caMode==="stacked"||caMode==="stacked100")&&(
              <select value={caStackBy} onChange={e=>setCaStackBy(e.target.value)}
                style={{padding:"6px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}}>
                <option value="status">Stack by Status</option>
                <option value="religion">Stack by Religion</option>
                <option value="gender">Stack by Gender</option>
              </select>
            )}
            <button onClick={()=>openChartExport({
              containerId:"chartCustomAnalytics",
              filename:`custom_${caGroupBy}_${caMetric}_${effectiveChartMode}`,
              rows:effectiveChartMode==="grouped"?baseData:stackedData,
              chartType:effectiveChartMode==="grouped"?"Grouped bar":(effectiveChartMode==="stacked"?"Stacked bar":"100% stacked bar"),
              note:`Mode: ${effectiveChartMode} · Stack: ${effectiveChartMode==="grouped"?"N/A":caStackBy}${unsupportedStackCombo?" · Fallback from unsupported stack pair":""}`,
            })}
              style={{padding:"6px 12px",background:C.blue+"22",border:`1px solid ${C.blue}44`,borderRadius:6,color:C.blue,fontSize:12,cursor:"pointer"}}>
              Export Chart
            </button>
          </div>
          <div id="chartCustomAnalytics">
            {effectiveChartMode==="grouped" ? (
              <div style={{height:groupedLongMode?Math.max(chartH(customAnalyticsBaseHeight+120),groupedChartHeight+24):chartH(customAnalyticsBaseHeight+20),resize:"vertical",overflowY:groupedLongMode?"auto":"hidden",overflowX:"hidden",
                border:`1px solid ${C.border}`,borderRadius:10,padding:groupedLongMode?12:0}}>
                <div style={{height:groupedLongMode?groupedChartHeight:chartH(customAnalyticsBaseHeight)}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={baseData}
                      layout={groupedLongMode?"vertical":"horizontal"}
                      margin={groupedLongMode?{top:8,right:30,left:10,bottom:8}:{top:20,right:20,left:0,bottom:60}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                      {groupedLongMode ? (
                        <>
                          <XAxis type="number" tick={{fill:C.muted,fontSize:10}}
                            domain={groupedDomain}
                            tickFormatter={v=>isPercentMetric?`${v}%`:v}/>
                          <YAxis type="category" dataKey="group" width={90} tick={{fill:C.muted,fontSize:11}}/>
                          <Tooltip {...TT} formatter={metricTooltipFormatter}/>
                          {chartPrefs.showLegend&&<Legend iconSize={10} wrapperStyle={{fontSize:11}}/>}
                          <Bar dataKey="value" name={metricLabel} fill={C.blue} radius={[0,4,4,0]} maxBarSize={18} isAnimationActive={false}>
                            {chartPrefs.showValueLabels&&<LabelList dataKey="value" position="right" formatter={formatMetricValue} style={{fill:C.blue,fontSize:10,fontWeight:700}}/>}
                          </Bar>
                        </>
                      ) : (
                        <>
                          <XAxis dataKey="group" tick={{fill:C.muted,fontSize:10}} angle={-30} textAnchor="end" interval={0}/>
                          <YAxis tick={{fill:C.muted,fontSize:11}} domain={groupedDomain} tickFormatter={v=>isPercentMetric?`${v}%`:v}/>
                          <Tooltip {...TT} formatter={metricTooltipFormatter}/>
                          {chartPrefs.showLegend&&<Legend iconSize={10} wrapperStyle={{fontSize:11}}/>}
                          <Bar dataKey="value" name={metricLabel} fill={C.blue} radius={[4,4,0,0]} isAnimationActive={false}>
                            {chartPrefs.showValueLabels&&<LabelList dataKey="value" position="top" formatter={formatMetricValue} style={{fill:C.dim,fontSize:10}}/>}
                          </Bar>
                        </>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div style={{resize:"vertical",overflowX:stackedLongMode?"hidden":"auto",overflowY:stackedLongMode?"auto":"hidden",paddingBottom:4,border:`1px solid ${C.border}`,borderRadius:10,padding:stackedLongMode?12:0}}>
                <div style={{width:stackedLongMode?"100%":stackedCanvasWidth,height:stackedLongMode?stackedChartHeight:chartH(customAnalyticsBaseHeight)}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stackedData} layout={stackedLongMode?"vertical":"horizontal"} margin={stackedLongMode?{top:8,right:30,left:10,bottom:8}:{top:20,right:20,left:0,bottom:60}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                      {stackedLongMode ? (
                        <>
                          <XAxis type="number" tick={{fill:C.muted,fontSize:10}} domain={stackedDomain} tickFormatter={v=>isPercentMetric?`${v}%`:v}/>
                          <YAxis type="category" dataKey="group" width={90} tick={{fill:C.muted,fontSize:11}}/>
                        </>
                      ) : (
                        <>
                          <XAxis dataKey="group" tick={{fill:C.muted,fontSize:10}} angle={-30} textAnchor="end" interval={0}/>
                          <YAxis tick={{fill:C.muted,fontSize:11}} domain={stackedDomain} tickFormatter={v=>isPercentMetric?`${v}%`:v}/>
                        </>
                      )}
                      <Tooltip {...TT} formatter={(v,n)=>[effectiveChartMode==="stacked100"?`${v}%`:formatMetricValue(v),stackLabels[n]||n]}/>
                      {chartPrefs.showLegend&&<Legend iconSize={10} wrapperStyle={{fontSize:11}}/>}
                      {stackKeys.map((k,idx)=>(
                        <Bar key={k} dataKey={k} stackId="s" name={stackLabels[k]||k} minPointSize={3} maxBarSize={18} fill={stackColors[k]||C.blue} radius={idx===stackKeys.length-1?(stackedLongMode?[0,4,4,0]:[4,4,0,0]):undefined} isAnimationActive={false}>
                          {chartPrefs.showValueLabels&&<LabelList dataKey={k} position={effectiveChartMode==="stacked100"?(stackedLongMode?"insideRight":"insideTop"):(stackedLongMode?"right":"top")} formatter={v=>effectiveChartMode==="stacked100"?`${v}%`:formatMetricValue(v)} style={{fill:C.dim,fontSize:10}}/>}
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
          {stackedExplanation&&(
            <div style={{marginTop:8,fontSize:11,color:C.dim,lineHeight:1.5}}>
              {stackedExplanation}
            </div>
          )}
        </Panel>
        <Panel>
          <SH sub={`${customAnalyticsRows.length} groups`}
            onExport={()=>openTableExport({
              containerId:"tblCustomAnalytics",
              filename:`custom_analytics_table_${caMode}`,
              title:"Custom Analytics Table",
              subtitle:`Mode: ${caMode} · Stack: ${caStackBy}`,
              background:normalizeHexColor(C.bg,"#ffffff"),
              sheetName:"Custom_Analytics",
              rows:customAnalyticsRows.map(r=>({
                Group:r.group,
                Total:r.total,
                Active:r.active,
                Adj:r.adj,
                Del:r.del,
                "Adj%":r.adj_rate,
                "Del%":r.del_rate,
                Muslim:r.m,
                Hindu:r.h,
                "Muslim%":r.muslim_share,
                "Hindu%":r.hindu_share,
              })),
            })}>
            Custom Analysis Table
          </SH>
          <div id="tblCustomAnalytics" style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:760}}>
              <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                {["Group","Total","Active","Adj","Del","Adj%","Del%","Muslim","Hindu","Muslim%","Hindu%"].map(h=>(
                  <th key={h} style={{padding:"6px 8px",textAlign:h==="Group"?"left":"right",fontSize:10,color:C.dim,textTransform:"uppercase"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {customAnalyticsRows.map(r=>(
                  <tr key={r.group} style={{borderBottom:`1px solid ${C.border}22`}}>
                    <td style={{padding:"6px 8px",color:C.text,fontWeight:600}}>{r.group}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.muted}}>{r.total}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.active}}>{r.active}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.adj}}>{r.adj}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.del}}>{r.del}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.orange}}>{r.adj_rate}%</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.orange}}>{r.del_rate}%</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.Muslim}}>{r.m}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.Hindu}}>{r.h}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.muted}}>{r.muslim_share}%</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.muted}}>{r.hindu_share}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  };

  const renderTrends=()=>{
    if(!canRenderHeavyCharts){
      return renderCompactViewportNotice("Trend charts are paused on this screen size.");
    }
    const topFlags=[...partTrendRows].filter(r=>r.fdrSig).sort((a,b)=>Math.abs(b.diffPct)-Math.abs(a.diffPct)).slice(0,20);
    const dimKeys=partBarsSplit==="religion"
      ?["Muslim","Hindu","Uncertain","Unknown"]
      :["18–22","23–30","31–39","40–44★","45–60","60+","Unknown"];
    const dimColor=(k)=>{
      if(k==="Muslim") return chartColor.Muslim;
      if(k==="Hindu") return chartColor.Hindu;
      if(k==="Uncertain") return C.Uncertain;
      if(k==="Unknown") return C.Unknown;
      if(k==="18–22") return "#06b6d4";
      if(k==="23–30") return "#22c55e";
      if(k==="31–39") return "#3b82f6";
      if(k==="40–44★") return "#f59e0b";
      if(k==="45–60") return "#ef4444";
      if(k==="60+") return "#8b5cf6";
      return C.dim;
    };
    const partRows=[...new Set(filtered.map(v=>String(v.part_no||"")))]
      .filter(Boolean).sort((a,b)=>(+a||0)-(+b||0))
      .map(part=>{
        const pv=filtered.filter(v=>String(v.part_no||"")===String(part));
        const init={}; dimKeys.forEach(k=>{ init[k]=0; });
        const pop={...init}, ua={...init}, dl={...init};
        pv.forEach(v=>{
          const key=partBarsSplit==="religion"?(effRel(v)||"Unknown"):(v.ageGroup||"Unknown");
          if(!(key in pop)) return;
          pop[key]+=1;
          if(v.status==="Under Adjudication") ua[key]+=1;
          if(v.status==="Deleted") dl[key]+=1;
        });
        const norm=(obj)=>{
          if(partBarsMode!=="share") return obj;
          const t=Object.values(obj).reduce((s,n)=>s+(+n||0),0)||1;
          const out={}; Object.keys(obj).forEach(k=>{ out[k]=+((obj[k]/t)*100).toFixed(2); });
          return out;
        };
        return {part, pop:norm(pop), ua:norm(ua), dl:norm(dl)};
      });
    const popRows=partRows.map(r=>({part:r.part,...r.pop}));
    const uaRows=partRows.map(r=>({part:r.part,...r.ua}));
    const dlRows=partRows.map(r=>({part:r.part,...r.dl}));
    const stackTotal=row=>dimKeys.reduce((s,k)=>s+(row[k]||0),0);
    const niceAxisMax=(values,minBase)=>{
      const rawMax=Math.max(0,...values);
      if(rawMax<=0) return minBase;
      const rough=Math.max(minBase,rawMax*1.15);
      const magnitude=Math.pow(10,Math.floor(Math.log10(rough)));
      const normalized=rough/magnitude;
      const step=normalized<=1 ? 1 : normalized<=2 ? 2 : normalized<=5 ? 5 : 10;
      return step*magnitude;
    };
    const popMax=partBarsMode==="share" ? 100 : niceAxisMax(popRows.map(stackTotal),100);
    const uaMax=partBarsMode==="share" ? 100 : niceAxisMax(uaRows.map(stackTotal),10);
    const dlMax=partBarsMode==="share" ? 100 : niceAxisMax(dlRows.map(stackTotal),5);
    return(
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <Panel>
          <SH onExport={()=>openChartExport({
            containerId:"chartPartwiseThreeBars",
            filename:`partwise_threebars_${partBarsSplit}_${partBarsMode}`,
            rows:partRows,
            title:"Part-wise 3-Bar Composition",
            subtitle:`Population, UA and Deleted by ${partBarsSplit==="religion"?"religion":"age group"}`,
            chartType:`Triple stacked bars (${partBarsMode})`,
          })} sub="Each part has three synchronized stacked bars: Total population, Under Adjudication, and Deleted.">
            Part-wise 3-Bar Composition
          </SH>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
            <select value={partBarsSplit} onChange={e=>setPartBarsSplit(e.target.value)}
              style={{padding:"6px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}}>
              <option value="religion">Split: Religion</option>
              <option value="age">Split: Age Group</option>
            </select>
            <select value={partBarsMode} onChange={e=>setPartBarsMode(e.target.value)}
              style={{padding:"6px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}}>
              <option value="absolute">Mode: Absolute values</option>
              <option value="share">Mode: 100% share</option>
            </select>
          </div>
          <div id="chartPartwiseThreeBars" style={{display:"grid",gridTemplateColumns:"1fr",gap:10}}>
            <div style={{fontSize:11,color:C.dim}}>Whole population composition</div>
            <ResizableChartFrame height={210}>
              <BarChart data={popRows} syncId="part3sync" margin={{top:10,right:16,left:4,bottom:50}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                <XAxis dataKey="part" tick={{fill:C.muted,fontSize:10}} angle={-28} textAnchor="end" interval={0}/>
                <YAxis tick={{fill:C.muted,fontSize:11}} domain={[0,popMax]} unit={partBarsMode==="share"?"%":""}/>
                <Tooltip {...TT}/>
                <Legend iconSize={10} wrapperStyle={{fontSize:11}}/>
                {dimKeys.map((k,i)=><Bar key={`pop_${k}`} dataKey={k} stackId="a" fill={dimColor(k)} radius={i===dimKeys.length-1?[4,4,0,0]:undefined}/>)}
              </BarChart>
            </ResizableChartFrame>
            <div style={{fontSize:11,color:C.dim}}>Under Adjudication composition</div>
            <ResizableChartFrame height={210}>
              <BarChart data={uaRows} syncId="part3sync" margin={{top:10,right:16,left:4,bottom:50}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                <XAxis dataKey="part" tick={{fill:C.muted,fontSize:10}} angle={-28} textAnchor="end" interval={0}/>
                <YAxis tick={{fill:C.muted,fontSize:11}} domain={[0,uaMax]} unit={partBarsMode==="share"?"%":""}/>
                <Tooltip {...TT}/>
                {dimKeys.map((k,i)=><Bar key={`ua_${k}`} dataKey={k} stackId="b" fill={dimColor(k)} radius={i===dimKeys.length-1?[4,4,0,0]:undefined}/>)}
              </BarChart>
            </ResizableChartFrame>
            <div style={{fontSize:11,color:C.dim}}>Deleted composition</div>
            <ResizableChartFrame height={210}>
              <BarChart data={dlRows} syncId="part3sync" margin={{top:10,right:16,left:4,bottom:50}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                <XAxis dataKey="part" tick={{fill:C.muted,fontSize:10}} angle={-28} textAnchor="end" interval={0}/>
                <YAxis tick={{fill:C.muted,fontSize:11}} domain={[0,dlMax]} unit={partBarsMode==="share"?"%":""}/>
                <Tooltip {...TT}/>
                {dimKeys.map((k,i)=><Bar key={`dl_${k}`} dataKey={k} stackId="c" fill={dimColor(k)} radius={i===dimKeys.length-1?[4,4,0,0]:undefined}/>)}
              </BarChart>
            </ResizableChartFrame>
          </div>
        </Panel>
        <Panel>
          <SH sub="Per-part Muslim vs Hindu adjudication decomposition with effect sizes and FDR correction">
            Part Trend Decomposition
          </SH>
          <div style={{marginBottom:8}}>
            <button onClick={()=>openChartExport({containerId:"chartPartTrends",filename:"part_trend_decomposition",rows:partTrendRows})}
              style={{padding:"6px 12px",background:C.blue+"22",border:`1px solid ${C.blue}44`,borderRadius:6,color:C.blue,fontSize:12,cursor:"pointer"}}>
              Export Chart
            </button>
          </div>
          <div id="chartPartTrends">
            <ResizableChartFrame height={320}>
              <LineChart data={partTrendRows} margin={{top:15,right:20,left:5,bottom:60}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                <XAxis dataKey="part" tick={{fill:C.muted,fontSize:10}} angle={-30} textAnchor="end" interval={0}/>
                <YAxis tick={{fill:C.muted,fontSize:11}} unit="%"/>
                <Tooltip {...TT}/>
                <Legend iconSize={10} wrapperStyle={{fontSize:11}}/>
                <Line type="monotone" dataKey="mRate" name="Muslim Adj%" stroke={C.Muslim} strokeWidth={2} dot={false}/>
                <Line type="monotone" dataKey="hRate" name="Hindu Adj%" stroke={C.Hindu} strokeWidth={2} dot={false}/>
                <Line type="monotone" dataKey="diffPct" name="Risk Difference (pp)" stroke={C.blue} strokeDasharray="5 3" strokeWidth={1.6} dot={false}/>
              </LineChart>
            </ResizableChartFrame>
          </div>
        </Panel>
        <Panel>
          <SH sub="q < 0.05 after Benjamini-Hochberg correction">Statistically Flagged Parts</SH>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:980}}>
              <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                {["Part","Total","M Adj%","H Adj%","Diff(pp)","95% CI","RR","OR","Chi2","p","q(FDR)","Flag"].map(h=>(
                  <th key={h} style={{padding:"6px 8px",textAlign:h==="Part"?"left":"right",fontSize:10,color:C.dim,textTransform:"uppercase"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {(topFlags.length?topFlags:partTrendRows.slice(0,50)).map(r=>(
                  <tr key={r.part} style={{borderBottom:`1px solid ${C.border}22`,background:r.fdrSig?C.yellow+"22":""}}>
                    <td style={{padding:"6px 8px",color:C.text,fontWeight:700}}>P{r.part}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.muted}}>{r.total}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.Muslim}}>{r.mRate}%</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.Hindu}}>{r.hRate}%</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.blue,fontWeight:700}}>{r.diffPct}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.dim}}>{r.diffCI}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.muted}}>{r.rr??"NA"}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.muted}}>{r.or??"NA"}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.muted}}>{r.chi2??"NA"}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.muted}}>{r.p.toExponential(2)}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:r.fdrSig?C.adj:C.muted,fontWeight:r.fdrSig?700:400}}>{r.q.toExponential(2)}</td>
                    <td style={{padding:"6px 8px",textAlign:"right"}}>{r.fdrSig?<Tag c="q<0.05" color={C.adj}/>:<Tag c="n.s." color={C.dim}/>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  };

  // ── TAB: BOOTHS ──────────────────────────────────────────────────────────────
  const renderBooths=()=>{
    const toggleBoothSelection=(pt)=>{
      setBoothSelectionTouched(true);
      setBoothPage(0);
      setBoothSearch("");
      setBoothPartsSelected(prev=>{
        const next=prev.includes(pt) ? prev.filter(x=>x!==pt) : [...prev,pt].sort((a,b)=>(+a||0)-(+b||0));
        setBoothPart(next[0]||null);
        return next;
      });
    };
    const boothStats=parts.map(pt=>{
      const pv=voters.filter(v=>v.part_no===pt);
      const pm=pv.filter(v=>effRel(v)==="Muslim");
      const ph=pv.filter(v=>effRel(v)==="Hindu");
      const adj=pv.filter(v=>v.status==="Under Adjudication").length;
      const del=pv.filter(v=>v.status==="Deleted").length;
      const mA=pm.filter(v=>v.status==="Under Adjudication").length;
      const hA=ph.filter(v=>v.status==="Under Adjudication").length;
      const mAR=pm.length>0?mA/pm.length:0;
      const hAR=ph.length>0?hA/ph.length:0;
      return{pt,total:pv.length,adj,del,
        adjPct:pv.length>0?+(adj/pv.length*100).toFixed(1):0,
        mTotal:pm.length,hTotal:ph.length,mAdj:mA,hAdj:hA,
        mAdjPct:+(mAR*100).toFixed(1), hAdjPct:+(hAR*100).toFixed(1),
        biasR:hAR>0?+(mAR/hAR).toFixed(2):null,
        smAdj:pv.filter(v=>v.isSelfMapped&&v.status==="Under Adjudication").length,
        overrideCount:pv.filter(v=>overrides[v._uid]).length,
      };
    });

    const boothSelectedRows=activeBoothParts.length?voters.filter(v=>activeBoothParts.includes(v.part_no)):[];
    const boothSelectedMuslim=boothSelectedRows.filter(v=>effRel(v)==="Muslim");
    const boothSelectedHindu=boothSelectedRows.filter(v=>effRel(v)==="Hindu");
    const boothSelectedUA=boothSelectedRows.filter(v=>v.status==="Under Adjudication");
    const boothSelectedDeleted=boothSelectedRows.filter(v=>v.status==="Deleted");
    const boothSelectedActive=boothSelectedRows.filter(v=>v.status==="Active");
    const boothSelectedMales=boothSelectedRows.filter(v=>String(v.gender||"").toUpperCase().startsWith("M"));
    const boothSelectedFemales=boothSelectedRows.filter(v=>String(v.gender||"").toUpperCase().startsWith("F"));
    const boothSelectedUaMuslim=boothSelectedUA.filter(v=>effRel(v)==="Muslim");
    const boothSelectedUaHindu=boothSelectedUA.filter(v=>effRel(v)==="Hindu");
    const boothSelectedUaMale=boothSelectedUA.filter(v=>String(v.gender||"").toUpperCase().startsWith("M"));
    const boothSelectedUaFemale=boothSelectedUA.filter(v=>String(v.gender||"").toUpperCase().startsWith("F"));
    const boothAgeBuckets=["18–22","23–30","31–39","40–44★","45–60","60+"];
    const selectedBoothLabel=activeBoothParts.length===1
      ? `Part ${activeBoothParts[0]}`
      : activeBoothParts.length>1
        ? `${activeBoothParts.length} booths (${activeBoothParts.map(p=>`P${p}`).join(", ")})`
        : "No booth selected";
    const boothPartReligionShareRows=activeBoothParts.length?[{
      label:"Muslim",
      count:boothSelectedMuslim.length,
      pct:boothSelectedRows.length?+((boothSelectedMuslim.length/boothSelectedRows.length)*100).toFixed(1):0,
    },{
      label:"Hindu",
      count:boothSelectedHindu.length,
      pct:boothSelectedRows.length?+((boothSelectedHindu.length/boothSelectedRows.length)*100).toFixed(1):0,
    }]:[];
    const boothPartUaReligionRows=activeBoothParts.length?[{
      label:"Muslim",
      count:boothSelectedUaMuslim.length,
      pct:boothSelectedUA.length?+((boothSelectedUaMuslim.length/boothSelectedUA.length)*100).toFixed(1):0,
    },{
      label:"Hindu",
      count:boothSelectedUaHindu.length,
      pct:boothSelectedUA.length?+((boothSelectedUaHindu.length/boothSelectedUA.length)*100).toFixed(1):0,
    }]:[];
    const boothPartUaGenderRows=activeBoothParts.length?[{
      label:"Male",count:boothSelectedUaMale.length,
    },{
      label:"Female",count:boothSelectedUaFemale.length,
    }]:[];
    const boothPartUaAgeRows=activeBoothParts.length?boothAgeBuckets.map(label=>({
      label,
      count:boothSelectedUA.filter(v=>v.ageGroup===label).length,
    })):[];    

    const boothPage_data=boothVoters.slice(boothPage*PAGE_SIZE,(boothPage+1)*PAGE_SIZE);
    const totalBoothPages=Math.ceil(boothVoters.length/PAGE_SIZE);

    const doBoothSort=k=>{if(boothSort===k)setBoothSortD(d=>d==="asc"?"desc":"asc");else{setBoothSort(k);setBoothSortD("asc");}};

    return(
      <div style={{display:"flex",flexDirection:"column",gap:18}}>
        {/* Booth overview table */}
        <Panel>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <SH>All Booths — Summary ({parts.length} parts)</SH>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
            <div style={{fontSize:11,color:C.dim}}>
              Selected: {activeBoothParts.length ? activeBoothParts.map(p=>`P${p}`).join(", ") : "none"}
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button onClick={()=>{
                setBoothSelectionTouched(true);
                setBoothPartsSelected(parts);
                setBoothPart(parts[0]||null);
                setBoothPage(0);
              }}
                style={{padding:"5px 12px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12,cursor:"pointer",fontFamily:FONT}}>
                Select All
              </button>
              <button onClick={()=>{
                setBoothSelectionTouched(true);
                setBoothPartsSelected([]);
                setBoothPart(null);
                setBoothPage(0);
              }}
                style={{padding:"5px 12px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12,cursor:"pointer",fontFamily:FONT}}>
                Clear Selection
              </button>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:10,flexWrap:"wrap"}}>
            <button onClick={()=>openTableExport({
              containerId:"tblBoothSummary",
              filename:"booths_summary_table",
              title:"All Booths Summary",
              subtitle:`${parts.length} parts`,
              background:normalizeHexColor(C.bg,"#ffffff"),
              sheetName:"Booth_Summary",
              rows:boothStats.map(row=>({
                Part:row.pt,
                Total:row.total,
                Adj:row.adj,
                "Adj%":row.adjPct,
                Del:row.del,
                "Mus Adj%":row.mAdjPct,
                "Hnd Adj%":row.hAdjPct,
                Bias:row.biasR ?? "",
                "SM Adj":row.smAdj,
                "Manual Edits":row.overrideCount,
              })),
            })}
              style={{padding:"5px 12px",background:C.panel,border:`1px solid ${C.border}`,
                borderRadius:6,color:C.muted,fontSize:12,cursor:"pointer",fontFamily:FONT}}>
              🖼 Export Table Image
            </button>
            <button onClick={()=>exportXLSX(buildSummaryRows(voters),"BoothSummary.xlsx","Summary")}
              style={{padding:"5px 12px",background:C.blue+"22",border:`1px solid ${C.blue}44`,
                borderRadius:6,color:C.blue,fontSize:12,cursor:"pointer",fontFamily:FONT}}>
              📥 Export Summary Workbook
            </button>
            <button onClick={()=>exportFullDataset(voters.map(v=>({...v,override:overrides[v._uid]||null})))}
              style={{padding:"5px 12px",background:C.green+"22",border:`1px solid ${C.green}44`,
                borderRadius:6,color:C.green,fontSize:12,cursor:"pointer",fontFamily:FONT}}>
              📥 Export Full Dataset
            </button>
          </div>
          <div id="tblBoothSummary" style={{maxHeight:300,overflowY:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:500,fontSize:11}}>
              <thead style={{position:"sticky",top:0,background:C.panel}}>
                <tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {["Sel","Part","Total","Adj","Adj%","Del","Mus Adj%","Hnd Adj%","Bias","SM Adj","Edit"].map(h=>(
                    <th key={h} style={{padding:"6px 8px",textAlign:h==="Part"?"left":"right",
                      color:C.dim,fontSize:10,fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {boothStats.map(row=>(
                  <tr key={row.pt}
                    onClick={()=>toggleBoothSelection(row.pt)}
                    style={{borderBottom:`1px solid ${C.border}22`,cursor:"pointer",
                      background:activeBoothParts.includes(row.pt)?C.blue+"11":""}}
                    onMouseEnter={e=>{if(!activeBoothParts.includes(row.pt))e.currentTarget.style.background=C.bg;}}
                    onMouseLeave={e=>{e.currentTarget.style.background=activeBoothParts.includes(row.pt)?C.blue+"11":"";}}
                  >
                    <td style={{padding:"7px 8px",textAlign:"center"}}>
                      <input
                        type="checkbox"
                        checked={activeBoothParts.includes(row.pt)}
                        onChange={()=>toggleBoothSelection(row.pt)}
                        onClick={e=>e.stopPropagation()}
                      />
                    </td>
                    <td style={{padding:"7px 8px",color:C.blue,fontWeight:700,fontFamily:MONO}}>P{row.pt}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.muted}}>{row.total}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.adj,fontWeight:row.adj>0?700:400}}>{row.adj}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:"#fca5a5"}}>{row.adjPct}%</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.del}}>{row.del}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:"#86efac"}}>{row.mAdjPct}%</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:"#fca5a5"}}>{row.hAdjPct}%</td>
                    <td style={{padding:"7px 8px",textAlign:"right"}}><BiasBadge r={row.biasR}/></td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:"#67e8f9"}}>{row.smAdj}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:row.overrideCount>0?C.yellow:C.dim,fontSize:10}}>
                      {row.overrideCount>0?`✎${row.overrideCount}`:"–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Booth drilldown */}
        {activeBoothParts.length>0&&(
          <Panel>
            {(()=>{
              const boothReportCols=Math.max(1,Math.min(2,Number(chartPrefs.boothReportCols)||2));
              const boothReportGrid=(boothReportCols===1 || tablet) ? "1fr" : "1fr 1fr";
              const boothCardHeight=chartH(boothReportBaseHeight);
              return (
                <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <SH>{selectedBoothLabel} — Voter List ({boothVoters.length.toLocaleString()} voters)</SH>
            </div>

            <div id="chartBoothPartReport" style={{border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:14,background:C.bg}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",flexWrap:"wrap",marginBottom:12}}>
                <div style={{fontSize:13,lineHeight:1.45,color:C.text,fontWeight:700}}>
                  AC {voters[0]?.ac_no||"–"}: {voters[0]?.ac_name||"–"}, {selectedBoothLabel}
                  <div style={{fontSize:12,color:C.muted,fontWeight:600,marginTop:4}}>
                    Total: {boothSelectedRows.length} (M:{boothSelectedMales.length}, F:{boothSelectedFemales.length}) | Muslim:{boothSelectedMuslim.length}, Hindu:{boothSelectedHindu.length}
                  </div>
                  <div style={{fontSize:12,color:C.muted,fontWeight:600}}>
                    Under Adj: {boothSelectedUA.length}, Deleted: {boothSelectedDeleted.length}, Unstamped: {boothSelectedActive.length}
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:13,lineHeight:1.35,color:C.adj,fontWeight:800}}>Under Adjudication Details</div>
                  <div style={{fontSize:12,color:C.adj,fontWeight:700}}>
                    Total: {boothSelectedUA.length} (M:{boothSelectedUaMale.length}, F:{boothSelectedUaFemale.length}) | Muslim:{boothSelectedUaMuslim.length}, Hindu:{boothSelectedUaHindu.length}
                  </div>
                  <div style={{display:"flex",justifyContent:"flex-end",gap:8,flexWrap:"wrap",marginTop:8}}>
                  <button onClick={()=>setBoothFigureSettingsOpen(true)}
                    style={{padding:"5px 12px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12,cursor:"pointer",fontFamily:FONT}}>
                    Figure Settings
                  </button>
                  <button onClick={()=>openChartExport({
                    containerId:"chartBoothPartReport",
                    filename:`booths_${activeBoothParts.join("_")}_report`,
                    chartType:"Grouped report panel",
                    width:1800,
                    height:1240,
                    scale:3,
                    background:normalizeHexColor(C.bg,"#ffffff"),
                    headerAlign:"left",
                    title:`AC ${voters[0]?.ac_no||"–"}: ${voters[0]?.ac_name||"–"}, ${selectedBoothLabel}`,
                    subtitle:`Total ${boothSelectedRows.length} (M:${boothSelectedMales.length}, F:${boothSelectedFemales.length}) · Muslim:${boothSelectedMuslim.length}, Hindu:${boothSelectedHindu.length}`,
                    note:`Under Adj ${boothSelectedUA.length} · Deleted ${boothSelectedDeleted.length} · Unstamped ${boothSelectedActive.length}`,
                    rows:[
                      ...boothPartReligionShareRows.map(r=>({Section:"Overall Religion Distribution",Group:r.label,Count:r.count,Percent:r.pct})),
                      ...boothPartUaReligionRows.map(r=>({Section:"Religion of Under Adjudication",Group:r.label,Count:r.count,Percent:r.pct})),
                      ...boothPartUaGenderRows.map(r=>({Section:"Gender of Under Adjudication",Group:r.label,Count:r.count})),
                      ...boothPartUaAgeRows.map(r=>({Section:"Age Group of Under Adjudication",Group:r.label,Count:r.count})),
                    ],
                  })}
                    style={{padding:"5px 12px",background:C.panel,border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,fontSize:12,cursor:"pointer",fontFamily:FONT}}>
                    Export Report Image
                  </button>
                  </div>
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:boothReportGrid,gap:14}}>
                <div style={{height:boothCardHeight,resize:"vertical",overflow:"hidden",minHeight:220,background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:10}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:6,textAlign:"center"}}>Overall Religion Distribution</div>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={boothPartReligionShareRows} margin={{top:20,right:16,left:6,bottom:10}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                      <XAxis dataKey="label" tick={{fill:C.muted,fontSize:11}}/>
                      <YAxis tick={{fill:C.muted,fontSize:11}} domain={[0,100]} label={{value:"Percentage of Voters (%)",angle:-90,position:"insideLeft",fill:C.dim,fontSize:11}}/>
                      <Tooltip {...TT} formatter={(v,n,p)=>[`${v}%`,`${p?.payload?.count||0} voters`]}/>
                      <Bar dataKey="pct" radius={[4,4,0,0]} isAnimationActive={false}>
                        {boothPartReligionShareRows.map((r,i)=><Cell key={r.label} fill={i===0?chartColor.Muslim:chartColor.Hindu}/>)}
                        <LabelList dataKey="pct" position="top" formatter={(v)=>`${v}%`} style={{fill:C.text,fontSize:11,fontWeight:700}}/>
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div style={{height:boothCardHeight,resize:"vertical",overflow:"hidden",minHeight:220,background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:10}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.adj,marginBottom:6,textAlign:"center"}}>Religion of Voters Under Adjudication</div>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={boothPartUaReligionRows} margin={{top:20,right:16,left:6,bottom:10}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                      <XAxis dataKey="label" tick={{fill:C.muted,fontSize:11}}/>
                      <YAxis tick={{fill:C.muted,fontSize:11}} domain={[0,100]} label={{value:"Percentage of Adjudicated Voters (%)",angle:-90,position:"insideLeft",fill:C.dim,fontSize:11}}/>
                      <Tooltip {...TT} formatter={(v,n,p)=>[`${v}%`,`${p?.payload?.count||0} voters`]}/>
                      <Bar dataKey="pct" radius={[4,4,0,0]} isAnimationActive={false}>
                        {boothPartUaReligionRows.map((r,i)=><Cell key={r.label} fill={i===0?"#69b9a0":"#f08a5d"}/>)}
                        <LabelList content={({x,y,width,value,index})=>(
                          <text x={(x||0)+(width||0)/2} y={(y||0)-8} textAnchor="middle" fill={C.text} fontSize="11" fontWeight="700">
                            <tspan x={(x||0)+(width||0)/2} dy="0">{boothPartUaReligionRows[index]?.count||0}</tspan>
                            <tspan x={(x||0)+(width||0)/2} dy="13">({value}%)</tspan>
                          </text>
                        )}/>
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div style={{height:boothCardHeight,resize:"vertical",overflow:"hidden",minHeight:220,background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:10}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:6,textAlign:"center"}}>Gender of Voters Under Adjudication</div>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={boothPartUaGenderRows} margin={{top:20,right:16,left:6,bottom:10}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                      <XAxis dataKey="label" tick={{fill:C.muted,fontSize:11}}/>
                      <YAxis tick={{fill:C.muted,fontSize:11}} label={{value:"Count",angle:-90,position:"insideLeft",fill:C.dim,fontSize:11}}/>
                      <Tooltip {...TT}/>
                      <Bar dataKey="count" radius={[4,4,0,0]} fill="#8aa0c8" isAnimationActive={false}>
                        <LabelList dataKey="count" position="top" style={{fill:C.text,fontSize:11,fontWeight:700}}/>
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div style={{height:boothCardHeight,resize:"vertical",overflow:"hidden",minHeight:220,background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:10}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:6,textAlign:"center"}}>Age Group of Voters Under Adjudication</div>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={boothPartUaAgeRows} margin={{top:20,right:16,left:6,bottom:10}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                      <XAxis dataKey="label" tick={{fill:C.muted,fontSize:11}}/>
                      <YAxis tick={{fill:C.muted,fontSize:11}} label={{value:"Count",angle:-90,position:"insideLeft",fill:C.dim,fontSize:11}}/>
                      <Tooltip {...TT}/>
                      <Bar dataKey="count" radius={[4,4,0,0]} fill="#9ccc4d" isAnimationActive={false}>
                        <LabelList dataKey="count" position="top" style={{fill:C.text,fontSize:11,fontWeight:700}}/>
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
                </>
              );
            })()}

            {/* Booth sub-filters */}
            <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
              <input value={boothSearch} onChange={e=>{setBoothSearch(e.target.value);setBoothPage(0);}}
                placeholder="🔍 Search name / voter ID…"
                style={{padding:"5px 10px",background:C.bg,border:`1px solid ${C.border}`,
                  borderRadius:6,color:C.text,fontSize:12,flex:"1 1 180px",fontFamily:FONT}}/>
              <select value={boothRelFilter} onChange={e=>{setBoothRelFilter(e.target.value);setBoothPage(0);}}
                style={{padding:"5px 8px",background:C.bg,border:`1px solid ${C.border}`,
                  borderRadius:6,color:boothRelFilter!=="all"?C.blue:C.muted,fontSize:12,fontFamily:FONT}}>
                <option value="all">All Religions</option>
                <option>Muslim</option><option>Hindu</option><option>Uncertain</option><option>Unknown</option>
              </select>
              <select value={boothStatusFilter} onChange={e=>{setBoothStatusFilter(e.target.value);setBoothPage(0);}}
                style={{padding:"5px 8px",background:C.bg,border:`1px solid ${C.border}`,
                  borderRadius:6,color:boothStatusFilter!=="all"?C.blue:C.muted,fontSize:12,fontFamily:FONT}}>
                <option value="all">All Statuses</option>
                <option>Active</option><option>Under Adjudication</option><option>Deleted</option>
              </select>
              {/* Part selector pills */}
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {parts.slice(0,Math.min(parts.length,20)).map(p=>(
                  <Pill key={p} active={activeBoothParts.includes(p)} onClick={()=>toggleBoothSelection(p)}>
                    {activeBoothParts.includes(p)?"✓ ":""}{p}
                  </Pill>
                ))}
                {parts.length>20&&(
                  <select value={boothPart||""}
                    onChange={e=>{
                      const val=e.target.value;
                      if(!val) return;
                      setBoothSelectionTouched(true);
                      setBoothPart(val);
                      setBoothPartsSelected(prev=>prev.includes(val)?prev:[...prev,val].sort((a,b)=>(+a||0)-(+b||0)));
                      setBoothPage(0);
                    }}
                    style={{padding:"3px 8px",background:C.bg,border:`1px solid ${C.border}`,
                      borderRadius:20,color:C.blue,fontSize:12,fontFamily:FONT}}>
                    <option value="">Add booth…</option>
                    {parts.map(p=><option key={p} value={p}>Part {p}</option>)}
                  </select>
                )}
              </div>
            </div>

            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:10,flexWrap:"wrap"}}>
              <button onClick={()=>openTableExport({
                containerId:"tblBoothVoterList",
                filename:`booths_${activeBoothParts.join("_")}_table`,
                title:`${selectedBoothLabel} Voter List`,
                subtitle:`${boothVoters.length.toLocaleString()} voters`,
                background:normalizeHexColor(C.bg,"#ffffff"),
                sheetName:`Booths_${activeBoothParts.join("_")}`,
                rows:boothVoters.map(v=>toExportRow({...v,override:overrides[v._uid]||null})),
              })}
                style={{padding:"4px 10px",background:C.panel,border:`1px solid ${C.border}`,
                  borderRadius:5,color:C.muted,fontSize:11,cursor:"pointer",fontFamily:FONT}}>
                🖼 Export Voter Table Image
              </button>
              <button onClick={()=>{
                const pv=voters.filter(v=>activeBoothParts.includes(v.part_no)).map(v=>toExportRow({...v,override:overrides[v._uid]||null}));
                exportXLSX(pv,`Booths_${activeBoothParts.join("_")}_VoterRoll.xlsx`,`Booths_${activeBoothParts.join("_")}`);
              }} style={{padding:"4px 10px",background:C.blue+"22",border:`1px solid ${C.blue}44`,
                borderRadius:5,color:C.blue,fontSize:11,cursor:"pointer",fontFamily:FONT}}>
                📥 Export Selected Booths Workbook
              </button>
            </div>

            {/* Voter table */}
            <div id="tblBoothVoterList" style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:500,fontSize:11.5}}>
                <thead>
                  <tr style={{borderBottom:`1px solid ${C.border}`}}>
                    {[["serial_no","#"],["voter_id","Voter ID"],["name","Name"],["age","Age"],
                      ["gender","G"],["relation_name","Father/Husband"],
                      ["status","Status"],["_rel","Religion"],["ageGroup","Age"]].map(([k,lbl])=>(
                      <th key={k} onClick={()=>doBoothSort(k)}
                        style={{padding:"7px 8px",textAlign:["name","relation_name","voter_id"].includes(k)?"left":"center",
                          color:boothSort===k?C.blue:C.dim,fontSize:10,textTransform:"uppercase",
                          cursor:"pointer",userSelect:"none",whiteSpace:"nowrap"}}>
                        {lbl}{boothSort===k?(boothSortD==="asc"?" ↑":" ↓"):""}
                      </th>
                    ))}
                    <th style={{padding:"7px 8px",color:C.dim,fontSize:10,textTransform:"uppercase"}}>Override</th>
                  </tr>
                </thead>
                <tbody>
                  {boothPage_data.map((v,i)=>{
                    const ov=overrides[v._uid];
                    const rel=ov||v.religion;
                    const isEditing=editingId===v._uid;
                    return(
                      <tr key={v._uid} style={{borderBottom:`1px solid ${C.bg}`,
                        background:v.status==="Under Adjudication"?C.adj+"08":
                                   v.status==="Deleted"?C.del+"08":""}}
                        onMouseEnter={e=>e.currentTarget.style.background=C.bg}
                        onMouseLeave={e=>e.currentTarget.style.background=
                          v.status==="Under Adjudication"?C.adj+"08":
                          v.status==="Deleted"?C.del+"08":""}>
                        <td style={{padding:"5px 8px",textAlign:"center",color:C.dim,fontFamily:MONO}}>{v.serial_no}</td>
                        <td style={{padding:"5px 8px",color:C.dim,fontFamily:MONO,fontSize:10}}>{v.voter_id}</td>
                        <td style={{padding:"5px 8px",color:C.text,fontWeight:600,minWidth:140}}>{v.name}</td>
                        <td style={{padding:"5px 8px",textAlign:"center",color:C.muted}}>{v.age}</td>
                        <td style={{padding:"5px 8px",textAlign:"center",color:C.dim}}>{String(v.gender||"")[0]}</td>
                        <td style={{padding:"5px 8px",color:C.dim,minWidth:120}}>{v.relation_name}</td>
                        <td style={{padding:"5px 8px",textAlign:"center"}}><StatusBadge s={v.status}/></td>
                        <td style={{padding:"5px 8px",textAlign:"center"}}>
                          <RelBadge rel={v.religion} conf={v.relConf} via={v.relVia} override={ov}/>
                        </td>
                        <td style={{padding:"5px 8px",textAlign:"center",color:C.muted,fontSize:11}}>{v.ageGroup}</td>
                        <td style={{padding:"5px 8px",textAlign:"center"}}>
                          {isEditing?(
                            <div style={{display:"flex",gap:4,alignItems:"center"}}>
                              <select defaultValue={ov||v.religion}
                                autoFocus
                                onChange={e=>{
                                  const val=e.target.value;
                                  setOverrides(prev=>val?{...prev,[v._uid]:val}:
                                    (({[v._uid]:_,...rest})=>rest)(prev));
                                  setEditingId(null);
                                }}
                                onBlur={()=>setEditingId(null)}
                                style={{padding:"2px 6px",background:C.bg,border:`1px solid ${C.blue}`,
                                  borderRadius:4,color:C.text,fontSize:11,fontFamily:FONT}}>
                                <option value="">Auto ({v.religion})</option>
                                <option value="Muslim">Muslim</option>
                                <option value="Hindu">Hindu</option>
                                <option value="Uncertain">Uncertain</option>
                                <option value="Unknown">Unknown</option>
                              </select>
                            </div>
                          ):(
                            <div style={{display:"flex",gap:4,justifyContent:"center"}}>
                              <button onClick={()=>setEditingId(v._uid)}
                                style={{padding:"2px 8px",background:"transparent",
                                  border:`1px solid ${C.border}`,borderRadius:4,
                                  color:ov?C.yellow:C.dim,fontSize:10,cursor:"pointer",fontFamily:FONT}}>
                                {ov?"✎ "+ov:"✎ Rel"}
                              </button>
                              <button onClick={()=>openVoterEditor(v)}
                                style={{padding:"2px 8px",background:"transparent",border:`1px solid ${C.border}`,
                                  borderRadius:4,color:C.blue,fontSize:10,cursor:"pointer",fontFamily:FONT}}>
                                Edit
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalBoothPages>1&&(
              <div style={{display:"flex",gap:6,justifyContent:"center",marginTop:12,flexWrap:"wrap"}}>
                <button onClick={()=>setBoothPage(0)} disabled={boothPage===0}
                  style={{padding:"4px 10px",background:C.bg,border:`1px solid ${C.border}`,
                    borderRadius:5,color:C.muted,fontSize:12,cursor:"pointer"}}>«</button>
                <button onClick={()=>setBoothPage(p=>Math.max(0,p-1))} disabled={boothPage===0}
                  style={{padding:"4px 10px",background:C.bg,border:`1px solid ${C.border}`,
                    borderRadius:5,color:C.muted,fontSize:12,cursor:"pointer"}}>‹</button>
                {[...Array(Math.min(totalBoothPages,7))].map((_,i)=>{
                  const pg=totalBoothPages<=7?i:boothPage<4?i:boothPage>totalBoothPages-5?totalBoothPages-7+i:boothPage-3+i;
                  return(
                    <button key={pg} onClick={()=>setBoothPage(pg)}
                      style={{padding:"4px 10px",background:pg===boothPage?C.blue:"transparent",
                        border:`1px solid ${pg===boothPage?C.blue:C.border}`,
                        borderRadius:5,color:pg===boothPage?C.text:C.muted,fontSize:12,cursor:"pointer"}}>
                      {pg+1}
                    </button>
                  );
                })}
                <button onClick={()=>setBoothPage(p=>Math.min(totalBoothPages-1,p+1))} disabled={boothPage===totalBoothPages-1}
                  style={{padding:"4px 10px",background:C.bg,border:`1px solid ${C.border}`,
                    borderRadius:5,color:C.muted,fontSize:12,cursor:"pointer"}}>›</button>
                <button onClick={()=>setBoothPage(totalBoothPages-1)} disabled={boothPage===totalBoothPages-1}
                  style={{padding:"4px 10px",background:C.bg,border:`1px solid ${C.border}`,
                    borderRadius:5,color:C.muted,fontSize:12,cursor:"pointer"}}>»</button>
                <span style={{color:C.dim,fontSize:11,alignSelf:"center",fontFamily:MONO}}>
                  {boothPage+1}/{totalBoothPages} · {boothVoters.length} voters
                </span>
              </div>
            )}
          </Panel>
        )}
        {!activeBoothParts.length&&(
          <Panel>
            <div style={{fontSize:13,color:C.dim,lineHeight:1.6}}>
              No booth selected. Tick one or more booths above to generate combined booth graphs and the corresponding voter data table.
            </div>
          </Panel>
        )}
      </div>
    );
  };

  // ── TAB: VOTER LIST (global) ─────────────────────────────────────────────────
  const renderVoters=()=>{
    const sorted=[...filtered].sort((a,b)=>{
      let av=a[vSort],bv=b[vSort];
      if(typeof av==="string")av=av.toLowerCase();
      if(typeof bv==="string")bv=bv.toLowerCase();
      return vSortD==="asc"?(av<bv?-1:av>bv?1:0):(av>bv?-1:av<bv?1:0);
    });
    const page_data=sorted.slice(vPage*PAGE_SIZE,(vPage+1)*PAGE_SIZE);
    const totalPages=Math.ceil(sorted.length/PAGE_SIZE);
    const doSort=k=>{if(vSort===k)setVSortD(d=>d==="asc"?"desc":"asc");else{setVSort(k);setVSortD("asc");}};
    const filterMeta={
      part:gPart==="all"?"All Parts":gPart,
      status:gStatus==="all"?"All Statuses":gStatus,
      religion:gRel==="all"?"All Religions":gRel,
      age:gAge==="all"?"All Ages":gAge,
      gender:gGender==="all"?"All Genders":gGender,
      search:gSearch||"",
    };
    const filterSlug=[
      gPart!=="all"?`part-${gPart}`:null,
      gStatus!=="all"?`status-${gStatus}`:null,
      gRel!=="all"?`rel-${gRel}`:null,
      gAge!=="all"?`age-${gAge}`:null,
      gGender!=="all"?`gender-${gGender}`:null,
      gSearch?`search-${gSearch.slice(0,18)}`:null,
    ].filter(Boolean).join("_").replace(/[^a-zA-Z0-9_-]+/g,"-");
    const filteredRows=filtered.map(v=>toExportRow({...v,override:overrides[v._uid]||null}));
    return(
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
          <span style={{color:C.muted,fontSize:13,alignSelf:"center"}}>
            Showing {page_data.length} of {filtered.length.toLocaleString()} filtered voters
            {Object.keys(overrides).length>0&&<span style={{color:C.yellow,marginLeft:8}}>
              · {Object.keys(overrides).length} manual overrides
            </span>}
          </span>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>openTableExport({
              containerId:"tblVotersGlobal",
              filename:"voters_table",
              title:"Voters Table",
              subtitle:`Filtered records: ${filtered.length.toLocaleString()}`,
              background:normalizeHexColor(C.bg,"#ffffff"),
              sheetName:"Filtered_Voters",
              rows:filteredRows,
            })}
              style={{padding:"5px 12px",background:C.panel,border:`1px solid ${C.border}`,
                borderRadius:6,color:C.muted,fontSize:12,cursor:"pointer",fontFamily:FONT}}>
              🖼 Export Image
            </button>
            <button onClick={()=>exportFilteredDatasetWorkbook(
              filtered.map(v=>({...v,override:overrides[v._uid]||null})),
              {
                filters:filterMeta,
                scope:"Filtered voters view",
                filename:`FilteredVoters_${filterSlug||"all"}_${new Date().toISOString().slice(0,10)}.xlsx`,
              }
            )}
              style={{padding:"5px 12px",background:C.blue+"22",border:`1px solid ${C.blue}44`,
                borderRadius:6,color:C.blue,fontSize:12,cursor:"pointer",fontFamily:FONT}}>
              📥 Export Filtered Workbook
            </button>
            <button onClick={()=>exportRowsCsv(filteredRows,
              `FilteredVoters_${filterSlug||"all"}_${new Date().toISOString().slice(0,10)}`)}
              style={{padding:"5px 12px",background:C.panel,border:`1px solid ${C.border}`,
                borderRadius:6,color:C.muted,fontSize:12,cursor:"pointer",fontFamily:FONT}}>
              CSV
            </button>
            <button onClick={()=>exportFullDataset(voters.map(v=>({...v,override:overrides[v._uid]||null})))}
              style={{padding:"5px 12px",background:C.green+"22",border:`1px solid ${C.green}44`,
                borderRadius:6,color:C.green,fontSize:12,cursor:"pointer",fontFamily:FONT}}>
              📥 Export Full Dataset
            </button>
          </div>
        </div>
        <div id="tblVotersGlobal" style={{overflowX:"auto",background:C.panel,borderRadius:10,border:`1px solid ${C.border}`}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:500,fontSize:11.5}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${C.border}`}}>
                {[["serial_no","#"],["part_no","Part"],["voter_id","Voter ID"],["name","Name"],
                  ["age","Age"],["gender","G"],["relation_name","Father/Husband"],
                  ["status","Status"],["_rel","Religion"],["ageGroup","Age Grp"],["_edit","Edit"]].map(([k,lbl])=>(
                  <th key={k} onClick={()=>{if(k!=="_edit") doSort(k);}}
                    style={{padding:"8px 10px",textAlign:["name","relation_name"].includes(k)?"left":"center",
                      color:vSort===k?C.blue:C.dim,fontSize:10,textTransform:"uppercase",
                      cursor:k==="_edit"?"default":"pointer",userSelect:"none",whiteSpace:"nowrap"}}>
                    {lbl}{vSort===k?(vSortD==="asc"?" ↑":" ↓"):""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page_data.map((v,i)=>{
                const ov=overrides[v._uid];
                return(
                  <tr key={v._uid} style={{borderBottom:`1px solid ${C.bg}`,
                    background:v.status==="Under Adjudication"?C.adj+"08":
                               v.status==="Deleted"?C.del+"08":""}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.bg}
                    onMouseLeave={e=>e.currentTarget.style.background=
                      v.status==="Under Adjudication"?C.adj+"08":v.status==="Deleted"?C.del+"08":""}>
                    <td style={{padding:"5px 10px",textAlign:"center",color:C.dim,fontFamily:MONO}}>{v.serial_no}</td>
                    <td style={{padding:"5px 10px",textAlign:"center",color:C.blue,fontFamily:MONO,fontWeight:700}}>{v.part_no}</td>
                    <td style={{padding:"5px 10px",color:C.dim,fontFamily:MONO,fontSize:10}}>{v.voter_id}</td>
                    <td style={{padding:"5px 10px",color:C.text,fontWeight:600,minWidth:130}}>{v.name}</td>
                    <td style={{padding:"5px 10px",textAlign:"center",color:C.muted}}>{v.age}</td>
                    <td style={{padding:"5px 10px",textAlign:"center",color:C.dim}}>{String(v.gender||"")[0]}</td>
                    <td style={{padding:"5px 10px",color:C.dim,minWidth:120}}>{v.relation_name}</td>
                    <td style={{padding:"5px 10px",textAlign:"center"}}><StatusBadge s={v.status}/></td>
                    <td style={{padding:"5px 10px",textAlign:"center"}}>
                      <RelBadge rel={v.religion} conf={v.relConf} via={v.relVia} override={ov}/>
                    </td>
                    <td style={{padding:"5px 10px",textAlign:"center",color:C.muted,fontSize:10}}>{v.ageGroup}</td>
                    <td style={{padding:"5px 10px",textAlign:"center"}}>
                      <button onClick={()=>openVoterEditor(v)}
                        style={{padding:"2px 8px",background:"transparent",border:`1px solid ${C.border}`,
                          borderRadius:4,color:C.blue,fontSize:10,cursor:"pointer",fontFamily:FONT}}>
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages>1&&(
          <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
            <button onClick={()=>setVPage(0)} disabled={vPage===0}
              style={{padding:"4px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,color:C.muted,fontSize:12,cursor:"pointer"}}>«</button>
            <button onClick={()=>setVPage(p=>Math.max(0,p-1))} disabled={vPage===0}
              style={{padding:"4px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,color:C.muted,fontSize:12,cursor:"pointer"}}>‹</button>
            {[...Array(Math.min(totalPages,7))].map((_,i)=>{
              const pg=totalPages<=7?i:vPage<4?i:vPage>totalPages-5?totalPages-7+i:vPage-3+i;
              return(
                <button key={pg} onClick={()=>setVPage(pg)}
                  style={{padding:"4px 10px",background:pg===vPage?C.blue:"transparent",
                    border:`1px solid ${pg===vPage?C.blue:C.border}`,borderRadius:5,
                    color:pg===vPage?C.text:C.muted,fontSize:12,cursor:"pointer"}}>
                  {pg+1}
                </button>
              );
            })}
            <button onClick={()=>setVPage(p=>Math.min(totalPages-1,p+1))} disabled={vPage===totalPages-1}
              style={{padding:"4px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,color:C.muted,fontSize:12,cursor:"pointer"}}>›</button>
            <button onClick={()=>setVPage(totalPages-1)} disabled={vPage===totalPages-1}
              style={{padding:"4px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,color:C.muted,fontSize:12,cursor:"pointer"}}>»</button>
            <span style={{color:C.dim,fontSize:11,alignSelf:"center",fontFamily:MONO}}>
              pg {vPage+1}/{totalPages}
            </span>
          </div>
        )}
      </div>
    );
  };

  // ── TAB: REVIEW QUEUE ────────────────────────────────────────────────────────
  const renderReview=()=>{
    const RV_SIZE=30;
    const queue=needsReview.filter(v=>{
      if(rvFilter!=="all"&&v.religion!==rvFilter) return false;
      if(rvSearch){
        const s=rvSearch.toLowerCase();
        return v.name.toLowerCase().includes(s)||
               String(v.voter_id||"").toLowerCase().includes(s)||
               v.relation_name.toLowerCase().includes(s);
      }
      return true;
    });
    const totalPages=Math.ceil(queue.length/RV_SIZE);
    const pageData=queue.slice(rvPage*RV_SIZE,(rvPage+1)*RV_SIZE);
    const doneCount=Object.keys(overrides).length;
    const totalCount=needsReview.length+doneCount;

    const mark=(uid,rel)=>{
      setOverrides(prev=>({...prev,[uid]:rel}));
      // Token learning: find tokens from this voter's name + relation_name
      // that are currently Unknown/Uncertain (not in effectiveScores or score 0.35–0.65)
      // and nudge them toward the confirmed religion
      const voter=voters.find(v=>v._uid===uid);
      if(!voter) return;
      const newScore=rel==="Muslim"?0.92:0.08;
      const toks=[
        ...(voter.name||"").toUpperCase().trim().split(/\s+/),
        ...(voter.relation_name||"").toUpperCase().trim().split(/\s+/),
      ].map(t=>t.replace(/[.,\-']+$/,"")).filter(t=>t.length>=3);
      const learned={};
      toks.forEach(tok=>{
        const existing=effectiveScores[tok];
        if(existing===undefined){
          // Token completely unknown — add with moderate confidence
          learned[tok]=rel==="Muslim"?0.80:0.20;
        } else if(existing>0.35&&existing<0.65){
          // Token was ambiguous — nudge toward confirmed religion
          learned[tok]=+((existing+newScore)/2).toFixed(3);
        }
        // If already strongly classified, don't override
      });
      if(Object.keys(learned).length){
        setTokenOverrides(prev=>({...prev,...learned}));
        setTokenLearnCount(c=>c+Object.keys(learned).length);
      }
    };
    const unmark=(uid)=>setOverrides(prev=>{const n={...prev};delete n[uid];return n;});
    const markAll=(rel)=>{ const u={}; queue.forEach(v=>{u[v._uid]=rel;}); setOverrides(p=>({...p,...u})); };

    // Tag-style button used for M / H buttons
    const RBtn=({label,color,active,onClick})=>(
      <button onClick={onClick} style={{
        width:36,height:28,borderRadius:5,cursor:"pointer",fontWeight:800,
        fontSize:12,fontFamily:MONO,border:`2px solid ${active?color:color+"44"}`,
        background:active?color:"transparent",color:active?"#000":color,
        transition:"all 0.1s",flexShrink:0}}>
        {label}
      </button>
    );

    return(
      <div style={{display:"flex",flexDirection:"column",gap:12}}>

        {/* Progress bar + counters */}
        <div style={{background:C.panel,borderRadius:10,padding:"14px 18px",
          border:`1px solid ${C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8}}>
            <span style={{fontSize:13,fontWeight:700,color:C.text}}>
              Religion Review Queue
            </span>
            <div style={{display:"flex",gap:12,alignItems:"baseline"}}>
              {tokenLearnCount>0&&(
                <span style={{fontFamily:MONO,fontSize:11,color:"#a78bfa"}}>
                  🧠 {tokenLearnCount} token{tokenLearnCount!==1?"s":""} learned
                </span>
              )}
              <span style={{fontFamily:MONO,fontSize:12,color:C.dim}}>
                <span style={{color:C.green,fontWeight:700}}>{doneCount}</span>
                {" / "}{totalCount} resolved
              </span>
            </div>
          </div>
          {/* Progress bar */}
          <div style={{height:6,borderRadius:3,background:C.bg,overflow:"hidden"}}>
            <div style={{height:"100%",borderRadius:3,background:C.green,
              width:`${totalCount>0?(doneCount/totalCount*100):0}%`,
              transition:"width 0.3s"}}/>
          </div>
          {needsReview.length===0&&(
            <div style={{marginTop:10,textAlign:"center",fontSize:13,color:C.green,fontWeight:600}}>
              All done! Every voter has been classified.
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <input value={rvSearch} onChange={e=>{setRvSearch(e.target.value);setRvPage(0);}}
            placeholder="Search name / voter ID / relation…"
            style={{flex:"1 1 180px",padding:"7px 10px",background:C.panel,
              border:`1px solid ${C.border}`,borderRadius:7,color:C.text,
              fontSize:12,fontFamily:FONT,minWidth:0}}/>
          <button onClick={()=>openTableExport({
            containerId:"tblReviewQueue",
            filename:"review_queue_table",
            title:"Religion Review Queue",
            subtitle:`Pending rows: ${queue.length}`,
            background:normalizeHexColor(C.bg,"#ffffff"),
            sheetName:"Review_Queue",
            rows:queue.map(v=>({
              Part:v.part_no,
              "Voter ID":v.voter_id,
              Name:v.name,
              "Relation Type":v.relation_type||"",
              "Relation Name":v.relation_name||"",
              Age:v.age,
              Gender:v.gender,
              Status:v.status,
              "Religion (Auto)":v.religion,
              "Religion Via":v.relVia,
              Override:overrides[v._uid]||"",
            })),
          })}
            style={{padding:"6px 10px",background:C.panel,border:`1px solid ${C.border}`,borderRadius:7,color:C.muted,fontSize:12,cursor:"pointer"}}>
            Export Image
          </button>
          {[["All","all"],["Unknown","Unknown"],["Uncertain","Uncertain"]].map(([lbl,val])=>(
            <button key={val} onClick={()=>{setRvFilter(val);setRvPage(0);}}
              style={{padding:"6px 12px",borderRadius:7,fontSize:12,cursor:"pointer",
                fontFamily:FONT,whiteSpace:"nowrap",
                background:rvFilter===val?C.yellow+"33":"transparent",
                border:`1px solid ${rvFilter===val?C.yellow:C.border}`,
                color:rvFilter===val?C.yellow:C.muted}}>
              {lbl}{val!=="all"?` (${needsReview.filter(v=>v.religion===val).length})`:` (${needsReview.length})`}
            </button>
          ))}
          <span style={{flex:1,minWidth:8}}/>
          {/* Bulk buttons */}
          <span style={{fontSize:11,color:C.dim}}>Bulk:</span>
          <button onClick={()=>markAll("Muslim")}
            style={{padding:"6px 14px",borderRadius:7,cursor:"pointer",fontWeight:700,
              fontSize:12,fontFamily:MONO,background:C.Muslim+"22",
              border:`2px solid ${C.Muslim}66`,color:C.Muslim}}>
            All Muslim
          </button>
          <button onClick={()=>markAll("Hindu")}
            style={{padding:"6px 14px",borderRadius:7,cursor:"pointer",fontWeight:700,
              fontSize:12,fontFamily:MONO,background:C.Hindu+"22",
              border:`2px solid ${C.Hindu}66`,color:C.Hindu}}>
            All Hindu
          </button>
        </div>

        {/* Cards */}
        {pageData.length===0?(
          <div style={{textAlign:"center",padding:"48px 0",color:C.dim,fontSize:13}}>
            {needsReview.length===0
              ?"All voters classified — nothing left to review!"
              :"No matches for current search/filter"}
          </div>
        ):(
          <div id="tblReviewQueue" style={{display:"flex",flexDirection:"column",gap:2}}>
            {pageData.map((v,idx)=>{
              const ov=overrides[v._uid];
              const isM=ov==="Muslim";
              const isH=ov==="Hindu";
              const rowBg=isM?C.Muslim+"18":isH?C.Hindu+"18":
                          v.religion==="Unknown"?"#ef444406":"#f59e0b06";
              const borderL=isM?C.Muslim:isH?C.Hindu:
                            v.religion==="Unknown"?C.adj+"66":C.yellow+"66";
              return(
                <div key={v._uid} style={{
                  display:"flex",alignItems:"center",gap:10,
                  padding:"9px 14px",borderRadius:8,
                  background:rowBg,
                  borderLeft:`3px solid ${borderL}`,
                  transition:"background 0.15s"}}>

                  {/* Index */}
                  <span style={{color:C.dim,fontFamily:MONO,fontSize:10,
                    minWidth:26,textAlign:"right",flexShrink:0}}>
                    {rvPage*RV_SIZE+idx+1}
                  </span>

                  {/* Name block */}
                  <div style={{flex:"1 1 160px",minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:13,color:C.text,
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {v.name}
                      {v.status==="Under Adjudication"&&
                        <span style={{marginLeft:6,fontSize:10,color:C.adj,
                          fontWeight:600,fontFamily:MONO}}>ADJ</span>}
                      {v.status==="Deleted"&&
                        <span style={{marginLeft:6,fontSize:10,color:C.del,
                          fontWeight:600,fontFamily:MONO}}>DEL</span>}
                    </div>
                    <div style={{fontSize:11,color:C.dim,marginTop:1,
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {v.relation_type||"Rel"}: {v.relation_name}
                      <span style={{marginLeft:8,color:C.dim,fontFamily:MONO}}>
                        {v.age}/{String(v.gender||"")[0]} · P{v.part_no}
                      </span>
                    </div>
                  </div>

                  {/* Auto-detected badge */}
                  <div style={{flexShrink:0,textAlign:"center",minWidth:60}}>
                    <div style={{fontSize:10,color:C[v.religion]||C.dim,
                      fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>
                      {v.religion}
                    </div>
                    <div style={{fontSize:9,color:C.dim,marginTop:1}}>
                      {v.relVia==="none"?"no match":
                       v.relVia==="uncertain"?"ambiguous":
                       v.relVia}
                    </div>
                  </div>

                  {/* M / H / ? buttons */}
                  <div style={{display:"flex",gap:5,flexShrink:0}}>
                    <RBtn label="M" color={C.Muslim} active={isM}
                      onClick={()=>isM?unmark(v._uid):mark(v._uid,"Muslim")}/>
                    <RBtn label="H" color={C.Hindu}  active={isH}
                      onClick={()=>isH?unmark(v._uid):mark(v._uid,"Hindu")}/>
                    {ov&&ov!=="Muslim"&&ov!=="Hindu"&&(
                      <span style={{fontSize:11,color:C.yellow,alignSelf:"center",
                        fontWeight:700,marginLeft:2}}>{ov}</span>
                    )}
                    {ov&&(
                      <button onClick={()=>unmark(v._uid)}
                        style={{width:20,height:28,borderRadius:5,border:"none",
                          background:"transparent",color:C.dim,cursor:"pointer",
                          fontSize:14,lineHeight:1,padding:0}}>
                        ×
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages>1&&(
          <div style={{display:"flex",gap:6,justifyContent:"center",
            alignItems:"center",paddingTop:4}}>
            <button onClick={()=>setRvPage(0)} disabled={rvPage===0}
              style={{padding:"5px 10px",background:C.panel,border:`1px solid ${C.border}`,
                borderRadius:5,color:C.dim,cursor:"pointer",fontSize:12}}>«</button>
            <button onClick={()=>setRvPage(p=>Math.max(0,p-1))} disabled={rvPage===0}
              style={{padding:"5px 10px",background:C.panel,border:`1px solid ${C.border}`,
                borderRadius:5,color:C.dim,cursor:"pointer",fontSize:12}}>‹</button>
            <span style={{fontSize:12,color:C.muted,fontFamily:MONO,padding:"0 10px"}}>
              {rvPage+1} / {totalPages}
              <span style={{color:C.dim}}> · {queue.length} voters</span>
            </span>
            <button onClick={()=>setRvPage(p=>Math.min(totalPages-1,p+1))}
              disabled={rvPage>=totalPages-1}
              style={{padding:"5px 10px",background:C.panel,border:`1px solid ${C.border}`,
                borderRadius:5,color:C.dim,cursor:"pointer",fontSize:12}}>›</button>
            <button onClick={()=>setRvPage(totalPages-1)}
              disabled={rvPage>=totalPages-1}
              style={{padding:"5px 10px",background:C.panel,border:`1px solid ${C.border}`,
                borderRadius:5,color:C.dim,cursor:"pointer",fontSize:12}}>»</button>
          </div>
        )}
      </div>
    );
  };

  // ── TAB: DUPLICATES ──────────────────────────────────────────────────────────
  const renderDuplicates=()=>{
    const DUP_WINDOW=100;
    const statusPass=(g)=>{
      if(dupStatusFilter==="all") return true;
      if(dupStatusFilter==="open") return !g.resolved;
      if(dupStatusFilter==="auto") return !!g.autoResolved;
      if(dupStatusFilter==="manual") return !g.autoResolved && !!g.resolved;
      return true;
    };
    const filteredDuplicateGroups=duplicateGroups.filter(statusPass);
    const filteredFileDuplicateGroups=fileDuplicateGroups.filter(statusPass);
    const totalDupRows=duplicateGroups.reduce((s,g)=>s+g.count,0);
    const autoResolvedDupGroups=duplicateGroups.filter(g=>g.autoResolved).length;
    const manualResolvedDupGroups=duplicateGroups.filter(g=>!g.autoResolved&&g.resolved).length;
    const openDupGroups=duplicateGroups.filter(g=>!g.resolved);
    const visibleDupGroups=filteredDuplicateGroups.slice(0,500);
    const visibleOpenDupGroups=visibleDupGroups.filter(g=>!g.resolved);
    const visibleFileGroups=filteredFileDuplicateGroups.slice(0,DUP_WINDOW);
    const dupFileRows=filteredFileDuplicateGroups.flatMap(g=>g.rows.map(r=>({
      "Hash":g.hash,
      "Group Size":g.count,
      "Resolution": g.resolution,
      "File":r.fileName,
      "Rows":r.rowCount||"",
      "Size(bytes)":r.size||"",
      "Imported At":r.importedAt||"",
    })));
    return(
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:8}}>
          <StatCard label="Duplicate Row Groups" value={duplicateGroups.length} color={duplicateGroups.length?C.orange:C.green}/>
          <StatCard label="Duplicate Rows (grouped)" value={totalDupRows} color={totalDupRows?C.orange:C.green}/>
          <StatCard label="Open Row Groups" value={openDupGroups.length} color={openDupGroups.length?C.red:C.green}/>
          <StatCard label="Auto-resolved Rows" value={autoResolvedDupGroups} color={C.blue}/>
          <StatCard label="Manual-resolved Rows" value={manualResolvedDupGroups} color={C.green}/>
          <StatCard label="Duplicate File Groups" value={fileDuplicateGroups.length} color={fileDuplicateGroups.length?C.orange:C.green}/>
          <StatCard label="Tracked Files" value={Object.keys(loadedFileMeta||{}).length} color={C.blue}/>
        </div>

        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:11,color:C.dim}}>Show:</span>
          {[
            ["All","all",duplicateGroups.length+fileDuplicateGroups.length],
            ["Open","open",openDupGroups.length],
            ["Auto","auto",autoResolvedDupGroups+fileDuplicateGroups.filter(g=>g.autoResolved).length],
            ["Manual","manual",manualResolvedDupGroups+fileDuplicateGroups.filter(g=>!g.autoResolved&&g.resolved).length],
          ].map(([label,val,count])=>(
            <button key={val} onClick={()=>setDupStatusFilter(val)}
              style={{padding:"6px 12px",borderRadius:7,fontSize:12,cursor:"pointer",
                fontFamily:FONT,whiteSpace:"nowrap",
                background:dupStatusFilter===val?C.yellow+"33":"transparent",
                border:`1px solid ${dupStatusFilter===val?C.yellow:C.border}`,
                color:dupStatusFilter===val?C.yellow:C.muted}}>
              {label} ({count})
            </button>
          ))}
        </div>

        <Panel>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
            <SH sub="Same-content file groups are auto-resolved, but still reported for audit trail.">Same-content Files (Hash Match)</SH>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setResolvedFileHashes(prev=>{
                const next={...prev};
                visibleFileGroups.forEach(g=>{ next[g.hash]=true; });
                return next;
              })}
                style={{padding:"5px 10px",background:C.panel,border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,fontSize:11,cursor:"pointer"}}>
                Resolve Window
              </button>
              <button onClick={()=>setResolvedFileHashes(prev=>{
                const next={...prev};
                filteredFileDuplicateGroups.forEach(g=>{ next[g.hash]=true; });
                return next;
              })}
                style={{padding:"5px 10px",background:C.green+"22",border:`1px solid ${C.green}44`,borderRadius:6,color:C.green,fontSize:11,cursor:"pointer"}}>
                Resolve All
              </button>
              <button onClick={()=>openTableExport({
                containerId:"tblSameContentFiles",
                filename:"duplicate_files_table",
                title:"Same-content Files (Hash Match)",
                subtitle:"Duplicate file-content groups",
                background:normalizeHexColor(C.bg,"#ffffff"),
                sheetName:"Duplicate_Files",
                rows:dupFileRows,
              })}
                style={{padding:"5px 10px",background:C.panel,border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,fontSize:11,cursor:"pointer"}}>
                Export Image
              </button>
              <button onClick={()=>exportXLSX(dupFileRows,`Duplicate_Files_${new Date().toISOString().slice(0,10)}.xlsx`,"Duplicate_Files")}
                style={{padding:"5px 10px",background:C.green+"22",border:`1px solid ${C.green}44`,borderRadius:6,color:C.green,fontSize:11,cursor:"pointer"}}>
                Export File Duplicates
              </button>
            </div>
          </div>
          <div id="tblSameContentFiles" style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:720}}>
              <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                {["Hash (short)","Count","Status","Files","Rows per File","Action"].map(h=>(
                  <th key={h} style={{padding:"7px 8px",textAlign:h==="Files"?"left":"right",color:C.dim,fontSize:10,textTransform:"uppercase"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filteredFileDuplicateGroups.length===0&&(
                  <tr><td colSpan={6} style={{padding:16,textAlign:"center",color:C.dim}}>No same-content duplicate files detected.</td></tr>
                )}
                {filteredFileDuplicateGroups.map(g=>(
                  <tr key={g.hash} style={{borderBottom:`1px solid ${C.border}22`}}>
                    <td style={{padding:"7px 8px",fontFamily:MONO,color:C.muted}}>{String(g.hash).slice(0,14)}...</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.orange,fontWeight:700}}>{g.count}</td>
                    <td style={{padding:"7px 8px",textAlign:"right"}}>
                      <Tag c={g.resolution==="auto-same-content"?"AUTO":g.resolution==="manual"?"MANUAL":"OPEN"} color={g.resolved?C.green:C.orange}/>
                    </td>
                    <td style={{padding:"7px 8px",color:C.text}}>{g.rows.map(r=>r.fileName).join(", ")}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.muted}}>{g.rows.map(r=>r.rowCount||0).join(", ")}</td>
                    <td style={{padding:"7px 8px",textAlign:"right"}}>
                      <button onClick={()=>setResolvedFileHashes(prev=>({...prev,[g.hash]:!prev[g.hash]}))}
                        style={{padding:"4px 8px",background:C.panel,border:`1px solid ${C.border}`,borderRadius:5,color:C.blue,fontSize:11,cursor:"pointer"}}>
                        {resolvedFileHashes[g.hash]?"Re-open":"Resolve"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
            <SH sub="Exact duplicates are auto-resolved. Remaining groups can be resolved one by one, by current window, or all at once.">
              Duplicate Voter Rows (Part + Voter ID / fallback key)
            </SH>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setResolvedDuplicateKeys(prev=>{
                const next={...prev};
                visibleOpenDupGroups.forEach(g=>{ next[g.key]=true; });
                return next;
              })}
                style={{padding:"5px 10px",background:C.panel,border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,fontSize:11,cursor:"pointer"}}>
                Resolve Window
              </button>
              <button onClick={()=>setResolvedDuplicateKeys(prev=>{
                const next={...prev};
                filteredDuplicateGroups.filter(g=>!g.autoResolved).forEach(g=>{ next[g.key]=true; });
                return next;
              })}
                style={{padding:"5px 10px",background:C.green+"22",border:`1px solid ${C.green}44`,borderRadius:6,color:C.green,fontSize:11,cursor:"pointer"}}>
                Resolve All
              </button>
              <button onClick={()=>openTableExport({
                containerId:"tblDuplicateVoters",
                filename:"duplicate_voter_rows_table",
                title:"Duplicate Voter Rows",
                subtitle:"Part + voter key duplicates",
                background:normalizeHexColor(C.bg,"#ffffff"),
                sheetName:"Duplicate_Rows",
                rows:filteredDuplicateGroups.flatMap(g=>g.rows.map(v=>({
                  "Duplicate Key":g.key,
                  "Group Size":g.count,
                  Resolution:g.resolution,
                  Part:v.part_no,
                  Serial:v.serial_no,
                  "Voter ID":v.voter_id,
                  Name:v.name,
                  Relation:v.relation_name,
                  Age:v.age,
                  Gender:v.gender,
                  Status:v.status,
                  "Source File":v.sourceFile,
                }))),
              })}
                style={{padding:"5px 10px",background:C.panel,border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,fontSize:11,cursor:"pointer"}}>
                Export Image
              </button>
              <button onClick={()=>{
                const rows=filteredDuplicateGroups.flatMap(g=>g.rows.map(v=>({
                  "Duplicate Key":g.key,"Group Size":g.count,"Resolution":g.resolution,"Part":v.part_no,"Serial":v.serial_no,"Voter ID":v.voter_id,
                  "Name":v.name,"Relation":v.relation_name,"Age":v.age,"Gender":v.gender,"Status":v.status,"Source File":v.sourceFile
                })));
                exportXLSX(rows,`Duplicate_Rows_${new Date().toISOString().slice(0,10)}.xlsx`,"Duplicate_Rows");
              }}
                style={{padding:"5px 10px",background:C.blue+"22",border:`1px solid ${C.blue}44`,borderRadius:6,color:C.blue,fontSize:11,cursor:"pointer"}}>
                Export Row Duplicates
              </button>
            </div>
          </div>
          <div id="tblDuplicateVoters" style={{maxHeight:280,overflow:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:800}}>
              <thead style={{position:"sticky",top:0,background:C.panel}}>
                <tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {["Count","Part","Voter ID","Name","Status","Files","Key","Action"].map(h=>(
                    <th key={h} style={{padding:"6px 8px",textAlign:h==="Name"||h==="Files"||h==="Key"?"left":"right",color:C.dim,fontSize:10,textTransform:"uppercase"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDuplicateGroups.length===0&&(
                  <tr><td colSpan={8} style={{padding:14,textAlign:"center",color:C.dim}}>No duplicate voter groups detected.</td></tr>
                )}
                {visibleDupGroups.map(g=>(
                  <tr key={g.key} style={{borderBottom:`1px solid ${C.border}22`,background:g.autoResolved?C.blue+"10":g.resolved?C.green+"10":""}}>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.orange,fontWeight:700}}>{g.count}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:C.muted}}>{g.part}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",fontFamily:MONO,color:C.muted}}>{g.voter_id||"—"}</td>
                    <td style={{padding:"6px 8px",color:C.text}}>{g.name||"—"}</td>
                    <td style={{padding:"6px 8px",textAlign:"right"}}>
                      <Tag c={g.resolution==="auto-exact-match"?"AUTO":g.resolution==="manual"?"MANUAL":"OPEN"} color={g.resolved?C.green:C.orange}/>
                    </td>
                    <td style={{padding:"6px 8px",color:C.dim}}>{[...new Set(g.rows.map(r=>r.sourceFile))].join(", ")}</td>
                    <td style={{padding:"6px 8px",fontFamily:MONO,color:C.dim}}>{g.key}</td>
                    <td style={{padding:"6px 8px",textAlign:"right"}}>
                      {!g.autoResolved&&(
                        <button onClick={()=>setResolvedDuplicateKeys(prev=>({...prev,[g.key]:!prev[g.key]}))}
                          style={{padding:"4px 8px",background:C.panel,border:`1px solid ${C.border}`,borderRadius:5,color:C.blue,fontSize:11,cursor:"pointer"}}>
                          {g.resolved?"Re-open":"Resolve"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <SH sub="Runs against a local endpoint (e.g. Ollama). This does not send data to cloud unless your endpoint does.">
            Local AI Narrative
          </SH>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
            <input value={localAiEndpoint} onChange={e=>setLocalAiEndpoint(e.target.value)}
              style={{flex:"2 1 260px",padding:"6px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}}
              placeholder="Endpoint (e.g. http://localhost:11434/api/generate)"/>
            <input value={localAiModel} onChange={e=>setLocalAiModel(e.target.value)}
              style={{flex:"1 1 140px",padding:"6px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}}
              placeholder="Model"/>
            <button onClick={generateLocalAiBrief} disabled={aiLoading}
              style={{padding:"6px 12px",background:C.green+"22",border:`1px solid ${C.green}44`,borderRadius:6,color:C.green,fontSize:12,cursor:aiLoading?"default":"pointer"}}>
              {aiLoading?"Generating...":"Generate Brief"}
            </button>
            <button onClick={()=>{
              if(!aiBrief){ window.alert("No AI brief generated yet."); return; }
              const blob=new Blob([aiBrief],{type:"text/plain;charset=utf-8"});
              const a=document.createElement("a");
              a.href=URL.createObjectURL(blob);
              a.download=`AI_Brief_${new Date().toISOString().slice(0,10)}.txt`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
              style={{padding:"6px 12px",background:C.blue+"22",border:`1px solid ${C.blue}44`,borderRadius:6,color:C.blue,fontSize:12,cursor:"pointer"}}>
              Export AI Brief
            </button>
          </div>
          <textarea value={aiBrief} onChange={e=>setAiBrief(e.target.value)}
            placeholder="AI-generated narrative will appear here..."
            style={{width:"100%",minHeight:220,background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,padding:10,fontSize:12,fontFamily:MONO,boxSizing:"border-box"}}/>
        </Panel>
      </div>
    );
  };

  // ── TAB: METHODOLOGY ─────────────────────────────────────────────────────────
  // ── TAB: TOKENS ─────────────────────────────────────────────────────────────
  const renderTokens=()=>{
    const TOK_PAGE=50;
    // Merge base + overrides; mark user-edited and deleted tokens
    // tokenOverrides[tok] === -1 means deleted/suppressed
        const allToks=new Set([...Object.keys(baseNameScores),...Object.keys(tokenOverrides)]);
    const merged=[...allToks].map(tok=>{
      const override=tokenOverrides[tok];
          const base=baseNameScores[tok]??null;
      const deleted=override===-1;
      const val=deleted?(base??0.5):(override??base??0.5);
      return {
        tok,
        base,
        val,
        isUser: tok in tokenOverrides && !deleted,
            isNew:  !(tok in baseNameScores) && tok in tokenOverrides && !deleted,
        isDeleted: deleted,
        rel: val>=0.65?"Muslim":val<=0.35?"Hindu":"Ambiguous",
      };
    });

    const qU=tokSearch.toUpperCase().trim();
    const visible=merged
      .filter(t=>{
        if(tokFilter==="muslim")  return t.val>=0.65 && !t.isDeleted;
        if(tokFilter==="hindu")   return t.val<=0.35 && !t.isDeleted;
        if(tokFilter==="ambiguous") return t.val>0.35&&t.val<0.65 && !t.isDeleted;
        if(tokFilter==="user")    return t.isUser;
        if(tokFilter==="deleted") return t.isDeleted;
        return !t.isDeleted; // "all" hides deleted by default
      })
      .filter(t=>!qU||t.tok.includes(qU))
      .sort((a,b)=>{
        if(a.isUser!==b.isUser) return a.isUser?-1:1;
        return a.tok.localeCompare(b.tok);
      });

    const totalPages=Math.ceil(visible.length/TOK_PAGE);
    const page=Math.min(tokPage,Math.max(0,totalPages-1));
    const pageItems=visible.slice(page*TOK_PAGE,(page+1)*TOK_PAGE);

    const musCount=merged.filter(t=>t.val>=0.65&&!t.isDeleted).length;
    const hinCount=merged.filter(t=>t.val<=0.35&&!t.isDeleted).length;
    const ambCount=merged.filter(t=>t.val>0.35&&t.val<0.65&&!t.isDeleted).length;
    const userCount=Object.keys(tokenOverrides).filter(k=>tokenOverrides[k]!==-1).length;
    const delCount=Object.keys(tokenOverrides).filter(k=>tokenOverrides[k]===-1).length;

    const applyEdit=(tok,rawVal)=>{
      const v=parseFloat(rawVal);
      if(isNaN(v)||v<0||v>1){alert("Value must be 0.00–1.00\n1.0 = 100% Muslim, 0.0 = 100% Hindu");return;}
      setTokenOverrides(prev=>({...prev,[tok.toUpperCase()]:+v.toFixed(3)}));
      setTokEditId(null);
    };
    const removeOverride=(tok)=>{
      setTokenOverrides(prev=>{const n={...prev};delete n[tok];return n;});
    };
    const deleteToken=(tok)=>{
      // For user-added tokens: fully remove. For base tokens: suppress with -1.
      if(!(tok in baseNameScores)){
        setTokenOverrides(prev=>{const n={...prev};delete n[tok];return n;});
      } else {
        setTokenOverrides(prev=>({...prev,[tok]:-1}));
      }
    };
    const restoreToken=(tok)=>{
      setTokenOverrides(prev=>{const n={...prev};delete n[tok];return n;});
    };
    const applyRename=(oldTok,newName)=>{
      const newTok=newName.trim().toUpperCase();
      if(!newTok){alert("Token name cannot be empty");return;}
      if(newTok===oldTok){setTokRenameId(null);return;}
      if((newTok in baseNameScores)||(newTok in tokenOverrides&&tokenOverrides[newTok]!==-1)){
        alert(`Token "${newTok}" already exists`);return;
      }
      const val=tokenOverrides[oldTok];
      setTokenOverrides(prev=>{
        const n={...prev};
        delete n[oldTok];
        n[newTok]=val;
        return n;
      });
      setTokRenameId(null);
    };
    const addNew=()=>{
      const t=newTokName.trim().toUpperCase();
      if(!t){alert("Enter a token name");return;}
      const v=parseFloat(newTokVal);
      if(isNaN(v)||v<0||v>1){alert("Value must be 0.00–1.00");return;}
      setTokenOverrides(prev=>({...prev,[t]:+v.toFixed(3)}));
      setNewTokName("");setNewTokVal("0.99");
    };

    const tokenExportRows=Object.entries({...baseNameScores,...tokenOverrides})
      .sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([tok,val])=>{
        const base=baseNameScores[tok]??"";
        const current=val===-1?-1:(tokenOverrides[tok]??baseNameScores[tok]??0.5);
        const source=!(tok in baseNameScores)?"User-added":tok in tokenOverrides?(current===-1?"Suppressed":"User-edited"):"Training data";
        const religion=current===-1?"Suppressed":current>=0.65?"Muslim":current<=0.35?"Hindu":"Ambiguous";
        return {
          Token:tok,
          "Base Score":base===""?"":+Number(base).toFixed(3),
          "Current Score":current===-1?-1:+Number(current).toFixed(3),
          Source:source,
          Religion:religion,
        };
      });
    const exportTokens=(format="csv")=>{
      const baseName=`token_scores_${new Date().toISOString().slice(0,10)}`;
      if(format==="xlsx"){
        exportXLSX(tokenExportRows,`${baseName}.xlsx`,"Token_Scores");
        return;
      }
      if(format==="json"){
        const blob=new Blob([JSON.stringify({schemaVersion:"tokens.v1",createdAt:new Date().toISOString(),tokens:tokenExportRows},null,2)],{type:"application/json;charset=utf-8"});
        const a=document.createElement("a");
        a.href=URL.createObjectURL(blob);
        a.download=`${baseName}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        return;
      }
      exportRowsCsv(tokenExportRows,baseName);
    };

    const scoreBar=(val)=>{
      const pct=val*100;
      const col=val>=0.65?C.Muslim:val<=0.35?C.Hindu:"#fbbf24";
      return(
        <div style={{display:"flex",alignItems:"center",gap:6,minWidth:140}}>
          <div style={{flex:1,height:7,background:C.border+"44",borderRadius:3,overflow:"hidden",position:"relative"}}>
            <div style={{position:"absolute",left:`${Math.min((1-val)*100,100)}%`,right:0,top:0,bottom:0,
              background:val>=0.65?C.Muslim:val<=0.35?C.Hindu:"#fbbf24",
              // For Muslim: fill from right; for Hindu: fill from left
              ...(val>=0.65?{left:`${(1-val)*100}%`,right:0}:{left:0,right:`${val*100}%`}),
            }}/>
            {/* Centre marker */}
            <div style={{position:"absolute",left:"50%",top:0,bottom:0,width:1,background:C.border}}/>
          </div>
          <span style={{fontSize:11,fontFamily:MONO,color:col,fontWeight:700,minWidth:36,textAlign:"right"}}>
            {pct.toFixed(0)}%
          </span>
        </div>
      );
    };

    return(
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {/* Stats row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8}}>
          {[
            {label:"Total Tokens",val:merged.filter(t=>!t.isDeleted).length,color:C.blue},
            {label:"Muslim (≥65%)",val:musCount,color:C.Muslim},
            {label:"Hindu (≤35%)",val:hinCount,color:C.Hindu},
            {label:"Ambiguous",val:ambCount,color:"#fbbf24"},
            {label:"User Edits",val:userCount,color:"#a78bfa"},
            {label:"Suppressed",val:delCount,color:C.adj},
          ].map(({label,val,color})=>(
            <div key={label} style={{background:C.panel,borderRadius:8,padding:"10px 14px",
              border:`1px solid ${color}33`}}>
              <div style={{fontSize:20,fontWeight:800,color,fontFamily:MONO}}>{val.toLocaleString()}</div>
              <div style={{fontSize:11,color:C.dim,marginTop:2}}>{label}</div>
            </div>
          ))}
        </div>

        {/* Add new token */}
        <Panel>
          <SH sub="Add a new token or override an existing one. 1.0 = definite Muslim · 0.0 = definite Hindu · 0.5 = ambiguous">
            Add / Override Token
          </SH>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
            <button onClick={()=>tokenFileRef.current?.click()}
              style={{padding:"6px 12px",background:C.green+"22",border:`1px solid ${C.green}44`,
                borderRadius:6,color:C.green,fontSize:12,cursor:"pointer",fontFamily:FONT}}>
              Import Labeled Names XLSX
            </button>
            <input ref={tokenFileRef} type="file" accept=".xlsx" style={{display:"none"}}
              onChange={e=>importLabeledNamesFile(e.target.files?.[0])}/>
            <button onClick={()=>tokenPackFileRef.current?.click()}
              style={{padding:"6px 12px",background:C.blue+"18",border:`1px solid ${C.blue}44`,
                borderRadius:6,color:C.blue,fontSize:12,cursor:"pointer",fontFamily:FONT}}>
              Import Token Pack
            </button>
            <input ref={tokenPackFileRef} type="file" accept=".csv,.xlsx,.json" style={{display:"none"}}
              onChange={e=>importTokenPackFile(e.target.files?.[0])}/>
            {tokenImportSummary&&(
              <span style={{fontSize:11,color:C.dim,fontFamily:MONO}}>
                {tokenImportSummary.file}: merged {tokenImportSummary.totalImported} tokens
                (new {tokenImportSummary.addedN}, overrides {tokenImportSummary.updatedN})
              </span>
            )}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div style={{flex:"2 1 160px"}}>
              <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Token (name fragment, uppercase)</div>
              <input value={newTokName} onChange={e=>setNewTokName(e.target.value.toUpperCase())}
                onKeyDown={e=>e.key==="Enter"&&addNew()}
                placeholder="e.g. HODA, GOLAM, KUMAR…"
                style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,
                  padding:"7px 10px",color:C.text,fontSize:13,fontFamily:FONT,boxSizing:"border-box"}}/>
            </div>
            <div style={{flex:"1 1 120px"}}>
              <div style={{fontSize:11,color:C.dim,marginBottom:4}}>
                Score&nbsp;
                <span style={{color:C.Muslim}}>1.0=Muslim</span>&nbsp;·&nbsp;
                <span style={{color:C.Hindu}}>0.0=Hindu</span>
              </div>
              <input value={newTokVal} onChange={e=>setNewTokVal(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&addNew()}
                placeholder="0.00–1.00"
                style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,
                  padding:"7px 10px",color:C.text,fontSize:13,fontFamily:MONO,boxSizing:"border-box"}}/>
            </div>
            {/* Quick presets */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[["Muslim 99%","0.99",C.Muslim],["Muslim 90%","0.90",C.Muslim+"bb"],
                ["Ambiguous","0.50","#fbbf24"],["Hindu 90%","0.10",C.Hindu+"bb"],["Hindu 99%","0.01",C.Hindu]
              ].map(([label,v,col])=>(
                <button key={v} onClick={()=>setNewTokVal(v)}
                  style={{padding:"5px 10px",background:newTokVal===v?col+"33":"transparent",
                    border:`1px solid ${col}`,borderRadius:5,color:col,fontSize:11,cursor:"pointer"}}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={addNew}
              style={{padding:"7px 18px",background:C.Muslim,border:"none",borderRadius:6,
                color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
              ＋ Add Token
            </button>
          </div>
          {newTokName&&(
            <div style={{marginTop:8,fontSize:12,color:C.dim}}>
              Preview:&nbsp;
              <span style={{fontFamily:MONO,color:C.text,fontWeight:700}}>{newTokName}</span>
              {(()=>{const v=parseFloat(newTokVal);if(isNaN(v))return" —";
                const col=v>=0.65?C.Muslim:v<=0.35?C.Hindu:"#fbbf24";
                return <span style={{color:col,fontWeight:700}}>&nbsp;→ {v>=0.65?"Muslim":v<=0.35?"Hindu":"Ambiguous"} ({(v*100).toFixed(0)}%)</span>;
              })()}
            </div>
          )}
        </Panel>

        {/* Search + filter */}
        <Panel>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12,alignItems:"center"}}>
            <input value={tokSearch} onChange={e=>{setTokSearch(e.target.value);setTokPage(0);}}
              placeholder="🔍 Search token…"
              style={{flex:"1 1 180px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,
                padding:"6px 10px",color:C.text,fontSize:13,fontFamily:FONT}}/>
            {[
              {id:"all",    label:`All (${merged.filter(t=>!t.isDeleted).length})`},
              {id:"muslim", label:`Muslim (${musCount})`,col:C.Muslim},
              {id:"hindu",  label:`Hindu (${hinCount})`,col:C.Hindu},
              {id:"ambiguous",label:`Ambig. (${ambCount})`,col:"#fbbf24"},
              {id:"user",   label:`My edits (${userCount})`,col:"#a78bfa"},
              ...(delCount>0?[{id:"deleted",label:`Suppressed (${delCount})`,col:C.adj}]:[]),
            ].map(({id,label,col})=>(
              <button key={id} onClick={()=>{setTokFilter(id);setTokPage(0);}}
                style={{padding:"5px 12px",
                  background:tokFilter===id?(col||C.blue)+"33":"transparent",
                  border:`1px solid ${tokFilter===id?(col||C.blue):C.border}`,
                  borderRadius:5,color:tokFilter===id?(col||C.blue):C.muted,
                  fontSize:12,cursor:"pointer"}}>
                {label}
              </button>
            ))}
            <button onClick={()=>exportTokens("csv")}
              style={{padding:"5px 12px",background:"transparent",border:`1px solid ${C.border}`,
                borderRadius:5,color:C.dim,fontSize:12,cursor:"pointer",marginLeft:"auto"}}>
              ⬇ CSV
            </button>
            <button onClick={()=>exportTokens("xlsx")}
              style={{padding:"5px 12px",background:"transparent",border:`1px solid ${C.border}`,
                borderRadius:5,color:C.dim,fontSize:12,cursor:"pointer"}}>
              XLSX
            </button>
            <button onClick={()=>exportTokens("json")}
              style={{padding:"5px 12px",background:"transparent",border:`1px solid ${C.border}`,
                borderRadius:5,color:C.dim,fontSize:12,cursor:"pointer"}}>
              JSON
            </button>
            {userCount>0&&(
              <button onClick={()=>{if(window.confirm(`Reset all ${userCount} edits?`))setTokenOverrides({});}}
                style={{padding:"5px 12px",background:"transparent",border:`1px solid ${C.adj}`,
                  borderRadius:5,color:C.adj,fontSize:12,cursor:"pointer"}}>
                ↺ Reset edits
              </button>
            )}
          </div>

          <div style={{fontSize:11,color:C.dim,marginBottom:8}}>
            Showing {visible.length.toLocaleString()} tokens · page {page+1}/{Math.max(1,totalPages)}
          </div>

          {/* Token table */}
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {["Token","Score","Religion","Source","Actions"].map(h=>(
                    <th key={h} style={{padding:"6px 10px",textAlign:h==="Token"?"left":"center",
                      color:C.dim,fontSize:10,fontWeight:700,textTransform:"uppercase",
                      letterSpacing:1.5,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map(({tok,base,val,isUser,isNew,isDeleted,rel})=>(
                  <tr key={tok}
                    style={{borderBottom:`1px solid ${C.border}11`,
                      background:isDeleted?"#ef444408":isNew?"#a78bfa08":isUser?"#7c3aed08":"",
                      opacity:isDeleted?0.5:1}}
                    onMouseEnter={e=>e.currentTarget.style.background=isDeleted?"#ef444412":C.bg}
                    onMouseLeave={e=>e.currentTarget.style.background=isDeleted?"#ef444408":isNew?"#a78bfa08":isUser?"#7c3aed08":""}>

                    {/* Token name */}
                    <td style={{padding:"7px 10px",fontFamily:MONO,fontWeight:700,
                      color:isDeleted?"#ef4444":isNew?"#a78bfa":isUser?"#c4b5fd":C.text,whiteSpace:"nowrap"}}>
                      {tokRenameId===tok?(
                        <div style={{display:"flex",gap:4,alignItems:"center"}}>
                          <input autoFocus defaultValue={tok}
                            id={`trename_${tok}`}
                            onKeyDown={e=>{
                              if(e.key==="Enter") applyRename(tok,e.target.value);
                              if(e.key==="Escape") setTokRenameId(null);
                            }}
                            style={{width:120,background:C.bg,border:`1px solid #a78bfa`,
                              borderRadius:4,padding:"3px 6px",color:"#a78bfa",
                              fontSize:12,fontFamily:MONO,textTransform:"uppercase"}}/>
                          <button onClick={()=>{
                            const el=document.getElementById(`trename_${tok}`);
                            if(el) applyRename(tok,el.value);
                          }} style={{padding:"2px 8px",background:"#a78bfa",border:"none",
                            borderRadius:4,color:"#fff",fontSize:11,cursor:"pointer"}}>✓</button>
                          <button onClick={()=>setTokRenameId(null)}
                            style={{padding:"2px 6px",background:"transparent",
                              border:`1px solid ${C.border}`,borderRadius:4,
                              color:C.dim,fontSize:11,cursor:"pointer"}}>✕</button>
                        </div>
                      ):(
                        <>
                          {tok}
                          {isDeleted&&<span style={{marginLeft:5,fontSize:9,color:"#ef4444",
                            background:"#ef444422",padding:"1px 5px",borderRadius:3}}>SUPPRESSED</span>}
                          {isNew&&!isDeleted&&<span style={{marginLeft:5,fontSize:9,color:"#a78bfa",
                            background:"#a78bfa22",padding:"1px 5px",borderRadius:3}}>NEW</span>}
                          {isUser&&!isNew&&!isDeleted&&<span style={{marginLeft:5,fontSize:9,color:"#7c3aed",
                            background:"#7c3aed22",padding:"1px 5px",borderRadius:3}}>EDITED</span>}
                        </>
                      )}
                    </td>

                    {/* Score bar */}
                    <td style={{padding:"7px 10px"}}>
                      {isDeleted?(
                        <span style={{fontSize:11,color:C.dim,fontStyle:"italic"}}>suppressed</span>
                      ):tokEditId===tok?(
                        <div style={{display:"flex",flexDirection:"column",gap:4,minWidth:180}}>
                          <div style={{display:"flex",gap:6,alignItems:"center"}}>
                            <span style={{fontSize:10,color:C.Hindu,fontFamily:MONO}}>H</span>
                            <input type="range" min="0" max="1" step="0.01"
                              defaultValue={val}
                              id={`tslider_${tok}`}
                              onInput={e=>{
                                const numEl=document.getElementById(`tnum_${tok}`);
                                if(numEl) numEl.value=parseFloat(e.target.value).toFixed(3);
                              }}
                              style={{flex:1,accentColor:val>=0.65?C.Muslim:val<=0.35?C.Hindu:"#fbbf24"}}/>
                            <span style={{fontSize:10,color:C.Muslim,fontFamily:MONO}}>M</span>
                          </div>
                          <div style={{display:"flex",gap:4,alignItems:"center"}}>
                            <input id={`tnum_${tok}`} defaultValue={val.toFixed(3)}
                              onKeyDown={e=>{
                                if(e.key==="Enter"){
                                  const sl=document.getElementById(`tslider_${tok}`);
                                  if(sl) sl.value=e.target.value;
                                  applyEdit(tok,e.target.value);
                                }
                                if(e.key==="Escape") setTokEditId(null);
                              }}
                              onInput={e=>{
                                const sl=document.getElementById(`tslider_${tok}`);
                                if(sl) sl.value=e.target.value;
                              }}
                              style={{width:70,background:C.bg,border:`1px solid ${C.Muslim}`,
                                borderRadius:4,padding:"3px 6px",color:C.text,
                                fontSize:12,fontFamily:MONO,textAlign:"right"}}/>
                            <button onClick={()=>{
                              const el=document.getElementById(`tnum_${tok}`);
                              if(el) applyEdit(tok,el.value);
                            }} style={{padding:"2px 8px",background:C.Muslim,border:"none",
                              borderRadius:4,color:"#fff",fontSize:11,cursor:"pointer"}}>✓</button>
                            <button onClick={()=>setTokEditId(null)}
                              style={{padding:"2px 6px",background:"transparent",
                                border:`1px solid ${C.border}`,borderRadius:4,
                                color:C.dim,fontSize:11,cursor:"pointer"}}>✕</button>
                          </div>
                        </div>
                      ):(
                        <div onClick={()=>{setTokEditId(tok);setTokEditVal(val.toFixed(3));}}
                          style={{cursor:"pointer"}} title="Click to edit score">
                          {scoreBar(val)}
                          {isUser&&base!==null&&(
                            <div style={{fontSize:10,color:C.dim,marginTop:2,textAlign:"right"}}>
                              was {(base*100).toFixed(0)}%
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Religion */}
                    <td style={{padding:"7px 10px",textAlign:"center"}}>
                      {!isDeleted&&(
                        <span style={{
                          color:rel==="Muslim"?C.Muslim:rel==="Hindu"?C.Hindu:"#fbbf24",
                          fontWeight:700,fontSize:12
                        }}>{rel}</span>
                      )}
                    </td>

                    {/* Source */}
                    <td style={{padding:"7px 10px",textAlign:"center",color:C.dim,fontSize:11}}>
                      {isDeleted?"Suppressed":isNew?"User-added":isUser?"User-edited":"Training data"}
                    </td>

                    {/* Actions */}
                    <td style={{padding:"7px 10px",textAlign:"center",whiteSpace:"nowrap"}}>
                      {isDeleted?(
                        <button onClick={()=>restoreToken(tok)}
                          style={{padding:"2px 8px",background:C.green+"22",
                            border:`1px solid ${C.green}44`,borderRadius:4,
                            color:C.green,fontSize:11,cursor:"pointer"}}>
                          ↩ Restore
                        </button>
                      ):(
                        <div style={{display:"flex",gap:4,justifyContent:"center",flexWrap:"wrap"}}>
                          {/* Edit score */}
                          <button onClick={()=>{setTokEditId(tok===tokEditId?null:tok);setTokEditVal(val.toFixed(3));}}
                            style={{padding:"2px 8px",background:"transparent",
                              border:`1px solid ${C.border}`,borderRadius:4,
                              color:tokEditId===tok?C.Muslim:C.muted,fontSize:11,cursor:"pointer"}}>
                            ✎ Score
                          </button>
                          {/* Rename — only for user-added tokens */}
                          {isNew&&(
                            <button onClick={()=>{setTokRenameId(tok);setTokRenameVal(tok);}}
                              style={{padding:"2px 8px",background:"transparent",
                                border:`1px solid #a78bfa`,borderRadius:4,
                                color:"#a78bfa",fontSize:11,cursor:"pointer"}}>
                              ✎ Rename
                            </button>
                          )}
                          {/* Reset to base (user-edited base tokens) */}
                          {isUser&&!isNew&&(
                            <button onClick={()=>removeOverride(tok)}
                              style={{padding:"2px 8px",background:"transparent",
                                border:`1px solid ${C.adj}`,borderRadius:4,
                                color:C.adj,fontSize:11,cursor:"pointer"}}>
                              ↺ Reset
                            </button>
                          )}
                          {/* Delete */}
                          <button onClick={()=>{
                            const msg=tok in baseNameScores
                              ?`Suppress "${tok}" from classification? (it's a base token — it will be hidden from scoring until restored)`
                              :`Delete user token "${tok}"? This cannot be undone except by re-adding it.`;
                            if(window.confirm(msg)) deleteToken(tok);
                          }}
                            style={{padding:"2px 8px",background:"transparent",
                              border:`1px solid #ef444466`,borderRadius:4,
                              color:"#ef4444",fontSize:11,cursor:"pointer"}}>
                            ✕ Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages>1&&(
            <div style={{display:"flex",gap:6,justifyContent:"center",marginTop:12,flexWrap:"wrap"}}>
              <button onClick={()=>setTokPage(0)} disabled={page===0}
                style={{padding:"4px 10px",background:"transparent",border:`1px solid ${C.border}`,
                  borderRadius:4,color:page===0?C.dim:C.text,cursor:page===0?"default":"pointer",fontSize:12}}>
                «
              </button>
              <button onClick={()=>setTokPage(p=>Math.max(0,p-1))} disabled={page===0}
                style={{padding:"4px 10px",background:"transparent",border:`1px solid ${C.border}`,
                  borderRadius:4,color:page===0?C.dim:C.text,cursor:page===0?"default":"pointer",fontSize:12}}>
                ‹
              </button>
              <span style={{padding:"4px 12px",fontSize:12,color:C.muted}}>
                {page+1} / {totalPages}
              </span>
              <button onClick={()=>setTokPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1}
                style={{padding:"4px 10px",background:"transparent",border:`1px solid ${C.border}`,
                  borderRadius:4,color:page===totalPages-1?C.dim:C.text,
                  cursor:page===totalPages-1?"default":"pointer",fontSize:12}}>
                ›
              </button>
              <button onClick={()=>setTokPage(totalPages-1)} disabled={page===totalPages-1}
                style={{padding:"4px 10px",background:"transparent",border:`1px solid ${C.border}`,
                  borderRadius:4,color:page===totalPages-1?C.dim:C.text,
                  cursor:page===totalPages-1?"default":"pointer",fontSize:12}}>
                »
              </button>
            </div>
          )}
        </Panel>

        {/* Explain scoring */}
        <Panel>
          <SH>How Scores Work</SH>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10,fontSize:12,color:C.muted}}>
            {[
              ["1.00 — 0.90","Definite Muslim",C.Muslim],
              ["0.90 — 0.65","Likely Muslim",C.Muslim+"99"],
              ["0.65 — 0.50","Possibly Muslim","#fbbf24"],
              ["0.50 — 0.35","Possibly Hindu","#fbbf24"],
              ["0.35 — 0.10","Likely Hindu",C.Hindu+"99"],
              ["0.10 — 0.00","Definite Hindu",C.Hindu],
            ].map(([range,label,col])=>(
              <div key={range} style={{display:"flex",gap:8,alignItems:"center",
                padding:"7px 10px",background:C.bg,borderRadius:6,border:`1px solid ${C.border}`}}>
                <div style={{width:10,height:10,borderRadius:2,background:col,flexShrink:0}}/>
                <span style={{fontFamily:MONO,color:C.text,fontSize:11,minWidth:90}}>{range}</span>
                <span style={{color:col,fontWeight:600}}>{label}</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:10,fontSize:11,color:C.dim,lineHeight:1.8}}>
            <b style={{color:C.text}}>Classification logic:</b> each name is split into tokens. 
            If any token scores ≥ 0.85 (strong Muslim) and Muslim tokens outnumber Hindu tokens → Muslim. 
            If all tokens are Hindu → Hindu. Then relation name is tried, then suffix matching.
            Editing a token here re-classifies all voters instantly (manual overrides are preserved).
          </div>
        </Panel>
      </div>
    );
  };

  const renderMethodology=()=>{
    const blocks=[
      ["🧠 Religion Classifier v3",
`Training data: 68,118 manually labelled WB voter names
  Muslim: 11,939 (17.5%)  |  Hindu/Other: 56,179 (82.5%)
Token vocabulary: 5,146 tokens (≥3 occurrences in training set)
Accuracy: 98.74% (excl. 0.57% unknowns)

Algorithm (per voter):
  1. Tokenise name to uppercase words
  2. Find P(Muslim|token) for each token from score dict
  3. If any token ≥0.75 → Muslim; if ≤0.25 → Hindu
     (Muslim wins ties: maxM > 1−minH)
  4. Else weighted avg: ≥0.65 Muslim, ≤0.35 Hindu, else Uncertain
  5. If Uncertain/Unknown → retry with relation/father name (↩ marker)
  6. Manual override always takes priority over classifier

v2 fixes vs v1:
  • BIBI, BB → Muslim (1.0)
  • KHATUN, BEGUM, BANO → Muslim
  • SAIEKH, SAIKH, SHAIKH, SHEIKH → Muslim
  • +544 Muslim / +524 Hindu tokens from supplementary name list
  • Unknown rate dropped from 0.43% → 0.57% (more tokens covered)`],

        ["📅 Self-mapped Cohort",
`2002 electoral roll baseline year.

Voters who were 18–20 in Jan 2002 are now 40–44 in 2026.
They appear on the 2002 roll and should be auto-carried forward (ECI self-mapping).
Per ECI norms, self-mapped voters should NOT require fresh adjudication.
→ Disproportionate adjudication in 40–44 bracket is procedurally anomalous.

Age 18–22 in 2026 = born 2004–2008 = NEW first-time registrations (not self-mapped).
These are legitimate adjudication candidates for identity verification.

The tool highlights the 40–44★ bracket separately in all tables and charts.`],

        ["⚖️ Bias Metrics",
`Adjudication Bias Ratio = Muslim_Adj_Rate ÷ Hindu_Adj_Rate
  (Muslim rate ÷ Hindu rate → should be ~1.0 if unbiased)
Deletion Bias Ratio = Hindu_Del_Rate ÷ Muslim_Del_Rate
  (Hindu rate ÷ Muslim rate → should be ~1.0 if unbiased)

Interpretation scale:
  ≥3.0  → HIGH BIAS (publishable; χ² significance required)
  1.5–3 → MODERATE BIAS
  0.8–1.5 → LOW / BALANCED
  <0.8  → REVERSED BIAS

Statistical test: Pearson χ² (df=1, 2×2 table, no Yates' correction)
  Significant: χ²≥3.84 → p<0.05 | ≥6.63 → p<0.01 | ≥10.83 → p<0.001
  "n<5" = Fisher's exact recommended; result not shown

Manual overrides: shown in yellow ✎ · exported as "Religion (Final)" column
Auto-classification: exported as "Religion (Auto)" with confidence %`],

      ["📋 Expected Data Format",
`Excel sheet named "Voter Roll" with columns:
  ac_no, ac_name, part_no, serial_no, voter_id, name,
  relation_type, relation_name, house_no, age, gender,
  page_no, stamp_type

stamp_type recognised: "UNDER ADJUDICATION", "DELETED" (case-insensitive)
All other values → "Active"

Export format (boothwise + full):
  Boothwise: separate sheets per part (Part_085, Part_086…)
  Summary: one row per part with all bias metrics
  Full: Religion (Auto), Religion (Final), Confidence%, Via, Self-mapped flag

Performance: Tested up to 300 parts (~60,000+ voters) in browser.`],
      ["🧭 User Guide",
`1. Start page:
   • Upload raw roll XLSX files
   • Import Session to resume someone else's work
   • Session XLSX is usually smaller than .eimpack

2. Runtime modes:
   • Full forensic = voter rows available, editing/review/duplicates enabled
   • Analysis-only = compact insights workbook loaded, charts/tables only

3. Exports:
   • Report Pack = charts + tables + workbook
   • Session = portable resume file (.eimpack + companion .xlsx)
   • Insights = compact per-part/AC analytical workbook
   • Filtered voter workbook = current filtered voter table only
   • Tokens = CSV / XLSX / JSON token packs

4. Token memory:
   • Review decisions can teach new tokens
   • Token edits persist locally in browser storage
   • Export token packs to share or restore on another machine

5. Sources tab:
   • shows raw files, insight files, overlaps, and precedence decisions
   • raw voter-level rolls always take precedence over insight summaries for the same AC + Part`],
    ];

    return(
      <div style={{display:"flex",flexDirection:"column",gap:14,maxWidth:980}}>
        {blocks.map(([t,b])=>(
        <Panel key={t}>
          <div style={{fontSize:14,fontWeight:700,color:C.blue,marginBottom:10}}>{t}</div>
          <pre style={{fontSize:11.5,color:C.muted,lineHeight:1.9,whiteSpace:"pre-wrap",fontFamily:MONO,margin:0}}>{b}</pre>
        </Panel>
        ))}

        <Panel>
          <div style={{fontSize:14,fontWeight:700,color:C.blue,marginBottom:6}}>🧾 ECI PDF → Excel Workflow (Claude Vision)</div>
          <div style={{fontSize:12,color:C.muted,lineHeight:1.7,marginBottom:10}}>
            We converted image-based ECI voter-roll PDFs into structured Excel using Claude AI (file upload + extraction prompt), then imported those XLSX files into this tool.
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
            <button onClick={()=>copyPlainText(CLAUDE_VOLUNTEER_MESSAGE,"Volunteer request message")}
              style={{padding:"6px 10px",borderRadius:6,border:`1px solid ${C.border}`,background:C.panel,color:C.text,cursor:"pointer",fontSize:12}}>
              Copy Volunteer Message
            </button>
            <button onClick={()=>copyPlainText(CLAUDE_EXTRACTION_PROMPT,"Claude extraction prompt")}
              style={{padding:"6px 10px",borderRadius:6,border:`1px solid ${C.border}`,background:C.panel,color:C.text,cursor:"pointer",fontSize:12}}>
              Copy Claude Prompt
            </button>
          </div>
          <div style={{display:"grid",gap:12}}>
            <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
              <div style={{padding:"8px 10px",fontSize:12,fontWeight:700,color:C.text,background:C.panel}}>Volunteer Request Message (Bangla)</div>
              <pre style={{margin:0,padding:10,maxHeight:260,overflow:"auto",fontSize:11.5,color:C.muted,lineHeight:1.8,whiteSpace:"pre-wrap",fontFamily:MONO}}>{CLAUDE_VOLUNTEER_MESSAGE}</pre>
            </div>
            <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
              <div style={{padding:"8px 10px",fontSize:12,fontWeight:700,color:C.text,background:C.panel}}>Claude Prompt (PDF → XLSX Extraction)</div>
              <pre style={{margin:0,padding:10,maxHeight:300,overflow:"auto",fontSize:11.5,color:C.muted,lineHeight:1.7,whiteSpace:"pre-wrap",fontFamily:MONO}}>{CLAUDE_EXTRACTION_PROMPT}</pre>
            </div>
          </div>
          <div style={{marginTop:10,fontSize:12,color:C.text,lineHeight:1.8}}>
            Contribute extracted Excel files at: <b>wbsir2025@gmail.com</b> or <b>wbsir2026@gmail.com</b>
          </div>
        </Panel>
      </div>
    );
  };

  const renderSources=()=>{
    return(
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <Panel>
          <SH sub="Loaded source files, runtime mode, and precedence decisions">Source Provenance</SH>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:12}}>
            <StatCard label="Runtime Mode" value={analysisOnly?"Analysis-only":"Full forensic"} sub={analysisOnly?"Insights datasets only":"Row-level voters loaded"} color={analysisOnly?C.yellow:C.green}/>
            <StatCard label="Raw Sources" value={Object.keys(loadedFileMeta||{}).length} sub="Voter-level workbooks" color={C.blue}/>
            <StatCard label="Insight Sources" value={insightSources.length} sub="Compact aggregated workbooks" color={C.Muslim}/>
            <StatCard label="Coverage Conflicts" value={provenanceConflicts.length} sub="Overlapping raw/insight or multi-insight parts" color={provenanceConflicts.length?C.adj:C.green}/>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:860}}>
              <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                {["Source File","Type","Imported","AC Coverage","Parts","Rows","Duplicate Of"].map(h=>(
                  <th key={h} style={{padding:"7px 8px",textAlign:h==="Source File"||h==="Type"||h==="AC Coverage"?"left":"right",fontSize:10,color:C.dim,textTransform:"uppercase"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {provenanceRows.map(r=>(
                  <tr key={`${r.fileName}_${r.importedAt}`} style={{borderBottom:`1px solid ${C.border}22`}}>
                    <td style={{padding:"7px 8px",color:C.text,fontFamily:MONO}}>{r.fileName}</td>
                    <td style={{padding:"7px 8px",color:C.muted}}>{r.type}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.dim,fontFamily:MONO}}>{r.importedAt?new Date(r.importedAt).toLocaleString():""}</td>
                    <td style={{padding:"7px 8px",color:C.muted}}>{r.acCoverage||"—"}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.text}}>{r.partCount}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.text}}>{r.rowCount}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.orange}}>{r.duplicateOf||"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel>
          <SH sub="Raw coverage takes precedence over insight coverage for the same AC+Part">Coverage Conflicts</SH>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:900}}>
              <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                {["AC/Part Key","Raw Files","Insight Files","Resolution"].map(h=>(
                  <th key={h} style={{padding:"7px 8px",textAlign:h==="AC/Part Key"?"left":"right",fontSize:10,color:C.dim,textTransform:"uppercase"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {provenanceConflicts.length===0?(
                  <tr><td colSpan={4} style={{padding:"18px 8px",textAlign:"center",color:C.dim}}>No current source conflicts detected.</td></tr>
                ):provenanceConflicts.map(r=>(
                  <tr key={r.key} style={{borderBottom:`1px solid ${C.border}22`}}>
                    <td style={{padding:"7px 8px",color:C.text,fontFamily:MONO}}>{r.key}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.blue}}>{r.rawFiles.join(", ")||"—"}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.Muslim}}>{r.insightFiles.join(", ")||"—"}</td>
                    <td style={{padding:"7px 8px",textAlign:"right"}}><Tag c={r.status} color={r.status==="Raw preferred"?C.adj:C.yellow}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  };

  const renderAnalysisOnlyOverview=()=>{
    const d=analysisOnlyData;
    return(
      <div style={{display:"flex",flexDirection:"column",gap:18}}>
        <div style={{padding:"10px 12px",border:`1px solid ${C.yellow}44`,background:C.yellow+"11",borderRadius:10,fontSize:12,color:C.muted,lineHeight:1.6}}>
          Analysis-only mode is active. This session was loaded from aggregated insights workbooks, so voter-level editing, review queue, duplicate-row inspection, and token learning are disabled.
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>
          <StatCard label="Total Voters" value={d.totals.total.toLocaleString()} sub={`${d.partRows.length} parts`} color={C.blue}/>
          <StatCard label="Under Adjudication" value={d.totals.adj.toLocaleString()} sub={pct(d.totals.adj,d.totals.total)} color={C.adj}/>
          <StatCard label="Deleted" value={d.totals.del.toLocaleString()} sub={pct(d.totals.del,d.totals.total)} color={C.del}/>
          <StatCard label="Muslim Adj Rate" value={pct(Math.round(d.mAR*d.totals.muslim),d.totals.muslim)} sub={`${Math.round(d.mAR*d.totals.muslim)}/${d.totals.muslim}`} color={C.Muslim}/>
          <StatCard label="Hindu Adj Rate" value={pct(Math.round(d.hAR*d.totals.hindu),d.totals.hindu)} sub={`${Math.round(d.hAR*d.totals.hindu)}/${d.totals.hindu}`} color={C.Hindu}/>
          <StatCard label="Bias Ratio" value={ratioStr(d.mAR,d.hAR)} sub="Muslim÷Hindu adj rate" color={(d.hAR>0&&d.mAR/d.hAR>2)?C.adj:C.green}/>
        </div>
        <Panel>
          <SH sub="Part-level insight rows imported from compact workbooks">Part Insights</SH>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:920}}>
              <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                {["AC","Part","Total","Adj","Del","Adj%","Muslim","Hindu","Muslim Adj","Hindu Adj","Source"].map(h=>(
                  <th key={h} style={{padding:"7px 8px",textAlign:h==="AC"||h==="Part"||h==="Source"?"left":"right",fontSize:10,color:C.dim,textTransform:"uppercase"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {d.partRows.map(r=>(
                  <tr key={`${r.ac_no}|${r.part_no}`} style={{borderBottom:`1px solid ${C.border}22`}}>
                    <td style={{padding:"7px 8px",color:C.text}}>{r.ac_no} - {r.ac_name}</td>
                    <td style={{padding:"7px 8px",color:C.text,fontWeight:700}}>P{r.part_no}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.muted}}>{r.total}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.adj}}>{r.adj}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.del}}>{r.del}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.orange}}>{pct(r.adj,r.total)}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.Muslim}}>{r.muslim}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.Hindu}}>{r.hindu}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.Muslim}}>{r.muslimAdj}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",color:C.Hindu}}>{r.hinduAdj}</td>
                    <td style={{padding:"7px 8px",color:C.dim,fontFamily:MONO}}>{r.__source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  };

  const renderAnalysisOnlyReligion=()=>{
    const rows=analysisOnlyData.religionRows;
    return(
      <Panel>
        <SH sub="Derived from part-level insights. Uncertain/Unknown status split is unavailable in compact mode.">Religion Summary (Insights)</SH>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:760}}>
            <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
              {["Religion","Total","Active","Under Adj","Deleted","Adj%","Del%"].map(h=>(
                <th key={h} style={{padding:"7px 8px",textAlign:h==="Religion"?"left":"right",fontSize:10,color:C.dim,textTransform:"uppercase"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.religion} style={{borderBottom:`1px solid ${C.border}22`}}>
                  <td style={{padding:"7px 8px",color:C[r.religion]||C.text,fontWeight:700}}>{r.religion}</td>
                  <td style={{padding:"7px 8px",textAlign:"right",color:C.muted}}>{r.total}</td>
                  <td style={{padding:"7px 8px",textAlign:"right",color:C.blue}}>{r.active??"—"}</td>
                  <td style={{padding:"7px 8px",textAlign:"right",color:C.adj}}>{r.adj??"—"}</td>
                  <td style={{padding:"7px 8px",textAlign:"right",color:C.del}}>{r.del??"—"}</td>
                  <td style={{padding:"7px 8px",textAlign:"right",color:C.orange}}>{r.adjRate??"—"}</td>
                  <td style={{padding:"7px 8px",textAlign:"right",color:C.orange}}>{r.delRate??"—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  };

  const renderAnalysisOnlyAge=()=>{
    const rows=analysisOnlyData.ageRows;
    return(
      <Panel>
        <SH sub="Age totals imported from compact part insights. Age x status is not available without voter-level data.">Age Summary (Insights)</SH>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:520}}>
            <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
              {["Age Group","Total","Share"].map(h=>(
                <th key={h} style={{padding:"7px 8px",textAlign:h==="Age Group"?"left":"right",fontSize:10,color:C.dim,textTransform:"uppercase"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.age} style={{borderBottom:`1px solid ${C.border}22`}}>
                  <td style={{padding:"7px 8px",color:C.text,fontWeight:r.age.includes("★")?700:500}}>{r.age}</td>
                  <td style={{padding:"7px 8px",textAlign:"right",color:C.muted}}>{r.total}</td>
                  <td style={{padding:"7px 8px",textAlign:"right",color:C.orange}}>{pct(r.total,analysisOnlyData.totals.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if(!voters.length&&!loading&&!analysisOnly) return (
    <>
      <UploadScreen onFiles={loadFiles} loading={loading} theme={theme} setTheme={setTheme} onImportSession={()=>sessionFileRef.current?.click()}/>
      <input ref={sessionFileRef} type="file" accept=".eimpack,.json,.xlsx" style={{display:"none"}}
        onChange={e=>handleImportSessionFile(e.target.files?.[0])}/>
    </>
  );

  const headerAcNo=analysisOnly ? (analysisOnlyData.partRows[0]?.ac_no||"–") : (voters[0]?.ac_no||"–");
  const headerAcName=analysisOnly ? (analysisOnlyData.partRows[0]?.ac_name||"–") : (voters[0]?.ac_name||"–");
  const TABS=analysisOnly?[
    {id:"overview",label:"Overview"},
    {id:"religion",label:"Religion"},
    {id:"age",label:"Age Cohorts"},
    {id:"sources",label:`Sources (${provenanceRows.length})`,badge:provenanceConflicts.length},
    {id:"methodology",label:"Methodology"},
  ]:[
    {id:"overview",label:"Overview"},
    {id:"religion",label:"Religion"},
    {id:"age",label:"Age Cohorts"},
    {id:"custom",label:"Custom Analytics"},
    {id:"trends",label:"Trends & Stats"},
    {id:"booths",label:`Booths (${parts.length})`},
    {id:"duplicates",label:`Duplicates (${duplicateGroups.length})`,badge:(duplicateGroups.length+fileDuplicateGroups.length)},
    {id:"voters",label:`Voters (${filtered.length.toLocaleString()})`},
    {id:"review",label:needsReview.length>0?`Review (${needsReview.length})`:"Review",badge:needsReview.length},
    {id:"tokens",label:`Tokens${Object.keys(tokenOverrides).length?` (${Object.keys(tokenOverrides).length}✎)`:""}` },
    {id:"sources",label:`Sources (${provenanceRows.length})`,badge:provenanceConflicts.length},
    {id:"methodology",label:"Methodology"},
  ];

  const tabIds=TABS.map(t=>t.id);
  const swipeBlockedTarget=(target)=>{
    if(!target?.closest) return false;
    if(target.closest("input,textarea,select,option,a,label,[data-no-swipe]")) return true;
    return false;
  };
  const handleSwipeStart=(e)=>{
    if(!mobile) return;
    const t=e.touches?.[0];
    if(!t) return;
    if(swipeBlockedTarget(e.target)) return;
    swipeRef.current={ x:t.clientX, y:t.clientY, active:true };
  };
  const handleSwipeEnd=(e)=>{
    if(!mobile || !swipeRef.current.active) return;
    swipeRef.current.active=false;
    const t=e.changedTouches?.[0];
    if(!t) return;
    const dx=t.clientX-swipeRef.current.x;
    const dy=t.clientY-swipeRef.current.y;
    if(Math.abs(dx)<60 || Math.abs(dy)>42 || Math.abs(dx)<=Math.abs(dy)) return;
    const idx=tabIds.indexOf(tab);
    if(idx<0) return;
    const nextIdx=dx<0?Math.min(tabIds.length-1,idx+1):Math.max(0,idx-1);
    if(nextIdx!==idx) setTab(tabIds[nextIdx]);
  };

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:FONT}}>
      {/* Header */}
      <div style={{borderBottom:`1px solid ${C.border}`,padding:mobile?"10px 12px":"9px 20px",
        display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",
        position:"sticky",top:0,zIndex:30,background:C.bg}}>
        <div style={{flex:1,minWidth:0}}>
          {!mobile&&<div style={{fontSize:9,color:C.dim,letterSpacing:4,textTransform:"uppercase",fontFamily:MONO}}>
            Electoral Integrity Monitor v1.0
          </div>}
          <div style={{fontSize:mobile?15:14,fontWeight:800,color:C.text,letterSpacing:-0.5,
            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            AC {headerAcNo} · {headerAcName} · WB 2026
          </div>
        </div>
        <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap",position:"relative"}}>
          <button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}
            style={{padding:"4px 10px",background:C.panel,border:`1px solid ${C.border}`,
              borderRadius:5,color:C.muted,fontSize:mobile?12:11,cursor:"pointer"}}>
            {theme==="dark"?"☀ Light":"🌙 Dark"}
          </button>
          {!mobile&&(
            <button onClick={()=>setChartStudioOpen(true)}
              style={{padding:"4px 10px",background:C.panel,border:`1px solid ${C.border}`,
                borderRadius:5,color:C.muted,fontSize:11,cursor:"pointer"}}>
              Chart Studio
            </button>
          )}
          {Object.keys(overrides).length>0&&!mobile&&(
            <span style={{fontSize:11,color:C.yellow,fontFamily:MONO}}>
              ✎ {Object.keys(overrides).length}
            </span>
          )}
          {!mobile&&<span style={{background:C.panel,borderRadius:16,padding:"2px 10px",
            fontSize:11,color:C.dim,fontFamily:MONO}}>
            {(analysisOnly?analysisOnlyData.totals.total:voters.length).toLocaleString()} · {(analysisOnly?analysisOnlyData.partRows.length:parts.length)} parts
          </span>}
          {!mobile&&duplicateGroups.length>0&&(
            <span style={{background:C.orange+"22",border:`1px solid ${C.orange}44`,borderRadius:16,padding:"2px 8px",
              fontSize:11,color:C.orange,fontFamily:MONO}}>
              dup {duplicateGroups.length}
            </span>
          )}
          {!mobile&&(
            <>
              <button onClick={exportReportPack} disabled={reportBusy||analysisOnly}
                style={{padding:"4px 10px",background:C.green+"22",border:`1px solid ${C.green}44`,
                  borderRadius:5,color:C.green,fontSize:11,cursor:reportBusy?"default":"pointer",fontWeight:600,
                  opacity:(reportBusy||analysisOnly)?0.6:1}}>
                {reportBusy?"Exporting…":"Export Report Pack"}
              </button>
              <button onClick={exportSessionPack}
                style={{padding:"4px 10px",background:C.panel,border:`1px solid ${C.border}`,
                  borderRadius:5,color:C.muted,fontSize:11,cursor:"pointer",fontWeight:600}}>
                Export Session
              </button>
              <button onClick={()=>exportInsightsWorkbook(voters.map(v=>({...v,override:overrides[v._uid]||null})))} disabled={analysisOnly}
                style={{padding:"4px 10px",background:C.panel,border:`1px solid ${C.border}`,
                  borderRadius:5,color:C.muted,fontSize:11,cursor:"pointer",fontWeight:600,opacity:analysisOnly?0.6:1}}>
                Export Insights
              </button>
              <button onClick={()=>sessionFileRef.current?.click()}
                style={{padding:"4px 10px",background:C.panel,border:`1px solid ${C.border}`,
                  borderRadius:5,color:C.muted,fontSize:11,cursor:"pointer",fontWeight:600}}>
                Import Session
              </button>
            </>
          )}
          <button onClick={()=>fileRef.current?.click()}
            style={{padding:"4px 10px",background:C.blue+"22",border:`1px solid ${C.blue}44`,
              borderRadius:5,color:C.blue,fontSize:mobile?12:11,cursor:"pointer",fontWeight:600}}>
            + Load
          </button>
          {!mobile&&(
            <button onClick={()=>{if(window.confirm("Clear all data and saved state?"))
              {setVoters([]);setOverrides({});setTokenOverrides({});setLoadedFiles({});setLoadedFileMeta({});setLoadedInsightsMeta({});
               setTokenLearnCount(0);
               try{["eim_voters","eim_overrides","eim_tokenOverrides","eim_tokenLearnCount","eim_loadedFiles","eim_loadedFileMeta","eim_loadedInsightsMeta"]
                 .forEach(k=>localStorage.removeItem(k));}catch{}
              }}}
              style={{padding:"4px 10px",background:C.panel,border:`1px solid ${C.border}`,
                borderRadius:5,color:C.dim,fontSize:11,cursor:"pointer"}}>
              Reset
            </button>
          )}
          {mobile&&(
            <>
              <button onClick={()=>setMobileMenuOpen(v=>!v)}
                style={{padding:"4px 10px",background:C.panel,border:`1px solid ${C.border}`,
                  borderRadius:5,color:C.muted,fontSize:12,cursor:"pointer",fontWeight:700}}>
                More
              </button>
              {mobileMenuOpen&&(
                <div style={{position:"absolute",top:"100%",right:0,marginTop:6,minWidth:210,zIndex:40,
                  background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:8,
                  boxShadow:"0 12px 30px rgba(0,0,0,0.25)",display:"flex",flexDirection:"column",gap:6}}>
                  <button onClick={()=>{setMobileMenuOpen(false);setChartStudioOpen(true);}}
                    style={{padding:"8px 10px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12,cursor:"pointer",textAlign:"left"}}>Chart Studio</button>
                  <button onClick={()=>{setMobileMenuOpen(false);if(!analysisOnly) exportReportPack();}}
                    disabled={reportBusy||analysisOnly}
                    style={{padding:"8px 10px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:analysisOnly?C.dim:C.text,fontSize:12,cursor:(reportBusy||analysisOnly)?"default":"pointer",textAlign:"left",opacity:(reportBusy||analysisOnly)?0.6:1}}>{reportBusy?"Exporting…":"Export Report Pack"}</button>
                  <button onClick={()=>{setMobileMenuOpen(false);exportSessionPack();}}
                    style={{padding:"8px 10px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12,cursor:"pointer",textAlign:"left"}}>Export Session</button>
                  <button onClick={()=>{setMobileMenuOpen(false);if(!analysisOnly) exportInsightsWorkbook(voters.map(v=>({...v,override:overrides[v._uid]||null})));}}
                    disabled={analysisOnly}
                    style={{padding:"8px 10px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:analysisOnly?C.dim:C.text,fontSize:12,cursor:analysisOnly?"default":"pointer",textAlign:"left",opacity:analysisOnly?0.6:1}}>Export Insights</button>
                  <button onClick={()=>{setMobileMenuOpen(false);sessionFileRef.current?.click();}}
                    style={{padding:"8px 10px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12,cursor:"pointer",textAlign:"left"}}>Import Session</button>
                  {Object.keys(overrides).length>0&&(
                    <div style={{padding:"4px 2px",fontSize:11,color:C.yellow,fontFamily:MONO}}>✎ {Object.keys(overrides).length} overrides</div>
                  )}
                  <div style={{padding:"4px 2px",fontSize:11,color:C.dim,fontFamily:MONO}}>
                    {(analysisOnly?analysisOnlyData.totals.total:voters.length).toLocaleString()} · {(analysisOnly?analysisOnlyData.partRows.length:parts.length)} parts
                  </div>
                  {duplicateGroups.length>0&&(
                    <div style={{padding:"4px 2px",fontSize:11,color:C.orange,fontFamily:MONO}}>
                      dup {duplicateGroups.length}
                    </div>
                  )}
                  <button onClick={()=>{setMobileMenuOpen(false);if(window.confirm("Clear all data and saved state?"))
                    {setVoters([]);setOverrides({});setTokenOverrides({});setLoadedFiles({});setLoadedFileMeta({});setLoadedInsightsMeta({});
                     setTokenLearnCount(0);
                     try{["eim_voters","eim_overrides","eim_tokenOverrides","eim_tokenLearnCount","eim_loadedFiles","eim_loadedFileMeta","eim_loadedInsightsMeta"]
                       .forEach(k=>localStorage.removeItem(k));}catch{}
                    }}}
                    style={{padding:"8px 10px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:C.red,fontSize:12,cursor:"pointer",textAlign:"left"}}>Reset</button>
                </div>
              )}
            </>
          )}
          <input ref={fileRef} type="file" accept=".xlsx" multiple style={{display:"none"}}
            onChange={e=>loadFiles(Array.from(e.target.files))}/>
          <input ref={sessionFileRef} type="file" accept=".eimpack,.json,.xlsx" style={{display:"none"}}
            onChange={e=>handleImportSessionFile(e.target.files?.[0])}/>
        </div>
      </div>

      {/* Replace / Cancel modal for already-loaded files */}
      {replaceModal&&(
        <div style={{position:"fixed",inset:0,background:"#00000099",zIndex:70,
          display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{width:"min(620px,96vw)",maxHeight:"92vh",display:"flex",flexDirection:"column",
            background:C.panel,border:`1px solid ${C.orange}66`,borderRadius:12,padding:20}}>
            <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:6}}>
              ⚠ Duplicate Roll Detected
            </div>
            <div style={{fontSize:13,color:C.muted,marginBottom:14,lineHeight:1.6}}>
              {replaceModal.conflicting?.length>0&&`Some files already exist by filename.`}
              {replaceModal.contentConflicts?.length>0&&`${replaceModal.conflicting?.length>0?" ":""}Some files have duplicate content hash with already loaded rolls.`}
            </div>
            <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:12,color:C.dim,marginBottom:8}}>
              <span><b style={{color:C.text}}>{replaceModal.conflicting?.length||0}</b> filename matches</span>
              <span><b style={{color:C.text}}>{replaceModal.contentConflicts?.length||0}</b> content duplicates</span>
              <span><b style={{color:C.text}}>{replaceModal.newOnly?.length||0}</b> new files</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12,overflowY:"auto",maxHeight:"44vh",paddingRight:4}}>
              {(replaceModal.conflicting||[]).map(p=>(
                <div key={p.file.name} style={{display:"flex",alignItems:"center",gap:10,
                  padding:"8px 12px",background:C.bg,borderRadius:8,
                  border:`1px solid ${C.orange}44`}}>
                  <span style={{fontSize:18}}>📄</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:MONO,fontSize:12,color:C.text,fontWeight:700}}>{p.file.name}</div>
                    {loadedFiles[p.file.name]&&(
                      <div style={{fontSize:11,color:C.dim}}>
                        Parts loaded: {loadedFiles[p.file.name].map(part=>`P${part}`).join(", ")||"–"}
                      </div>
                    )}
                  </div>
                  <span style={{fontSize:11,padding:"2px 8px",background:C.orange+"22",
                    border:`1px solid ${C.orange}44`,borderRadius:4,color:C.orange,fontWeight:700}}>
                    NAME MATCH
                  </span>
                </div>
              ))}
              {(replaceModal.contentConflicts||[]).map(x=>(
                <div key={`${x.plan.file.name}_${x.existingName}`} style={{display:"flex",alignItems:"center",gap:10,
                  padding:"8px 12px",background:C.bg,borderRadius:8,border:`1px solid ${C.yellow}44`}}>
                  <span style={{fontSize:18}}>🧬</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:MONO,fontSize:12,color:C.text,fontWeight:700}}>
                      {x.plan.file.name} ↔ {x.existingName}
                    </div>
                    <div style={{fontSize:11,color:C.dim}}>
                      Same file content hash detected
                    </div>
                  </div>
                  <span style={{fontSize:11,padding:"2px 8px",background:C.yellow+"22",
                    border:`1px solid ${C.yellow}44`,borderRadius:4,color:C.yellow,fontWeight:700}}>
                    CONTENT DUP
                  </span>
                </div>
              ))}
            </div>
            {replaceModal.newOnly.length>0&&(
              <div style={{fontSize:12,color:C.dim,marginBottom:14}}>
                New files (will be added regardless):{" "}
                {replaceModal.newOnly.map(p=><span key={p.file.name}
                  style={{fontFamily:MONO,color:C.text,marginRight:6}}>{p.file.name}</span>)}
              </div>
            )}
            <div style={{fontSize:12,color:C.muted,marginBottom:18,
              padding:"10px 14px",background:C.bg,borderRadius:8,lineHeight:1.6}}>
              <b style={{color:C.text}}>Replace Existing</b> — removes previously loaded duplicate roll(s) and loads new file(s).<br/>
              <b style={{color:C.text}}>Add Anyway</b> — appends on top (may create duplicates).<br/>
              <b style={{color:C.text}}>Discard Duplicates</b> — loads only non-duplicate file{replaceModal.newOnly.length!==1?"s":""}.
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap",position:"sticky",bottom:0,background:C.panel,paddingTop:8}}>
              <button onClick={()=>setReplaceModal(null)}
                style={{padding:"7px 16px",background:"transparent",
                  border:`1px solid ${C.border}`,borderRadius:7,
                  color:C.muted,fontSize:13,cursor:"pointer"}}>
                Cancel
              </button>
              {replaceModal.newOnly.length>0&&(
                <button onClick={async()=>{
                  const m=replaceModal; setReplaceModal(null);
                  await doLoadFiles(m.newOnly,new Set());
                }} style={{padding:"7px 16px",background:C.blue+"22",
                  border:`1px solid ${C.blue}44`,borderRadius:7,
                  color:C.blue,fontSize:13,cursor:"pointer",fontWeight:600}}>
                  Discard Duplicates
                </button>
              )}
              <button onClick={async()=>{
                const m=replaceModal; setReplaceModal(null);
                await doLoadFiles(m.all,new Set());
              }} style={{padding:"7px 16px",background:C.yellow+"22",
                border:`1px solid ${C.yellow}44`,borderRadius:7,
                color:C.yellow,fontSize:13,cursor:"pointer",fontWeight:600}}>
                Add Anyway
              </button>
              <button onClick={async()=>{
                const m=replaceModal; setReplaceModal(null);
                await doLoadFiles(m.all,new Set([
                  ...(m.conflicting||[]).map(p=>p.file.name),
                  ...(m.contentConflicts||[]).map(x=>x.existingName),
                ]));
              }} style={{padding:"7px 16px",background:C.adj+"22",
                border:`1px solid ${C.adj}44`,borderRadius:7,
                color:C.adj,fontSize:13,cursor:"pointer",fontWeight:700}}>
                Replace Existing
              </button>
            </div>
          </div>
        </div>
      )}

      {ingestPlanModal&&(
        <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:78,display:"flex",alignItems:"center",justifyContent:"center",padding:12}}>
          <div style={{width:"min(980px,96vw)",maxHeight:"90vh",overflow:"auto",background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div>
                <div style={{fontSize:15,fontWeight:800,color:C.text}}>Upload Planner</div>
                <div style={{fontSize:12,color:C.dim,marginTop:2}}>Detected file types, overlap rules, and planned ingest actions before loading.</div>
              </div>
              <button onClick={()=>setIngestPlanModal(null)} style={{padding:"4px 8px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:C.dim,cursor:"pointer"}}>Close</button>
            </div>
            {ingestPlanModal.overlaps?.length>0&&(
              <div style={{marginBottom:10,padding:"10px 12px",border:`1px solid ${C.yellow}44`,background:C.yellow+"11",borderRadius:8,fontSize:12,color:C.muted}}>
                Overlap detected inside this batch for {ingestPlanModal.overlaps.length} AC/Part coverage key(s). Raw voter workbooks are preferred over insights for the same coverage.
              </div>
            )}
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:980}}>
                <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {["File","Detected Type","AC Coverage","Parts","Action","Raw Overlap","Insight Overlap","Internal Conflict"].map(h=>(
                    <th key={h} style={{padding:"7px 8px",textAlign:h==="File"||h==="Detected Type"||h==="AC Coverage"?"left":"right",fontSize:10,color:C.dim,textTransform:"uppercase"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {ingestPlanModal.plans.map(p=>(
                    <tr key={p.file.name} style={{borderBottom:`1px solid ${C.border}22`}}>
                      <td style={{padding:"7px 8px",color:C.text,fontFamily:MONO}}>{p.file.name}</td>
                      <td style={{padding:"7px 8px",color:C.muted}}>{p.label}</td>
                      <td style={{padding:"7px 8px",color:C.muted}}>{(p.coverage?.acPairs||[]).map(v=>v.replace("|"," - ")).join("; ")||"—"}</td>
                      <td style={{padding:"7px 8px",textAlign:"right",color:C.text}}>{(p.coverage?.parts||[]).length}</td>
                      <td style={{padding:"7px 8px",textAlign:"right"}}>
                        <Tag c={p.plannedAction==="load-voters"?"Load voters":p.plannedAction==="catalog-insights"?"Catalog insights":p.plannedAction==="use-import-session"?"Use Import Session":"Skip"} color={p.plannedAction==="skip"?C.dim:(p.plannedAction==="catalog-insights"?C.Muslim:C.blue)}/>
                      </td>
                      <td style={{padding:"7px 8px",textAlign:"right",color:(p.overlapWithRaw||[]).length?C.adj:C.dim}}>{(p.overlapWithRaw||[]).length||"—"}</td>
                      <td style={{padding:"7px 8px",textAlign:"right",color:(p.overlapWithInsights||[]).length?C.yellow:C.dim}}>{(p.overlapWithInsights||[]).length||"—"}</td>
                      <td style={{padding:"7px 8px",textAlign:"right",color:(p.internalConflicts||[]).length?C.adj:C.dim}}>{(p.internalConflicts||[]).length||"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{marginTop:12,display:"flex",justifyContent:"flex-end",gap:8}}>
              <button onClick={()=>setIngestPlanModal(null)} style={{padding:"6px 10px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:C.dim,cursor:"pointer"}}>Cancel</button>
              <button onClick={async()=>{
                const m=ingestPlanModal;
                setIngestPlanModal(null);
                await executePlannedUpload(m.plans);
              }} style={{padding:"6px 12px",background:C.blue+"22",border:`1px solid ${C.blue}44`,borderRadius:6,color:C.blue,cursor:"pointer",fontWeight:700}}>Continue</button>
            </div>
          </div>
        </div>
      )}

      {/* Column mapping modal */}
      {colMapModal&&(()=>{
        const {file,actualCols,mapping,missing,resolve}=colMapModal;
        const LABELS={
          name:"Voter Name",relation_name:"Father / Husband Name",voter_id:"Voter ID / EPIC",
          serial_no:"Serial No",part_no:"Part / Booth No",age:"Age",gender:"Gender",
          stamp_type:"Status / Stamp Type",
        };
        // local state for the modal lives in colMapModal.mapping (mutable ref pattern via setColMapModal)
        const updateMap=(canonical,actual)=>{
          setColMapModal(prev=>({...prev,mapping:{...prev.mapping,[canonical]:actual}}));
        };
        const currentMissing=Object.keys(LABELS).filter(r=>!colMapModal.mapping[r]);
        return(
          <div style={{position:"fixed",inset:0,background:"#00000099",zIndex:80,
            display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div style={{width:"min(560px,96vw)",background:C.panel,
              border:`1px solid ${C.blue}66`,borderRadius:12,padding:24,maxHeight:"90vh",overflowY:"auto"}}>
              <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:4}}>
                🔗 Map Columns — <span style={{fontFamily:MONO,fontSize:13,color:C.muted}}>{file}</span>
              </div>
              <div style={{fontSize:12,color:C.muted,marginBottom:16,lineHeight:1.6}}>
                Some column names didn't match automatically. Please select which column in your file corresponds to each required field.
                Already auto-matched fields are pre-filled — you can correct them if needed.
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
                {Object.entries(LABELS).map(([canonical,label])=>{
                  const mapped=colMapModal.mapping[canonical];
                  const isMissing=!mapped;
                  return(
                    <div key={canonical} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,
                      alignItems:"center",padding:"8px 12px",borderRadius:8,
                      background:isMissing?"#ef444408":mapped&&mapped!==canonical?"#22c55e08":C.bg,
                      border:`1px solid ${isMissing?"#ef444444":mapped&&mapped!==canonical?"#22c55e33":C.border}`}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:isMissing?"#ef4444":C.text}}>{label}</div>
                        <div style={{fontSize:10,fontFamily:MONO,color:C.dim}}>{canonical}</div>
                      </div>
                      <select value={mapped||""}
                        onChange={e=>updateMap(canonical,e.target.value||undefined)}
                        style={{width:"100%",background:C.bg,border:`1px solid ${isMissing?"#ef444466":C.border}`,
                          borderRadius:6,padding:"5px 8px",color:mapped?C.text:C.dim,
                          fontSize:12,fontFamily:FONT}}>
                        <option value="">— not mapped —</option>
                        {actualCols.map(c=>(
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              {currentMissing.length>0&&(
                <div style={{marginBottom:14,padding:"8px 12px",background:"#ef444408",
                  border:"1px solid #ef444444",borderRadius:8,fontSize:12,color:"#ef4444"}}>
                  Still unmapped: {currentMissing.map(c=>LABELS[c]).join(", ")}
                </div>
              )}
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button onClick={()=>{setColMapModal(null);resolve(null);}}
                  style={{padding:"7px 16px",background:"transparent",
                    border:`1px solid ${C.border}`,borderRadius:7,
                    color:C.muted,fontSize:13,cursor:"pointer"}}>
                  Skip this file
                </button>
                <button
                  disabled={currentMissing.length>0}
                  onClick={()=>{const m=colMapModal;setColMapModal(null);m.resolve(m.mapping);}}
                  style={{padding:"7px 18px",
                    background:currentMissing.length>0?C.border:C.Muslim,
                    border:"none",borderRadius:7,
                    color:currentMissing.length>0?C.dim:"#fff",
                    fontSize:13,fontWeight:700,
                    cursor:currentMissing.length>0?"not-allowed":"pointer"}}>
                  Load File ✓
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {voterEditModal&&(
        <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:79,display:"flex",alignItems:"center",justifyContent:"center",padding:12}}>
          <div style={{width:"min(760px,96vw)",background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:14,fontWeight:700,color:C.text}}>Edit Voter Data (OCR correction)</div>
              <button onClick={()=>setVoterEditModal(null)} style={{padding:"4px 8px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:C.dim,cursor:"pointer"}}>Close</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8}}>
              {[
                ["name","Name"],["relation_name","Relative Name"],["age","Age"],["gender","Gender"],
                ["voter_id","Voter ID"],["serial_no","Serial No"],["house_no","House No"],["page_no","Page No"],
              ].map(([k,l])=>(
                <div key={k}>
                  <div style={{fontSize:11,color:C.dim,marginBottom:4}}>{l}</div>
                  <input value={voterEditModal?.draft?.[k]??""}
                    onChange={e=>setVoterEditModal(m=>({...m,draft:{...m.draft,[k]:e.target.value}}))}
                    style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
                </div>
              ))}
              <div>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Status</div>
                <select value={voterEditModal?.draft?.status||"Active"}
                  onChange={e=>setVoterEditModal(m=>({...m,draft:{...m.draft,status:e.target.value}}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}>
                  <option value="Active">Active</option>
                  <option value="Under Adjudication">Under Adjudication</option>
                  <option value="Deleted">Deleted</option>
                </select>
              </div>
              <div>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Religion Override</div>
                <select value={voterEditModal?.draft?.religion_override||""}
                  onChange={e=>setVoterEditModal(m=>({...m,draft:{...m.draft,religion_override:e.target.value}}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}>
                  <option value="">Auto (classifier)</option>
                  <option value="Muslim">Muslim</option>
                  <option value="Hindu">Hindu</option>
                  <option value="Uncertain">Uncertain</option>
                  <option value="Unknown">Unknown</option>
                </select>
              </div>
            </div>
            <div style={{marginTop:10,fontSize:11,color:C.dim}}>
              Save will re-run religion detection using both elector and relative name, and refresh status/age-group fields.
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:12}}>
              <button onClick={()=>setVoterEditModal(null)} style={{padding:"6px 10px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:C.dim,cursor:"pointer"}}>Cancel</button>
              <button onClick={saveVoterEdit} style={{padding:"6px 12px",background:C.blue+"22",border:`1px solid ${C.blue}44`,borderRadius:6,color:C.blue,cursor:"pointer",fontWeight:700}}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* File warnings banner */}
      {fileWarnings.length>0&&(
        <div style={{background:"#1a0a00",borderBottom:`1px solid ${C.orange}44`,padding:"8px 20px"}}>
          {fileWarnings.map((w,i)=>(
            <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:i<fileWarnings.length-1?4:0}}>
              <span style={{color:w.type==="error"?C.adj:w.type==="info"?C.blue:C.orange,fontWeight:700,fontSize:12,flexShrink:0}}>
                {w.type==="error"?"✗ Error":w.type==="info"?"ℹ Mapped":"⚠ Warning"}
              </span>
              <span style={{fontSize:12,color:C.text}}>
                <span style={{fontFamily:MONO,color:C.muted}}>{w.file}</span>
                {" — "}{w.msg}
              </span>
            </div>
          ))}
          <button onClick={()=>setFileWarnings([])}
            style={{marginTop:6,padding:"2px 8px",fontSize:10,
              background:"transparent",border:`1px solid ${C.border}`,
              borderRadius:4,color:C.dim,cursor:"pointer"}}>
            Dismiss all
          </button>
        </div>
      )}


      {/* Upload summary popup */}
      {uploadSummary&&(
        <div style={{position:"fixed",inset:0,background:"#00000099",zIndex:60,
          display:"flex",alignItems:"center",justifyContent:"center",padding:12}}>
          <div style={{width:"min(1100px,96vw)",maxHeight:"88vh",overflow:"auto",
            background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:C.text}}>Upload Summary</div>
                <div style={{fontSize:11,color:C.dim,fontFamily:MONO}}>
                  {uploadSummary.files} file(s) · {uploadSummary.parts} parts · {uploadSummary.loaded.toLocaleString()} voters
                </div>
                <div style={{fontSize:11,color:C.dim,fontFamily:MONO,marginTop:2}}>
                  AC: {uploadSummary.acCoverage||"Not detected"}
                </div>
              </div>
              <button onClick={()=>setUploadSummary(null)}
                style={{padding:"4px 10px",background:"transparent",border:`1px solid ${C.border}`,
                  borderRadius:6,color:C.dim,cursor:"pointer",fontSize:11}}>
                Close
              </button>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginBottom:10}}>
              <StatCard label="Needs Review" value={uploadSummary.review} color={uploadSummary.review>0?C.yellow:C.green}
                sub={`${uploadSummary.unknown} Unknown · ${uploadSummary.uncertain} Uncertain`}/>
              <StatCard label="Unknown" value={uploadSummary.unknown} color={C.Unknown}/>
              <StatCard label="Uncertain" value={uploadSummary.uncertain} color={C.Uncertain}/>
              <StatCard label="Duplicates" value={uploadSummary.duplicates||0} color={(uploadSummary.duplicates||0)>0?C.orange:C.green}
                sub={`${uploadSummary.duplicateGroups||0} duplicate groups`}/>
            </div>

            <div style={{overflowX:"auto",border:`1px solid ${C.border}`,borderRadius:8}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:820,fontSize:11}}>
                <thead style={{background:C.bg}}>
                  <tr style={{borderBottom:`1px solid ${C.border}`}}>
                    {["AC No","AC Name","Part","Total","Active","UA","Deleted","Muslim","Hindu","Uncertain","Unknown","<45","45+","Review","Dup"].map(h=>(
                      <th key={h} style={{padding:"7px 8px",textAlign:["AC No","AC Name","Part"].includes(h)?"left":"right",
                        color:C.dim,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uploadSummary.partRows.map(r=>(
                    <tr key={`${r.acNo||"?"}_${r.part}`} style={{borderBottom:`1px solid ${C.border}22`}}>
                      <td style={{padding:"6px 8px",color:C.muted,fontFamily:MONO}}>{r.acNo||"—"}</td>
                      <td style={{padding:"6px 8px",color:C.muted,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.acName||""}>{r.acName||"—"}</td>
                      <td style={{padding:"6px 8px",color:C.blue,fontFamily:MONO,fontWeight:700}}>P{r.part}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",color:C.muted}}>{r.total}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",color:C.active}}>{r.active}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",color:C.adj}}>{r.adj}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",color:C.del}}>{r.del}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",color:C.Muslim}}>{r.muslim}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",color:C.Hindu}}>{r.hindu}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",color:C.Uncertain}}>{r.uncertain}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",color:C.Unknown}}>{r.unknown}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",color:C.muted}}>{r.below45}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",color:C.muted}}>{r.age45Plus}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",color:r.review>0?C.yellow:C.dim,fontWeight:r.review>0?700:400}}>
                        {r.review}
                      </td>
                      <td style={{padding:"6px 8px",textAlign:"right",color:r.duplicates>0?C.orange:C.dim,fontWeight:r.duplicates>0?700:400}}>
                        {r.duplicates||0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginTop:10,flexWrap:"wrap"}}>
              <div style={{fontSize:11,color:C.dim}}>
                Review = voters auto-classified as <b>Unknown</b> or <b>Uncertain</b> in this upload batch.
              </div>
              <div style={{display:"flex",gap:6}}>
                <button
                  onClick={()=>{
                    const rows=uploadSummary.partRows.map(r=>({
                      "AC No":r.acNo||"","AC Name":r.acName||"",Part:r.part,Total:r.total,Active:r.active,"Under Adjudication":r.adj,Deleted:r.del,
                      Muslim:r.muslim,Hindu:r.hindu,Uncertain:r.uncertain,Unknown:r.unknown,
                      "<45":r.below45,"45+":r.age45Plus,Review:r.review,Duplicates:r.duplicates||0,
                    }));
                    exportXLSX(rows,`Upload_Summary_${new Date().toISOString().slice(0,10)}.xlsx`,"Upload_Summary");
                  }}
                  style={{padding:"5px 10px",background:C.green+"22",border:`1px solid ${C.green}44`,
                    borderRadius:6,color:C.green,cursor:"pointer",fontSize:11}}>
                  Export Upload Summary
                </button>
                {uploadSummary.review>0&&(
                  <button onClick={()=>{setTab("review");setUploadSummary(null);}}
                    style={{padding:"5px 10px",background:C.yellow+"22",border:`1px solid ${C.yellow}44`,
                      borderRadius:6,color:C.yellow,cursor:"pointer",fontSize:11}}>
                    Open Review ({uploadSummary.review})
                  </button>
                )}
                <button onClick={()=>setUploadSummary(null)}
                  style={{padding:"5px 10px",background:C.blue+"22",border:`1px solid ${C.blue}44`,
                    borderRadius:6,color:C.blue,cursor:"pointer",fontSize:11}}>
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {chartStudioOpen&&(
        <div style={{position:"fixed",inset:0,background:"#00000066",zIndex:74,display:"flex",alignItems:"center",justifyContent:"center",padding:12}}>
          <div style={{width:"min(760px,96vw)",maxHeight:"90vh",overflow:"auto",background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:14,fontWeight:700,color:C.text}}>Chart Studio</div>
              <button onClick={()=>setChartStudioOpen(false)} style={{padding:"4px 8px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:C.dim,cursor:"pointer"}}>Close</button>
            </div>
            <div style={{fontSize:11,color:C.dim,marginBottom:8}}>
              Controls below affect chart preview and chart exports.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:8}}>
              <label style={{fontSize:12,color:C.text,display:"flex",alignItems:"center",gap:6}}>
                <input type="checkbox" checked={!!chartPrefs.showLegend}
                  onChange={e=>setChartPrefs(p=>({...p,showLegend:e.target.checked}))}/> Show legend
              </label>
              <label style={{fontSize:12,color:C.text,display:"flex",alignItems:"center",gap:6}}>
                <input type="checkbox" checked={!!chartPrefs.showValueLabels}
                  onChange={e=>setChartPrefs(p=>({...p,showValueLabels:e.target.checked}))}/> Show value labels
              </label>
              <div>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Value label position</div>
                <select value={chartPrefs.valueLabelPos}
                  onChange={e=>setChartPrefs(p=>({...p,valueLabelPos:e.target.value}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12}}>
                  <option value="top">Top</option>
                  <option value="inside">Inside</option>
                  <option value="right">Right</option>
                </select>
              </div>
              <div>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>X-axis label</div>
                <input value={chartPrefs.xAxisLabel||""}
                  onChange={e=>setChartPrefs(p=>({...p,xAxisLabel:e.target.value}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Y-axis label</div>
                <input value={chartPrefs.yAxisLabel||""}
                  onChange={e=>setChartPrefs(p=>({...p,yAxisLabel:e.target.value}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Chart scale ({chartScale.toFixed(2)}x)</div>
                <input type="range" min="0.75" max="2" step="0.05" value={chartScale}
                  onChange={e=>setChartPrefs(p=>({...p,chartScale:+e.target.value}))}
                  style={{width:"100%"}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Custom analytics height ({customAnalyticsBaseHeight}px)</div>
                <input type="range" min="240" max="900" step="20" value={customAnalyticsBaseHeight}
                  onChange={e=>setChartPrefs(p=>({...p,customAnalyticsHeight:+e.target.value}))}
                  style={{width:"100%"}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Booth report chart height ({boothReportBaseHeight}px)</div>
                <input type="range" min="240" max="900" step="20" value={boothReportBaseHeight}
                  onChange={e=>setChartPrefs(p=>({...p,boothReportHeight:+e.target.value}))}
                  style={{width:"100%"}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Booth report columns</div>
                <select value={String(chartPrefs.boothReportCols||2)}
                  onChange={e=>setChartPrefs(p=>({...p,boothReportCols:+e.target.value}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12}}>
                  <option value="1">1 column</option>
                  <option value="2">2 columns</option>
                </select>
              </div>
              {[
                ["activeColor","Active"],["underAdjColor","Under Adj"],["deletedColor","Deleted"],["muslimColor","Muslim"],["hinduColor","Hindu"],
              ].map(([k,label])=>(
                <div key={k}>
                  <div style={{fontSize:11,color:C.dim,marginBottom:4}}>{label} color</div>
                  <input type="color" value={normalizeHexColor(chartPrefs[k],"#3b82f6")}
                    onChange={e=>setChartPrefs(p=>({...p,[k]:normalizeHexColor(e.target.value,"#3b82f6")}))}
                    style={{width:"100%",height:34,padding:0,border:`1px solid ${C.border}`,borderRadius:6,background:C.bg}}/>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {boothFigureSettingsOpen&&(
        <div style={{position:"fixed",inset:0,background:"#00000066",zIndex:74,display:"flex",alignItems:"center",justifyContent:"center",padding:12}}>
          <div style={{width:"min(420px,94vw)",background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:14,fontWeight:700,color:C.text}}>Booth Figure Settings</div>
              <button onClick={()=>setBoothFigureSettingsOpen(false)} style={{padding:"4px 8px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:C.dim,cursor:"pointer"}}>Close</button>
            </div>
            <div style={{fontSize:11,color:C.dim,marginBottom:10}}>
              These controls change the live booth report figure size on screen. Export will capture the resized figure.
            </div>
            <div style={{display:"grid",gap:10}}>
              <div>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Chart height ({boothReportBaseHeight}px)</div>
                <input type="range" min="240" max="900" step="20" value={boothReportBaseHeight}
                  onChange={e=>setChartPrefs(p=>({...p,boothReportHeight:+e.target.value}))}
                  style={{width:"100%"}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Height value</div>
                <input type="number" min="240" max="900" step="20" value={boothReportBaseHeight}
                  onChange={e=>setChartPrefs(p=>({...p,boothReportHeight:+e.target.value||320}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Layout</div>
                <select value={String(chartPrefs.boothReportCols||2)}
                  onChange={e=>setChartPrefs(p=>({...p,boothReportCols:+e.target.value}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12}}>
                  <option value="1">Single column</option>
                  <option value="2">Two columns</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {chartExportModal&&(
        <div style={{position:"fixed",inset:0,background:"#00000066",zIndex:75,display:"flex",alignItems:"center",justifyContent:"center",padding:12}}>
          <div style={{width:"min(560px,95vw)",background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:14,fontWeight:700,color:C.text}}>Export Chart</div>
              <button onClick={()=>setChartExportModal(null)} style={{padding:"4px 8px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:C.dim,cursor:"pointer"}}>Close</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Filename</div>
                <input value={chartExportModal.filename||""}
                  onChange={e=>setChartExportModal(m=>({...m,filename:e.target.value}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Format</div>
                <select value={chartExportModal.format||"png"}
                  onChange={e=>setChartExportModal(m=>({...m,format:e.target.value}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12}}>
                  <option value="png">PNG</option>
                  <option value="svg">SVG</option>
                  <option value="csv">CSV (chart data)</option>
                </select>
              </div>
              <div style={{gridColumn:"1 / -1"}}>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Title</div>
                <input value={chartExportModal.title||""}
                  onChange={e=>setChartExportModal(m=>({...m,title:e.target.value}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div style={{gridColumn:"1 / -1"}}>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Subtitle</div>
                <input value={chartExportModal.subtitle||""}
                  onChange={e=>setChartExportModal(m=>({...m,subtitle:e.target.value}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div style={{gridColumn:"1 / -1"}}>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Footnote</div>
                <input value={chartExportModal.note||""}
                  onChange={e=>setChartExportModal(m=>({...m,note:e.target.value}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
              </div>
              {chartExportModal.format!=="csv"&&(
                <>
                  <div>
                    <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Width</div>
                    <input type="number" min="400" max="12000" value={chartExportModal.width||1400}
                      onChange={e=>setChartExportModal(m=>({...m,width:+e.target.value||1400}))}
                      style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Height</div>
                    <input type="number" min="300" max="12000" value={chartExportModal.height||800}
                      onChange={e=>setChartExportModal(m=>({...m,height:+e.target.value||800}))}
                      style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Scale</div>
                    <input type="number" step="0.5" min="1" max="4" value={chartExportModal.scale||2}
                      onChange={e=>setChartExportModal(m=>({...m,scale:+e.target.value||2}))}
                      style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Background</div>
                    <input type="color" value={normalizeHexColor(chartExportModal.background,normalizeHexColor(C.bg,"#ffffff"))}
                      onChange={e=>setChartExportModal(m=>({...m,background:normalizeHexColor(e.target.value,normalizeHexColor(C.bg,"#ffffff"))}))}
                      style={{width:"100%",height:34,padding:0,border:`1px solid ${C.border}`,borderRadius:6,background:C.bg}}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Header alignment</div>
                    <select value={chartExportModal.headerAlign||"left"}
                      onChange={e=>setChartExportModal(m=>({...m,headerAlign:e.target.value}))}
                      style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12}}>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                    </select>
                  </div>
                  <label style={{gridColumn:"1 / -1",fontSize:12,color:C.text,display:"flex",alignItems:"center",gap:6}}>
                    <input type="checkbox" checked={!!chartExportModal.includeTimestamp}
                      onChange={e=>setChartExportModal(m=>({...m,includeTimestamp:e.target.checked}))}/>
                    Include export timestamp in chart header
                  </label>
                </>
              )}
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:12}}>
              <button onClick={()=>setChartExportModal(null)}
                style={{padding:"6px 10px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:C.dim,cursor:"pointer"}}>Cancel</button>
              <button onClick={runChartExport}
                style={{padding:"6px 12px",background:C.blue+"22",border:`1px solid ${C.blue}44`,borderRadius:6,color:C.blue,cursor:"pointer",fontWeight:700}}>Export</button>
            </div>
          </div>
        </div>
      )}

      {tableExportModal&&(
        <div style={{position:"fixed",inset:0,background:"#00000066",zIndex:76,display:"flex",alignItems:"center",justifyContent:"center",padding:12}}>
          <div style={{width:"min(620px,96vw)",background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:14,maxHeight:"92vh",overflow:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:C.text}}>Export Table</div>
                <div style={{fontSize:11,color:C.dim,marginTop:2}}>
                  Smart sizing uses the table&apos;s full scroll width and height so dense tables stay readable.
                </div>
              </div>
              <button onClick={()=>setTableExportModal(null)} style={{padding:"4px 8px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:C.dim,cursor:"pointer"}}>Close</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Filename</div>
                <input value={tableExportModal.filename||""}
                  onChange={e=>setTableExportModal(m=>({...m,filename:e.target.value}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Format</div>
                <select value={tableExportModal.format||"png"}
                  onChange={e=>setTableExportModal(m=>({...m,format:e.target.value}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12}}>
                  <option value="png">PNG</option>
                  <option value="svg">SVG</option>
                  <option value="csv">CSV</option>
                  <option value="xlsx">XLSX</option>
                </select>
              </div>
              <div style={{gridColumn:"1 / -1"}}>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Title</div>
                <input value={tableExportModal.title||""}
                  onChange={e=>setTableExportModal(m=>({...m,title:e.target.value}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div style={{gridColumn:"1 / -1"}}>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Subtitle</div>
                <input value={tableExportModal.subtitle||""}
                  onChange={e=>setTableExportModal(m=>({...m,subtitle:e.target.value}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div style={{gridColumn:"1 / -1"}}>
                <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Footnote</div>
                <input value={tableExportModal.note||""}
                  onChange={e=>setTableExportModal(m=>({...m,note:e.target.value}))}
                  style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
              </div>
              {(tableExportModal.format==="csv"||tableExportModal.format==="xlsx")&&(
                <>
                  <div>
                    <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Sheet name</div>
                    <input value={tableExportModal.sheetName||"Data"}
                      onChange={e=>setTableExportModal(m=>({...m,sheetName:e.target.value}))}
                      style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
                  </div>
                  <div style={{display:"flex",alignItems:"end",fontSize:11,color:C.dim}}>
                    {Array.isArray(tableExportModal.rows)?`${tableExportModal.rows.length.toLocaleString()} row(s) will be exported.`:"No structured rows attached."}
                  </div>
                </>
              )}
              {(tableExportModal.format==="png"||tableExportModal.format==="svg")&&(
                <>
                  <div>
                    <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Width</div>
                    <input type="number" min="760" max="12000" value={tableExportModal.width||1200}
                      onChange={e=>setTableExportModal(m=>({...m,width:+e.target.value||1200}))}
                      style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Height</div>
                    <input type="number" min="260" max="12000" value={tableExportModal.height||800}
                      onChange={e=>setTableExportModal(m=>({...m,height:+e.target.value||800}))}
                      style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Scale</div>
                    <input type="number" step="0.5" min="1" max="4" value={tableExportModal.scale||2}
                      onChange={e=>setTableExportModal(m=>({...m,scale:+e.target.value||2}))}
                      style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Border style</div>
                    <select value={tableExportModal.borderMode||"auto"}
                      onChange={e=>setTableExportModal(m=>({...m,borderMode:e.target.value}))}
                      style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg,color:C.text,fontSize:12}}>
                      <option value="auto">Auto</option>
                      <option value="bordered">Bordered</option>
                      <option value="clean">Minimal lines</option>
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Background</div>
                    <input type="color" value={normalizeHexColor(tableExportModal.background,normalizeHexColor(C.bg,"#ffffff"))}
                      onChange={e=>setTableExportModal(m=>({...m,background:normalizeHexColor(e.target.value,normalizeHexColor(C.bg,"#ffffff"))}))}
                      style={{width:"100%",height:34,padding:0,border:`1px solid ${C.border}`,borderRadius:6,background:C.bg}}/>
                  </div>
                  <label style={{gridColumn:"1 / -1",fontSize:12,color:C.text,display:"flex",alignItems:"center",gap:6}}>
                    <input type="checkbox" checked={!!tableExportModal.includeTimestamp}
                      onChange={e=>setTableExportModal(m=>({...m,includeTimestamp:e.target.checked}))}/>
                    Include export timestamp in table header
                  </label>
                </>
              )}
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:12}}>
              <button onClick={()=>setTableExportModal(null)}
                style={{padding:"6px 10px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:C.dim,cursor:"pointer"}}>Cancel</button>
              <button onClick={runTableExport}
                style={{padding:"6px 12px",background:C.blue+"22",border:`1px solid ${C.blue}44`,borderRadius:6,color:C.blue,cursor:"pointer",fontWeight:700}}>Export</button>
            </div>
          </div>
        </div>
      )}
      {/* Tabs */}
      <div style={{borderBottom:`1px solid ${C.border}`,display:"flex",gap:0,
        background:C.bg,overflowX:"auto",WebkitOverflowScrolling:"touch",
        scrollbarWidth:"none",msOverflowStyle:"none"}}
        onTouchStart={handleSwipeStart}
        onTouchEnd={handleSwipeEnd}>
        {TABS.map(({id,label,badge})=>(
          <button key={id} onClick={()=>setTab(id)} style={{
            padding:mobile?"11px 13px":"10px 16px",background:"none",border:"none",
            borderBottom:`3px solid ${tab===id?C.blue:"transparent"}`,
            color:tab===id?C.blue:C.dim,fontSize:mobile?13.5:12.5,fontWeight:tab===id?700:400,
            cursor:"pointer",fontFamily:FONT,transition:"color 0.15s",whiteSpace:"nowrap",
            position:"relative"}}>
            {label}
            {badge>0&&<span style={{
              position:"absolute",top:5,right:3,
              background:C.yellow,color:"#000",borderRadius:8,
              fontSize:mobile?10:9,fontWeight:800,padding:"1px 4px",lineHeight:1.4}}>
              {badge}
            </span>}
          </button>
        ))}
      </div>

      {!analysisOnly&&(
        <FilterBar
          gSearch={gSearch} setGSearch={setGSearch}
          gPart={gPart} setGPart={setGPart}
          gStatus={gStatus} setGStatus={setGStatus}
          gRel={gRel} setGRel={setGRel}
          gAge={gAge} setGAge={setGAge}
          gGender={gGender} setGGender={setGGender}
          parts={parts}
          filteredLen={filtered.length} totalLen={voters.length}
          setVPage={setVPage} setBoothPage={setBoothPage}
        />
      )}

      {/* Content */}
      <div id="tabContentRoot"
        style={{padding:mobile?"10px 8px":tablet?"14px 16px":"20px 24px"}}>
        {loading&&<div style={{textAlign:"center",padding:40,color:C.blue,fontFamily:MONO}}>Processing files…</div>}
        {tab==="overview"&&(analysisOnly?renderAnalysisOnlyOverview():renderOverview())}
        {tab==="religion"&&(analysisOnly?renderAnalysisOnlyReligion():renderReligion())}
        {tab==="age"&&(analysisOnly?renderAnalysisOnlyAge():renderAge())}
        {tab==="custom"&&!analysisOnly&&renderCustomAnalytics()}
        {tab==="trends"&&!analysisOnly&&renderTrends()}
        {tab==="booths"&&!analysisOnly&&renderBooths()}
        {tab==="duplicates"&&!analysisOnly&&renderDuplicates()}
        {tab==="voters"&&!analysisOnly&&renderVoters()}
        {tab==="review"&&!analysisOnly&&renderReview()}
        {tab==="tokens"&&!analysisOnly&&renderTokens()}
        {tab==="sources"&&renderSources()}
        {tab==="methodology"&&renderMethodology()}
      </div>
    </div>
  );
}

export default function App(){
  return(
    <AppErrorBoundary>
      <AppInner />
    </AppErrorBoundary>
  );
}
