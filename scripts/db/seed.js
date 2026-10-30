import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { createPoolFromEnv, isMainModule } from './pg-pool.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'local-seed-dataset.json')

export function loadFixture() {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
}

function assertSafeToSeed() {
  if (
    process.env.CONFIRM_DB_SEED !== 'true' &&
    process.env.CONFIRM_DB_RESET !== 'true'
  ) {
    throw new Error(
      'Refusing to seed Postgres without confirmation. ' +
        'Re-run with CONFIRM_DB_SEED=true if you really intend to overwrite fixture records.'
    )
  }
}

async function findOrCreateIngestionBatch(pool, { sourceName, sourceVersion }) {
  const existing = await pool.query(
    'SELECT id FROM ingestion_batch WHERE source_name = $1 AND source_version = $2 LIMIT 1',
    [sourceName, sourceVersion]
  )

  if (existing.rows.length > 0) {
    return existing.rows[0].id
  }

  const { rows } = await pool.query(
    `INSERT INTO ingestion_batch (source_name, source_version, status, finished_at, row_count)
     VALUES ($1, $2, 'succeeded', CURRENT_TIMESTAMP, 0)
     RETURNING id`,
    [sourceName, sourceVersion]
  )

  return rows[0].id
}

async function seedManagementCatchment(pool, catchment, ingestionBatchId) {
  const { rows } = await pool.query(
    `INSERT INTO management_catchments
       (management_catchment_id, name, water_type, river_basin_district, geom, ingestion_batch_id)
     VALUES ($1, $2, $3, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326), $6)
     ON CONFLICT (management_catchment_id) DO UPDATE SET
       name = EXCLUDED.name,
       water_type = EXCLUDED.water_type,
       river_basin_district = EXCLUDED.river_basin_district,
       geom = EXCLUDED.geom,
       ingestion_batch_id = EXCLUDED.ingestion_batch_id,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [
      catchment.managementCatchmentId,
      catchment.name,
      catchment.waterType,
      catchment.riverBasinDistrict,
      JSON.stringify(catchment.geometry),
      ingestionBatchId
    ]
  )

  return rows[0].id
}

async function seedOperationalCatchment(
  pool,
  catchment,
  managementCatchmentId,
  ingestionBatchId
) {
  const { rows } = await pool.query(
    `INSERT INTO operational_catchments
       (operational_catchment_id, name, management_catchment_id, geom, ingestion_batch_id)
     VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), $5)
     ON CONFLICT (operational_catchment_id) DO UPDATE SET
       name = EXCLUDED.name,
       management_catchment_id = EXCLUDED.management_catchment_id,
       geom = EXCLUDED.geom,
       ingestion_batch_id = EXCLUDED.ingestion_batch_id,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [
      catchment.operationalCatchmentId,
      catchment.name,
      managementCatchmentId,
      JSON.stringify(catchment.geometry),
      ingestionBatchId
    ]
  )

  return rows[0].id
}

async function seedWaterbody(
  pool,
  waterbody,
  operationalCatchmentId,
  ingestionBatchId
) {
  await pool.query(
    `INSERT INTO waterbody_features
       (waterbody_id, name, water_body_type, water_type, operational_catchment_id, geom, properties, ingestion_batch_id)
     VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_GeomFromGeoJSON($6), 4326), $7, $8)
     ON CONFLICT (waterbody_id) DO UPDATE SET
       name = EXCLUDED.name,
       water_body_type = EXCLUDED.water_body_type,
       water_type = EXCLUDED.water_type,
       operational_catchment_id = EXCLUDED.operational_catchment_id,
       geom = EXCLUDED.geom,
       properties = EXCLUDED.properties,
       ingestion_batch_id = EXCLUDED.ingestion_batch_id,
       updated_at = CURRENT_TIMESTAMP`,
    [
      waterbody.waterbodyId,
      waterbody.name,
      waterbody.waterBodyType,
      waterbody.waterType,
      operationalCatchmentId,
      JSON.stringify(waterbody.geometry),
      JSON.stringify(waterbody.properties ?? {}),
      ingestionBatchId
    ]
  )
}

async function seedWaterAvailabilityPolygon(pool, polygon, ingestionBatchId) {
  await pool.query(
    `INSERT INTO water_availability_polygons
       (ea_wb_id, camscdsq30, camscdsq50, camscdsq70, camscdsq95, resavail, shape_area, shape_leng, geom, source_srid, properties, ingestion_batch_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ST_SetSRID(ST_GeomFromGeoJSON($9), 4326), $10, $11, $12)
     ON CONFLICT (ea_wb_id) DO UPDATE SET
       camscdsq30 = EXCLUDED.camscdsq30,
       camscdsq50 = EXCLUDED.camscdsq50,
       camscdsq70 = EXCLUDED.camscdsq70,
       camscdsq95 = EXCLUDED.camscdsq95,
       resavail = EXCLUDED.resavail,
       shape_area = EXCLUDED.shape_area,
       shape_leng = EXCLUDED.shape_leng,
       geom = EXCLUDED.geom,
       source_srid = EXCLUDED.source_srid,
       properties = EXCLUDED.properties,
       ingestion_batch_id = EXCLUDED.ingestion_batch_id,
       updated_at = CURRENT_TIMESTAMP`,
    [
      polygon.eaWbId,
      polygon.camscdsq30,
      polygon.camscdsq50,
      polygon.camscdsq70,
      polygon.camscdsq95,
      polygon.resavail,
      polygon.shapeArea,
      polygon.shapeLeng,
      JSON.stringify(polygon.geometry),
      polygon.sourceSrid,
      // country has no promoted column - it lives in properties per data-dictionary.md
      JSON.stringify({ country: polygon.country }),
      ingestionBatchId
    ]
  )
}

async function seedHydrologyStation(pool, station, ingestionBatchId) {
  const { rows } = await pool.query(
    `INSERT INTO hydrology_stations
       (station_id, wiski_id, nrfa_station_id, name, easting, northing, geom, properties, ingestion_batch_id)
     VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_GeomFromGeoJSON($7), 4326), $8, $9)
     ON CONFLICT (station_id) DO UPDATE SET
       wiski_id = EXCLUDED.wiski_id,
       nrfa_station_id = EXCLUDED.nrfa_station_id,
       name = EXCLUDED.name,
       easting = EXCLUDED.easting,
       northing = EXCLUDED.northing,
       geom = EXCLUDED.geom,
       properties = EXCLUDED.properties,
       ingestion_batch_id = EXCLUDED.ingestion_batch_id,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [
      station.stationId,
      station.wiskiId,
      station.nrfaStationId,
      station.name,
      station.easting,
      station.northing,
      JSON.stringify(station.geometry),
      JSON.stringify(station.properties ?? {}),
      ingestionBatchId
    ]
  )

  return rows[0].id
}

async function seedHydrologyMeasure(
  pool,
  measure,
  hydrologyStationId,
  ingestionBatchId
) {
  const { rows } = await pool.query(
    `INSERT INTO hydrology_measures
       (measure_id, station_id, parameter_name, period_name, value_type, unit_name, observation_type, ingestion_batch_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (measure_id) DO UPDATE SET
       station_id = EXCLUDED.station_id,
       parameter_name = EXCLUDED.parameter_name,
       period_name = EXCLUDED.period_name,
       value_type = EXCLUDED.value_type,
       unit_name = EXCLUDED.unit_name,
       observation_type = EXCLUDED.observation_type,
       ingestion_batch_id = EXCLUDED.ingestion_batch_id,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [
      measure.measureId,
      hydrologyStationId,
      measure.parameterName,
      measure.periodName,
      measure.valueType,
      measure.unitName,
      measure.observationType,
      ingestionBatchId
    ]
  )

  return rows[0].id
}

async function seedHydrologyReadings(
  pool,
  readings,
  hydrologyMeasureId,
  ingestionBatchId
) {
  for (const reading of readings) {
    await pool.query(
      `INSERT INTO hydrology_readings
         (measure_id, reading_datetime, value, quality, completeness, ingestion_batch_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (measure_id, reading_datetime) DO UPDATE SET
         value = EXCLUDED.value,
         quality = EXCLUDED.quality,
         completeness = EXCLUDED.completeness,
         ingestion_batch_id = EXCLUDED.ingestion_batch_id`,
      [
        hydrologyMeasureId,
        reading.readingDatetime,
        reading.value,
        reading.quality,
        reading.completeness,
        ingestionBatchId
      ]
    )
  }
}

export async function seedDatabase(pool, fixture = loadFixture()) {
  assertSafeToSeed()

  const ingestionBatchId = await findOrCreateIngestionBatch(
    pool,
    fixture.ingestionBatch
  )

  const managementCatchmentId = await seedManagementCatchment(
    pool,
    fixture.managementCatchment,
    ingestionBatchId
  )

  const operationalCatchmentId = await seedOperationalCatchment(
    pool,
    fixture.operationalCatchment,
    managementCatchmentId,
    ingestionBatchId
  )

  await seedWaterbody(
    pool,
    fixture.waterbody,
    operationalCatchmentId,
    ingestionBatchId
  )

  await seedWaterAvailabilityPolygon(
    pool,
    fixture.waterAvailabilityPolygon,
    ingestionBatchId
  )

  const hydrologyStationId = await seedHydrologyStation(
    pool,
    fixture.hydrologyStation,
    ingestionBatchId
  )

  const hydrologyMeasureId = await seedHydrologyMeasure(
    pool,
    fixture.hydrologyMeasure,
    hydrologyStationId,
    ingestionBatchId
  )

  await seedHydrologyReadings(
    pool,
    fixture.hydrologyReadings,
    hydrologyMeasureId,
    ingestionBatchId
  )
}

async function main() {
  const pool = createPoolFromEnv()

  try {
    await seedDatabase(pool)
    console.log('Local seed data loaded successfully')
  } finally {
    await pool.end()
  }
}

if (isMainModule(import.meta.url)) {
  await main()
}
