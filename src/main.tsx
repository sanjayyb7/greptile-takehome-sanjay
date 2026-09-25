import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PasskeyField } from "./passkey";
import { ThemeToggle } from "./ThemeToggle";
import "./styles.css";

/** ?auto submits on the last digit instead of waiting for the Send button */
const auto = new URLSearchParams(location.search).has("auto");
/** ?len=6 builds the field at another length — the design is drawn for four */
const len = Number(new URLSearchParams(location.search).get("len")) || undefined;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeToggle />
    <PasskeyField
      length={len}
      autoSubmit={auto}
      send={!auto}
      onSuccess={(code) => console.log("authenticated:", code)}
    />
  </StrictMode>,
);
