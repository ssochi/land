// Device capabilities read once at startup.
export const isSmall = Math.min(innerWidth, innerHeight) < 640 || matchMedia('(pointer: coarse)').matches;
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
