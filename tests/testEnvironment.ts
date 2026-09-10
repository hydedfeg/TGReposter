// Railway exposes runtime variables while building. React's production bundle
// intentionally omits `act`, so force only the test subprocess into test mode.
// Vite and the server bundle still inherit the deployment's production mode.
process.env.NODE_ENV = "test";
