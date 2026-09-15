/**
 * AdminDashboard.tsx — Layer 7: Government / Admin Dashboard
 *
 * Route: /admin (protected — admin or SURVEYOR role only)
 *
 * LEVEL 1 — Parcel registry with live Layer 5 ULPIN validation.
 * LEVEL 2+ — Surveyor drill-down: Parcel → Building → Floor → Flat,
 *            with real floor/flat generation and real 3D ULPIN assignment.
 * Stub integrations (DigiLocker, Bank-KYC) are clearly labeled MOCK.
 *
 * Architecture: Layer 7 Application Layer (SIH26011 solution doc)
 * Substitution note: Uses React + Fetch instead of a dedicated govt portal
 * framework — functionally equivalent at prototype scale.
 */

import { useState, useEffect, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  api,
  AdminParcelRow,
  ULPINValidationResult,
  DigiLockerStub,
  BankKYCStub,
} from '../services/api';
import { AdminRoute } from './admin/types';
import BuildingsView from './admin/BuildingsView';
import FloorsView from './admin/FloorsView';
import FlatsView from './admin/FlatsView';

// ── Types ────────────────────────────────────────────────────────────────────

type ValidationState = 'idle' | 'loading' | 'valid' | 'invalid' | 'error';

interface ParcelRowState {
  row: AdminParcelRow;
  validationState: ValidationState;
  validationResult: ULPINValidationResult | null;
  digilocker: DigiLockerStub | null;
  bankKyc: BankKYCStub | null;
  expanded: boolean;
  stubLoading: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  'satellite-only': {
    bg: 'rgba(245, 158, 11, 0.12)',
    text: '#f59e0b',
    dot: '#f59e0b',
    label: 'Satellite Only',
  },
  'drone-verified': {
    bg: 'rgba(59, 130, 246, 0.12)',
    text: '#60a5fa',
    dot: '#60a5fa',
    label: 'Drone Verified',
  },
  'lidar-verified': {
    bg: 'rgba(139, 92, 246, 0.12)',
    text: '#a78bfa',
    dot: '#a78bfa',
    label: 'LiDAR Verified',
  },
  'sanction-plan-verified': {
    bg: 'rgba(16, 185, 129, 0.12)',
    text: '#34d399',
    dot: '#34d399',
    label: 'Sanction Plan ✓',
  },
};

function getConfidenceStyle(score: string) {
  return CONFIDENCE_STYLES[score] ?? {
    bg: 'rgba(107, 114, 128, 0.12)',
    text: '#9ca3af',
    dot: '#9ca3af',
    label: score,
  };
}

function formatArea(m2: number): string {
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(2)} ha`;
  return `${m2.toLocaleString('en-IN', { maximumFractionDigits: 0 })} m²`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function parcelShortName(p: AdminParcelRow): string {
  const name = p.name ?? '';
  const trimmed = name.split(',')[0].trim();
  return trimmed && trimmed.length > 0 ? trimmed : `Parcel #${p.id}`;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { user, token, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  const [route, setRoute] = useState<AdminRoute>({ level: 1 });
  const [parcels, setParcels] = useState<ParcelRowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [totalFeatures, setTotalFeatures] = useState(0);

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      navigate('/#auth', { replace: true });
      return;
    }
    const role = user?.role?.toLowerCase();
    if (role !== 'admin' && role !== 'surveyor') {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isLoading, user, navigate]);

  // ── Load parcels ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api.getAdminParcels(token)
      .then((rows) => {
        setParcels(rows.map((row) => ({
          row,
          validationState: 'idle',
          validationResult: null,
          digilocker: null,
          bankKyc: null,
          expanded: false,
          stubLoading: false,
        })));
        setTotalFeatures(rows.reduce((s, r) => s + r.feature_count, 0));
        setError(null);
      })
      .catch((e) => setError(e.message || 'Failed to load parcels'))
      .finally(() => setLoading(false));
  }, [token]);

  // ── Validate ULPIN ─────────────────────────────────────────────────────────
  const handleValidate = useCallback(async (idx: number) => {
    setParcels((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], validationState: 'loading', validationResult: null };
      return next;
    });

    try {
      const result = await api.validateUlpin(parcels[idx].row.ulpin_3d);
      setParcels((prev) => {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          validationState: result.valid ? 'valid' : 'invalid',
          validationResult: result,
        };
        return next;
      });
    } catch {
      setParcels((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], validationState: 'error' };
        return next;
      });
    }
  }, [parcels]);

  // ── Load stub integrations ─────────────────────────────────────────────────
  const handleLoadStubs = useCallback(async (idx: number) => {
    const ulpin = parcels[idx].row.ulpin_3d;
    setParcels((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], stubLoading: true, expanded: true };
      return next;
    });
    try {
      const [dl, kyc] = await Promise.all([
        api.getDigilockerStub(ulpin),
        api.getBankKycStub(ulpin),
      ]);
      setParcels((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], digilocker: dl, bankKyc: kyc, stubLoading: false };
        return next;
      });
    } catch {
      setParcels((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], stubLoading: false };
        return next;
      });
    }
  }, [parcels]);

  // ── Drill-down navigation ──────────────────────────────────────────────────

  const openBuildings = (p: AdminParcelRow) => setRoute({ level: 2, parcel: p });
  const backToParcels = () => setRoute({ level: 1 });

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const filtered = parcels.filter((p) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      p.row.ulpin_3d.toLowerCase().includes(q) ||
      (p.row.name ?? '').toLowerCase().includes(q) ||
      p.row.confidence_score.toLowerCase().includes(q)
    );
  });

  // ── Loading / Error states ─────────────────────────────────────────────────
  if (isLoading || loading) {
    return (
      <div style={styles.page}>
        <div style={styles.centered}>
          <div style={styles.spinner} />
          <p style={{ color: '#94a3b8', marginTop: 16 }}>Loading cadastral registry…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.centered}>
          <p style={{ color: '#f87171', fontSize: 16 }}>⚠ {error}</p>
          <button style={styles.btnSecondary} onClick={() => navigate('/')}>← Back to portal</button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate('/')}>← Portal</button>
          <div>
            <div style={styles.badge}>
              <span style={styles.badgeDot} />
              Layer 7 — Admin / Govt Dashboard
            </div>
            <h1 style={styles.title}>3D Cadastral Registry</h1>
            <p style={styles.subtitle}>
              Bhustack3D · SIH26011 · Knowledge Park 2, Greater Noida
            </p>
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{parcels.length}</div>
            <div style={styles.statLabel}>Parcels</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{totalFeatures}</div>
            <div style={styles.statLabel}>Features</div>
          </div>
          <div style={{ ...styles.statCard, borderColor: 'rgba(245,158,11,0.3)' }}>
            <div style={{ ...styles.statValue, color: '#f59e0b' }}>Satellite</div>
            <div style={styles.statLabel}>Confidence</div>
          </div>
        </div>
      </div>

      {/* Architecture Note */}
      <div style={styles.archNote}>
        <span style={styles.archNoteIcon}>ℹ</span>
        <span>
          <strong>Architecture:</strong> Real data from Layer 4 SQLite DB (LADM-inspired schema).
          Floor/flat auto-generation + 3D ULPIN assignment call real backend endpoints and the
          Layer 5 Verhoeff checksum engine.
          DigiLocker &amp; Bank-KYC buttons call <span style={styles.mockTag}>MOCK</span> stub endpoints
          (returns <code style={styles.code}>mock: true</code>) — real gov API access requires partnership agreements
          outside hackathon scope.
        </span>
      </div>

      {/* LEVELS 2–4 — Surveyor drill-down */}
      {route.level === 2 && token && (
        <BuildingsView
          token={token}
          parcel={route.parcel}
          onBack={backToParcels}
          onSelectFeature={(feat) => setRoute({ level: 3, parcel: route.parcel, feature: feat })}
        />
      )}

      {route.level === 3 && token && (
        <FloorsView
          token={token}
          parcel={route.parcel}
          feature={route.feature}
          onBack={() => setRoute({ level: 2, parcel: route.parcel })}
          onSelectFloor={(floor) => setRoute({ level: 4, parcel: route.parcel, feature: route.feature, floor })}
        />
      )}

      {route.level === 4 && token && (
        <FlatsView
          token={token}
          parcel={route.parcel}
          feature={route.feature}
          floor={route.floor}
          onBack={() => setRoute({ level: 3, parcel: route.parcel, feature: route.feature })}
        />
      )}

      {/* LEVEL 1 — Parcel list */}
      {route.level === 1 && (
        <>
          {/* Search */}
          <div style={styles.searchRow}>
            <input
              id="admin-search"
              style={styles.searchInput}
              placeholder="Search by ULPIN, name, or confidence tier…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <span style={styles.searchCount}>
              {filtered.length} of {parcels.length} parcels
            </span>
          </div>

          {/* Table */}
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  <th style={{ ...styles.th, width: 40 }}>#</th>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>3D ULPIN</th>
                  <th style={styles.th}>Confidence</th>
                  <th style={styles.th}>Area</th>
                  <th style={styles.th}>Features</th>
                  <th style={styles.th}>Last Verified</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>Validate (L5)</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>Drill-down</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>Integrations</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ps) => {
                  const confStyle = getConfidenceStyle(ps.row.confidence_score);
                  const actualIdx = parcels.indexOf(ps);
                  return (
                    <Fragment key={ps.row.id}>
                      <tr style={styles.tr}>
                        <td style={styles.td}><span style={styles.rowNum}>{ps.row.id}</span></td>
                        <td style={styles.td}>
                          <div style={styles.nameCell}>
                            <button
                              id={`parcel-name-${ps.row.id}`}
                              style={styles.nameLink}
                              onClick={() => openBuildings(ps.row)}
                              title={`Open buildings for ${parcelShortName(ps.row)}`}
                            >
                              {ps.row.name ?? <em style={{ color: '#64748b' }}>Unnamed</em>}
                            </button>
                            <span style={styles.coordBadge}>
                              {ps.row.centroid_lat.toFixed(4)}°N, {ps.row.centroid_lon.toFixed(4)}°E
                            </span>
                          </div>
                        </td>
                        <td style={styles.td}>
                          <code style={styles.ulpin}>{ps.row.ulpin_3d}</code>
                        </td>
                        <td style={styles.td}>
                          <span style={{ ...styles.confBadge, background: confStyle.bg, color: confStyle.text }}>
                            <span style={{ ...styles.confDot, background: confStyle.dot }} />
                            {confStyle.label}
                          </span>
                        </td>
                        <td style={styles.td}>{formatArea(ps.row.total_area)}</td>
                        <td style={styles.td}>{ps.row.feature_count}</td>
                        <td style={styles.td}>{formatDate(ps.row.last_verified_date)}</td>

                        {/* Validate button + badge */}
                        <td style={{ ...styles.td, textAlign: 'center' }}>
                          <div style={styles.validateCell}>
                            <button
                              id={`validate-btn-${ps.row.id}`}
                              style={{
                                ...styles.validateBtn,
                                opacity: ps.validationState === 'loading' ? 0.6 : 1,
                              }}
                              onClick={() => handleValidate(actualIdx)}
                              disabled={ps.validationState === 'loading'}
                            >
                              {ps.validationState === 'loading' ? '…' : '▶ Validate'}
                            </button>
                            {ps.validationState === 'valid' && (
                              <span style={styles.passBadge}>✓ PASS</span>
                            )}
                            {ps.validationState === 'invalid' && (
                              <span style={styles.failBadge}>✗ FAIL</span>
                            )}
                            {ps.validationState === 'error' && (
                              <span style={styles.errBadge}>⚠ ERR</span>
                            )}
                          </div>
                          {ps.validationResult && (
                            <div style={styles.checkDigitInfo}>
                              expect&nbsp;<strong>{ps.validationResult.check_digit_expected}</strong>
                              {' '}· found&nbsp;<strong style={{ color: ps.validationResult.valid ? '#34d399' : '#f87171' }}>
                                {ps.validationResult.check_digit_found}
                              </strong>
                            </div>
                          )}
                        </td>

                        {/* Drill-down */}
                        <td style={{ ...styles.td, textAlign: 'center' }}>
                          <button
                            id={`drilldown-btn-${ps.row.id}`}
                            style={styles.drillBtn}
                            onClick={() => openBuildings(ps.row)}
                          >
                            Manage Buildings →
                          </button>
                        </td>

                        {/* Integration stubs */}
                        <td style={{ ...styles.td, textAlign: 'center' }}>
                          <button
                            id={`stubs-btn-${ps.row.id}`}
                            style={{ ...styles.stubsBtn, opacity: ps.stubLoading ? 0.6 : 1 }}
                            onClick={() => handleLoadStubs(actualIdx)}
                            disabled={ps.stubLoading}
                          >
                            {ps.stubLoading ? '…' : ps.expanded ? '▲ Hide' : '▼ View'}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded stubs panel */}
                      {ps.expanded && (ps.digilocker || ps.bankKyc) && (
                        <tr style={styles.expandedRow}>
                          <td colSpan={10} style={styles.expandedTd}>
                            <div style={styles.stubsPanel}>
                              {ps.digilocker && (
                                <div style={styles.stubCard}>
                                  <div style={styles.stubHeader}>
                                    <span style={styles.mockBadge}>MOCK</span>
                                    <span style={styles.stubTitle}>DigiLocker Integration</span>
                                    <span style={styles.stubNote}>mock: true — not a real DigiLocker connection</span>
                                  </div>
                                  <div style={styles.stubDocs}>
                                    {ps.digilocker.linked_documents.map((doc, di) => (
                                      <div key={di} style={styles.stubDoc}>
                                        <div style={styles.stubDocType}>{doc.doc_type}</div>
                                        <div style={styles.stubDocRef}>{doc.doc_ref}</div>
                                        <div style={styles.stubDocIssuer}>{doc.issued_by}</div>
                                      </div>
                                    ))}
                                  </div>
                                  <div style={styles.stubFootnote}>{ps.digilocker.note}</div>
                                </div>
                              )}

                              {ps.bankKyc && (
                                <div style={styles.stubCard}>
                                  <div style={styles.stubHeader}>
                                    <span style={styles.mockBadge}>MOCK</span>
                                    <span style={styles.stubTitle}>Bank KYC / Loan Eligibility</span>
                                    <span style={styles.stubNote}>mock: true — not a real bank API</span>
                                  </div>
                                  <div style={styles.kycGrid}>
                                    <div style={styles.kycItem}>
                                      <div style={styles.kycLabel}>Eligibility</div>
                                      <div style={{ ...styles.kycValue, color: '#34d399', textTransform: 'capitalize' }}>
                                        {ps.bankKyc.loan_eligibility}
                                      </div>
                                    </div>
                                    <div style={styles.kycItem}>
                                      <div style={styles.kycLabel}>Est. Value</div>
                                      <div style={styles.kycValue}>
                                        ₹{(ps.bankKyc.estimated_property_value_inr / 1_000_000).toFixed(1)}Cr
                                      </div>
                                    </div>
                                    <div style={styles.kycItem}>
                                      <div style={styles.kycLabel}>LTV Ratio</div>
                                      <div style={styles.kycValue}>{ps.bankKyc.ltv_ratio_percent}%</div>
                                    </div>
                                  </div>
                                  <div style={styles.stubFootnote}>{ps.bankKyc.note}</div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div style={styles.footer}>
            <div>
              <strong>Layer 3 (AI Extraction)</strong>: STUB — U-Net/SAM pass-through.
              Real segmentation model out of scope for hackathon. See <code style={styles.code}>services/ai_extraction.py</code>.
            </div>
            <div style={{ marginTop: 4 }}>
              <strong>Layer 4 (DB)</strong>: SQLite prototype — production would use PostgreSQL + PostGIS 3D + 3DCityDB.
            </div>
            <div style={{ marginTop: 4 }}>
              <strong>Surveyor drill-down</strong>: Buildings → Floors → Flats with real ULPIN assignment.
              Citizen-defaults and all public pages are unaffected — this area is admin/surveyor-only.
            </div>
            <div style={{ marginTop: 4 }}>
              <strong>Future work</strong>: Flutter mobile field-verification app · Real DigiLocker/Bank KYC ·
              Blockchain hash-anchoring · Municipal system integrations.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #020817 0%, #0a1628 50%, #050d1a 100%)',
    color: '#e2e8f0',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    padding: '0 0 60px',
  },
  centered: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '60vh', gap: 16,
  },
  spinner: {
    width: 40, height: 40, borderRadius: '50%',
    border: '3px solid rgba(56,189,248,0.2)',
    borderTop: '3px solid #38bdf8',
    animation: 'spin 0.8s linear infinite',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '32px 40px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
    backdropFilter: 'blur(20px)',
    flexWrap: 'wrap', gap: 20,
  },
  headerLeft: { display: 'flex', alignItems: 'flex-start', gap: 16 },
  headerRight: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  backBtn: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#94a3b8', borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
    fontSize: 13, marginTop: 4, whiteSpace: 'nowrap',
  },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'rgba(56,189,248,0.15)', color: '#38bdf8',
    borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600,
    border: '1px solid rgba(56,189,248,0.35)', marginBottom: 8,
  },
  badgeDot: { width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' },
  title: {
    fontSize: 26, fontWeight: 700, color: '#f1f5f9', margin: 0,
    letterSpacing: '-0.5px',
  },
  subtitle: { fontSize: 13, color: '#64748b', margin: '4px 0 0' },
  statCard: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, padding: '12px 20px', textAlign: 'center', minWidth: 80,
  },
  statValue: { fontSize: 20, fontWeight: 700, color: '#7dd3fc' },
  statLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },
  archNote: {
    display: 'flex', gap: 10, alignItems: 'flex-start',
    margin: '20px 40px',
    background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.2)',
    borderRadius: 10, padding: '12px 16px', fontSize: 12.5, color: '#94a3b8',
    lineHeight: 1.6,
  },
  archNoteIcon: { color: '#38bdf8', fontSize: 16, flexShrink: 0, marginTop: 1 },
  mockTag: {
    background: 'rgba(239,68,68,0.2)', color: '#f87171',
    borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 700,
    border: '1px solid rgba(239,68,68,0.3)',
  },
  code: {
    background: 'rgba(255,255,255,0.07)', borderRadius: 4,
    padding: '1px 5px', fontSize: '0.85em', fontFamily: 'monospace',
  },
  searchRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '0 40px 20px',
  },
  searchInput: {
    flex: 1, background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
    color: '#e2e8f0', padding: '10px 14px', fontSize: 13,
    outline: 'none', fontFamily: 'inherit',
  },
  searchCount: { color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' },
  tableWrap: {
    margin: '0 40px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12, overflow: 'auto',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  thead: { background: 'rgba(56,189,248,0.07)' },
  th: {
    padding: '12px 14px', textAlign: 'left', color: '#64748b',
    fontWeight: 600, fontSize: 11, textTransform: 'uppercase',
    letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.06)',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    transition: 'background 0.15s',
  },
  td: { padding: '12px 14px', verticalAlign: 'middle', color: '#cbd5e1' },
  rowNum: { color: '#475569', fontSize: 11 },
  nameCell: { display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' },
  nameLink: {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#e2e8f0',
    textAlign: 'left',
  },
  coordBadge: {
    fontSize: 10, color: '#475569', fontFamily: 'monospace',
  },
  ulpin: {
    fontFamily: 'monospace', fontSize: 11,
    background: 'rgba(56,189,248,0.08)', borderRadius: 4,
    padding: '2px 6px', color: '#7dd3fc', letterSpacing: '0.03em',
    whiteSpace: 'nowrap',
  },
  confBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  confDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  validateCell: { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', flexWrap: 'wrap' },
  validateBtn: {
    background: 'linear-gradient(135deg, #0ea5e9, #22d3ee)',
    border: 'none', color: '#04121a', borderRadius: 6,
    padding: '5px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
    letterSpacing: '0.03em', whiteSpace: 'nowrap',
    transition: 'opacity 0.15s',
  },
  passBadge: {
    background: 'rgba(16,185,129,0.15)', color: '#34d399',
    border: '1px solid rgba(16,185,129,0.3)',
    borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700,
  },
  failBadge: {
    background: 'rgba(239,68,68,0.15)', color: '#f87171',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700,
  },
  errBadge: {
    background: 'rgba(245,158,11,0.15)', color: '#fbbf24',
    border: '1px solid rgba(245,158,11,0.3)',
    borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700,
  },
  checkDigitInfo: {
    fontSize: 10, color: '#64748b', marginTop: 4, textAlign: 'center',
    fontFamily: 'monospace',
  },
  drillBtn: {
    background: 'rgba(56,189,248,0.08)',
    border: '1px solid rgba(56,189,248,0.35)',
    color: '#38bdf8', borderRadius: 6,
    padding: '5px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
    whiteSpace: 'nowrap', transition: 'all 0.15s',
  },
  stubsBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#94a3b8', borderRadius: 6,
    padding: '5px 10px', cursor: 'pointer', fontSize: 11,
    transition: 'all 0.15s',
  },
  expandedRow: { background: 'rgba(30,41,59,0.5)' },
  expandedTd: { padding: '16px 20px' },
  stubsPanel: {
    display: 'flex', gap: 16, flexWrap: 'wrap',
  },
  stubCard: {
    flex: 1, minWidth: 280,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: 10, padding: '14px 16px',
  },
  stubHeader: {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap',
  },
  mockBadge: {
    background: 'rgba(239,68,68,0.2)', color: '#f87171',
    border: '1px solid rgba(239,68,68,0.35)',
    borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 800,
    letterSpacing: '0.05em',
  },
  stubTitle: { fontSize: 13, fontWeight: 600, color: '#e2e8f0' },
  stubNote: { fontSize: 10, color: '#f87171', fontStyle: 'italic' },
  stubDocs: { display: 'flex', flexDirection: 'column', gap: 8 },
  stubDoc: {
    background: 'rgba(255,255,255,0.03)', borderRadius: 6,
    padding: '8px 10px',
  },
  stubDocType: { fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 2 },
  stubDocRef: { fontSize: 11, fontFamily: 'monospace', color: '#7dd3fc' },
  stubDocIssuer: { fontSize: 10, color: '#475569', marginTop: 2 },
  stubFootnote: {
    fontSize: 10, color: '#ef4444', marginTop: 10,
    fontStyle: 'italic', lineHeight: 1.5,
  },
  kycGrid: { display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 },
  kycItem: {
    background: 'rgba(255,255,255,0.03)', borderRadius: 6,
    padding: '8px 14px', flex: 1, minWidth: 80,
  },
  kycLabel: { fontSize: 10, color: '#64748b', marginBottom: 3 },
  kycValue: { fontSize: 16, fontWeight: 700, color: '#e2e8f0' },
  btnSecondary: {
    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
    color: '#94a3b8', borderRadius: 8, padding: '8px 16px',
    cursor: 'pointer', fontSize: 13,
  },
  footer: {
    margin: '32px 40px 0',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10, padding: '14px 18px',
    fontSize: 11, color: '#475569', lineHeight: 1.8,
  },
};