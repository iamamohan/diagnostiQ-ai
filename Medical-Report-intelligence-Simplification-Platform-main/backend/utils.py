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
	r"(?P<unit>[A-Za-z/%]+)?"
	r"(?:\s*(?:\(|\[)?\s*(?P<low>\d+(?:\.\d+)?)\s*[-to]{1,3}\s*(?P<high>\d+(?:\.\d+)?)\s*(?P<range_unit>[A-Za-z/%]+)?\s*(?:\)|\])?)?",
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
	"wbc": ["wbc", "white blood cell", "white blood cells"],
	"rbc": ["rbc", "red blood cell", "red blood cells"],
	"platelet": ["platelet", "platelets"],
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
	"wbc": "WBC",
	"rbc": "RBC",
	"platelet": "Platelet",
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
	for canonical, aliases in VALID_PARAMETER_ALIASES.items():
		for alias in sorted(aliases, key=len, reverse=True):
			a = normalize_test_name(alias)
			if n == a:
				return canonical
			if re.search(rf"\b{re.escape(a)}\b", n):
				return canonical
			if a in n and len(a) >= 5:
				return canonical
		if canonical in n:
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


def detect_keyword_alerts(text: str) -> List[str]:
	alerts = []
	for line in text.splitlines():
		lline = line.lower()
		if any(word in lline for word in KEYWORDS):
			cleaned = line.strip()
			if cleaned:
				alerts.append(cleaned)
	return alerts[:10]


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

	if score >= 8:
		return "High"
	if score >= 3:
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
