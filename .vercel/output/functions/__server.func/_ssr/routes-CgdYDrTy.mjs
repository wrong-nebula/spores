import { g as require_jsx_runtime, h as ClientOnly } from "../_libs/@tanstack/react-router+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-CgdYDrTy.js
var import_jsx_runtime = require_jsx_runtime();
function HomePage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClientOnly, { fallback: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PaperSplash, {}) });
}
function PaperSplash() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex h-dvh w-full items-center justify-center",
		style: { background: "#f7f6f3" },
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-[11px] font-medium uppercase tracking-[0.18em] text-[#a8a8a8]",
			children: "Herbarium"
		})
	});
}
//#endregion
export { HomePage as component };
