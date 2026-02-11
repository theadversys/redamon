# UI Deployment Workflow - Complete Process

## The Problem
UI changes aren't showing in the browser. Let's trace the **complete deployment pipeline** to find where it breaks.

---

## Step-by-Step Deployment Process

### 1. **Code Changes** ✅
- Modify React/TypeScript files (e.g., `PanelLayout.tsx`, `AIPanel.tsx`)
- Files are saved locally

### 2. **Docker Build** 🔨
```bash
docker compose build webapp
```

**What happens:**
- Docker reads `webapp/Dockerfile`
- **Stage 1 (deps)**: Installs production dependencies
- **Stage 2 (builder)**: 
  - Copies source code (`COPY . .`)
  - Runs `npm ci && npm run build`
  - Next.js compiles TypeScript → JavaScript bundles
  - Creates `.next/static/` (client bundles) and `.next/standalone/` (server)
- **Stage 3 (runner)**: 
  - Copies `.next/standalone/` → `/app`
  - Copies `.next/static/` → `/app/.next/static` ⚠️ **CRITICAL**
  - Copies `public/` → `/app/public`

**Potential Issues:**
- ❌ Docker build cache: Old layers reused → no rebuild
- ❌ Build fails silently: Errors ignored
- ❌ Source files not copied: `COPY . .` misses changes

### 3. **Container Restart** 🔄
```bash
docker compose restart webapp
```

**What happens:**
- Stops old container
- Starts new container with **new image**
- Container runs `node server.js` (Next.js standalone server)

**Potential Issues:**
- ❌ Old container still running: Restart doesn't use new image
- ❌ Image not updated: Build didn't create new image
- ❌ Container uses old image ID

### 4. **Browser Request** 🌐
- Browser requests `http://localhost:3000/graph`
- Next.js server serves HTML (SSR)
- HTML includes `<script src="/_next/static/chunks/...js">`
- Browser fetches JavaScript bundles

**Potential Issues:**
- ❌ Browser cache: Old `.js` files served from cache
- ❌ Server serves old files: `.next/static/` not updated in container
- ❌ No hydration: Client bundles missing → React doesn't hydrate

---

## Verification Checklist

### ✅ Verify Build Actually Ran
```bash
# Check build timestamp
docker compose build webapp 2>&1 | grep -E "(Step|COPY|RUN npm)"

# Check if new image was created
docker images | grep webapp
```

### ✅ Verify Files in Container
```bash
# Check if new code exists in container
docker compose exec webapp ls -lt /app/.next/static/chunks/*.js | head -3

# Check for our marker
docker compose exec webapp grep -r "NEW UI ACTIVE" /app/.next/ 2>/dev/null || echo "Marker not found"
```

### ✅ Verify Container Restarted
```bash
# Check container start time
docker compose ps webapp

# Check if container is using latest image
docker compose exec webapp cat /app/.next/BUILD_ID 2>/dev/null || echo "No BUILD_ID"
```

### ✅ Verify Browser Gets New Files
1. Open DevTools → Network tab
2. **Check "Disable cache"** ⚠️ **CRITICAL**
3. Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
4. Look for:
   - Status: `200` (not `304 Not Modified`)
   - Size: Should show actual size (not "from cache")
   - Response: Should contain new code

---

## Common Failure Points

### 🔴 Issue 1: Docker Build Cache
**Symptom:** Build completes instantly, no changes applied

**Fix:**
```bash
# Force rebuild without cache
docker compose build --no-cache webapp

# Or rebuild specific stage
docker compose build --no-cache --progress=plain webapp 2>&1 | grep -E "(Step|COPY|RUN)"
```

### 🔴 Issue 2: Container Not Using New Image
**Symptom:** Container restarted but still has old code

**Fix:**
```bash
# Stop and remove container
docker compose stop webapp
docker compose rm -f webapp

# Start fresh (will use latest image)
docker compose up -d webapp
```

### 🔴 Issue 3: Browser Cache
**Symptom:** Network tab shows "from cache", no new requests

**Fix:**
1. DevTools → Network → **Check "Disable cache"**
2. Close all tabs
3. Hard refresh: `Cmd+Shift+R`
4. Or use Incognito window

### 🔴 Issue 4: Static Files Not Copied
**Symptom:** `.next/static/` missing or empty in container

**Fix:**
- Verify Dockerfile has: `COPY --from=builder /app/.next/static ./.next/static`
- Check build logs for COPY errors
- Verify `.next/static/` exists in builder stage

---

## Recommended Workflow

### For Every UI Change:

```bash
# 1. Make code changes
# (edit files)

# 2. Force rebuild (no cache)
docker compose build --no-cache webapp

# 3. Stop and recreate container (ensures new image)
docker compose stop webapp
docker compose rm -f webapp
docker compose up -d webapp

# 4. Wait for container to be healthy
docker compose ps webapp

# 5. In browser:
#    - Open DevTools → Network
#    - Check "Disable cache"
#    - Hard refresh: Cmd+Shift+R
```

### Quick Verification Script:
```bash
# Check if new code is deployed
docker compose exec webapp grep -r "NEW UI ACTIVE" /app/.next/ 2>/dev/null && echo "✅ New code found" || echo "❌ Old code"
```

---

## Debugging Commands

```bash
# 1. Check what's actually in the container
docker compose exec webapp find /app/.next/static -name "*.js" -type f | head -5

# 2. Check build logs for errors
docker compose build webapp 2>&1 | grep -i error

# 3. Check container logs
docker compose logs webapp --tail 50

# 4. Compare image IDs (old vs new)
docker images | grep webapp

# 5. Check file timestamps in container
docker compose exec webapp ls -lt /app/.next/static/chunks/ | head -3
```

---

## Why This Matters

**Next.js Standalone Mode** (`output: 'standalone'`) requires:
1. Server bundle: `.next/standalone/` → runs `server.js`
2. Client bundles: `.next/static/` → browser fetches these
3. Public assets: `public/` → static files

**If any step fails:**
- Missing `.next/static/` → No client JS → No React hydration → Old UI
- Browser cache → Old JS served → Old UI
- Container uses old image → Old code → Old UI

---

## Next Steps

1. **Run verification script** to confirm new code is in container
2. **Clear browser cache** (DevTools → Disable cache + Hard refresh)
3. **Check console logs** for `[PanelLayout]` messages
4. **Look for green border** marker in UI

If all checks pass but UI still old → **Browser cache is the culprit**.
