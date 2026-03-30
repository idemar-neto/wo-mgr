import React from "react";
import ReactDOM from "react-dom/client";
import WoManager from "./wo-mgr.jsx";
import { registerSW } from "virtual:pwa-register"
import "./app.css"

registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WoManager />
  </React.StrictMode>
);
