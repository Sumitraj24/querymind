/** Shared by the server layout (no "use client"), so it can be inlined into <head>. */
export const THEME_STORAGE_KEY = "querymind:theme";

/** Applies the saved theme before first paint to avoid a flash of the wrong theme. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(d)r.classList.add("dark");r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
