import React, { useState, useEffect, useRef } from 'react';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const BACKEND_URL =
  window.BACKEND_URL !== undefined ? window.BACKEND_URL : 'http://localhost:8002';

const STEPS = [
  { id: 1, name: 'Problem Framing' },
  { id: 2, name: 'Dataset Definition' },
  { id: 3, name: 'Processing' },
  { id: 4, name: 'Model Planning' },
  { id: 5, name: 'Engine Execution' },
];

// ─────────────────────────────────────────────
// UTILITY: destroy chart safely
// ─────────────────────────────────────────────
function destroyChart(id) {
  if (window.Chart) {
    const existing = window.Chart.getChart(id);
    if (existing) existing.destroy();
  }
}

// ─────────────────────────────────────────────
// UTILITY: compute numeric columns
// ─────────────────────────────────────────────
function getNumericCols(columns, rows) {
  return columns.filter((col) =>
    rows.slice(0, 20).every((r) => !isNaN(parseFloat(r[col])))
  );
}

// ─────────────────────────────────────────────
// STEP SIDEBAR
// ─────────────────────────────────────────────
function StepSidebar({ currentStep, completedSteps }) {
  return (
    <div className="wizard-sidebar">
      {STEPS.map((step, idx) => {
        const isCompleted = completedSteps.includes(step.id);
        const isActive = currentStep === step.id;
        return (
          <div key={step.id} className="sidebar-step">
            <div className="step-connector-wrap">
              <div
                className={`step-circle ${
                  isCompleted
                    ? 'step-circle--completed'
                    : isActive
                    ? 'step-circle--active'
                    : 'step-circle--pending'
                }`}
              >
                {isCompleted ? '✓' : step.id}
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={`step-line ${
                    isCompleted ? 'step-line--completed' : ''
                  }`}
                />
              )}
            </div>
            <span
              className={`step-label ${isActive ? 'step-label--active' : ''}`}
            >
              {step.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// STEP 1 — PROBLEM FRAMING
// ─────────────────────────────────────────────
function Step1({ state, onChange }) {
  const { problemType, systemName, inputDescription, primaryOutcome } = state;

  const types = [
    {
      id: 'classification',
      label: 'Classification',
      desc: 'Predict discrete categories',
    },
    {
      id: 'regression',
      label: 'Regression',
      desc: 'Predict continuous values',
    },
    {
      id: 'clustering',
      label: 'Clustering',
      desc: 'Group similar data points',
    },
  ];

  return (
    <div className="step-content">
      <h2 className="section-title">01 PROBLEM FRAMING</h2>

      <div className="form-group">
        <label className="form-label">SELECT PROBLEM TYPE</label>
        <div className="radio-card-group">
          {types.map((t) => (
            <div
              key={t.id}
              className={`radio-card ${
                problemType === t.id ? 'radio-card--selected' : ''
              }`}
              onClick={() => onChange('problemType', t.id)}
            >
              <div className="radio-card-label">{t.label}</div>
              <div className="radio-card-desc">{t.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">SYSTEM NAME</label>
        <input
          className="form-input"
          type="text"
          placeholder="e.g. Customer Churn Predictor"
          value={systemName}
          onChange={(e) => onChange('systemName', e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">INPUT DATA DESCRIPTION</label>
        <textarea
          className="form-textarea"
          rows={4}
          placeholder="Describe your input data, source, and context..."
          value={inputDescription}
          onChange={(e) => onChange('inputDescription', e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">PRIMARY OUTCOME</label>
        <input
          className="form-input"
          type="text"
          placeholder="e.g. Predict whether a customer will churn"
          value={primaryOutcome}
          onChange={(e) => onChange('primaryOutcome', e.target.value)}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// STEP 2 — DATASET DEFINITION
// ─────────────────────────────────────────────
function Step2({ state, onChange, onDatasetLoaded, isLoading, error }) {
  const {
    datasetName,
    requiredFeatures,
    targetColumn,
    jumlahData,
    datasetSource,
    csvFile,
    problemType,
  } = state;

  return (
    <div className="step-content">
      <h2 className="section-title">02 DATASET DEFINITION</h2>

      <div className="form-group">
        <label className="form-label">DATASET NAME</label>
        <input
          className="form-input"
          type="text"
          placeholder="e.g. customer_transactions"
          value={datasetName}
          onChange={(e) => onChange('datasetName', e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">REQUIRED FEATURES</label>
        <input
          className="form-input"
          type="text"
          placeholder="Comma-separated column names, e.g. age, income, tenure"
          value={requiredFeatures}
          onChange={(e) => onChange('requiredFeatures', e.target.value)}
        />
      </div>

      {problemType !== 'clustering' && (
        <div className="form-group">
          <label className="form-label">TARGET COLUMN</label>
          <input
            className="form-input"
            type="text"
            placeholder="e.g. churn"
            value={targetColumn}
            onChange={(e) => onChange('targetColumn', e.target.value)}
          />
        </div>
      )}

      <div className="form-group">
        <label className="form-label">JUMLAH DATA</label>
        <input
          className="form-input"
          type="number"
          min={100}
          max={100000}
          value={jumlahData}
          onChange={(e) => onChange('jumlahData', Number(e.target.value))}
        />
      </div>

      <div className="form-group">
        <label className="form-label">DATASET SOURCE</label>
        <div className="radio-card-group">
          <div
            className={`radio-card ${
              datasetSource === 'api' ? 'radio-card--selected' : ''
            }`}
            onClick={() => onChange('datasetSource', 'api')}
          >
            <div className="radio-card-label">REQUEST FROM API</div>
            <div className="radio-card-desc">
              Synthetically generate dataset based on your schema
            </div>
          </div>
          <div
            className={`radio-card ${
              datasetSource === 'manual' ? 'radio-card--selected' : ''
            }`}
            onClick={() => onChange('datasetSource', 'manual')}
          >
            <div className="radio-card-label">MANUAL UPLOAD</div>
            <div className="radio-card-desc">Upload your own CSV file</div>
          </div>
        </div>
      </div>

      {datasetSource === 'manual' && (
        <div className="form-group">
          <label className="form-label">UPLOAD CSV FILE</label>
          <input
            className="form-input"
            type="file"
            accept=".csv"
            onChange={(e) => onChange('csvFile', e.target.files[0] || null)}
          />
          {csvFile && (
            <p className="form-hint">Selected: {csvFile.name}</p>
          )}
        </div>
      )}

      {isLoading && (
        <div className="loading-row">
          <span className="spinner" />
          <span>Loading dataset...</span>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────
// DATA PREVIEW TABLE
// ─────────────────────────────────────────────
function DataTable({ columns, head, tail, label }) {
  return (
    <div className="data-table-wrap">
      {label && <div className="table-label">{label}</div>}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {head.map((row, i) => (
              <tr key={`h-${i}`}>
                {columns.map((col) => (
                  <td key={col}>{String(row[col] ?? '')}</td>
                ))}
              </tr>
            ))}
            {tail && tail.length > 0 && (
              <>
                <tr className="table-divider-row">
                  <td colSpan={columns.length}>... TAIL ...</td>
                </tr>
                {tail.map((row, i) => (
                  <tr key={`t-${i}`}>
                    {columns.map((col) => (
                      <td key={col}>{String(row[col] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SCATTER CHART
// ─────────────────────────────────────────────
function ScatterPlot({ processedRows, columns }) {
  const numericCols = getNumericCols(columns, processedRows);
  const [xCol, setXCol] = useState(numericCols[0] || '');
  const [yCol, setYCol] = useState(numericCols[1] || numericCols[0] || '');

  useEffect(() => {
    if (!xCol || !yCol || !processedRows.length) return;
    destroyChart('scatterChart');
    const points = processedRows
      .map((r) => ({ x: parseFloat(r[xCol]), y: parseFloat(r[yCol]) }))
      .filter((p) => !isNaN(p.x) && !isNaN(p.y));
    new window.Chart(document.getElementById('scatterChart'), {
      type: 'scatter',
      data: {
        datasets: [{ data: points, pointRadius: 3 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: xCol } },
          y: { title: { display: true, text: yCol } },
        },
      },
    });
  }, [xCol, yCol, processedRows]);

  const swap = () => {
    const tmp = xCol;
    setXCol(yCol);
    setYCol(tmp);
  };

  return (
    <div className="chart-section">
      <div className="chart-title">SCATTER PLOT</div>
      <div className="axis-selector-row">
        <div className="form-group-inline">
          <label className="form-label-sm">X Axis</label>
          <select
            className="form-select-sm"
            value={xCol}
            onChange={(e) => setXCol(e.target.value)}
          >
            {numericCols.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <button className="btn-swap" onClick={swap}>
          ⇄ Swap
        </button>
        <div className="form-group-inline">
          <label className="form-label-sm">Y Axis</label>
          <select
            className="form-select-sm"
            value={yCol}
            onChange={(e) => setYCol(e.target.value)}
          >
            {numericCols.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ position: 'relative', width: '100%', height: '320px' }}>
        <canvas id="scatterChart" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// HISTOGRAM
// ─────────────────────────────────────────────
function buildHistogram(canvasId, col, processedRows) {
  destroyChart(canvasId);
  const values = processedRows
    .map((r) => parseFloat(r[col]))
    .filter((v) => !isNaN(v));
  if (!values.length) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binWidth = (max - min) / 10 || 1;
  const bins = Array.from({ length: 10 }, (_, i) =>
    +(min + i * binWidth + binWidth / 2).toFixed(1)
  );
  const counts = new Array(10).fill(0);
  values.forEach((v) => {
    const idx = Math.min(Math.floor((v - min) / binWidth), 9);
    if (idx >= 0) counts[idx]++;
  });
  new window.Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: {
      labels: bins,
      datasets: [{ data: counts, barPercentage: 0.95, categoryPercentage: 1.0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          title: { display: true, text: col },
          grid: { display: false },
        },
        y: {
          title: { display: true, text: 'Count' },
          beginAtZero: true,
        },
      },
    },
  });
}

function Histograms({ processedRows, columns }) {
  const numericCols = getNumericCols(columns, processedRows);
  const [colA, setColA] = useState(numericCols[0] || '');
  const [colB, setColB] = useState(numericCols[1] || numericCols[0] || '');

  useEffect(() => {
    if (colA && processedRows.length) buildHistogram('histA', colA, processedRows);
  }, [colA, processedRows]);

  useEffect(() => {
    if (colB && processedRows.length) buildHistogram('histB', colB, processedRows);
  }, [colB, processedRows]);

  return (
    <div className="chart-section">
      <div className="chart-title">HISTOGRAM — FEATURE DISTRIBUTION</div>
      <div className="histogram-pair">
        <div className="histogram-item">
          <div className="form-group-inline">
            <label className="form-label-sm">Column A</label>
            <select
              className="form-select-sm"
              value={colA}
              onChange={(e) => setColA(e.target.value)}
            >
              {numericCols.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div style={{ position: 'relative', width: '100%', height: '280px' }}>
            <canvas id="histA" />
          </div>
        </div>
        <div className="histogram-item">
          <div className="form-group-inline">
            <label className="form-label-sm">Column B</label>
            <select
              className="form-select-sm"
              value={colB}
              onChange={(e) => setColB(e.target.value)}
            >
              {numericCols.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div style={{ position: 'relative', width: '100%', height: '280px' }}>
            <canvas id="histB" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// BOX PLOT
// ─────────────────────────────────────────────
function getBoxStats(col, processedRows) {
  const vals = processedRows
    .map((r) => parseFloat(r[col]))
    .filter((v) => !isNaN(v))
    .sort((a, b) => a - b);
  const q1 = vals[Math.floor(vals.length * 0.25)];
  const median = vals[Math.floor(vals.length * 0.5)];
  const q3 = vals[Math.floor(vals.length * 0.75)];
  return { min: vals[0], q1, median, q3, max: vals[vals.length - 1], items: vals };
}

function BoxPlot({ processedRows, columns }) {
  const numericCols = getNumericCols(columns, processedRows);
  const [selectedCol, setSelectedCol] = useState(numericCols[0] || '');

  useEffect(() => {
    if (!selectedCol || !processedRows.length) return;
    destroyChart('boxPlot');
    const stats = getBoxStats(selectedCol, processedRows);
    new window.Chart(document.getElementById('boxPlot'), {
      type: 'boxplot',
      data: {
        labels: [selectedCol],
        datasets: [{ label: selectedCol, data: [stats] }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { title: { display: true, text: selectedCol } },
        },
      },
    });
  }, [selectedCol, processedRows]);

  return (
    <div className="chart-section">
      <div className="chart-title">BOX PLOT</div>
      <div className="form-group-inline">
        <label className="form-label-sm">Column</label>
        <select
          className="form-select-sm"
          value={selectedCol}
          onChange={(e) => setSelectedCol(e.target.value)}
        >
          {numericCols.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div style={{ position: 'relative', width: '100%', height: '280px' }}>
        <canvas id="boxPlot" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// STEP 3 — PROCESSING
// ─────────────────────────────────────────────
function Step3({
  state,
  onChange,
  onProcess,
  isProcessing,
  processedRows,
  processedColumns,
  processStats,
  duplicateCount,
  previewHead,
  previewTail,
}) {
  const {
    missingValueStrategy,
    duplicateStrategy,
    categoricalEncoding,
    applyStandardization,
    requiredFeatures,
    targetColumn,
    jumlahData,
  } = state;

  const hasProcessed = processedRows && processedRows.length > 0;

  // Cleanup charts when leaving step / on unmount
  useEffect(() => {
    return () => {
      ['scatterChart', 'histA', 'histB', 'boxPlot'].forEach(destroyChart);
    };
  }, []);

  return (
    <div className="step-content">
      <h2 className="section-title">03 PROCESSING</h2>

      {/* A: Requirement Summary */}
      <div className="summary-card">
        <div className="summary-card-title">REQUIREMENT SUMMARY</div>
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-key">Jumlah Data</span>
            <span className="summary-val">{jumlahData}</span>
          </div>
          <div className="summary-item">
            <span className="summary-key">Target Column</span>
            <span className="summary-val">{targetColumn || '—'}</span>
          </div>
          <div className="summary-item">
            <span className="summary-key">Required Features</span>
            <span className="summary-val">{requiredFeatures || '—'}</span>
          </div>
        </div>
      </div>

      {/* B: Data Preview Raw */}
      {previewHead && previewHead.length > 0 && (
        <DataTable
          columns={processedColumns.length ? processedColumns : Object.keys(previewHead[0] || {})}
          head={previewHead}
          tail={previewTail}
          label="DATA PREVIEW — RAW (BEFORE PROCESSING)"
        />
      )}

      {/* C: Processing Decisions */}
      <div className="processing-card">
        <div className="processing-card-title">PROCESSING DECISIONS</div>

        <div className="form-group">
          <label className="form-label">MISSING VALUES</label>
          <select
            className="form-select"
            value={missingValueStrategy}
            onChange={(e) => onChange('missingValueStrategy', e.target.value)}
          >
            <option>Drop blank rows</option>
            <option>Fill with mean</option>
            <option>Fill with median</option>
            <option>Fill with mode</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">
            DUPLICATE STRATEGY{' '}
            {duplicateCount > 0 && (
              <span className="badge">{duplicateCount} duplicates</span>
            )}
          </label>
          <select
            className="form-select"
            value={duplicateStrategy}
            onChange={(e) => onChange('duplicateStrategy', e.target.value)}
          >
            <option>Keep Duplicates</option>
            <option>Drop Duplicates</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">CATEGORICAL ENCODING</label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={categoricalEncoding}
              onChange={(e) => onChange('categoricalEncoding', e.target.checked)}
            />
            <span>Convert text to numerical vectors</span>
          </label>
        </div>

        <div className="form-group">
          <label className="form-label">APPLY STANDARDIZATION</label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={applyStandardization}
              onChange={(e) => onChange('applyStandardization', e.target.checked)}
            />
            <span>Recommended for distance-based models</span>
          </label>
        </div>

        <button
          className="btn-process"
          onClick={onProcess}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <>
              <span className="spinner" /> Processing...
            </>
          ) : (
            'Run Processing'
          )}
        </button>
      </div>

      {/* D: Analysis Results (only after processing) */}
      {hasProcessed && (
        <>
          {/* D1: Processed Preview */}
          <DataTable
            columns={processedColumns}
            head={processedRows.slice(0, 5)}
            tail={processedRows.slice(-5)}
            label="DATA PREVIEW — AFTER PROCESSING"
          />

          {/* D2: Scatter Plot */}
          <ScatterPlot processedRows={processedRows} columns={processedColumns} />

          {/* D3: Histograms */}
          <Histograms processedRows={processedRows} columns={processedColumns} />

          {/* D4: Box Plot */}
          <BoxPlot processedRows={processedRows} columns={processedColumns} />
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// STEP 4 — MODEL PLANNING
// ─────────────────────────────────────────────
function Step4({ state, onChange }) {
  const { algorithm, hyperparams } = state;

  const setParam = (key, val) => {
    onChange('hyperparams', { ...hyperparams, [key]: val });
  };

  return (
    <div className="step-content">
      <h2 className="section-title">04 MODEL PLANNING</h2>

      <div className="form-group">
        <label className="form-label">SELECT ALGORITHM</label>
        <select
          className="form-select"
          value={algorithm}
          onChange={(e) => onChange('algorithm', e.target.value)}
        >
          <option>Logistic Regression</option>
          <option>Decision Tree</option>
          <option>Random Forest</option>
          <option>XGBoost</option>
        </select>
      </div>

      <div className="params-card">
        <div className="params-card-title">CONFIGURE PARAMETERS</div>

        {algorithm === 'Logistic Regression' && (
          <>
            <div className="param-row">
              <label className="param-label">C (Regularization)</label>
              <input
                className="param-input"
                type="number"
                step="0.1"
                value={hyperparams.C}
                onChange={(e) => setParam('C', parseFloat(e.target.value))}
              />
            </div>
            <div className="param-row">
              <label className="param-label">Max Iterations</label>
              <input
                className="param-input"
                type="number"
                value={hyperparams.max_iter}
                onChange={(e) => setParam('max_iter', parseInt(e.target.value))}
              />
            </div>
            <div className="param-row">
              <label className="param-label">Penalty</label>
              <select
                className="param-select"
                value={hyperparams.penalty}
                onChange={(e) => setParam('penalty', e.target.value)}
              >
                <option value="l2">l2</option>
                <option value="l1">l1</option>
                <option value="elasticnet">elasticnet</option>
                <option value="none">none</option>
              </select>
            </div>
            <div className="param-row">
              <label className="param-label">Solver</label>
              <select
                className="param-select"
                value={hyperparams.solver}
                onChange={(e) => setParam('solver', e.target.value)}
              >
                <option value="lbfgs">lbfgs</option>
                <option value="liblinear">liblinear</option>
                <option value="saga">saga</option>
              </select>
            </div>
          </>
        )}

        {algorithm === 'Decision Tree' && (
          <>
            <div className="param-row">
              <label className="param-label">Max Depth</label>
              <input
                className="param-input"
                type="number"
                placeholder="None"
                value={hyperparams.max_depth || ''}
                onChange={(e) =>
                  setParam('max_depth', e.target.value ? parseInt(e.target.value) : '')
                }
              />
            </div>
            <div className="param-row">
              <label className="param-label">Min Samples Split</label>
              <input
                className="param-input"
                type="number"
                value={hyperparams.min_samples_split}
                onChange={(e) =>
                  setParam('min_samples_split', parseInt(e.target.value))
                }
              />
            </div>
            <div className="param-row">
              <label className="param-label">Criterion</label>
              <select
                className="param-select"
                value={hyperparams.criterion}
                onChange={(e) => setParam('criterion', e.target.value)}
              >
                <option value="gini">gini</option>
                <option value="entropy">entropy</option>
              </select>
            </div>
          </>
        )}

        {algorithm === 'Random Forest' && (
          <>
            <div className="param-row">
              <label className="param-label">N Estimators</label>
              <input
                className="param-input"
                type="number"
                value={hyperparams.n_estimators}
                onChange={(e) =>
                  setParam('n_estimators', parseInt(e.target.value))
                }
              />
            </div>
            <div className="param-row">
              <label className="param-label">Max Depth</label>
              <input
                className="param-input"
                type="number"
                placeholder="None"
                value={hyperparams.max_depth || ''}
                onChange={(e) =>
                  setParam('max_depth', e.target.value ? parseInt(e.target.value) : '')
                }
              />
            </div>
            <div className="param-row">
              <label className="param-label">Min Samples Split</label>
              <input
                className="param-input"
                type="number"
                value={hyperparams.min_samples_split}
                onChange={(e) =>
                  setParam('min_samples_split', parseInt(e.target.value))
                }
              />
            </div>
          </>
        )}

        {algorithm === 'XGBoost' && (
          <>
            <div className="param-row">
              <label className="param-label">N Estimators</label>
              <input
                className="param-input"
                type="number"
                value={hyperparams.n_estimators}
                onChange={(e) =>
                  setParam('n_estimators', parseInt(e.target.value))
                }
              />
            </div>
            <div className="param-row">
              <label className="param-label">Learning Rate</label>
              <input
                className="param-input"
                type="number"
                step="0.01"
                value={hyperparams.learning_rate}
                onChange={(e) =>
                  setParam('learning_rate', parseFloat(e.target.value))
                }
              />
            </div>
            <div className="param-row">
              <label className="param-label">Max Depth</label>
              <input
                className="param-input"
                type="number"
                value={hyperparams.max_depth || 6}
                onChange={(e) =>
                  setParam('max_depth', parseInt(e.target.value))
                }
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// FEATURE IMPORTANCE CHART
// ─────────────────────────────────────────────
function FeatureImportanceChart({ featureImportances }) {
  useEffect(() => {
    if (!featureImportances || !featureImportances.length) return;
    destroyChart('featureImportance');
    const labels = featureImportances.map((f) => f.feature);
    const values = featureImportances.map((f) => f.importance);
    new window.Chart(document.getElementById('featureImportance'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data: values, barPercentage: 0.6 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'Importance' }, beginAtZero: true },
        },
      },
    });
  }, [featureImportances]);

  return (
    <div className="chart-section">
      <div className="chart-title">FEATURE IMPORTANCE</div>
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: `${Math.max(200, (featureImportances?.length || 4) * 36)}px`,
        }}
      >
        <canvas id="featureImportance" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CONFUSION MATRIX
// ─────────────────────────────────────────────
function ConfusionMatrix({ matrix }) {
  if (!matrix || !matrix.length) return null;
  return (
    <div className="confusion-wrap">
      <div className="chart-title">CONFUSION MATRIX</div>
      <table className="confusion-table">
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              {row.map((val, j) => (
                <td
                  key={j}
                  className={`confusion-cell ${
                    i === j ? 'confusion-cell--diag' : ''
                  }`}
                >
                  {val}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────
// STEP 5 — ENGINE EXECUTION
// ─────────────────────────────────────────────
function Step5({
  trainingStatus,
  trainingProgress,
  trainingError,
  trainingResult,
  jobId,
  onDownload,
  onCopyEndpoint,
}) {
  const isPending =
    trainingStatus === 'pending' || trainingStatus === 'running';
  const isComplete = trainingStatus === 'complete';
  const isError = trainingStatus === 'error';

  const metrics = trainingResult
    ? [
        { label: 'Accuracy', value: trainingResult.accuracy },
        { label: 'Precision', value: trainingResult.precision },
        { label: 'Recall', value: trainingResult.recall },
        { label: 'F1-Score', value: trainingResult.f1 },
      ]
    : [];

  return (
    <div className="step-content">
      <h2 className="section-title">05 ENGINE EXECUTION</h2>

      {isPending && (
        <div className="training-pending">
          <span className="spinner spinner--lg" />
          <p className="training-msg">
            Awaiting dataset ingestion... Please do not navigate away.
          </p>
          {trainingProgress > 0 && (
            <div className="progress-bar-wrap">
              <div
                className="progress-bar"
                style={{ width: `${trainingProgress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {isError && (
        <div className="error-banner">Training failed: {trainingError}</div>
      )}

      {isComplete && trainingResult && (
        <>
          {/* Metric Cards */}
          <div className="metric-grid">
            {metrics.map((m) => (
              <div key={m.label} className="metric-card">
                <div className="metric-label">{m.label}</div>
                <div className="metric-value">
                  {typeof m.value === 'number'
                    ? (m.value * 100).toFixed(2) + '%'
                    : m.value ?? '—'}
                </div>
              </div>
            ))}
          </div>

          {/* Confusion Matrix */}
          {trainingResult.confusion_matrix && (
            <ConfusionMatrix matrix={trainingResult.confusion_matrix} />
          )}

          {/* Feature Importance */}
          {trainingResult.feature_importances &&
            trainingResult.feature_importances.length > 0 && (
              <FeatureImportanceChart
                featureImportances={trainingResult.feature_importances}
              />
            )}

          {/* Actions */}
          <div className="action-row">
            <button className="btn-action" onClick={onDownload}>
              ⬇ Download Model
            </button>
            <button className="btn-action" onClick={onCopyEndpoint}>
              📋 Copy API Endpoint
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
export default function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState([]);

  // ── Wizard shared state ──────────────────────
  const [wizardState, setWizardState] = useState({
    // Step 1
    problemType: 'classification',
    systemName: '',
    inputDescription: '',
    primaryOutcome: '',
    // Step 2
    datasetName: '',
    requiredFeatures: '',
    targetColumn: '',
    jumlahData: 2000,
    datasetSource: 'api',
    csvFile: null,
    // Step 3
    missingValueStrategy: 'Drop blank rows',
    duplicateStrategy: 'Drop Duplicates',
    categoricalEncoding: true,
    applyStandardization: true,
    // Step 4
    algorithm: 'Logistic Regression',
    hyperparams: {
      C: 1,
      max_iter: 100,
      penalty: 'l2',
      solver: 'lbfgs',
      max_depth: '',
      min_samples_split: 2,
      criterion: 'gini',
      n_estimators: 100,
      learning_rate: 0.3,
    },
  });

  // ── Dataset state ───────────────────────────
  const [datasetId, setDatasetId] = useState('');
  const [columns, setColumns] = useState([]);
  const [previewHead, setPreviewHead] = useState([]);
  const [previewTail, setPreviewTail] = useState([]);
  const [rowCount, setRowCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [isDatasetLoading, setIsDatasetLoading] = useState(false);
  const [datasetError, setDatasetError] = useState('');

  // ── Processed state ─────────────────────────
  const [processedRows, setProcessedRows] = useState([]);
  const [processedColumns, setProcessedColumns] = useState([]);
  const [processStats, setProcessStats] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // ── Training state ──────────────────────────
  const [jobId, setJobId] = useState('');
  const [trainingStatus, setTrainingStatus] = useState('idle');
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [trainingError, setTrainingError] = useState('');
  const [trainingResult, setTrainingResult] = useState(null);

  // ── Toast ───────────────────────────────────
  const [toast, setToast] = useState({ msg: '', type: 'success' });
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'success' }), 4000);
  };

  // ── Update wizard state fields ───────────────
  const handleChange = (key, value) => {
    setWizardState((prev) => ({ ...prev, [key]: value }));
  };

  // ── Step validation ──────────────────────────
  const isStepValid = () => {
    const s = wizardState;
    switch (currentStep) {
      case 1:
        return (
          s.problemType &&
          s.systemName.trim() &&
          s.inputDescription.trim() &&
          s.primaryOutcome.trim()
        );
      case 2: {
        const base =
          s.datasetName.trim() &&
          s.requiredFeatures.trim() &&
          s.jumlahData > 0;
        const target =
          s.problemType === 'clustering' ? true : s.targetColumn.trim();
        if (s.datasetSource === 'manual')
          return base && target && (s.csvFile || datasetId);
        return base && target;
      }
      case 3:
        return datasetId && processedRows.length > 0;
      case 4:
        return !!s.algorithm;
      case 5:
        return trainingStatus === 'complete';
      default:
        return true;
    }
  };

  // ── Filter hyperparams by algorithm ─────────
  const filterHyperparams = () => {
    const h = wizardState.hyperparams;
    const algo = wizardState.algorithm;
    if (algo === 'Logistic Regression')
      return { C: h.C, max_iter: h.max_iter, penalty: h.penalty, solver: h.solver };
    if (algo === 'Decision Tree')
      return {
        max_depth: h.max_depth || null,
        min_samples_split: h.min_samples_split,
        criterion: h.criterion,
      };
    if (algo === 'Random Forest')
      return {
        n_estimators: h.n_estimators,
        max_depth: h.max_depth || null,
        min_samples_split: h.min_samples_split,
      };
    if (algo === 'XGBoost')
      return {
        n_estimators: h.n_estimators,
        learning_rate: h.learning_rate,
        max_depth: h.max_depth ? Number(h.max_depth) : 6,
      };
    return {};
  };

  // ── Fetch / Upload Dataset (Step 2 Proceed) ──
  const fetchDataset = async () => {
    setIsDatasetLoading(true);
    setDatasetError('');
    const s = wizardState;
    try {
      const body = {
        dataset_name: s.datasetName,
        required_features: s.requiredFeatures,
        target_column: s.problemType === 'clustering' ? '' : s.targetColumn,
        jumlah_data: Number(s.jumlahData),
        problem_type: s.problemType,
      };

      let res;
      if (s.datasetSource === 'api') {
        res = await fetch(`${BACKEND_URL}/api/dataset/fetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        if (!s.csvFile && datasetId) {
          // Already loaded
          setIsDatasetLoading(false);
          markStepDone(2);
          setCurrentStep(3);
          return;
        }
        const fd = new FormData();
        fd.append('file', s.csvFile);
        fd.append('dataset_name', s.datasetName);
        fd.append('required_features', s.requiredFeatures);
        fd.append(
          'target_column',
          s.problemType === 'clustering' ? '' : s.targetColumn
        );
        fd.append('jumlah_data', String(s.jumlahData));
        fd.append('problem_type', s.problemType);
        res = await fetch(`${BACKEND_URL}/api/dataset/upload`, {
          method: 'POST',
          body: fd,
        });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to load dataset');
      }
      const data = await res.json();
      setDatasetId(data.dataset_id);
      setColumns(data.columns);
      setPreviewHead(data.preview_head);
      setPreviewTail(data.preview_tail);
      setRowCount(data.row_count);
      setDuplicateCount(data.duplicate_count || 0);
      // Reset processed data when new dataset loaded
      setProcessedRows([]);
      setProcessedColumns([]);
      showToast('Dataset loaded successfully!', 'success');
      markStepDone(2);
      setCurrentStep(3);
    } catch (err) {
      setDatasetError(err.message || 'Error loading dataset');
      showToast(err.message, 'error');
    } finally {
      setIsDatasetLoading(false);
    }
  };

  // ── Process Dataset (Step 3 button) ─────────
  const handleProcess = async () => {
    setIsProcessing(true);
    const s = wizardState;
    try {
      const res = await fetch(`${BACKEND_URL}/api/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_id: datasetId,
          missing_values: s.missingValueStrategy,
          duplicate_strategy: s.duplicateStrategy,
          categorical_encoding: s.categoricalEncoding,
          apply_standardization: s.applyStandardization,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Processing failed');
      }
      const data = await res.json();
      setProcessedRows(data.processed_rows);
      setProcessedColumns(data.columns);
      setProcessStats(data.stats);
      showToast('Processing complete!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Start Training (Step 5 entry) ────────────
  const startTraining = async () => {
    setTrainingStatus('pending');
    setTrainingProgress(0);
    setTrainingError('');
    setTrainingResult(null);
    const s = wizardState;
    try {
      const res = await fetch(`${BACKEND_URL}/api/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem_type: s.problemType,
          system_name: s.systemName,
          dataset_id: datasetId,
          target_column: s.problemType === 'clustering' ? '' : s.targetColumn,
          required_features: s.requiredFeatures,
          processing_config: {
            missing_values: s.missingValueStrategy,
            duplicate_strategy: s.duplicateStrategy,
            categorical_encoding: s.categoricalEncoding,
            standardization: s.applyStandardization,
          },
          algorithm: s.algorithm,
          parameters: filterHyperparams(),
        }),
      });
      if (!res.ok) throw new Error('Failed to start training');
      const { job_id } = await res.json();
      setJobId(job_id);
      pollStatus(job_id);
    } catch (err) {
      setTrainingStatus('error');
      setTrainingError(err.message);
      showToast(err.message, 'error');
    }
  };

  const pollStatus = (jid) => {
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/train/status/${jid}`);
        const data = await res.json();
        setTrainingStatus(data.status);
        setTrainingProgress(data.progress || 0);
        if (data.status === 'complete') {
          clearInterval(iv);
          fetchResult(jid);
        } else if (data.status === 'error') {
          clearInterval(iv);
          setTrainingError(data.error || 'Training error');
        }
      } catch {
        clearInterval(iv);
        setTrainingStatus('error');
        setTrainingError('Failed to poll status');
      }
    }, 3000);
  };

  const fetchResult = async (jid) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/train/result/${jid}`);
      const data = await res.json();
      setTrainingResult(data);
      markStepDone(5);
      showToast('Training complete!', 'success');
    } catch (err) {
      showToast('Failed to load results', 'error');
    }
  };

  // ── Download model ───────────────────────────
  const handleDownload = () => {
    window.open(`${BACKEND_URL}/api/train/download/${jobId}`, '_blank');
  };

  // ── Copy endpoint ────────────────────────────
  const handleCopyEndpoint = () => {
    const endpoint = `${BACKEND_URL}/api/train/predict/${jobId}`;
    navigator.clipboard.writeText(endpoint).then(() =>
      showToast('API endpoint copied!', 'success')
    );
  };

  // ── Mark step done ───────────────────────────
  const markStepDone = (stepId) => {
    setCompletedSteps((prev) =>
      prev.includes(stepId) ? prev : [...prev, stepId]
    );
  };

  // ── Handle Proceed ───────────────────────────
  const handleProceed = async () => {
    if (!isStepValid()) return;
    if (currentStep === 1) {
      markStepDone(1);
      setCurrentStep(2);
    } else if (currentStep === 2) {
      await fetchDataset();
      // Navigation handled inside fetchDataset
    } else if (currentStep === 3) {
      markStepDone(3);
      setCurrentStep(4);
    } else if (currentStep === 4) {
      markStepDone(4);
      setCurrentStep(5);
      startTraining();
    }
  };

  const handlePrevious = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  // ── Trigger training when entering step 5 ────
  useEffect(() => {
    if (currentStep === 5 && trainingStatus === 'idle') {
      startTraining();
    }
  }, [currentStep]);

  // ── Render current step ──────────────────────
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1 state={wizardState} onChange={handleChange} />;
      case 2:
        return (
          <Step2
            state={wizardState}
            onChange={handleChange}
            isLoading={isDatasetLoading}
            error={datasetError}
          />
        );
      case 3:
        return (
          <Step3
            state={wizardState}
            onChange={handleChange}
            onProcess={handleProcess}
            isProcessing={isProcessing}
            processedRows={processedRows}
            processedColumns={processedColumns.length ? processedColumns : columns}
            processStats={processStats}
            duplicateCount={duplicateCount}
            previewHead={previewHead}
            previewTail={previewTail}
          />
        );
      case 4:
        return <Step4 state={wizardState} onChange={handleChange} />;
      case 5:
        return (
          <Step5
            trainingStatus={trainingStatus}
            trainingProgress={trainingProgress}
            trainingError={trainingError}
            trainingResult={trainingResult}
            jobId={jobId}
            onDownload={handleDownload}
            onCopyEndpoint={handleCopyEndpoint}
          />
        );
      default:
        return null;
    }
  };

  const proceedLabel =
    currentStep === 2
      ? isDatasetLoading
        ? 'Loading...'
        : 'Load Dataset →'
      : currentStep === 4
      ? 'Start Training →'
      : 'Proceed →';

  const proceedDisabled =
    !isStepValid() ||
    isDatasetLoading ||
    (currentStep === 5 && trainingStatus !== 'complete');

  return (
    <div className="wizard-root">
      {/* TOP NAV */}
      <div className="wizard-topbar">
        <div className="topbar-breadcrumb">
          <span>Intelligence Creation</span>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-active">Structured Data</span>
        </div>
        <div className="topbar-actions">
          <button className="btn-outlined">Save Draft</button>
          <button className="btn-purple">API Documentation</button>
          <button className="btn-danger">Back to Project</button>
        </div>
      </div>

      <div className="wizard-body">
        {/* SIDEBAR */}
        <StepSidebar currentStep={currentStep} completedSteps={completedSteps} />

        {/* MAIN CONTENT */}
        <div className="wizard-main">
          <div className="wizard-card">{renderStep()}</div>

          {/* FOOTER NAV */}
          <div className="wizard-footer">
            <button
              className="btn-nav btn-nav--prev"
              onClick={handlePrevious}
              disabled={currentStep === 1}
            >
              ← Previous
            </button>
            {currentStep < 5 && (
              <button
                className="btn-nav btn-nav--proceed"
                onClick={handleProceed}
                disabled={proceedDisabled}
              >
                {proceedLabel}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* TOAST */}
      {toast.msg && (
        <div className={`toast toast--${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}
