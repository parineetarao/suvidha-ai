"""
services/letter_service.py

Renders the formal application letter a citizen needs once their
application reaches "letter_generated" — meant to be printed at a CSC,
handed to a government office, or read aloud by a CSC operator.

Templates are Jinja2 (templates/letters/*.j2) rather than an f-string /
.format() approach specifically because of template *inheritance*:
base.j2 owns the boilerplate every letter needs (date, salutation,
declaration, signature block), and scheme-specific templates
(pmkisan.j2, pmay.j2) only override the {% block body %} with their own
wording. Adding a bespoke letter for a newly-onboarded scheme is a
one-file addition, never a code change here.

Deliberately renders plain text, not HTML — this is a letter, not a web
page, so autoescape is off (there is no HTML to escape, and escaping plain
text would mangle ordinary punctuation like apostrophes).
"""

import uuid
from datetime import date
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, TemplateNotFound
from sqlalchemy.orm import Session

from app.models.application import Application
from app.models.scheme import Scheme
from app.models.user import User, UserProfile
from app.services import application_service

# backend/app/services/letter_service.py -> parents: services, app, backend
TEMPLATES_DIR = Path(__file__).resolve().parent.parent.parent / "templates" / "letters"

_env = Environment(
    loader=FileSystemLoader(TEMPLATES_DIR),
    trim_blocks=True,
    lstrip_blocks=True,
    autoescape=False,
)

# scheme_code -> template filename. Anything not listed here (which, as
# more schemes onboard, will be most of them) falls back to generic.j2.
SCHEME_TEMPLATES: dict[str, str] = {
    "PM-KISAN": "pmkisan.j2",
    "PMAY": "pmay.j2",
}


def _render(db: Session, application: Application) -> str:
    user = db.get(User, application.user_id)
    profile = db.get(UserProfile, application.user_id)
    scheme = db.get(Scheme, application.scheme_id)

    template_name = SCHEME_TEMPLATES.get(scheme.scheme_code, "generic.j2")
    try:
        template = _env.get_template(template_name)
    except TemplateNotFound:
        template = _env.get_template("generic.j2")

    return template.render(
        applicant_name=user.full_name or "Applicant",
        scheme_name=scheme.name,
        ministry=scheme.ministry,
        reference_number=application.reference_number,
        today=date.today(),
        district=profile.district if profile else None,
        state_code=profile.state_code if profile else None,
    )


def generate_letter(db: Session, application: Application, changed_by: uuid.UUID | None = None) -> str:
    """
    POST /applications/{id}/generate-letter. Assigns reference_number only
    on first generation — regenerating the same letter later (e.g. after a
    typo'd name is corrected upstream) must not hand out a second reference
    number for one application. Advances the state machine via
    application_service.transition_status(); "docs_pending -> letter_generated"
    is the only legal move into this state, so calling this on a draft
    application (documents not yet verified) correctly raises
    InvalidTransition instead of silently producing a letter.
    """
    if application.reference_number is None:
        application.reference_number = f"SVD-{application.id.hex[:8].upper()}"

    application_service.transition_status(db, application, "letter_generated", changed_by=changed_by)

    return _render(db, application)
