/**
 * DOMParser for KML/XML import tests (Node has no native DOM).
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
