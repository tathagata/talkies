const labels = {
  markdown: 'Slide Markdown',
  thoughts: 'Thought process',
  narrative: 'Narrative',
  preview: 'Slide preview',
  ai: 'AI workspace',
};
const expand = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';
const collapse = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5"/></svg>';

export function installFocusModes({ doc = document, onNavigate, onAI, onRun, onSave, onRehearse, onHelp }) {
  const win = doc.defaultView;
  const panels = [...doc.querySelectorAll('[data-component]')];
  let current = null;
  let returnFocus = null;
  let scrollY = 0;
  const previousInert = new Map();
  const buttonFor = panel => panel.querySelector('.focus-toggle');

  function update() {
    for (const panel of panels) {
      const name = panel.dataset.component;
      const selected = current === name;
      panel.classList.toggle('is-focused', selected);
      const button = buttonFor(panel);
      button.innerHTML = selected ? collapse : expand;
      const label = `${selected ? 'Exit' : 'Enter'} distraction-free ${labels[name]}`;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(selected));
      button.title = selected ? 'Exit focus · Esc' : `Focus ${labels[name]} · ${shortcut(name)}`;
    }
    doc.body.classList.toggle('focus-mode', !!current);
    doc.querySelector('.preview-navigation').hidden = current !== 'preview';
    if (current) {
      for (const element of doc.querySelectorAll('body > header, aside, footer, .toolbar, .panel')) {
        if (!previousInert.has(element)) previousInert.set(element, element.inert);
        element.inert = element.matches('.panel') ? element.dataset.component !== current : true;
      }
    } else {
      for (const [element, inert] of previousInert) element.inert = inert;
      previousInert.clear();
    }
  }
  function shortcut(name) {
    return `⌘/Ctrl Alt ${['markdown', 'thoughts', 'narrative', 'preview', 'ai'].indexOf(name) + 1}`;
  }
  function exit() {
    if (!current) return;
    current = null;
    update();
    if (returnFocus?.isConnected && !returnFocus.inert) returnFocus.focus({ preventScroll: true });
    win.scrollTo(0, scrollY);
  }
  function enter(name) {
    const panel = panels.find(p => p.dataset.component === name);
    if (!panel) return;
    if (!current) {
      returnFocus = doc.activeElement;
      scrollY = win.scrollY;
    }
    doc.body.classList.remove('rehearsing');
    if (name === 'ai') onAI();
    current = name;
    update();
    (panel.querySelector('textarea') || panel).focus({ preventScroll: true });
  }
  for (const panel of panels) {
    panel.tabIndex = -1;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'focus-toggle';
    button.onclick = () => current === panel.dataset.component ? exit() : enter(panel.dataset.component);
    panel.append(button);
  }
  function keydown(e) {
    if (e.isComposing || e.defaultPrevented || doc.querySelector('dialog[open]')) return;
    if (e.key === 'Escape' && current) {
      e.preventDefault(); exit(); return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault(); onSave(); return;
    }
    if (mod && e.altKey && !e.shiftKey) {
      const name = { Digit1: 'markdown', Digit2: 'thoughts', Digit3: 'narrative', Digit4: 'preview', Digit5: 'ai' }[e.code];
      if (name) { e.preventDefault(); enter(name); return; }
      if (e.code === 'KeyA') { e.preventDefault(); enter('ai'); return; }
      if (e.code === 'Digit0') { e.preventDefault(); exit(); return; }
      if (e.code === 'Digit6') { e.preventDefault(); exit(); onRehearse(); return; }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault(); onNavigate(e.code === 'ArrowLeft' ? -1 : 1); return;
      }
      if (e.code === 'Slash') { e.preventDefault(); onHelp(); return; }
    }
    if (mod && !e.altKey && e.key === 'Enter' && (current === 'ai' || e.target.closest?.('.context'))) {
      e.preventDefault(); onRun(); return;
    }
    if (current === 'preview' && !mod && !e.altKey && ['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', ' '].includes(e.key)) {
      // Leave native activation of the visible controls intact.
      if (e.key === ' ' && e.target.closest?.('button')) return;
      e.preventDefault(); onNavigate(['ArrowLeft', 'PageUp'].includes(e.key) ? -1 : 1); return;
    }
    if (current && e.key === 'Tab') {
      const panel = panels.find(p => p.dataset.component === current);
      const stops = [...panel.querySelectorAll('button:not(:disabled), textarea, input, select, a[href]')]
        .filter(el => !el.closest('[hidden]') && el.getClientRects().length > 0);
      const first = stops[0], last = stops.at(-1);
      if (!first) return;
      if (e.shiftKey && (doc.activeElement === first || doc.activeElement === panel)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (doc.activeElement === last || doc.activeElement === panel)) {
        e.preventDefault(); first.focus();
      }
    }
  }
  doc.addEventListener('keydown', keydown);
  update();
  return { enter, exit, get current() { return current; }, destroy() { exit(); doc.removeEventListener('keydown', keydown); } };
}
