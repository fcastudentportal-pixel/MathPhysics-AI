import os
import re
from typing import Literal

import httpx
import sympy as sp
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

app = FastAPI(
    title="MathPhysics AI API",
    description="API for symbolic equation solving and an optional AI tutor.",
    version="0.1.0",
)

origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5178,http://127.0.0.1:5178",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

class SolveRequest(BaseModel):
    equation: str = Field(min_length=3, max_length=300)
    variable: str = Field(default="x", pattern=r"^[a-zA-Z]$")

    @field_validator("equation")
    @classmethod
    def validate_equation(cls, value: str) -> str:
        if not re.fullmatch(r"[0-9a-zA-Z_+\-*/^().=,\s]+", value):
            raise ValueError("Use only ordinary equation characters, numbers, and letters.")
        if value.count("=") != 1:
            raise ValueError("Enter exactly one equals sign, for example 2*x + 3 = 7.")
        return value.strip()

class TutorRequest(BaseModel):
    question: str = Field(min_length=5, max_length=5000)
    style: Literal["guided", "hint", "steps", "check"] = "guided"

@app.get("/")
def root():
    return {"name": "MathPhysics AI API", "status": "running", "docs": "/docs"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/solve")
def solve_equation(request: SolveRequest):
    """Solve a single-variable equation with SymPy, using a restricted parser."""
    try:
        left_text, right_text = [part.strip() for part in request.equation.split("=", 1)]
        variable = sp.Symbol(request.variable)
        local_dict = {request.variable: variable}
        left = sp.sympify(left_text, locals=local_dict, evaluate=True)
        right = sp.sympify(right_text, locals=local_dict, evaluate=True)

        # Reject unsupported symbols and non-polynomial/complex expression features at this stage.
        free_symbols = left.free_symbols | right.free_symbols
        if free_symbols - {variable}:
            raise ValueError("Use only the selected unknown variable in this first version.")
        equation = sp.Eq(left, right)
        solutions = sp.solve(equation, variable)
        solution_text = [str(sp.simplify(item)) for item in solutions]
        return {
            "equation": request.equation,
            "variable": request.variable,
            "solutions": solution_text,
            "method": "SymPy symbolic solver",
            "note": "Check whether each solution is valid in the original equation. This initial endpoint focuses on single-variable equations."
        }
    except (sp.SympifyError, SyntaxError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Could not solve this equation: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="The equation could not be solved in this format.") from exc

STYLE_INSTRUCTIONS = {
    "guided": "Use a Socratic tutoring style: begin by identifying what is known and what is being asked, then ask one useful next-step question. Do not dump every step immediately.",
    "hint": "Give a small helpful hint first, not the complete solution unless essential for safety or clarity.",
    "steps": "Explain the method in numbered steps, show formulas and substitutions, include units for physics, and clearly state the final answer.",
    "check": "Ask for the learner's working if it is missing. If working is provided, check it carefully and explain any error respectfully."
}

@app.post("/tutor")
async def tutor(request: TutorRequest):
    api_key = os.getenv("AI_API_KEY", "").strip()
    model = os.getenv("AI_MODEL", "").strip()
    base_url = os.getenv("AI_BASE_URL", "https://api.openai.com/v1").strip().rstrip("/")
    if not api_key or not model:
        raise HTTPException(
            status_code=503,
            detail="AI tutor is not configured yet. Add AI_API_KEY and AI_MODEL as secure backend environment variables."
        )

    system_prompt = (
        "You are MathPhysics AI, a careful mathematics and physics tutor for learners. "
        "Use correct notation, state assumptions, check units and distinguish exact from approximate answers. "
        "Do not claim certainty when a problem is ambiguous. For physics, identify known values, unknowns, formula, substitutions, units and final result when appropriate. "
        "For math, explain the method at the learner's requested level. Never fabricate a calculation; if uncertain, say so. "
        + STYLE_INSTRUCTIONS[request.style]
    )
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": request.question},
        ],
        "temperature": 0.2,
    }
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail="The AI provider returned an error. Check the backend model and provider configuration.")
        data = response.json()
        answer = data["choices"][0]["message"]["content"]
        if not isinstance(answer, str) or not answer.strip():
            raise HTTPException(status_code=502, detail="The AI provider returned an empty response.")
        return {"answer": answer.strip(), "model": model}
    except HTTPException:
        raise
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Could not reach or understand the AI provider response.") from exc
