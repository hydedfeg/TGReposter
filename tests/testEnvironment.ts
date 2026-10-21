// Railway exposes runtime variables while building. React's production bundle
// intentionally omits `act`, so force only the test subprocess into test mode.
// Vite and the server bundle still inherit the deployment's production mode.
process.env.NODE_ENV = "test";

// Unit tests must never connect to live Railway/Supabase infrastructure.
// Railway injects these runtime values during image builds, unlike GitHub CI.
// Clear them in the test subprocess only; production server starts separately.
process.env.DATABASE_URL = "";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_ANON_KEY = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
