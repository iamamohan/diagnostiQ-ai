import json
import re
from typing import Dict, List, Optional, Tuple


KEYWORDS = ["high", "low", "elevated", "abnormal", "positive", "critical"]

REPORT_TYPES = [
	"Blood Test Report",
	"Diabetes Report",
	"Lipid Profile",
	"General Health Report",
	"Unknown",
]


REPORT_TYPE_KEYWORDS = {
	"Diabetes Report": ["glucose", "blood sugar", "hba1c", "fasting", "postprandial", "fbs", "rbs"],
	"Lipid Profile": ["cholesterol", "ldl", "hdl", "triglycerides", "lipid"],
	"Blood Test Report": ["hemoglobin", "wbc", "rbc", "platelet", "cbc", "esr"],
	"General Health Report": ["creatinine", "urea", "sodium", "potassium", "vitamin d", "routine"],
}


VALUE_LINE_RE = re.compile(
	r"(?P<name>[A-Za-z][A-Za-z0-9\s()/%.-]{2,50}?)\s+[:=-]?\s*"
	r"(?P<value>\d+(?:\.\d+)?)\s*"
	r"(?P<unit>[A-Za-z/%µ\^0-9.-]+)?"
	r"(?:\s*(?:\(|\[)?\s*(?P<low>\d+(?:\.\d+)?)\s*[-to]{1,3}\s*(?P<high>\d+(?:\.\d+)?)\s*(?P<range_unit>[A-Za-z/%µ\^0-9.-]+)?\s*(?:\)|\])?)?",
	re.IGNORECASE,
)

BLOOD_PRESSURE_RE = re.compile(
	r"(?:blood\s*pressure|\bbp\b)\s*[:=-]?\s*(\d{2,3})\s*/\s*(\d{2,3})",
	re.IGNORECASE,
)

VALID_PARAMETER_ALIASES: Dict[str, List[str]] = {
	"glucose": ["glucose", "blood sugar", "sugar", "fbs", "rbs", "fasting glucose", "ppbs", "postprandial"],
	"hba1c": ["hba1c", "hb a1c", "glycated hemoglobin"],
	"cholesterol": ["cholesterol", "total cholesterol"],
	"ldl": ["ldl", "ldl-c"],
	"hdl": ["hdl", "hdl-c"],
	"triglycerides": ["triglycerides", "tg"],
	"hemoglobin": ["hemoglobin", "haemoglobin"],
	"wbc": ["wbc", "white blood cell", "white blood cells", "wbc count"],
	"rbc": ["rbc", "red blood cell", "red blood cells", "rbc count"],
	"platelet": ["platelet", "platelets", "platelet count"],
	"hematocrit": ["hematocrit", "pcv", "packed cell volume"],
	"mcv": ["mcv", "mean corpuscular volume"],
	"mch": ["mch", "mean corpuscular hemoglobin"],
	"mchc": ["mchc", "mean corpuscular hemoglobin concentration"],
	"neutrophils": ["neutrophils", "neutrophil", "polymorphs"],
	"lymphocytes": ["lymphocytes", "lymphocyte"],
	"eosinophils": ["eosinophils", "eosinophil"],
	"monocytes": ["monocytes", "monocyte"],
	"esr": ["esr", "erythrocyte sedimentation rate"],
	"creatinine": ["creatinine"],
	"urea": ["urea", "bun"],
	"sodium": ["sodium", "na"],
	"potassium": ["potassium", "k"],
	"systolic blood pressure": ["systolic blood pressure", "systolic bp"],
	"diastolic blood pressure": ["diastolic blood pressure", "diastolic bp"],
}

DISPLAY_NAMES: Dict[str, str] = {
	"glucose": "Glucose",
	"hba1c": "HbA1c",
	"cholesterol": "Cholesterol",
	"ldl": "LDL",
	"hdl": "HDL",
	"triglycerides": "Triglycerides",
	"hemoglobin": "Hemoglobin",
	"wbc": "WBC Count",
	"rbc": "RBC Count",
	"platelet": "Platelet Count",
	"hematocrit": "Hematocrit (PCV)",
	"mcv": "MCV",
	"mch": "MCH",
	"mchc": "MCHC",
	"neutrophils": "Neutrophils",
	"lymphocytes": "Lymphocytes",
	"eosinophils": "Eosinophils",
	"monocytes": "Monocytes",
	"esr": "ESR",
	"creatinine": "Creatinine",
	"urea": "Urea",
	"sodium": "Sodium",
	"potassium": "Potassium",
	"systolic blood pressure": "Systolic Blood Pressure",
	"diastolic blood pressure": "Diastolic Blood Pressure",
}


def _safe_float(raw: str) -> Optional[float]:
	try:
		return float(raw)
	except (TypeError, ValueError):
		return None


def _extract_range_bounds(range_text: str) -> Tuple[Optional[float], Optional[float]]:
	if not range_text:
		return None, None
	t = range_text.lower()

	# Example: <200 mg/dL
	lt = re.search(r"<\s*(\d+(?:\.\d+)?)", t)
	if lt:
		return None, _safe_float(lt.group(1))

	# Example: >40
	gt = re.search(r">\s*(\d+(?:\.\d+)?)", t)
	if gt:
		return _safe_float(gt.group(1)), None

	# Example: 70-140
	mm = re.search(r"(\d+(?:\.\d+)?)\s*[-]\s*(\d+(?:\.\d+)?)", t)
	if mm:
		return _safe_float(mm.group(1)), _safe_float(mm.group(2))

	return None, None


def normalize_test_name(name: str) -> str:
	return re.sub(r"\s+", " ", name.strip().lower())


def normalize_report_type(raw_type: str) -> str:
	text = (raw_type or "").strip().lower()
	if "diabet" in text or "glucose" in text or "hba1c" in text:
		return "Diabetes Report"
	if "lipid" in text or "cholesterol" in text or "triglyceride" in text:
		return "Lipid Profile"
	if "blood" in text or "cbc" in text or "hemoglobin" in text:
		return "Blood Test Report"
	if "general" in text or "health" in text or "routine" in text:
		return "General Health Report"
	return "General Health Report"


def detect_report_type_by_keywords(text: str) -> str:
	content = (text or "").lower()
	scores = {rtype: 0 for rtype in REPORT_TYPE_KEYWORDS}

	for rtype, words in REPORT_TYPE_KEYWORDS.items():
		for w in words:
			if w in content:
				scores[rtype] += 1

	best_type = max(scores, key=scores.get)
	if scores[best_type] == 0:
		return "General Health Report"
	return best_type


def load_medical_ranges(file_path: str) -> Dict[str, Dict[str, Dict[str, object]]]:
	with open(file_path, "r", encoding="utf-8") as f:
		data = json.load(f)
	return data


def _catalog_for_type(
	ranges_data: Dict[str, Dict[str, Dict[str, object]]],
	report_type: str,
) -> Dict[str, Dict[str, object]]:
	scoped = ranges_data.get(report_type, {})
	fallback = ranges_data.get("General Health Report", {})
	merged = dict(fallback)
	merged.update(scoped)
	return merged


def _find_dynamic_range(
	name: str,
	report_type: str,
	ranges_data: Dict[str, Dict[str, Dict[str, object]]],
) -> Optional[Tuple[float, float, str]]:
	n = normalize_test_name(name)
	catalog = _catalog_for_type(ranges_data, report_type)
	for key, bounds in catalog.items():
		key_n = normalize_test_name(key)
		if key_n == n or key_n in n or n in key_n:
			return float(bounds["low"]), float(bounds["high"]), str(bounds.get("unit", ""))

	# Cross-report fallback: if parameter is valid but appears in another panel (e.g., cholesterol in diabetes report).
	for _rtype, items in ranges_data.items():
		for key, bounds in items.items():
			key_n = normalize_test_name(key)
			if key_n == n or key_n in n or n in key_n:
				return float(bounds["low"]), float(bounds["high"]), str(bounds.get("unit", ""))
	return None


def _canonical_parameter(name: str) -> Optional[str]:
	n = normalize_test_name(name)
	# 1. Exact match against aliases
	for canonical, aliases in VALID_PARAMETER_ALIASES.items():
		for alias in aliases:
			if n == normalize_test_name(alias):
				return canonical

	# 2. Word boundary match against aliases, prioritizing longer alias names (e.g. mchc before mch)
	all_candidates = []
	for canonical, aliases in VALID_PARAMETER_ALIASES.items():
		for alias in aliases:
			all_candidates.append((normalize_test_name(alias), canonical))
	all_candidates.sort(key=lambda x: len(x[0]), reverse=True)

	for alias, canonical in all_candidates:
		if re.search(rf"\b{re.escape(alias)}\b", n):
			return canonical

	return None


def _format_range(low: float, high: float, unit: Optional[str]) -> str:
	if unit:
		return f"{low}-{high} {unit}"
	return f"{low}-{high}"


def extract_lab_values(
	text: str,
	report_type: str,
	ranges_data: Dict[str, Dict[str, Dict[str, object]]],
) -> List[Dict[str, object]]:
	rows: List[Dict[str, object]] = []
	seen = set()

	# Parse blood pressure lines first (e.g., BP: 130/85).
	for line in text.splitlines():
		clean = line.strip()
		if not clean:
			continue
		bp = BLOOD_PRESSURE_RE.search(clean)
		if not bp:
			continue

		systolic = float(bp.group(1))
		diastolic = float(bp.group(2))

		for name, value in [
			("systolic blood pressure", systolic),
			("diastolic blood pressure", diastolic),
		]:
			dynamic = _find_dynamic_range(name, report_type, ranges_data)
			if dynamic is None:
				continue

			low, high, range_unit = dynamic
			status = "Normal"
			if value < low:
				status = "Low"
			elif value > high:
				status = "High"

			normal_range = _format_range(low, high, range_unit)
			display_name = DISPLAY_NAMES.get(name, name.title())
			key = (name, value, status)
			if key in seen:
				continue
			seen.add(key)

			rows.append(
				{
					"name": display_name,
					"your_value": value,
					"unit": range_unit,
					"normal_range": normal_range,
					"status": status,
					"report_type": report_type,
				}
			)

	for line in text.splitlines():
		clean = line.strip()
		if not clean:
			continue

		m = VALUE_LINE_RE.search(clean)
		if not m:
			continue

		name = m.group("name").strip(" :-")
		if len(name) < 3:
			continue

		canonical = _canonical_parameter(name)
		if canonical is None:
			continue
		display_name = DISPLAY_NAMES.get(canonical, canonical.title())

		value = float(m.group("value"))
		if value <= 0:
			continue
		unit = (m.group("unit") or "").strip()

		if m.group("low") and m.group("high"):
			low = float(m.group("low"))
			high = float(m.group("high"))
			range_unit = unit.strip()
			if not range_unit:
				dynamic = _find_dynamic_range(canonical, report_type, ranges_data)
				if dynamic is not None:
					_, _, dyn_unit = dynamic
					range_unit = dyn_unit
		else:
			dynamic = _find_dynamic_range(canonical, report_type, ranges_data)
			if dynamic is None:
				continue
			else:
				low, high, dyn_unit = dynamic
				range_unit = unit or dyn_unit

		normal_range = _format_range(low, high, range_unit)
		if value < low:
			status = "Low"
		elif value > high:
			status = "High"
		else:
			status = "Normal"

		key = (canonical, value, status)
		if key in seen:
			continue
		seen.add(key)

		rows.append(
			{
				"name": display_name,
				"your_value": value,
				"unit": unit or range_unit,
				"normal_range": normal_range,
				"status": status,
				"report_type": report_type,
			}
		)

	# Supplemental fallback: compact OCR text can collapse multiple rows into one line.
	flat = " ".join(text.splitlines())
	for canonical, aliases in VALID_PARAMETER_ALIASES.items():
		# Skip if canonical already extracted.
		if any(normalize_test_name(r["name"]) == normalize_test_name(DISPLAY_NAMES.get(canonical, canonical.title())) for r in rows):
			continue

		dynamic = _find_dynamic_range(canonical, report_type, ranges_data)
		if dynamic is None:
			continue

		low, high, dyn_unit = dynamic
		display_name = DISPLAY_NAMES.get(canonical, canonical.title())

		matched = None
		for alias in sorted(aliases, key=len, reverse=True):
			pattern = re.compile(
				rf"\b{re.escape(alias)}\b[^0-9]{{0,15}}(?P<value>\d+(?:\.\d+)?)\s*(?P<unit>[A-Za-z/%]+)?",
				re.IGNORECASE,
			)
			m = pattern.search(flat)
			if m:
				matched = m
				break

		if not matched:
			continue

		value = float(matched.group("value"))
		if value <= 0:
			continue
		unit = (matched.group("unit") or dyn_unit or "").strip()

		if value < low:
			status = "Low"
		elif value > high:
			status = "High"
		else:
			status = "Normal"

		normal_range = _format_range(low, high, dyn_unit or unit)
		key = (canonical, value, status)
		if key in seen:
			continue
		seen.add(key)

		rows.append(
			{
				"name": display_name,
				"your_value": value,
				"unit": unit,
				"normal_range": normal_range,
				"status": status,
				"report_type": report_type,
			}
		)

	return rows


DISCLAIMER_WORDS = [
	"fictional",
	"website testing",
	"not a real",
	"software testing",
	"for testing only",
	"educational purpose",
	"all listed values",
	"reference range",
	"unit reference",
	"test result",
	"authorized signatory",
	"laboratory stamp",
	"specimen edta",
	"report date",
	"collection date",
	"patient id",
	"patient name",
	"report id",
	"workflow",
]

ALERT_WORDS_RE = re.compile(
	r"\b(critically?\s+high|critically?\s+low|critical\s+value|markedly\s+elevated|elevated|abnormal|positive|urgent|dangerously?)\b|\b(critical|severe)\b",
	re.IGNORECASE,
)


def detect_keyword_alerts(text: str) -> List[str]:
	alerts = []
	seen = set()

	# 1. Targeted Impression / Diagnosis extraction
	impression_match = re.search(
		r"(?:impression|clinical\s*notes?|diagnosis|doctor'?s?\s*remarks?|remarks?|comments?)\s*[:=-]\s*(.*?)(?=(?:\n\s*[A-Z][A-Za-z\s]{3,20}:|$))",
		text,
		re.IGNORECASE | re.DOTALL,
	)
	if impression_match:
		raw_impression = impression_match.group(1).strip()
		for part in re.split(r"[.\n•●▪]+", raw_impression):
			cleaned = part.strip()
			if not cleaned or len(cleaned) < 5 or len(cleaned) > 160:
				continue
			low_c = cleaned.lower()
			if any(dw in low_c for dw in DISCLAIMER_WORDS):
				continue
			if re.search(
				r"\b(advised|clinical correlation|observed|elevated|abnormal|high|low|positive|present|noted|detected|suggestive|consistent with)\b",
				low_c,
			):
				if low_c not in seen:
					seen.add(low_c)
					alerts.append(cleaned)

	# 2. Check individual lines for critical/alert keywords
	for line in text.splitlines():
		cl = line.strip()
		if not cl or len(cl) < 6 or len(cl) > 160:
			continue
		low_l = cl.lower()

		if any(dw in low_l for dw in DISCLAIMER_WORDS):
			continue
		if re.search(r"^(patient|age|gender|sex|date|doctor|dr\.|specimen|status|report|id)\b", low_l):
			continue
		if re.search(r"\b(normal|borderline)\b", low_l) and not re.search(r"\b(abnormal|critical|elevated)\b", low_l):
			continue

		if ALERT_WORDS_RE.search(cl):
			if low_l not in seen:
				seen.add(low_l)
				alerts.append(cl)

	return alerts[:6]


def compute_risk_level(abnormal_values: List[Dict[str, object]], keyword_alerts: List[str]) -> str:
	score = 0

	for row in abnormal_values:
		status = str(row.get("status", "")).lower()
		if status in {"high", "low", "abnormal"}:
			score += 2

	for line in keyword_alerts:
		lline = line.lower()
		if "critical" in lline:
			score += 3
		elif any(k in lline for k in ["high", "low", "elevated", "abnormal", "positive"]):
			score += 1

	if score >= 6:
		return "High"
	if score >= 2:
		return "Medium"
	return "Low"



def compare_report_values(
	previous_values: List[Dict[str, object]],
	current_values: List[Dict[str, object]],
) -> List[Dict[str, object]]:
	prev_map = {normalize_test_name(item["name"]): item for item in previous_values}
	changes = []

	for item in current_values:
		key = normalize_test_name(item["name"])
		if key not in prev_map:
			continue

		old_val = float(prev_map[key]["your_value"])
		new_val = float(item["your_value"])
		delta = round(new_val - old_val, 2)

		prev_status = str(prev_map[key].get("status", "")).lower()
		curr_status = str(item.get("status", "")).lower()

		prev_low, prev_high = _extract_range_bounds(str(prev_map[key].get("normal_range", "")))
		curr_low, curr_high = _extract_range_bounds(str(item.get("normal_range", "")))

		def distance_from_normal(v: float, low: Optional[float], high: Optional[float]) -> float:
			if low is not None and v < low:
				return low - v
			if high is not None and v > high:
				return v - high
			return 0.0

		prev_dist = distance_from_normal(old_val, prev_low, prev_high)
		curr_dist = distance_from_normal(new_val, curr_low, curr_high)

		if curr_dist < prev_dist:
			trend = "Improved"
		elif curr_dist > prev_dist:
			trend = "Worsened"
		else:
			if prev_status == curr_status:
				trend = "No Change"
			elif curr_status == "normal" and prev_status in {"high", "low", "abnormal"}:
				trend = "Improved"
			elif prev_status == "normal" and curr_status in {"high", "low", "abnormal"}:
				trend = "Worsened"
			else:
				trend = "No Change"

		changes.append(
			{
				"name": item["name"],
				"previous_value": old_val,
				"current_value": new_val,
				"normal_range": item.get("normal_range") or prev_map[key].get("normal_range", ""),
				"previous_status": prev_map[key].get("status", ""),
				"current_status": item.get("status", ""),
				"difference": delta,
				"trend": trend,
			}
		)

	return changes


def parameter_explanation(name: str, status: str, value: float, normal_range: str) -> str:
	s = status.lower()
	if s == "high":
		return f"Your {name.lower()} is high. This means it is above the healthy range ({normal_range}) and should be discussed with your doctor."
	if s == "low":
		return f"Your {name.lower()} is low. This means it is below the healthy range ({normal_range}) and may need attention."
	if s == "normal":
		return f"Your {name.lower()} is in the normal range. This is a healthy sign."
	return f"Your {name.lower()} needs review against the expected range ({normal_range})."


# =========================================================================
# CLINICAL INTELLIGENCE: BIOMARKER DEEP-DIVE DETAILS
# =========================================================================
BIOMARKER_CLINICAL_DETAILS = {
	"glucose": {
		"organ_system": "Endocrine & Metabolic",
		"clinical_function": "Primary circulating energy source for cells; tightly regulated by pancreatic insulin secretion.",
		"high_implications": "Suggests insulin resistance, impaired fasting glucose, diabetes mellitus, acute physiological stress, or corticosteroid medication effect.",
		"low_implications": "May indicate prolonged fasting, reactive hypoglycemia, insulin overdose, or strenuous exertion without carbohydrates.",
		"related_markers": ["HbA1c", "Triglycerides", "Fasting Insulin"],
		"consultation_questions": [
			"Is a follow-up Fasting Blood Sugar or HbA1c test recommended to confirm long-term glucose trends?",
			"Would dietary adjustments or formal diabetes screening be advisable at this stage?",
			"Are any of my current medications contributing to this blood glucose level?",
		],
	},
	"hba1c": {
		"organ_system": "Endocrine & Metabolic",
		"clinical_function": "Measures percentage of glycated hemoglobin, reflecting average blood glucose control over the preceding 60 to 90 days.",
		"high_implications": "Indicates sustained hyperglycemia, prediabetes (5.7–6.4%) or diabetes (>=6.5%), carrying increased cardiovascular and microvascular risk.",
		"low_implications": "Unusually low levels can occur with chronic hypoglycemia, hemolytic anemia, or recent heavy blood turnover.",
		"related_markers": ["Glucose", "Triglycerides", "Urine Microalbumin"],
		"consultation_questions": [
			"What is my individualized target HbA1c goal based on my age and medical background?",
			"Should we initiate or adjust glucose-lowering therapy or lifestyle interventions?",
			"How frequently should my HbA1c be re-checked (every 3 or 6 months)?",
		],
	},
	"cholesterol": {
		"organ_system": "Cardiovascular & Lipid",
		"clinical_function": "Essential sterol molecule used in cell membrane stability, steroid hormone synthesis, and bile acid production.",
		"high_implications": "Elevated circulating cholesterol contributes to atherosclerotic plaque accumulation in coronary and peripheral arteries.",
		"low_implications": "Very low total cholesterol may indicate malabsorption, severe malnutrition, or advanced hepatic dysfunction.",
		"related_markers": ["LDL", "HDL", "Triglycerides", "Non-HDL Cholesterol"],
		"consultation_questions": [
			"Does my lipid profile warrant a 10-year ASCVD (cardiovascular risk) evaluation?",
			"Are targeted dietary modifications sufficient, or is statin therapy appropriate?",
			"When should I schedule repeat lipid profiling to monitor response?",
		],
	},
	"ldl": {
		"organ_system": "Cardiovascular & Lipid",
		"clinical_function": "Low-density lipoprotein ('bad cholesterol') that transports cholesterol to peripheral blood vessel walls.",
		"high_implications": "Primary clinical predictor for coronary artery disease, stroke, and arterial stenosis.",
		"low_implications": "Generally favorable; very low levels can rarely occur with hypolipoproteinemia or chronic illness.",
		"related_markers": ["Total Cholesterol", "ApoB", "Triglycerides"],
		"consultation_questions": [
			"What is my personalized target LDL level based on my overall cardiovascular risk profile?",
			"Would a coronary artery calcium (CAC) scan or lipid-lowering medication be helpful?",
		],
	},
	"hdl": {
		"organ_system": "Cardiovascular & Lipid",
		"clinical_function": "High-density lipoprotein ('good cholesterol') that conducts reverse cholesterol transport from vessels back to liver.",
		"high_implications": "Cardioprotective marker; strongly correlated with lower cardiovascular morbidity and active aerobic fitness.",
		"low_implications": "Independent risk factor for coronary heart disease; commonly seen in metabolic syndrome, smoking, and sedentary lifestyle.",
		"related_markers": ["Total Cholesterol", "Triglycerides", "Fasting Glucose"],
		"consultation_questions": [
			"What specific aerobic conditioning and dietary changes (e.g. healthy fats) can help raise my HDL?",
			"Does my low HDL in combination with other lipids suggest metabolic syndrome?",
		],
	},
	"triglycerides": {
		"organ_system": "Cardiovascular & Lipid",
		"clinical_function": "Major form of stored energy in body fat; circulates in lipoproteins after meals.",
		"high_implications": "Associated with excess refined carbohydrate/alcohol intake, insulin resistance, hepatic steatosis, and acute pancreatitis risk if >500 mg/dL.",
		"low_implications": "Seen in very low-fat diets, hyperthyroidism, or intestinal malabsorption.",
		"related_markers": ["Glucose", "HDL", "Liver Function (ALT/AST)"],
		"consultation_questions": [
			"Could my triglyceride level be linked to early insulin resistance or fatty liver changes?",
			"What specific dietary restrictions (sugars, alcohol) should I prioritize?",
		],
	},
	"hemoglobin": {
		"organ_system": "Hematology & Oxygen Transport",
		"clinical_function": "Iron-rich protein in red blood cells that binds oxygen in the lungs and delivers it to tissues throughout the body.",
		"high_implications": "Can indicate dehydration (hemoconcentration), polycythemia vera, smoking, chronic hypoxemia, or altitude adaptation.",
		"low_implications": "Defines anemia (iron deficiency, chronic disease, occult GI bleeding, vitamin B12/folate deficiency, renal failure).",
		"related_markers": ["Hematocrit (PCV)", "RBC Count", "MCV", "MCHC", "Serum Ferritin"],
		"consultation_questions": [
			"Should we run a complete iron panel (Ferritin, Transferrin) or Vitamin B12 test to identify the cause of my anemia?",
			"Is there any evidence or need to check for gastrointestinal blood loss?",
			"Are oral iron supplements or dietary modifications indicated?",
		],
	},
	"wbc": {
		"organ_system": "Immune & Defense",
		"clinical_function": "Cellular army of the immune system responsible for fighting infections, clearing debris, and mounting inflammatory responses.",
		"high_implications": "Suggests acute bacterial or viral infection, tissue injury, systemic inflammation, severe physical stress, or steroid medication.",
		"low_implications": "Leukopenia can result from viral infections, autoimmune destruction, bone marrow suppression, or specific medications.",
		"related_markers": ["Neutrophils", "Lymphocytes", "ESR", "C-Reactive Protein (CRP)"],
		"consultation_questions": [
			"Does this white blood cell count point to an active infection or an inflammatory reaction?",
			"Should we repeat a differential count in 1 to 2 weeks to see if it normalizes?",
		],
	},
	"platelet": {
		"organ_system": "Hemostasis & Coagulation",
		"clinical_function": "Circulating cytoplasmic fragments that adhere to damaged vascular endothelium to initiate primary clot formation.",
		"high_implications": "Reactive thrombocytosis (due to infection, tissue trauma, iron deficiency) or myeloproliferative disorder.",
		"low_implications": "Thrombocytopenia increases risk of petechiae, spontaneous bruising, or bleeding; seen in viral illnesses, ITP, or splenic pooling.",
		"related_markers": ["Hemoglobin", "Prothrombin Time (PT/INR)", "WBC Count"],
		"consultation_questions": [
			"Are there any precautions I should take regarding bruising, dental procedures, or blood thinners?",
			"Is this platelet count temporary or does it require a peripheral blood smear examination?",
		],
	},
	"creatinine": {
		"organ_system": "Renal & Kidney Function",
		"clinical_function": "Waste product generated from muscle creatine breakdown; filtered almost exclusively by renal glomeruli without reabsorption.",
		"high_implications": "Signals decreased kidney filtration (acute kidney injury or chronic kidney disease), severe dehydration, or urinary obstruction.",
		"low_implications": "Associated with reduced muscle mass, advanced muscle wasting, or severe liver disease.",
		"related_markers": ["Urea (BUN)", "eGFR", "Potassium", "Urine Albumin/Creatinine Ratio"],
		"consultation_questions": [
			"What is my estimated glomerular filtration rate (eGFR) and does this indicate kidney strain?",
			"Should I adjust dosages of any current medications (like NSAIDs or BP drugs) to protect my kidneys?",
			"Is an ultrasound of the kidneys or a repeat urine test recommended?",
		],
	},
	"urea": {
		"organ_system": "Renal & Kidney Function",
		"clinical_function": "Primary nitrogenous waste product from protein catabolism; synthesized in the liver and eliminated by the kidneys.",
		"high_implications": "Seen in dehydration, high-protein intake, upper gastrointestinal bleeding, or impaired renal excretion.",
		"low_implications": "Can reflect low dietary protein, overhydration, or severe hepatic failure.",
		"related_markers": ["Creatinine", "BUN/Creatinine Ratio", "Electrolytes"],
		"consultation_questions": [
			"Is my elevated urea primarily caused by dehydration or is there intrinsic kidney involvement?",
			"What is my daily fluid intake recommendation?",
		],
	},
	"mcv": {
		"organ_system": "Hematology & Red Cell Indices",
		"clinical_function": "Mean Corpuscular Volume: quantifies average physical size of circulating red blood cells.",
		"high_implications": "Macrocytosis: classic sign of Vitamin B12 or Folate deficiency, thyroid disease, or excessive alcohol intake.",
		"low_implications": "Microcytosis: strongly points to Iron deficiency anemia, Thalassemia trait, or anemia of chronic disease.",
		"related_markers": ["Hemoglobin", "MCH", "MCHC", "Serum Ferritin"],
		"consultation_questions": [
			"Does my red cell size indicate iron deficiency or a B12/folate issue?",
			"Would iron studies or a hemoglobin electrophoresis be helpful?",
		],
	},
	"mchc": {
		"organ_system": "Hematology & Red Cell Indices",
		"clinical_function": "Mean Corpuscular Hemoglobin Concentration: concentration of hemoglobin in a given volume of packed red cells.",
		"high_implications": "Can indicate spherocytosis, severe hemoconcentration, or lab cold agglutinins.",
		"low_implications": "Hypochromia: red cells contain insufficient hemoglobin concentration, typically seen in iron deficiency.",
		"related_markers": ["Hemoglobin", "MCV", "MCH", "Hematocrit (PCV)"],
		"consultation_questions": [
			"How does my MCHC correlate with my overall hemoglobin and red cell count?",
		],
	},
	"sodium": {
		"organ_system": "Electrolytes & Fluid Balance",
		"clinical_function": "Dominant extracellular cation determining intravascular osmotic pressure, blood volume, and neuromuscular excitability.",
		"high_implications": "Hypernatremia: severe free water deficit, dehydration, excessive salt intake, or diabetes insipidus.",
		"low_implications": "Hyponatremia: fluid overload, diuretic therapy, heart failure, adrenal insufficiency, or syndrome of inappropriate ADH.",
		"related_markers": ["Potassium", "Creatinine", "Serum Osmolality"],
		"consultation_questions": [
			"Are any fluid restrictions or electrolyte replenishment needed for my sodium level?",
			"Could my blood pressure medication or water pill be impacting my sodium?",
		],
	},
	"potassium": {
		"organ_system": "Electrolytes & Cardiac Conduction",
		"clinical_function": "Dominant intracellular cation vital for maintaining cardiac electrical rhythm, vascular tone, and neuromuscular transmission.",
		"high_implications": "Hyperkalemia: dangerous cardiac arrhythmia risk; seen in renal impairment, ACE inhibitors, or potassium supplements.",
		"low_implications": "Hypokalemia: increases cardiac ectopy and causes muscle weakness; seen in diuretic loss, vomiting, or diarrhea.",
		"related_markers": ["Sodium", "Creatinine", "ECG Rhythm"],
		"consultation_questions": [
			"Does my potassium level pose any risk for heart rhythm disturbances?",
			"Do I need an immediate ECG or adjustment to my blood pressure medication?",
		],
	},
}


# =========================================================================
# CLINICAL INTELLIGENCE: MEDICATION & SUPPLEMENT INTERACTION DATABASE
# =========================================================================
MEDICATION_INTERACTIONS_DATA = [
	{
		"name": "Metformin",
		"category": "Antidiabetic Medication",
		"lab_targets": ["Glucose", "HbA1c", "Creatinine"],
		"clinical_alert": "Lowers blood glucose and HbA1c. Long-term use can reduce Vitamin B12 absorption. Requires kidney monitoring (dose adjustment indicated if Creatinine is elevated).",
		"actionable_advice": "Discuss periodic Vitamin B12 monitoring and verify kidney function with your physician.",
	},
	{
		"name": "Statins (Atorvastatin, Rosuvastatin)",
		"category": "Lipid-Lowering Agent",
		"lab_targets": ["Cholesterol", "LDL", "Triglycerides"],
		"clinical_alert": "Effectively lowers LDL and total cholesterol. Can rarely cause transient transaminase elevations or muscle enzyme (CPK) shifts.",
		"actionable_advice": "Report any unexplained muscle soreness and maintain periodic lipid and liver panel checks.",
	},
	{
		"name": "Biotin (Vitamin B7 / Hair & Nail)",
		"category": "Vitamin Supplement",
		"lab_targets": ["Thyroid (TSH)", "Cardiac Troponin", "Hormones"],
		"clinical_alert": "CRITICAL LAB INTERACTION: High-dose Biotin (>5 mg/day) falsely interferes with streptavidin immunoassays, causing artificially abnormal thyroid and troponin results.",
		"actionable_advice": "Stop high-dose Biotin supplements at least 48 hours before any diagnostic blood tests.",
	},
	{
		"name": "ACE Inhibitors / ARBs (Lisinopril, Losartan)",
		"category": "Blood Pressure Medication",
		"lab_targets": ["Potassium", "Creatinine", "Blood Pressure"],
		"clinical_alert": "Can cause Potassium retention (hyperkalemia risk) and a mild transient rise in serum Creatinine as renal hemodynamics stabilize.",
		"actionable_advice": "Monitor serum Potassium and Creatinine within 2 to 4 weeks of starting or increasing doses.",
	},
	{
		"name": "Diuretics (Hydrochlorothiazide, Furosemide)",
		"category": "Antihypertensive / Fluid Management",
		"lab_targets": ["Potassium", "Sodium", "Glucose"],
		"clinical_alert": "Promotes urinary excretion of Sodium and Potassium (hypokalemia risk). May mildly elevate fasting glucose and uric acid levels.",
		"actionable_advice": "Ensure adequate dietary potassium or electrolyte monitoring as advised by your doctor.",
	},
	{
		"name": "NSAIDs (Ibuprofen, Naproxen)",
		"category": "Anti-Inflammatory / Analgesic",
		"lab_targets": ["Creatinine", "Platelet Count", "Blood Pressure"],
		"clinical_alert": "Frequent use inhibits renal prostaglandins, which can decrease kidney filtration rate (raising Creatinine) and affect platelet aggregation.",
		"actionable_advice": "Limit frequent NSAID use if kidney markers or blood pressure are outside normal limits.",
	},
	{
		"name": "Iron Supplements (Ferrous Sulfate)",
		"category": "Mineral Supplement",
		"lab_targets": ["Hemoglobin", "Hematocrit (PCV)", "MCV"],
		"clinical_alert": "Stimulates erythropoiesis to restore Hemoglobin, Hematocrit, and Ferritin over a 4 to 8 week course.",
		"actionable_advice": "Take with Vitamin C (e.g. orange juice) to enhance absorption; avoid taking alongside calcium or tea/coffee.",
	},
	{
		"name": "Corticosteroids (Prednisone)",
		"category": "Immunosuppressive / Steroid",
		"lab_targets": ["Glucose", "WBC Count", "Neutrophils"],
		"clinical_alert": "Induces peripheral insulin resistance (elevating blood sugar) and causes WBC demargination (artificially high white blood cell count).",
		"actionable_advice": "Inform your doctor of steroid use when interpreting elevated blood glucose or white blood cell counts.",
	},
	{
		"name": "Levothyroxine",
		"category": "Thyroid Hormone Replacement",
		"lab_targets": ["TSH", "Free T4"],
		"clinical_alert": "Normalizes TSH and metabolic parameters. Absorption is blocked if taken alongside iron or calcium supplements.",
		"actionable_advice": "Take on an empty stomach with plain water 30 to 60 minutes before breakfast; separate from calcium/iron by 4 hours.",
	},
	{
		"name": "Vitamin D3 / Calcium",
		"category": "Bone & Mineral Supplement",
		"lab_targets": ["Calcium", "Vitamin D"],
		"clinical_alert": "Enhances intestinal calcium absorption and corrects hypovitaminosis D. Excessive doses require calcium monitoring.",
		"actionable_advice": "Periodic 25-OH Vitamin D monitoring ensures levels remain safely within the optimal 30–80 ng/mL corridor.",
	},
]


def build_doctor_consultation_questions(abnormal_values: List[Dict], risk_level: str, report_type: str) -> List[str]:
	"""Generates clinically tailored questions for the patient to ask their physician."""
	questions = []
	seen = set()

	def add_q(q: str):
		if q and q not in seen:
			questions.append(q)
			seen.add(q)

	# 1. High-priority overarching question based on risk level
	if risk_level == "High":
		add_q("Given that multiple markers are outside reference limits, what is the most urgent priority to address first?")
		add_q("Would you recommend any specialized diagnostic imaging or a specialist referral (e.g. Cardiologist, Nephrologist, Endocrinologist)?")
	elif risk_level == "Medium":
		add_q("Are these borderline/abnormal results best managed initially through lifestyle changes, or is medical therapy warranted?")

	# 2. Specific questions drawn from out-of-range biomarkers
	for row in abnormal_values:
		name = str(row.get("name", "")).lower()
		status = str(row.get("status", "")).lower()
		if status in {"high", "low", "abnormal"}:
			# Look up in clinical details
			canonical_key = None
			for k in BIOMARKER_CLINICAL_DETAILS:
				if k in name or name in k:
					canonical_key = k
					break
			if canonical_key:
				details = BIOMARKER_CLINICAL_DETAILS[canonical_key]
				for q in details.get("consultation_questions", []):
					add_q(q)

	# 3. Re-test interval question
	add_q("What is the exact re-testing timeline you recommend to evaluate whether these values are moving toward normal?")

	# 4. Medication & supplement cross-check question
	add_q("Could any of my current daily prescriptions, over-the-counter painkillers, or vitamins be influencing these specific lab values?")

	return questions[:7]


def screen_medication_interactions(medications: List[str], abnormal_values: List[Dict]) -> List[Dict]:
	"""Screens patient medications against known lab interactions and the current abnormal findings."""
	results = []
	if not medications:
		return results

	med_lower = [m.strip().lower() for m in medications if m.strip()]
	abnormal_names = [str(r.get("name", "")).lower() for r in abnormal_values if str(r.get("status", "")).lower() in {"high", "low", "abnormal"}]

	for item in MEDICATION_INTERACTIONS_DATA:
		item_name_lower = item["name"].lower()
		# Check if patient reported this medication
		matched = any(m in item_name_lower or item_name_lower in m for m in med_lower)
		if matched:
			# Check which of the patient's lab markers are relevant
			relevant_markers = []
			for target in item["lab_targets"]:
				if any(target.lower() in an for an in abnormal_names):
					relevant_markers.append(target)

			results.append({
				"medication": item["name"],
				"category": item["category"],
				"clinical_alert": item["clinical_alert"],
				"actionable_advice": item["actionable_advice"],
				"relevant_patient_markers": relevant_markers if relevant_markers else item["lab_targets"][:2],
				"has_active_abnormality": len(relevant_markers) > 0,
			})

	return results

