import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Demo } from "./Demo";
import { signInHref } from "./hub";
import "./styles.css";

const signIn = document.querySelector<HTMLAnchorElement>("#sign-in");
if (signIn) {
  signIn.href = signInHref(window.location.origin);
}

const demo = document.querySelector("#demo");
if (demo) {
  createRoot(demo).render(
    <StrictMode>
      <Demo />
    </StrictMode>,
  );
}
