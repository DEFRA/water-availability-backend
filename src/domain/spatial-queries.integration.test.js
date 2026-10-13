import { createPoolFromEnv } from '../../scripts/db/pg-pool.js'
import { seedDatabase, loadFixture } from '../../scripts/db/seed.js'

// Requires local Postgres running + migrated, e.g.:
//   npm run local:infra:up && npm run migrate:up
// Verifies ST_Contains/ST_Distance/ST_DWithin spatial queries against the representative
// DDSP-derived seed fixture (see scripts/db/fixtures/local-seed-dataset.json).
const fixture = loadFixture()
let pool

beforeAll(async () => {
  pool = createPoolFromEnv()
  await seedDatabase(pool, fixture)
})

afterAll(async () => {
  await pool?.end()
})

describe('spatial queries against seeded data', () => {
  test('ST_Contains finds the seeded waterbody containing the seeded hydrology station', async () => {
    const [longitude, latitude] = fixture.hydrologyStation.geometry.coordinates

    const { rows } = await pool.query(
      `SELECT waterbody_id FROM waterbody_features
       WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))`,
      [longitude, latitude]
    )

    expect(rows.map((row) => row.waterbody_id)).toContain(
      fixture.waterbody.waterbodyId
    )
  })

  test('ST_Contains excludes a point far outside the seeded waterbody', async () => {
    const { rows } = await pool.query(
      `SELECT waterbody_id FROM waterbody_features
       WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))`,
      [-3.0, 53.5] // Liverpool area - well outside the seeded Cherwell waterbody
    )

    expect(rows.map((row) => row.waterbody_id)).not.toContain(
      fixture.waterbody.waterbodyId
    )
  })

  test('ST_Distance/ST_DWithin correctly measure proximity to the seeded waterbody', async () => {
    const nearbyPoint = { longitude: -1.3, latitude: 51.8 } // just outside the seeded boundary
    const farPoint = { longitude: -3.0, latitude: 53.5 }

    const {
      rows: [{ distance_metres: nearDistance }]
    } = await pool.query(
      `SELECT ST_Distance(
          geom::geography,
          ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
        ) AS distance_metres
       FROM waterbody_features WHERE waterbody_id = $1`,
      [
        fixture.waterbody.waterbodyId,
        nearbyPoint.longitude,
        nearbyPoint.latitude
      ]
    )

    expect(Number(nearDistance)).toBeGreaterThan(0)
    expect(Number(nearDistance)).toBeLessThan(5000)

    const {
      rows: [{ within: nearWithin }]
    } = await pool.query(
      `SELECT ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
          5000
        ) AS within
       FROM waterbody_features WHERE waterbody_id = $1`,
      [
        fixture.waterbody.waterbodyId,
        nearbyPoint.longitude,
        nearbyPoint.latitude
      ]
    )

    expect(nearWithin).toBe(true)

    const {
      rows: [{ within: farWithin }]
    } = await pool.query(
      `SELECT ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
          5000
        ) AS within
       FROM waterbody_features WHERE waterbody_id = $1`,
      [fixture.waterbody.waterbodyId, farPoint.longitude, farPoint.latitude]
    )

    expect(farWithin).toBe(false)
  })

  test('seeded hydrology readings are retrievable for the seeded measure', async () => {
    const { rows } = await pool.query(
      `SELECT hr.value, hr.quality, hr.completeness
       FROM hydrology_readings hr
       JOIN hydrology_measures hm ON hm.id = hr.measure_id
       WHERE hm.measure_id = $1
       ORDER BY hr.reading_datetime`,
      [fixture.hydrologyMeasure.measureId]
    )

    expect(rows).toHaveLength(fixture.hydrologyReadings.length)
    expect(Number(rows[0].value)).toBeCloseTo(
      fixture.hydrologyReadings[0].value,
      3
    )
  })
})
