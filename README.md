# natale-dentista

Simple static website for a dental practice. This repository contains HTML, CSS, JS and image assets used for the site.

Publishing
1. Repository already has a GitHub Actions workflow that deploys the repository root to GitHub Pages on pushes to `main` (file: `.github/workflows/deploy-pages.yml`).
2. Ensure the repository is hosted on GitHub at `https://github.com/edu-unstated/natale-dentista` and that GitHub Pages is enabled in the repository settings (GitHub should automatically deploy via Actions to the `gh-pages` pages site). The workflow uses the repository root as the pages source.
3. Push changes to the `main` branch and check the Actions tab to follow the deployment steps. After a successful run, visit the Pages URL shown in the repository settings.

Notes
- The site is static (HTML/CSS/JS). No build step required.
- If you prefer to publish from a `docs/` folder or a build output directory, modify the workflow `path` in `.github/workflows/deploy-pages.yml` accordingly.

If you want, I can also:
- Configure a custom domain (add CNAME and DNS records),
- Add a small CI check that validates HTML/CSS,
- Split assets into `docs/` for Pages if you prefer.
