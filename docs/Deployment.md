# Deployment Guide — `michael.schmidlin.casa`

This guide walks through deploying **Portfolio Website** to the same homelab stack used by [Valhalla Landing Page](https://github.com/mschmidlin1/ValhallaLandingPage): a **self-hosted GitHub Actions runner** on the home Linux PC (Mint), **Docker** images on **GHCR**, **k3s** on Mint, and public HTTPS via the existing **Cloudflare Tunnel** (`cloudflared`) on `schmidlin.casa`.

**Target URL:** `https://michael.schmidlin.casa`

**Prerequisites (already in place from Valhalla):**

- k3s cluster running on Mint with `kubectl` working
- `cloudflared` pod healthy in the `cloudflared` namespace
- `schmidlin.casa` **Active** in Cloudflare with SSL/TLS mode **Full**
- You can SSH to Mint and run `kubectl`

For background on how those pieces fit together, see the Valhalla docs at `~/repos/valhallalandingpage/docs/` — especially [Self-Hosting.md](https://github.com/mschmidlin1/ValhallaLandingPage/blob/main/docs/Self-Hosting.md) and [CustomDomainSetup.md](https://github.com/mschmidlin1/ValhallaLandingPage/blob/main/docs/CustomDomainSetup.md).

---

## Summary

| Item | Value |
|------|-------|
| **Public URL** | `https://michael.schmidlin.casa` |
| **GitHub repo** | `github.com/mschmidlin1/PortfolioWebsite` |
| **Deploy trigger** | Push to `main` (or manual workflow run) |
| **GHCR image** | `ghcr.io/mschmidlin1/portfolio-website` |
| **K8s namespace** | `portfoliowebsite` |
| **In-cluster Service URL** | `http://portfoliowebsite.portfoliowebsite.svc.cluster.local:80` |
| **Container** | nginx:alpine serving `src/` + `resources/` |

**What is shared with Valhalla:** one k3s cluster, one `cloudflared` tunnel, one Mint box. You add a **new namespace**, a **new GHCR package**, a **new self-hosted runner** for this repo, and one **new tunnel public hostname**.

**What is different from Valhalla / Dr. JAM:** Portfolio Website is a lightweight static site (HTML, CSS, JS, a few images and a PDF resume). Image builds and pulls are fast — similar to Valhalla, not the large audio assets in Dr. JAM.

---

## Architecture

```mermaid
flowchart TB
    subgraph git [GitHub]
        main[main branch]
    end

    subgraph actions [GitHub Actions on Mint]
        wf[deploy.yml]
    end

    subgraph ghcr [GHCR]
        img["ghcr.io/mschmidlin1/portfolio-website :latest / :sha"]
    end

    subgraph k3s [k3s cluster]
        ns[namespace portfoliowebsite]
        cfd[cloudflared pod]
    end

    subgraph cf [Cloudflare]
        host[michael.schmidlin.casa]
    end

    main --> wf --> img --> ns
    host --> cfd --> ns
```

When a visitor opens `https://michael.schmidlin.casa`:

1. Cloudflare DNS resolves the hostname and terminates HTTPS at the edge.
2. Traffic flows through the existing outbound tunnel to the `cloudflared` pod.
3. `cloudflared` forwards to `http://portfoliowebsite.portfoliowebsite.svc.cluster.local:80`.
4. The cluster **Service** routes to the **Pod** running nginx.
5. nginx serves `index.html`, CSS, JS, images, and the resume PDF from the container filesystem.

---

## Migration overview

| Phase | What |
|-------|------|
| 1 | Add `Dockerfile` and `.dockerignore` |
| 2 | Add Kubernetes manifests under `k8s/` |
| 3 | Register a self-hosted runner for **this** repo |
| 4 | Add `.github/workflows/deploy.yml` |
| 5 | Configure GitHub Actions permissions and GHCR package visibility |
| 6 | Push to `main` — first automated deploy |
| 7 | Add Cloudflare Tunnel public hostname for `michael.schmidlin.casa` |
| 8 | Verify end-to-end |

Phases 1–4 can land on a feature branch and merge to `main` via PR. The workflow only runs after it exists on `main` (or you push directly to `main`).

---

## Phase 1 — Docker image

Portfolio Website is a static site (HTML, CSS, JS) with assets in `resources/`. The HTML references images and the resume with paths like `../resources/images/...`, so the image must include **both** `src/` and `resources/` at the correct relative paths.

### 1.1 Create `Dockerfile` at the repo root

```dockerfile
FROM nginx:alpine

COPY src/ /usr/share/nginx/html/
COPY resources/ /usr/share/nginx/resources/

EXPOSE 80
```

With this layout, a request for `/index.html` resolves under `/usr/share/nginx/html/`, and `../resources/` resolves to `/usr/share/nginx/resources/` — matching local development with Live Server.

### 1.2 Create `.dockerignore` at the repo root

Keeps the build context small and excludes files that should not ship in the image:

```gitignore
.git
.github
.vscode
k8s
docs
README.md
.gitignore
.dockerignore
Dockerfile
.DS_Store
**/.DS_Store
```

Do **not** exclude `resources/` — profile images and the resume PDF are required in production.

### 1.3 Local smoke test (optional but recommended)

From the repo root on a machine with Docker:

```bash
docker build -t portfolio-website-local .
docker run --rm -p 8080:80 portfolio-website-local
```

Open `http://localhost:8080/` in a browser. Confirm:

- Profile image loads on the home section
- Resume download works from the Experience section
- Project thumbnails render where present

Stop the container with Ctrl+C.

---

## Phase 2 — Kubernetes manifests

Create a `k8s/` directory with Kustomize manifests. Do **not** add `cloudflared` here — the tunnel is cluster-wide infrastructure already deployed from Valhalla.

### 2.1 Directory layout

```text
k8s/
  namespace.yaml
  deployment.yaml
  service.yaml
  kustomization.yaml
```

### 2.2 `k8s/namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: portfoliowebsite
```

### 2.3 `k8s/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: portfoliowebsite
  namespace: portfoliowebsite
spec:
  replicas: 1
  selector:
    matchLabels:
      app: portfoliowebsite
  template:
    metadata:
      labels:
        app: portfoliowebsite
    spec:
      containers:
        - name: app
          image: ghcr.io/mschmidlin1/portfolio-website:latest
          ports:
            - containerPort: 80
          livenessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 3
            periodSeconds: 5
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 500m
              memory: 128Mi
```

### 2.4 `k8s/service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: portfoliowebsite
  namespace: portfoliowebsite
spec:
  type: ClusterIP
  selector:
    app: portfoliowebsite
  ports:
    - port: 80
      targetPort: 80
```

### 2.5 `k8s/kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - namespace.yaml
  - deployment.yaml
  - service.yaml
```

### 2.6 Apply once manually (optional)

On Mint, after the manifests exist locally or in a checkout:

```bash
kubectl apply -k k8s/
kubectl get all -n portfoliowebsite
```

The pod will not reach **Running** until an image exists on GHCR (Phase 6). `ImagePullBackOff` before the first CI build is expected.

---

## Phase 3 — Self-hosted GitHub Actions runner

Runners are registered **per repository**. Even if Mint already has a runner for Valhalla Landing Page or Dr. JAM, you need a **separate** runner for `PortfolioWebsite`.

### 3.1 Register the runner on Mint

1. Open [github.com/mschmidlin1/PortfolioWebsite/settings/actions/runners](https://github.com/mschmidlin1/PortfolioWebsite/settings/actions/runners).
2. Click **New self-hosted runner** → **Linux** → **x64**.
3. On Mint, create a dedicated directory (do not reuse another repo's runner folder):

   ```bash
   mkdir -p ~/actions-runner-portfolio-website && cd ~/actions-runner-portfolio-website
   ```

4. Copy and run the **Configure** commands from GitHub exactly (download tarball, extract, `./config.sh --url https://github.com/mschmidlin1/PortfolioWebsite --token ...`).
5. At the prompts, press **Enter** to accept defaults (runner group, hostname as name, `self-hosted` label, `_work` folder).
6. Install and start the service:

   ```bash
   sudo ./svc.sh install
   sudo ./svc.sh start
   sudo ./svc.sh status
   ```

Ensure the runner user is in the `docker` group and has `~/.kube/config` (same as Valhalla — see Valhalla's [KubernetesSetup.md §1.3](https://github.com/mschmidlin1/ValhallaLandingPage/blob/main/docs/KubernetesSetup.md)).

### 3.2 Confirm on GitHub

Return to **Settings → Actions → Runners**. The new runner should show **Idle** or **Active**.

---

## Phase 4 — GitHub Actions deploy workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  deploy:
    runs-on: self-hosted

    env:
      KUBECONFIG: /home/mike/.kube/config

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Log in to GHCR
        run: echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u "${{ github.actor }}" --password-stdin

      - name: Build and push image
        run: |
          IMAGE=ghcr.io/mschmidlin1/portfolio-website
          docker build -t "${IMAGE}:${{ github.sha }}" -t "${IMAGE}:latest" .
          docker push "${IMAGE}:${{ github.sha }}"
          docker push "${IMAGE}:latest"

      - name: Apply Kubernetes manifests
        run: kubectl apply -k k8s/

      - name: Roll out new image
        run: |
          kubectl set image deployment/portfoliowebsite \
            app=ghcr.io/mschmidlin1/portfolio-website:${{ github.sha }} \
            -n portfoliowebsite
          kubectl rollout status deployment/portfoliowebsite \
            -n portfoliowebsite \
            --timeout=5m
```

**Important:** Replace `/home/mike` in `KUBECONFIG` if the runner runs as a different user. The self-hosted runner systemd service does **not** load `~/.bashrc`, so this env var is required — see Valhalla's [Self-Hosting.md — KUBECONFIG gotcha](https://github.com/mschmidlin1/ValhallaLandingPage/blob/main/docs/Self-Hosting.md#common-gotcha-kubeconfig-in-ci).

---

## Phase 5 — GitHub repository settings

### 5.1 Enable Actions and workflow permissions

1. [github.com/mschmidlin1/PortfolioWebsite/settings/actions](https://github.com/mschmidlin1/PortfolioWebsite/settings/actions) → ensure Actions are enabled.
2. Under **Workflow permissions**, select **Read and write permissions** (required to push to GHCR).
3. Save.

### 5.2 GHCR package visibility (after first successful deploy)

After the first workflow run pushes an image:

1. Open [github.com/mschmidlin1/PortfolioWebsite/pkgs/container/portfolio-website](https://github.com/mschmidlin1/PortfolioWebsite/pkgs/container/portfolio-website) (or **Packages** in the repo sidebar).
2. **Package settings** → set visibility to **Public** so k3s can pull without `imagePullSecrets`.

No additional GitHub Actions secrets are required for this static site.

---

## Phase 6 — First automated deploy

1. Commit Phases 1–4 files and push to **`main`** (or merge a PR).
2. Open [github.com/mschmidlin1/PortfolioWebsite/actions](https://github.com/mschmidlin1/PortfolioWebsite/actions).
3. Select the latest **Deploy** run and confirm each step passes:
   - **Build and push image**
   - **Apply Kubernetes manifests** — creates/updates the `portfoliowebsite` namespace
   - **Roll out new image** — pod reaches Ready

On Mint:

```bash
kubectl get pods -n portfoliowebsite
```

Expected: **STATUS** `Running`, **READY** `1/1`.

```bash
kubectl get pods -n portfoliowebsite -o jsonpath='{.items[0].spec.containers[0].image}{"\n"}'
```

Expected: `ghcr.io/mschmidlin1/portfolio-website:<commit-sha>`.

**In-cluster HTTP check (no public URL yet):**

```bash
kubectl run curl-test --rm -it --restart=Never --image=curlimages/curl -- \
  curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  http://portfoliowebsite.portfoliowebsite.svc.cluster.local/
```

Expected: `HTTP 200`.

If the workflow fails, see [Troubleshooting](#troubleshooting) before continuing.

---

## Phase 7 — Cloudflare Tunnel route for `michael.schmidlin.casa`

The app runs in the cluster but is not public until you add a **Public Hostname** on the **existing** homelab tunnel. Do **not** create a second tunnel.

### 7.1 Add the public hostname

1. Open [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels**.
2. Click your existing tunnel (e.g. `homelab-k3s`). Confirm status **Healthy**.
3. **Public Hostname** tab → **Add a public hostname**.
4. Fill in:

| Field | Value |
|-------|-------|
| **Subdomain** | `michael` |
| **Domain** | `schmidlin.casa` |
| **Path** | *(leave empty)* |
| **Type** | `HTTP` |
| **URL** | `http://portfoliowebsite.portfoliowebsite.svc.cluster.local:80` |

5. Save.

Cloudflare creates a proxied DNS record for `michael.schmidlin.casa` automatically.

### 7.2 Confirm DNS

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **`schmidlin.casa`** → **DNS** → **Records**.
2. You should see **`michael`** (proxied, orange cloud) pointing at the tunnel.

You should already have **`www`** (Valhalla), **`dr-jam`**, and possibly **`dev`** on the same tunnel. All hostnames coexist on one tunnel.

---

## Phase 8 — Verify the public URL

From any machine:

```bash
curl -I https://michael.schmidlin.casa
```

Expected: `HTTP/2 200` (or `HTTP/1.1 200`) with a valid certificate for `michael.schmidlin.casa`.

Open **`https://michael.schmidlin.casa`** in a browser. Confirm:

- Home section loads with profile image
- Dark/light theme toggle works
- Experience section resume download works
- Project cards and external links behave as expected

### 8.1 Optional — link from Valhalla

If you want the Valhalla landing page to link to the portfolio, update [`src/js/links.js`](https://github.com/mschmidlin1/ValhallaLandingPage/blob/main/src/js/links.js) in the Valhalla repo with `url: "https://michael.schmidlin.casa"` and deploy Valhalla separately.

---

## Day-to-day operations

| Task | How |
|------|-----|
| Deploy a change | Push (or merge) to **`main`** |
| Watch deploy | [Actions → Deploy](https://github.com/mschmidlin1/PortfolioWebsite/actions) |
| Pod health | `kubectl get pods -n portfoliowebsite` |
| App logs | `kubectl logs -n portfoliowebsite deploy/portfoliowebsite -f` |
| Roll back | `kubectl rollout undo deployment/portfoliowebsite -n portfoliowebsite` |
| Redeploy without code changes | Actions → **Deploy** → **Run workflow** |
| Pull image locally | `docker pull ghcr.io/mschmidlin1/portfolio-website:latest` |

**Typical edit flow:**

```bash
# edit src/ or resources/...
git add -A && git commit -m "Update project description"
git push origin main
# → michael.schmidlin.casa updates after the workflow finishes
```

---

## Local development vs production

| | Local dev | Production |
|---|-----------|------------|
| **How you run it** | VS Code Live Server on `src/index.html` | nginx inside a Kubernetes pod |
| **URL** | `http://localhost:5500` (typical Live Server port) | `https://michael.schmidlin.casa` |
| **Updates** | Save file → browser refresh | Push to `main` → automatic deploy |
| **Images / resume** | Served from `resources/` on disk | Baked into the container image |

There is no JavaScript build step — the same files in `src/` and `resources/` are what you edit locally and what nginx serves in production.

---

## Troubleshooting

### Deploy workflow does not appear after push

- The workflow file must exist **in the commit you pushed** on `main`.
- Confirm **Deploy** appears under the [Actions tab](https://github.com/mschmidlin1/PortfolioWebsite/actions).

### Runner does not pick up the job

- Check [Settings → Actions → Runners](https://github.com/mschmidlin1/PortfolioWebsite/settings/actions/runners) — runner must be **Idle** or **Active**.
- On Mint: `sudo ~/actions-runner-portfolio-website/svc.sh status`

### Build succeeds but pod stays `ImagePullBackOff`

- Set the GHCR package to **public** (Phase 5.2).
- Verify the tag exists: [GHCR package](https://github.com/mschmidlin1/PortfolioWebsite/pkgs/container/portfolio-website) → look for `latest` / commit SHA.

### `Apply Kubernetes manifests` fails with KUBECONFIG error

The workflow must set:

```yaml
env:
  KUBECONFIG: /home/mike/.kube/config
```

See Valhalla [Self-Hosting.md](https://github.com/mschmidlin1/ValhallaLandingPage/blob/main/docs/Self-Hosting.md#common-gotcha-kubeconfig-in-ci).

### In-cluster curl returns 200 but `michael.schmidlin.casa` fails

| Symptom | Fix |
|---------|-----|
| DNS NXDOMAIN | Public hostname not saved; check Cloudflare DNS for `michael` record |
| 502 / tunnel error | `kubectl get pods -n cloudflared` — tunnel pod must be Running |
| Wrong site / 404 | Tunnel **URL** must be `http://portfoliowebsite.portfoliowebsite.svc.cluster.local:80` |
| SSL error | Domain **Active** in Cloudflare; SSL/TLS mode **Full** on `schmidlin.casa` |

```bash
kubectl logs -n cloudflared -l app=cloudflared --tail=50
```

### Images or resume missing in production but work locally

- Confirm `Dockerfile` copies **both** `src/` and `resources/`.
- Confirm `.dockerignore` does not exclude `resources/`.
- Rebuild and redeploy after fixing the Dockerfile.

---

## What does not change

| Component | Notes |
|-----------|-------|
| Valhalla `k8s/` and deploy workflow | Untouched |
| Dr. JAM `k8s/` and deploy workflow | Untouched |
| `cloudflared` pod and tunnel token | One tunnel serves all `*.schmidlin.casa` app routes |
| Other app namespaces | Each site has its own namespace |

---

## Completion checklist

- [ ] `Dockerfile` and `.dockerignore` committed
- [ ] `k8s/` manifests committed (namespace, deployment, service, kustomization)
- [ ] Self-hosted runner registered for `PortfolioWebsite` and showing Idle/Active
- [ ] `.github/workflows/deploy.yml` committed on `main`
- [ ] GitHub Actions workflow permissions set to read/write
- [ ] **Deploy** workflow run succeeded on push to `main`
- [ ] `kubectl get pods -n portfoliowebsite` → Running `1/1`
- [ ] In-cluster curl → HTTP 200
- [ ] GHCR package visibility set to public
- [ ] Cloudflare public hostname `michael.schmidlin.casa` → `http://portfoliowebsite.portfoliowebsite.svc.cluster.local:80`
- [ ] `curl -I https://michael.schmidlin.casa` → 200
- [ ] Browser: profile image, theme toggle, and resume download work

---

## See also

- [Valhalla Self-Hosting.md](https://github.com/mschmidlin1/ValhallaLandingPage/blob/main/docs/Self-Hosting.md) — pipeline overview
- [Valhalla CustomDomainSetup.md](https://github.com/mschmidlin1/ValhallaLandingPage/blob/main/docs/CustomDomainSetup.md) — Cloudflare Tunnel architecture
- [Valhalla DevDeployment.md](https://github.com/mschmidlin1/ValhallaLandingPage/blob/main/docs/DevDeployment.md) — pattern for adding another hostname on the same tunnel
- [Valhalla DockerSetup.md](https://github.com/mschmidlin1/ValhallaLandingPage/blob/main/docs/DockerSetup.md) — Dockerfile playbook for static nginx sites
- [Valhalla KubernetesSetup.md](https://github.com/mschmidlin1/ValhallaLandingPage/blob/main/docs/KubernetesSetup.md) — one-time cluster and runner setup
- [Dr. JAM Deployment.md](https://github.com/mschmidlin1/dr-jam/blob/main/docs/Deployment.md) — same homelab pattern with larger media assets
