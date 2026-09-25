# AI Response Caching & Storage Strategy (V3)

Based on your architectural constraints for a lightweight, single-container self-hosted app, we will completely avoid Redis and use a pure **Node.js in-memory cache**. 

Here is the finalized architecture:

## 1. The Cache Layer: `node-cache` (In-Memory)

We will use the standard `node-cache` npm package. Since kubiq runs as a single Node.js process, this requires zero external dependencies, zero extra setup for the user, and reads/writes in less than a millisecond.

**How many reports will exist for a single service?**
Reports are bound by the **15-minute time bucket** and a **TTL (Time To Live)**:
- A new cache entry is *only* created if a user clicks "Summarize" for a new 15-minute window (e.g., `10:00 - 10:15`).
- We will set a strict **TTL of 4 hours** on every report in the cache.
- **The Result:** If a service has a continuous outage and devs click summarize every hour, there will be exactly a maximum of 4 reports stored in memory for that service at any given time (because older ones are automatically purged after 4 hours). Memory footprint will be virtually zero (a few KB of markdown).

## 2. Discoverability: The "Recent Insights" Banner

Because the cache holds reports for up to 4 hours, we need a simple rule for what to show the user when they open a service.

**The Rule:**
1. When the UI mounts for `auth-service`, it calls `GET /api/logs/recent-summary?service=auth-service`.
2. The backend looks in `node-cache` and returns the **single most recent** report for that service (if it exists and is less than 4 hours old).
3. The frontend displays the glowing banner:
   > ✨ **AI Insight Available:** Another team member analyzed this service 20 minutes ago. `[View Analysis]`

## The Execution Steps (Ready to Build)

1. **Backend Setup:** 
   - Run `npm install node-cache` in the backend.
   - Create `src/services/AICacheService.ts`.
2. **Backend Routes:** 
   - Update `POST /api/logs/summarize` to calculate the 15-minute bucket, check the cache, and write to it.
   - Add `GET /api/logs/recent-summary` to fetch the latest cache entry for a given service.
3. **Frontend Updates:** 
   - In `K8sLogViewer` and `LogViewer`, add a `useEffect` to poll the `recent-summary` route.
   - Add the glowing banner UI that triggers the modal.

**If you approve this final in-memory plan, I am ready to jump into the code and build the `AICacheService`!**
