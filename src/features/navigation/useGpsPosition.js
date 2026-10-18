import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { shouldAcceptFix } from './gpsFilter';

/**
 * Field-grade GPS position.
 *
 * The watchPosition subscription is created ONCE and never restarted:
 * restarting drops GPS lock and causes jitter. `onFix` is wrapped in
 * useEffectEvent so the watcher always calls the latest render's handler
 * (fresh route, sites, voice setting) without re-subscribing.
 *
 * `refreshGPS` is a one-shot fix with a high-accuracy -> standard fallback
 * and no accuracy filter, so it works on laptops without a GPS chip. It also
 * resets the teleportation filter's baseline. The automatic first fix is
 * `quiet` (progress toasts only for a tap on Refresh GPS; errors always).
 */
export const useGpsPosition = (onFix) => {
    const [userPos, setUserPos] = useState(null);
    const userPosRef = useRef(null);

    const acceptPosition = useCallback((p) => {
        userPosRef.current = p;
        setUserPos(p);
    }, []);

    const refreshGPS = useCallback(({ quiet = false } = {}) => {
        if (!navigator.geolocation) {
            toast.error("Geolocation is not supported by this browser.");
            return;
        }

        if (!quiet) toast.info("Acquiring high-accuracy GPS signal...");

        const toPos = (pos) => ({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                acceptPosition(toPos(pos));
                if (!quiet) toast.success("GPS lock acquired");
            },
            (err) => {
                console.error("GPS Error:", err);
                if (err.code === 3) { // Timeout
                    if (!quiet) toast.warning("High-accuracy timed out. Trying standard GPS...");
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            acceptPosition(toPos(pos));
                            if (!quiet) toast.success("Location found (standard accuracy)");
                        },
                        (err2) => toast.error(`GPS Error: ${err2.message}`),
                        { enableHighAccuracy: false, timeout: 10000 }
                    );
                } else {
                    toast.error(`GPS Error: ${err.message}`);
                }
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    }, [acceptPosition]);

    const handleFix = useEffectEvent((p) => onFix?.(p));

    // Initial fix as soon as the page loads, instead of leaving the user to
    // find the "Refresh GPS" button
    useEffect(() => {
        refreshGPS({ quiet: true });
    }, [refreshGPS]);

    useEffect(() => {
        if (!navigator.geolocation) return;

        const id = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                // accuracy (m) travels with the fix: check-ins record it
                const p = { lat: latitude, lng: longitude, accuracy };
                if (!shouldAcceptFix(userPosRef.current, p, accuracy)) return;

                acceptPosition(p);
                handleFix(p);
            },
            (err) => console.error("GPS Watch Error:", err),
            { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 }
        );

        return () => navigator.geolocation.clearWatch(id);
    }, [acceptPosition]);

    return { userPos, userPosRef, refreshGPS };
};
