'use client'

import { FlaskConical } from 'lucide-react'
import type { Lang } from '@/lib/strings'
import { DR, drt } from '@/lib/document-readiness/translations'
import { DEMO_SCENARIOS, type DemoScenario } from '@/lib/document-readiness/demo-data'

interface DemoScenarioPickerProps {
  lang: Lang
  onPick: (scenario: DemoScenario) => void
}

export function DemoScenarioPicker({ lang, onPick }: DemoScenarioPickerProps) {
  return (
    <div className="rounded-[10px] border border-[#E7E0D8] border-dashed bg-[#FAF7F2] p-3.5">
      <div className="flex items-center gap-2 mb-2">
        <FlaskConical size={15} className="text-[#7C3AED] flex-shrink-0" aria-hidden="true" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-[#7C3AED]">{drt(DR.full.demoSectionTitle, lang)}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DEMO_SCENARIOS.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            onClick={() => onPick(scenario)}
            className="text-[11px] font-semibold px-3 py-2 rounded-[6px] border border-[#E7E0D8] bg-white text-[#57534E] hover:border-[#7C3AED] hover:text-[#7C3AED] transition-colors min-h-[36px]"
          >
            {drt((DR.demoScenarios as any)[scenario.labelKey], lang)}
          </button>
        ))}
      </div>
    </div>
  )
}
