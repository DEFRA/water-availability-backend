-- PostGIS schema design & data dictionary for environment.data.gov.uk (DDSP)-sourced entities
--
-- Scope: Catchment Planning API (WaterBody / OperationalCatchment / ManagementCatchment),
-- Water Resource Availability WFS (HOF/Q95 restriction polygons), Hydrology API (flow readings),
-- CAMS Assessment Points (assessment_points / assessment_point_waterbodies), plus HoF bands (see
-- hof_bands table note - stub-data-fed for now, not yet DSP-sourced). Out of scope for this
-- ticket: ArcGIS abstraction licences. Groundwater is ON HOLD - a water_type column is included
-- for future use but only 'surface' is populated for now.
--
-- SRID decision: all geometry is stored as EPSG:4326 (WGS84). Native source CRS is recorded per
-- row via source_srid only on tables where a transform is needed (water_availability_polygons,
-- assessment_points); other tables' source data is already WGS84 and does not carry that column.
-- Catchment Planning GeoJSON and Hydrology station coordinates are WGS84 (live-
-- confirmed). The live Water Availability WFS returns EPSG:27700 (live-confirmed), so the
-- aggregator must transform that geometry to EPSG:4326 before persistence
-- (ST_Transform(ST_SetSRID(geom, 27700), 4326)). Runtime distance/area calculations should cast
-- to `geography` (e.g. `geom::geography`).
--
-- Field names below have been cross-checked against live DDSP API/WFS responses (2026-09-10) -
-- see schema/data-dictionary.md for the full source-field mapping and per-table review notes.
--
-- This is a design reference, not a runnable migration. Versioned migrations exist under
-- migrations/ (see 202609080001-create-assessment-point-tables.js for the AP tables below).

CREATE EXTENSION IF NOT EXISTS postgis;

-- Audit trail for every aggregator ingestion run, one row per source per run.
-- Source field values: 'catchment-planning-api' | 'water-availability-wfs' | 'hydrology-api' |
-- 'cams-assessment-points'.
CREATE TABLE IF NOT EXISTS ingestion_batch (
  id SERIAL PRIMARY KEY,
  source_name VARCHAR(100) NOT NULL,
  source_version VARCHAR(100),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  row_count INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  CONSTRAINT chk_ingestion_batch_status CHECK (status IN ('running', 'succeeded', 'failed'))
);

-- Management catchments: Catchment Planning API `/ManagementCatchment/{id}.geojson`.
-- The endpoint returns constituent waterbody Catchment/RiverLine features, not a dedicated
-- management-catchment feature. Its boundary is derived by unioning its Catchment polygons.
-- water_type distinguishes surface vs groundwater catchments once the source field is confirmed.
-- Groundwater ingestion is ON HOLD (source/shape not yet understood) - 'surface' is the only
-- populated value for now; do not build groundwater-specific tables until that is resolved.
CREATE TABLE IF NOT EXISTS management_catchments (
  id SERIAL PRIMARY KEY,
  management_catchment_id VARCHAR(100) UNIQUE NOT NULL, -- identifier from requested resource URL
  name VARCHAR(255), -- no machine-readable name exposed by the GeoJSON endpoint
  water_type VARCHAR(20) NOT NULL DEFAULT 'surface', -- 'surface' | 'groundwater' (groundwater on hold)
  river_basin_district VARCHAR(255),
  geom GEOMETRY(Geometry, 4326) NOT NULL, -- derived union of constituent Catchment polygons
  properties JSONB, -- raw source feature properties, retained for fields not yet promoted to columns
  ingestion_batch_id INTEGER REFERENCES ingestion_batch(id),
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_management_catchments_water_type CHECK (water_type IN ('surface', 'groundwater'))
);

CREATE INDEX IF NOT EXISTS idx_management_catchments_geom
  ON management_catchments USING GIST (geom);

-- Operational catchments: Catchment Planning API `/OperationalCatchment/{id}.geojson`.
-- The endpoint returns constituent waterbody Catchment/RiverLine features, not a dedicated
-- operational-catchment feature. Its boundary is derived by unioning its Catchment polygons.
CREATE TABLE IF NOT EXISTS operational_catchments (
  id SERIAL PRIMARY KEY,
  operational_catchment_id VARCHAR(100) UNIQUE NOT NULL, -- identifier from requested resource URL
  name VARCHAR(255), -- no machine-readable name exposed by the GeoJSON endpoint
  management_catchment_id INTEGER REFERENCES management_catchments(id),
  geom GEOMETRY(Geometry, 4326) NOT NULL, -- derived union of constituent Catchment polygons
  properties JSONB,
  ingestion_batch_id INTEGER REFERENCES ingestion_batch(id),
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operational_catchments_geom
  ON operational_catchments USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_operational_catchments_mgmt
  ON operational_catchments (management_catchment_id);

-- Waterbodies: Catchment Planning API `/WaterBody/{id}.geojson`.
-- water_type: 'surface' | 'groundwater' (groundwater on hold, see management_catchments note).
CREATE TABLE IF NOT EXISTS waterbody_features (
  id SERIAL PRIMARY KEY,
  waterbody_id VARCHAR(100) UNIQUE NOT NULL, -- source {WaterBody} identifier (ea_wb_id elsewhere)
  name VARCHAR(255),
  water_body_type VARCHAR(50),
  water_type VARCHAR(20) NOT NULL DEFAULT 'surface',
  operational_catchment_id INTEGER REFERENCES operational_catchments(id),
  geom GEOMETRY(Geometry, 4326) NOT NULL,
  properties JSONB,
  ingestion_batch_id INTEGER REFERENCES ingestion_batch(id),
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_waterbody_features_water_type CHECK (water_type IN ('surface', 'groundwater'))
);

CREATE INDEX IF NOT EXISTS idx_waterbody_features_geom
  ON waterbody_features USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_waterbody_features_op_catchment
  ON waterbody_features (operational_catchment_id);

-- Water resource availability / HOF restriction polygons (WFS).
-- Columns camscdsq{30,50,70,95} and resavail carry the CAMS classification/restriction fields
-- as published by the WFS layer; kept as flat columns (not just JSONB) because they are queried
-- directly by the availability lookup, matching the PoC's water_availability_polygons table.
-- Live-confirmed (2026-09-10): camscdsq* are colour words (e.g. 'Green'/'Yellow'), resavail is
-- free text (e.g. 'at least 70%'), and the live feature sample did not include shape_area (only
-- shape_leng) - kept nullable here since its presence is not guaranteed on every feature. Live
-- feature also includes a `country` field, not yet promoted to a column - retained in `properties`.
CREATE TABLE IF NOT EXISTS water_availability_polygons (
  id SERIAL PRIMARY KEY,
  ea_wb_id VARCHAR(255) UNIQUE NOT NULL, -- links to waterbody_features.waterbody_id
  camscdsq30 VARCHAR(255),
  camscdsq50 VARCHAR(255),
  camscdsq70 VARCHAR(255),
  camscdsq95 VARCHAR(255),
  resavail VARCHAR(255),
  shape_area DOUBLE PRECISION, -- nullable: not present on every live feature, see note above
  shape_leng DOUBLE PRECISION,
  geom GEOMETRY(Geometry, 4326) NOT NULL,
  source_srid INTEGER NOT NULL DEFAULT 27700,
  properties JSONB,
  ingestion_batch_id INTEGER REFERENCES ingestion_batch(id),
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_water_availability_polygons_geom
  ON water_availability_polygons USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_water_availability_polygons_wb_id
  ON water_availability_polygons (ea_wb_id);

-- Hydrology API monitoring stations. Station coordinates are returned as WGS84 lat/long;
-- easting/northing are retained because they are also supplied by the API.
CREATE TABLE IF NOT EXISTS hydrology_stations (
  id SERIAL PRIMARY KEY,
  station_id VARCHAR(100) UNIQUE NOT NULL, -- API SUID/stationGuid
  wiski_id VARCHAR(100),
  nrfa_station_id VARCHAR(100),
  name VARCHAR(255),
  easting INTEGER,
  northing INTEGER,
  geom GEOMETRY(Point, 4326) NOT NULL,
  properties JSONB,
  ingestion_batch_id INTEGER REFERENCES ingestion_batch(id),
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hydrology_stations_geom
  ON hydrology_stations USING GIST (geom);

-- Hydrology API measurement time series. A station can expose multiple measures for different
-- parameters, periods, statistics and units.
CREATE TABLE IF NOT EXISTS hydrology_measures (
  id SERIAL PRIMARY KEY,
  measure_id VARCHAR(255) UNIQUE NOT NULL,
  station_id INTEGER NOT NULL REFERENCES hydrology_stations(id),
  parameter_name VARCHAR(100) NOT NULL, -- e.g. Flow
  period_name VARCHAR(100), -- e.g. daily, 15min
  value_type VARCHAR(100), -- e.g. mean, min, max, instantaneous
  unit_name VARCHAR(50), -- e.g. m3/s
  observation_type VARCHAR(50), -- Measured or Qualified
  properties JSONB,
  ingestion_batch_id INTEGER REFERENCES ingestion_batch(id),
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hydrology_measures_station
  ON hydrology_measures (station_id);

-- Hydrology API readings, incrementally refreshed. Quality and completeness are retained because
-- qualified readings can omit values or identify estimated/suspect/missing observations.
CREATE TABLE IF NOT EXISTS hydrology_readings (
  id BIGSERIAL PRIMARY KEY,
  measure_id INTEGER NOT NULL REFERENCES hydrology_measures(id) ON DELETE CASCADE,
  reading_datetime TIMESTAMPTZ NOT NULL,
  value NUMERIC(14, 4),
  quality VARCHAR(50),
  completeness VARCHAR(50),
  qflag VARCHAR(100),
  ingestion_batch_id INTEGER REFERENCES ingestion_batch(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (measure_id, reading_datetime),
  CONSTRAINT chk_hydrology_readings_quality CHECK (quality IS NULL OR quality IN ('Good', 'Estimated', 'Suspect', 'Unchecked', 'Missing')),
  CONSTRAINT chk_hydrology_readings_completeness CHECK (completeness IS NULL OR completeness IN ('Complete', 'Incomplete'))
);

CREATE INDEX IF NOT EXISTS idx_hydrology_readings_measure_time
  ON hydrology_readings (measure_id, reading_datetime);

-- CAMS assessment points: EA DSP OGC Features collection
-- `ea_catchment_abstraction_management_strategy_assessment_points`. Source geometry is WGS84
-- Point, so source_srid defaults to 4326 (no transform needed, unlike the WFS availability
-- polygons above). `codes` retains source identifiers (e.g. ea_wb_id label, camsledger) that are
-- not a reliable waterbody FK - see assessment_point_waterbodies for the validated mapping.
CREATE TABLE IF NOT EXISTS assessment_points (
  id SERIAL PRIMARY KEY,
  assessment_point_id VARCHAR(100) UNIQUE NOT NULL, -- source feature id
  name VARCHAR(255),
  codes JSONB,
  source_srid INTEGER NOT NULL DEFAULT 4326,
  geom GEOMETRY(Point, 4326) NOT NULL,
  operational_catchment_id INTEGER REFERENCES operational_catchments(id),
  properties JSONB,
  ingestion_batch_id INTEGER REFERENCES ingestion_batch(id),
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_points_geom
  ON assessment_points USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_assessment_points_op_catchment
  ON assessment_points (operational_catchment_id);

-- Bridge table for the validated many-to-many assessment-point-to-waterbody relationship (one AP
-- can span multiple waterbodies and vice versa - see assessment-point-validation.js). Rows are
-- only written once a mapping has passed validation; mapping_source records how the link was
-- derived (e.g. 'spatial') and validation_status tracks the check outcome.
CREATE TABLE IF NOT EXISTS assessment_point_waterbodies (
  id SERIAL PRIMARY KEY,
  assessment_point_id INTEGER NOT NULL REFERENCES assessment_points(id) ON DELETE CASCADE,
  waterbody_id VARCHAR(100) NOT NULL REFERENCES waterbody_features(waterbody_id),
  mapping_source VARCHAR(50) NOT NULL DEFAULT 'spatial',
  validation_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  properties JSONB,
  ingestion_batch_id INTEGER REFERENCES ingestion_batch(id),
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assessment_point_id, waterbody_id),
  CONSTRAINT chk_apw_validation_status CHECK (validation_status IN ('pending', 'valid', 'invalid'))
);

CREATE INDEX IF NOT EXISTS idx_assessment_point_waterbodies_ap
  ON assessment_point_waterbodies (assessment_point_id);

CREATE INDEX IF NOT EXISTS idx_assessment_point_waterbodies_wb
  ON assessment_point_waterbodies (waterbody_id);

-- Relationships (Mermaid ER notation):
-- erDiagram
--   ingestion_batch ||--o{ management_catchments : sources
--   ingestion_batch ||--o{ operational_catchments : sources
--   ingestion_batch ||--o{ waterbody_features : sources
--   ingestion_batch ||--o{ water_availability_polygons : sources
--   ingestion_batch ||--o{ hydrology_stations : sources
--   ingestion_batch ||--o{ hydrology_measures : sources
--   ingestion_batch ||--o{ hydrology_readings : sources
--   ingestion_batch ||--o{ hof_bands : sources
--   ingestion_batch ||--o{ assessment_points : sources
--   ingestion_batch ||--o{ assessment_point_waterbodies : sources
--   management_catchments ||--o{ operational_catchments : contains
--   operational_catchments ||--o{ waterbody_features : contains
--   operational_catchments ||--o{ assessment_points : contains
--   waterbody_features ||--o{ hof_bands : has
--   waterbody_features ||--o{ assessment_point_waterbodies : mapped_from
--   assessment_points ||--o{ assessment_point_waterbodies : mapped_to
--   hydrology_stations ||--o{ hydrology_measures : exposes
--   hydrology_measures ||--o{ hydrology_readings : contains

-- Hands-off Flow bands/restrictions.
-- NOT currently DSP-sourced: HoF data today lives only in the RAM Ledger. A change request has
-- been raised to get it ingested into WR GIS and published onward to DSP; until that lands, the
-- aggregator has no source to pull this from. ingestion_batch_id is nullable for this reason -
-- rows will be loaded from a stub/seed dataset for dev, test and private beta, not from a live
-- aggregator run. Revisit nullability once the DSP publication path exists.
CREATE TABLE IF NOT EXISTS hof_bands (
  id SERIAL PRIMARY KEY,
  waterbody_id VARCHAR(100) NOT NULL REFERENCES waterbody_features(waterbody_id),
  band VARCHAR(50) NOT NULL,
  threshold_ml_per_day NUMERIC(12, 3),
  effective_from DATE,
  effective_to DATE,
  ingestion_batch_id INTEGER REFERENCES ingestion_batch(id), -- NULL when loaded from stub/seed data
  is_stub_data BOOLEAN NOT NULL DEFAULT TRUE, -- true while sourced from seed fixtures, not DSP
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hof_bands_waterbody
  ON hof_bands (waterbody_id);
