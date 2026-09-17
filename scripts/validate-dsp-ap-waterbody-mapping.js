import pg from 'pg'
import { Signer } from '@aws-sdk/rds-signer'

import { validateAssessmentPointWaterbodyDataset } from '#/domain/assessment-point-validation.js'

const { Pool } = pg

const DEFAULT_AP_COLLECTION_URL =
  'https://environment.data.gov.uk/geoservices/datasets/394cde56-5cf9-42bf-8d20-86c182f9ce68/ogc/features/v1/collections/ea_catchment_abstraction_management_strategy_assessment_points/items'

const validWaterbodyPattern = /^GB[0-9]{12,}$/i

function getRequiredEnv(name) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} must be configured`)
  }

  return value
}

// Mirrors src/config.js: IAM auth and TLS default to on in production so this script behaves
// the same as the running application when the optional env vars are left unset.
const isProduction = process.env.NODE_ENV === 'production'
function boolEnv(name, defaultValue) {
  return process.env[name] === undefined
    ? defaultValue
    : process.env[name] === 'true'
}

function normaliseId(value) {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value).trim()
}

function isValidWaterbodyCandidate(value) {
  const normalised = normaliseId(value)

  if (!normalised) {
    return false
  }

  return validWaterbodyPattern.test(normalised)
}

function readAssessmentPointId(feature) {
  const properties = feature?.properties ?? {}
  const candidates = [
    feature?.id,
    properties.assessment_point_id,
    properties.ap_code,
    properties.ap_id,
    properties.ea_ap_id,
    properties.name,
    properties.assessmentPointId,
    properties.ap_name
  ]

  const result = candidates.find((value) => normaliseId(value) !== '')
  return normaliseId(result ?? 'unknown-assessment-point')
}

async function fetchAssessmentPointFeatures(url) {
  const allFeatures = []
  let startIndex = 0
  const limit = Number(process.env.DSP_AP_PAGE_LIMIT ?? 1000)

  while (true) {
    const requestUrl = new URL(url)
    requestUrl.searchParams.set('f', 'application/geo+json')
    requestUrl.searchParams.set('limit', String(limit))
    requestUrl.searchParams.set('startIndex', String(startIndex))

    const response = await fetch(requestUrl)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(
        `DSP AP collection request failed with ${response.status}: ${text.slice(0, 500)}`
      )
    }

    const payload = await response.json()
    const features = Array.isArray(payload.features) ? payload.features : []

    allFeatures.push(...features)

    if (features.length === 0 || features.length < limit) {
      break
    }

    if (
      typeof payload.numberMatched === 'number' &&
      allFeatures.length >= payload.numberMatched
    ) {
      break
    }

    startIndex += limit
  }

  return allFeatures
}

async function loadCanonicalWaterbodyIds(pool) {
  const { rows } = await pool.query(
    'SELECT waterbody_id FROM waterbody_features WHERE waterbody_id IS NOT NULL'
  )

  return new Set(
    rows
      .map((row) => row.waterbody_id)
      .filter(Boolean)
      .map((waterbodyId) => String(waterbodyId).trim())
  )
}

async function findMatchingWaterbodyIdsBatch(pool, features) {
  const pointFeatures = features
    .map((feature, index) => ({ feature, index }))
    .filter(({ feature }) => feature?.geometry?.type === 'Point')

  const matchesByIndex = new Map()

  if (pointFeatures.length === 0) {
    return matchesByIndex
  }

  const indexes = pointFeatures.map(({ index }) => index)
  const longitudes = pointFeatures.map(
    ({ feature }) => feature.geometry.coordinates[0]
  )
  const latitudes = pointFeatures.map(
    ({ feature }) => feature.geometry.coordinates[1]
  )

  const { rows } = await pool.query(
    `
      SELECT input.idx AS idx, wb.waterbody_id AS waterbody_id
      FROM unnest($1::int[], $2::float8[], $3::float8[]) AS input(idx, lon, lat)
      JOIN waterbody_features wb
        ON ST_Contains(
          wb.geom,
          ST_SetSRID(ST_MakePoint(input.lon, input.lat), 4326)
        )
        OR ST_DWithin(
          wb.geom::geography,
          ST_SetSRID(ST_MakePoint(input.lon, input.lat), 4326)::geography,
          100
        )
    `,
    [indexes, longitudes, latitudes]
  )

  for (const row of rows) {
    if (!isValidWaterbodyCandidate(row.waterbody_id)) {
      continue
    }

    const existing = matchesByIndex.get(row.idx) ?? []
    existing.push(row.waterbody_id)
    matchesByIndex.set(row.idx, existing)
  }

  return matchesByIndex
}

function reportNonWfdEntries(features) {
  return features
    .filter((feature) => {
      const properties = feature?.properties ?? {}
      const values = [
        properties.ea_wb_id,
        properties.waterbody_id,
        properties.waterbodyId,
        properties.waterbodyIds,
        properties.waterbodies,
        properties.ap_name,
        properties.name
      ]

      return values.some(
        (value) =>
          normaliseId(value).toLowerCase() === 'non wfd' ||
          normaliseId(value).toLowerCase() === 'non-wfd'
      )
    })
    .map((feature) => ({
      assessmentPointId: readAssessmentPointId(feature),
      waterbodyValues: [
        feature?.properties?.ea_wb_id,
        feature?.properties?.waterbody_id,
        feature?.properties?.waterbodyId,
        feature?.properties?.waterbodyIds,
        feature?.properties?.waterbodies,
        feature?.properties?.ap_name,
        feature?.properties?.name
      ].filter((value) => normaliseId(value) !== '')
    }))
}

async function main() {
  const apCollectionUrl =
    process.env.DSP_AP_COLLECTION_URL ?? DEFAULT_AP_COLLECTION_URL

  const host = getRequiredEnv('POSTGRES_HOST')
  const port = Number(process.env.POSTGRES_PORT ?? 5432)
  const user = getRequiredEnv('POSTGRES_USERNAME')
  const iamAuthentication = boolEnv('POSTGRES_IAM_AUTHENTICATION', isProduction)
  const sslEnabled = boolEnv('POSTGRES_SSL_ENABLED', isProduction)

  if (iamAuthentication && !sslEnabled) {
    throw new Error(
      'POSTGRES_SSL_ENABLED must be true when POSTGRES_IAM_AUTHENTICATION=true'
    )
  }

  if (!iamAuthentication) {
    getRequiredEnv('POSTGRES_PASSWORD')
  }

  const password = iamAuthentication
    ? async () => {
        const signer = new Signer({
          hostname: host,
          port,
          region: process.env.AWS_REGION ?? 'eu-west-2',
          username: user
        })

        return signer.getAuthToken()
      }
    : process.env.POSTGRES_PASSWORD

  const pool = new Pool({
    host,
    port,
    database: getRequiredEnv('POSTGRES_DATABASE'),
    user,
    password,
    ssl: sslEnabled
      ? {
          rejectUnauthorized:
            process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false'
        }
      : false
  })

  try {
    const [features, validWaterbodyIds] = await Promise.all([
      fetchAssessmentPointFeatures(apCollectionUrl),
      loadCanonicalWaterbodyIds(pool)
    ])

    const matchesByIndex = await findMatchingWaterbodyIdsBatch(pool, features)

    const assessmentPoints = features.map((feature, index) => ({
      assessmentPointId: readAssessmentPointId(feature),
      waterbodyIds: matchesByIndex.get(index) ?? []
    }))

    const validation = validateAssessmentPointWaterbodyDataset({
      assessmentPoints,
      validWaterbodyIds
    })

    const nonWfdEntries = reportNonWfdEntries(features)

    const result = {
      sourceUrl: apCollectionUrl,
      totalAssessmentPoints: features.length,
      validWaterbodyIdsInCanonicalTable: validWaterbodyIds.size,
      validation,
      nonWfdEntries,
      nonWfdAssessmentPointCount: nonWfdEntries.length,
      validationNote:
        'This live validation compares the DSP AP geometry against the canonical waterbody table. AP labels such as "AP5, Lower Cherwell" are not treated as waterbody IDs.'
    }

    console.log(JSON.stringify(result, null, 2))
    process.exitCode = validation.valid ? 0 : 1
  } finally {
    await pool.end()
  }
}

await main()
