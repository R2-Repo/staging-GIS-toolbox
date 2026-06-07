import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        setupFiles: ['./tests/setup-turf.js', './tests/setup-dom.js'],
        environment: 'node'
    }
});
