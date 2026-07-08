// Global motion bootstrap. Runs once per page load.
// - Lenis smooth scroll, driven by the GSAP ticker and synced to ScrollTrigger
// - Custom emerald cursor dot + magnetic buttons (pointer devices only)
// - Generic reveal-on-scroll for [data-reveal] elements
// Everything here is a no-op under prefers-reduced-motion.
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export let lenis: Lenis | null = null;

export function initMotion() {
  if (reduced) {
    // Reveal everything immediately; no smooth scroll, no cursor.
    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
      el.style.opacity = '1';
    });
    return;
  }

  // --- Lenis <-> GSAP ScrollTrigger integration ---
  lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis!.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  initReveals();
  initAnchors();
  if (finePointer) {
    initCursor();
    initMagnetic();
  }

  // Recalculate once fonts settle (Clash Display swap shifts layout)
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

// Generic fade-up reveal for anything tagged [data-reveal].
// Optional data-reveal-delay (seconds).
function initReveals() {
  const items = gsap.utils.toArray<HTMLElement>('[data-reveal]');
  items.forEach((el) => {
    const delay = parseFloat(el.dataset.revealDelay || '0');
    gsap.fromTo(
      el,
      { opacity: 0, y: 34 },
      {
        opacity: 1,
        y: 0,
        duration: 0.9,
        delay,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      }
    );
  });
}

// Route in-page anchor links through Lenis so reveals stay in sync and the
// smooth scroll isn't bypassed (a native #hash jump desyncs both).
function initAnchors() {
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const hash = a.getAttribute('href');
      if (!hash || hash.length < 2) return;
      const target = document.querySelector(hash);
      if (!target) return;
      e.preventDefault();
      lenis?.scrollTo(target as HTMLElement, { offset: 0 });
    });
  });
}

function initCursor() {
  const dot = document.querySelector<HTMLElement>('.cursor-dot');
  if (!dot) return;
  const pos = { x: innerWidth / 2, y: innerHeight / 2 };
  const target = { ...pos };
  window.addEventListener('pointermove', (e) => {
    target.x = e.clientX;
    target.y = e.clientY;
  });
  gsap.ticker.add(() => {
    pos.x += (target.x - pos.x) * 0.2;
    pos.y += (target.y - pos.y) * 0.2;
    dot.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`;
  });
  // Grow over interactive targets
  document.querySelectorAll('a, button, [data-cursor="grow"]').forEach((el) => {
    el.addEventListener('pointerenter', () => dot.classList.add('grow'));
    el.addEventListener('pointerleave', () => dot.classList.remove('grow'));
  });
}

// Magnetic pull for [data-magnetic] elements.
function initMagnetic() {
  document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
    const strength = parseFloat(el.dataset.magnetic || '0.35');
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) * strength;
      const y = (e.clientY - (r.top + r.height / 2)) * strength;
      gsap.to(el, { x, y, duration: 0.4, ease: 'power3.out' });
    });
    el.addEventListener('pointerleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.4)' });
    });
  });
}
