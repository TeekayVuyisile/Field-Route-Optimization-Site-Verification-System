import { describe, it, expect } from 'vitest';
import postcss from 'postcss';
import scopeBootstrapUtilities, { scopeSelector } from './postcss-scope-bootstrap-utilities';

const run = (css, file) => postcss([scopeBootstrapUtilities()]).process(css, { from: file }).css;
const BOOTSTRAP = '/app/node_modules/bootstrap/dist/css/bootstrap.min.css';

describe('scopeBootstrapUtilities', () => {
    it('makes !important utility rules skip migrated .ui markup', () => {
        expect(run('.px-5{padding-left:3rem!important}', BOOTSTRAP))
            .toBe('.px-5:not(.ui, .ui *){padding-left:3rem!important}');
    });

    it('scopes every selector in a list and keeps pseudo-elements last', () => {
        expect(scopeSelector('.a::after')).toBe('.a:not(.ui, .ui *)::after');
        expect(run('.a,.b::before{color:red!important}', BOOTSTRAP))
            .toBe('.a:not(.ui, .ui *),.b:not(.ui, .ui *)::before{color:red!important}');
    });

    it('leaves component rules and other stylesheets alone', () => {
        expect(run('.btn{padding:1rem}', BOOTSTRAP)).toBe('.btn{padding:1rem}');
        expect(run('.px-5{padding:0!important}', '/app/src/index.css')).toBe('.px-5{padding:0!important}');
    });
});
