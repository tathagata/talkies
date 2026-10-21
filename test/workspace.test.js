import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../server.js';

const read = name => fs.readFile(new URL('../public/' + name, import.meta.url), 'utf8');
const eventually = async fn => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await fn()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail('Timed out waiting for UI state');
};

test('writing focus, keyboard navigation, per-slide prompts and agent handoff', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'talkies-ui-'));
  let receivedPrompt;
  const bridge = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      receivedPrompt = JSON.parse(body).prompt;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ proposal: { summary: 'Review completed', findings: [], sources: [] } }));
    });
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => bridge.on('listening', resolve));
  const env = { token: process.env.TALKIES_BRIDGE_TOKEN, url: process.env.TALKIES_BRIDGE_URL };
  process.env.TALKIES_BRIDGE_TOKEN = 'test-token';
  process.env.TALKIES_BRIDGE_URL = `http://127.0.0.1:${bridge.address().port}/run`;
  const server = (await createApp(dir)).listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dom = new JSDOM(await read('index.html'), { url: base, runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window, doc = win.document;
  win.fetch = (url, options) => fetch(new URL(url, base), options);
  win.scrollTo = () => {};
  win.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  win.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const input = (id, value) => {
    const el = doc.querySelector(id); el.value = value;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
  };
  const key = (code, key, options = {}) => {
    const event = new win.KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true, ...options });
    doc.activeElement.dispatchEvent(event);
    return event;
  };
  try {
    win.eval((await read('focus.js')).replace('export function installFocusModes', 'function installFocusModes'));
    await win.eval(`(async () => {${(await read('app.js')).replace(/^import[^\n]+\n/, '')}})()`);
    assert.equal(doc.querySelectorAll('#outline button').length, 4);
    assert.equal(doc.querySelectorAll('.focus-toggle').length, 5);
    // Focusing never replaces the editor: cursor and unsaved input survive exit.
    const editor = doc.querySelector('#narrative');
    editor.focus(); input('#narrative', 'A new narrative'); editor.setSelectionRange(5, 5);
    key('Digit3', '#', { metaKey: true, altKey: true });
    assert(doc.body.classList.contains('focus-mode'));
    assert(doc.querySelector('[data-component="narrative"]').classList.contains('is-focused'));
    assert.equal(doc.activeElement, editor);
    assert.equal(editor.selectionStart, 5);
    assert.equal(doc.querySelector('header').inert, true);
    // Ordinary editor cursor movement is not intercepted.
    assert.equal(key('ArrowRight', 'ArrowRight').defaultPrevented, false);
    key('Digit2', '@', { ctrlKey: true, altKey: true });
    assert.equal(doc.activeElement.id, 'thoughts');
    key('Escape', 'Escape');
    assert(!doc.body.classList.contains('focus-mode'));
    assert.equal(doc.activeElement, editor);
    assert.equal(editor.value, 'A new narrative');
    assert(!doc.querySelector('header').inert);
    // Overlay control is a toggle and preview arrows navigate the selected slide.
    doc.querySelector('[data-component="preview"] .focus-toggle').click();
    assert.equal(doc.querySelector('.preview-navigation').hidden, false);
    key('ArrowRight', 'ArrowRight');
    assert.equal(doc.querySelector('#selected').textContent, 'Slide 2 / 4');
    assert(doc.querySelector('[data-component="preview"]').classList.contains('is-focused'));
    doc.querySelector('[data-component="preview"] .focus-toggle').click();
    assert(!doc.body.classList.contains('focus-mode'));
    // AI shortcut reveals the prompt; IME composition does not change modes.
    key('KeyA', 'a', { ctrlKey: true, altKey: true });
    assert.equal(doc.activeElement.id, 'ai-prompt');
    key('Digit1', '1', { ctrlKey: true, altKey: true, isComposing: true });
    assert(doc.querySelector('[data-component="ai"]').classList.contains('is-focused'));
    input('#ai-prompt', 'Challenge the unsupported claim. Keep my voice.');
    key('Escape', 'Escape');
    doc.querySelector('[data-tab="issues"]').click();
    doc.querySelector('[data-tab="ai"]').click();
    assert.equal(doc.querySelector('#ai-prompt').value, 'Challenge the unsupported claim. Keep my voice.');
    // No wait for autosave: Run must flush the current custom prompt first.
    key('Enter', 'Enter', { ctrlKey: true });
    // Shortcut only acts inside AI workspace; target the field explicitly.
    doc.querySelector('#ai-prompt').focus(); key('Enter', 'Enter', { ctrlKey: true });
    await eventually(() => receivedPrompt?.includes('Challenge the unsupported claim. Keep my voice.'));
    await eventually(() => doc.querySelector('#result')?.textContent.includes('Review completed'));
    assert(receivedPrompt.includes('Author instructions:'));
    const stored = JSON.parse(await fs.readFile(path.join(dir, 'talk.json'), 'utf8'));
    assert.equal(stored.slides[1].aiPrompt, 'Challenge the unsupported claim. Keep my voice.');
    // External task uses the same instructions; dialog shortcut keys are left alone.
    doc.querySelector('#task').click();
    await eventually(() => doc.querySelector('#tasktext'));
    assert(doc.querySelector('#tasktext').value.includes('Challenge the unsupported claim. Keep my voice.'));
    assert.equal(key('Digit1', '1', { ctrlKey: true, altKey: true }).defaultPrevented, false);
    doc.querySelector('#close').click();
    doc.querySelectorAll('#outline button')[0].click();
    assert.equal(doc.querySelector('#ai-prompt').value, '');
    doc.querySelectorAll('#outline button')[1].click();
    assert.equal(doc.querySelector('#ai-prompt').value, 'Challenge the unsupported claim. Keep my voice.');
    // Custom prompts must never be included in public HTML exports.
    const exported = await (await fetch(base + '/api/export')).text();
    assert(!exported.includes('Challenge the unsupported claim'));
    key('Digit6', '6', { ctrlKey: true, altKey: true });
    assert(doc.body.classList.contains('rehearsing'));
    key('Digit1', '1', { ctrlKey: true, altKey: true });
    assert(!doc.body.classList.contains('rehearsing'));
    assert.equal(doc.activeElement.id, 'markdown');
  } finally {
    dom.window.close();
    server.close(); bridge.close();
    if (env.token === undefined) delete process.env.TALKIES_BRIDGE_TOKEN; else process.env.TALKIES_BRIDGE_TOKEN = env.token;
    if (env.url === undefined) delete process.env.TALKIES_BRIDGE_URL; else process.env.TALKIES_BRIDGE_URL = env.url;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
