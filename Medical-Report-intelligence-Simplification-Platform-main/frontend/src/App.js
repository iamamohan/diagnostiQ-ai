import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  Activity,
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Volume2,
  VolumeX,
  Download,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Copy,
  Check,
  Info,
  Stethoscope,
  HeartPulse,
  GitCompare,
  FileCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  Globe,
  FileCode,
  ClipboardList,
  CheckSquare,
  Square,
  X,
  ChevronRight,
  Printer,
  Layers,
  Play,
  Pause,
  RotateCcw,
  Wind,
  Brain,
  Plus,
  Trash2,
  Heart,
} from 'lucide-react';

const API_CANDIDATES = [
  process.env.REACT_APP_API_BASE_URL,
  'http://127.0.0.1:5000',
  'http://localhost:5000',
  '',
].filter((x) => x !== undefined && x !== null);

async function callApi(method, path, data = null, config = {}) {
  let lastError = null;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  for (const base of API_CANDIDATES) {
    try {
      const url = base ? `${base}${cleanPath}` : cleanPath;
      return await axios({
        method,
        url,
        data,
        timeout: 30000,
        ...config,
      });
    } catch (err) {
      lastError = err;
      // If server responded with 400 or 500 error from backend, throw it
      // But if 404 (e.g. dev server without proxy route), continue to direct candidate
      if (err.response && err.response.status !== 404) {
        throw err;
      }
    }
  }
  throw lastError;
}

const SAMPLE_REPORTS = [
  {
    title: 'Lipid & Glucose Panel (Elevated)',
    subtitle: 'High cholesterol, low HDL, elevated glucose',
    text: `Patient Name: Demo User\nAge: 48\nGender: Male\nDate: 2026-10-01\n\nBlood Sugar: 180 mg/dL (70-140)\nHemoglobin: 10.5 g/dL (12-17)\nTotal Cholesterol: 245 mg/dL (125-200)\nHDL: 35 mg/dL (40-90)\nCreatinine: 1.1 mg/dL (0.6-1.3)\n\nImpression:\nPatient has elevated blood sugar and abnormal lipid profile. Low HDL observed.\nClinical correlation advised.`,
  },
  {
    title: 'Follow-Up Panel (Improved)',
    subtitle: 'Glucose normalizing, cholesterol controlled',
    text: `Patient Name: Demo User\nAge: 48\nGender: Male\nDate: 2026-11-15\n\nBlood Sugar: 125 mg/dL (70-140)\nHemoglobin: 12.2 g/dL (12-17)\nTotal Cholesterol: 195 mg/dL (125-200)\nHDL: 44 mg/dL (40-90)\nCreatinine: 1.0 mg/dL (0.6-1.3)\n\nImpression:\nFasting glucose improved compared to previous test. Lipid markers returning to healthy limits.\nRoutine follow-up in 3 months.`,
  },
];

function parseNormalBounds(rangeText) {
  if (!rangeText || rangeText === 'Not available') return { low: null, high: null };
  const lt = rangeText.match(/<\s*(\d+(?:\.\d+)?)/);
  if (lt) return { low: 0, high: Number(lt[1]) };
  const gt = rangeText.match(/>\s*(\d+(?:\.\d+)?)/);
  if (gt) return { low: Number(gt[1]), high: null };
  const m = rangeText.match(/(\d+(?:\.\d+)?)\s*[-to]{1,3}\s*(\d+(?:\.\d+)?)/i);
  if (m) return { low: Number(m[1]), high: Number(m[2]) };
  return { low: null, high: null };
}

// Visual biomarker range gauge
function BiomarkerRangeGauge({ value, rangeText, status }) {
  const { low, high } = parseNormalBounds(rangeText);
  if (value === null || value === undefined || isNaN(value) || !high) {
    return (
      <span className="text-xs text-clinical-400 font-mono">Range: {rangeText || 'N/A'}</span>
    );
  }

  const minBound = low !== null ? Math.min(low * 0.7, value * 0.8) : 0;
  const maxBound = Math.max(high * 1.3, value * 1.15);
  const totalSpan = maxBound - minBound || 100;

  const lowPct = low !== null ? Math.max(0, Math.min(100, ((low - minBound) / totalSpan) * 100)) : 0;
  const highPct = Math.max(0, Math.min(100, ((high - minBound) / totalSpan) * 100));
  const valPct = Math.max(2, Math.min(98, ((value - minBound) / totalSpan) * 100));

  const isHigh = String(status).toLowerCase() === 'high';
  const isLow = String(status).toLowerCase() === 'low';

  return (
    <div className="w-full min-w-[130px] max-w-[200px] flex flex-col gap-1">
      <div className="relative h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
        {/* Normal range corridor */}
        <div
          className="absolute top-0 bottom-0 bg-emerald-200/70"
          style={{ left: `${lowPct}%`, width: `${Math.max(4, highPct - lowPct)}%` }}
        />
        {/* Value marker pin */}
        <div
          className={`absolute top-0 bottom-0 w-2.5 -ml-1 rounded-full shadow-sm transition-all duration-300 ${
            isHigh ? 'bg-rose-600 ring-2 ring-rose-200' : isLow ? 'bg-sky-600 ring-2 ring-sky-200' : 'bg-emerald-600 ring-2 ring-emerald-200'
          }`}
          style={{ left: `${valPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-clinical-500 font-mono">
        <span>{low !== null ? low : '0'}</span>
        <span className="text-clinical-400 font-sans">Normal</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

function CustomChartTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-3.5 rounded-xl border border-clinical-200 shadow-modal text-xs">
        <p className="font-semibold text-clinical-900 border-b border-clinical-100 pb-1.5 mb-2">{data.fullName || label}</p>
        <div className="space-y-1.5 font-mono">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-clinical-600">
              <span className="w-2.5 h-2.5 rounded-sm bg-clinical-800 inline-block" />
              Patient Value:
            </span>
            <span className="font-bold text-clinical-900">{data.yourValue}</span>
          </div>
          {data.normalUpper && (
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-clinical-600">
                <span className="w-2.5 h-2.5 rounded-sm bg-medteal-600 inline-block" />
                Ref. Upper Limit:
              </span>
              <span className="font-semibold text-medteal-700">{data.normalUpper}</span>
            </div>
          )}
          {data.normalRange && (
            <div className="text-[11px] text-clinical-500 pt-1 font-sans">
              Normal Span: {data.normalRange}
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
}

// Status badge helper with muted, clinical styling
function renderStatusBadge(status) {
  const s = (status || '').toLowerCase();
  if (s === 'high') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/80">
        <ArrowUpRight className="w-3 h-3 text-rose-600" />
        High
      </span>
    );
  }
  if (s === 'low') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200/80">
        <ArrowDownRight className="w-3 h-3 text-sky-600" />
        Low
      </span>
    );
  }
  if (s === 'abnormal') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200/80">
        <AlertTriangle className="w-3 h-3 text-amber-600" />
        Abnormal
      </span>
    );
  }
  if (s === 'normal') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
        Normal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-clinical-100 text-clinical-700">
      {status || 'Unknown'}
    </span>
  );
}

const BIOMARKER_DETAILS_MAP = {
  glucose: {
    organSystem: 'Metabolic & Pancreatic Health',
    clinicalFunction: 'Primary circulating monosaccharide fueling cellular ATP production; tightly regulated by pancreatic insulin and glucagon.',
    highCauses: 'Pre-diabetes, Type 1/2 Diabetes Mellitus, acute psychological/physical stress, corticosteroid therapy, metabolic syndrome.',
    lowCauses: 'Reactive hypoglycemia, excess insulin administration, prolonged fasting, liver disease, adrenal insufficiency.',
    relatedMarkers: ['HbA1c', 'Lipid Profile', 'Urine Microalbumin'],
    questions: [
      'Should we order a confirmatory Fasting Blood Sugar or HbA1c test?',
      'Would dietary carbohydrate moderation and 30-day glycemic monitoring be recommended?',
    ],
  },
  hba1c: {
    organSystem: 'Glycemic Control & Endocrine System',
    clinicalFunction: 'Measures glycated hemoglobin, reflecting average blood glucose exposure over the past 90-120 days.',
    highCauses: 'Chronic hyperglycemia, unmanaged diabetes, insulin resistance, hemoglobin variants.',
    lowCauses: 'Hemolytic anemia, recent blood transfusion, chronic blood loss, sickle cell trait.',
    relatedMarkers: ['Fasting Glucose', 'Triglycerides', 'Estimated Average Glucose (eAG)'],
    questions: [
      'What is my personal target HbA1c threshold based on my age and medical history?',
      'Is pharmacological adjustment or structured lifestyle intervention indicated at this level?',
    ],
  },
  cholesterol: {
    organSystem: 'Cardiovascular & Lipid Metabolism',
    clinicalFunction: 'Essential structural component of cell membranes and steroid hormone/vitamin D synthesis; transported via lipoproteins.',
    highCauses: 'Familial hypercholesterolemia, saturated/trans fat intake, hypothyroidism, chronic kidney disease, sedentary lifestyle.',
    lowCauses: 'Severe malnutrition, hyperthyroidism, chronic liver insufficiency, malabsorption disorders.',
    relatedMarkers: ['LDL Cholesterol', 'HDL Cholesterol', 'Triglycerides'],
    questions: [
      'What is my estimated 10-year atherosclerotic cardiovascular disease (ASCVD) risk score?',
      'Do you advise starting lipid-lowering therapy or initiating a 3-month therapeutic lifestyle change?',
    ],
  },
  ldl: {
    organSystem: 'Cardiovascular & Vascular Endothelium',
    clinicalFunction: 'Low-Density Lipoprotein: transports cholesterol from liver to peripheral tissues; primary atherogenic lipoprotein particle.',
    highCauses: 'Atherosclerotic plaque accumulation, familial hypercholesterolemia, diet rich in saturated fats, hypothyroid state.',
    lowCauses: 'Hypobetalipoproteinemia, hyperthyroidism, acute severe illness, severe malnutrition.',
    relatedMarkers: ['Total Cholesterol', 'Non-HDL Cholesterol', 'hs-CRP'],
    questions: [
      'What is my specific target LDL level given my cardiovascular profile?',
      'Should we evaluate non-HDL cholesterol or an ApoB test for a clearer vascular picture?',
    ],
  },
  hdl: {
    organSystem: 'Cardiovascular & Reverse Cholesterol Transport',
    clinicalFunction: 'High-Density Lipoprotein: extracts excess peripheral cholesterol and transports it back to liver for biliary excretion.',
    highCauses: 'Regular aerobic exercise, moderate alcohol intake, genetic CETP gene variations, estrogen exposure.',
    lowCauses: 'Metabolic syndrome, cigarette smoking, insulin resistance, obesity, elevated triglycerides.',
    relatedMarkers: ['Total Cholesterol / HDL Ratio', 'Triglycerides', 'Fasting Blood Sugar'],
    questions: [
      'What specific aerobic exercise regimen or nutritional shifts will help elevate my protective HDL?',
      'Does my low HDL significantly raise my total cardiovascular risk profile?',
    ],
  },
  triglycerides: {
    organSystem: 'Metabolic & Adipose Energy Storage',
    clinicalFunction: 'Primary circulating form of dietary fat and energy storage; hydrolysed by lipoprotein lipase for muscle/adipose energy.',
    highCauses: 'Excess refined carbohydrates, alcohol consumption, poorly controlled diabetes, metabolic syndrome, pancreatitis risk (>500 mg/dL).',
    lowCauses: 'Malnutrition, low-fat diet, hyperthyroidism, malabsorption syndromes.',
    relatedMarkers: ['Fasting Glucose', 'HDL Cholesterol', 'Total Cholesterol'],
    questions: [
      'Could my triglyceride level be related to recent dietary habits, alcohol, or carbohydrate consumption?',
      'Is there an acute pancreatitis risk that warrants immediate prescription therapy?',
    ],
  },
  hemoglobin: {
    organSystem: 'Hematology & Oxygen Delivery',
    clinicalFunction: 'Iron-containing metalloprotein in erythrocytes that binds oxygen in pulmonary capillaries and transports it to tissues.',
    highCauses: 'Dehydration/hemoconcentration, chronic smoking, obstructive sleep apnea, polycythemia vera, high altitude.',
    lowCauses: 'Iron deficiency anemia, acute or chronic blood loss, bone marrow suppression, vitamin B12/folate deficiency, renal failure.',
    relatedMarkers: ['RBC Count', 'Hematocrit', 'Serum Ferritin', 'MCV'],
    questions: [
      'Does my hemoglobin level indicate an underlying anemia or blood loss?',
      'Should we investigate serum ferritin, iron saturation, or vitamin B12 levels?',
    ],
  },
  wbc: {
    organSystem: 'Immune System & Infection Response',
    clinicalFunction: 'Circulating leukocytes defending against bacterial, viral, parasitic, and fungal pathogens and mediating inflammation.',
    highCauses: 'Acute bacterial or viral infection, systemic inflammation, corticosteroid use, physical trauma, leukemia/myeloproliferative states.',
    lowCauses: 'Viral suppression, autoimmune diseases (SLE), drug-induced marrow suppression, severe sepsis, chemotherapy.',
    relatedMarkers: ['Neutrophils', 'Lymphocytes', 'ESR', 'C-Reactive Protein (CRP)'],
    questions: [
      'Is my white count elevated due to a recent acute infection, inflammation, or medication?',
      'Do you recommend repeating the Complete Blood Count (CBC) with differential in 1-2 weeks?',
    ],
  },
  platelets: {
    organSystem: 'Hemostasis & Coagulation',
    clinicalFunction: 'Anucleate cell fragments essential for primary hemostatic plug formation and vascular endothelial repair.',
    highCauses: 'Reactive thrombocytosis (iron deficiency, infection, post-splenectomy, malignancy), essential thrombocythemia.',
    lowCauses: 'Thrombocytopenia: immune destruction (ITP), drug-induced, splenic sequestration, liver cirrhosis, marrow disease.',
    relatedMarkers: ['Hemoglobin', 'WBC Count', 'Prothrombin Time (PT/INR)'],
    questions: [
      'Does this platelet reading pose any risk of spontaneous bleeding, bruising, or clotting?',
      'Could any of my regular medications or supplements be lowering my platelet count?',
    ],
  },
  creatinine: {
    organSystem: 'Renal & Kidney Filtration (Nephrology)',
    clinicalFunction: 'Breakdown byproduct of muscle creatine phosphate; excreted purely by glomerular filtration without reabsorption.',
    highCauses: 'Decreased Glomerular Filtration Rate (acute kidney injury or chronic renal disease), severe dehydration, high muscle mass, NSAID use.',
    lowCauses: 'Low muscle mass, severe malnutrition, liver failure, pregnancy.',
    relatedMarkers: ['eGFR', 'Urea / BUN', 'Serum Electrolytes'],
    questions: [
      'What is my calculated eGFR (Estimated Glomerular Filtration Rate)?',
      'Are any of my current medications (like NSAIDs or blood pressure pills) affecting my kidney function?',
    ],
  },
  urea: {
    organSystem: 'Renal & Hepatic Nitrogen Clearance',
    clinicalFunction: 'Primary nitrogenous waste product from protein catabolism; synthesized in liver and cleared by renal excretion.',
    highCauses: 'Dehydration (prerenal azotemia), high dietary protein intake, impaired kidney clearance, upper GI bleeding.',
    lowCauses: 'Very low dietary protein, overhydration, severe liver disease.',
    relatedMarkers: ['Creatinine', 'BUN/Creatinine Ratio', 'Electrolytes'],
    questions: [
      'Is my elevated urea primarily caused by simple dehydration or intrinsic kidney involvement?',
      'What is my recommended daily water intake target?',
    ],
  },
  sodium: {
    organSystem: 'Electrolytes & Fluid Balance',
    clinicalFunction: 'Dominant extracellular cation maintaining intravascular volume, osmotic pressure, and nerve transmission.',
    highCauses: 'Free water deficit, dehydration, excessive salt intake, diabetes insipidus.',
    lowCauses: 'Fluid overload, diuretic therapy, heart failure, syndrome of inappropriate ADH (SIADH).',
    relatedMarkers: ['Potassium', 'Serum Osmolality', 'Creatinine'],
    questions: [
      'Could my blood pressure medication or diuretic be altering my sodium levels?',
      'Are there specific electrolyte replenishment guidelines I should follow?',
    ],
  },
  potassium: {
    organSystem: 'Electrolytes & Cardiac Electrophysiology',
    clinicalFunction: 'Dominant intracellular cation vital for cardiac electrical conduction, resting membrane potential, and muscle contraction.',
    highCauses: 'Hyperkalemia: reduced renal excretion, ACE inhibitors/ARBs, potassium-sparing diuretics, cell lysis.',
    lowCauses: 'Hypokalemia: loop/thiazide diuretics, vomiting, diarrhea, magnesium deficiency.',
    relatedMarkers: ['Sodium', 'Creatinine', 'ECG Rhythm'],
    questions: [
      'Does my potassium level pose any risk for cardiac rhythm disturbances?',
      'Do I need an immediate ECG or medication adjustment?',
    ],
  },
};

function getBiomarkerDetails(row) {
  if (!row) return null;
  const name = String(row.name || '').toLowerCase();

  if (row.organ_system && row.clinical_function) {
    return {
      organSystem: row.organ_system,
      clinicalFunction: row.clinical_function,
      highCauses: row.high_implications,
      lowCauses: row.low_implications,
      relatedMarkers: row.related_markers || [],
      questions: row.consultation_questions || [],
    };
  }

  for (const [key, details] of Object.entries(BIOMARKER_DETAILS_MAP)) {
    if (name.includes(key)) {
      return details;
    }
  }

  return {
    organSystem: 'General Clinical Physiology',
    clinicalFunction: `${row.name} is a standardized laboratory diagnostic parameter evaluated as part of routine health and metabolic panels.`,
    highCauses: 'Physiological stress, acute inflammation, dietary variations, or metabolic demand.',
    lowCauses: 'Nutritional deficiency, impaired synthesis, accelerated clearance, or hemodilution.',
    relatedMarkers: ['Complete Blood Count', 'Comprehensive Metabolic Panel'],
    questions: [
      `What factors could explain this ${row.name} reading?`,
      `Does this result require repeat laboratory evaluation or medical follow-up?`,
    ],
  };
}

// =========================================================================
// FEATURE 1: CONTEXTUAL BIOMARKER DEEP-DIVE DRAWER
// =========================================================================
function BiomarkerDeepDiveDrawer({ biomarker, onClose, allParameters, onSelectRelated }) {
  if (!biomarker) return null;
  const details = getBiomarkerDetails(biomarker);
  const statusStr = String(biomarker.status || '').toLowerCase();

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-fadeIn">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-10 border-l border-clinical-200 overflow-y-auto">
        {/* Drawer Header */}
        <div className="p-6 border-b border-clinical-100 bg-clinical-50/60 sticky top-0 backdrop-blur-md z-10 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wider bg-medteal-50 text-medteal-800 px-2.5 py-0.5 rounded-full border border-medteal-200">
                {details.organSystem}
              </span>
              <span className="text-[11px] font-mono text-clinical-500">
                Biomarker Inspector
              </span>
            </div>
            <h2 className="text-xl font-bold text-clinical-900">{biomarker.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-clinical-400 hover:text-clinical-700 hover:bg-clinical-200/60 transition-all"
            title="Close Drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="p-6 space-y-6 flex-1">
          {/* Key Metrics Banner */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-clinical-200 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-clinical-500 font-medium">Your Result</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-2xl font-bold font-mono text-clinical-900">
                  {biomarker.your_value}
                </span>
                <span className="text-xs text-clinical-600 font-sans">{biomarker.unit || ''}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-clinical-500 font-medium">Standard Reference</p>
              <p className="text-sm font-mono font-semibold text-clinical-800 mt-0.5">
                {biomarker.normal_range}
              </p>
            </div>
            <div>
              {renderStatusBadge(biomarker.status)}
            </div>
          </div>

          {/* Range Visual Spectrum */}
          <div className="p-4 rounded-xl bg-white border border-clinical-200">
            <p className="text-xs font-semibold text-clinical-700 mb-2">Reference Position Gauge</p>
            <BiomarkerRangeGauge
              value={biomarker.your_value}
              rangeText={biomarker.normal_range}
              status={biomarker.status}
            />
          </div>

          {/* Section 1: Biological Role & Clinical Purpose */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-clinical-900 font-bold text-sm">
              <Activity className="w-4 h-4 text-medteal-600" />
              <h3>Physiological Function in the Body</h3>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs sm:text-sm text-clinical-700 leading-relaxed">
              {details.clinicalFunction}
            </div>
          </div>

          {/* Section 2: Potential Clinical & Lifestyle Causes */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-clinical-900 font-bold text-sm">
              <Info className="w-4 h-4 text-medblue-600" />
              <h3>Potential Causes of Variations</h3>
            </div>

            {/* High Causes */}
            <div className={`p-4 rounded-xl border text-xs leading-relaxed ${
              statusStr === 'high' ? 'bg-rose-50/70 border-rose-200 text-rose-900' : 'bg-slate-50 border-slate-200 text-clinical-700'
            }`}>
              <div className="flex items-center gap-1.5 font-bold mb-1 text-xs">
                <ArrowUpRight className={`w-3.5 h-3.5 ${statusStr === 'high' ? 'text-rose-600' : 'text-clinical-600'}`} />
                <span>When Levels Are Elevated:</span>
              </div>
              <p>{details.highCauses}</p>
            </div>

            {/* Low Causes */}
            <div className={`p-4 rounded-xl border text-xs leading-relaxed ${
              statusStr === 'low' ? 'bg-sky-50/70 border-sky-200 text-sky-900' : 'bg-slate-50 border-slate-200 text-clinical-700'
            }`}>
              <div className="flex items-center gap-1.5 font-bold mb-1 text-xs">
                <ArrowDownRight className={`w-3.5 h-3.5 ${statusStr === 'low' ? 'text-sky-600' : 'text-clinical-600'}`} />
                <span>When Levels Are Low:</span>
              </div>
              <p>{details.lowCauses}</p>
            </div>
          </div>

          {/* Section 3: Interconnected Biomarkers */}
          {details.relatedMarkers && details.relatedMarkers.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-clinical-900 font-bold text-sm">
                <Layers className="w-4 h-4 text-indigo-600" />
                <h3>Related Biomarkers to Correlate</h3>
              </div>
              <p className="text-xs text-clinical-500">
                These tests provide essential context when interpreted together with {biomarker.name}.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {details.relatedMarkers.map((relName, idx) => {
                  const matchInReport = allParameters?.find((p) =>
                    p.name.toLowerCase().includes(relName.toLowerCase()) ||
                    relName.toLowerCase().includes(p.name.toLowerCase())
                  );
                  return (
                    <button
                      key={idx}
                      onClick={() => matchInReport && onSelectRelated && onSelectRelated(matchInReport)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        matchInReport
                          ? 'bg-medteal-50 border-medteal-300 text-medteal-900 hover:bg-medteal-100 shadow-subtle cursor-pointer'
                          : 'bg-clinical-50 border-clinical-200 text-clinical-600 cursor-default'
                      }`}
                      title={matchInReport ? 'Click to inspect biomarker from this report' : 'Not tested in current report'}
                    >
                      <span>{relName}</span>
                      {matchInReport && (
                        <span className="text-[10px] font-semibold bg-medteal-600 text-white px-1.5 py-0.2 rounded-full">
                          In Report
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 4: Targeted Questions for Your Physician */}
          {details.questions && details.questions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-clinical-900 font-bold text-sm">
                <Stethoscope className="w-4 h-4 text-medteal-600" />
                <h3>Targeted Questions for Your Doctor</h3>
              </div>
              <div className="space-y-2">
                {details.questions.map((q, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-clinical-800 flex items-start gap-2.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-medteal-600 mt-1.5 shrink-0" />
                    <span>{q}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-5 border-t border-clinical-100 bg-clinical-50/50 flex items-center justify-between text-xs text-clinical-500">
          <span className="text-[11px]">Laboratory Reference Standard</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-clinical-900 text-white text-xs font-semibold hover:bg-clinical-800 transition-all shadow-subtle"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// FEATURE 2: INTERACTIVE DOCTOR CONSULTATION PREP SHEET
// =========================================================================
function DoctorConsultationPrepSheet({
  analysis,
  checkedQuestions,
  onToggleQuestion,
  customQuestions,
  onAddCustomQuestion,
  onRemoveCustomQuestion,
  newQuestionText,
  setNewQuestionText,
  patientNotes,
  setPatientNotes,
  copiedAgenda,
  onCopyAgenda,
}) {
  const abnormalParameters = (analysis?.parameters || []).filter((p) =>
    ['high', 'low', 'abnormal'].includes(String(p.status || '').toLowerCase())
  );

  const baseQuestions = analysis?.doctor_questions && analysis.doctor_questions.length > 0
    ? analysis.doctor_questions
    : [
        'What specific medical factors could be causing the abnormal results in this panel?',
        'Do any of these readings warrant immediate prescription therapy or dosage modifications?',
        'When should we schedule repeat testing to evaluate if these numbers are stabilizing?',
        'Are there specific dietary, physical activity, or hydration guidelines I should follow?',
      ];

  const totalQuestions = baseQuestions.length + customQuestions.length;
  const checkedCount = Object.values(checkedQuestions).filter(Boolean).length;

  const handlePrint = () => {
    window.print();
  };

  return (
    <section className="bg-white rounded-2xl border border-clinical-200 shadow-card p-6 space-y-6">
      {/* Printable Sheet Wrapper */}
      <div id="printable-consultation-sheet" className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-clinical-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-medteal-50 text-medteal-700 flex items-center justify-center shrink-0 border border-medteal-200">
              <ClipboardList className="w-5 h-5 text-medteal-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base text-clinical-900">
                  Doctor Consultation Prep Sheet
                </h3>
                <span className="text-[11px] font-semibold bg-clinical-100 text-clinical-700 px-2.5 py-0.5 rounded-full border border-clinical-200">
                  {checkedCount} of {totalQuestions} Prioritized
                </span>
              </div>
              <p className="text-xs text-clinical-500 mt-0.5">
                Personalized discussion agenda & clinical question checklist tailored to your lab results
              </p>
            </div>
          </div>

          {/* Action buttons (hidden when printing) */}
          <div className="flex items-center gap-2 no-print">
            <button
              onClick={onCopyAgenda}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-white border border-clinical-300 hover:border-clinical-400 hover:bg-clinical-50 text-clinical-800 shadow-sm transition-all"
              title="Copy checklist questions to clipboard"
            >
              {copiedAgenda ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied Agenda</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-clinical-500" />
                  <span>Copy Questions</span>
                </>
              )}
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-clinical-900 hover:bg-clinical-800 text-white shadow-card transition-all"
              title="Print 1-page clinical visit sheet"
            >
              <Printer className="w-3.5 h-3.5 text-medteal-400" />
              <span>Print Visit Sheet</span>
            </button>
          </div>
        </div>

        {/* Printable Overview Header (shows report type & abnormal highlights) */}
        <div className="grid md:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-clinical-200/90 text-xs">
          <div>
            <p className="text-clinical-500 font-medium">Evaluation Summary</p>
            <p className="font-bold text-clinical-900 text-sm mt-0.5">
              {analysis?.report_type || 'Clinical Health Assessment'}
            </p>
            <p className="text-clinical-600 mt-1">
              Overall Risk Profile: <span className="font-semibold text-clinical-800 capitalize">{analysis?.risk_level || 'Evaluated'}</span>
            </p>
          </div>
          <div>
            <p className="text-clinical-500 font-medium">Key Biomarkers Requiring Discussion</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {abnormalParameters.length > 0 ? (
                abnormalParameters.map((p, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-rose-50 text-rose-800 border border-rose-200"
                  >
                    {p.name}: {p.your_value} {p.unit || ''} ({p.status})
                  </span>
                ))
              ) : (
                <span className="text-emerald-700 font-medium">All measured parameters within standard reference ranges</span>
              )}
            </div>
          </div>
        </div>

        {/* Priority Questions Checklist */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-clinical-700">
              Recommended Clinical Questions to Ask
            </h4>
            <span className="text-[11px] text-clinical-500 no-print">
              Check the questions you want to discuss with your doctor
            </span>
          </div>

          <div className="space-y-2">
            {baseQuestions.map((question, idx) => {
              const isChecked = !!checkedQuestions[`base_${idx}`];
              return (
                <div
                  key={`base_${idx}`}
                  onClick={() => onToggleQuestion(`base_${idx}`)}
                  className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-start gap-3 cursor-pointer transition-all ${
                    isChecked
                      ? 'bg-medteal-50/70 border-medteal-300 text-clinical-900 shadow-subtle'
                      : 'bg-white hover:bg-slate-50/80 border-clinical-200 text-clinical-800'
                  }`}
                >
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 text-medteal-600 focus:outline-none"
                  >
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-medteal-600" />
                    ) : (
                      <Square className="w-4 h-4 text-clinical-400" />
                    )}
                  </button>
                  <span className={`flex-1 leading-relaxed ${isChecked ? 'font-medium' : ''}`}>
                    {question}
                  </span>
                </div>
              );
            })}

            {/* Custom User-Added Questions */}
            {customQuestions.map((q, idx) => {
              const isChecked = !!checkedQuestions[`custom_${idx}`];
              return (
                <div
                  key={`custom_${idx}`}
                  className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-start gap-3 transition-all ${
                    isChecked
                      ? 'bg-medteal-50/70 border-medteal-300 text-clinical-900 shadow-subtle'
                      : 'bg-white border-clinical-200 text-clinical-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onToggleQuestion(`custom_${idx}`)}
                    className="mt-0.5 shrink-0 text-medteal-600 focus:outline-none"
                  >
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-medteal-600" />
                    ) : (
                      <Square className="w-4 h-4 text-clinical-400" />
                    )}
                  </button>
                  <span
                    onClick={() => onToggleQuestion(`custom_${idx}`)}
                    className={`flex-1 leading-relaxed cursor-pointer ${isChecked ? 'font-medium' : ''}`}
                  >
                    {q}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveCustomQuestion(idx)}
                    className="text-clinical-400 hover:text-rose-600 p-1 rounded-md no-print"
                    title="Remove custom question"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Add Custom Question Form (no-print) */}
        <div className="no-print pt-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newQuestionText.trim()) {
                onAddCustomQuestion(newQuestionText.trim());
                setNewQuestionText('');
              }
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={newQuestionText}
              onChange={(e) => setNewQuestionText(e.target.value)}
              placeholder="Add your own question or specific symptom (e.g., 'Ask about afternoon fatigue or ankle swelling')..."
              className="flex-1 rounded-xl border border-clinical-300 px-3.5 py-2.5 text-xs text-clinical-900 placeholder:text-clinical-400 focus:outline-none focus:ring-2 focus:ring-medteal-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={!newQuestionText.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-clinical-900 hover:bg-clinical-800 disabled:opacity-50 text-white text-xs font-semibold shadow-subtle transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Question</span>
            </button>
          </form>
        </div>

        {/* Patient Personal Notes / Symptoms */}
        <div className="space-y-2 pt-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-clinical-700">
            Personal Notes & Symptoms to Mention
          </label>
          <textarea
            value={patientNotes}
            onChange={(e) => setPatientNotes(e.target.value)}
            rows={3}
            placeholder="Type any symptoms, current medications, or observations you want to discuss with your doctor..."
            className="w-full rounded-xl border border-clinical-200 p-3 text-xs text-clinical-900 placeholder:text-clinical-400 focus:outline-none focus:ring-2 focus:ring-medteal-500 resize-none"
          />
        </div>

        {/* Doctor Follow-Up Notes Section (Great for printout!) */}
        <div className="pt-2">
          <div className="p-4 rounded-xl border border-dashed border-clinical-300 bg-clinical-50/40">
            <p className="text-xs font-bold text-clinical-700 uppercase tracking-wider mb-2">
              Physician Consultation Notes & Action Plan
            </p>
            <p className="text-[11px] text-clinical-400 mb-6">
              To be filled during your clinical appointment with your certified healthcare provider:
            </p>
            <div className="space-y-4">
              <div className="border-b border-clinical-200 pb-2">
                <span className="text-[11px] text-clinical-500">Diagnosis / Clinical Impression:</span>
              </div>
              <div className="border-b border-clinical-200 pb-2">
                <span className="text-[11px] text-clinical-500">Prescription / Medication Changes:</span>
              </div>
              <div className="border-b border-clinical-200 pb-2">
                <span className="text-[11px] text-clinical-500">Repeat Test Schedule / Follow-up Date:</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// =========================================================================
// FEATURE 3: MEDITATION & GUIDED BREATHING VITALITY SUITE
// =========================================================================
const BREATHING_TECHNIQUES = {
  box: {
    id: 'box',
    name: 'Box Breathing (4-4-4-4)',
    tagline: 'Vagal Nerve Reset & Acute Stress Relief',
    badge: 'Hospital Protocol',
    clinicalImpact: 'Clinically proven to reduce heart rate variability stress, decrease acute sympathetic tone, and stabilize blood pressure surges.',
    phases: [
      { label: 'Inhale', duration: 4, instruction: 'Breathe in slowly & deeply through your nose...', color: '#0d9488', scale: 1.28 },
      { label: 'Hold', duration: 4, instruction: 'Hold your breath gently. Relax facial muscles & shoulders...', color: '#0284c7', scale: 1.28 },
      { label: 'Exhale', duration: 4, instruction: 'Release smoothly & completely through parted lips...', color: '#475569', scale: 0.8 },
      { label: 'Hold / Rest', duration: 4, instruction: 'Pause gently before your next breath...', color: '#64748b', scale: 0.8 },
    ],
  },
  '478': {
    id: '478',
    name: '4-7-8 Restorative Breath',
    tagline: 'Parasympathetic Activator & Anxiety Reducer',
    badge: 'Dr. Weil Protocol',
    clinicalImpact: 'Stimulates parasympathetic dominance, counteracting tachycardia and pre-appointment "white coat" anxiety.',
    phases: [
      { label: 'Inhale', duration: 4, instruction: 'Inhale silently through your nose for 4 seconds...', color: '#0d9488', scale: 1.28 },
      { label: 'Hold', duration: 7, instruction: 'Hold breath steadily without strain for 7 seconds...', color: '#0284c7', scale: 1.28 },
      { label: 'Exhale', duration: 8, instruction: 'Exhale completely through your mouth with a soft whoosh for 8 seconds...', color: '#475569', scale: 0.8 },
    ],
  },
  calm: {
    id: 'calm',
    name: 'Coherent Paced Breathing (4-6)',
    tagline: 'Cardiovascular & Blood Pressure Harmony',
    badge: 'Cardio Coherence',
    clinicalImpact: 'Synchronizes respiratory sinus arrhythmia with arterial baroreceptors to lower resting systolic and diastolic blood pressure.',
    phases: [
      { label: 'Inhale', duration: 4, instruction: 'Inhale gently expanding your diaphragm...', color: '#0d9488', scale: 1.28 },
      { label: 'Exhale', duration: 6, instruction: 'Slow continuous exhale letting all physical tension dissolve...', color: '#475569', scale: 0.8 },
    ],
  },
};

function MindAndVitalitySection() {
  const [techniqueKey, setTechniqueKey] = useState('box');
  const [isActive, setIsActive] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(4);
  const [cyclesCompleted, setCyclesCompleted] = useState(0);

  const currentTechnique = BREATHING_TECHNIQUES[techniqueKey] || BREATHING_TECHNIQUES.box;
  const currentPhase = currentTechnique.phases[phaseIndex] || currentTechnique.phases[0];

  useEffect(() => {
    let timer = null;
    if (isActive) {
      timer = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            const phases = BREATHING_TECHNIQUES[techniqueKey].phases;
            const nextIdx = (phaseIndex + 1) % phases.length;
            if (nextIdx === 0) {
              setCyclesCompleted((c) => c + 1);
            }
            setPhaseIndex(nextIdx);
            return phases[nextIdx].duration;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isActive, phaseIndex, techniqueKey]);

  const handleSelectTechnique = (key) => {
    setTechniqueKey(key);
    setIsActive(false);
    setPhaseIndex(0);
    setSecondsLeft(BREATHING_TECHNIQUES[key].phases[0].duration);
  };

  const handleReset = () => {
    setIsActive(false);
    setPhaseIndex(0);
    setSecondsLeft(BREATHING_TECHNIQUES[techniqueKey].phases[0].duration);
    setCyclesCompleted(0);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Hero Card */}
      <section className="bg-white rounded-2xl border border-clinical-200 shadow-card p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-clinical-100">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-8 h-8 rounded-lg bg-medteal-50 text-medteal-700 flex items-center justify-center border border-medteal-200">
                <Wind className="w-4 h-4 text-medteal-600" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-medteal-700">
                Mind-Body Vitality & Stress Reduction
              </span>
            </div>
            <h2 className="text-2xl font-bold text-clinical-900">
              Interactive Clinical Breathing & Meditation Suite
            </h2>
            <p className="text-xs sm:text-sm text-clinical-600 mt-1 max-w-2xl">
              Chronic stress and acute anxiety elevate cortisol, epinephrine, and inflammatory markers, directly skewing blood sugar, blood pressure, and cholesterol readings. Use this evidence-based respiratory coach to restore autonomic equilibrium.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <div className="px-4 py-2 rounded-xl bg-slate-50 border border-clinical-200 text-xs">
              <span className="text-clinical-500 font-medium block">Completed Cycles</span>
              <span className="text-lg font-bold font-mono text-clinical-900">{cyclesCompleted}</span>
            </div>
          </div>
        </div>

        {/* Technique Selector Pills */}
        <div className="grid sm:grid-cols-3 gap-3 pt-6">
          {Object.entries(BREATHING_TECHNIQUES).map(([key, tech]) => {
            const isSelected = techniqueKey === key;
            return (
              <button
                key={key}
                onClick={() => handleSelectTechnique(key)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'bg-medteal-50/60 border-medteal-400 ring-2 ring-medteal-500/20 shadow-subtle'
                    : 'bg-white hover:bg-slate-50 border-clinical-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    isSelected ? 'bg-medteal-600 text-white border-medteal-600' : 'bg-clinical-100 text-clinical-700 border-clinical-200'
                  }`}>
                    {tech.badge}
                  </span>
                </div>
                <h4 className="font-bold text-sm text-clinical-900">{tech.name}</h4>
                <p className="text-xs text-clinical-500 mt-1 line-clamp-2">{tech.tagline}</p>
              </button>
            );
          })}
        </div>

        {/* Interactive Breathing Canvas */}
        <div className="mt-8 p-8 sm:p-12 rounded-2xl bg-gradient-to-b from-slate-50 to-clinical-50/70 border border-clinical-200 flex flex-col items-center justify-center text-center">
          {/* Animated Breathing Orb */}
          <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center my-4">
            {/* Ambient Background Wave */}
            <div
              className={`absolute inset-0 rounded-full border border-medteal-300/40 ${
                isActive ? 'animate-pulse-ring' : ''
              }`}
            />
            <div
              className="absolute inset-4 rounded-full bg-medteal-500/10 blur-xl transition-all duration-1000"
              style={{
                transform: `scale(${currentPhase.scale || 1})`,
              }}
            />

            {/* Central Animated Breathing Ring */}
            <div
              className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-full bg-white border-2 border-medteal-500/40 shadow-elevated flex flex-col items-center justify-center transition-transform ease-in-out"
              style={{
                transform: `scale(${isActive ? (currentPhase.scale || 1) : 1})`,
                transitionDuration: `${currentPhase.duration}s`,
              }}
            >
              <span className="text-[11px] font-bold uppercase tracking-widest text-medteal-700">
                {currentPhase.label}
              </span>
              <span className="text-4xl sm:text-5xl font-mono font-bold text-clinical-900 my-1 tabular-numbers">
                {secondsLeft}s
              </span>
              <span className="text-[11px] text-clinical-500 font-medium">
                Phase {phaseIndex + 1} of {currentTechnique.phases.length}
              </span>
            </div>
          </div>

          {/* Real-time Phase Guidance Text */}
          <div className="max-w-md mx-auto mt-4 mb-6">
            <h3 className="text-base sm:text-lg font-bold text-clinical-900 transition-all">
              {currentPhase.instruction}
            </h3>
            <p className="text-xs text-clinical-500 mt-1">
              {currentTechnique.clinicalImpact}
            </p>
          </div>

          {/* Interactive Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsActive(!isActive)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-clinical-900 hover:bg-clinical-800 text-white font-semibold text-sm shadow-card transition-all"
            >
              {isActive ? (
                <>
                  <Pause className="w-4 h-4 text-amber-400" />
                  <span>Pause Exercise</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 text-medteal-400" />
                  <span>{cyclesCompleted > 0 ? 'Resume Breathing' : 'Begin Breathing'}</span>
                </>
              )}
            </button>

            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-4 py-3 rounded-xl bg-white border border-clinical-300 hover:bg-clinical-50 text-clinical-700 text-sm font-semibold shadow-subtle transition-all"
              title="Reset timer and cycle count"
            >
              <RotateCcw className="w-4 h-4 text-clinical-500" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </section>

      {/* Clinical Biomarker Connection & Stress Insights */}
      <section className="bg-white rounded-2xl border border-clinical-200 shadow-card p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold text-base text-clinical-900">
            How Stress Directly Influences Your Laboratory Results
          </h3>
        </div>
        <p className="text-xs sm:text-sm text-clinical-600 mb-6 max-w-3xl">
          Clinical research demonstrates that the neuroendocrine stress cascade triggers measurable physiological shifts in circulating biomarkers:
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-1.5 text-rose-700 font-bold text-xs mb-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Fasting Blood Glucose</span>
            </div>
            <p className="text-xs text-clinical-700 leading-relaxed">
              Acute stress stimulates epinephrine and cortisol, signaling the liver to release stored glucose into the bloodstream, creating transient insulin resistance.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-1.5 text-medblue-700 font-bold text-xs mb-1.5">
              <HeartPulse className="w-3.5 h-3.5" />
              <span>Blood Pressure & Pulse</span>
            </div>
            <p className="text-xs text-clinical-700 leading-relaxed">
              Sympathetic nervous activation causes arterial vasoconstriction. Pre-appointment nervousness ("White-Coat Syndrome") frequently elevates systolic pressure by 10-20 mmHg.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-1.5 text-amber-700 font-bold text-xs mb-1.5">
              <Activity className="w-3.5 h-3.5" />
              <span>Lipids & Triglycerides</span>
            </div>
            <p className="text-xs text-clinical-700 leading-relaxed">
              Chronic emotional strain prompts adipose lipolysis, increasing circulating free fatty acids and stimulating hepatic triglyceride synthesis.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-1.5 text-indigo-700 font-bold text-xs mb-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Immune & Inflammation</span>
            </div>
            <p className="text-xs text-clinical-700 leading-relaxed">
              Prolonged stress impairs glucocorticoid receptor sensitivity, triggering low-grade systemic inflammation that can elevate hs-CRP and total leukocyte (WBC) counts.
            </p>
          </div>
        </div>
      </section>

      {/* 5 Evidence-Based Mind-Body Lifestyle Tips */}
      <section className="bg-white rounded-2xl border border-clinical-200 shadow-card p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-4">
          <Heart className="w-5 h-5 text-rose-500" />
          <h3 className="font-bold text-base text-clinical-900">
            5 Practical Clinical Tips for Stress & Metabolic Balance
          </h3>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-medteal-600 mt-0.5 shrink-0" />
            <div>
              <h5 className="font-bold text-xs text-clinical-900">Pre-Lab Paced Breathing</h5>
              <p className="text-xs text-clinical-600 mt-1 leading-relaxed">
                Practice 2 minutes of box breathing in the clinic waiting area before blood pressure checks or blood draws to normalize baseline hemodynamics.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-medteal-600 mt-0.5 shrink-0" />
            <div>
              <h5 className="font-bold text-xs text-clinical-900">10-Minute Postprandial Walk</h5>
              <p className="text-xs text-clinical-600 mt-1 leading-relaxed">
                A gentle, unhurried 10-minute walk after meals utilizes GLUT-4 transporters to clear circulating glucose without requiring extra pancreatic insulin.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-medteal-600 mt-0.5 shrink-0" />
            <div>
              <h5 className="font-bold text-xs text-clinical-900">Circadian Sleep Architecture</h5>
              <p className="text-xs text-clinical-600 mt-1 leading-relaxed">
                Consistent 7–8 hours of restorative sleep synchronizes diurnal cortisol rhythms and preserves peripheral cellular insulin sensitivity.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-medteal-600 mt-0.5 shrink-0" />
            <div>
              <h5 className="font-bold text-xs text-clinical-900">Hydration Before Testing</h5>
              <p className="text-xs text-clinical-600 mt-1 leading-relaxed">
                Drinking 300–500ml of pure water prior to fasting lab visits prevents spurious hemoconcentration, which falsely elevates BUN, hematocrit, and sodium.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-medteal-600 mt-0.5 shrink-0" />
            <div>
              <h5 className="font-bold text-xs text-clinical-900">Evening Screen Wind-Down</h5>
              <p className="text-xs text-clinical-600 mt-1 leading-relaxed">
                Reducing bright blue-light exposure 45 minutes before sleep enables natural pineal melatonin release and lowers nocturnal sympathetic arousal.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState('analysis'); // 'analysis' | 'compare' | 'raw'
  const [inputMode, setInputMode] = useState('upload'); // 'upload' | 'text'

  // File & report states
  const [files, setFiles] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [previousReportId, setPreviousReportId] = useState('');
  const [currentReportId, setCurrentReportId] = useState('');

  // Processing states
  const [manualText, setManualText] = useState('');
  const [explainLike10, setExplainLike10] = useState(false);
  const [language, setLanguage] = useState('en');
  const [tableFilter, setTableFilter] = useState('all'); // 'all' | 'abnormal' | 'normal'

  // Results
  const [analysis, setAnalysis] = useState(null);
  const [comparison, setComparison] = useState(null);

  // Loading & status
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState('');
  const [backendHealth, setBackendHealth] = useState(null);

  // Audio speech synthesis
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  const dashboardRef = useRef(null);
  const fileInputRef = useRef(null);

  // Check health on mount
  useEffect(() => {
    callApi('get', '/health')
      .then((res) => setBackendHealth(res.data))
      .catch(() => setBackendHealth({ status: 'offline' }));
  }, []);

  const selectedReport = reports.find((r) => r.report_id === selectedReportId);

  // Chart data
  const chartData = useMemo(() => {
    if (!analysis?.parameters) return [];
    return analysis.parameters
      .filter((v) => typeof v.value === 'number')
      .map((v) => ({
        name: v.name.length > 12 ? `${v.name.slice(0, 11)}...` : v.name,
        fullName: v.name,
        yourValue: v.value,
        normalUpper: parseNormalBounds(v.normal_range).high,
        normalRange: v.normal_range,
        status: v.status,
      }));
  }, [analysis]);

  const compareChartData = useMemo(() => {
    if (!comparison?.comparison) return [];
    return comparison.comparison.map((row) => ({
      name: row.name.length > 12 ? `${row.name.slice(0, 11)}...` : row.name,
      fullName: row.name,
      previous: row.previous_value,
      current: row.current_value,
      normalUpper: parseNormalBounds(row.normal_range).high,
    }));
  }, [comparison]);

  // Clinical Drawer & Prep Sheet states
  const [activeBiomarker, setActiveBiomarker] = useState(null);
  const [checkedQuestions, setCheckedQuestions] = useState({});
  const [customQuestions, setCustomQuestions] = useState([]);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [patientDoctorNotes, setPatientDoctorNotes] = useState('');
  const [copiedAgenda, setCopiedAgenda] = useState(false);

  // Prep sheet handlers
  const handleToggleQuestion = (id) => {
    setCheckedQuestions((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleAddCustomQuestion = (text) => {
    if (!text || !text.trim()) return;
    setCustomQuestions((prev) => [...prev, text.trim()]);
    setCheckedQuestions((prev) => ({
      ...prev,
      [`custom_${customQuestions.length}`]: true,
    }));
  };

  const handleRemoveCustomQuestion = (index) => {
    setCustomQuestions((prev) => prev.filter((_, i) => i !== index));
    setCheckedQuestions((prev) => {
      const updated = { ...prev };
      delete updated[`custom_${index}`];
      return updated;
    });
  };

  const handleCopyAgenda = () => {
    const baseQuestions = analysis?.doctor_questions || [];
    const lines = [
      `=== CLINICAL CONSULTATION AGENDA (${analysis?.report_type || 'Lab Assessment'}) ===`,
      `Date: ${new Date().toLocaleDateString()}`,
      `Risk Profile: ${analysis?.risk_level || 'Evaluated'}`,
      '',
      '--- RECOMMENDED DISCUSSION QUESTIONS ---',
    ];
    baseQuestions.forEach((q, idx) => {
      const isChecked = !!checkedQuestions[`base_${idx}`];
      lines.push(`[${isChecked ? 'X' : ' '}] ${q}`);
    });
    if (customQuestions.length > 0) {
      lines.push('', '--- PATIENT QUESTIONS & SYMPTOMS ---');
      customQuestions.forEach((q, idx) => {
        const isChecked = !!checkedQuestions[`custom_${idx}`];
        lines.push(`[${isChecked ? 'X' : ' '}] ${q}`);
      });
    }
    if (patientDoctorNotes) {
      lines.push('', '--- PATIENT OBSERVATIONS & NOTES ---', patientDoctorNotes);
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedAgenda(true);
    setTimeout(() => setCopiedAgenda(false), 2500);
  };

  // Upload handler
  const handleUpload = async (filesToUpload) => {
    const list = filesToUpload || files;
    if (!list.length) {
      setError('Please choose at least one valid medical document file.');
      return;
    }

    setLoadingUpload(true);
    setError('');

    const formData = new FormData();
    list.forEach((file) => formData.append('files', file));

    try {
      const res = await callApi('post', '/upload', formData);
      const payload = res.data.reports
        ? res.data.reports
        : [
            {
              report_id: res.data.report_id,
              filename: res.data.filename,
              extracted_text: res.data.extracted_text,
            },
          ];

      setReports((prev) => {
        const merged = [...prev, ...payload];
        return merged;
      });

      if (payload && payload.length > 0) {
        setSelectedReportId(payload[0].report_id);
        setCurrentReportId(payload[0].report_id);
        setInputMode('upload');
        if (!previousReportId) {
          setPreviousReportId(payload[0].report_id);
        }
      }

      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        (!err.response
          ? 'Cannot connect to medical server during upload. Please verify backend service on port 5000.'
          : err.message || 'File upload or OCR parsing failed. Please check file format.');
      setError(msg);
    } finally {
      setLoadingUpload(false);
    }
  };

  // Drag and drop events
  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      setFiles(droppedFiles);
      handleUpload(droppedFiles);
    }
  };

  // Trigger analysis
  const handleAnalyze = async (overrideLang, overrideExplain) => {
    // Strictly sanitize arguments so React Click Events or non-string values are never passed as language
    const activeLang = typeof overrideLang === 'string' && overrideLang.trim() ? overrideLang.trim() : language;
    const activeExplain = typeof overrideExplain === 'boolean' ? overrideExplain : explainLike10;

    let targetReportId = selectedReportId;
    if (inputMode === 'upload' && !targetReportId && reports.length > 0) {
      targetReportId = reports[0].report_id;
      setSelectedReportId(targetReportId);
    }

    if (inputMode === 'upload' && !targetReportId) {
      setError('Please upload or select a clinical report first.');
      return;
    }
    if (inputMode === 'text' && !manualText.trim()) {
      setError('Please enter or paste report text to analyze.');
      return;
    }

    setLoadingAnalyze(true);
    setError('');

    try {
      const selectedReport = reports.find((r) => r.report_id === targetReportId);
      const reportText = selectedReport ? selectedReport.extracted_text : '';

      const payload =
        inputMode === 'upload'
          ? {
              report_id: targetReportId,
              text: reportText,
              explain_like_10: Boolean(activeExplain),
              language: String(activeLang || 'en'),
            }
          : {
              text: manualText,
              explain_like_10: Boolean(activeExplain),
              language: String(activeLang || 'en'),
            };

      const res = await callApi('post', '/analyze', payload);
      setAnalysis(res.data);
      setActiveTab('analysis');
    } catch (err) {
      console.error('[DiagnostiQ Analyze Error]', err);
      const serverMsg = err.response?.data?.error || err.response?.data?.message;
      if (serverMsg) {
        setError(serverMsg);
      } else if (!err.response && (err.code === 'ERR_NETWORK' || err.message?.toLowerCase().includes('network'))) {
        setError('Cannot connect to medical analysis engine. Please ensure backend service is running on port 5000.');
      } else {
        setError(err.message || 'Analysis service encountered an unexpected error.');
      }
    } finally {
      setLoadingAnalyze(false);
    }
  };

  // Instant language change with live re-translation
  const handleLanguageChange = (newLang) => {
    setLanguage(newLang);
    if (analysis && (selectedReportId || manualText.trim())) {
      handleAnalyze(newLang, explainLike10);
    }
  };

  // Instant mode toggle with live re-analysis
  const handleExplainToggle = (checked) => {
    setExplainLike10(checked);
    if (analysis && (selectedReportId || manualText.trim())) {
      handleAnalyze(language, checked);
    }
  };

  // Trigger comparison
  const handleCompare = async () => {
    if (!previousReportId || !currentReportId) {
      setError('Please select both a prior baseline report and a current report.');
      return;
    }
    if (previousReportId === currentReportId) {
      setError('Please select two distinct reports to measure progression.');
      return;
    }

    setLoadingCompare(true);
    setError('');
    setComparison(null);

    try {
      const prevRep = reports.find((r) => r.report_id === previousReportId);
      const currRep = reports.find((r) => r.report_id === currentReportId);

      const res = await callApi('post', '/compare', {
        previous_report_id: previousReportId,
        previous_text: prevRep ? prevRep.extracted_text : '',
        current_report_id: currentReportId,
        current_text: currRep ? currRep.extracted_text : '',
      });
      setComparison(res.data);
      setActiveTab('compare');
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        (!err.response
          ? 'Cannot connect to medical analysis engine for report comparison.'
          : err.message || 'Comparison could not be completed.');
      setError(msg);
    } finally {
      setLoadingCompare(false);
    }
  };

  // Text-to-speech audio reader
  const toggleSpeech = () => {
    if (!window.speechSynthesis) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const narrative = `${analysis?.one_line_summary || ''}. ${analysis?.simple_explanation || ''}. ${analysis?.why_it_matters || ''}`;
    if (!narrative.trim()) return;

    const utterance = new SpeechSynthesisUtterance(narrative);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    if (language === 'hi') {
      utterance.lang = 'hi-IN';
    } else if (language === 'ta') {
      utterance.lang = 'ta-IN';
    } else {
      utterance.lang = 'en-US';
    }
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  // PDF Export
  const handleExportPdf = async () => {
    if (!dashboardRef.current) return;

    try {
      setExportingPdf(true);
      setError('');

      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: 1280,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const filename = `clinical-summary-${analysis?.report_type ? analysis.report_type.toLowerCase().replace(/\s+/g, '-') : 'report'}-${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(filename);
    } catch (e) {
      setError('PDF compilation failed. Please retry.');
    } finally {
      setExportingPdf(false);
    }
  };

  // Copy raw text
  const handleCopyText = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Filtered parameters table
  const filteredParameters = useMemo(() => {
    if (!analysis?.parameters) return [];
    if (tableFilter === 'abnormal') {
      return analysis.parameters.filter((p) =>
        ['high', 'low', 'abnormal'].includes(String(p.status).toLowerCase())
      );
    }
    if (tableFilter === 'normal') {
      return analysis.parameters.filter((p) => String(p.status).toLowerCase() === 'normal');
    }
    return analysis.parameters;
  }, [analysis, tableFilter]);

  // Cleaned and vetted clinical impressions / alerts
  const cleanedAlerts = useMemo(() => {
    if (!analysis?.alerts || !Array.isArray(analysis.alerts)) return [];
    const disclaimers = [
      'fictional',
      'website testing',
      'not a real',
      'software testing',
      'for testing only',
      'all listed values',
      'reference range',
      'test result unit',
      'authorized signatory',
      'laboratory stamp',
      'specimen edta',
      'collection date',
      'patient name',
      'report id',
      'patient id',
      'status final',
      'workflow',
    ];
    return analysis.alerts
      .map((a) => (typeof a === 'string' ? a.trim() : ''))
      .filter((a) => a.length >= 4 && a.length <= 220)
      .filter((a) => !disclaimers.some((d) => a.toLowerCase().includes(d)));
  }, [analysis]);

  // Risk gauge data
  const riskConfig = useMemo(() => {
    const r = (analysis?.risk_level || 'low').toLowerCase();
    if (r === 'high') {
      return {
        label: 'Elevated Risk',
        desc: 'Multiple key markers exceed clinical reference boundaries. Prompt medical consultation recommended.',
        pillClass: 'bg-rose-50 text-rose-800 border-rose-300',
        gaugeIndex: 3,
      };
    }
    if (r === 'medium') {
      return {
        label: 'Moderate Attention',
        desc: 'Select parameters show borderline or abnormal metrics. Preventative adjustments advised.',
        pillClass: 'bg-amber-50 text-amber-800 border-amber-300',
        gaugeIndex: 2,
      };
    }
    return {
      label: 'Optimal / Low Risk',
      desc: 'Extracted clinical biomarkers are consistent with healthy baseline values.',
      pillClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
      gaugeIndex: 1,
    };
  }, [analysis]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-clinical-900 font-sans selection:bg-medteal-100 selection:text-medteal-900">
      {/* Top Professional Header Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-clinical-200/80 shadow-subtle">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Product Name */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-clinical-900 text-white flex items-center justify-center shadow-subtle">
              <HeartPulse className="w-5 h-5 text-medteal-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-clinical-900">DiagnostiQ</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider bg-clinical-100 text-clinical-700 px-2 py-0.5 rounded-md border border-clinical-200">
                  Clinical Intelligence
                </span>
              </div>
              <p className="text-xs text-clinical-500 hidden sm:block">
                Precision Medical Report Translation & Biomarker Intelligence
              </p>
            </div>
          </div>

          {/* Right Header Badges & Actions */}
          <div className="flex items-center gap-3">
            {/* System Engine Health Pill */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs text-clinical-600">
              <span
                className={`w-2 h-2 rounded-full ${
                  backendHealth?.status === 'ok' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="font-mono text-[11px]">FLAN-T5 Seq2Seq</span>
              <span className="text-clinical-300">|</span>
              <span className="text-clinical-500">Multilingual</span>
            </div>

            {/* PDF Export Button */}
            {analysis && (
              <button
                onClick={handleExportPdf}
                disabled={exportingPdf}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-white border border-clinical-300 hover:border-clinical-400 hover:bg-clinical-50 text-clinical-800 shadow-sm transition-all"
              >
                <Download className="w-3.5 h-3.5 text-clinical-600" />
                <span>{exportingPdf ? 'Exporting...' : 'Export PDF'}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace Container */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Navigation Tabs Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-clinical-200 pb-4">
          <nav className="flex space-x-2">
            <button
              onClick={() => setActiveTab('analysis')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                activeTab === 'analysis'
                  ? 'bg-clinical-900 text-white shadow-sm'
                  : 'text-clinical-600 hover:text-clinical-900 hover:bg-clinical-100'
              }`}
            >
              <Stethoscope className="w-4 h-4" />
              Patient Analysis & Insights
            </button>
            <button
              onClick={() => setActiveTab('compare')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                activeTab === 'compare'
                  ? 'bg-clinical-900 text-white shadow-sm'
                  : 'text-clinical-600 hover:text-clinical-900 hover:bg-clinical-100'
              }`}
            >
              <GitCompare className="w-4 h-4" />
              Report Comparison
              {reports.length >= 2 && (
                <span className="ml-1 text-[10px] bg-medteal-600 text-white px-1.5 py-0.2 rounded-full font-mono">
                  {reports.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('raw')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                activeTab === 'raw'
                  ? 'bg-clinical-900 text-white shadow-sm'
                  : 'text-clinical-600 hover:text-clinical-900 hover:bg-clinical-100'
              }`}
            >
              <FileCode className="w-4 h-4" />
              Raw OCR & Extraction
            </button>
            <button
              onClick={() => setActiveTab('mind')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                activeTab === 'mind'
                  ? 'bg-clinical-900 text-white shadow-sm'
                  : 'text-clinical-600 hover:text-clinical-900 hover:bg-clinical-100'
              }`}
            >
              <Heart className="w-4 h-4 text-rose-500" />
              Mind & Vitality (Breathing)
            </button>
          </nav>

          {/* Quick Demo Report Buttons */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-clinical-500 font-medium hidden md:inline">Quick Test:</span>
            {SAMPLE_REPORTS.map((sample, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setInputMode('text');
                  setManualText(sample.text);
                  setError('');
                }}
                className="text-xs px-3 py-1.5 rounded-md bg-white border border-clinical-200 hover:border-medteal-500 hover:text-medteal-700 text-clinical-700 shadow-subtle transition-all font-medium inline-flex items-center gap-1.5"
                title={sample.subtitle}
              >
                <FileText className="w-3 h-3 text-clinical-400" />
                {sample.title.split(' ')[0]} {sample.title.split(' ')[1]}
              </button>
            ))}
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-4 flex items-start gap-3 text-rose-800 text-sm shadow-sm animate-fadeIn">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-rose-900">Notice</p>
              <p className="text-rose-700 mt-0.5">{error}</p>
            </div>
            <button
              onClick={() => setError('')}
              className="text-rose-500 hover:text-rose-800 text-xs font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: PATIENT ANALYSIS & INSIGHTS                                         */}
        {/* ========================================================================= */}
        {activeTab === 'analysis' && (
          <div className="space-y-6">
            {/* Input & Control Center Card */}
            <section className="bg-white rounded-2xl border border-clinical-200 shadow-card overflow-hidden">
              <div className="border-b border-clinical-100 px-6 py-4 bg-clinical-50/50 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg bg-clinical-200/60 p-0.5 text-xs font-medium text-clinical-700">
                    <button
                      onClick={() => setInputMode('upload')}
                      className={`px-3 py-1.5 rounded-md transition-all ${
                        inputMode === 'upload' ? 'bg-white text-clinical-900 shadow-subtle font-semibold' : 'hover:text-clinical-900'
                      }`}
                    >
                      Upload File (.PDF / Image / TXT)
                    </button>
                    <button
                      onClick={() => setInputMode('text')}
                      className={`px-3 py-1.5 rounded-md transition-all ${
                        inputMode === 'text' ? 'bg-white text-clinical-900 shadow-subtle font-semibold' : 'hover:text-clinical-900'
                      }`}
                    >
                      Paste Diagnostic Text
                    </button>
                  </div>
                </div>

                {/* Configuration Toggles */}
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  {/* Language Selector */}
                  <div className="flex items-center gap-1.5 bg-white border border-clinical-200 rounded-lg px-2.5 py-1.5 shadow-subtle">
                    <Globe className="w-3.5 h-3.5 text-clinical-400" />
                    <label className="text-clinical-600 font-medium">Language:</label>
                    <select
                      value={language}
                      onChange={(e) => handleLanguageChange(e.target.value)}
                      className="bg-transparent font-semibold text-clinical-800 focus:outline-none cursor-pointer"
                    >
                      <option value="en">English (US/UK)</option>
                      <option value="hi">हिंदी (Hindi)</option>
                      <option value="ta">தமிழ் (Tamil)</option>
                    </select>
                  </div>

                  {/* Explain Like I am 10 Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer select-none bg-white border border-clinical-200 rounded-lg px-3 py-1.5 shadow-subtle hover:border-clinical-300">
                    <input
                      type="checkbox"
                      checked={explainLike10}
                      onChange={(e) => handleExplainToggle(e.target.checked)}
                      className="rounded border-clinical-300 text-medteal-600 focus:ring-medteal-500"
                    />
                    <span className="font-medium text-clinical-700 flex items-center gap-1">
                      Beginner Mode (Explain Like I'm 10)
                    </span>
                  </label>
                </div>
              </div>

              <div className="p-6">
                {inputMode === 'upload' ? (
                  <div className="space-y-4">
                    {/* Drag & Drop Upload Zone */}
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-clinical-200 hover:border-medteal-500 bg-clinical-50/40 hover:bg-medteal-50/20 rounded-xl p-8 text-center cursor-pointer transition-all group"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png,.bmp,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const selected = Array.from(e.target.files || []);
                          setFiles(selected);
                          handleUpload(selected);
                        }}
                      />
                      <div className="mx-auto w-12 h-12 rounded-xl bg-white border border-clinical-200 flex items-center justify-center text-clinical-500 group-hover:text-medteal-600 group-hover:border-medteal-200 shadow-subtle transition-all">
                        <UploadCloud className="w-6 h-6" />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-clinical-800">
                        {loadingUpload ? 'Uploading and extracting...' : 'Drop medical reports here, or browse files'}
                      </p>
                      <p className="text-xs text-clinical-400 mt-1">
                        Supports digital or scanned PDFs, images (PNG, JPG), or raw text clinical exports
                      </p>
                    </div>

                    {/* Report Selector if multiple files uploaded */}
                    {reports.length > 0 && (
                      <div className="flex flex-wrap items-center gap-3 pt-2">
                        <span className="text-xs font-semibold text-clinical-600">Active Document:</span>
                        <div className="flex flex-wrap gap-2">
                          {reports.map((r) => (
                            <button
                              key={r.report_id}
                              onClick={() => setSelectedReportId(r.report_id)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                selectedReportId === r.report_id
                                  ? 'bg-clinical-900 text-white shadow-subtle'
                                  : 'bg-clinical-100 text-clinical-700 hover:bg-clinical-200'
                              }`}
                            >
                              <FileCheck className="w-3.5 h-3.5 opacity-70" />
                              <span className="truncate max-w-[160px]">{r.filename}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-clinical-600 mb-2">
                      Paste Diagnostic Report Text or Laboratory Summary
                    </label>
                    <textarea
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      rows={6}
                      className="w-full rounded-xl border border-clinical-200 p-3.5 text-xs font-mono text-clinical-800 focus:outline-none focus:ring-2 focus:ring-medteal-500/20 focus:border-medteal-500 transition-all bg-clinical-50/30"
                      placeholder="Paste laboratory results here, e.g.:&#10;Fasting Blood Sugar: 145 mg/dL (70-100)&#10;HbA1c: 7.2 % (4.0-5.6)&#10;Total Cholesterol: 220 mg/dL (125-200)..."
                    />
                  </div>
                )}

                {/* Primary Action Button */}
                <div className="mt-6 flex items-center justify-between pt-4 border-t border-clinical-100">
                  <div className="text-xs text-clinical-500">
                    {selectedReport ? (
                      <span>Selected: <strong className="text-clinical-800">{selectedReport.filename}</strong></span>
                    ) : inputMode === 'text' && manualText.trim() ? (
                      <span>Direct text input ({manualText.length} characters)</span>
                    ) : (
                      <span>Select or upload a report to begin</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleAnalyze()}
                    disabled={loadingAnalyze || (inputMode === 'upload' && !selectedReportId) || (inputMode === 'text' && !manualText.trim())}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-medteal-700 hover:bg-medteal-800 text-white shadow-card disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {loadingAnalyze ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Analyzing Biomarkers...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-medteal-200" />
                        <span>Analyze & Simplify Report</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>

            {/* Analysis Dashboard Output View */}
            {analysis && (
              <div ref={dashboardRef} className="space-y-6 animate-fadeIn">
                {/* Executive Assessment Card */}
                <section className="bg-white rounded-2xl border border-clinical-200 shadow-card p-6">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b border-clinical-100">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-medteal-50 text-medteal-800 border border-medteal-200">
                          {analysis.report_type || 'General Diagnostic'}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${riskConfig.pillClass}`}>
                          Risk Index: {analysis.risk_level || 'Low'}
                        </span>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-clinical-900">
                        {analysis.one_line_summary}
                      </h2>
                      <p className="text-sm text-clinical-600 leading-relaxed max-w-3xl">
                        {analysis.summary}
                      </p>
                    </div>

                    {/* Audio Narration & Language Controls */}
                    <div className="flex flex-col sm:flex-row items-center gap-2.5 bg-clinical-50 p-2.5 rounded-xl border border-clinical-200/80 shrink-0">
                      {/* Direct Language Switcher */}
                      <div className="flex items-center gap-1 bg-white border border-clinical-200 rounded-lg p-0.5 text-xs shadow-subtle">
                        {[
                          { code: 'en', label: 'English' },
                          { code: 'hi', label: 'हिंदी' },
                          { code: 'ta', label: 'தமிழ்' },
                        ].map((item) => (
                          <button
                            key={item.code}
                            onClick={() => handleLanguageChange(item.code)}
                            disabled={loadingAnalyze}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                              language === item.code
                                ? 'bg-clinical-900 text-white shadow-subtle'
                                : 'text-clinical-600 hover:text-clinical-900 hover:bg-clinical-100'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={toggleSpeech}
                        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                          isSpeaking
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'bg-white text-clinical-800 border border-clinical-300 hover:bg-clinical-100'
                        }`}
                      >
                        {isSpeaking ? (
                          <>
                            <VolumeX className="w-4 h-4" />
                            <span>Stop Audio</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-4 h-4 text-medteal-600" />
                            <span>Listen to Summary</span>
                          </>
                        )}
                      </button>
                      {isSpeaking && (
                        <div className="flex items-center gap-1">
                          <span className="w-1.5 h-3 bg-medteal-600 rounded-full animate-bounce" />
                          <span className="w-1.5 h-4 bg-medteal-600 rounded-full animate-bounce [animation-delay:0.15s]" />
                          <span className="w-1.5 h-2 bg-medteal-600 rounded-full animate-bounce [animation-delay:0.3s]" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Plain Language & Clinical Context Grid */}
                  <div className="grid md:grid-cols-2 gap-6 pt-6">
                    <div className="rounded-xl bg-slate-50/70 border border-slate-200/80 p-5">
                      <div className="flex items-center gap-2 mb-2 text-clinical-900 font-semibold text-sm">
                        <Info className="w-4 h-4 text-medblue-600" />
                        <span>Simple Explanation</span>
                        {explainLike10 && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono">
                            Age 10 Mode
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-clinical-700 leading-relaxed whitespace-pre-wrap">
                        {analysis.simple_explanation}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50/70 border border-slate-200/80 p-5">
                      <div className="flex items-center gap-2 mb-2 text-clinical-900 font-semibold text-sm">
                        <Activity className="w-4 h-4 text-medteal-600" />
                        <span>Clinical Significance (Why It Matters)</span>
                      </div>
                      <p className="text-xs sm:text-sm text-clinical-700 leading-relaxed whitespace-pre-wrap">
                        {analysis.why_it_matters}
                      </p>
                    </div>
                  </div>
                </section>

                {/* Clinical Impressions / Priority Findings */}
                {cleanedAlerts.length > 0 ? (
                  <section className="bg-rose-50/60 rounded-2xl border border-rose-200/90 p-5 shadow-subtle">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        <span>Noted Clinical Impressions & Diagnostic Findings</span>
                      </div>
                      <span className="text-[11px] font-mono font-semibold bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full border border-rose-200">
                        {cleanedAlerts.length} Identified
                      </span>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {cleanedAlerts.map((alert, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2.5 p-3 rounded-xl bg-white/90 border border-rose-200/90 text-xs text-rose-900 shadow-subtle leading-relaxed"
                        >
                          <span className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                          <span className="font-medium">{alert}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : (
                  analysis.parameters?.length > 0 &&
                  !analysis.parameters.some((p) => ['high', 'low', 'abnormal'].includes(String(p.status).toLowerCase())) && (
                    <section className="bg-emerald-50/70 rounded-2xl border border-emerald-200/90 p-4 shadow-subtle flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-emerald-900">
                          All Extracted Biomarkers Within Normal Clinical Limits
                        </h4>
                        <p className="text-xs text-emerald-700 mt-0.5">
                          No critical alerts, elevated markers, or acute pathology were noted in this diagnostic evaluation.
                        </p>
                      </div>
                    </section>
                  )
                )}

                {/* Biomarkers Table & Visual Range Gauges */}
                <section className="bg-white rounded-2xl border border-clinical-200 shadow-card overflow-hidden">
                  <div className="p-5 border-b border-clinical-100 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-base text-clinical-900">Extracted Laboratory Biomarkers</h3>
                      <p className="text-xs text-clinical-500">
                        Evaluated against standard clinical reference intervals
                      </p>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex rounded-lg bg-clinical-100 p-0.5 text-xs font-medium text-clinical-600">
                      <button
                        onClick={() => setTableFilter('all')}
                        className={`px-3 py-1 rounded-md transition-all ${
                          tableFilter === 'all' ? 'bg-white text-clinical-900 shadow-subtle font-semibold' : ''
                        }`}
                      >
                        All ({analysis.parameters?.length || 0})
                      </button>
                      <button
                        onClick={() => setTableFilter('abnormal')}
                        className={`px-3 py-1 rounded-md transition-all ${
                          tableFilter === 'abnormal' ? 'bg-white text-clinical-900 shadow-subtle font-semibold' : ''
                        }`}
                      >
                        Abnormal Only
                      </button>
                      <button
                        onClick={() => setTableFilter('normal')}
                        className={`px-3 py-1 rounded-md transition-all ${
                          tableFilter === 'normal' ? 'bg-white text-clinical-900 shadow-subtle font-semibold' : ''
                        }`}
                      >
                        Normal
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-clinical-50/80 border-b border-clinical-100 text-clinical-600 font-semibold uppercase tracking-wider text-[11px]">
                          <th className="py-3 px-4">Biomarker</th>
                          <th className="py-3 px-4">Patient Result</th>
                          <th className="py-3 px-4">Normal Reference</th>
                          <th className="py-3 px-4">Clinical Status</th>
                          <th className="py-3 px-4">Reference Spectrum</th>
                          <th className="py-3 px-4">Patient Explanation</th>
                          <th className="py-3 px-4 text-right">Deep Dive</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-clinical-100">
                        {filteredParameters.length > 0 ? (
                          filteredParameters.map((row, idx) => (
                            <tr
                              key={idx}
                              onClick={() => setActiveBiomarker(row)}
                              className="hover:bg-medteal-50/40 transition-colors cursor-pointer group"
                              title="Click to inspect organ system, clinical physiology, and causes"
                            >
                              <td className="py-3 px-4 font-semibold text-clinical-900">
                                <div className="flex items-center gap-2">
                                  <span>{row.name}</span>
                                  {row.organ_system && (
                                    <span className="hidden sm:inline-block text-[10px] font-normal text-clinical-500 bg-clinical-100 px-1.5 py-0.2 rounded border border-clinical-200">
                                      {row.organ_system.split(' ')[0]}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 font-mono font-bold text-clinical-900">
                                {row.your_value}{' '}
                                <span className="text-[11px] font-normal text-clinical-500 font-sans">
                                  {row.unit || ''}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-mono text-clinical-600">{row.normal_range}</td>
                              <td className="py-3 px-4">{renderStatusBadge(row.status)}</td>
                              <td className="py-3 px-4">
                                <BiomarkerRangeGauge
                                  value={row.your_value}
                                  rangeText={row.normal_range}
                                  status={row.status}
                                />
                              </td>
                              <td className="py-3 px-4 text-clinical-600 max-w-xs">{row.explanation}</td>
                              <td className="py-3 px-4 text-right">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-medteal-700 bg-medteal-50 group-hover:bg-medteal-100 border border-medteal-200 transition-all">
                                  <span>Inspect</span>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-clinical-400">
                              No parameters match the selected filter.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Analytical Visual Chart */}
                {chartData.length > 0 && (
                  <section className="bg-white rounded-2xl border border-clinical-200 shadow-card p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-base text-clinical-900">
                          Biomarker Spectrum vs Normal Upper Threshold
                        </h3>
                        <p className="text-xs text-clinical-500">
                          Comparative visualization of extracted numeric lab values
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1.5 text-clinical-700">
                          <span className="w-3 h-3 rounded-sm bg-clinical-800 inline-block" />
                          Patient Value
                        </span>
                        <span className="flex items-center gap-1.5 text-clinical-700">
                          <span className="w-3 h-3 rounded-sm bg-emerald-600 inline-block" />
                          Normal Upper Threshold
                        </span>
                      </div>
                    </div>

                    <div className="w-full mt-4" style={{ height: 288, minWidth: 0 }}>
                      <ResponsiveContainer width="100%" height={288} minWidth={0}>
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis
                            dataKey="name"
                            tick={{ fill: '#64748b', fontSize: 11 }}
                            axisLine={{ stroke: '#cbd5e1' }}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: '#64748b', fontSize: 11 }}
                            axisLine={{ stroke: '#cbd5e1' }}
                            tickLine={false}
                          />
                          <Tooltip content={<CustomChartTooltip />} />
                          <Bar
                            dataKey="yourValue"
                            fill="#1e293b"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={45}
                            name="Patient Value"
                          />
                          <Bar
                            dataKey="normalUpper"
                            fill="#059669"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={45}
                            name="Upper Limit"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                )}

                {/* Lifestyle & Clinical Recommendations */}
                {analysis.suggestions && analysis.suggestions.length > 0 && (
                  <section className="bg-white rounded-2xl border border-clinical-200 shadow-card p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-medteal-50 text-medteal-700 flex items-center justify-center">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base text-clinical-900">
                          Clinical Guidance & Non-Prescription Lifestyle Steps
                        </h3>
                        <p className="text-xs text-clinical-500">
                          Evidence-based general recommendations for supportive care
                        </p>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3.5">
                      {analysis.suggestions.map((suggestion, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70 text-xs text-clinical-800 leading-relaxed"
                        >
                          <CheckCircle2 className="w-4 h-4 text-medteal-600 shrink-0 mt-0.5" />
                          <span>{suggestion}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Interactive Doctor Consultation Prep Sheet */}
                <DoctorConsultationPrepSheet
                  analysis={analysis}
                  checkedQuestions={checkedQuestions}
                  onToggleQuestion={handleToggleQuestion}
                  customQuestions={customQuestions}
                  onAddCustomQuestion={handleAddCustomQuestion}
                  onRemoveCustomQuestion={handleRemoveCustomQuestion}
                  newQuestionText={newQuestionText}
                  setNewQuestionText={setNewQuestionText}
                  patientNotes={patientDoctorNotes}
                  setPatientNotes={setPatientDoctorNotes}
                  copiedAgenda={copiedAgenda}
                  onCopyAgenda={handleCopyAgenda}
                />

                {/* Mind & Vitality Quick Link Banner */}
                <div className="rounded-2xl bg-gradient-to-r from-medteal-50/90 via-slate-50 to-clinical-50 border border-medteal-200/90 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-subtle">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-medteal-100 text-medteal-800 flex items-center justify-center shrink-0 border border-medteal-200">
                      <Wind className="w-5 h-5 text-medteal-700" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-clinical-900">
                        Stress & Metabolic Equilibrium Coaching
                      </h4>
                      <p className="text-xs text-clinical-600 mt-0.5">
                        High stress and acute cortisol release directly spike blood sugar, blood pressure, and circulating lipids. Try our clinical guided breathing exercise.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('mind')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-clinical-900 hover:bg-clinical-800 text-white text-xs font-semibold shrink-0 shadow-card transition-all"
                  >
                    <Heart className="w-3.5 h-3.5 text-rose-400" />
                    <span>Open Guided Breathing Suite</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: HISTORICAL REPORT COMPARISON                                       */}
        {/* ========================================================================= */}
        {activeTab === 'compare' && (
          <div className="space-y-6 animate-fadeIn">
            <section className="bg-white rounded-2xl border border-clinical-200 shadow-card p-6">
              <div className="mb-5">
                <h2 className="text-lg font-bold text-clinical-900">Compare Historical vs Current Laboratory Reports</h2>
                <p className="text-xs text-clinical-500">
                  Select two past lab records to measure progression, improvement, or regression
                </p>
              </div>

              {reports.length >= 2 ? (
                <div className="grid md:grid-cols-3 gap-4 items-end">
                  <div>
                    <label className="block text-xs font-semibold text-clinical-600 mb-1.5">
                      Prior / Baseline Report
                    </label>
                    <select
                      value={previousReportId}
                      onChange={(e) => setPreviousReportId(e.target.value)}
                      className="w-full rounded-xl border border-clinical-200 p-2.5 text-xs font-medium text-clinical-800 focus:outline-none focus:ring-2 focus:ring-medteal-500"
                    >
                      <option value="">Select baseline document...</option>
                      {reports.map((r) => (
                        <option key={r.report_id} value={r.report_id}>
                          {r.filename}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-clinical-600 mb-1.5">
                      Current / Follow-up Report
                    </label>
                    <select
                      value={currentReportId}
                      onChange={(e) => setCurrentReportId(e.target.value)}
                      className="w-full rounded-xl border border-clinical-200 p-2.5 text-xs font-medium text-clinical-800 focus:outline-none focus:ring-2 focus:ring-medteal-500"
                    >
                      <option value="">Select follow-up document...</option>
                      {reports.map((r) => (
                        <option key={r.report_id} value={r.report_id}>
                          {r.filename}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => handleCompare()}
                    disabled={loadingCompare || !previousReportId || !currentReportId}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs bg-clinical-900 hover:bg-clinical-800 text-white shadow-card disabled:opacity-50 transition-all"
                  >
                    {loadingCompare ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Comparing Metrics...</span>
                      </>
                    ) : (
                      <>
                        <GitCompare className="w-3.5 h-3.5 text-medteal-400" />
                        <span>Run Progression Comparison</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="p-8 text-center bg-clinical-50/50 rounded-xl border border-dashed border-clinical-200">
                  <GitCompare className="w-8 h-8 text-clinical-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-clinical-800">At least 2 reports are required</p>
                  <p className="text-xs text-clinical-500 mt-1 max-w-md mx-auto">
                    Upload two different lab files in the Upload tab, or load both sample reports to compare progress.
                  </p>
                  <button
                    onClick={() => setActiveTab('analysis')}
                    className="mt-4 px-4 py-2 rounded-lg bg-medteal-700 text-white text-xs font-semibold shadow-subtle hover:bg-medteal-800"
                  >
                    Go to Upload Tab
                  </button>
                </div>
              )}
            </section>

            {/* Comparison Results Card */}
            {comparison && (
              <div className="space-y-6">
                <section className="bg-white rounded-2xl border border-clinical-200 shadow-card overflow-hidden">
                  <div className="p-5 border-b border-clinical-100 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-base text-clinical-900">Biomarker Delta Progression</h3>
                      <p className="text-xs text-clinical-500">
                        Detailed trajectory from Baseline ({comparison.previous_report_type}) to Current (
                        {comparison.current_report_type})
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-clinical-50/80 border-b border-clinical-100 text-clinical-600 font-semibold uppercase tracking-wider text-[11px]">
                          <th className="py-3 px-4">Biomarker</th>
                          <th className="py-3 px-4">Ref. Span</th>
                          <th className="py-3 px-4">Baseline</th>
                          <th className="py-3 px-4">Baseline State</th>
                          <th className="py-3 px-4">Current</th>
                          <th className="py-3 px-4">Current State</th>
                          <th className="py-3 px-4">Change Delta</th>
                          <th className="py-3 px-4">Trend Assessment</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-clinical-100">
                        {comparison.comparison.map((row, idx) => {
                          const isPositiveTrend =
                            row.trend?.toLowerCase().includes('improved') ||
                            row.trend?.toLowerCase().includes('normalized');
                          const isNegativeTrend =
                            row.trend?.toLowerCase().includes('worsened') ||
                            row.trend?.toLowerCase().includes('elevated');

                          return (
                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-3 px-4 font-semibold text-clinical-900">{row.name}</td>
                              <td className="py-3 px-4 font-mono text-clinical-600">{row.normal_range || '-'}</td>
                              <td className="py-3 px-4 font-mono text-clinical-700">{row.previous_value}</td>
                              <td className="py-3 px-4">{renderStatusBadge(row.previous_status)}</td>
                              <td className="py-3 px-4 font-mono font-bold text-clinical-900">{row.current_value}</td>
                              <td className="py-3 px-4">{renderStatusBadge(row.current_status)}</td>
                              <td className="py-3 px-4 font-mono font-semibold text-clinical-800">{row.difference}</td>
                              <td className="py-3 px-4">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                    isPositiveTrend
                                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                      : isNegativeTrend
                                      ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                      : 'bg-clinical-100 text-clinical-700'
                                  }`}
                                >
                                  {isPositiveTrend ? (
                                    <TrendingUp className="w-3 h-3 text-emerald-600" />
                                  ) : isNegativeTrend ? (
                                    <TrendingDown className="w-3 h-3 text-rose-600" />
                                  ) : (
                                    <Minus className="w-3 h-3 text-clinical-500" />
                                  )}
                                  {row.trend}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Comparative Bar Chart */}
                {compareChartData.length > 0 && (
                  <section className="bg-white rounded-2xl border border-clinical-200 shadow-card p-6">
                    <h3 className="font-bold text-base text-clinical-900 mb-1">
                      Visual Progression Comparison
                    </h3>
                    <p className="text-xs text-clinical-500 mb-4">
                      Side-by-side contrast of previous vs current biomarker measurements
                    </p>

                    <div className="w-full mt-4" style={{ height: 288, minWidth: 0 }}>
                      <ResponsiveContainer width="100%" height={288} minWidth={0}>
                        <BarChart data={compareChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis
                            dataKey="name"
                            tick={{ fill: '#64748b', fontSize: 11 }}
                            axisLine={{ stroke: '#cbd5e1' }}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: '#64748b', fontSize: 11 }}
                            axisLine={{ stroke: '#cbd5e1' }}
                            tickLine={false}
                          />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="previous" fill="#94a3b8" radius={[4, 4, 0, 0]} name="Baseline" />
                          <Bar dataKey="current" fill="#0d9488" radius={[4, 4, 0, 0]} name="Current" />
                          <Bar dataKey="normalUpper" fill="#cbd5e1" radius={[4, 4, 0, 0]} name="Ref Upper" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: RAW OCR EXTRACTION & METADATA                                      */}
        {/* ========================================================================= */}
        {activeTab === 'raw' && (
          <section className="bg-white rounded-2xl border border-clinical-200 shadow-card p-6 animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base text-clinical-900">Extracted Raw Document Content</h3>
                <p className="text-xs text-clinical-500">
                  Digital text or Tesseract OCR output before token normalization
                </p>
              </div>
              {selectedReport && (
                <button
                  onClick={() => handleCopyText(selectedReport.extracted_text)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-clinical-200 text-xs font-medium text-clinical-700 hover:bg-clinical-50 transition-all"
                >
                  {copiedText ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-clinical-500" />
                      <span>Copy Raw Text</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {selectedReport ? (
              <div className="rounded-xl bg-slate-900 text-slate-100 p-4 font-mono text-xs overflow-auto max-h-[500px] leading-relaxed">
                <pre className="whitespace-pre-wrap">{selectedReport.extracted_text}</pre>
              </div>
            ) : manualText ? (
              <div className="rounded-xl bg-slate-900 text-slate-100 p-4 font-mono text-xs overflow-auto max-h-[500px] leading-relaxed">
                <pre className="whitespace-pre-wrap">{manualText}</pre>
              </div>
            ) : (
              <div className="p-8 text-center bg-clinical-50/50 rounded-xl border border-dashed border-clinical-200 text-clinical-400 text-xs">
                No active document or text is currently loaded.
              </div>
            )}
          </section>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: MIND & VITALITY (BREATHING & STRESS REDUCTION SUITE)               */}
        {/* ========================================================================= */}
        {activeTab === 'mind' && (
          <MindAndVitalitySection />
        )}

        {/* ========================================================================= */}
        {/* CONTEXTUAL BIOMARKER DEEP-DIVE DRAWER                                     */}
        {/* ========================================================================= */}
        {activeBiomarker && (
          <BiomarkerDeepDiveDrawer
            biomarker={activeBiomarker}
            onClose={() => setActiveBiomarker(null)}
            allParameters={analysis?.parameters}
            onSelectRelated={(marker) => setActiveBiomarker(marker)}
          />
        )}

        {/* Clinical Disclaimer Notice Footer */}
        <footer className="mt-12 pt-6 border-t border-clinical-200/80 text-center text-xs text-clinical-500 space-y-2">
          <div className="flex items-center justify-center gap-2 text-clinical-700 font-semibold">
            <ShieldCheck className="w-4 h-4 text-medteal-600" />
            <span>Clinical Educational & Informational Tool</span>
          </div>
          <p className="max-w-2xl mx-auto text-clinical-500 leading-relaxed">
            DiagnostiQ AI utilizes Seq2Seq NLP modeling to assist patient comprehension. It does not provide medical diagnoses, treatment plans, or prescription decisions. Always consult your certified physician or licensed healthcare specialist for clinical guidance.
          </p>
          <p className="text-[11px] text-clinical-400">
            DiagnostiQ Platform · Compliant Health Intelligence Architecture
          </p>
        </footer>
      </main>
    </div>
  );
}
