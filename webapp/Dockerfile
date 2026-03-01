# ============================================
# PandaExploit Web Application - Production Dockerfile
# Multi-stage build for optimized production image
# ============================================

# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Reduce EIDLETIMEOUT on slow networks (npm default can be too short)
ENV NPM_CONFIG_FETCH_TIMEOUT=120000
ENV NPM_CONFIG_FETCH_RETRIES=5

COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Build-time args for Next.js public env (baked into client bundle)
ARG NEXT_PUBLIC_AGENT_ZERO_URL
ENV NEXT_PUBLIC_AGENT_ZERO_URL=$NEXT_PUBLIC_AGENT_ZERO_URL

COPY --from=deps /app/node_modules ./node_modules
# Copy Prisma schema first for client generation
COPY prisma ./prisma
COPY package.json package-lock.json* ./
# Generate Prisma client before copying rest of app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Dummy DATABASE_URL for Prisma client generation at build time (not used at runtime)
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate

# Copy rest of application
COPY . .

ENV NPM_CONFIG_FETCH_TIMEOUT=120000
ENV NPM_CONFIG_FETCH_RETRIES=5
RUN npm install --include=dev && npm run build

# Verify react-resizable-panels exists before copying
RUN test -d node_modules/react-resizable-panels && echo "✅ react-resizable-panels found" || (echo "❌ react-resizable-panels NOT FOUND" && ls -la node_modules/ | grep react)

# Stage 3: Runner (Production)
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

RUN mkdir .next
RUN chown nextjs:nodejs .next

# Leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
# Copy the minimal server bundle
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# 🔴 Critical: Copy client assets and public (required for standalone mode)
# Without these, the browser can't load client-side JavaScript → no hydration → UI doesn't work
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
