"""
scripts/seed_schemes.py

Bootstrap script: inserts the 8 schemes already present in the frontend
(frontend/app/full/page.tsx) into the `schemes` table, so development and
demos have real data before the real ingestion pipeline exists.

NOTE ON COUNT: the original brief mentioned 9 schemes including PM SVANidhi,
but the actual frontend array only has 8 (ids 1-8) — PM SVANidhi isn't
present in the codebase. Seeding what actually exists, not what was assumed.

NOTE ON SCOPE: this is NOT the production catalog. Per the team's scope
decision, the real catalog (all central + relevant state schemes for
individual citizens) is built by app/ingestion/data_gov_in.py + normalizer.py.
This script only unblocks early development with real, not-placeholder data.

SYNC NOTE: uses SessionLocal directly (from app.db.session), not the
get_db() FastAPI dependency — get_db is a generator meant for request
handling, not standalone scripts. Also plain synchronous calls throughout,
matching Member 3's actual sync SQLAlchemy setup (create_engine + Session).

Run with: python -m scripts.seed_schemes
"""

import logging

from app.db.session import SessionLocal
from app.db.base import Base  # noqa: F401 — import first so base.py's own
                                # model registration runs before we ask for
                                # Scheme directly (avoids a circular import)
from app.models.scheme import Scheme
from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)

SEED_SCHEMES = [
    {
        "scheme_code": "pmkisan",
        "name": "PM Kisan Samman Nidhi",
        "description": "Income support for landholding farmer families, paid directly to their bank account to help meet agricultural and domestic needs.",
        "benefits": "₹6,000 per year, paid in three installments of ₹2,000.",
        "ministry": "Ministry of Agriculture",
        "category": "agriculture",
        "eligibility_rules": {"occupations": ["farmer"], "income_max": None, "states": []},
        "documents_required": ["aadhaar", "bank_passbook", "land_record", "mobile_number", "passport_photo"],
        "application_modes": ["online", "csc"],
        "application_url": "https://pmkisan.gov.in",
        "source_url": "https://pmkisan.gov.in",
        "is_published": True,
        "warning": "Aadhaar must be linked to bank account before applying",
        "rejection_risks": [
            {"risk": "Name mismatch between Aadhaar and land records", "fix": "Visit Aadhaar centre to update name to exactly match land records"},
            {"risk": "Aadhaar not linked to bank account", "fix": "Visit any bank branch with Aadhaar card to link it"},
        ],
        "translations": {
            "hi": {"name": "पीएम किसान सम्मान निधि", "warning": "आवेदन से पहले आधार को बैंक खाते से लिंक करना ज़रूरी है"},
            "mr": {"name": "पीएम किसान सन्मान निधी", "warning": "अर्ज करण्यापूर्वी आधार बँक खात्याशी जोडणे आवश्यक आहे"},
        },
    },
    {
        "scheme_code": "pmfby",
        "name": "PM Fasal Bima Yojana",
        "description": "Crop insurance scheme covering losses from natural calamities, pests, and disease, for farmers who apply within the sowing-linked deadline.",
        "benefits": "Full coverage of crop loss value, subject to insurance terms.",
        "ministry": "Ministry of Agriculture",
        "category": "agriculture",
        "eligibility_rules": {"occupations": ["farmer"], "income_max": None, "states": []},
        "documents_required": ["aadhaar", "bank_passbook", "land_record", "crop_sowing_certificate"],
        "application_modes": ["csc", "offline"],
        "application_url": "https://pmfby.gov.in",
        "source_url": "https://pmfby.gov.in",
        "is_published": True,
        "warning": "Must apply within 2 weeks of sowing",
        "rejection_risks": [
            {"risk": "Application submitted after sowing deadline", "fix": "Apply within 2 weeks of crop sowing"},
            {"risk": "Incorrect crop or area details", "fix": "Cross-verify with Khasra document before filling"},
        ],
        "translations": {
            "hi": {"name": "प्रधानमंत्री फसल बीमा", "warning": "बुआई के 2 हफ्ते के अंदर आवेदन करना ज़रूरी है"},
            "mr": {"name": "पंतप्रधान पीक विमा योजना", "warning": "पेरणीच्या 2 आठवड्यांच्या आत अर्ज करणे आवश्यक आहे"},
        },
    },
    {
        "scheme_code": "pmay_rural",
        "name": "PM Awas Yojana (Rural)",
        "description": "Housing assistance for rural families without a pucca house, disbursed in installments to those listed in the SECC 2011 beneficiary database.",
        "benefits": "₹1.3 lakh, disbursed in installments after approval.",
        "ministry": "Ministry of Rural Development",
        "category": "housing",
        "eligibility_rules": {"occupations": [], "income_max": None, "states": [], "categories": ["BPL"]},
        "documents_required": ["aadhaar", "ration_card", "income_certificate", "bank_passbook", "passport_photo"],
        "application_modes": ["offline"],
        "application_url": "https://pmayg.nic.in",
        "source_url": "https://pmayg.nic.in",
        "is_published": True,
        "warning": "Must be in SECC 2011 beneficiary list",
        "rejection_risks": [
            {"risk": "Name not in SECC 2011 list", "fix": "Check at Gram Panchayat and apply for inclusion"},
            {"risk": "Already owns a pucca house", "fix": "Scheme only for those without any pucca house in India"},
        ],
        "translations": {
            "hi": {"name": "पीएम आवास योजना ग्रामीण", "warning": "SECC 2011 लाभार्थी सूची में नाम होना ज़रूरी है"},
            "mr": {"name": "पीएम आवास योजना ग्रामीण", "warning": "SECC 2011 लाभार्थी यादीत नाव असणे आवश्यक आहे"},
        },
    },
    {
        "scheme_code": "ayushman_bharat",
        "name": "Ayushman Bharat PMJAY",
        "description": "Health insurance scheme providing cashless hospitalization cover at empanelled hospitals for families listed in the SECC database.",
        "benefits": "Cashless treatment up to ₹5,00,000 per family per year.",
        "ministry": "Ministry of Health",
        "category": "health",
        "eligibility_rules": {"occupations": [], "income_max": None, "states": [], "categories": ["BPL"]},
        "documents_required": ["aadhaar", "ration_card", "mobile_number"],
        "application_modes": ["online", "csc"],
        "application_url": "https://pmjay.gov.in",
        "source_url": "https://pmjay.gov.in",
        "is_published": True,
        "warning": None,
        "rejection_risks": [
            {"risk": "Family not in SECC database", "fix": "Check eligibility at pmjay.gov.in using mobile number"},
            {"risk": "Treatment at non-empanelled hospital", "fix": "Only empanelled hospitals accept Ayushman Card"},
        ],
        "translations": {"hi": {"name": "आयुष्मान भारत PMJAY"}, "mr": {"name": "आयुष्मान भारत PMJAY"}},
    },
    {
        "scheme_code": "pm_mudra",
        "name": "PM Mudra Yojana",
        "description": "Collateral-free loans for small business owners and aspiring entrepreneurs, disbursed through banks and NBFCs based on a business plan.",
        "benefits": "Loans up to ₹10 lakh.",
        "ministry": "Ministry of Finance",
        "category": "employment",
        "eligibility_rules": {"occupations": ["business_owner", "entrepreneur"], "income_max": None, "states": []},
        "documents_required": ["aadhaar", "pan_card", "bank_passbook", "passport_photo"],
        "application_modes": ["offline"],
        "application_url": "https://mudra.org.in",
        "source_url": "https://mudra.org.in",
        "is_published": True,
        "warning": "Prior business experience required",
        "rejection_risks": [
            {"risk": "No business plan or proof of business activity", "fix": "Prepare a simple business plan before visiting bank"},
            {"risk": "Poor credit history or existing loan default", "fix": "Check CIBIL score at bank before applying"},
        ],
        "translations": {
            "hi": {"name": "पीएम मुद्रा योजना", "warning": "व्यापार का पूर्व अनुभव ज़रूरी है"},
            "mr": {"name": "पीएम मुद्रा योजना", "warning": "व्यवसायाचा आधीचा अनुभव आवश्यक आहे"},
        },
    },
    {
        "scheme_code": "pm_ujjwala",
        "name": "PM Ujjwala Yojana",
        "description": "Free LPG gas connections for women from BPL households, to replace unsafe cooking fuel sources with clean cooking gas.",
        "benefits": "Free LPG connection plus first cylinder, one per household.",
        "ministry": "Ministry of Petroleum",
        "category": "welfare",
        "eligibility_rules": {"occupations": [], "income_max": None, "states": [], "categories": ["BPL"], "gender": "female"},
        "documents_required": ["aadhaar", "ration_card", "bank_passbook"],
        "application_modes": ["offline"],
        "application_url": "https://pmuy.gov.in",
        "source_url": "https://pmuy.gov.in",
        "is_published": True,
        "warning": "BPL Ration Card mandatory",
        "rejection_risks": [
            {"risk": "LPG connection already exists at address", "fix": "Only one connection per household"},
            {"risk": "Name not matching BPL list", "fix": "Ensure Aadhaar name matches BPL ration card exactly"},
        ],
        "translations": {
            "hi": {"name": "पीएम उज्ज्वला योजना", "warning": "BPL राशन कार्ड होना अनिवार्य है"},
            "mr": {"name": "पीएम उज्ज्वला योजना", "warning": "BPL रेशन कार्ड असणे अनिवार्य आहे"},
        },
    },
    {
        "scheme_code": "pmkvy",
        "name": "PMKVY Skill Development",
        "description": "Free vocational skill training with certification and placement assistance, delivered through registered training centres.",
        "benefits": "Free training, certificate, and placement assistance.",
        "ministry": "Ministry of Skill Development",
        "category": "education",
        "eligibility_rules": {"occupations": [], "income_max": None, "states": []},
        "documents_required": ["aadhaar", "educational_certificate", "passport_photo"],
        "application_modes": ["online", "offline"],
        "application_url": "https://pmkvyofficial.org",
        "source_url": "https://pmkvyofficial.org",
        "is_published": True,
        "warning": None,
        "rejection_risks": [
            {"risk": "Centre not available for chosen skill", "fix": "Check pmkvyofficial.org for available courses near you"},
        ],
        "translations": {"hi": {"name": "PMKVY कौशल विकास"}, "mr": {"name": "PMKVY कौशल्य विकास"}},
    },
    {
        "scheme_code": "sukanya_samriddhi",
        "name": "Sukanya Samridhi Yojana",
        "description": "Long-term savings scheme for a girl child's education and marriage expenses, opened at a post office or bank before she turns 10.",
        "benefits": "8.2% interest, minimum ₹250 to open, annual deposits until age 15.",
        "ministry": "Ministry of Finance",
        "category": "welfare",
        "eligibility_rules": {"occupations": [], "income_max": None, "states": [], "max_age": 10, "gender": "female"},
        "documents_required": ["aadhaar", "bank_passbook", "domicile_certificate"],
        "application_modes": ["offline"],
        "application_url": "https://www.indiapost.gov.in",
        "source_url": "https://www.indiapost.gov.in",
        "is_published": True,
        "warning": "Girl child must be under 10 years",
        "rejection_risks": [
            {"risk": "Girl child above 10 years", "fix": "Scheme is only for girls below 10 years"},
        ],
        "translations": {
            "hi": {"name": "सुकन्या समृद्धि योजना", "warning": "बेटी की उम्र 10 साल से कम होनी चाहिए"},
            "mr": {"name": "सुकन्या समृद्धी योजना", "warning": "मुलीचे वय 10 वर्षांपेक्षा कमी असणे आवश्यक आहे"},
        },
    },
]


def seed() -> None:
    """Encodes each scheme's text and inserts/updates it in the database.
    Idempotent: running this twice updates existing rows by scheme_code
    instead of creating duplicates, so it's safe to re-run after editing
    SEED_SCHEMES."""
    embedding_service.load()

    db = SessionLocal()
    try:
        for entry in SEED_SCHEMES:
            entry = dict(entry)  # don't mutate the module-level list
            translations = entry.pop("translations", {})

            text_to_embed = f"{entry['name']}. {entry.get('description', '')}"
            embedding = embedding_service.encode(text_to_embed)

            existing = db.query(Scheme).filter(Scheme.scheme_code == entry["scheme_code"]).first()
            if existing:
                for key, value in entry.items():
                    setattr(existing, key, value)
                existing.translations = translations
                existing.embedding = embedding
                logger.info("Updated existing scheme: %s", entry["scheme_code"])
            else:
                scheme = Scheme(**entry, translations=translations, embedding=embedding)
                db.add(scheme)
                logger.info("Inserted new scheme: %s", entry["scheme_code"])

        db.commit()
    finally:
        db.close()

    logger.info("Seeding complete: %d scheme(s) processed.", len(SEED_SCHEMES))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed()