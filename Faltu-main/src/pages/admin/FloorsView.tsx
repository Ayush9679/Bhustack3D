import { useEffect, useState } from 'react';
import {
  api,
  AdminParcelRow,
  FeatureDetailResponse,
  FloorResponse,
  FloorCreateRequest,
  FloorUpdateRequest,
  FloorGenerateRequest,
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
  InlineError,
  UlpinCode,
  LoadingBlock,
  EmptyState,
  Breadcrumbs,
  FieldLabel,
} from './ui';
import { DRILL_CONTAINER } from './types';
import type { OnSelectFloor } from './types';

interface FloorRowState {
  row: FloorResponse;
  assignState: 'idle' | 'busy' | 'assigned';
  assignMessage: string | null;
  editing: boolean;
  editNumber: string;
  editLabel: string;
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

export default function FloorsView({
  token,
  parcel,
  feature,
  onBack,
  onSelectFloor,
}: {
  token: string;
  parcel: AdminParcelRow;
  feature: FeatureDetailResponse;
  onBack: () => void;
  onSelectFloor: OnSelectFloor;
}) {
  const [rows, setRows] = useState<FloorRowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate panel
  const [showGenerate, setShowGenerate] = useState(false);
  const [genAbove, setGenAbove] = useState('');
  const [genBasement, setGenBasement] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Manual add panel
  const [showAdd, setShowAdd] = useState(false);
  const [addNumber, setAddNumber] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.getBuildingFloors(token, parcel.id, feature.id)
      .then((floors) => {
        if (!mounted) return;
        setRows(floors.map((row) => ({
          row,
          assignState: 'idle',
          assignMessage: null,
          editing: false,
          editNumber: String(row.floor_number),
          editLabel: row.floor_label,
          editError: null,
          deleteBusy: false,
        })));
        setError(null);
      })
      .catch((e) => { if (mounted) setError(e.message || 'Failed to load floors'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [token, parcel.id, feature.id]);

  const startGenerate = () => {
    setShowGenerate((v) => !v);
    setShowAdd(false);
    setGenError(null);
  };

  const runGenerate = async () => {
    const floorCount = parseInt(genAbove, 10);
    const basementCount = parseInt(genBasement, 10) || 0;
    if (!Number.isInteger(floorCount) || floorCount < 1) {
      setGenError('Number of floors above ground must be at least 1.');
      return;
    }
    setGenBusy(true);
    setGenError(null);
    const body: FloorGenerateRequest = { floor_count: floorCount, basement_count: basementCount };
    try {
      const floors = await api.generateBuildingFloors(token, parcel.id, feature.id, body);
      setRows(floors.map((row) => ({
        row,
        assignState: 'idle',
        assignMessage: null,
        editing: false,
        editNumber: String(row.floor_number),
        editLabel: row.floor_label,
        editError: null,
        deleteBusy: false,
      })));
      setShowGenerate(false);
      setGenAbove('');
      setGenBasement('');
    } catch (e) {
      setGenError((e as Error).message || 'Failed to generate floors.');
    } finally {
      setGenBusy(false);
    }
  };

  const startAdd = () => {
    setShowAdd((v) => !v);
    setShowGenerate(false);
    setAddError(null);
  };

  const runAdd = async () => {
    const floorNumber = parseInt(addNumber, 10);
    if (isNaN(floorNumber)) {
      setAddError('Floor number must be an integer (negative = basement, 0 = ground).');
      return;
    }
    setAddBusy(true);
    setAddError(null);
    const body: FloorCreateRequest = { floor_number: floorNumber, floor_label: addLabel.trim() || null };
    try {
      const created = await api.createSingleFloor(token, parcel.id, feature.id, body);
      setRows((prev) => {
        const next = [...prev, {
          row: created,
          assignState: 'idle' as const,
          assignMessage: null,
          editing: false,
          editNumber: String(created.floor_number),
          editLabel: created.floor_label,
          editError: null,
          deleteBusy: false,
        }];
        return next.sort((a, b) => b.row.floor_number - a.row.floor_number);
      });
      setShowAdd(false);
      setAddNumber('');
      setAddLabel('');
    } catch (e) {
      setAddError((e as Error).message || 'Failed to add floor.');
    } finally {
      setAddBusy(false);
    }
  };

  const assignUlpin = async (idx: number) => {
    const floorId = rows[idx].row.id;
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], assignState: 'busy', assignMessage: null };
      return next;
    });
    try {
      const res = await api.assignFloorUlpin(token, floorId);
      setRows((prev) => {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          row: { ...next[idx].row, floor_ulpin: res.ulpin_3d, floor_label: next[idx].row.floor_label },
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
          assignState: 'idle',
          assignMessage: `✗ ${(e as Error).message || 'Failed to assign ULPIN.'}`,
        };
        return next;
      });
    }
  };

  const startEdit = (idx: number) => {
    const r = rows[idx];
    setRows((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        editing: true,
        editNumber: String(r.row.floor_number),
        editLabel: r.row.floor_label,
        editError: null,
      };
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
    const body: FloorUpdateRequest = {};
    const newNumber = parseInt(r.editNumber, 10);
    if (!isNaN(newNumber)) body.floor_number = newNumber;
    if (r.editLabel.trim()) body.floor_label = r.editLabel.trim();
    else body.floor_label = null;
    try {
      const updated = await api.updateFloor(token, r.row.id, body);
      setRows((prev) => {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          row: { ...updated, flats: r.row.flats, flat_count: r.row.flat_count },
          editing: false,
          editError: null,
        };
        return next;
      });
    } catch (e) {
      setRows((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], editError: (e as Error).message || 'Failed to save floor.' };
        return next;
      });
    }
  };

  const deleteFloor = async (idx: number) => {
    const r = rows[idx];
    if (!window.confirm(`Delete "${r.row.floor_label}" (floor ${r.row.floor_number}) and all its flats?`)) return;
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], deleteBusy: true };
      return next;
    });
    try {
      await api.deleteFloor(token, r.row.id);
      setRows((prev) => prev.filter((_, i) => i !== idx));
    } catch (e) {
      setRows((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], deleteBusy: false, assignMessage: `✗ ${(e as Error).message || 'Delete failed.'}` };
        return next;
      });
    }
  };

  const noFloors = rows.length === 0;

  return (
    <div style={DRILL_CONTAINER}>
      <Breadcrumbs
        segments={[
          { label: 'Parcels', onClick: () => onBack(), },
          { label: parcelShortName(parcel), onClick: () => onBack() },
          { label: buildingShortName(feature), active: true },
        ]}
      />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.5px' }}>
            Floor Management
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: '6px 0 0' }}>
            {buildingShortName(feature)} · {rows.length} floor{rows.length === 1 ? '' : 's'} defined
          </p>
        </div>
        <GhostButton onClick={onBack}>← Back to buildings</GhostButton>
      </div>

      {!noFloors && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <AccentGhostButton id="toggle-auto-generate" onClick={startGenerate}>
            {showGenerate ? 'Hide auto-generate' : 'Auto-generate floors'}
          </AccentGhostButton>
          <GhostButton id="toggle-add-floor" onClick={startAdd}>
            {showAdd ? 'Hide add floor' : '+ Add Floor'}
          </GhostButton>
        </div>
      )}

      {showGenerate && (
        <Panel style={{ padding: '18px 20px', marginBottom: 18, borderColor: 'rgba(56,189,248,0.3)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>Generate floor rows</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <FieldLabel>Floors above ground</FieldLabel>
              <InlineInput id="gen-floor-count" value={genAbove} onChange={setGenAbove} type="number" placeholder="e.g. 12" width={120} />
            </div>
            <div>
              <FieldLabel>Basement levels (default 0)</FieldLabel>
              <InlineInput id="gen-basement-count" value={genBasement} onChange={setGenBasement} type="number" placeholder="0" width={120} />
            </div>
            <PrimaryButton id="generate-floors-btn" onClick={runGenerate} busy={genBusy}>Generate Floors</PrimaryButton>
          </div>
          {genError && <InlineError style={{ marginTop: 12 }}>{genError}</InlineError>}
          <div style={{ fontSize: 11, color: '#475569', marginTop: 12 }}>
            Creates rows with default labels (Floor 1…, Basement 1…). ULPINs are never auto-assigned — use the
            “Assign ULPIN” button per floor afterward.
          </div>
        </Panel>
      )}

      {showAdd && (
        <Panel style={{ padding: '18px 20px', marginBottom: 18, borderColor: 'rgba(56,189,248,0.3)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>Add a single floor</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <FieldLabel>Floor number</FieldLabel>
              <InlineInput id="add-floor-number"
                value={addNumber} onChange={setAddNumber} type="number"
                placeholder="-1 / 0 / 1" width={110} />
            </div>
            <div>
              <FieldLabel>Floor label (optional)</FieldLabel>
              <InlineInput id="add-floor-label"
                value={addLabel} onChange={setAddLabel}
                placeholder="e.g. 3rd Basement" width={180} />
            </div>
            <PrimaryButton id="add-floor-btn" onClick={runAdd} busy={addBusy}>Add Floor</PrimaryButton>
          </div>
          {addError && <InlineError style={{ marginTop: 12 }}>{addError}</InlineError>}
        </Panel>
      )}

      {loading && <LoadingBlock label="Loading floors…" />}

      {!loading && error && <InlineError>{error}</InlineError>}

      {!loading && !error && noFloors && (
        <Panel style={{ borderColor: 'rgba(245,158,11,0.3)' }}>
          <EmptyState>
            No floors defined for this building yet.
          </EmptyState>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, paddingBottom: 22 }}>
            <PrimaryButton onClick={() => { setShowGenerate(true); setShowAdd(false); }}>Auto-generate floors</PrimaryButton>
            <GhostButton onClick={() => { setShowAdd(true); setShowGenerate(false); }}>+ Add Floor manually</GhostButton>
          </div>
        </Panel>
      )}

      {!loading && !error && !noFloors && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((r, idx) => {
            const assigned = !!r.row.floor_ulpin;
            const floorType =
              r.row.floor_number < 0 ? 'Basement' : r.row.floor_number === 0 ? 'Ground' : 'Above ground';
            return (
              <Panel key={r.row.id} style={{ padding: '14px 18px' }}>
                {r.editing ? (
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div>
                      <FieldLabel>Floor number</FieldLabel>
                      <InlineInput value={r.editNumber} onChange={(v) => setRows((prev) => {
                        const next = [...prev]; next[idx] = { ...next[idx], editNumber: v }; return next;
                      })} type="number" width={110} />
                    </div>
                    <div>
                      <FieldLabel>Floor label</FieldLabel>
                      <InlineInput value={r.editLabel} onChange={(v) => setRows((prev) => {
                        const next = [...prev]; next[idx] = { ...next[idx], editLabel: v }; return next;
                      })} width={200} />
                    </div>
                    <PrimaryButton onClick={() => saveEdit(idx)}>Save</PrimaryButton>
                    <GhostButton onClick={() => cancelEdit(idx)}>Cancel</GhostButton>
                    {r.editError && <InlineError style={{ width: '100%' }}>{r.editError}</InlineError>}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{r.row.floor_label}</span>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#38bdf8', background: 'rgba(56,189,248,0.1)', borderRadius: 5, padding: '2px 7px' }}>
                          L{r.row.floor_number}
                        </span>
                        <Badge variant={assigned ? 'success' : 'warning'} dot={assigned ? '#34d399' : '#fbbf24'}>
                          {assigned ? 'Assigned' : 'Not assigned'}
                        </Badge>
                        <span style={{ fontSize: 11, color: '#64748b' }}>{floorType}</span>
                      </div>
                      {assigned && (
                        <div style={{ marginTop: 6 }}>
                          <UlpinCode code={r.row.floor_ulpin!} />
                        </div>
                      )}
                      {r.assignMessage && (
                        <div style={{ marginTop: 8, fontSize: 12, color: r.assignState === 'assigned' ? '#6ee7b7' : '#fca5a5' }}>
                          {r.assignMessage}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <AccentGhostButton
                        id={`assign-floor-ulpin-${r.row.id}`}
                        onClick={() => assignUlpin(idx)}
                        busy={r.assignState === 'busy'}
                        disabled={assigned}
                        style={{ fontSize: 11.5, padding: '6px 12px' }}
                      >
                        {assigned ? 'ULPIN assigned' : 'Assign ULPIN'}
                      </AccentGhostButton>
                      <IconButton title="Edit floor" onClick={() => startEdit(idx)}>✎</IconButton>
                      <AccentGhostButton id={`manage-flats-${r.row.id}`} onClick={() => onSelectFloor(r.row)} style={{ fontSize: 11.5, padding: '6px 12px' }}>
                        Manage Flats →
                      </AccentGhostButton>
                      <DangerButton
                        id={`delete-floor-${r.row.id}`}
                        onClick={() => deleteFloor(idx)}
                        busy={r.deleteBusy}
                        title="Delete floor"
                        style={{ padding: '6px 12px' }}
                      >
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