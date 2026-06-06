// Vercel serverless entry point.
//
// vercel.json routes every /api/* request to this function. The Express app's
// own routes are declared with the /api prefix (see ../src/app.ts), so the URLs
// line up and the exact same app that runs locally (../src/index.ts ->
// app.listen) serves production unchanged. @vercel/node accepts an Express app
// instance as the request handler.
import { createApp } from "../src/app";

const app = createApp();

export default app;
