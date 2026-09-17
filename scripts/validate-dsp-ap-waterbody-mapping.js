import pg from 'pg'

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

    const numberMatched = Number(payload.numberMatched ?? features.length)

    if (features.length === 0 || allFeatures.length >= numberMatched) {
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

async function findMatchingWaterbodyIds(pool, feature) {
  if (!feature?.geometry || feature.geometry.type !== 'Point') {
    return []
  }

  const { coordinates } = feature.geometry
  const longitude = coordinates[0]
  const latitude = coordinates[1]

  const { rows } = await pool.query(
    `
      SELECT waterbody_id
      FROM waterbody_features
      WHERE ST_Contains(
        geom,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)
      )
      OR ST_DWithin(
        geom::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        100
      )
    `,
    [longitude, latitude]
  )

  return rows
    .map((row) => row.waterbody_id)
    .filter((waterbodyId) => isValidWaterbodyCandidate(waterbodyId))
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

  const pool = new Pool({
    host: getRequiredEnv('POSTGRES_HOST'),
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    database: getRequiredEnv('POSTGRES_DATABASE'),
    user: getRequiredEnv('POSTGRES_USERNAME'),
    password: process.env.POSTGRES_PASSWORD,
    ssl:
      process.env.POSTGRES_SSL_ENABLED === 'true'
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

    const assessmentPoints = []

    for (const feature of features) {
      const assessmentPointId = readAssessmentPointId(feature)
      const spatialMatches = await findMatchingWaterbodyIds(pool, feature)
      const waterbodyIds = spatialMatches.length > 0 ? spatialMatches : []

      assessmentPoints.push({
        assessmentPointId,
        waterbodyIds
      })
    }

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
