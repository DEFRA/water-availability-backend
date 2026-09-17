const validWaterbodyIdPattern = /^GB\d{12,}$/i

export function validateAssessmentPointWaterbodyLinks({
  assessmentPointId,
  waterbodyIds = [],
  validWaterbodyIds = new Set()
}) {
  const issues = []
  const nonEmptyIds = waterbodyIds
    .map((waterbodyId) => String(waterbodyId).trim())
    .filter((waterbodyId) => waterbodyId !== '')
  const normalised = [...new Set(nonEmptyIds)]
  const duplicateIds = nonEmptyIds.filter(
    (waterbodyId, index) => nonEmptyIds.indexOf(waterbodyId) !== index
  )

  if (nonEmptyIds.length === 0) {
    issues.push('Assessment point is not mapped to any valid waterbody')
  }

  if (duplicateIds.length > 0) {
    issues.push('Assessment point contains duplicate waterbody references')
  }

  if (waterbodyIds.some((waterbodyId) => String(waterbodyId).trim() === '')) {
    issues.push('Assessment point contains an empty waterbody reference')
  }

  const malformed = normalised.filter(
    (waterbodyId) => !validWaterbodyIdPattern.test(waterbodyId)
  )

  if (malformed.length > 0) {
    issues.push(`Malformed waterbody IDs: ${malformed.join(', ')}`)
  }

  const unknown = normalised.filter(
    (waterbodyId) =>
      validWaterbodyIds.size > 0 &&
      validWaterbodyIdPattern.test(waterbodyId) &&
      !validWaterbodyIds.has(waterbodyId)
  )

  if (unknown.length > 0) {
    issues.push(`Unknown waterbody IDs: ${unknown.join(', ')}`)
  }

  return {
    valid: issues.length === 0,
    assessmentPointId,
    waterbodyIds: normalised,
    issues
  }
}

export function validateAssessmentPointWaterbodyDataset({
  assessmentPoints = [],
  validWaterbodyIds = new Set()
}) {
  const results = assessmentPoints.map((assessmentPoint) =>
    validateAssessmentPointWaterbodyLinks({
      assessmentPointId: assessmentPoint.assessmentPointId,
      waterbodyIds: assessmentPoint.waterbodyIds ?? [],
      validWaterbodyIds
    })
  )

  if (validWaterbodyIds.size === 0 && assessmentPoints.length > 0) {
    results.forEach((result) => {
      if (!result.issues.includes('Canonical waterbody table is empty')) {
        result.issues.push('Canonical waterbody table is empty')
      }
      result.valid = false
    })
  }

  const summary = {
    totalAssessmentPoints: results.length,
    validAssessmentPoints: results.filter((result) => result.valid).length,
    invalidAssessmentPoints: results.filter((result) => !result.valid).length,
    zeroMatchAssessmentPoints: results.filter((result) =>
      result.issues.includes('Assessment point is not mapped to any valid waterbody')
    ).length,
    duplicateWaterbodyAssessmentPoints: results.filter((result) =>
      result.issues.includes(
        'Assessment point contains duplicate waterbody references'
      )
    ).length,
    unknownWaterbodyAssessmentPoints: results.filter((result) =>
      result.issues.some((issue) => issue.startsWith('Unknown waterbody IDs:'))
    ).length
  }

  return {
    valid: summary.invalidAssessmentPoints === 0,
    summary,
    results
  }
}
