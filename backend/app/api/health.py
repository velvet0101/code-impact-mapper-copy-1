from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "code-impact-mapper-backend",
        "version": "1.0.0"
    }
