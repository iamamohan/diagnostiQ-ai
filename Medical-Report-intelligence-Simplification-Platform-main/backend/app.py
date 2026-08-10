import os
import uuid
import io
import shutil
import fitz  # PyMuPDF
import pytesseract
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
try:
    from deep_translator import GoogleTranslator
except Exception:
    GoogleTranslator = None
from utils import (
    extract_lab_values,
    detect_keyword_alerts,
    compute_risk_level,
    compare_report_values,
    normalize_report_type,
    detect_report_type_by_keywords,
    load_medical_ranges,
    parameter_explanation,
)

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

simplify_model_name = "google/flan-t5-base"

simplify_tokenizer = None
simplify_model = None
REPORT_STORE = {}
RANGES_DATA = load_medical_ranges(os.path.join(os.path.dirname(__file__), "medical_ranges.json"))

LANGUAGE_LABELS = {
    "en": "English",
    "hi": "Hindi",
    "ta": "Tamil",
}

GOOGLE_LANG_CODES = {
    "en": "en",
    "hi": "hi",
    "ta": "ta",
}

TESSERACT_READY = False
TESSERACT_PATH = None


def configure_tesseract():
    """Locate tesseract executable from env, PATH, or common install locations."""
    global TESSERACT_READY, TESSERACT_PATH

    candidates = []
    env_cmd = os.getenv("TESSERACT_CMD", "").strip()
    if env_cmd:
        candidates.append(env_cmd)

    path_cmd = shutil.which("tesseract")
    if path_cmd:
        candidates.append(path_cmd)

    if os.name == "nt":
        candidates.extend(
            [
                r"C:\Program Files\Tesseract-OCR\tesseract.exe",
                r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
                os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
            ]
        )

    for cmd in candidates:
        if cmd and os.path.exists(cmd):
            pytesseract.pytesseract.tesseract_cmd = cmd
            TESSERACT_READY = True
            TESSERACT_PATH = cmd
            return

    TESSERACT_READY = False
    TESSERACT_PATH = None


def ensure_tesseract_available():
    if TESSERACT_READY:
        return

    raise RuntimeError(
        "Tesseract is not installed or not in PATH. "
        "Install Tesseract OCR and add it to PATH, or set TESSERACT_CMD to the full executable path."
    )


configure_tesseract()


def ensure_models_loaded():
    global simplify_tokenizer, simplify_model

    if simplify_tokenizer is None or simplify_model is None:
        simplify_tokenizer = AutoTokenizer.from_pretrained(simplify_model_name)
        simplify_model = AutoModelForSeq2SeqLM.from_pretrained(simplify_model_name)


def extract_text_from_pdf(pdf_path):
    text = ""
    with fitz.open(pdf_path) as doc:
        for page in doc:
            page_text = page.get_text("text") or ""

            # OCR fallback for scanned/image-only PDFs or low-text pages.
            if len(page_text.strip()) < 30:
                ensure_tesseract_available()
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                page_text = pytesseract.image_to_string(img)

            text += page_text + "\n"
    return text


def extract_text_from_image(image_path):
    ensure_tesseract_available()
    return pytesseract.image_to_string(Image.open(image_path))


def generate_seq2seq(text, tokenizer, model, max_input_tokens=1024, max_new_tokens=180):
    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=max_input_tokens,
    )
    outputs = model.generate(
        **inputs,
        max_new_tokens=max_new_tokens,
        num_beams=4,
        early_stopping=True,
        do_sample=False,
    )
    return tokenizer.decode(outputs[0], skip_special_tokens=True)


def normalize_extracted_text(text):
    if not text:
        return ""

    # Make OCR/table text parser-friendly:
    # 1) insert spaces between letters and numbers (HbA1c5.5 -> HbA1c 5.5)
    normalized = text
    normalized = normalized.replace("\u00a0", " ")
    normalized = normalized.replace("|", " ")
    normalized = normalized.replace("\t", " ")
    normalized = normalized.replace("mg/dL", " mg/dL ")
    normalized = normalized.replace("g/dL", " g/dL ")
    normalized = normalized.replace("mmHg", " mmHg ")
    normalized = normalized.replace("%", " % ")

    import re

    normalized = re.sub(r"([A-Za-z])([0-9])", r"\1 \2", normalized)
    normalized = re.sub(r"([0-9])([A-Za-z])", r"\1 \2", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    normalized = re.sub(r"\s*\n\s*", "\n", normalized)

    return normalized.strip()


def coerce_text_input(value):
    """Normalize request text fields to safe strings for processing."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)):
        return "\n".join(str(item) for item in value if item is not None)
    if isinstance(value, dict):
        # Some clients may send text in wrapped payloads.
        for key in ("text", "content", "value", "report_text"):
            if key in value and value[key] is not None:
                return str(value[key])
        return ""
    return str(value)


def ask_flan(prompt, max_input_tokens=1024, max_new_tokens=220):
    return generate_seq2seq(
        prompt,
        simplify_tokenizer,
        simplify_model,
        max_input_tokens=max_input_tokens,
        max_new_tokens=max_new_tokens,
    )


def normalize_language(lang):
    if not lang:
        return "en"
    value = str(lang).strip().lower()
    if value in LANGUAGE_LABELS:
        return value
    if value in {"english"}:
        return "en"
    if value in {"hindi", "hindhi"}:
        return "hi"
    if value in {"tamil", "tamizh"}:
        return "ta"
    return "en"


def translate_text(text, lang):
    if not text or lang == "en":
        return text

    # Primary translation path: deep-translator (Google) for reliable multilingual output.
    if GoogleTranslator is not None:
        try:
            target = GOOGLE_LANG_CODES.get(lang, "en")
            # GoogleTranslator handles moderate-length text well; keep chunk size safe.
            chunks = []
            raw = text.strip()
            while len(raw) > 4500:
                split_at = raw.rfind("\n", 0, 4500)
                if split_at <= 0:
                    split_at = raw.rfind(" ", 0, 4500)
                if split_at <= 0:
                    split_at = 4500
                chunks.append(raw[:split_at])
                raw = raw[split_at:].lstrip()
            if raw:
                chunks.append(raw)

            translated_chunks = []
            for c in chunks:
                translated_chunks.append(
                    GoogleTranslator(source="en", target=target).translate(c)
                )
            translated = "\n".join(translated_chunks).strip()
            if translated:
                return translated
        except Exception:
            pass

    # Fallback translation path: FLAN prompt-based translation.
    try:
        ensure_models_loaded()
        target_lang = LANGUAGE_LABELS.get(lang, "English")
        prompt = (
            f"Translate the following healthcare guidance text to {target_lang}. "
            "Keep meaning exact and simple for patients. Return only translated text.\n\n"
            f"Text:\n{text[:1500]}"
        )
        return ask_flan(prompt, max_input_tokens=1024, max_new_tokens=300)
    except Exception:
        return text


def localize_analysis_payload(response_data, lang):
    if lang == "en":
        response_data["language"] = "en"
        response_data["translation_engine"] = "none"
        return response_data

    response_data["one_line_summary"] = translate_text(response_data.get("one_line_summary", ""), lang)
    response_data["summary"] = translate_text(response_data.get("summary", ""), lang)
    response_data["simple_explanation"] = translate_text(response_data.get("simple_explanation", ""), lang)
    response_data["why_it_matters"] = translate_text(response_data.get("why_it_matters", ""), lang)

    suggestions = response_data.get("suggestions", [])
    response_data["suggestions"] = [translate_text(item, lang) for item in suggestions]

    rows = response_data.get("parameters", [])
    for row in rows:
        row["result_line"] = translate_text(row.get("result_line", ""), lang)
        row["explanation"] = translate_text(row.get("explanation", ""), lang)

    response_data["abnormal_values"] = rows
    response_data["language"] = lang
    response_data["translation_engine"] = "google" if GoogleTranslator is not None else "flan-fallback"
    return response_data


def detect_report_type(text):
    # Fast deterministic classifier to keep analysis responsive and stable.
    keyword_type = detect_report_type_by_keywords(text)

    # Optional FLAN refinement. If model is unavailable, keep deterministic result.
    if os.getenv("USE_FLAN_REPORT_TYPE", "0") != "1":
        return keyword_type

    try:
        ensure_models_loaded()
    except Exception:
        return keyword_type

    prompt = (
        "Identify the type of this medical report from the list: "
        "Blood Test Report, Diabetes Report, Lipid Profile, General Health Report. "
        "Return only one label.\n\n"
        f"Report Text:\n{text[:1200]}"
    )
    try:
        raw = ask_flan(prompt, max_input_tokens=768, max_new_tokens=24)
        return normalize_report_type(raw)
    except Exception:
        return keyword_type


def build_one_line_summary(report_type, risk_level, parameter_rows):
    abnormal = [row for row in parameter_rows if str(row.get("status", "")).lower() in {"high", "low", "abnormal"}]
    if not abnormal:
        return f"This looks like a {report_type.lower()} and your key values are mostly in the normal range."
    lead = abnormal[0]["name"]
    return f"This appears to be a {report_type.lower()}, and {lead} is outside the normal range."


def build_summary(report_type, risk_level, parameter_rows):
    if not parameter_rows:
        return (
            f"Report type detected: {report_type}. "
            "No valid medical parameters were confidently extracted from the report text."
        )

    abnormal = [r for r in parameter_rows if str(r.get("status", "")).lower() in {"high", "low", "abnormal"}]
    normal = [r for r in parameter_rows if str(r.get("status", "")).lower() == "normal"]

    lines = [f"Report type: {report_type}."]
    lines.append(f"Risk level: {risk_level}.")
    lines.append(f"Parameters analyzed: {len(parameter_rows)}.")
    if abnormal:
        lines.append("Abnormal parameters: " + ", ".join(r["name"] for r in abnormal[:5]) + ".")
    else:
        lines.append("All extracted parameters are within normal range.")
    if normal:
        lines.append("Normal parameters: " + ", ".join(r["name"] for r in normal[:5]) + ".")
    return "\n".join(lines)


def build_simple_explanation(parameter_rows, explain_like_10=False):
    if not parameter_rows:
        return "I could not find clear lab values in this report. Please upload a clearer report image or text."

    abnormal = [r for r in parameter_rows if str(r.get("status", "")).lower() in {"high", "low", "abnormal"}]
    if not abnormal:
        if explain_like_10:
            return "Good news. Your main test values are in the healthy range. Keep doing your healthy routine."
        return "Your extracted test values are within the normal range, which is a positive sign."

    parts = []
    for row in abnormal[:4]:
        name = row["name"]
        status = str(row["status"]).lower()
        if status == "high":
            parts.append(f"{name} is higher than normal")
        elif status == "low":
            parts.append(f"{name} is lower than normal")
        else:
            parts.append(f"{name} needs attention")

    if explain_like_10:
        return " and ".join(parts) + ". This means your body needs some extra care and follow-up."
    return "; ".join(parts) + ". These findings should be discussed with your doctor for guidance."


def build_why_it_matters(parameter_rows, risk_level):
    abnormal = [r for r in parameter_rows if str(r.get("status", "")).lower() in {"high", "low", "abnormal"}]
    if not abnormal:
        return "Keeping values in the normal range helps reduce long-term risk and supports overall health."

    if risk_level == "High":
        return "Multiple values are outside the healthy range. If this continues, it can increase long-term heart, kidney, or metabolic risk."
    if risk_level == "Medium":
        return "Some values are outside normal range. Early lifestyle correction can prevent progression."
    return "A few mild changes are present. Monitoring and healthy habits can help keep things stable."


def build_suggestions(parameter_rows, risk_level):
    abnormal = [
        row
        for row in parameter_rows
        if str(row.get("status", "")).lower() in {"high", "low", "abnormal"}
    ]

    # If all values are normal, return maintenance-focused guidance.
    if not abnormal:
        return [
            "Continue your current food and activity routine because your values are in the normal range.",
            "Limit added sugar, deep-fried food, and highly processed snacks to keep glucose and cholesterol stable.",
            "Do at least 30 minutes of walking or light exercise most days.",
            "Repeat key tests on schedule to make sure values remain normal.",
            "Keep regular follow-up with your doctor for preventive monitoring.",
        ]

    suggestions = []
    seen_topics = set()

    for row in abnormal:
        name = str(row.get("name", "")).lower()
        status = str(row.get("status", "")).lower()

        if any(k in name for k in ["glucose", "sugar", "hba1c"]):
            if "diabetes" not in seen_topics:
                suggestions.append(
                    "For high sugar markers, reduce sweets, sugary drinks, and refined carbs, and prefer high-fiber meals."
                )
                suggestions.append(
                    "Add 30 to 45 minutes of daily walking after meals to improve blood sugar control."
                )
                seen_topics.add("diabetes")

        if any(k in name for k in ["cholesterol", "ldl", "triglycerides"]):
            if "lipid" not in seen_topics:
                suggestions.append(
                    "For lipid control, reduce fried/processed foods and include more vegetables, oats, nuts, and seeds."
                )
                suggestions.append(
                    "Use heart-healthy fats in small amounts and avoid repeated reheated oils."
                )
                seen_topics.add("lipid")

        if "hdl" in name:
            if "hdl" not in seen_topics:
                suggestions.append(
                    "To improve HDL, do regular aerobic exercise and include healthy fats such as nuts and seeds."
                )
                seen_topics.add("hdl")

        if any(k in name for k in ["hemoglobin", "hb"]):
            if status == "low" and "hemoglobin" not in seen_topics:
                suggestions.append(
                    "For low hemoglobin, include iron-rich foods (greens, lentils, beans, dates) with vitamin C sources for better absorption."
                )
                suggestions.append(
                    "Avoid tea/coffee immediately after iron-rich meals to improve iron absorption."
                )
                seen_topics.add("hemoglobin")

        if "blood pressure" in name:
            if "bp" not in seen_topics:
                suggestions.append(
                    "For blood pressure control, reduce salt intake, sleep regularly, and manage stress with light daily activity."
                )
                seen_topics.add("bp")

    # Safe defaults if no specific condition mapping was triggered.
    if not suggestions:
        suggestions.extend(
            [
                "Follow a balanced diet with less sugar, salt, and deep-fried foods.",
                "Do regular physical activity such as brisk walking most days.",
            ]
        )

    suggestions.append("Repeat relevant lab tests in 6 to 12 weeks to track movement toward normal range.")

    if risk_level in {"Medium", "High"}:
        suggestions.append("Consult your doctor soon to review these abnormal findings and your improvement plan.")
    else:
        suggestions.append("Continue your healthy routine and periodic checkups to maintain normal values.")

    # Return concise, de-duplicated list.
    unique = []
    seen = set()
    for item in suggestions:
        if item not in seen:
            unique.append(item)
            seen.add(item)
    return unique[:7]


def extract_text_for_file(file_path, ext):
    if ext == "pdf":
        return extract_text_from_pdf(file_path)
    if ext in ["jpg", "jpeg", "png", "bmp"]:
        return extract_text_from_image(file_path)
    if ext == "txt":
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    raise ValueError("Unsupported file type. Use PDF, image, or TXT.")


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "message": "Medical Report Intelligence API is running.",
        "endpoints": {
            "upload": "/upload",
            "analyze": "/analyze",
            "compare": "/compare",
            "health": "/health",
        },
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok",
            "translator_available": GoogleTranslator is not None,
            "tesseract_available": TESSERACT_READY,
            "tesseract_path": TESSERACT_PATH,
            "supported_languages": ["en", "hi", "ta"],
        }
    )


@app.route("/upload", methods=["POST"])
def upload_file():
    files = request.files.getlist("files")
    if not files:
        single = request.files.get("file")
        if single:
            files = [single]

    if not files:
        return jsonify({"error": "No file uploaded. Use 'file' or 'files'."}), 400

    uploaded_reports = []
    for file in files:
        if not file or file.filename == "":
            continue

        file_path = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(file_path)
        ext = file.filename.split(".")[-1].lower()

        try:
            extracted_text = extract_text_for_file(file_path, ext)
            extracted_text = normalize_extracted_text(extracted_text)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            return jsonify({"error": str(e)}), 500

        if not extracted_text.strip():
            return jsonify({"error": f"No text could be extracted from {file.filename}."}), 400

        report_id = str(uuid.uuid4())
        REPORT_STORE[report_id] = {
            "filename": file.filename,
            "text": extracted_text,
        }

        uploaded_reports.append(
            {
                "report_id": report_id,
                "filename": file.filename,
                "extracted_text": extracted_text,
            }
        )

    if not uploaded_reports:
        return jsonify({"error": "No valid files were provided."}), 400

    if len(uploaded_reports) == 1:
        item = uploaded_reports[0]
        return jsonify(item)

    return jsonify({"reports": uploaded_reports})


@app.route("/analyze", methods=["POST"])
def analyze_text():
    data = request.get_json() or {}
    text = coerce_text_input(data.get("text", ""))
    report_id = data.get("report_id")
    explain_like_10 = bool(data.get("explain_like_10", False))
    language = normalize_language(data.get("language", "en"))

    if report_id and not text:
        stored = REPORT_STORE.get(report_id)
        if not stored:
            return jsonify({"error": "Invalid report_id."}), 404
        text = stored["text"]

    if not text.strip():
        return jsonify({"error": "No text provided"}), 400

    try:
        report_type = detect_report_type(text)
        abnormal_values = extract_lab_values(text, report_type, RANGES_DATA)
        keyword_alerts = detect_keyword_alerts(text)
        risk_level = compute_risk_level(abnormal_values, keyword_alerts)

        summary = build_summary(report_type, risk_level, abnormal_values)
        one_line_summary = build_one_line_summary(report_type, risk_level, abnormal_values)
        simple_explanation = build_simple_explanation(abnormal_values, explain_like_10=explain_like_10)
        why_it_matters = build_why_it_matters(abnormal_values, risk_level)
        suggestions = build_suggestions(abnormal_values, risk_level)

        parameter_rows = []
        for row in abnormal_values:
            line = parameter_explanation(
                row["name"],
                row["status"],
                row["your_value"],
                row["normal_range"],
            )
            parameter_rows.append(
                {
                    "name": row["name"],
                    "value": row["your_value"],
                    "your_value": row["your_value"],
                    "normal_range": row["normal_range"],
                    "status": row["status"],
                    "unit": row.get("unit", ""),
                    "result_line": line,
                    "explanation": line,
                }
            )

        key_issues = [
            row["name"] for row in parameter_rows if str(row.get("status", "")).lower() in {"high", "low", "abnormal"}
        ]

        payload = {
            "report_type": report_type,
            "one_line_summary": one_line_summary,
            "summary": summary,
            "simple_explanation": simple_explanation,
            "why_it_matters": why_it_matters,
            "risk_level": risk_level,
            "parameters": parameter_rows,
            "abnormal_values": parameter_rows,
            "key_issues": key_issues,
            "suggestions": suggestions,
            "alerts": keyword_alerts,
        }
        payload = localize_analysis_payload(payload, language)
        return jsonify(payload)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/compare", methods=["POST"])
def compare_reports():
    data = request.get_json() or {}

    previous_text = coerce_text_input(data.get("previous_text", ""))
    current_text = coerce_text_input(data.get("current_text", ""))

    previous_id = data.get("previous_report_id")
    current_id = data.get("current_report_id")

    if previous_id and not previous_text:
        previous = REPORT_STORE.get(previous_id)
        if not previous:
            return jsonify({"error": "Invalid previous_report_id."}), 404
        previous_text = previous["text"]

    if current_id and not current_text:
        current = REPORT_STORE.get(current_id)
        if not current:
            return jsonify({"error": "Invalid current_report_id."}), 404
        current_text = current["text"]

    if not previous_text.strip() or not current_text.strip():
        return jsonify({"error": "Provide previous and current report text or report IDs."}), 400

    previous_type = detect_report_type(previous_text)
    current_type = detect_report_type(current_text)

    previous_values = extract_lab_values(previous_text, previous_type, RANGES_DATA)
    current_values = extract_lab_values(current_text, current_type, RANGES_DATA)
    comparison = compare_report_values(previous_values, current_values)

    return jsonify(
        {
            "previous_report_type": previous_type,
            "current_report_type": current_type,
            "previous_values": previous_values,
            "current_values": current_values,
            "comparison": comparison,
        }
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000, use_reloader=False)
