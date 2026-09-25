// Runs before first paint, from the layout's <head>. Motion is opted into here rather
// than out of in CSS, so without JavaScript or with reduced motion nothing starts
// hidden. If the app has not taken over within four seconds (a slow or failed bundle),
// it backs out and the page simply shows.
export const MOTION_BOOT = `(function(){try{var d=document.documentElement;if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;d.setAttribute("data-motion","");setTimeout(function(){if(!d.hasAttribute("data-motion-ready"))d.removeAttribute("data-motion")},4000)}catch(e){}})()`;
