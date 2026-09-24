import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // the dev-only dial panel pulls in its own React graph otherwise, which trips
  // "Invalid hook call — more than one copy of React"
  resolve: { dedupe: ["react", "react-dom"] },
});
