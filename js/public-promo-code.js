import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { createPromoCodeController } from './promo-gift-controller.mjs?v=20260831-promo-source-1';

let controller;

async function loadPromoCodeBanner() {
  if (!controller) controller = createPromoCodeController({client:supabase});
  return controller.load();
}

if (!window.__echoPromoCodeBooted) {
  window.__echoPromoCodeBooted = true;
  controller = createPromoCodeController({client:supabase});
  const boot = () => controller.start();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else void boot();
}

// Preserve the existing integration export while the UI is now a central gift.
export { loadPromoCodeBanner };
