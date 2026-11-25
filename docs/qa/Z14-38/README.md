# Z14-38 trainer web cache headers (no visual change)

`apps/trainer-web/public/_headers` is copied to `dist/_headers` by Vite and read by Workers static assets.
Covered by `apps/trainer-web/worker/headers.test.ts` (runs a real `vite build` into a temp dir).

After the next trainer-web staging deploy, FitBud Tech can confirm:

```bash
curl -sI https://<staging-trainer-web>/assets/<hashed-file>.js | grep -i cache-control
# cache-control: public, max-age=31536000, immutable
curl -sI https://<staging-trainer-web>/ | grep -i cache-control
curl -sI https://<staging-trainer-web>/index.html | grep -i cache-control
# cache-control: no-cache
curl -sI https://<staging-trainer-web>/_headers   # not served as a header file (falls to SPA HTML)
```

Favicons, icons and `site.webmanifest` keep the platform default. SPA paths like `/clients` keep the default too.
