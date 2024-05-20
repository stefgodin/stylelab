/**
 * Order matters
 * @type {Object.<string, MediaQueryList>}
 */
const DEFAULT_MEDIA_QUERIES = {
    "xs": window.matchMedia("screen and (min-width: 0px)"),
    "sm": window.matchMedia("screen and (min-width: 600px)"),
    "md": window.matchMedia("screen and (min-width: 960px)"),
    "lg": window.matchMedia("screen and (min-width: 1280px)"),
    "xl": window.matchMedia("screen and (min-width: 1920px)"),
    "xxl": window.matchMedia("screen and (min-width: 2560px)"),
    "print": window.matchMedia("print"),
};

const ATTR = "style";
const BASE_ATTR = `base:${ATTR}`;

const nodeRegistry = [];
const cleanUpRegistry = [];
/**
 * @param {Node|ParentNode|Element} node
 * @param {{queries: Object.<string, MediaQueryList>}} options
 */
const register = (node, options = {queries: {}}) => {
    const mediaQueries = {};
    for(const queryList of [DEFAULT_MEDIA_QUERIES, options.queries]) {
        for(const namespace in queryList) {
            if(queryList[namespace] instanceof MediaQueryList){
                mediaQueries[`${namespace}:${ATTR}`] = queryList[namespace];
            }
            else{
                delete mediaQueries[`${namespace}:${ATTR}`];
            }
        }
    }

    // Setup media query change handlers
    const handlers = [];
    if(typeof node.getAttribute === "function") {
        handlers.push(() => processElementCssRules(node, mediaQueries))
    }

    if(typeof node.querySelectorAll === "function") {
        const attrSelector = getAttrSelector(Object.keys(mediaQueries));
        handlers.push(() => node.querySelectorAll(attrSelector).forEach((el) => processElementCssRules(el, mediaQueries)));
    }

    let cleanUpFunctions = [];
    for(const handler of handlers) {
        for(const mql of Object.values(mediaQueries)) {
            const wrappedHandler = () => node ? handler() : mql.removeEventListener('change', wrappedHandler);
            mql.addEventListener('change', wrappedHandler);
            cleanUpFunctions.push(() => mql.removeEventListener('change', wrappedHandler));
        }
        handler();
    }

    // Setup attributes mutation observer
    const attrSelector = getAttrSelector(Object.keys(mediaQueries));
    const attrObserver = new MutationObserver((e) => e.forEach((record) => {
        if(record.target.matches(attrSelector)) {
            processElementCssRules(record.target, mediaQueries)
        }
    }));
    attrObserver.observe(node, {
        attributeFilter: Object.keys(mediaQueries),
        subtree: true,
        childList: true,
    });
    cleanUpFunctions.push(() => attrObserver.disconnect());

    nodeRegistry.push(node);
    cleanUpRegistry.push(() => cleanUpFunctions.forEach(fn => fn()));
}

const unregister = (node) => {
    const i = nodeRegistry.indexOf(node);
    if(i > -1){
        nodeRegistry.splice(i, 1);
        cleanUpRegistry[i]();
        cleanUpRegistry.splice(i, 1);
    }
}

const getAttrSelector = (attributes) => `[${BASE_ATTR}],[${attributes.join('],[')}]`.replaceAll(":", "\\:");

/**
 * @param {Element} element
 * @param {Object.<string, MediaQueryList>} mediaQueries
 */
const processElementCssRules = (element, mediaQueries) => {
    if(!element.hasAttribute(BASE_ATTR)){
        element.setAttribute(BASE_ATTR, element.getAttribute(ATTR) ?? "");
    }

    let rules = element.getAttribute(BASE_ATTR);
    for(const attr in mediaQueries) {
        if(element.hasAttribute(attr) && mediaQueries[attr].matches){
            rules = `${rules};${element.getAttribute(attr)}`;
        }
    }

    element.setAttribute(ATTR, rules);
}

// Tests
register(document);
setTimeout(() => document.querySelector('h2').setAttribute('lg:style', "background-color: grey"), 1000);
setTimeout(() => unregister(document), 5000);
setTimeout(() => document.querySelector('h2').setAttribute('lg:style', "background-color: none"), 10000);
