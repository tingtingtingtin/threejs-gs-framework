import "./style.css";
import { SplatViewerUI } from "./SplatViewerUI";

const app = document.getElementById("app");

if (!app) {
  throw new Error("Missing #app root element");
}

const viewerUI = new SplatViewerUI(app, {
  url: "https://media.reshot.ai/models/nike_next/model.splat",
  initialPercent: 100,
});

(window as typeof window & { splatViewerUI?: SplatViewerUI }).splatViewerUI = viewerUI;
