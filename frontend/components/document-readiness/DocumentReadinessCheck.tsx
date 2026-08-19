'use client'

import { useEffect, useRef, useState } from 'react'
import type { DocLang, DocumentIssue, DocumentReadinessResult, DocumentType, OCRStageUpdate } from '@/lib/document-readiness/types'
import { DR, drt } from '@/lib/document-readiness/translations'
import { runOcr } from '@/lib/document-readiness/ocr'
import { assessImageQuality, loadImageBitmapFromFile } from '@/lib/document-readiness/image-quality'
import { validateDocument } from '@/lib/document-readiness/validators'
import { compareNames } from '@/lib/document-readiness/name-matching'
import type { ImageQualityWarning } from '@/lib/document-readiness/types'
import { DEMO_SCENARIOS, buildDemoResult, type DemoScenario } from '@/lib/document-readiness/demo-data'
import { DocumentUploadCard } from './DocumentUploadCard'
import { DocumentResultCard } from './DocumentResultCard'
import { OCRProgress } from './OCRProgress'
import { PrivacyNotice } from './PrivacyNotice'
import { DemoScenarioPicker } from './DemoScenarioPicker'

interface DocumentReadinessCheckProps {
  lang: DocLang
  documentType: DocumentType
  displayLabel: string
  expectedProfileName?: string
  onProfileNameProvided?: (name: string) => void
  compact?: boolean
  demoEnabled?: boolean
  onResult?: (result: DocumentReadinessResult | null) => void
  initialResult?: DocumentReadinessResult | null
  inputIdPrefix: string
}

const NAME_MISMATCH_ISSUE: DocumentIssue = {
  code: 'name_mismatch',
  severity: 'warning',
  messageKey: 'nameMismatch',
  suggestionKey: 'nameMismatch',
}

function withNameMismatch(result: DocumentReadinessResult, expectedProfileName?: string): DocumentReadinessResult {
  const cmp = compareNames(expectedProfileName, result.extractedName)
  const withoutMismatch = result.issues.filter((i) => i.code !== 'name_mismatch')
  const issues = cmp.label === 'mismatch' ? [...withoutMismatch, NAME_MISMATCH_ISSUE] : withoutMismatch
  const status = result.status === 'unclear' || result.status === 'error' ? result.status : issues.length > 0 ? 'warning' : 'ready'
  return { ...result, issues, status }
}

export function DocumentReadinessCheck({
  lang,
  documentType,
  displayLabel,
  expectedProfileName,
  onProfileNameProvided,
  compact,
  demoEnabled = true,
  onResult,
  initialResult,
  inputIdPrefix,
}: DocumentReadinessCheckProps) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [stage, setStage] = useState<OCRStageUpdate>({ stageKey: 'preparing_image', progress: 0 })
  const [result, setResult] = useState<DocumentReadinessResult | null>(initialResult ?? null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [qualityWarnings, setQualityWarnings] = useState<ImageQualityWarning[]>([])
  const [marathiFallbackNotice, setMarathiFallbackNotice] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const mountedRef = useRef(true)
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  const setPreview = (f: File | null) => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    if (f) {
      const url = URL.createObjectURL(f)
      objectUrlRef.current = url
      setPreviewUrl(url)
    } else {
      setPreviewUrl(null)
    }
  }

  const handleFileSelected = (f: File) => {
    setFile(f)
    setPreview(f)
    setResult(null)
    setErrorMessage(null)
    setQualityWarnings([])
    setMarathiFallbackNotice(false)
    onResult?.(null)
  }

  const handleRemove = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setErrorMessage(null)
    setQualityWarnings([])
    onResult?.(null)
  }

  const handleUploadError = (messageKey: 'invalidFileType' | 'fileTooLarge') => {
    setErrorMessage(drt(DR.errors[messageKey], lang))
  }

  const runCheck = async (targetFile: File, isRetry = false) => {
    setIsProcessing(true)
    setErrorMessage(null)
    if (!isRetry) setQualityWarnings([])
    setStage({ stageKey: 'preparing_image', progress: 5 })

    try {
      const bitmap = await loadImageBitmapFromFile(targetFile)
      const warnings = await assessImageQuality(bitmap)
      if (!mountedRef.current) return
      setQualityWarnings(warnings)

      const ocrOutcome = await runOcr(targetFile, {
        includeMarathi: lang === 'mr-IN',
        onStage: (update) => {
          if (mountedRef.current) setStage(update)
        },
      })
      if (!mountedRef.current) return
      if (ocrOutcome.usedFallbackLang) setMarathiFallbackNotice(true)

      setStage({ stageKey: 'extracting_fields', progress: 92 })
      const validation = validateDocument({
        documentType,
        text: ocrOutcome.text,
        ocrConfidence: ocrOutcome.confidence,
        profileName: expectedProfileName,
      })

      setStage({ stageKey: 'checking_issues', progress: 96 })
      setStage({ stageKey: 'preparing_result', progress: 100 })

      if (validation.status === 'unclear') {
        const unclearResult: DocumentReadinessResult = {
          documentType,
          status: 'unclear',
          confidence: 'low',
          ocrConfidence: ocrOutcome.confidence,
          extractedText: ocrOutcome.text,
          extractedFields: validation.extractedFields,
          issues: validation.issues,
          extractedName: validation.extractedName,
          completedAt: new Date().toISOString(),
        }
        if (!mountedRef.current) return
        setResult(unclearResult)
        onResult?.(unclearResult)
        return
      }

      const draftResult: DocumentReadinessResult = {
        documentType,
        status: validation.status,
        confidence: validation.confidence,
        ocrConfidence: ocrOutcome.confidence,
        extractedText: ocrOutcome.text,
        extractedFields: validation.extractedFields,
        issues: validation.issues,
        extractedName: validation.extractedName,
        completedAt: new Date().toISOString(),
      }
      const finalResult = withNameMismatch(draftResult, expectedProfileName)

      if (!mountedRef.current) return
      setResult(finalResult)
      onResult?.(finalResult)
    } catch {
      if (!mountedRef.current) return
      setErrorMessage(drt(DR.errors.ocrFailed, lang))
    } finally {
      if (mountedRef.current) setIsProcessing(false)
    }
  }

  const handleRunCheck = () => {
    if (!file) return
    runCheck(file)
  }

  const handleNameCorrected = (newName: string) => {
    setResult((prev) => {
      if (!prev) return prev
      const updated = withNameMismatch({ ...prev, extractedName: newName, nameManuallyCorrected: true }, expectedProfileName)
      onResult?.(updated)
      return updated
    })
  }

  const handleDemoPick = (scenario: DemoScenario) => {
    setFile(null)
    setPreview(null)
    setErrorMessage(null)
    setQualityWarnings([])
    setMarathiFallbackNotice(false)
    const demoResult = withNameMismatch(buildDemoResult(scenario, expectedProfileName), expectedProfileName)
    setResult(demoResult)
    onResult?.(demoResult)
  }

  const relevantDemoScenarios = DEMO_SCENARIOS.filter((s) => s.documentType === documentType)

  return (
    <div className="space-y-3">
      {compact && (
        <h3 className="text-[15px] font-bold text-[#1C1917]" style={{ fontFamily: 'var(--font-libre-baskerville)' }}>
          {displayLabel}
        </h3>
      )}

      {!expectedProfileName && (
        <div className="bg-[#FAF7F2] border border-[#E7E0D8] rounded-[8px] p-2.5">
          <label className="text-[11px] font-semibold text-[#57534E] block mb-1.5" htmlFor={`${inputIdPrefix}-name`}>
            {drt(DR.full.noProfileNamePrompt, lang)}
          </label>
          <div className="flex gap-2">
            <input
              id={`${inputIdPrefix}-name`}
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder={drt(DR.common.yourName, lang)}
              className="flex-1 border-[1.5px] border-[#E7E0D8] rounded-[6px] px-2.5 py-2 text-[13px] outline-none focus:border-[#E8690B]"
              style={{ fontSize: 16 }}
            />
            <button
              type="button"
              onClick={() => nameDraft.trim() && onProfileNameProvided?.(nameDraft.trim())}
              className="rounded-[6px] bg-[#1A6B3C] text-white text-[12px] font-bold px-3 py-2 min-h-[44px]"
            >
              {drt(DR.common.save, lang)}
            </button>
          </div>
        </div>
      )}

      {!result && (
        <DocumentUploadCard
          lang={lang}
          previewUrl={previewUrl}
          isProcessing={isProcessing}
          hasResult={false}
          onFileSelected={handleFileSelected}
          onRemove={handleRemove}
          onRunCheck={handleRunCheck}
          onError={handleUploadError}
          inputIdPrefix={inputIdPrefix}
        />
      )}

      {!isProcessing && qualityWarnings.length > 0 && !result && (
        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] p-2.5 space-y-1" aria-live="polite">
          {qualityWarnings.map((w) => (
            <p key={w.code} className="text-[11px] text-[#92400E] leading-[1.4]">• {drt(DR.imageQuality[w.code], lang)}</p>
          ))}
        </div>
      )}

      {isProcessing && (
        <div className="bg-white border border-[#E7E0D8] rounded-[10px] p-4">
          <OCRProgress lang={lang} stageKey={stage.stageKey} progress={stage.progress} />
        </div>
      )}

      {errorMessage && (
        <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-[8px] p-3" role="alert" aria-live="assertive">
          <p className="text-[12px] text-[#DC2626] leading-[1.5] mb-2">{errorMessage}</p>
          {file && (
            <button
              type="button"
              onClick={() => runCheck(file, true)}
              className="text-[11px] font-bold text-white bg-[#DC2626] rounded-[6px] px-3 py-2 min-h-[36px]"
            >
              {drt(DR.common.retry, lang)}
            </button>
          )}
        </div>
      )}

      {marathiFallbackNotice && (
        <p className="text-[10.5px] text-[#78716C] italic" aria-live="polite">{drt(DR.errors.marathiUnavailable, lang)}</p>
      )}

      {result && (
        <>
          <DocumentResultCard lang={lang} result={result} compact={compact} onNameCorrected={handleNameCorrected} />
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleRemove}
              className="flex-1 rounded-[8px] border-[1.5px] border-[#E7E0D8] bg-white text-[#57534E] font-bold text-[13px] py-2.5 px-3 hover:border-[#E8690B] hover:text-[#E8690B] transition-colors min-h-[44px]"
            >
              {drt(DR.common.retakePhoto, lang)}
            </button>
          </div>
        </>
      )}

      {demoEnabled && relevantDemoScenarios.length > 0 && (
        <DemoScenarioPicker
          lang={lang}
          onPick={handleDemoPick}
        />
      )}

      <PrivacyNotice lang={lang} variant="privacy" />
    </div>
  )
}
