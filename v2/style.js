/**
 * @typedef StyleConfig
 * @property {Array<MediaQueryConfig>} [mediaQueries]
 * @property {string} [attributeName]
 * @property {string} [separator]
 * @property {string} [idAttributeName]
 * @property {string} [idClassPrefix]
 */

/**
 * @typedef MediaQueryConfig
 * @property {string} id
 * @property {string} query
 */

/**
 * Order matters
 * @type {Array<MediaQueryConfig>}
 */
const DEFAULT_MEDIA_QUERIES = [
    {id: "xs", query: "screen and (min-width: 0px)"},
    {id: "sm", query: "screen and (min-width: 600px)"},
    {id: "md", query: "screen and (min-width: 960px)"},
    {id: "lg", query: "screen and (min-width: 1280px)"},
    {id: "xl", query: "screen and (min-width: 1920px)"},
    {id: "xxl", query: "screen and (min-width: 2560px)"},
    {id: "print", query: "print"},
];

/**
 * @param {StyleConfig} options
 * @returns {StyleConfig}
 */
const createConfig = ({mediaQueries, attributeName, separator, idAttributeName, classPrefix: idClassPrefix}) => ({
    mediaQueries: [{id: "", query: ""}].concat(...(mediaQueries ?? DEFAULT_MEDIA_QUERIES)),
    attributeName: attributeName ?? "style",
    separator: separator ?? ":",
    idAttributeName: idAttributeName ?? "style-id-class",
    idClassPrefix: idClassPrefix ?? "style-",
});

/**
 * @param {Node|ParentNode|Element} node
 * @param {StyleConfig} [options]
 */
const register = (node, options = {}) => {
    const config = createConfig(options);

    const attr = `${config.attributeName}${config.separator}`;
    const xPathExp = document.createExpression(`.[@*[starts-with(name(), "${attr}")]]|.//*[@*[starts-with(name(), "${attr}")]]`);
    const applyOnNodeTree = (node, fn) => {
        const xPathRes = xPathExp.evaluate(node, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE);
        for(let i = 0; i < xPathRes.snapshotLength; i++) {
            const el = xPathRes.snapshotItem(i);
            if(el instanceof HTMLElement) {
                fn(el);
            }
        }
    };

    const batchChanges = (fn) => {
        const changeSet = {};
        for(const {query} of config.mediaQueries) {
            changeSet[query] = getStyleTag(query).textContent;
        }

        fn(changeSet);

        for(const query in changeSet) {
            getStyleTag(query).textContent = changeSet[query];
        }
    };

    // Setup attributes mutation observer
    const attrObserver = new MutationObserver(
        (e) => batchChanges((changeSet) => {
            e.forEach((record) => {
                if(record.type === "attributes" && record.attributeName.startsWith()) {
                    processElementStyle(record.target, config, changeSet);
                } else if(record.type === "childList") {
                    record.addedNodes.forEach((node) => applyOnNodeTree(node, el => processElementStyle(el, config, changeSet)));
                    record.removedNodes.forEach((node) => applyOnNodeTree(node, el => removeElementStyle(el, config, changeSet)));
                }
            });
        }),
    );

    for(const {query} of config.mediaQueries) {
        createStyleTag(query);
    }

    batchChanges((changeSet) => applyOnNodeTree(node, el => processElementStyle(el, config, changeSet)));
    attrObserver.observe(node, {
        attributes: true,
        subtree: true,
        childList: true,
    });
};

/**
 * @param {HTMLElement} element
 * @param {StyleConfig} config
 * @param {Object.<string, string>} changeSet
 */
const processElementStyle = (element, config, changeSet) => {
    let idClass = element.getAttribute(config.idAttributeName);
    for(const attr of element.getAttributeNames()) {
        if(!attr.startsWith(config.attributeName + config.separator)) {
            continue;
        }

        const rules = element.getAttribute(attr);

        if(!idClass && rules) {
            const styleTag = getStyleTag("");
            const nextId = parseInt(styleTag.getAttribute("last-id") ?? 0) + 1;
            styleTag.setAttribute("last-id", nextId.toString());
            idClass = `${config.idClassPrefix}${nextId}`;
            element.setAttribute(config.idAttributeName, idClass);
            element.classList.add(idClass);
        }

        if(idClass) {
            const {mediaQuery, pseudoSelector} = parseAttribute(attr, config);
            changeSet[mediaQuery] = updateRules(idClass, pseudoSelector, rules, changeSet[mediaQuery]);
        }
    }
};

const removeElementStyle = (element, config, changeSet) => {
    const idClass = element.getAttribute(config.idAttributeName);
    if(!idClass) {
        return;
    }

    for(const attr of element.getAttributeNames()) {
        if(!attr.startsWith(config.attributeName + config.separator)) {
            continue;
        }

        const {mediaQuery, pseudoSelector} = parseAttribute(attr, config);
        changeSet[mediaQuery] = updateRules(idClass, pseudoSelector, "", changeSet[mediaQuery]);
    }
};

const parseAttribute = (attr, config) => {
    const attrParts = attr.split(config.separator);
    const mediaQuery = config.mediaQueries.find(mq => mq.id === attrParts[1])?.query ?? "";
    let pseudoSelector = attrParts.slice(mediaQuery ? 2 : 1).join(config.separator);
    pseudoSelector = pseudoSelector ? `:${pseudoSelector}` : "";
    return {
        mediaQuery,
        pseudoSelector,
    };
};

const updateRules = (idClass, pseudoSelector, rules, allRules) => {
    const selector = `.${idClass}${pseudoSelector}`;
    const startSelector = `${selector}{`;
    const endSelector = `}/*${selector}*/`;
    const style = rules.length ? `${startSelector}${rules}${endSelector}` : "";

    const startIndex = allRules.indexOf(startSelector);
    if(startIndex > -1) {
        const endIndex = allRules.indexOf(endSelector) + endSelector.length;

        return allRules.replace(
            allRules.slice(startIndex, endIndex),
            style,
        );
    } else {
        return allRules + style;
    }
};

const homemadeIndexOf = (str, search) => {
    let i;
    let j;
    for(i = 0; i < (str.length - search.length); i++) {
        for(j = 0; j < search.length; j++) {
            if(str[i + j] === search[j] && j === (search.length - 1)) {
                console.log(str[i + j], search[j]);
                return i;
            }
        }
    }

    return -1;
};

/** @type {Object.<string, HTMLStyleElement>} */
const styleTags = {};
const getStyleTag = (mediaQuery = "") => styleTags[mediaQuery];
const createStyleTag = (mediaQuery = "") => {
    let el = document.querySelector(`style[js-style][media="${CSS.escape(mediaQuery)}"]`);
    if(el) {
        return;
    }

    el = document.createElement("style");
    el.setAttribute("js-style", "");
    el.setAttribute("media", mediaQuery);
    document.head.appendChild(el);
    styleTags[mediaQuery] = el;
};

if(document && document.currentScript) {
    register(document.querySelector(document.currentScript.getAttribute("selector") ?? "body"), {
        mediaQueries: document.currentScript.getAttribute("media-queries")?.split(",").map(id => ({
            id,
            query: document.currentScript.getAttribute(`${id}-query`) ?? DEFAULT_MEDIA_QUERIES.find(m => m.id === id)?.query ?? id,
        })),
        attributeName: document.currentScript.getAttribute("attribute-name") || null,
        separator: document.currentScript.getAttribute("separator") || null,
        idAttributeName: document.currentScript.getAttribute("id-attribute-name") || null,
        idClassPrefix: document.currentScript.getAttribute("id-class-prefix") || null,
    });
}