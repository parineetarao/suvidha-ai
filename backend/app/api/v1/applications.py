from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.application import Application
from app.models.user import User
from app.schemas.application import ApplicationDetail, ApplicationIn, ApplicationOut, LetterOut
from app.services import application_service, letter_service

router = APIRouter(prefix="/applications", tags=["applications"])


def _get_owned_application(db: Session, application_id: UUID, user_id: UUID) -> Application:
    app_obj = (
        db.query(Application)
        .filter(Application.id == application_id, Application.user_id == user_id)
        .first()
    )
    if not app_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    return app_obj


@router.post("", response_model=ApplicationOut, status_code=status.HTTP_201_CREATED)
def create_application(
    payload: ApplicationIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Application:
    existing = (
        db.query(Application)
        .filter(Application.user_id == current_user.id, Application.scheme_id == payload.scheme_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Application for this scheme already exists")

    app_obj = Application(user_id=current_user.id, scheme_id=payload.scheme_id, status="draft")
    db.add(app_obj)
    db.commit()
    db.refresh(app_obj)
    return app_obj


@router.get("", response_model=list[ApplicationOut])
def list_applications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Application]:
    return db.query(Application).filter(Application.user_id == current_user.id).all()


@router.get("/{application_id}", response_model=ApplicationDetail)
def get_application(
    application_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ApplicationDetail:
    app_obj = _get_owned_application(db, application_id, current_user.id)
    history = application_service.get_status_history(db, application_id)
    return ApplicationDetail(
        **ApplicationOut.model_validate(app_obj).model_dump(),
        status_history=history,
    )


@router.patch("/{application_id}", response_model=ApplicationOut)
def update_application(
    application_id: UUID,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Application:
    app_obj = _get_owned_application(db, application_id, current_user.id)

    if "status" in payload and payload["status"]:
        application_service.transition_status(
            db, application=app_obj, new_status=payload["status"], changed_by=current_user.id
        )
    if "notes" in payload:
        app_obj.notes = payload["notes"]
        db.commit()
        db.refresh(app_obj)

    return app_obj


@router.post("/{application_id}/generate-letter", response_model=LetterOut)
def generate_letter(
    application_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LetterOut:
    app_obj = _get_owned_application(db, application_id, current_user.id)

    # letter_service.generate_letter already advances the state machine to
    # "letter_generated" internally (see its docstring) — calling
    # transition_status again here would double-transition and raise
    # InvalidTransition on the second call.
    letter_text = letter_service.generate_letter(db=db, application=app_obj, changed_by=current_user.id)

    return LetterOut(letter_text=letter_text, pdf_url=None)


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(
    application_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    app_obj = _get_owned_application(db, application_id, current_user.id)
    db.delete(app_obj)
    db.commit()