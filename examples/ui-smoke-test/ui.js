'use strict';
(() => {
  const root = document.getElementById('ywd-plugin-root');
  if (!root) return;

  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = String(text);
    return el;
  };

  function row(label, value) {
    const wrap = node('div', 'kv');
    wrap.append(node('span', '', label), node('b', '', value));
    return wrap;
  }

  async function render() {
    root.replaceChildren();
    const shell = node('main', 'shell');
    const eyebrow = node('div', 'eyebrow', 'YWD // PLUGIN UI V1');
    const title = node('h1', '', 'Sandbox smoke test');
    const status = node('div', 'status pending', 'CONNECTING');
    const message = node('p', 'message', 'Waiting for the trusted dashboard bridge…');
    const details = node('section', 'details');
    const button = node('button', '', 'PING BRIDGE');
    shell.append(eyebrow, title, status, message, details, button);
    root.append(shell);

    try {
      await window.ywdPlugin.ready;
      const [state, config] = await Promise.all([
        window.ywdPlugin.getState(),
        window.ywdPlugin.getConfig(),
      ]);
      status.textContent = 'BRIDGE ONLINE';
      status.className = 'status good';
      message.textContent = typeof config.label === 'string' && config.label ? config.label : 'Sandbox bridge is alive';
      details.replaceChildren();
      if (config.show_details !== false) {
        details.append(
          row('Plugin', `${state.name} v${state.version}`),
          row('ID', state.id),
          row('Health', String(state.health || 'unknown').toUpperCase()),
          row('Capabilities', Array.isArray(state.capabilities) ? state.capabilities.join(', ') : 'none'),
          row('Direct network', 'BLOCKED BY FRAME CSP'),
          row('Pi-side daemon', 'NONE'),
        );
      }
      button.onclick = async () => {
        button.disabled = true;
        try {
          const pong = await window.ywdPlugin.ping();
          button.textContent = pong?.ok ? 'PING OK' : 'PING FAILED';
        } catch (error) {
          button.textContent = String(error?.message || error);
        } finally {
          setTimeout(() => { button.textContent = 'PING BRIDGE'; button.disabled = false; }, 1200);
        }
      };
    } catch (error) {
      status.textContent = 'BRIDGE ERROR';
      status.className = 'status bad';
      message.textContent = String(error?.message || error);
      button.disabled = true;
    }
  }

  render();
})();
