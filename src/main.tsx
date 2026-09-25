import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { PasskeyField } from "./passkey";
import { VersionDots } from "./dev/VersionDots";
import { ThemeToggle } from "./dev/ThemeToggle";
import { mountDigitDials } from "./dev/DigitDials";
import { FINAL, VERSIONS, hasSend, type Version } from "./passkey/variants";
import "./styles.css";

// the tuning panel for how digits are written in; kept out of automated runs, where it
// would only be something on screen the tests did not put there
if (!navigator.webdriver) mountDigitDials();

/** on this branch the Send button submits; ?auto goes back to submitting on the last digit */
const auto = new URLSearchParams(location.search).has("auto");
/** ?v=1 opens on a particular version, so a link can point at one */
const asked = Number(new URLSearchParams(location.search).get("v"));
/** ?len=6 builds the field at another length. The brief asks for four and the design is
 *  drawn for four, so four is what it opens at — this is here because "it is a component,
 *  not a demo" is a claim, and a claim you cannot try is just a sentence in a README. */
const len = Number(new URLSearchParams(location.search).get("len")) || undefined;

function Demo() {
  const [version, setVersion] = useState<Version>(
    VERSIONS.some((v) => v.id === asked) ? (asked as Version) : FINAL,
  );
  return (
    <>
      {/* keyed on the version: switching remounts the field, so each one is tried from a
          clean slate rather than inheriting half-finished state from the last */}
      <PasskeyField
        key={`${version}:${len ?? ""}`}
        version={version}
        length={len}
        /* the earliest version had no send box — the last digit submitted. ?auto still
           forces that on every version, for comparing the two submit models directly. */
        autoSubmit={auto || !hasSend(version)}
        send={!auto && hasSend(version)}
        onSuccess={(code) => console.log("authenticated:", code)}
      />
      <VersionDots value={version} onChange={setVersion} beside={<ThemeToggle />} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
