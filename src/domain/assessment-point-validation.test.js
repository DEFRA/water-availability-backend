import {
  validateAssessmentPointWaterbodyDataset,
  validateAssessmentPointWaterbodyLinks
} from './assessment-point-validation.js'

describe('assessment point waterbody validation', () => {
  test('accepts a valid AP to waterbody mapping', () => {
    const result = validateAssessmentPointWaterbodyLinks({
      assessmentPointId: 'AP-123',
      waterbodyIds: ['GB106039029800', 'GB106039029801']
    })

    expect(result).toEqual({
      valid: true,
      assessmentPointId: 'AP-123',
      waterbodyIds: ['GB106039029800', 'GB106039029801'],
      issues: []
    })
  })

  test('rejects APs with duplicate IDs and empty references', () => {
    const result = validateAssessmentPointWaterbodyLinks({
      assessmentPointId: 'AP-456',
      waterbodyIds: ['GB106039029800', 'GB106039029800', '']
    })

    expect(result.valid).toBe(false)
    expect(result.issues).toContain(
      'Assessment point contains duplicate waterbody references'
    )
    expect(result.issues).toContain(
      'Assessment point contains an empty waterbody reference'
    )
  })

  test('rejects unknown waterbody IDs even when they are present', () => {
    const result = validateAssessmentPointWaterbodyLinks({
      assessmentPointId: 'AP-789',
      waterbodyIds: ['GB106039029800', 'GB999999999999'],
      validWaterbodyIds: new Set(['GB106039029800'])
    })

    expect(result.valid).toBe(false)
    expect(result.issues).toContain('Unknown waterbody IDs: GB999999999999')
  })

  test('does not treat AP labels as waterbody IDs', () => {
    const result = validateAssessmentPointWaterbodyLinks({
      assessmentPointId:
        'ea_catchment_abstraction_management_strategy_assessment_points.1',
      waterbodyIds: ['AP5, Lower Cherwell'],
      validWaterbodyIds: new Set()
    })

    expect(result.valid).toBe(false)
    expect(result.issues).toContain(
      'Malformed waterbody IDs: AP5, Lower Cherwell'
    )
  })

  test('validates the full dataset and flags invalid mappings', () => {
    const validWaterbodyIds = new Set(['GB106039029800', 'GB106039029801'])

    const result = validateAssessmentPointWaterbodyDataset({
      assessmentPoints: [
        {
          assessmentPointId: 'AP-100',
          waterbodyIds: ['GB106039029800', 'GB106039029801']
        },
        {
          assessmentPointId: 'AP-101',
          waterbodyIds: ['GB106039029800', 'GB106039029800', '']
        },
        {
          assessmentPointId: 'AP-102',
          waterbodyIds: ['GB106039029999']
        },
        {
          assessmentPointId: 'AP-103',
          waterbodyIds: []
        }
      ],
      validWaterbodyIds
    })

    expect(result.valid).toBe(false)
    expect(result.summary.totalAssessmentPoints).toBe(4)
    expect(result.summary.invalidAssessmentPoints).toBe(3)
    expect(result.summary.zeroMatchAssessmentPoints).toBe(1)
    expect(result.summary.duplicateWaterbodyAssessmentPoints).toBe(1)
    expect(result.summary.unknownWaterbodyAssessmentPoints).toBe(1)
  })

  test('fails when the canonical waterbody table is empty', () => {
    const result = validateAssessmentPointWaterbodyDataset({
      assessmentPoints: [
        { assessmentPointId: 'AP-200', waterbodyIds: ['GB106039029800'] },
        { assessmentPointId: 'AP-201', waterbodyIds: [] }
      ],
      validWaterbodyIds: new Set()
    })

    expect(result.valid).toBe(false)
    expect(result.summary.invalidAssessmentPoints).toBe(2)
    expect(result.results[0].issues).toContain(
      'Canonical waterbody table is empty'
    )
  })
})
