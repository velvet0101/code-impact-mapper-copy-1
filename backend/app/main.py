import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from app.api import health, repo, impact

load_dotenv()

app = FastAPI(
    title="Code Impact Mapper API",
    description="Automated Source-Code Analysis, Interactive Dependency Graph & AI Blast Radius Engine",
    version="1.0.0"
)

# CORS middleware for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(repo.router, prefix="/api", tags=["Repository"])
app.include_router(impact.router, prefix="/api", tags=["Impact Analysis"])

@app.get("/")
def root():
    return {
        "message": "Welcome to Code Impact Mapper Backend API",
        "docs": "/docs",
        "health": "/api/health"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
