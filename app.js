var width = window.innerWidth, height = window.innerHeight;
var svg = d3.select("svg").attr("viewBox", "0, 0, " + width + ", " + height + "")
var group = svg.append("svg:g");
const RADIXCHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
const CHAR2LVLS = (function () {
    const LEVELS = [0, 1, 2, 3, 4, 5]
    var levels = {};
    for (var i = 0; i < 6; i++) {
        for (var j = 0; j < 6; j++) {
            let pos = i * 6 + j;
            levels[RADIXCHARS[pos]] = [LEVELS[i], LEVELS[j]]
        }
    }
    return levels
})();
const levelColorNames = ['white', 'blue', 'green', 'yellow', 'orange', 'red'];
const levelColors = ['#ffffff', '#3598db', '#30cc70', '#f3c218', '#d58337', '#e84c3d'];
let LANGS = {
    "en": {
        "about": "About {globe-level}",
        "globe-level": "Globe Level",
        "play-in-region": "Play in {}",
        "level0": "Never been there",
        "level1": "Passed there",
        "level2": "Alighted there",
        "level3": "Visited there",
        "level4": "Stayed there",
        "level5": "Lived there",
        "set-name": "Set Name",
        "screenshot": "Screenshot",
        "show-labels": "Labels",
        "show-graticule": "Graticules",
        "confirm-clear-levels": "Are you sure to clear all level colors?",
        "ask-for-name": "Please enter the name you want to show:",
        "projection.orthographic": "3D Globe",
        "projection.natural-earth": "Natural Earth",
        "projection.equirectangular": "Equirectangular",
        "projection.mercator": "Mercator",
        "projection.azimuthal-equal-area": "Azimuthal Equal-Area",
    },
}
class Lang {
    constructor(locale) {
        this.default = LANGS[locale];
        this.active = this.default;
    }
    _(key) {
        return this.active[key] || this.default[key];
    }
    area(id) {
        return this._(`region.${id}`)
    }
    setArea(id, value) {
        this.active[`region.${id}`] = value;
    }
    hasLocale(locale) {
        return LANGS[locale] != undefined;
    }
    setLocale(locale, data = null) {
        if (data)
            LANGS[locale] = data;
        this.active = LANGS[locale];
    }
}
let UI = new Lang("en");
let links = {};

const INIT_SCALE = 160;
const INIT_K = 2.5;
const INIT_FONTSIZE = 13;
const PROJECTIONS = [
    d3.geoOrthographic().clipAngle(90).precision(0.5),
    d3.geoNaturalEarth1().precision(0.5),
    d3.geoEquirectangular().precision(0.5),
    d3.geoMercator().precision(0.5),
    d3.geoAzimuthalEqualArea().precision(0.5),
];
var projectionIndex = 0;
var projection = PROJECTIONS[0].scale(INIT_SCALE).translate([width / 2, height / 2]);
var path = d3.geoPath().projection(projection);
var lastZoomK = 1;
var zoom = d3.zoom()
    .scaleExtent([1, 50])
    .on("zoom", onzoom);


d3.json("map/map.topojson", function (world) {
    console.log(world)
    const { projId, k, rot, lvl, locale } = readHash();

    // Ocean (sphere background)
    group.append("path")
        .datum({ type: "Sphere" })
        .attr("class", "sphere")
        .attr("d", path)
        .attr("fill", "#9EC3FB")
        .attr("stroke", "#d1e3ff")
        .attr("stroke-width", "4")
        .on("dblclick", function () { d3.event.stopPropagation() })

    // ── GRATICULE (grid lines, drawn last = on top) ────────────────
    group.append("path")
      .datum(d3.geoGraticule()())
      .attr("class", "graticule")
      .attr("d", path)
      .attr("display", "none")
      .attr("fill", "none")
      .attr("stroke", "#d1e3ff")
      .attr("stroke-width", 0.5)
      .attr("opacity", 0.5);

    var countries = topojson.feature(world, world.objects.collection);

    // Areas
    var nodes = group.append("g").selectAll("g").data(countries.features).enter()
        .each(function (d, index) {
            d3.select(this)
                .append("g")
                .attr("class", "node")
                .append("path")
                .attr("d", path)
                .attr("id", function (d) {
                    return d.id;
                })
                .attr("stroke", "black")
                .attr("stroke-linejoin", "round")
                .attr("fill", "#fff")
                .on("click", function (d) {
                    if (d3.event.defaultPrevented) return;
                    d3.event.stopPropagation();
                    showPopup(d.id, d3.event.pageX, d3.event.pageY);
                })
                .on("dblclick", function () { d3.event.stopPropagation() })
            if (lvl[index]) {
                setCountryLevel(d.id, lvl[index]);
            }
        })

    // country labels — sorted by area descending so larger countries have higher priority
    var sortedFeatures = countries.features.slice().sort(function (a, b) {
        return d3.geoArea(b) - d3.geoArea(a);
    });
    nodes = group.append("g").selectAll("g").data(sortedFeatures).enter()
        .append("g").each(function (d) {
            UI.setArea(d.id, d.id);

            const center = getLabelCentroid(d);
            var { fg, bg } = addShadowLabel(d3.select(this), center, INIT_FONTSIZE, d.id);
            initRegionLabel(bg, d.id);
            initRegionLabel(fg, d.id);
            bg.attr("class", "place place-outline")
                .attr("stroke", "white")
                .attr("stroke-width", "2")
            fg.attr("class", "place place-label")
        })

    addTitleLabel(group.append("g").attr("id", "level"), lvl.reduce((a, b) => a + b));

    params = parseQuery(window.location.search);
    addShadowLabel(group, [40, height - 40], 32, params.t || "");

    projection.rotate([rot[0], rot[1], 0])
    switchProjection(projId);
    svg.call(zoom.transform, d3.zoomIdentity.scale(k))
    document.querySelector("#proj-select").value = projId;
    translateUI(locale);
    arrangeLabels();
});

function addTitleLabel(d3Node, lvl) {
    let {fg, bg} = addShadowLabel(d3Node, [40, 100], 42, UI._("globe-level") + " " + lvl);
    fg.attr("font-weight", 800)
    bg.attr("font-weight", 800)
}

function addShadowLabel(group, position, fontSize, text = "") {
    let bg = group.append("text")
        .attr("x", position[0])
        .attr("y", position[1])
        .attr("font-size", fontSize)
        .text(text)
        .attr("stroke", "white")
        .attr("stroke-width", "4")
    let fg = group.append("text")
        .attr("x", position[0])
        .attr("y", position[1])
        .attr("font-size", fontSize)
        .text(text)
    return { fg, bg };
}

function initRegionLabel(d3Node, text) {
    d3Node
        .attr("text-anchor", "middle")
        .attr("i18n", text)
        .on("click", function (d) {
            if (d3.event.defaultPrevented) return;
            d3.event.stopPropagation();
            showPopup(text, d3.event.pageX, d3.event.pageY);
        })
        .on("dblclick", function () { d3.event.stopPropagation() })
}

var timerId = null, cancelInertial = false;
var v0, // Mouse position in Cartesian coordinates at start of drag gesture.
    r0, // Projection rotation as Euler angles at start.
    q0, // Projection rotation as versor at start.
    v10, // Mouse position in Cartesian coordinates just before end of drag gesture.
    v11, // Mouse position in Cartesian coordinates at end.
    q10; // Projection rotation as versor at end.
var inertia = d3.inertiaHelper({
    start: function () {
        v0 = versor.cartesian(projection.invert(inertia.position));
        r0 = projection.rotate();
        q0 = versor(r0);
        cancelInertial = false;
        // opt.start && opt.start();
    },
    move: function () {
        r0[2] = 0;
        var inv = projection.rotate(r0).invert(inertia.position);
        if (isNaN(inv[0])) return;
        var v1 = versor.cartesian(inv),
            q1 = versor.multiply(q0, versor.delta(v0, v1)),
            r1 = versor.rotation(q1);
        // opt.render(r1);
        // opt.move && opt.move();
        projection.rotate([r1[0], r1[1], 0])

        draw();
        arrangeLabels();
        arrangePopup();

        if (timerId) clearTimeout(timerId);
        timerId = setTimeout(() => {
            cancelInertial = true;
            updateHash();
        }, 100);
    },
    end: function () {
        // velocity
        v10 = versor.cartesian(
            projection.invert(
                inertia.position.map(function (d, i) {
                    return d - inertia.velocity[i] / 1000;
                })
            )
        );
        q10 = versor(projection.rotate());
        v11 = versor.cartesian(projection.invert(inertia.position));
        updateHash();
    },
    render: function (t) {
        if (cancelInertial) {
            return
        };
        if (timerId) clearTimeout(timerId);
        var r1 = versor.rotation(
            versor.multiply(q10, versor.delta(v10, v11, t * 140))
        );
        // opt.render && opt.render(rotation);
        projection.rotate([r1[0], r1[1], 0])
        draw();
        arrangeLabels();
        arrangePopup();
        if (t >= 1.0)
            updateHash();
    },
    time: 1700,
});



svg.call(d3.drag()
    .on("start", inertia.start)
    .on("drag", inertia.move)
    .on("end", inertia.end)
);


function draw() {
    let r = projection.rotate();
    projection.rotate([r[0], r[1], 0])
    svg.selectAll("path").attr("d", path);
    svg.selectAll("text.place").each(function (d) {
        var c = getLabelCentroid(d);
        d3.select(this)
            .attr("x", isNaN(c[0]) ? 0 : c[0])
            .attr("y", isNaN(c[1]) ? 0 : c[1])
            .selectAll("tspan")
            .attr("x", isNaN(c[0]) ? 0 : c[0])
    })

    arrangeLabels();
}


svg.call(zoom);
svg.call(zoom.transform, d3.zoomIdentity.scale(INIT_K))
function onzoom() {
    var s = projection.scale() * d3.event.transform.k / lastZoomK;
    lastZoomK = d3.event.transform.k;
    projection.scale(s);

    // Do not apply d3.zoom's mouse-relative transform — redraw centered via projection
    group.attr("transform", null);
    draw();

    // Scale font size inversely with projection scale so labels stay readable
    var relScale = projection.scale() / INIT_SCALE;
    svg.selectAll("text.place")
        .style("font-size", Math.max(4, INIT_FONTSIZE / Math.pow(relScale, 0.05)) + "px");
    arrangeLabels();
    arrangePopup();
}


function arrangeLabels() {
    // Reset all to visible first — getBBox() throws on display:none elements in Chrome
    svg.selectAll("text.place")
        .attr("shown", "false")
        .style("display", null);

    var shown = [];
    svg.selectAll("text.place-outline")
        .each(function (d) {
            const geo = getLabelCentroid(d);
            var isShown = true;
            if (d3.select(this).attr("disabled") == "true") isShown = false;
            if (isNaN(geo[0])) isShown = false;

            var b = this.getBBox();
            for (var i = 0; i < shown.length; i++) {
                var s = shown[i];
                if (b.x < s.x + s.width && b.x + b.width > s.x &&
                    b.y < s.y + s.height && b.y + b.height > s.y) {
                    isShown = false; // Hide if overlaps a higher-priority label
                }
            }

            d3.select(this)
                .attr("shown", isShown)
                .style("display", function (d) {
                    if (!isShown) return "none"
                    // Store a plain object copy (not a live DOMRect)
                    shown.push({ x: b.x, y: b.y, width: b.width, height: b.height });
                    return null; // Show (remove inline style override)
                });
        })
    svg.selectAll("text.place-outline[shown=false] ~ text.place-label")
        .style("display", "none")
}

function toggleLabel(show) {
    if (!show) {
        svg.selectAll("text.place").attr("disabled", "true");
    } else {
        svg.selectAll("text.place").attr("disabled", null);
    }
    arrangeLabels()
}

function toggleGraticule(show) {
    if (!show) {
        svg.selectAll("path.graticule").attr("display", "none");
    } else {
        svg.selectAll("path.graticule").attr("display", null);
    }
}


// For MultiPolygon features, centroid may fall outside all polygons (e.g. USA, Russia).
// Find the largest sub-polygon, compute its geographic centroid, then project that
// single point — more robust than path.centroid() which averages projected SVG coords
// and breaks across antimeridian or under heavy projection distortion.
function getLabelCentroid(d) {
    if (!d || !d.geometry) return [NaN, NaN];
    var feature = d;
    if (d.geometry.type === 'MultiPolygon') {
        var largest = null, largestArea = 0;
        d.geometry.coordinates.forEach(function (coords) {
            var poly = { type: 'Feature', geometry: { type: 'Polygon', coordinates: coords } };
            var a = d3.geoArea(poly);
            if (a > largestArea) { largestArea = a; largest = poly; }
        });
        if (largest) feature = largest;
    }
    if (projection == PROJECTIONS[0]) {
        if (largestArea < 0.015)
            return path.centroid(d);
        return path.centroid(feature);
    }
    var geo = d3.geoCentroid(feature);       // geographic [lon, lat] — projection-independent
    return projection(geo) || [NaN, NaN];    // null when clipped (back hemisphere)
}

function switchProjection(index) {
    projectionIndex = +index;
    var object = PROJECTIONS[projectionIndex];
    object
        .scale(projection.scale())
        .translate(projection.translate())
        .rotate(projection.rotate());
    path.projection(object);
    projection = object
    draw();
    arrangeLabels();
    arrangePopup();
    updateHash();
}


// --- Popup ---
var activeAreaId = null;
var activeGeoCentroid = null; // geographic centroid of the active area, stable across zoom

function svgToClient(svgX, svgY) {
    var pt = svg.node().createSVGPoint();
    pt.x = svgX;
    pt.y = svgY;
    var screen = pt.matrixTransform(svg.node().getScreenCTM());
    return { x: screen.x, y: screen.y };
}

function clientToGeo(clientX, clientY) {
    var pt = svg.node().createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    var svgPt = pt.matrixTransform(svg.node().getScreenCTM().inverse());
    return projection.invert([svgPt.x, svgPt.y]);
}

function arrangePopup() {
    if (!activeGeoCentroid || popup.style("display") === "none") return;
    var projected = projection(activeGeoCentroid);
    if (!projected) return; // country rotated to back hemisphere
    var client = svgToClient(projected[0], projected[1]);
    popup.style("left", client.x + "px")
        .style("top", client.y + "px");
}

var popup = d3.select("#form");
var levelBtns = popup.selectAll(".level-btn")
    .data(levelColorNames).enter()
    .append("label")
    .attr("class", (d) => `label lang level ${d}`)
    // .text(function(d, i) { return UI[`level${i}`]; })
    .attr("i18n", (d, i) => `level${i}`)
    .on("click", function (d, i) {
        d3.event.stopPropagation();
        setCountryLevel(activeAreaId, i);
        hidePopup();
    });

function showPopup(id, clientX, clientY) {
    activeAreaId = id;
    activeGeoCentroid = clientToGeo(clientX, clientY);
    popup.select(".place-name").text(UI.area(id));
    popup.style("display", "block")
        .style("left", clientX + "px")
        .style("top", clientY + "px");
    popup.select(".search")
        .attr("href", 'https://google.com/search?q=' + id)
        .attr("title", 'Search: ' + id)
    if (links[id]) {
        popup.node().classList.add("has-external")
        let d3Links = popup.select(".links")
        d3Links.node().innerHTML = "";
        d3Links.append("span").text(fmt(UI._("play-in-region"), UI.area(id)))
        for (var [title, href] of Object.entries(links[id])) {
            d3Links.append("a")
                .attr("href", href)
                .attr("target", "_blank")
                .text(title)
        }
    } else {
        popup.node().classList.remove("has-external")
    }
}
function hidePopup() {
    popup.style("display", "none");
    popup.select("input[type=checkbox]").node().checked = false;
    activeAreaId = null;
    activeGeoCentroid = null;
}
function setCountryLevel(id, level) {
    if (!id) return;
    svg.selectAll(".node path").filter(function (d) { return d.id === id; })
        .attr("levelcolor", levelColorNames[level])
        .attr("level", level)
        .attr("fill", levelColors[level]);
    updateHash();
    updateTitle();
}
document.addEventListener("click", function(e) {
    console.log(e.target)
    if (!e.target.classList.contains("close") && e.target.closest("#form")) {
        return;
    }
    hidePopup();
});

function updateTitle() {
    const hashs = readHash();
    const title = document.querySelector("#level");
    if (title) {
        title.innerHTML = "";
        addTitleLabel(d3.select(title), hashs.lvl.reduce((a, b) => a + b));
    }
}

function updateHash() {
    const projId = document.querySelector("#proj-select").value;
    const rot = projection.rotate()
    const levelBigNumber = encodeLevels()
    const lang = document.querySelector("#lang").value;

    let hashs = {};
    if (projId != 0) {
        hashs.p = projId;
    }
    if (lastZoomK != INIT_K) {
        hashs.k = lastZoomK.toFixed(1);
    }
    if (rot[0] != 0 || rot[1] != 0) {
        hashs.r = `${rot[0].toFixed(3)},${rot[1].toFixed(3)}`;
    }
    if (levelBigNumber) {
        hashs.l = levelBigNumber;
    }
    if (lang != "en") {
        hashs.la = lang;
    }
    window.location = encodeQuery("#", hashs);
    return hashs;
}

function readHash() {
    const hash = parseQuery(window.location.hash);
    const rot = (hash.r != undefined ? hash.r : "0.0,0.0").split(",")
    return {
        "projId": parseInt(hash.p != undefined ? hash.p : "0"),
        "k": parseFloat(hash.k != undefined ? hash.k : `${INIT_K}`),
        "rot": [parseFloat(rot[0]), parseFloat(rot[1])],
        "lvl": decodeLevels(hash.l || "0"),
        "locale": hash.la || "en",
    }
}

/*
 * We don't want to simply combiles all levels for 201 areas. This will be a very long string,
 * so we pack all those values into a short form string.
 *
 * Since level is 0 ~ 5, combination of two levels produces only 36 values,
 * then we can simply encoding those 36 values to 0,1,...9,a,...z
 *
 * Finally, since almost all chars will be zeroes for most people that only had traveled to some places,
 * we can use special chars to represent some fixed amount of zeroes.
 * In this implant, '_' is '00000000000', ... etc.
 * Prime number of counts I think are good choices for this purpose.
 */
function encodeLevels() {
    const areas = document.querySelectorAll("path[id]")
    const levels = [...areas].map(e => e.attributes.level ? parseInt(e.attributes.level.value) : 0);
    let bignum = "";  // little endian in 32 based
    for (var i = 0; i < areas.length; i += 2) {
        bignum += RADIXCHARS[levels[i] * 6 + (levels[i + 1] || 0)]
    }
    return bignum.replace(/0+$/, "")
        .replace(/00000000000/g, "_")
        .replace(/0000000/g, "S")
        .replace(/00000/g, "F")
        .replace(/000/g, "T")
        .replace(/00/g, "D");
}

function decodeLevels(bignum) {
    let levels = [];
    let rawbignum = bignum
        .replace(/D/g, "00")
        .replace(/T/g, "000")
        .replace(/F/g, "00000")
        .replace(/S/g, "0000000")
        .replace(/_/g, "00000000000")
    for (var i = 0; i < rawbignum.length; i++) {
        let lvls = CHAR2LVLS[rawbignum[i]];
        levels.push(...lvls);
    }
    return levels;
}

function encodeQuery(prefix, map) {
    var params = [];
    Object.entries(map).forEach(([k, v]) => {
        params.push(`${k}=${v}`)
    })
    if (params) {
        return prefix + params.join("&");
    } else {
        return "";
    }
}

function parseQuery(search) {
    params = {};
    queries = search.substring(1).split("&");
    queries.forEach(function (val) {
        query = val.split("=");
        if (query.length == 2)
            params[query[0]] = decodeURI(query[1]);
    });

    return params;
}

function clearLevels() {
    let result = confirm(UI._("confirm-clear-levels"));
    if (!result) return;

    const hashs = readHash();
    window.location.hash = encodeQuery("#", {
        p: hashs.projId,
        k: hashs.k,
        r: hashs.rot,
    });
    window.location.reload();
}

function setAuthor() {
    p = parseQuery(window.location.search);
    answer = prompt(UI._("ask-for-name"), p.t);
    if (answer != null) {
        window.location.search = "t=" + encodeURI(answer);
    }
}

function toDataURL(width, height) {
    var svgString = new XMLSerializer().serializeToString(document.querySelector('svg'));
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvg(canvas, svgString);
    return canvas.toDataURL("image/png");
}

function saveAsImage(elem) {
    const svg = document.querySelector("svg");
    const bbox = svg.getBBox();
    const dpi = window.devicePixelRatio;
    var png = toDataURL(bbox.width * dpi, bbox.height * dpi);
    elem.setAttribute('href', png);
    // window.open(png, 'japanex.png');
};

async function loadData(path, callback) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Network response was not ok (${path})`);
        const data = await response.json();
        callback(data);
    } catch (error) {
        console.error('Error loading JSON:', error);
    }
}

function fmt(fmtstr, ...values) {
    return fmtstr.replace(/{.*}/g, (match) => values.pop() || UI._(match.slice(1, match.length - 1)));
}
function translateUI(lang = "en") {
    if (!UI.hasLocale(lang)) {
        loadData(`lang/${lang}.json`, function (data) {
            UI.setLocale(lang, data)
            translateUI(lang);
        });
    } else {
        UI.setLocale(lang)
        document.querySelectorAll("[i18n]").forEach(function (elem) {
            const key = elem.attributes.i18n.value;

            if (elem.classList.contains("place")) {
                const text = UI.area(key);
                const longText = text.length > 15 && text.indexOf(" ") > 0;
                const d3Node = d3.select(elem);
                if (!longText) {
                    d3Node.text(text);
                } else {
                    let half_pos = text.length / 2;
                    let last_space_pos = -1;
                    for (let i = 0; i < text.length; ++i) {
                        if (text[i] == " ") {
                            if (Math.abs(half_pos - i) < Math.abs(half_pos - last_space_pos)) {
                                last_space_pos = i;
                            }
                        }
                    }
                    elem.innerHTML = "";
                    d3Node.append("tspan")
                        .attr("x", d3Node.attr("x"))
                        .attr("dy", "0")
                        .text(text.slice(0, last_space_pos));
                    d3Node.append("tspan")
                        .attr("x", d3Node.attr("x"))
                        .attr("dy", "1em")
                        .text(text.slice(last_space_pos + 1));
                }
            } else {
                elem.innerHTML = fmt(UI._(key));
            }
        })
        arrangeLabels();
    }
    updateHash();
    updateTitle();
}

loadData("map/links.json", function(data) {
    links = data;
})
