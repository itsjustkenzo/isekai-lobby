import Phaser from 'phaser';

// The canvas is sized in physical screen pixels (CSS size × devicePixelRatio) and shown at
// 1/devicePixelRatio, so the browser never stretches it and whole-number zoom stays pixel-exact.
function fitGameToHost(game, host) {
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = host.getBoundingClientRect();
  if (!width || !height) return;
  if (game.scale.zoom !== 1 / dpr) game.scale.setZoom(1 / dpr);
  game.scale.resize(Math.round(width * dpr), Math.round(height * dpr));
}

// Starts a pixel-exact Phaser game filling `host`. Returns a cleanup function.
export function createPixelGame(host, scene) {
  const dpr = window.devicePixelRatio || 1;
  const bounds = host.getBoundingClientRect();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#000000', // the space around the map
    scale: { mode: Phaser.Scale.NONE, width: Math.round(bounds.width * dpr) || 800, height: Math.round(bounds.height * dpr) || 600, zoom: 1 / dpr },
    scene,
  });
  const observer = new ResizeObserver(() => fitGameToHost(game, host));
  observer.observe(host);
  // devicePixelRatio changes when the window moves to another monitor or the page is zoomed.
  let dprQuery;
  const watchDpr = () => {
    dprQuery?.removeEventListener('change', onDprChange);
    dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprQuery.addEventListener('change', onDprChange);
  };
  function onDprChange() { fitGameToHost(game, host); watchDpr(); }
  watchDpr();
  return () => {
    observer.disconnect();
    dprQuery?.removeEventListener('change', onDprChange);
    game.destroy(true);
  };
}
