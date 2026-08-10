import React, { useMemo, useRef, useState } from 'react';
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

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:5000';

function parseNormalHigh(rangeText) {
  if (!rangeText || rangeText === 'Not available') return null;
  const lt = rangeText.match(/<\s*(\d+(?:\.\d+)?)/);
  if (lt) return Number(lt[1]);
  const m = rangeText.match(/(\d+(?:\.\d+)?)\s*[-]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return Number(m[2]);
}

function App() {
  const [files, setFiles] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [previousReportId, setPreviousReportId] = useState('');
  const [currentReportId, setCurrentReportId] = useState('');

  const [analysis, setAnalysis] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [manualText, setManualText] = useState('');
  const [explainLike10, setExplainLike10] = useState(false);
  const [language, setLanguage] = useState('en');

  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState('');
  const dashboardRef = useRef(null);

  const selectedReport = reports.find((r) => r.report_id === selectedReportId);

  const chartData = useMemo(() => {
    if (!analysis?.abnormal_values) return [];
    return analysis.abnormal_values
      .filter((v) => typeof v.your_value === 'number')
      .map((v) => ({
        name: v.name.length > 14 ? `${v.name.slice(0, 14)}...` : v.name,
        yourValue: v.your_value,
        normalUpper: parseNormalHigh(v.normal_range),
      }));
  }, [analysis]);

  const compareChartData = useMemo(() => {
    if (!comparison?.comparison) return [];
    return comparison.comparison.map((row) => ({
      name: row.name.length > 14 ? `${row.name.slice(0, 14)}...` : row.name,
      previous: row.previous_value,
      current: row.current_value,
      normalUpper: parseNormalHigh(row.normal_range),
    }));
  }, [comparison]);

  const statusClass = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'high' || s === 'low' || s === 'abnormal') return 'text-red-700 bg-red-50';
    if (s === 'normal') return 'text-green-700 bg-green-50';
    return 'text-slate-700 bg-slate-50';
  };

  const handleUpload = async () => {
    if (!files.length) {
      setError('Please choose at least one file.');
      return;
    }

    setLoadingUpload(true);
    setError('');

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    try {
      const res = await axios.post(`${API_BASE_URL}/upload`, formData);

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
        if (!selectedReportId && merged.length) {
          setSelectedReportId(merged[0].report_id);
          setPreviousReportId(merged[0].report_id);
          setCurrentReportId(merged[0].report_id);
        }
        return merged;
      });

      setFiles([]);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed.');
    } finally {
      setLoadingUpload(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedReportId && !manualText.trim()) {
      setError('Select a report or paste report text to analyze.');
      return;
    }

    setLoadingAnalyze(true);
    setError('');
    setAnalysis(null);

    try {
      const payload = selectedReportId
        ? { report_id: selectedReportId, explain_like_10: explainLike10, language }
        : { text: manualText, explain_like_10: explainLike10, language };

      const res = await axios.post(`${API_BASE_URL}/analyze`, payload);
      setAnalysis(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Analysis failed.');
    } finally {
      setLoadingAnalyze(false);
    }
  };

  const handleAnalyzeText = async () => {
    if (!manualText.trim()) {
      setError('Please paste report/test text before analyzing.');
      return;
    }

    setLoadingAnalyze(true);
    setError('');
    setAnalysis(null);

    try {
      const res = await axios.post(`${API_BASE_URL}/analyze`, {
        text: manualText,
        explain_like_10: explainLike10,
        language,
      });
      setAnalysis(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Text analysis failed.');
    } finally {
      setLoadingAnalyze(false);
    }
  };

  const handleCompare = async () => {
    if (!previousReportId || !currentReportId) {
      setError('Select previous and current reports for comparison.');
      return;
    }
    if (previousReportId === currentReportId) {
      setError('Choose two different reports to compare.');
      return;
    }

    setLoadingCompare(true);
    setError('');
    setComparison(null);

    try {
      const res = await axios.post(`${API_BASE_URL}/compare`, {
        previous_report_id: previousReportId,
        current_report_id: currentReportId,
      });
      setComparison(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Comparison failed.');
    } finally {
      setLoadingCompare(false);
    }
  };

  const speakSummary = () => {
    if (!analysis?.summary || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(analysis.summary);
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const handleExportPdf = async () => {
    if (!analysis && !comparison) {
      setError('Run analysis first, then export the dashboard as PDF.');
      return;
    }
    if (!dashboardRef.current) return;

    try {
      setExportingPdf(true);
      setError('');

      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f1f5f9',
        windowWidth: dashboardRef.current.scrollWidth,
        windowHeight: dashboardRef.current.scrollHeight,
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

      const filename = `medical-analysis-${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(filename);
    } catch (e) {
      setError('Unable to export PDF right now. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div ref={dashboardRef} className="mx-auto max-w-7xl p-4 md:p-8">
        <header className="mb-8 rounded-2xl bg-gradient-to-r from-cyan-700 via-sky-700 to-blue-800 p-6 text-white shadow-xl">
          <h1 className="text-2xl font-bold md:text-4xl">Medical Report Intelligence and Simplification System</h1>
          <p className="mt-2 text-cyan-100">
            Upload reports, understand findings in simple language, view abnormal values, and compare progress.
          </p>
        </header>

        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}

        <section className="mb-6 grid gap-4 rounded-2xl bg-white p-5 shadow-md md:grid-cols-2">
          <div>
            <h2 className="mb-2 text-lg font-semibold">1) Upload Report Files</h2>
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.bmp,.txt"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              className="w-full rounded-lg border border-slate-300 p-2"
            />
            <button
              onClick={handleUpload}
              disabled={loadingUpload || files.length === 0}
              className="mt-3 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:bg-slate-400"
            >
              {loadingUpload ? 'Uploading...' : 'Upload and Extract'}
            </button>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">2) Select Report to Analyze</h2>
            <select
              value={selectedReportId}
              onChange={(e) => setSelectedReportId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2"
            >
              <option value="">Choose uploaded report</option>
              {reports.map((r) => (
                <option key={r.report_id} value={r.report_id}>
                  {r.filename} ({r.report_id.slice(0, 8)})
                </option>
              ))}
            </select>

            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={explainLike10}
                onChange={(e) => setExplainLike10(e.target.checked)}
              />
              Explain Like I am 10 Years Old
            </label>

            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium">Output Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2"
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="ta">Tamil</option>
              </select>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={loadingAnalyze}
              className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:bg-slate-400"
            >
              {loadingAnalyze ? 'Analyzing...' : 'Analyze Report'}
            </button>
          </div>
        </section>

        <section className="mb-6 rounded-2xl bg-white p-5 shadow-md">
          <h2 className="mb-2 text-lg font-semibold">Optional: Paste Report Text</h2>
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-slate-300 p-3"
            placeholder="Paste report text if you do not want to upload a file..."
          />
          <button
            onClick={handleAnalyzeText}
            disabled={loadingAnalyze || !manualText.trim()}
            className="mt-3 rounded-lg bg-purple-700 px-4 py-2 font-semibold text-white disabled:bg-slate-400"
          >
            {loadingAnalyze ? 'Analyzing...' : 'Analyze Pasted Text'}
          </button>
        </section>

        {analysis && (
          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-white p-5 shadow-md md:col-span-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">Smart Health Summary</h3>
                <button onClick={speakSummary} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
                  Speak Summary
                </button>
              </div>
              <div className="mt-3 inline-block rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
                Report Type: {analysis.report_type || 'Unknown'}
              </div>
              <p className="mt-3 text-lg font-semibold text-slate-800">{analysis.one_line_summary}</p>
              <p className="mt-3 whitespace-pre-wrap text-slate-700">{analysis.summary}</p>
              <div className="mt-3 inline-block rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700">
                Risk Level: {analysis.risk_level}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm md:col-span-2">
              <h3 className="text-xl font-bold text-amber-800">Key Issues</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-amber-900">
                {(analysis.key_issues || []).length ? (
                  analysis.key_issues.map((issue, idx) => <li key={`${issue}-${idx}`}>{issue}</li>)
                ) : (
                  <li>No major abnormal parameters were detected.</li>
                )}
              </ul>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-md">
              <h3 className="text-xl font-bold">Simple Explanation</h3>
              <p className="mt-3 whitespace-pre-wrap text-slate-700">{analysis.simple_explanation}</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-md">
              <h3 className="text-xl font-bold">Why It Matters</h3>
              <p className="mt-3 whitespace-pre-wrap text-slate-700">{analysis.why_it_matters}</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-md md:col-span-2">
              <h3 className="text-xl font-bold">Suggestions</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-700">
                {(analysis.suggestions || []).map((s, idx) => (
                  <li key={`${s}-${idx}`}>{s}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm md:col-span-2">
              <h3 className="text-xl font-bold text-red-700">Alerts</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-red-800">
                {(analysis.alerts || []).map((a, idx) => (
                  <li key={`${a}-${idx}`}>{a}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-md md:col-span-2">
              <h3 className="mb-3 text-xl font-bold">Normal vs Your Values</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="p-2">Test</th>
                      <th className="p-2">Your Value</th>
                      <th className="p-2">Normal Range</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Explanation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analysis.abnormal_values || []).map((row, idx) => (
                      <tr key={`${row.name}-${idx}`} className="border-b">
                        <td className="p-2">{row.name}</td>
                        <td className="p-2">
                          {row.your_value} {row.unit || ''}
                        </td>
                        <td className="p-2">{row.normal_range}</td>
                        <td className="p-2">
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="p-2 text-slate-600">{row.explanation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-md md:col-span-2">
              <h3 className="mb-3 text-xl font-bold">Bar Chart: Your Values vs Normal Upper Range</h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="yourValue" fill="#dc2626" name="Your Value" />
                    <Bar dataKey="normalUpper" fill="#16a34a" name="Normal Upper" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-white p-5 shadow-md">
          <h2 className="mb-3 text-lg font-semibold">Compare Reports</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={previousReportId}
              onChange={(e) => setPreviousReportId(e.target.value)}
              className="rounded-lg border border-slate-300 p-2"
            >
              <option value="">Select previous report</option>
              {reports.map((r) => (
                <option key={r.report_id} value={r.report_id}>
                  {r.filename}
                </option>
              ))}
            </select>

            <select
              value={currentReportId}
              onChange={(e) => setCurrentReportId(e.target.value)}
              className="rounded-lg border border-slate-300 p-2"
            >
              <option value="">Select current report</option>
              {reports.map((r) => (
                <option key={r.report_id} value={r.report_id}>
                  {r.filename}
                </option>
              ))}
            </select>

            <button
              onClick={handleCompare}
              disabled={loadingCompare}
              className="rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white disabled:bg-slate-400"
            >
              {loadingCompare ? 'Comparing...' : 'Compare Reports'}
            </button>
          </div>

          {comparison && (
            <div className="mt-5">
              <div className="mb-3 flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                  Previous Type: {comparison.previous_report_type || 'Unknown'}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                  Current Type: {comparison.current_report_type || 'Unknown'}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="p-2">Test</th>
                      <th className="p-2">Normal Range</th>
                      <th className="p-2">Previous</th>
                      <th className="p-2">Prev Status</th>
                      <th className="p-2">Current</th>
                      <th className="p-2">Current Status</th>
                      <th className="p-2">Difference</th>
                      <th className="p-2">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.comparison.map((row, idx) => (
                      <tr key={`${row.name}-${idx}`} className="border-b">
                        <td className="p-2">{row.name}</td>
                        <td className="p-2">{row.normal_range || '-'}</td>
                        <td className="p-2">{row.previous_value}</td>
                        <td className="p-2">
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(row.previous_status)}`}>
                            {row.previous_status}
                          </span>
                        </td>
                        <td className="p-2">{row.current_value}</td>
                        <td className="p-2">
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(row.current_status)}`}>
                            {row.current_status}
                          </span>
                        </td>
                        <td className="p-2">{row.difference}</td>
                        <td className="p-2">{row.trend}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={compareChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="previous" fill="#0ea5e9" name="Previous" />
                    <Bar dataKey="current" fill="#6366f1" name="Current" />
                    <Bar dataKey="normalUpper" fill="#16a34a" name="Normal Upper" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>

        {selectedReport && (
          <section className="mt-6 rounded-2xl bg-white p-5 shadow-md">
            <h3 className="text-lg font-semibold">Extracted Report Text</h3>
            <div className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              {selectedReport.extracted_text}
            </div>
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-white p-5 shadow-md">
          <h3 className="text-lg font-semibold">Export Full Analysis</h3>
          <p className="mt-2 text-sm text-slate-600">
            Download the complete dashboard view including summary, values, charts, and comparison as PDF.
          </p>
          <button
            onClick={handleExportPdf}
            disabled={exportingPdf || (!analysis && !comparison)}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:bg-slate-400"
          >
            {exportingPdf ? 'Exporting PDF...' : 'Export Analysis as PDF'}
          </button>
        </section>
      </div>
    </div>
  );
}

export default App;
