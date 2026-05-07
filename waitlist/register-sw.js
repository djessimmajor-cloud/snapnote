if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/waitlist/sw.js').catch(() => {
    navigator.serviceWorker.register('sw.js');
  });
}
