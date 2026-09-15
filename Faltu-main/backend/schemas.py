"""
backend/schemas.py
==================
Pydantic request/response schemas for the Bhustack3D API.

Covers:
  - Auth (UserSignup, UserLogin, UserResponse, TokenResponse, MessageResponse)
  - Location / Parcel legacy (LocationResponse, LocationSearchResult, StrataEnvelope)
  - Layer 4 Parcel schemas (ParcelSchema, ParcelFeatureSchema, AdminParcelRow)
  - Layer 5 ULPIN validation (ULPINValidationResult)
  - Layer 6 confidence + stub schemas (ConfidenceResult, DigiLockerStub, BankKYCStub)
"""

from datetime import datetime
from typing import List, Optional, Any
from pydantic import BaseModel, EmailStr, Field


# ─────────────────────────────────────────────────────────────────────────────
# Auth Schemas (unchanged)
# ─────────────────────────────────────────────────────────────────────────────

class UserSignup(BaseModel):
    name: str = Field(..., min_length=2, max_length=120, description="Full name of user")
    email: EmailStr = Field(..., description="Valid email address")
    password: str = Field(..., min_length=6, max_length=128, description="Password (min 6 characters)")


class UserLogin(BaseModel):
    email: EmailStr = Field(..., description="Registered email address")
    password: str = Field(..., min_length=1, description="Password")


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class MessageResponse(BaseModel):
    detail: str


# ─────────────────────────────────────────────────────────────────────────────
# Location / Parcel Legacy Schemas (unchanged — used by existing Globe/Portal)
# ─────────────────────────────────────────────────────────────────────────────

class StrataEnvelope(BaseModel):
    """A single vertical stratum envelope (air / surface / subsurface)."""
    type: str       # "air" | "surface" | "subsurface"
    label: str      # e.g. "L3 · Air Rights & Helipad Easement (+45m to +95m)"
    range: str      # e.g. "+45m to +95m"


class LocationResponse(BaseModel):
    """
    Full parcel/location record returned by /locations/search and /parcels/{ulpin_id}.
    Matches the LocationData interface already used across the frontend.
    """
    id: str
    name: str
    state: str
    lat: float
    lon: float
    ulpin_3d: str
    classification: str
    area: str
    volume: str
    elevation: str
    zone: str
    description: str
    envelopes: List[StrataEnvelope]
    # Real GeoJSON features for multi-polygon parcels (e.g. Knowledge Park 2)
    geojson_features: Optional[str] = None   # raw JSON string of GeoJSON FeatureCollection
    feature_count: Optional[int] = None      # number of sub-features in the cluster

    class Config:
        from_attributes = True


class LocationSearchResult(BaseModel):
    """Lightweight search result item — omits heavy geojson_features blob."""
    id: str
    name: str
    state: str
    lat: float
    lon: float
    ulpin_3d: str
    classification: str
    area: str
    elevation: str
    feature_count: Optional[int] = None

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────────────────────────
# Layer 4: Parcel & ParcelFeature Schemas
# ─────────────────────────────────────────────────────────────────────────────

class ParcelFeatureSchema(BaseModel):
    """A single building/unit feature record from the parcel_features table."""
    id: int
    parcel_id: int
    fid: Optional[int] = None
    ulpin_3d: str
    geometry_json: str              # GeoJSON geometry as raw JSON string
    height: Optional[float] = None
    area: Optional[float] = None
    floor_level: int
    floor_count: int
    building_type: Optional[str] = None
    feature_name: Optional[str] = None

    class Config:
        from_attributes = True


class ParcelSchema(BaseModel):
    """Full parcel cluster record from the parcels table (Layer 4)."""
    id: int
    ulpin_3d: str
    parent_land_ulpin: Optional[str] = None
    name: Optional[str] = None
    centroid_lat: float
    centroid_lon: float
    total_area: float
    confidence_score: str
    last_verified_date: Optional[datetime] = None
    created_at: datetime
    features: List[ParcelFeatureSchema] = []

    class Config:
        from_attributes = True


class AdminParcelRow(BaseModel):
    """
    Lightweight parcel row for the Admin Dashboard table.
    Returned by GET /admin/parcels — omits heavy geometry fields.
    """
    id: int
    ulpin_3d: str
    name: Optional[str] = None
    centroid_lat: float
    centroid_lon: float
    total_area: float
    confidence_score: str
    last_verified_date: Optional[datetime] = None
    feature_count: int

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────────────────────────
# Layer 5: ULPIN Validation Schema
# ─────────────────────────────────────────────────────────────────────────────

class ULPINValidationResult(BaseModel):
    """
    Response from GET /parcels/{ulpin_id}/validate.
    Demonstrates Layer 5's checksum validation live in the API.
    """
    ulpin: str
    valid: bool
    check_digit_expected: int       # The check digit our algorithm computes
    check_digit_found: int          # The check digit embedded in the submitted ULPIN
    message: str                    # Human-readable verdict


# ─────────────────────────────────────────────────────────────────────────────
# Layer 6: Confidence + Stub Integration Schemas
# ─────────────────────────────────────────────────────────────────────────────

class ConfidenceResult(BaseModel):
    """Response from GET /parcels/{ulpin_id}/confidence."""
    ulpin_3d: str
    confidence_score: str
    last_verified_date: Optional[datetime] = None
    confidence_description: str     # Human-readable explanation of the score tier


class DigiLockerStub(BaseModel):
    """
    ╔══════════════════════════════════════════════════════╗
    ║  MOCK RESPONSE — NOT A REAL DIGILOCKER INTEGRATION  ║
    ║  Returns mock: true — for demo / pitch purposes only ║
    ╚══════════════════════════════════════════════════════╝
    Response from GET /integrations/digilocker/{ulpin_id}.
    In production, this would call the DigiLocker Partner API
    (requires government MeitY partnership agreement, client credentials,
    and citizen consent via OTP flow — not available at hackathon stage).
    """
    mock: bool = True
    ulpin_id: str
    linked_documents: List[dict]
    status: str
    note: str


class BankKYCStub(BaseModel):
    """
    ╔══════════════════════════════════════════════════════╗
    ║  MOCK RESPONSE — NOT A REAL BANK KYC INTEGRATION    ║
    ║  Returns mock: true — for demo / pitch purposes only ║
    ╚══════════════════════════════════════════════════════╝
    Response from GET /integrations/bank-kyc/{ulpin_id}.
    In production, this would call lender APIs (e.g., SBI YONO API,
    HDFC Loan-Against-Property API) using the 3D ULPIN as a property
    identifier — requires bilateral bank API agreements not available
    at hackathon stage.
    """
    mock: bool = True
    ulpin_id: str
    loan_eligibility: str
    estimated_property_value_inr: int
    ltv_ratio_percent: float
    status: str
    note: str


# ─────────────────────────────────────────────────────────────────────────────
# Surveyor Edit & 3D Drill-Down Schemas (Building → Floor → Flat)
# ─────────────────────────────────────────────────────────────────────────────

class FeatureUpdateRequest(BaseModel):
    name: Optional[str] = None
    height: Optional[float] = None
    notes: Optional[str] = None


class FeatureDetailResponse(BaseModel):
    id: int
    parcel_id: int
    fid: Optional[int] = None
    ulpin_3d: str
    height: Optional[float] = None
    area: Optional[float] = None
    floor_level: int
    floor_count: int
    building_type: Optional[str] = None
    feature_name: Optional[str] = None
    notes: Optional[str] = None
    defined_floor_count: int = 0

    class Config:
        from_attributes = True


class FloorGenerateRequest(BaseModel):
    floor_count: int = Field(..., ge=1, le=200, description="Number of floors above ground (1..200)")
    basement_count: int = Field(0, ge=0, le=20, description="Number of basement levels (0..20)")


class FloorCreateRequest(BaseModel):
    floor_number: int = Field(..., description="Floor integer (-N for basement, 0 for ground, positive for above)")
    floor_label: Optional[str] = Field(None, description="e.g. Ground Floor, Floor 1, Basement 1")


class FloorUpdateRequest(BaseModel):
    floor_number: Optional[int] = None
    floor_label: Optional[str] = None


class FlatGenerateRequest(BaseModel):
    flat_count: int = Field(..., ge=1, le=500, description="Number of flats on this floor")
    starting_unit_number: int = Field(1, ge=1, description="Starting sequence index or base unit number")


class FlatCreateRequest(BaseModel):
    unit_number: str = Field(..., min_length=1, max_length=50, description="Unit number e.g. 704 or 101")
    unit_type: Optional[str] = Field("Residential", description="Residential, Commercial, Parking, etc.")
    area_sqm: Optional[float] = None
    owner_name: Optional[str] = None


class FlatUpdateRequest(BaseModel):
    unit_number: Optional[str] = None
    unit_type: Optional[str] = None
    area_sqm: Optional[float] = None
    owner_name: Optional[str] = None


class FlatResponse(BaseModel):
    id: int
    floor_id: int
    unit_number: str
    unit_ulpin: Optional[str] = None
    unit_type: str
    area_sqm: Optional[float] = None
    owner_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FloorResponse(BaseModel):
    id: int
    parcel_feature_id: int
    floor_number: int
    floor_ulpin: Optional[str] = None
    floor_label: str
    created_at: datetime
    updated_at: datetime
    flats: List[FlatResponse] = []
    flat_count: int = 0

    class Config:
        from_attributes = True


class AssignUlpinResponse(BaseModel):
    id: int
    ulpin_3d: str
    status: str = "assigned"
    message: str

