# UI Deployment Issue - Root Cause & Fix

## 🔴 Root Cause Identified

**The Problem:** Your container was created **16 hours ago** and is using an **old Docker image** that doesn't contain the new `PanelLayout` code.

**Why this happened:**
1. `docker compose build webapp` used **cached Docker layers** → didn't rebuild
2. `docker compose restart webapp` restarted the **same old container** → didn't use new image
3. Browser served old JavaScript bundles → UI didn't update

---

## ✅ Correct Deployment Workflow

### Step 1: Make Code Changes
```bash
# Edit files (e.g., PanelLayout.tsx, AIPanel.tsx)
# Files saved locally ✅
```

### Step 2: Force Rebuild (No Cache)
```bash
# ⚠️ CRITICAL: Use --no-cache to force rebuild
docker compose build --no-cache webapp
```

**Why `--no-cache`?**
- Docker caches layers (COPY, RUN commands)
- If source files "look the same", Docker reuses old layers
- `--no-cache` forces complete rebuild → ensures new code included

### Step 3: Recreate Container (Not Just Restart)
```bash
# Stop and remove old container
docker compose stop webapp
docker compose rm -f webapp

# Start fresh container (uses new image)
docker compose up -d webapp
```

**Why recreate?**
- `restart` keeps same container → may use old image
- `rm -f` + `up -d` creates new container → uses latest image

### Step 4: Verify Deployment
```bash
# Run verification script
./verify-deployment.sh

# Should show:
# ✅ New code found (marker "NEW UI ACTIVE" exists)
```

### Step 5: Clear Browser Cache
1. Open DevTools (F12)
2. Go to **Network** tab
3. **Check "Disable cache"** ⚠️ **CRITICAL**
4. Close all `localhost:3000` tabs
5. Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)

---

## 🚀 Quick Fix Command

Run this **complete workflow** in one go:

```bash
cd /Users/ow49488/Downloads/redamon

# 1. Stop and remove old container
docker compose stop webapp
docker compose rm -f webapp

# 2. Force rebuild (no cache) - takes 2-5 minutes
docker compose build --no-cache webapp

# 3. Start fresh container
docker compose up -d webapp

# 4. Wait for health check
sleep 5
docker compose ps webapp

# 5. Verify new code is deployed
docker compose exec webapp grep -r "NEW UI ACTIVE" /app/.next/ 2>/dev/null && echo "✅ New code deployed!" || echo "❌ Still old code"
```

---

## 🔍 How to Verify Each Step

### Verify Build Ran:
```bash
# Check build output for "Successfully built"
docker compose build --no-cache webapp 2>&1 | tail -5
```

### Verify New Image Created:
```bash
# Check image creation time (should be recent)
docker images | grep webapp
```

### Verify Container Uses New Image:
```bash
# Check container creation time (should be recent)
docker compose ps webapp
```

### Verify Code in Container:
```bash
# Should find "NEW UI ACTIVE" marker
docker compose exec webapp grep -r "NEW UI ACTIVE" /app/.next/ 2>/dev/null
```

### Verify Browser Gets New Files:
1. DevTools → Network → **Check "Disable cache"**
2. Hard refresh: `Cmd+Shift+R`
3. Look for:
   - Status: `200` (not `304`)
   - Size: Actual size (not "from cache")
   - Console: `[PanelLayout] 📦 MODULE LOADED` logs

---

## 📋 Common Mistakes

### ❌ Wrong:
```bash
docker compose build webapp        # Uses cache → may not rebuild
docker compose restart webapp      # Keeps old container → old image
```

### ✅ Correct:
```bash
docker compose build --no-cache webapp    # Forces rebuild
docker compose stop webapp && docker compose rm -f webapp  # Remove old
docker compose up -d webapp                # Create new container
```

---

## 🎯 Expected Result After Fix

1. **Container:** Created just now (not 16 hours ago)
2. **Code:** Marker "NEW UI ACTIVE" found in container
3. **Browser:** Green border visible, console shows `[PanelLayout]` logs
4. **UI:** Split panel layout with resizable divider

---

## ⏱️ Current Status

**Build is running now** (started with `--no-cache`). 

**Next steps:**
1. Wait for build to complete (2-5 minutes)
2. Run: `docker compose up -d webapp`
3. Run: `./verify-deployment.sh`
4. Clear browser cache and refresh

---

## 💡 Why This Happens

**Docker Layer Caching:**
- Docker caches each `COPY` and `RUN` command
- If files "look the same" (same size, same timestamp), Docker reuses cache
- This is **good for speed** but **bad when you want fresh builds**

**Solution:**
- Use `--no-cache` when you need guaranteed fresh build
- Or use `docker compose build --pull` to pull latest base images
- Or touch a file to change timestamp: `touch webapp/src/app/graph/page.tsx`

---

## 🔧 Future Prevention

**Option 1: Always use --no-cache** (slower but guaranteed)
```bash
docker compose build --no-cache webapp
```

**Option 2: Use build args to bust cache** (faster)
```bash
docker compose build --build-arg CACHE_BUST=$(date +%s) webapp
```

**Option 3: Use development mode** (fastest, for active development)
```bash
# Use docker-compose.dev.yml for hot reload
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d webapp
```
