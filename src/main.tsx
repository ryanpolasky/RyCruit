import { createRoot } from "react-dom/client";
import { Landing } from "./Landing";
import { PadRoute } from "./PadRoute";
import { Admin } from "./Admin";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "./style.css";
const padId = location.pathname.match(/^\/p\/([a-zA-Z0-9_-]{4,32})$/)?.[1];
createRoot(document.getElementById("root")!).render(
  location.pathname.startsWith("/admin") ? (
    <Admin />
  ) : location.pathname.startsWith("/p/") ? (
    <PadRoute key={padId || location.pathname} padId={padId || ""} />
  ) : (
    <Landing />
  ),
);
