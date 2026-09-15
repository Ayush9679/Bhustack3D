import { useEffect, useState } from 'react';
import {
  api,
  AdminParcelRow,
  FeatureDetailResponse,
  FloorResponse,
  FlatResponse,
  FlatCreateRequest,
  FlatUpdateRequest,
  FlatGenerateRequest,
} from '../../services/api';
import {
  Badge,
  Panel,
  PrimaryButton,
  GhostButton,
  AccentGhostButton,
  DangerButton,
  IconButton,
  InlineInput,
  InlineSelect,
  InlineError,
  UlpinCode,
  LoadingBlock,
  EmptyState,
  Breadcrumbs,
  FieldLabel,
} from './ui';
import { DRILL_CONTAINER } from './types';

const UNIT_TYPE_OPTIONS = ['Residential', 'Commercial', 'Parking', 'Retail', 'Institutional', 'Industrial', 'Other'];

interface FlatRowState {
  row: FlatResponse;
  assignState: 'idle' | 'busy' | 'assigned' | 'rejected';
  assignMessage: string | null;
  editing: boolean;
  editUnitNumber: string;
  editUnitType: string;
  editArea: string;
  editOwner: string;
  editError: string | null;
  deleteBusy: boolean;
}

function parcelShortName(p: AdminParcelRow): string {
  const name = p.name ?? '';
  const trimmed = name.split(',')[0].trim();
  return trimmed && trimmed.length > 0 ? trimmed : `Parcel #${p.id}`;
}

function buildingShortName(f: FeatureDetailResponse): string {
  return f.feature_name ?? `Building #${f.fid ?? f.id}`;
}

export default function FlatsView({
  token,
  parcel,
  feature,
  floor,
  onBack,
}: {
  token: string;
  parcel: AdminParcelRow;
  feature: FeatureDetailResponse;
  floor: FloorResponse;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<FlatRowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate panel
  const [showGenerate, setShowGenerate] = useState(false);
  const [genCount, setGenCount] = useState('');
  const [genStart, setGenStart] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Manual add panel
  const [showAdd, setShowAdd] = useState(false);
  const [addUnit, setAddUnit] = useState('');
  const [addType, setAddType] = useState('Residential');
  const [addArea, setAddArea] = useState('');
  const [addOwner, setAddOwner] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.getBuildingFloors(token, parcel.id, feature.id)
      .then((floors) => {
        if (!mounted) return;
        const target = floors.find((f) => f.id === floor.id);
        const flats = target?.flats ?? [];
        setRows(flats.map((row) => ({
          row,
          assignState: 'idle',
          assignMessage: null,
          editing: false,
          editUnitNumber: row.unit_number,
          editUnitType: row.unit_type,
          editArea: row.area_sqm != null ? String(row.area_sqm) : '',
          editOwner: row.owner_name ?? '',
          editError: null,
          deleteBusy: false,
        })));
        setError(null);
      })
      .catch((e) => { if (mounted) setError(e.message || 'Failed to load flats'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [token, parcel.id, feature.id, floor.id]);

  const runGenerate = async () => {
    const flatCount = parseInt(genCount, 10);
    if (!Number.isInteger(flatCount) || flatCount < 1) {
      setGenError('Number of flats must be at least 1.');
      return;
    }
    const startingUnitNumber = parseInt(genStart, 10) || 1;
    setGenBusy(true);
    setGenError(null);
    const body: FlatGenerateRequest = { flat_count: flatCount, starting_unit_number: startingUnitNumber };
    try {
      const flats = await api.generateFlats(token, floor.id, body);
      setRows(flats.map((row) => ({
        row,
        assignState: 'idle',
        assignMessage: null,
        editing: false,
        editUnitNumber: row.unit_number,
        editUnitType: row.unit_type,
        editArea: row.area_sqm != null ? String(row.area_sqm) : '',
        editOwner: row.owner_name ?? '',
        editError: null,
        deleteBusy: false,
      })));
      setShowGenerate(false);
      setGenCount('');
      setGenStart('');
    } catch (e) {
      setGenError((e as Error).message || 'Failed to generate flats.');
    } finally {
      setGenBusy(false);
    }
  };

  const runAdd = async () => {
    if (!addUnit.trim()) {
      setAddError('Unit number is required.');
      return;
    }
    setAddBusy(true);
    setAddError(null);
    const body: FlatCreateRequest = {
      unit_number: addUnit.trim(),
      unit_type: addType,
      area_sqm: addArea.trim() ? parseFloat(addArea) : null,
      owner_name: addOwner.trim() || null,
    };
    try {
      const created = await api.createSingleFlat(token, floor.id, body);
      setRows((prev) => {
        const next = [...prev, {
          row: created,
          assignState: 'idle' as const,
          assignMessage: null,
          editing: false,
          editUnitNumber: created.unit_number,
          editUnitType: created.unit_type,
          editArea: created.area_sqm != null ? String(created.area_sqm) : '',
          editOwner: created.owner_name ?? '',
          editError: null,
          deleteBusy: false,
        }];
        return next.sort((a, b) => a.row.unit_number.localeCompare(b.row.unit_number, undefined, { numeric: true }));
      });
      setShowAdd(false);
      setAddUnit('');
      setAddType('Residential');
      setAddArea('');
      setAddOwner('');
    } catch (e) {
      setAddError((e as Error).message || 'Failed to add flat.');
    } finally {
      setAddBusy(false);
    }
  };

  const assignUlpin = async (idx: number) => {
    const flatId = rows[idx].row.id;
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], assignState: 'busy', assignMessage: null };
      return next;
    });
    try {
      const res = await api.assignFlatUlpin(token, flatId);
      setRows((prev) => {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          row: { ...next[idx].row, unit_ulpin: res.ulpin_3d },
          assignState: 'assigned',
          assignMessage: res.message,
        };
        return next;
      });
    } catch (e) {
      setRows((prev) => {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          assignState: 'rejected',
          assignMessage: (e as Error).message || 'Failed to assign ULPIN.',
        };
        return next;
      });
    }
  };

  const startEdit = (idx: number) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], editing: true, editError: null };
      return next;
    });
  };

  const cancelEdit = (idx: number) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], editing: false, editError: null };
      return next;
    });
  };

  const saveEdit = async (idx: number) => {
    const r = rows[idx];
    const body: FlatUpdateRequest = {};
    if (r.editUnitNumber.trim()) body.unit_number = r.editUnitNumber.trim();
    if (r.editUnitType.trim()) body.unit_type = r.editUnitType.trim();
    body.area_sqm = r.editArea.trim() ? parseFloat(r.editArea) : null;
    body.owner_name = r.editOwner.trim() || null;
    try {
      const updated = await api.updateFlat(token, r.row.id, body);
      setRows((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], row: updated, editing: false, editError: null };
        return next;
      });
    } catch (e) {
      setRows((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], editError: (e as Error).message || 'Failed to save flat.' };
        return next;
      });
    }
  };

  const deleteFlat = async (idx: number) => {
    const r = rows[idx];
    if (!window.confirm(`Delete unit "${r.row.unit_number}"?`)) return;
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], deleteBusy: true };
      return next;
    });
    try {
      await api.deleteFlat(token, r.row.id);
      setRows((prev) => prev.filter((_, i) => i !== idx));
    } catch (e) {
      setRows((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], deleteBusy: false, assignMessage: `✗ ${(e as Error).message || 'Delete failed.'}` };
        return next;
      });
    }
  };

  const noFlats = rows.length === 0;

  return (
    <div style={DRILL_CONTAINER}>
      <Breadcrumbs
        segments={[
          { label: 'Parcels', onClick: () => onBack() },
          { label: parcelShortName(parcel), onClick: () => onBack() },
          { label: buildingShortName(feature), onClick: onBack },
          { label: floor.floor_label, active: true },
        ]}
      />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.5px' }}>
            Flat Management
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: '6px 0 0' }}>
            {floor.floor_label} (L{floor.floor_number}) · {buildingShortName(feature)} · {rows.length} unit{rows.length === 1 ? '' : 's'}
          </p>
        </div>
        <GhostButton onClick={onBack}>← Back to floors</GhostButton>
      </div>

      {!noFlats && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <AccentGhostButton id="toggle-auto-generate-flats" onClick={() => { setShowGenerate((v) => !v); setShowAdd(false); setGenError(null); }}>
            {showGenerate ? 'Hide auto-generate' : 'Auto-generate flats'}
          </AccentGhostButton>
          <GhostButton id="toggle-add-flat" onClick={() => { setShowAdd((v) => !v); setShowGenerate(false); setAddError(null); }}>
            {showAdd ? 'Hide add flat' : '+ Add Flat'}
          </GhostButton>
        </div>
      )}

      {showGenerate && (
        <Panel style={{ padding: '18px 20px', marginBottom: 18, borderColor: 'rgba(56,189,248,0.3)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>Generate flat rows</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <FieldLabel>Number of flats on this floor</FieldLabel>
              <InlineInput id="gen-flat-count" value={genCount} onChange={setGenCount} type="number" placeholder="e.g. 4" width={120} />
            </div>
            <div>
              <FieldLabel>Starting unit number (default 1)</FieldLabel>
              <InlineInput id="gen-flat-start" value={genStart} onChange={setGenStart} type="number" placeholder="1" width={120} />
            </div>
            <PrimaryButton id="generate-flats-btn" onClick={runGenerate} busy={genBusy}>Generate Flats</PrimaryButton>
          </div>
          {genError && <InlineError style={{ marginTop: 12 }}>{genError}</InlineError>}
          <div style={{ fontSize: 11, color: '#475569', marginTop: 12 }}>
            Unit numbers follow the floor convention (e.g. floor 7 + unit 4 → “704”, basements → “B1xx”, ground → “Gxx”).
            ULPINs are never auto-assigned — assign per unit afterward.
          </div>
        </Panel>
      )}

      {showAdd && (
        <Panel style={{ padding: '18px 20px', marginBottom: 18, borderColor: 'rgba(56,189,248,0.3)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>Add a single flat</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <FieldLabel>Unit number</FieldLabel>
              <InlineInput id="add-flat-unit" value={addUnit} onChange={setAddUnit} placeholder="e.g. 704" width={100} />
            </div>
            <div>
              <FieldLabel>Unit type</FieldLabel>
              <InlineSelect value={addType} onChange={setAddType} options={UNIT_TYPE_OPTIONS} />
            </div>
            <div>
              <FieldLabel>Area (m²)</FieldLabel>
              <InlineInput id="add-flat-area" value={addArea} onChange={setAddArea} type="number" placeholder="e.g. 75" width={100} />
            </div>
            <div>
              <FieldLabel>Owner name (optional)</FieldLabel>
              <InlineInput id="add-flat-owner" value={addOwner} onChange={setAddOwner} placeholder="e.g. Ravi Gupta" width={170} />
            </div>
            <PrimaryButton id="add-flat-btn" onClick={runAdd} busy={addBusy}>Add Flat</PrimaryButton>
          </div>
          {addError && <InlineError style={{ marginTop: 12 }}>{addError}</InlineError>}
        </Panel>
      )}

      {loading && <LoadingBlock label="Loading flats…" />}

      {!loading && error && <InlineError>{error}</InlineError>}

      {!loading && !error && noFlats && (
        <Panel style={{ borderColor: 'rgba(245,158,11,0.3)' }}>
          <EmptyState>
            No flats / units defined on this floor yet.
          </EmptyState>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, paddingBottom: 22 }}>
            <PrimaryButton onClick={() => { setShowGenerate(true); setShowAdd(false); }}>Auto-generate flats</PrimaryButton>
            <GhostButton onClick={() => { setShowAdd(true); setShowGenerate(false); }}>+ Add Flat manually</GhostButton>
          </div>
        </Panel>
      )}

      {!loading && !error && !noFlats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((r, idx) => {
            const assigned = !!r.row.unit_ulpin;
            return (
              <Panel key={r.row.id} style={{ padding: '14px 18px' }}>
                {r.editing ? (
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div>
                      <FieldLabel>Unit number</FieldLabel>
                      <InlineInput value={r.editUnitNumber} onChange={(v) => setRows((prev) => {
                        const next = [...prev]; next[idx] = { ...next[idx], editUnitNumber: v }; return next;
                      })} width={90} />
                    </div>
                    <div>
                      <FieldLabel>Unit type</FieldLabel>
                      <InlineSelect value={r.editUnitType} onChange={(v) => setRows((prev) => {
                        const next = [...prev]; next[idx] = { ...next[idx], editUnitType: v }; return next;
                      })} options={UNIT_TYPE_OPTIONS} />
                    </div>
                    <div>
                      <FieldLabel>Area (m²)</FieldLabel>
                      <InlineInput value={r.editArea} onChange={(v) => setRows((prev) => {
                        const next = [...prev]; next[idx] = { ...next[idx], editArea: v }; return next;
                      })} type="number" width={90} />
                    </div>
                    <div>
                      <FieldLabel>Owner name</FieldLabel>
                      <InlineInput value={r.editOwner} onChange={(v) => setRows((prev) => {
                        const next = [...prev]; next[idx] = { ...next[idx], editOwner: v }; return next;
                      })} width={160} />
                    </div>
                    <PrimaryButton onClick={() => saveEdit(idx)}>Save</PrimaryButton>
                    <GhostButton onClick={() => cancelEdit(idx)}>Cancel</GhostButton>
                    {r.editError && <InlineError style={{ width: '100%' }}>{r.editError}</InlineError>}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>Unit {r.row.unit_number}</span>
                        <Badge variant="neutral">{r.row.unit_type}</Badge>
                        {r.row.area_sqm != null && (
                          <span style={{ fontSize: 11, color: '#64748b' }}>{r.row.area_sqm} m²</span>
                        )}
                        {r.row.owner_name && (
                          <span style={{ fontSize: 11, color: '#64748b' }}>Owner: {r.row.owner_name}</span>
                        )}
                        <Badge variant={assigned ? 'success' : 'warning'} dot={assigned ? '#34d399' : '#fbbf24'}>
                          {assigned ? 'Assigned' : 'Not assigned'}
                        </Badge>
                      </div>
                      {assigned && (
                        <div style={{ marginTop: 6 }}>
                          <UlpinCode code={r.row.unit_ulpin!} />
                        </div>
                      )}
                      {r.assignMessage && (
                        <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: r.assignState === 'rejected' ? '#fca5a5' : '#6ee7b7' }}>
                          {r.assignMessage}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <AccentGhostButton
                        id={`assign-flat-ulpin-${r.row.id}`}
                        onClick={() => assignUlpin(idx)}
                        busy={r.assignState === 'busy'}
                        disabled={assigned}
                        style={{ fontSize: 11.5, padding: '6px 12px' }}
                      >
                        {assigned ? 'ULPIN assigned' : 'Assign ULPIN'}
                      </AccentGhostButton>
                      <IconButton title="Edit flat" onClick={() => startEdit(idx)}>✎</IconButton>
                      <DangerButton id={`delete-flat-${r.row.id}`} onClick={() => deleteFlat(idx)} busy={r.deleteBusy} title="Delete flat" style={{ padding: '6px 12px' }}>
                        ✕
                      </DangerButton>
                    </div>
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}