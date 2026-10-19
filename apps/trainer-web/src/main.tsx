import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ConfigProvider } from "./lib/config";
import "./styles.css";
import "./styles/shell.css";
import "./styles/home.css";
import "./styles/clients.css";
import "./styles/workspace.css";
import "./styles/templates.css";
/* Tap targets last — must win over fixed heights in component CSS. */
import "./styles/tap-targets.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <ConfigProvider>
        <App />
      </ConfigProvider>
    </BrowserRouter>
  </StrictMode>,
);
