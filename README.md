# Code Impact Mapper 🎯💥

> **"If I change this function, what other parts of my codebase could be affected?"**

![Status](https://img.shields.shields.io/badge/Status-Production--Grade%20Static%20Analyzer-brightgreen)
![Frontend](https://img.shields.shields.io/badge/Frontend-Next.js%2014%20%2F%20Tailwind-blue)
![Backend](https://img.shields.shields.io/badge/Backend-FastAPI%20%2F%20NetworkX-009688)
![AI Engine](https://img.shields.shields.io/badge/AI-Google%20GenAI%20Gemini%202.0%20Flash-8E44AD)

---

## 🎯 Overview & Product Principle

**Code Impact Mapper** is a production-grade developer tool for static source-code analysis and blast-radius prediction.

Unlike superficial mockup tools or static UI frameworks, Code Impact Mapper **actually fetches, unpacks, and parses real JavaScript and TypeScript source files from public GitHub repositories**, extracts AST definitions, builds a cross-file symbol call graph in NetworkX, and computes exact direct/indirect blast radius metrics when a function is selected.

---

## 🔍 How Repository Analysis Works

1. **GitHub Unpacking & Ingestion**:
   - Downloads public GitHub repository ZIP archives via GitHub REST API.
   - Extracts source files into temporary OS directories.
   - Safely ignores non-code directories (`.git`, `node_modules`, `dist`, `build`, `.next`, `__pycache__`) and large binary assets.
2. **AST Parsing & Symbol Extraction**:
   - Parses JavaScript (`.js`, `.jsx`, `.mjs`, `.cjs`) and TypeScript (`.ts`, `.tsx`).
   - Extracts functions, arrow functions, class methods, parameters, line ranges, and exact source code snippets.
   - Tracks supported vs unsupported files, logging non-fatal warnings without stopping analysis.
3. **Cross-File Import & Call Resolution**:
   - Resolves named imports (`import { foo } from './utils'`), default imports (`import Bar from './service'`), namespace imports (`import * as Utils from './utils'`), and relative module paths (`./`, `../`).
   - Distinguishes **confirmed relationships** (explicit static import & call matches) vs **inferred relationships** (unimported global matching).
4. **NetworkX Directed Graph Construction**:
   - Constructs a directed graph `G = (V, E)` with nodes (`repository`, `file`, `function`, `module`, `class`) and edges (`contains`, `calls`, `exports`).
5. **Blast Radius & Risk Calculation**:
   - Uses NetworkX BFS predecessor traversal to calculate direct callers, transitive indirect callers, internal callees, affected files, and maximum dependency depth.
6. **AI Explanation & Local Fallback**:
   - Proxies requests to **Google Gemini 2.0 Flash** (`google-genai` SDK) for plain-language risk breakdowns, or generates local deterministic explanations when offline/unconfigured.

---

## 🛠️ Supported Languages & Extensibility

- **Primary Supported Languages**: JavaScript (`.js`, `.jsx`, `.mjs`, `.cjs`), TypeScript (`.ts`, `.tsx`).
- **Unsupported Files**: Skipped safely, reported in post-analysis metrics (`unsupported_file_count`), and logged as non-fatal warnings.
- **Modular Architecture**: Extensible parser pipeline (`app/analyzer/parser.py` & `app/analyzer/resolver.py`) ready for Python, Go, or Java static analyzers.

---

## 📊 Blast Radius & Deterministic Risk Score Methodology

> **Note**: Clearly labeled as a *"Heuristic risk score — not a production incident prediction."*

The score ($0 - 100$) is computed transparently using exact risk factor weights:

$$\text{Score} = \min\left(100, \left(N_{\text{direct}} \times 15\right) + \left(N_{\text{indirect}} \times 8\right) + \left(D_{\text{max}} \times 10\right) + B_{\text{export}} + \left(\frac{N_{\text{total}}}{N_{\text{repo}}} \times 30\right)\right)$$

### Factor Breakdown:
- **Direct Callers Count ($N_{\text{direct}}$)**: Weight $15$ per direct caller
- **Transitive Callers Count ($N_{\text{indirect}}$)**: Weight $8$ per indirect caller
- **Max Dependency Depth ($D_{\text{max}}$)**: Weight $10$ per hop level
- **Export Bonus ($B_{\text{export}}$)**: $+15$ if focal function is an exported public module interface
- **System Ratio**: Percentage of codebase functions affected

### Severity Ratings:
- **Critical**: Score $\ge 75$ or Impacted Callers $\ge 7$
- **High**: Score $\ge 50$ or Impacted Callers $\ge 4$
- **Medium**: Score $\ge 20$ or Impacted Callers $\ge 1$
- **Low**: Score $< 20$

---

## ⚙️ Local Setup & Execution

### 1. Start Python FastAPI Backend (Port 8000)

```bash
# Navigate to backend
cd backend

# Install dependencies
pip install -r requirements.txt

# Run pytest unit & integration tests
$env:PYTHONPATH="."
pytest

# Launch FastAPI backend
python -m uvicorn app.main:app --port 8000 --reload
```

### 2. Start Next.js Frontend (Port 3000)

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Verify build
npm run build

# Launch Next.js dev server
npm run dev
```

---

## 📡 API Endpoints Specification

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Backend status check (`{"status": "ok"}`) |
| `POST` | `/api/repository/analyze` | Fetches public GitHub repo, parses AST, and builds graph |
| `GET` | `/api/analysis/{analysis_id}` | Fetches stored graph session data |
| `POST` | `/api/impact/analyze` | Calculates blast radius and returns Gemini AI risk explanation |

---

## ⚠️ Known Limitations & Static Analysis Scope

1. **Dynamic Execution & Reflection**: Reflection (`eval()`, dynamic `require(variable)`, `window[str]()`) cannot be statically resolved and are marked as inferred or unlinked.
2. **Framework Magic**: Advanced DI containers or dynamic string routing are analyzed based on static imports and explicit function call references.
3. **Huge Repositories (> 5,000 source files)**: GitHub REST API rate limits and zip memory buffers limit single-pass analysis to source files up to 300KB per file.
