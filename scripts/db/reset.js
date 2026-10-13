import { createPoolFromEnv, resolveConnectionOptions } from './pg-pool.js'
import { seedDatabase, loadFixture } from './seed.js'

// Order matters for readability only - CASCADE handles FK dependents regardless of order.
const SEEDED_TABLES = [
  'hydrology_readings',
  'hydrology_measures',
  'hydrology_stations',
  'hof_bands',
  'assessment_point_waterbodies',
  'assessment_points',
  'water_availability_polygons',
  'waterbody_features',
  'operational_catchments',
  'management_catchments',
  'ingestion_batch'
]

const LOCAL_HOST_PATTERN = /^(127\.0\.0\.1|localhost|::1)$/i

// This truncates every seeded table - refuse to run it against anything that doesn't look like a
// local database unless the caller explicitly confirms, so a stray shared/Aurora POSTGRES_HOST
// can't be wiped by accident.
function assertSafeToReset(host) {
  const confirmed = process.env.CONFIRM_DB_RESET === 'true'

  if (!LOCAL_HOST_PATTERN.test(host) && !confirmed) {
    throw new Error(
      `Refusing to reset Postgres at host "${host}" - it does not look like a local database. ` +
        'Set CONFIRM_DB_RESET=true if you really intend to truncate and reseed this database.'
    )
  }
}

export async function resetDatabase(pool) {
  const client = await pool.connect()
  const fixture = loadFixture()

  try {
    await client.query('BEGIN')
    await client.query(
      `TRUNCATE TABLE ${SEEDED_TABLES.join(', ')} RESTART IDENTITY CASCADE`
    )
    await seedDatabase(client, fixture)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

async function main() {
  assertSafeToReset(resolveConnectionOptions().host)

  const pool = createPoolFromEnv()

  try {
    await resetDatabase(pool)
    console.log('Local database reset and reseeded successfully')
  } finally {
    await pool.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
