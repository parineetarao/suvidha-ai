import type { ProfileData } from "@/app/full/page"

const STATE_NAME_TO_CODE: Record<string, string> = {
  "Andhra Pradesh": "AP", "Arunachal Pradesh": "AR", "Assam": "AS", "Bihar": "BR",
  "Chhattisgarh": "CG", "Goa": "GA", "Gujarat": "GJ", "Haryana": "HR",
  "Himachal Pradesh": "HP", "Jharkhand": "JH", "Karnataka": "KA", "Kerala": "KL",
  "Madhya Pradesh": "MP", "Maharashtra": "MH", "Manipur": "MN", "Meghalaya": "ML",
  "Mizoram": "MZ", "Nagaland": "NL", "Odisha": "OD", "Punjab": "PB",
  "Rajasthan": "RJ", "Sikkim": "SK", "Tamil Nadu": "TN", "Telangana": "TG",
  "Tripura": "TR", "Uttar Pradesh": "UP", "Uttarakhand": "UK", "West Bengal": "WB",
  "Delhi": "DL",
}

function toIntOrUndefined(value: string): number | undefined {
  const n = parseInt(value.replace(/[^\d]/g, ""), 10)
  return Number.isFinite(n) ? n : undefined
}

function toFloatOrUndefined(value: string): number | undefined {
  const n = parseFloat(value.replace(/[^\d.]/g, ""))
  return Number.isFinite(n) ? n : undefined
}

/** Approximates a date of birth from an age in years — the frontend
 * collects age, but the backend stores an actual birthdate. Jan 1 of the
 * implied birth year is a reasonable, honestly-approximate stand-in;
 * exact DOB was never actually collected by this form. */
export function ageToApproxDateOfBirth(age: string): string | undefined {
  const ageNum = parseInt(age, 10)
  if (!Number.isFinite(ageNum) || ageNum <= 0) return undefined
  const birthYear = new Date().getFullYear() - ageNum
  return `${birthYear}-01-01`
}

export function toUserPatchPayload(data: ProfileData) {
  return {
    full_name: data.fullName || undefined,
    date_of_birth: ageToApproxDateOfBirth(data.age),
  }
}

export function toProfilePutPayload(data: ProfileData) {
  return {
    state_code: STATE_NAME_TO_CODE[data.state] ?? undefined,
    district: data.district || undefined,
    occupation: data.occupation || undefined,
    annual_income_inr: toIntOrUndefined(data.income),
    gender: data.gender || undefined,
    family_size: toIntOrUndefined(data.familySize),
    land_area_acres: toFloatOrUndefined(data.landArea),
    land_ownership: data.landOwnership || undefined,
    bank_name: data.bankName || undefined,
    ifsc: data.ifscCode || undefined,
    // Only ever the last 4 digits — never the full account number, matching
    // the backend's account_last_four column design.
    account_last_four: data.accountNumber ? data.accountNumber.slice(-4) : undefined,
    extra_attrs: {
      land: data.land || undefined,
      aadhaarBankLinked: data.aadhaarBankLinked || undefined,
      currentHouse: data.currentHouse || undefined,
      bplCard: data.bplCard || undefined,
      rationCardType: data.rationCardType || undefined,
      businessType: data.businessType || undefined,
      businessAge: data.businessAge || undefined,
      existingLoan: data.existingLoan || undefined,
      maritalStatus: data.maritalStatus || undefined,
      lpgConnection: data.lpgConnection || undefined,
      girlChildAge: data.girlChildAge || undefined,
      qualification: data.qualification || undefined,
      institutionName: data.institutionName || undefined,
      farmerCategory: data.farmerCategory || undefined,
      surveyNumber: data.surveyNumber || undefined,
    },
  }
}