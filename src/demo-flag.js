// Whether this page is the demo (…/budget/?demo). On its own, with no imports, so any module can check it.
export const IS_DEMO = typeof location !== 'undefined' && /(^|&)demo(=[^&]*)?(&|$)/.test(String(location.search || '').slice(1));
