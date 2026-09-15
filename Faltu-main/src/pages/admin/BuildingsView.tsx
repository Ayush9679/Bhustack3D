import { useEffect, useState } from 'react';
import {
  api,
  FeatureDetailResponse,
  FeatureUpdateRequest,
  AdminParcelRow,
} from '../../services/api';
import {
  Badge,
  Panel,
  PrimaryButton,
  GhostButton,
  AccentGhostButton,
  IconButton,
  InlineInput,
  TextAreaInput,
  InlineError,
  UlpinCode,
  LoadingBlock,
  EmptyState,
  Breadcrumbs,
  FieldLabel,
} from './ui';
import { DRILL_CONTAINER, OnSelectFeature } from './types';

function parcelShortName(p: AdminParcelRow): string {
  const name = p.name ?? '';
  const trimmed = name.split(',')[0].trim();
  return trimmed && trimmed.length > 0 ? trimmed : `Parcel #${p.id}`;
}

function formatArea(m2: number | null): string {
  if (m2 == null) return '—';
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(2)} ha`;
  return `${m2.toLocaleString('en-IN', { maximumFractionDigits: 0 })} m²`;
}

export default function BuildingsView({
  token,
  parcel,
  onBack,
  onSelectFeature,
}: {
  token: string;
  parcel: AdminParcelRow;
  onBack: () => void;
  onSelectFeature: OnSelectFeature;
}) {
  const [features, setFeatures] = useState<FeatureDetailResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.getParcelFeatures(token, parcel.id)
      .then((rows) => { if (mounted) { setFeatures(rows); setError(null); } })
      .catch((e) => { if (mounted) setError(e.message || 'Failed to load buildings'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [token, parcel.id]);

  const startEdit = (f: FeatureDetailResponse) => {
    setEditingId(f.id);
    setEditName(f.feature_name ?? '');
    setEditHeight(f.height != null ? String(f.height) : '');
    setEditNotes(f.notes ?? '');
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const saveEdit = async (featureId: number) => {
    setSavingId(featureId);
    setEditError(null);
    const body: FeatureUpdateRequest = {};
    if (editName.trim()) body.name = editName.trim();
    else body.name = null;
    if (editHeight.trim() !== '' && parseFloat(editHeight) > 0) body.height = parseFloat(editHeight);
    body.notes = editNotes;

    try {
      const updated = await api.updateFeature(token, parcel.id, featureId, body);
      setFeatures((prev) => prev.map((f) => (f.id === featureId ? updated : f)));
      setEditingId(null);
    } catch (e) {
      setEditError((e as Error).message || 'Failed to save building. Please try again.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div style={DRILL_CONTAINER}>
      <Breadcrumbs
        segments={[
          { label: 'Parcels', onClick: onBack },
          { label: parcelShortName(parcel), active: true },
        ]}
      />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.5px' }}>
            Buildings in {parcelShortName(parcel)}
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: '6px 0 0' }}>
            {features.length} digitized building{features.length === 1 ? '' : 's'} · pick a building to manage its floors and units.
          </p>
        </div>
        <GhostButton onClick={onBack}>← Back to parcels</GhostButton>
      </div>

      {loading && <LoadingBlock label="Loading building footprints…" />}

      {!loading && error && (
        <InlineError>{error}</InlineError>
      )}

      {!loading && !error && features.length === 0 && (
        <Panel><EmptyState>No buildings found for this parcel.</EmptyState></Panel>
      )}

      {!loading && !error && features.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {features.map((f) => {
            const editing = editingId === f.id;
            const floorsDefined = f.defined_floor_count;
            return (
              <Panel key={f.id} style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {editing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <FieldLabel>Building name / label</FieldLabel>
                      <InlineInput value={editName} onChange={setEditName} placeholder="e.g. Expo Mart Tower A" style={{ width: '100%' }} />
                    </div>
                    <div>
                      <FieldLabel>Height (m)</FieldLabel>
                      <InlineInput value={editHeight} onChange={setEditHeight} placeholder="e.g. 36" type="number" width={110} />
                    </div>
                    <div>
                      <FieldLabel>Notes</FieldLabel>
                      <TextAreaInput value={editNotes} onChange={setEditNotes} placeholder="Surveyor notes…" rows={2} />
                    </div>
                    {editError && <InlineError>{editError}</InlineError>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <PrimaryButton onClick={() => saveEdit(f.id)} busy={savingId === f.id}>Save</PrimaryButton>
                      <GhostButton onClick={cancelEdit}>Cancel</GhostButton>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
                          {f.feature_name ?? <em style={{ color: '#64748b', fontWeight: 400 }}>Unnamed building</em>}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', marginTop: 2 }}>
                          fid #{f.fid ?? f.id}
                        </div>
                      </div>
                      <IconButton accent title="Edit building" onClick={() => startEdit(f)}>
                        ✎ Edit
                      </IconButton>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <UlpinCode code={f.ulpin_3d} />
                      {f.building_type && f.building_type !== 'yes' && f.building_type !== '' && (
                        <Badge variant="muted">{f.building_type}</Badge>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#94a3b8' }}>
                      <span>Height: <strong style={{ color: '#e2e8f0' }}>{f.height != null ? `${f.height} m` : '—'}</strong></span>
                      <span>Area: <strong style={{ color: '#e2e8f0' }}>{formatArea(f.area)}</strong></span>
                    </div>

                    <Badge
                      variant={floorsDefined > 0 ? 'success' : 'warning'}
                      dot={floorsDefined > 0 ? '#34d399' : '#fbbf24'}
                    >
                      {floorsDefined > 0 ? `${floorsDefined} floor${floorsDefined === 1 ? '' : 's'} defined` : 'No floors defined'}
                    </Badge>
                  </>
                )}

                {!editing && (
                  <div style={{ marginTop: 'auto', display: 'flex', gap: 8, paddingTop: 4 }}>
                    <AccentGhostButton
                      id={`manage-floors-${f.id}`}
                      onClick={() => onSelectFeature(f)}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      Manage Floors →
                    </AccentGhostButton>
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