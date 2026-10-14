# HSPSMS Backend Setup

## Windows Setup

From the project root in PowerShell:

```powershell
cd .\backend
npm install
Copy-Item .env.example .env
npm run dev
```

Create `backend\.env` manually if `.env.example` is not present. Never commit `.env`, production secrets, or real account credentials. Build and test with:

```powershell
npm run build
npm test
```

The backend expects the existing MySQL schema and seed data to be installed before the acceptance suite runs.

## Environment Variables

Required:

```dotenv
NODE_ENV=development
PORT=5000
MYSQL_SERVER=localhost
MYSQL_PORT=3306
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=replace_with_your_local_password
MYSQL_DB=school_erp
JWT_SECRET=replace_with_a_long_random_secret
```

Optional:

```dotenv
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
FRONTEND_URL=http://localhost:5173
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
```

Password recovery is unavailable unless `SMTP_HOST` and `SMTP_FROM` are configured and delivery succeeds. When SMTP is configured, optional authentication uses `SMTP_USER` and `SMTP_PASSWORD`; reset links are single-use and expire after 15 minutes. The API never returns a reset token.

## Authentication Deployment

Authentication uses the existing `refresh_sessions` table and an HttpOnly, SameSite=Lax cookie. `Remember this device` controls an 8-hour versus 30-day expiry. The cookie is marked Secure automatically when `NODE_ENV=production`; production must use HTTPS. Keep the frontend and API on the same site so the Lax cookie is sent, and set `CORS_ORIGINS` to the exact deployed frontend origins.

Login is limited to 10 failed requests per IP per 15 minutes; recovery endpoints are limited to 5 requests per IP per hour. Authentication events are recorded in the existing `audit_logs` table without credentials or tokens.