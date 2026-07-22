// Run `cb` once, shortly before `el` scrolls into view.
// Used to hold back the GSAP-dependent effects in below-the-fold sections so
// their bundles aren't downloaded during initial page load.
export function whenNear(el: Element | null, cb: () => void, rootMargin = '75% 0px') {
  if (!el) return;
  if (!('IntersectionObserver' in window)) return cb();

  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      cb();
    },
    { rootMargin }
  );
  io.observe(el);
}
