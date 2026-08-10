# Medical Report Intelligence and Simplification System

An AI-powered web application that helps users understand medical reports in plain language.

## 🚀 Features

- **Upload Reports**: PDF, image, and TXT uploads with extraction support.
- **Report Type Detection First**: Classifies report as Blood Test, Diabetes, Lipid Profile, General Health, or Unknown.
- **Simple Explanation**: FLAN-T5 rewrites medical text in beginner-friendly language.
- **Beginner Mode**: "Explain like I am 10" option for very simple explanations.
- **Smart Summary**: Key findings and concise patient-friendly summary.
- **Risk Level**: Low / Medium / High based on abnormal values and report alerts.
- **Abnormal Value Detection**: Extracts values, compares to ranges, and marks status.
- **Strict Medical Filtering**: Ignores name, age, metadata, and non-medical sentences.
- **Suggestions**: Safe general lifestyle suggestions (non-prescription).
- **Report Comparison**: Compare previous vs current report values.
- **Charts**: Bar charts for value comparisons using Recharts.

## 🛠️ Installation

### Prerequisites
- Python 3.8+
- Node.js & npm
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) (Install and add to PATH for image support)

If OCR uploads fail with "tesseract is not installed or it's not in your PATH":

```bash
# Windows (winget)
winget install --id UB-Mannheim.TesseractOCR -e

# Or Windows (choco)
choco install tesseract
```

Then restart terminal. If PATH still does not resolve it, set backend environment variable:

```bash
# backend/.env or system environment
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
```

### 1. Backend Setup (Flask + FLAN-T5)
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
# source venv/bin/activate

pip install -r requirements.txt
python app.py
```
Note: First analyze request downloads FLAN-T5 model weights from Hugging Face.

### 2. Frontend Setup (React)
```bash
cd frontend
npm install
npm start
```

If you see `Failed to load resource: net::ERR_CONNECTION_REFUSED`, the backend is not reachable from the frontend. Make sure backend is running on port 5000 in another terminal:

```bash
cd backend
python app.py
```

If your backend runs on a different host or port, set an API URL before starting frontend:

```bash
# frontend/.env
REACT_APP_API_BASE_URL=http://127.0.0.1:5000
```

Frontend runs on the next free port (for example 3002 if 3000 is busy).

## 🔌 Backend APIs

### GET /
Health message and endpoint list.

### GET /health
Simple server health response.

### POST /upload
Upload one or more files.

Form data keys:
- `file` for single file
- `files` for multiple files

Single upload response:
```json
{
	"report_id": "uuid",
	"filename": "report.pdf",
	"extracted_text": "..."
}
```

Multi upload response:
```json
{
	"reports": [
		{
			"report_id": "uuid",
			"filename": "report1.pdf",
			"extracted_text": "..."
		}
	]
}
```

### POST /analyze
Analyze by `report_id` or raw `text`.

Request:
```json
{
	"report_id": "uuid",
	"explain_like_10": true
}
```

Response:
```json
{
	"report_type": "Diabetes Report",
	"one_line_summary": "Your blood sugar is higher than normal.",
	"summary": "...",
	"simple_explanation": "...",
	"why_it_matters": "...",
	"risk_level": "Low",
	"parameters": [
		{
			"name": "Blood Sugar",
			"value": 180,
			"your_value": 180,
			"unit": "mg/dL",
			"normal_range": "70-140 mg/dL",
			"status": "High",
			"result_line": "Your blood sugar is high.",
			"explanation": "Blood Sugar is higher than normal..."
		}
	],
	"key_issues": ["Blood Sugar"],
	"suggestions": ["Reduce added sugar intake", "Walk 30 minutes daily"],
	"alerts": ["elevated blood sugar"]
}
```

### POST /compare
Compare two reports by ID or raw text.

Request:
```json
{
	"previous_report_id": "uuid-1",
	"current_report_id": "uuid-2"
}
```

## 🧪 Quick Test

1. Start backend and frontend.
2. Upload `backend/sample_report.txt` from UI.
3. Click Analyze.
4. View summary, explanation, risk level, table, and charts.
5. Upload second report and use Compare Reports section.

## 🧠 AI Logic
- Uses `google/flan-t5-base` via `AutoTokenizer` + `AutoModelForSeq2SeqLM`.
- Prompt engineering is used for report-type classification, summary, simplification, why-it-matters, and suggestions.
- Parsing layer extracts value lines and compares against dynamic normal ranges loaded from `backend/medical_ranges.json`.

## ⚠️ Disclaimer
This tool is for **educational and informational purposes only**. It is not a medical device and should not replace professional medical advice. Always consult with a qualified healthcare provider.
