import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { APP_BASE } from "./lib/routes";
import { AuthProvider } from "./auth/AuthProvider";
import { PlayerProvider } from "./player/PlayerProvider";
import { LanguageProvider } from "./i18n/LanguageProvider";
import { App } from "./App";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename={APP_BASE}>
      <AuthProvider>
        <LanguageProvider>
          <PlayerProvider>
            <App />
          </PlayerProvider>
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
