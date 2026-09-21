(() => {
  const FONT_CONFIG = {
    current: {
      family: 'Be Vietnam Pro',
      href: 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap'
    },
    geist: {
      family: 'Geist',
      href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap'
    },
    openai: {
      family: 'OpenAI Sans',
      faces: [
        [400, 'Regular'],
        [500, 'Medium'],
        [600, 'Semibold'],
        [700, 'Bold'],
        [800, 'Bold']
      ]
    }
  };

  const inflight = new Map();

  function normalizeChoice(choice) {
    if (choice === 'be' || choice === 'arial' || choice === 'system') return 'current';
    return FONT_CONFIG[choice] ? choice : 'current';
  }

  function fontReady(family, weight = 400) {
    if (!document.fonts || typeof document.fonts.check !== 'function') return false;
    try {
      return document.fonts.check(`${weight} 16px "${family}"`);
    } catch (_) {
      return false;
    }
  }

  function addStylesheet(choice, href) {
    const id = `taphoa-font-link-${choice}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }

  function addOpenAiFaces() {
    const id = 'taphoa-font-face-openai';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    const base = 'https://cdn.openai.com/common/fonts/openai-sans';
    style.textContent = FONT_CONFIG.openai.faces.map(([weight, file]) => `
@font-face {
  font-family: "OpenAI Sans";
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src:
    local("OpenAI Sans ${file}"),
    local("OpenAI Sans"),
    url("${base}/OpenAISans-${file}.woff2") format("woff2");
}`).join('\n');
    document.head.appendChild(style);
  }

  function inject(choice) {
    const config = FONT_CONFIG[choice];
    if (choice === 'openai') addOpenAiFaces();
    else addStylesheet(choice, config.href);
  }

  async function waitForFont(choice) {
    const config = FONT_CONFIG[choice];
    if (!document.fonts || typeof document.fonts.load !== 'function') return false;
    try {
      await Promise.all([400, 500, 600, 700].map(weight =>
        document.fonts.load(`${weight} 16px "${config.family}"`, 'TAPHOA Tiếng Việt 123')
      ));
      return fontReady(config.family, 400);
    } catch (_) {
      return false;
    }
  }

  function ensure(choice) {
    choice = normalizeChoice(choice);
    const config = FONT_CONFIG[choice];

    if (fontReady(config.family, 400)) {
      return Promise.resolve({ choice, family: config.family, source: 'local-or-ready', loaded: true });
    }

    if (inflight.has(choice)) return inflight.get(choice);

    inject(choice);
    const promise = waitForFont(choice)
      .then(loaded => ({ choice, family: config.family, source: 'web', loaded }))
      .catch(() => ({ choice, family: config.family, source: 'fallback', loaded: false }));

    inflight.set(choice, promise);
    return promise;
  }

  window.TAPHOA_FONT_LOADER = {
    ensure,
    isReady(choice) {
      choice = normalizeChoice(choice);
      return fontReady(FONT_CONFIG[choice].family, 400);
    }
  };

  let initialChoice = 'current';
  try {
    initialChoice = normalizeChoice(localStorage.getItem('APP_FONT_CHOICE') || 'current');
  } catch (_) {}
  ensure(initialChoice);
})();