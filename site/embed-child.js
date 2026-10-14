// Height reporting + hello handshake with the CMS parent page. See PLAN.md §8.
//
// The parent's iframe onload (embed/cms-snippet.html) sends { type: 'ck-programme:hello', width }
// on load and on every resize. We answer with { type: 'ck-programme:height', height } whenever
// #app changes size, and lay out for the parent's viewport width rather than the iframe's.
// Without a hello (e.g. the CMS strips onload) the page simply scrolls inside the fixed-height iframe.

(() => {
  if (window.parent === window) return;

  const app = document.getElementById('app');
  let target = '*';   // height isn't sensitive; narrowed to the parent's origin once it says hello
  let frame = 0;

  const post = () => window.parent.postMessage(
    { type: 'ck-programme:height', height: Math.ceil(app.getBoundingClientRect().height) },
    target,
  );

  addEventListener('message', (e) => {
    if (e.source !== window.parent || e.data?.type !== 'ck-programme:hello') return;
    target = e.origin;
    document.documentElement.classList.add('is-autoheight');
    if (Number.isFinite(e.data.width)) window.ckProgramme?.setViewportWidth(e.data.width);
    post();
  });

  // Measure #app, not the viewport, so setting the iframe height can't feed back into the measurement.
  new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(post);
  }).observe(app);
})();
