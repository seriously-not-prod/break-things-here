# Lighthouse Baseline

> Captured by CI on branch `feature/816-lighthouse-ci-gate`  
> Gate threshold: **≥ 90** for Performance, Accessibility, Best Practices, SEO  
> All scores are on a 0–100 scale.

---

## Desktop Baseline

| Route        | Performance | Accessibility | Best Practices | SEO |
| ------------ | :---------: | :-----------: | :------------: | :-: |
| `/login`     |      —      |       —       |       —        |  —  |
| `/dashboard` |      —      |       —       |       —        |  —  |
| `/events`    |      —      |       —       |       —        |  —  |
| `/guests`    |      —      |       —       |       —        |  —  |
| `/budget`    |      —      |       —       |       —        |  —  |

## Mobile Baseline

| Route        | Performance | Accessibility | Best Practices | SEO |
| ------------ | :---------: | :-----------: | :------------: | :-: |
| `/login`     |      —      |       —       |       —        |  —  |
| `/dashboard` |      —      |       —       |       —        |  —  |
| `/events`    |      —      |       —       |       —        |  —  |
| `/guests`    |      —      |       —       |       —        |  —  |
| `/budget`    |      —      |       —       |       —        |  —  |

---

## Notes

- Baseline scores are populated automatically on the first successful CI run.
- Scores marked `—` will be filled in by `lhci autorun` on the initial green build.
- If a score drops below **90** on any route (desktop or mobile), the PR is blocked.
- Results are uploaded as GitHub Actions artifacts (retained 30 days) and posted
  as a PR comment for every run.

## Audited Routes

| Route        | Description                |
| ------------ | -------------------------- |
| `/login`     | Authentication entry point |
| `/dashboard` | Main application dashboard |
| `/events`    | Event listing page         |
| `/guests`    | Guest management page      |
| `/budget`    | Budget management page     |

## CI Configuration

- Config file: `lighthouserc.json` (repo root)
- Workflow: `.github/workflows/lighthouse.yml`
- Runs: desktop + mobile on every PR to `develop`, `test`, `stage`, `main`
- Assertions: `categories:performance`, `categories:accessibility`,
  `categories:best-practices`, `categories:seo` — all must score ≥ 0.9
