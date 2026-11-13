// Runs before first paint so the page never flashes the wrong theme. A separate file, not an inline
// script, so the Content-Security-Policy can allow scripts from this site only.
try {
  // Light or dark only. Light is the default; an older stored "system" choice is carried over once.
  var p = localStorage.getItem('aemora.theme')
  var d = p === 'dark' || (p === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  if (d) document.documentElement.classList.add('dark')
} catch { /* storage blocked: the page keeps its default theme */ }
