import os
import io
import fitz  # PyMuPDF
from datetime import datetime

# Font auto-discovery for high-fidelity Unicode & Indic rendering
def get_pdf_font_file():
    candidates = [
        r"C:\Windows\Fonts\Nirmala.ttc",
        r"C:\Windows\Fonts\latha.ttf",
        r"C:\Windows\Fonts\mangal.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeui.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None

FONT_PATH = get_pdf_font_file()


def setup_page_fonts(page):
    """Registers Unicode font on page if font file is available, returns whether font is ready."""
    if FONT_PATH and os.path.exists(FONT_PATH):
        try:
            page.insert_font(fontname="indicfont", fontfile=FONT_PATH)
            return True
        except Exception:
            return False
    return False


def pick_font(text, has_indic):
    """Returns 'indicfont' if text contains non-ASCII codepoints, otherwise standard 'helv'."""
    if not text:
        return "helv"
    if has_indic and any(ord(c) > 255 for c in str(text)):
        return "indicfont"
    return "helv"


def draw_header_banner(page, doc_title, subtitle="CLINICAL INTELLIGENCE & REPORT SIMPLIFICATION", has_indic=False):
    # Top banner background
    page.draw_rect(fitz.Rect(0, 0, 595.3, 56), color=None, fill=(0.06, 0.15, 0.28))
    
    # Brand logo / name
    page.insert_text(fitz.Point(36, 26), "DIAGNOSTIQ AI", fontname="helv", fontsize=13, color=(0.3, 0.85, 0.75))
    page.insert_text(fitz.Point(36, 42), subtitle, fontname="helv", fontsize=8, color=(0.7, 0.8, 0.9))
    
    # Document title
    title_font = pick_font(doc_title, has_indic)
    page.insert_text(fitz.Point(300, 32), doc_title, fontname=title_font, fontsize=11, color=(1.0, 1.0, 1.0))
    # Generation date
    today_str = datetime.now().strftime("%d %b %Y, %H:%M")
    page.insert_text(fitz.Point(300, 44), f"Generated: {today_str}", fontname="helv", fontsize=8, color=(0.7, 0.8, 0.9))


def draw_footer(page, page_num, total_pages, doc_ref):
    # Footer border line
    page.draw_line(fitz.Point(36, 805), fitz.Point(559.3, 805), color=(0.85, 0.88, 0.92), width=0.8)
    
    disclaimer_short = "DiagnostiQ AI educational summary. Not a formal diagnostic prescription. Consult a licensed physician."
    page.insert_text(fitz.Point(36, 818), disclaimer_short, fontname="helv", fontsize=7, color=(0.45, 0.52, 0.6))
    
    ref_text = f"Ref: {str(doc_ref)[:12]} | Page {page_num} of {total_pages}"
    page.insert_text(fitz.Point(440, 818), ref_text, fontname="helv", fontsize=7.5, color=(0.3, 0.35, 0.45))


def generate_medical_report_pdf(analysis, patient_info=None, language="en"):
    """
    Generates a professional multi-page laboratory-grade diagnostic analysis report.
    Returns bytes of the compiled PDF.
    """
    doc = fitz.open()
    doc_ref = analysis.get("report_id") or str(datetime.now().strftime("%Y%m%d%H%M%S"))
    patient = patient_info or {}
    
    report_type = analysis.get("report_type", "Comprehensive Diagnostic Health Report")
    risk_level = analysis.get("risk_level", "Low")
    one_line = analysis.get("one_line_summary", "")
    summary = analysis.get("summary", "")
    simple_exp = analysis.get("simple_explanation", "")
    why_it_matters = analysis.get("why_it_matters", "")
    parameters = analysis.get("parameters", [])
    suggestions = analysis.get("suggestions", [])
    organ_systems = analysis.get("organ_systems", {})
    
    # Calculate counts
    abnormal_count = sum(1 for p in parameters if str(p.get("status", "")).lower() in {"high", "low", "abnormal"})
    normal_count = sum(1 for p in parameters if str(p.get("status", "")).lower() == "normal")
    total_params = len(parameters)

    # --- PAGE 1: Overview, Patient Card, Summary, and Start of Biomarker Table ---
    page = doc.new_page(width=595.3, height=841.9)
    has_indic = setup_page_fonts(page)
    draw_header_banner(page, "PATIENT DIAGNOSTIC ANALYSIS REPORT", has_indic=has_indic)

    y = 70
    # 1. Patient & Document Information Card
    page.draw_rect(fitz.Rect(36, y, 559.3, y + 62), color=(0.85, 0.88, 0.92), fill=(0.97, 0.98, 0.99), width=0.8)
    
    # Row 1
    p_name = patient.get("name") or "Patient Evaluation"
    p_age = f"{patient.get('age')} Y" if patient.get("age") else "Not Specified"
    p_sex = patient.get("gender") or "Not Specified"
    page.insert_text(fitz.Point(46, y + 18), "PATIENT:", fontname="helv", fontsize=8, color=(0.4, 0.45, 0.55))
    page.insert_text(fitz.Point(95, y + 18), str(p_name)[:28], fontname=pick_font(p_name, has_indic), fontsize=9.5, color=(0.1, 0.15, 0.25))

    page.insert_text(fitz.Point(235, y + 18), "AGE / SEX:", fontname="helv", fontsize=8, color=(0.4, 0.45, 0.55))
    page.insert_text(fitz.Point(295, y + 18), f"{p_age} / {p_sex}", fontname="helv", fontsize=9, color=(0.1, 0.15, 0.25))

    page.insert_text(fitz.Point(400, y + 18), "DATE:", fontname="helv", fontsize=8, color=(0.4, 0.45, 0.55))
    page.insert_text(fitz.Point(440, y + 18), datetime.now().strftime("%Y-%m-%d"), fontname="helv", fontsize=9, color=(0.1, 0.15, 0.25))

    # Row 2
    page.insert_text(fitz.Point(46, y + 44), "REPORT PANEL:", fontname="helv", fontsize=8, color=(0.4, 0.45, 0.55))
    page.insert_text(fitz.Point(125, y + 44), report_type, fontname=pick_font(report_type, has_indic), fontsize=9.5, color=(0.08, 0.45, 0.4))

    page.insert_text(fitz.Point(235, y + 44), "EVALUATED:", fontname="helv", fontsize=8, color=(0.4, 0.45, 0.55))
    page.insert_text(fitz.Point(300, y + 44), f"{total_params} Biomarkers ({normal_count} Normal, {abnormal_count} Flagged)", fontname="helv", fontsize=8.5, color=(0.1, 0.15, 0.25))

    # Risk badge in patient card
    risk_colors = {
        "high": ((0.98, 0.9, 0.9), (0.75, 0.15, 0.15)),
        "medium": ((1.0, 0.95, 0.85), (0.75, 0.45, 0.05)),
        "low": ((0.9, 0.97, 0.92), (0.1, 0.55, 0.25)),
    }
    bg_c, text_c = risk_colors.get(str(risk_level).lower(), risk_colors["low"])
    page.draw_rect(fitz.Rect(460, y + 30, 545, y + 52), color=None, fill=bg_c)
    page.insert_text(fitz.Point(472, y + 45), f"RISK: {risk_level.upper()}", fontname="helv", fontsize=8.5, color=text_c)

    y += 74

    # 2. Executive Summary & Plain Language Insights
    page.draw_rect(fitz.Rect(36, y, 559.3, y + 20), color=None, fill=(0.92, 0.95, 0.98))
    page.insert_text(fitz.Point(44, y + 14), "EXECUTIVE SUMMARY & CLINICAL IMPRESSION", fontname="helv", fontsize=9, color=(0.1, 0.2, 0.35))
    y += 26

    if one_line:
        page.insert_textbox(fitz.Rect(44, y, 550, y + 26), f"• Key Finding: {one_line}", fontname=pick_font(one_line, has_indic), fontsize=9, color=(0.1, 0.15, 0.2))
        y += 28

    if simple_exp:
        page.insert_textbox(fitz.Rect(44, y, 550, y + 34), f"• Plain-Language Explanation: {simple_exp}", fontname=pick_font(simple_exp, has_indic), fontsize=8.5, color=(0.2, 0.25, 0.3))
        y += 36

    if why_it_matters:
        page.insert_textbox(fitz.Rect(44, y, 550, y + 28), f"• Clinical Significance: {why_it_matters}", fontname=pick_font(why_it_matters, has_indic), fontsize=8.5, color=(0.25, 0.3, 0.35))
        y += 32

    y += 8

    # 3. Biomarker Results Table
    def draw_table_header(p_page, cur_y):
        p_page.draw_rect(fitz.Rect(36, cur_y, 559.3, cur_y + 20), color=None, fill=(0.1, 0.2, 0.32))
        p_page.insert_text(fitz.Point(44, cur_y + 14), "BIOMARKER NAME", fontname="helv", fontsize=8, color=(1, 1, 1))
        p_page.insert_text(fitz.Point(170, cur_y + 14), "YOUR RESULT", fontname="helv", fontsize=8, color=(1, 1, 1))
        p_page.insert_text(fitz.Point(245, cur_y + 14), "STANDARD REFERENCE", fontname="helv", fontsize=8, color=(1, 1, 1))
        p_page.insert_text(fitz.Point(365, cur_y + 14), "STATUS", fontname="helv", fontsize=8, color=(1, 1, 1))
        p_page.insert_text(fitz.Point(430, cur_y + 14), "CLINICAL EVALUATION", fontname="helv", fontsize=8, color=(1, 1, 1))
        return cur_y + 20

    y = draw_table_header(page, y)

    # Render table rows with automatic page break handling
    current_page = page
    current_page_idx = 1

    for i, row in enumerate(parameters):
        # Check if row fits on current page (leave 80px for footer)
        row_height = 24
        if y + row_height > 780:
            current_page = doc.new_page(width=595.3, height=841.9)
            current_page_idx += 1
            has_indic_next = setup_page_fonts(current_page)
            draw_header_banner(current_page, "PATIENT DIAGNOSTIC ANALYSIS (CONTINUED)", has_indic=has_indic_next)
            y = 70
            y = draw_table_header(current_page, y)

        # Alternating background
        row_bg = (0.98, 0.99, 1.0) if i % 2 == 0 else (1.0, 1.0, 1.0)
        current_page.draw_rect(fitz.Rect(36, y, 559.3, y + row_height), color=(0.9, 0.92, 0.95), fill=row_bg, width=0.5)

        # Name
        b_name = str(row.get("name", "Unknown"))
        current_page.insert_text(fitz.Point(44, y + 15), b_name[:24], fontname=pick_font(b_name, has_indic), fontsize=8.5, color=(0.1, 0.15, 0.25))

        # Result + Unit
        val = str(row.get("your_value", row.get("value", "")))
        unit = str(row.get("unit", ""))
        current_page.insert_text(fitz.Point(170, y + 15), f"{val} {unit}".strip(), fontname="helv", fontsize=8.5, color=(0.1, 0.15, 0.2))

        # Range
        n_range = str(row.get("normal_range", "N/A"))
        current_page.insert_text(fitz.Point(245, y + 15), n_range[:22], fontname="helv", fontsize=8, color=(0.35, 0.4, 0.45))

        # Status Badge
        st = str(row.get("status", "Normal")).capitalize()
        st_colors = {
            "High": ((0.98, 0.88, 0.88), (0.75, 0.15, 0.15)),
            "Low": ((0.88, 0.94, 0.99), (0.1, 0.45, 0.75)),
            "Normal": ((0.9, 0.97, 0.92), (0.1, 0.55, 0.25)),
        }
        s_bg, s_fg = st_colors.get(st, st_colors["Normal"])
        current_page.draw_rect(fitz.Rect(362, y + 4, 412, y + 19), color=None, fill=s_bg)
        current_page.insert_text(fitz.Point(368, y + 15), st, fontname="helv", fontsize=8, color=s_fg)

        # Clinical Note / Line
        exp = str(row.get("result_line", row.get("explanation", "")))
        if not exp:
            exp = f"{b_name} in {st.lower()} range"
        current_page.insert_text(fitz.Point(430, y + 15), exp[:32] + ("..." if len(exp) > 32 else ""), fontname=pick_font(exp, has_indic), fontsize=7.5, color=(0.3, 0.35, 0.4))

        y += row_height

    y += 18

    # Check if Organ Systems & Recommendations fit on current page or need a fresh page
    if y > 600:
        current_page = doc.new_page(width=595.3, height=841.9)
        current_page_idx += 1
        has_indic_next = setup_page_fonts(current_page)
        draw_header_banner(current_page, "PHYSIOLOGICAL SYSTEMS & CLINICAL RECOMMENDATIONS", has_indic=has_indic_next)
        y = 70

    # 4. Organ Systems Impact Summary
    if organ_systems:
        current_page.draw_rect(fitz.Rect(36, y, 559.3, y + 18), color=None, fill=(0.92, 0.95, 0.98))
        current_page.insert_text(fitz.Point(44, y + 13), "ORGAN SYSTEMS PHYSIOLOGICAL OVERVIEW", fontname="helv", fontsize=8.5, color=(0.1, 0.2, 0.35))
        y += 24

        sys_items = list(organ_systems.items())[:4]
        box_w = (559.3 - 36 - 15) / 2
        for idx, (s_name, s_data) in enumerate(sys_items):
            col = idx % 2
            row_idx = idx // 2
            bx = 36 + col * (box_w + 15)
            by = y + row_idx * 34
            current_page.draw_rect(fitz.Rect(bx, by, bx + box_w, by + 28), color=(0.88, 0.9, 0.93), fill=(0.97, 0.98, 0.99), width=0.5)
            ab = s_data.get("abnormal", 0)
            tot = s_data.get("total", 0)
            badge_c = (0.75, 0.15, 0.15) if ab > 0 else (0.1, 0.55, 0.25)
            current_page.insert_text(fitz.Point(bx + 8, by + 13), s_name[:24], fontname=pick_font(s_name, has_indic), fontsize=8, color=(0.15, 0.2, 0.3))
            current_page.insert_text(fitz.Point(bx + 8, by + 24), f"{tot} Tested | {ab} Requiring Review", fontname="helv", fontsize=7.5, color=badge_c)

        y += (len(sys_items) + 1) // 2 * 34 + 10

    # 5. Safe Health & Lifestyle Guidance
    if suggestions:
        current_page.draw_rect(fitz.Rect(36, y, 559.3, y + 18), color=None, fill=(0.92, 0.95, 0.98))
        current_page.insert_text(fitz.Point(44, y + 13), "HEALTHCARE DISCUSSION & LIFESTYLE GUIDELINES", fontname="helv", fontsize=8.5, color=(0.1, 0.2, 0.35))
        y += 24

        for sug in suggestions[:5]:
            if y > 750:
                current_page = doc.new_page(width=595.3, height=841.9)
                current_page_idx += 1
                has_indic_next = setup_page_fonts(current_page)
                draw_header_banner(current_page, "RECOMMENDATIONS & CLINICAL DISCLAIMER", has_indic=has_indic_next)
                y = 70
            current_page.insert_text(fitz.Point(44, y + 11), f"• {sug}", fontname=pick_font(sug, has_indic), fontsize=8, color=(0.2, 0.25, 0.3))
            y += 18

        y += 8

    # 6. Formal Medical Disclaimer
    if y > 710:
        current_page = doc.new_page(width=595.3, height=841.9)
        current_page_idx += 1
        has_indic_next = setup_page_fonts(current_page)
        draw_header_banner(current_page, "CLINICAL SAFETY & REGULATORY DISCLAIMER", has_indic=has_indic_next)
        y = 70

    current_page.draw_rect(fitz.Rect(36, y, 559.3, y + 44), color=(0.85, 0.75, 0.4), fill=(1.0, 0.98, 0.92), width=0.8)
    current_page.insert_text(fitz.Point(46, y + 14), "IMPORTANT MEDICAL DISCLAIMER", fontname="helv", fontsize=8, color=(0.6, 0.35, 0.05))
    disclaimer_full = (
        "This document is an automated clinical interpretation provided for educational and informational preparation only. "
        "It does not constitute a formal diagnosis, medical advice, or prescription treatment plan. "
        "Always review these laboratory results with a licensed physician or certified healthcare specialist before taking any medical action."
    )
    current_page.insert_textbox(fitz.Rect(46, y + 18, 550, y + 42), disclaimer_full, fontname="helv", fontsize=7.5, color=(0.35, 0.25, 0.1))

    # Apply footers with correct total page count to all pages
    total_pages = len(doc)
    for p_idx, p in enumerate(doc):
        draw_footer(p, p_idx + 1, total_pages, doc_ref)

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def generate_consultation_prep_pdf(analysis, patient_info=None, questions=None, checked_questions=None, patient_notes="", language="en"):
    """
    Generates a dedicated, compact Doctor Consultation Preparation Sheet.
    Includes abnormal findings summary, customized physician discussion agenda,
    interactive checkboxes, user notes, and clinical visit checklist.
    """
    doc = fitz.open()
    doc_ref = analysis.get("report_id") or str(datetime.now().strftime("%Y%m%d%H%M%S"))
    patient = patient_info or {}
    checked_map = checked_questions or {}

    page = doc.new_page(width=595.3, height=841.9)
    has_indic = setup_page_fonts(page)
    draw_header_banner(page, "DOCTOR CONSULTATION PREPARATION SHEET", "PATIENT APPOINTMENT AGENDA & CHECKLIST", has_indic=has_indic)

    y = 70
    # 1. Patient & Appointment Meta Card
    page.draw_rect(fitz.Rect(36, y, 559.3, y + 54), color=(0.85, 0.88, 0.92), fill=(0.97, 0.98, 0.99), width=0.8)
    
    p_name = patient.get("name") or "Patient Consultation Agenda"
    report_type = analysis.get("report_type", "Routine Diagnostic Evaluation")
    risk_level = analysis.get("risk_level", "Low")
    
    page.insert_text(fitz.Point(46, y + 18), "PATIENT:", fontname="helv", fontsize=8, color=(0.4, 0.45, 0.55))
    page.insert_text(fitz.Point(95, y + 18), str(p_name)[:28], fontname=pick_font(p_name, has_indic), fontsize=9.5, color=(0.1, 0.15, 0.25))

    page.insert_text(fitz.Point(320, y + 18), "VISIT DATE:", fontname="helv", fontsize=8, color=(0.4, 0.45, 0.55))
    page.insert_text(fitz.Point(380, y + 18), datetime.now().strftime("%d %B %Y"), fontname="helv", fontsize=9, color=(0.1, 0.15, 0.25))

    page.insert_text(fitz.Point(46, y + 38), "LAB PANEL:", fontname="helv", fontsize=8, color=(0.4, 0.45, 0.55))
    page.insert_text(fitz.Point(115, y + 38), report_type, fontname=pick_font(report_type, has_indic), fontsize=9, color=(0.08, 0.45, 0.4))

    page.insert_text(fitz.Point(320, y + 38), "CLINICAL RISK:", fontname="helv", fontsize=8, color=(0.4, 0.45, 0.55))
    page.insert_text(fitz.Point(400, y + 38), risk_level.upper(), fontname="helv", fontsize=9, color=(0.75, 0.15, 0.15) if risk_level.lower() == "high" else (0.1, 0.55, 0.25))

    y += 66

    # 2. Reason for Discussion (Abnormal Biomarkers Summary)
    parameters = analysis.get("parameters", [])
    abnormal = [p for p in parameters if str(p.get("status", "")).lower() in {"high", "low", "abnormal"}]

    page.draw_rect(fitz.Rect(36, y, 559.3, y + 20), color=None, fill=(0.92, 0.95, 0.98))
    page.insert_text(fitz.Point(44, y + 14), "PRIMARY CLINICAL CONCERNS TO DISCUSS WITH PHYSICIAN", fontname="helv", fontsize=8.5, color=(0.1, 0.2, 0.35))
    y += 26

    if abnormal:
        ab_lines = []
        for p in abnormal[:5]:
            ab_lines.append(f"• {p['name']}: {p['your_value']} {p.get('unit', '')} (Ref: {p.get('normal_range', 'N/A')}) — Flagged {str(p.get('status')).upper()}")
        for line in ab_lines:
            page.insert_text(fitz.Point(46, y + 12), line, fontname=pick_font(line, has_indic), fontsize=8.5, color=(0.65, 0.1, 0.1))
            y += 18
    else:
        page.insert_text(fitz.Point(46, y + 12), "• All tested biomarkers fall within standard physiological reference corridors. Routine check-up advised.", fontname="helv", fontsize=8.5, color=(0.1, 0.55, 0.25))
        y += 18

    y += 10

    # 3. Prioritized Doctor Consultation Questions
    q_list = questions or analysis.get("doctor_questions", [])
    if not q_list:
        q_list = [
            "What specific factors could explain my out-of-range lab readings?",
            "Are there prescription or supplement adjustments recommended at this time?",
            "When should I repeat these diagnostic tests to verify if values are normalizing?",
            "Are there targeted dietary, physical exercise, or hydration protocols I should adopt?",
        ]

    page.draw_rect(fitz.Rect(36, y, 559.3, y + 20), color=None, fill=(0.1, 0.2, 0.32))
    page.insert_text(fitz.Point(44, y + 14), "PRIORITY DISCUSSION QUESTIONS (CHECK OFF DURING VISIT)", fontname="helv", fontsize=8.5, color=(1, 1, 1))
    y += 28

    for idx, q_text in enumerate(q_list[:7]):
        # Draw checkbox
        is_chk = bool(checked_map.get(f"base_{idx}") or checked_map.get(f"custom_{idx}") or checked_map.get(str(idx)))
        box_rect = fitz.Rect(46, y + 2, 58, y + 14)
        page.draw_rect(box_rect, color=(0.2, 0.4, 0.6), fill=(0.85, 0.95, 0.88) if is_chk else (1, 1, 1), width=1)
        if is_chk:
            page.insert_text(fitz.Point(48.5, y + 11.5), "X", fontname="helv", fontsize=8, color=(0.1, 0.55, 0.25))

        # Question text
        q_font = pick_font(q_text, has_indic)
        page.insert_textbox(fitz.Rect(66, y, 550, y + 24), q_text, fontname=q_font, fontsize=8.5, color=(0.15, 0.2, 0.25))
        y += 24

    y += 8

    # 4. Medication & Supplement Discussion
    med_alerts = analysis.get("medication_alerts", [])
    page.draw_rect(fitz.Rect(36, y, 559.3, y + 18), color=None, fill=(0.92, 0.95, 0.98))
    page.insert_text(fitz.Point(44, y + 13), "MEDICATION & PHARMACOLOGICAL MONITORING", fontname="helv", fontsize=8.5, color=(0.1, 0.2, 0.35))
    y += 24

    if med_alerts:
        for alert in med_alerts[:3]:
            page.insert_text(fitz.Point(46, y + 11), f"⚠ {alert}", fontname=pick_font(alert, has_indic), fontsize=8, color=(0.7, 0.35, 0.05))
            y += 16
    else:
        page.insert_text(fitz.Point(46, y + 11), "• No critical prescription or drug interaction alerts detected for current markers.", fontname="helv", fontsize=8, color=(0.2, 0.55, 0.3))
        y += 16

    y += 10

    # 5. Personal Patient Notes
    page.draw_rect(fitz.Rect(36, y, 559.3, y + 18), color=None, fill=(0.92, 0.95, 0.98))
    page.insert_text(fitz.Point(44, y + 13), "PATIENT'S PERSONAL NOTES & SYMPTOMS TO REPORT", fontname="helv", fontsize=8.5, color=(0.1, 0.2, 0.35))
    y += 24

    notes_text = patient_notes.strip() if patient_notes else "No specific patient notes recorded. Space reserved for physician instructions and dosage notes."
    page.draw_rect(fitz.Rect(36, y, 559.3, y + 44), color=(0.88, 0.9, 0.93), fill=(0.99, 0.99, 1.0), width=0.6)
    page.insert_textbox(fitz.Rect(44, y + 6, 550, y + 38), notes_text, fontname=pick_font(notes_text, has_indic), fontsize=8, color=(0.2, 0.25, 0.35))
    y += 52

    # 6. Appointment Organization Checklist
    page.draw_rect(fitz.Rect(36, y, 559.3, y + 18), color=None, fill=(0.92, 0.95, 0.98))
    page.insert_text(fitz.Point(44, y + 13), "POST-CONSULTATION CLINICAL CHECKLIST", fontname="helv", fontsize=8.5, color=(0.1, 0.2, 0.35))
    y += 24

    checklist_items = [
        "Lab results and historical records presented to doctor",
        "Key abnormal readings and potential causes discussed",
        "Medication changes, renewals, or new prescriptions recorded",
        "Date and panel requirements for next follow-up lab test established",
    ]

    for item in checklist_items:
        page.draw_rect(fitz.Rect(46, y + 2, 56, y + 12), color=(0.4, 0.45, 0.55), fill=(1, 1, 1), width=0.8)
        page.insert_text(fitz.Point(64, y + 10), item, fontname="helv", fontsize=8, color=(0.15, 0.2, 0.25))
        y += 16

    y += 10
    # Safety notice
    page.insert_text(fitz.Point(36, 792), "Notice: This prep sheet is an organizational aid for clinical discussions and does not replace professional medical judgment.", fontname="helv", fontsize=7.5, color=(0.5, 0.55, 0.6))

    draw_footer(page, 1, 1, doc_ref)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes
