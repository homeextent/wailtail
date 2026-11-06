# Wailtail review worker HTTPS fixture

Deploy only this branch to a separate Vercel test project. Configure a unique CRON_SECRET. No Firebase or Resend configuration is needed. Each authenticated GET to /api/dispatch-auction-review processes one new in-memory synthetic event. Expected response: {"processed":1,"pending":0}. Wrong bearer returns 401. No outbound delivery or persistence occurs.
