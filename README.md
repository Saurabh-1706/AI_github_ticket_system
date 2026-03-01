# Git IntelliSolve — AI-Powered GitHub Issue Manager

> Analyze, prioritize, and resolve GitHub issues faster using AI.

---

## Features

### Core
- **Repository Analysis** — Fetch and cache all issues from any GitHub repo
- **AI Issue Triage** — Auto-classify issues by type (Bug, Feature, Security, etc.) and criticality (Critical → Low)
- **AI Solutions** — GPT-generated fix suggestions with code context from the indexed repository
- **Solution Regeneration** — Delete stale solutions and generate fresh ones on demand
- **Duplicate Detection** — Identify similar/duplicate issues automatically
- **Full-Text Search** — Search across all cached issues instantly

### AI Features
| Feature | Description |
|---|---|
| 🏷️ **Label Suggestions** | Recommended GitHub labels per issue |
| 📊 **Priority Scoring** | ML-style priority score (0–100) per issue |
| 👥 **Auto-assign Suggestions** | Top-3 suggested assignees based on commit history |
| 📝 **Release Notes Generator** | GPT-generated release notes from closed milestone issues |
| 🛡️ **Risk Assessment Report** | Project health & risk report with PDF export |

### Views
- **Card View** — Rich issue cards with AI badges
- **Table View** — Sortable, filterable table
- **Analytics Dashboard** — Charts for type breakdown, criticality, weekly trends, duplicate rate

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Backend | FastAPI (Python), Uvicorn |
| Database | MongoDB (Motor async driver) |
| AI | OpenAI GPT-4o-mini |
| Auth | JWT + GitHub OAuth + Google OAuth |

---

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.10+
- MongoDB running locally (`mongodb://localhost:27017`)
- OpenAI API key
- GitHub OAuth App (Client ID + Secret)

### Environment Variables

**Backend** — create `be/.env`:
```env
MONGO_URI=mongodb://localhost:27017
OPENAI_API_KEY=sk-...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
JWT_SECRET=your-secret-key
```

**Frontend** — create `fe/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Run Locally

**Backend:**
```bash
cd be
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd fe
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Email/password login |
| `GET` | `/api/auth/me` | Get current user |
| `POST` | `/api/github/analyze` | Analyze & cache a repository |
| `GET` | `/api/github/issues` | List cached issues |
| `GET` | `/api/analytics/summary` | Issue analytics for a repo |
| `GET` | `/api/ai/label-suggestions/{owner}/{repo}/{number}` | AI label suggestions |
| `GET` | `/api/ai/priority-score/{owner}/{repo}/{number}` | Priority score |
| `GET` | `/api/ai/suggest-assignees/{owner}/{repo}/{number}` | Auto-assign suggestions |
| `GET` | `/api/ai/milestones/{owner}/{repo}` | List milestones |
| `POST` | `/api/ai/release-notes` | Generate release notes |
| `GET` | `/api/ai/risk-report/{owner}/{repo}` | Risk assessment report |

---

## Risk Assessment Report

The **🛡️ Risk Report** button on the repository page generates a comprehensive AI-powered risk assessment including:

- Overall risk score (0–100) with level (Low / Medium / High / Critical)
- Executive summary
- Issue statistics (total, open, close rate, duplicate rate, stale issues)
- Risk area scores: Code Quality, Security, Tech Debt, Team Velocity, Reliability
- Top 3–5 identified risks with mitigations
- Numbered recommendations for future projects
- Hot-spot keyword analysis of open issues
- **Direct PDF download** (no print dialog)

---

## Project Structure

```
├── fe/                  # Next.js frontend
│   └── app/
│       ├── components/  # UI components
│       ├── services/    # API service functions
│       └── repository/  # Repository page
└── be/                  # FastAPI backend
    └── app/
        ├── api/         # Route handlers
        ├── db/          # MongoDB client
        └── utils/       # GitHub fetcher, code indexer
```
