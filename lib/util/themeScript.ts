/** The theme is chosen in the settings and kept on the device. Kept apart from
 *  the hook that changes it, so the root layout, a server component, can take
 *  the script without taking React's client hooks along with it. */

export const THEME_KEY = 'jottr.theme'
export const THEME_EVENT = 'jottr:theme'

/** The page's own colour in each, for the browser's bar around it. */
export const THEME_COLORS = { light: '#ffffff', dark: '#1f1f1d' }

/** Runs in the head, before the first paint, so a page never flashes the
 *  wrong colours on its way in. It resolves the choice to `data-theme` on the
 *  <html> element — System to whatever the device is set to, and again each
 *  time the device changes — and stays behind to apply a new choice.
 *
 *  The layout's theme-color metas are gated on the device's setting, so a
 *  chosen theme would leave a phone's status bar the other colour. A chosen
 *  one puts a meta of its own ahead of them, which the browser takes first.
 *  Theirs are left alone: React puts back one it rendered that has been
 *  changed. */
export const THEME_SCRIPT = `(function(){
var root=document.documentElement,media=matchMedia('(prefers-color-scheme: dark)'),colors=${JSON.stringify(THEME_COLORS)};
function apply(){
var chosen;try{chosen=localStorage.getItem('${THEME_KEY}')}catch(e){}
var forced=chosen==='light'||chosen==='dark';
var theme=forced?chosen:media.matches?'dark':'light';
root.dataset.theme=theme;
var own=document.getElementById('jottr-theme-color');
if(forced){if(!own){own=document.createElement('meta');own.id='jottr-theme-color';own.name='theme-color';document.head.prepend(own)}own.content=colors[theme]}
else if(own)own.remove();
}
apply();
media.addEventListener('change',apply);
addEventListener('${THEME_EVENT}',apply);
addEventListener('storage',function(event){if(event.key==='${THEME_KEY}')apply()});
})()`
