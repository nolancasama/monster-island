import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installE2eHook } from "./game/e2e";
import "./styles.css";

const params = new URLSearchParams(location.search);
if (params.get("e2e") === "1") installE2eHook(Number(params.get("seed") ?? 1));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
