import { describe, it, expect } from 'vitest';
import { evaluateGuidance, findNextSite } from './guidance';

// Straight road heading north along lng 28.0; the turn is at polyline index 2.
// 0.001° of latitude ≈ 111 m
const coords = [[28.0, -26.010], [28.0, -26.005], [28.0, -26.000]];
const steps = [
    { instruction: 'Head north', way_points: [0, 2] },
    { instruction: 'Turn right onto Main Rd', way_points: [2, 2] },
];
const metersSouthOfTurn = (m) => ({ lat: -26.000 - m / 111_000, lng: 28.0 });

const evaluate = (overrides) => evaluateGuidance({
    pos: metersSouthOfTurn(1000),
    nextSite: null,
    lastAnnouncedId: null,
    steps,
    stepIdx: 0,
    coords,
    lastHeadsUpIdx: -1,
    lastArrivedIdx: -1,
    ...overrides
});

describe('evaluateGuidance', () => {
    it('stays quiet far from the next maneuver', () => {
        expect(evaluate()).toEqual({ approachingSite: null, headsUp: null, arrive: null });
    });

    it('gives a heads-up between 40 and 150 m before the turn', () => {
        const { headsUp, arrive } = evaluate({ pos: metersSouthOfTurn(100) });
        expect(headsUp).toEqual({ index: 1, step: steps[1] });
        expect(arrive).toBeNull();
    });

    it('does not repeat a heads-up already given', () => {
        expect(evaluate({ pos: metersSouthOfTurn(100), lastHeadsUpIdx: 1 }).headsUp).toBeNull();
    });

    it('advances within 30 m of the turn', () => {
        const { arrive, headsUp } = evaluate({ pos: metersSouthOfTurn(10) });
        expect(arrive).toEqual({ index: 1, step: steps[1] });
        expect(headsUp).toBeNull();
    });

    // Regression: every GPS tick inside 30 m used to re-advance and re-speak
    it('does not advance twice for the same maneuver', () => {
        expect(evaluate({ pos: metersSouthOfTurn(10), lastArrivedIdx: 1 }).arrive).toBeNull();
    });

    it('does nothing on the last step', () => {
        expect(evaluate({ pos: metersSouthOfTurn(10), stepIdx: 1 }).arrive).toBeNull();
    });

    it('flags the next site within 100 m, once', () => {
        const site = { id: 's1', name: 'Tower 7', latitude: -26.0, longitude: 28.0 };
        expect(evaluate({ pos: metersSouthOfTurn(50), nextSite: site }).approachingSite).toBe(site);
        expect(evaluate({ pos: metersSouthOfTurn(50), nextSite: site, lastAnnouncedId: 's1' }).approachingSite).toBeNull();
        expect(evaluate({ pos: metersSouthOfTurn(500), nextSite: site }).approachingSite).toBeNull();
    });

    it('tolerates a missing route', () => {
        expect(evaluate({ coords: null, steps: [] }).arrive).toBeNull();
    });
});

describe('findNextSite', () => {
    // Regression: checking a site used to leave it as the "next stop"
    it('moves on to the following stop once a site is checked', () => {
        const sites = [
            { id: 'a', is_checked: true },
            { id: 'b', is_checked: false },
            { id: 'c', is_checked: false },
        ];
        expect(findNextSite(sites).id).toBe('b');
    });

    it('is null when every site is checked', () => {
        expect(findNextSite([{ id: 'a', is_checked: true }])).toBeNull();
    });
});
