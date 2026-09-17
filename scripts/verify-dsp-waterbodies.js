const DEFAULT_URL =
  'https://environment.data.gov.uk/catchment-planning/England.geojson'

const validWfdIdPattern = /^GB\d{12,}$/i

function geometryType(feature) {
  const value = feature?.properties?.['geometry-type']

  if (!value) {
    return 'missing'
  }

  return String(value).split('/').pop()
}

async function main() {
  const url = process.env.DSP_WATERBODY_COLLECTION_URL ?? DEFAULT_URL
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`DSP waterbody request failed with ${response.status}`)
  }

  const payload = await response.json()
  const features = Array.isArray(payload.features) ? payload.features : []
  const idToTypes = new Map()
  let missingIdCount = 0

  for (const feature of features) {
    const id = String(feature?.properties?.id ?? '').trim()

    if (!id) {
      missingIdCount += 1
      continue
    }

    const types = idToTypes.get(id) ?? new Set()
    types.add(geometryType(feature))
    idToTypes.set(id, types)
  }

  const ids = [...idToTypes.keys()]
  const validWfdIds = ids.filter((id) => validWfdIdPattern.test(id))
  const geometryTypeCounts = {}

  for (const feature of features) {
    const type = geometryType(feature)
    geometryTypeCounts[type] = (geometryTypeCounts[type] ?? 0) + 1
  }

  const idsWithBothExpectedTypes = ids.filter((id) => {
    const types = idToTypes.get(id)
    return types.has('Catchment') && types.has('RiverLine')
  })

  const result = {
    sourceUrl: url,
    retrievedAt: new Date().toISOString(),
    httpStatus: response.status,
    totalGeoJsonFeatures: features.length,
    distinctNonEmptyIds: ids.length,
    distinctValidWfdIds: validWfdIds.length,
    duplicateGeometryFeatures: features.length - ids.length,
    missingIdFeatures: missingIdCount,
    geometryTypeCounts,
    idsWithBothCatchmentAndRiverLine: idsWithBothExpectedTypes.length,
    validWfdIdPattern: validWfdIdPattern.source
  }

  console.log(JSON.stringify(result, null, 2))
}

await main()
