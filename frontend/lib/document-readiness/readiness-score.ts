import type { DocumentIssue, DocumentReadinessResult, DocumentType, NameComparison, RequiredDocumentRef } from './types'

export type ReadinessBand = 'ready' | 'review' | 'fix'

export interface ReadinessScoreInput {
  requiredDocs: RequiredDocumentRef[]
  results: Partial<Record<DocumentType, DocumentReadinessResult>>
  nameComparisons: NameComparison[]
}

export interface ReadinessScoreOutput {
  score: number
  band: ReadinessBand
  documentsRequired: number
  documentsChecked: number
  documentsReady: number
  documentsNeedingAttention: number
}

function issuePenalty(issue: DocumentIssue): number {
  if (issue.code === 'doc_type_mismatch') return 20
  if (issue.code === 'certificate_outdated') return 15
  if (issue.severity === 'critical') return 10
  return 5
}

export function computeReadinessScore(input: ReadinessScoreInput): ReadinessScoreOutput {
  const { requiredDocs, results, nameComparisons } = input
  let score = 100

  let documentsReady = 0
  let documentsNeedingAttention = 0
  let documentsChecked = 0

  for (const ref of requiredDocs) {
    const result = results[ref.type]
    if (!result) {
      if (ref.required) score -= 20
      continue
    }
    documentsChecked++

    if (result.status === 'ready') {
      documentsReady++
      continue
    }

    documentsNeedingAttention++

    if (result.status === 'unclear' || result.status === 'error') {
      score -= 10
      continue
    }

    for (const issue of result.issues) {
      score -= issuePenalty(issue)
    }
  }

  const mismatchCount = nameComparisons.filter((c) => c.label === 'mismatch').length
  score -= mismatchCount * 15

  score = Math.max(0, Math.min(100, Math.round(score)))

  const band: ReadinessBand = score >= 80 ? 'ready' : score >= 55 ? 'review' : 'fix'

  return {
    score,
    band,
    documentsRequired: requiredDocs.filter((d) => d.required).length,
    documentsChecked,
    documentsReady,
    documentsNeedingAttention,
  }
}
