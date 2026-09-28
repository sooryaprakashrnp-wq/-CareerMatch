# CareerMatch

An explainable student opportunity matching MVP. Students enter skills, interests, study year, CGPA, location, and preferred formats. CareerMatch checks eligibility, then ranks internships, hackathons, and fellowships with clear reasons and skills to develop.

> **Demo data:** The eight organizations and listings in `data/opportunities.json` are fictional examples. They are not current openings. No application links are provided.

## Run locally

Requires Node.js 20+. No external packages or API keys.

```bash
npm start
```

Open http://localhost:3000. For development use `npm run dev`; for tests use `npm test`. Set `PORT` if 3000 is occupied.

## How matching works

1. Hard eligibility check: study year and minimum CGPA. Ineligible opportunities remain visible when the user turns off **Eligible only**, with the specific reason displayed.
2. Explainable 0–100 fit score: skill overlap (40%), domain interest overlap (30%), preferred type (12%), preferred mode (10%), location (8%). Missing preferences receive a neutral half score. On-site location is compared with the entered city; other modes receive a neutral location score.
3. Eligible opportunities appear first, followed by ineligible opportunities. Each group is sorted by fit score and title. The score is a transparent heuristic, **not a trained ML model or a predicted hiring probability**.

Profiles are stored only in the user's browser via `localStorage`. The API has no database, registration, or analytics. Refreshing with a saved profile recomputes matches.

## API

`GET /api/opportunities` returns the demo catalog. `POST /api/match` accepts JSON like:

```json
{
  "year": 3,
  "cgpa": 7.69,
  "location": "Coimbatore",
  "skills": ["Python", "Figma"],
  "interests": ["AI / ML", "UI / UX"],
  "preferredTypes": ["Internship", "Hackathon"],
  "preferredModes": ["Remote", "Online"]
}
```

The response is `{ "results": [...] }` with `score`, `eligible`, `reasons`, `missing`, and `matchedSkills` for each listing. Invalid profiles return HTTP 400.

## Next development milestones

- Replace fictional listings with permissioned, sourced opportunity feeds. Add source URLs, verified deadlines, deduplication, and expiry checks before claiming listings are live.
- Collect opt-in interaction feedback. Create held-out relevance judgments and evaluate Precision@K or Recall@K against a keyword baseline before adding embeddings or a learned reranker.
- Add account access and server-side storage only if users need cross-device synchronization; provide privacy controls.

The current version demonstrates product flow and transparent ranking. It does not claim real users, model accuracy, or placement outcomes.
