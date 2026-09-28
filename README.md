# Paper Marker - AI Marking Module

AI-powered exam marking for Urdu and English answers, built as part of a
larger FYP system (Paper Marker: Multi-Agent AI Marking and Secure Result
Storage). This repo covers the AI marking module only - scanning/upload
and secure result storage are separate teammates' modules.

## Architecture

The project is split into three services that run independently and talk
to each other over HTTP:

```
frontend/     React + Vite (port 5173) - the website you open in a browser
    |
backend/      ASP.NET Core Web API, C# (port 5000) - auth, roles, papers,
    |         decisions, supervisor approval, email verification
    v
ai-service/   Python FastAPI (port 8001) - the actual AI agents
              (Rubric, Solution, Evaluation, Critic) and OCR
```

`frontend` talks only to `backend`. `backend` is the only thing that
talks to `ai-service`. You need all three running at the same time.

There is no real database - everything (accounts, papers, marks,
decisions) lives in memory and resets when `backend` restarts. That's
intentional: persistent storage is a separate module, owned by another
teammate.

## 1. Install prerequisites

You need all four of these installed on your machine:

| Tool | Used for | Check with |
|---|---|---|
| **Python 3.11+** | the AI agents (`ai-service/`) | `python --version` |
| **.NET 10 SDK** | the API backend (`backend/`) | `dotnet --version` |
| **Node.js 20+** (includes npm) | the website (`frontend/`) | `node --version` |
| **Tesseract OCR** *(optional)* | only needed for the "Upload New Paper" photo/PDF feature | - |

- .NET 10 SDK: https://dotnet.microsoft.com/download
- Node.js: https://nodejs.org (LTS version)
- Tesseract OCR (Windows installer): https://github.com/UB-Mannheim/tesseract/wiki
  - Skip this if you're not testing the photo-upload feature - the app works fine without it otherwise.

## 2. Get the code

```
git clone https://github.com/AleeshaAamir/paper-marker-agents.git
cd paper-marker-agents
```

## 3. Set up the Python side (`ai-service/`)

From the repo root:

```
python -m venv venv
```

Then activate it:
- **Windows (PowerShell/cmd):** `venv\Scripts\activate`
- **Windows (Git Bash):** `source venv/Scripts/activate`
- **Mac/Linux:** `source venv/bin/activate`

Then install dependencies (still from the repo root):

```
pip install -r requirements.txt
```

## 4. Set up the .NET side (`backend/`)

No manual install step needed - `dotnet run` (below) restores its own
packages automatically the first time you run it.

## 5. Set up the React side (`frontend/`)

```
cd frontend
npm install
cd ..
```

This step downloads npm packages and can take a while depending on your
internet connection.

## 6. Run all three services

Open **three separate terminals**, one per service, all from the repo root:

**Terminal 1 - AI service:**
```
cd ai-service
../venv/Scripts/python -m uvicorn app:app --port 8001        # Windows
../venv/bin/python -m uvicorn app:app --port 8001             # Mac/Linux
```

**Terminal 2 - Backend API:**
```
cd backend
dotnet run --urls http://localhost:5000
```

**Terminal 3 - Frontend website:**
```
cd frontend
npm run dev
```

Once all three say they're running, open **http://localhost:5173** in
your browser.

## 7. Log in

No registration needed to explore - these demo accounts already exist:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@gmail.com` | `admin123` |
| Supervisor | `supervisor@gmail.com` | `supervisor123` |
| Teacher | `teacher.demo@gmail.com` | `teacher123` |
| Student | `student.demo@gmail.com` | `student123` |

You can also register a new Teacher/Student account from the Sign Up
page - both roles must use a `@gmail.com` address.

## Notes on two optional features

**Real email verification (Sign Up flow):** by default, a new
registration shows the 6-digit verification code directly on screen
instead of emailing it (fine for testing). To actually send it by email
instead, set two environment variables before starting `backend`:

```
SMTP_EMAIL=youraddress@gmail.com
SMTP_APP_PASSWORD=your16charapppassword
```

(This needs a Gmail **App Password**, not your normal password - Google
Account → Security → 2-Step Verification → App Passwords.)

**Real AI model instead of the instant stub:** the Model dropdown in the
app defaults to "Stub (instant)", which is a fast placeholder for
testing the pipeline/UI - it does NOT actually read the answer, so don't
trust its marks. For real AI marking, select "qwen2.5:1.5b (real, fast)"
in the dropdown, which requires:

1. [Ollama](https://ollama.com) installed and running
2. The model pulled: `ollama pull qwen2.5:1.5b-instruct`

Real marking is much slower than the stub (seconds to a couple of
minutes per paper, depending on your machine), especially without a GPU.

## Running the offline tests

```
cd ai-service
../venv/Scripts/python -m tests.test_pipeline
```

Should show `13 passed, 0 failed`. These test the pipeline's hard
guarantees (marks never exceed max, OCR-confidence gating, etc.) and
don't need any of the three services running.

## Troubleshooting

- **"Cannot find native binding" error from `npm run dev`**: a known npm
  bug with optional dependencies. Run `npm install` again inside
  `frontend/`; if it persists, delete `frontend/node_modules` and
  `frontend/package-lock.json` and run `npm install` fresh.
- **Backend can't reach the AI service / marking hangs**: make sure
  Terminal 1 (`ai-service`) is actually running and shows
  `Uvicorn running on http://127.0.0.1:8001` before you try to mark a
  paper.
- **CORS errors in the browser console**: `backend/Program.cs` only
  allows requests from `http://localhost:5173` (Vite's default port). If
  you start the frontend on a different port, update the CORS policy in
  `Program.cs` to match.
