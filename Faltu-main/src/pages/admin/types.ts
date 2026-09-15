import type { CSSProperties } from 'react';
import type { AdminParcelRow, FeatureDetailResponse, FloorResponse } from '../../services/api';

/**
 * Drill-down navigation state for the surveyor / admin dashboard.
 *
 * LEVEL 1 — Parcel list            (nothing selected)
 * LEVEL 2 — Building / Feature list (parcel selected)
 * LEVEL 3 — Floor management        (parcel + building selected)
 * LEVEL 4 — Flat management         (parcel + building + floor selected)
 */
export type AdminRoute =
  | { level: 1 }
  | { level: 2; parcel: AdminParcelRow }
  | { level: 3; parcel: AdminParcelRow; feature: FeatureDetailResponse }
  | { level: 4; parcel: AdminParcelRow; feature: FeatureDetailResponse; floor: FloorResponse };

export type OnSelectFeature = (feature: FeatureDetailResponse) => void;
export type OnSelectFloor = (floor: FloorResponse) => void;

/** Shared container padding for drill-down views. */
export const DRILL_CONTAINER: CSSProperties = {
  padding: '24px 40px 40px',
};