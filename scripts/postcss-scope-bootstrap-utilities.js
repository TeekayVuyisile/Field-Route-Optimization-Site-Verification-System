// Bootstrap's utilities share class names with Tailwind's (.px-5, .gap-3,
// .text-muted, .border...) but use other values and !important. An !important
// declaration in an earlier cascade layer beats every later layer, so inside
// migrated `.ui` markup Bootstrap's 3rem `px-5` won over Tailwind's 1.25rem.
// This keeps those rules for legacy pages but makes them skip `.ui` subtrees.
// Removed together with Bootstrap.

const SCOPE = ':not(.ui, .ui *)';

/** Adds the scope to one selector, before any pseudo-element (`::after`) */
export const scopeSelector = (selector) => {
    const pseudo = selector.indexOf('::');
    return pseudo === -1 ? `${selector}${SCOPE}` : `${selector.slice(0, pseudo)}${SCOPE}${selector.slice(pseudo)}`;
};

const scopeBootstrapUtilities = () => ({
    postcssPlugin: 'scope-bootstrap-utilities',
    Rule(rule) {
        if (rule.__scoped || !rule.source?.input.file?.replaceAll('\\', '/').includes('/bootstrap/dist/')) return;
        if (rule.parent?.type === 'atrule' && rule.parent.name.endsWith('keyframes')) return;
        if (!rule.nodes.some((node) => node.type === 'decl' && node.important)) return;
        rule.selectors = rule.selectors.map(scopeSelector);
        rule.__scoped = true;
    },
});
scopeBootstrapUtilities.postcss = true;

export default scopeBootstrapUtilities;
