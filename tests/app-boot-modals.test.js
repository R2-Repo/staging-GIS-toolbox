import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('../react/App.jsx', import.meta.url), 'utf8');
const handlersSource = readFileSync(new URL('../js/tools/tool-handlers.js', import.meta.url), 'utf8');
const modalHostSource = readFileSync(new URL('../react/ui/ModalHost.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../css/main.css', import.meta.url), 'utf8');

describe('app boot modal ordering', () => {
    it('shows the guide splash before prompting to restore cached layers', () => {
        const bootBlock = appSource.slice(
            appSource.indexOf('if (!bootRanRef.current)'),
            appSource.indexOf('return () => mounted.unmount();')
        );
        expect(bootBlock.indexOf('await showToolInfo();')).toBeGreaterThan(-1);
        expect(bootBlock.indexOf('await restoreSessionIfAvailable();')).toBeGreaterThan(-1);
        expect(bootBlock.indexOf('await showToolInfo();')).toBeLessThan(
            bootBlock.indexOf('await restoreSessionIfAvailable();')
        );
    });

    it('starts boot only after the modal host is mounted', () => {
        const modalHostEffect = appSource.slice(
            appSource.indexOf('const mounted = mountModalHost(modalHostRef.current);'),
            appSource.indexOf('return () => mounted.unmount();', appSource.indexOf('mountModalHost(modalHostRef.current)'))
        );
        expect(modalHostEffect).toContain('await restoreSessionIfAvailable();');
        expect(modalHostEffect).toContain('bootRanRef.current = true');
        expect(appSource).not.toMatch(/setupLogsPanel\(\);\s*\n\s*const syncMobileClass[\s\S]{0,400}await restoreSessionIfAvailable\(\)/);
    });

    it('marks splash and deferred modal layers for z-index stacking', () => {
        expect(handlersSource).toContain("layer: 'splash'");
        expect(handlersSource).toContain("layer: 'deferred'");
        expect(modalHostSource).toContain('modal-overlay--splash');
        expect(modalHostSource).toContain('modal-overlay--deferred');
        expect(cssSource).toMatch(/\.modal-overlay--splash[\s\S]*z-index:\s*1100/);
        expect(cssSource).toMatch(/\.modal-overlay--deferred[\s\S]*z-index:\s*900/);
    });
});
