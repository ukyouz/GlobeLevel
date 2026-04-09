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
const RTL_REGIONS = [
    "Bahrain",
    "Chad",
    "Comoros",
    "Djibouti",
    "Egypt",
    "Eritrea",
    "Iran",
    "Iraq",
    "Jordan",
    "Kuwait",
    "Lebanon",
    "Libya",
    "Mauritania",
    "Morocco",
    "Oman",
    "Pakistan",
    "Qatar",
    "Saudi Arabia",
    "Somalia",
    "Sudan",
    "Syria",
    "Tunisia",
    "United Arab Emirates",
    "Western Sahara",
    "Yemen",
]
const DISPUTED_REGIONS = [
    "Palestine",
    "Western Sahara",
]
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
        "show-flags": "Flags",
        "show-labels": "Labels",
        "show-graticule": "Graticules",
        "confirm-clear-levels": "Are you sure to clear all level colors?",
        "ask-for-name": "Please enter the name you want to show:",
        "legend.small": "Small Legend",
        "legend.big": "Big Legend",
        "legend.none": "No Legend",
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

const FLAG_HEIGHT = 10;
const INIT_SCALE = 50;
const INIT_K = 8, MIN_K = 1, MAX_K = 159;
const INIT_FONTSIZE = 13;
const PROJECTIONS = [
    d3.geoOrthographic().clipAngle(90).precision(0.4),
    d3.geoNaturalEarth1().precision(0.4),
    d3.geoEquirectangular().precision(0.4),
    d3.geoMercator().precision(0.4),
    d3.geoAzimuthalEqualArea().precision(0.4),
];
var projectionIndex = 0;
var projection = PROJECTIONS[0].scale(INIT_SCALE).translate([width / 2, height / 2]);
var path = d3.geoPath().projection(projection);
var lastZoomK = MIN_K;
var levels = {};

class Hashable {
    get default() {return 0}
    get tag() {console.error("please implant this")}
    currentValue() {console.error("please implant this")}
    fromHash(val) {return val || this.default}
    toHash(val) {return val}
    initUi(val) {}
}

class ProjectionId extends Hashable {
    constructor() {
        super()
        this.obj = document.querySelector("#proj-select")
    }
    get tag() {return "p"}
    currentValue() {return this.obj.value}
    fromHash(val) {return parseInt(val || "0")}
    initUi(val) {
        this.obj.value = val,
        switchProjection(val);
    }
}

class Scaling extends Hashable {
    get default() {return INIT_K}
    get tag() {return "k"}
    currentValue() {return lastZoomK}
    fromHash(val) {return parseFloat(val || INIT_K)}
    toHash(val) {return val.toFixed(1)}
    initUi(val) {onzoom(val)}
}

class Rotation extends Hashable {
    get default() {return "0.000,0.000"}
    get tag() {return "rot"}
    currentValue() {
        let rot = projection.rotate();
        return `${rot[0].toFixed(3)},${rot[1].toFixed(3)}`
    }
    fromHash(val) {
        const rot = (val || "0.0,0.0").split(",")
        return [parseFloat(rot[0]), parseFloat(rot[1])]
    }
    initUi(val) {projection.rotate([val[0], val[1], 0])}
}

class Levels extends Hashable {
    get default() {return ""}
    get tag() {return "l"}
    currentValue() {return encodeLevels()}
    fromHash(val) {return decodeLevels(val || "0")}
}

class LabelStyle extends Hashable {
    get default() {return "l"}
    get tag() {return "ls"}
    currentValue() {
        const showGraticule = document.querySelector("#showGraticule");
        let style = ""
        if (showLabel.checked) style += "l";
        if (showFlag.checked) style += "f";
        if (showGraticule.checked) style += "g";
        return style;
    }
    initUi(val) {
        showLabel.checked = val.indexOf("l") >= 0;
        showFlag.checked = val.indexOf("f") >= 0;
        showGraticule.checked = val.indexOf("g") >= 0;
    }
}

const lang_selector = document.querySelector("#lang");
const supports = Array.from(lang_selector.querySelectorAll("option"), e => e.value);
const lang_set = window.navigator.language.split('-').pop().toLowerCase();

class Locale extends Hashable {
    get default() {return supports.indexOf(lang_set) >= 0 ? lang_set : "en"}
    get tag() {return "la"}
    currentValue() {return document.querySelector("#lang").value}
    initUi(val) {translateUI(val)}
}

// class LegendStyle extends Hashable {
//     constructor() {
//         super()
//         this.obj = document.querySelector("#legend-style");
//     }
//     get default() {return "small"}
//     get tag() {return "le"}
//     currentValue() {return this.obj.value}
//     initUi(val) {
//         this.obj.value = val
//         switchLegend(val)
//     }
// }

class Author extends Hashable {
    get default() {return ""}
    get tag() {return "n"}
    currentValue() {
        let obj = document.querySelector("#author");
        return obj?.querySelector("text").textContent || "";
    }
    initUi(val) {
        let obj = document.querySelector("#author");
        if (obj) {
            obj.outerHTML = "";
        }
        addShadowLabel(group.append("g").attr("id", "author"), [16, height - 32], 32, val);
    }
}

let hashMap = {
    "projId": new ProjectionId(),
    "k": new Scaling(),
    "rot": new Rotation(),
    "lvl": new Levels(),
    "label": new LabelStyle(),
    "locale": new Locale(),
    // "legend": new LegendStyle(),
    "name": new Author(),
}
function readHash() {
    let hashObj = {}
    const hash = parseQuery(window.location.hash);
    for (const [key, ins] of Object.entries(hashMap)) {
        hashObj[key] = ins.fromHash(hash[ins.tag]);
    }
    return hashObj;
}
function updateHash() {
    let hashs = {};
    for (const [key, ins] of Object.entries(hashMap)) {
        let val = ins.currentValue()
        if (val != ins.default) {
            hashs[ins.tag] = ins.toHash(val)
        }
    }
    window.location = encodeQuery("#", hashs);
    clearImage();
}

let earthRadius = 0;
d3.json("map/map.topojson", function (world) {
    console.log(world)
    const hashs = readHash();

    // Ocean (sphere background)
    let ocean = group.append("path")
        .datum({ type: "Sphere" })
        .attr("class", "sphere")
        .attr("d", path)
        .attr("fill", "#9EC3FB")
        .attr("stroke", "#d1e3ff")
        .attr("stroke-width", "4")
        .on("dblclick", function () { d3.event.stopPropagation() })
    let bbox = ocean.node().getBoundingClientRect();
    earthRadius = bbox.height / 2;

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

    var regions = topojson.feature(world, world.objects.collection);

    // Areas
    var nodes = group.append("g").attr("class", "areas").selectAll("g").data(regions.features).enter()
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
                .attr("stroke-dasharray", (d) => DISPUTED_REGIONS.indexOf(d.id) >= 0 ? "4 2": null)
                // .attr("stroke-opacity", (d) => DISPUTED_REGIONS.indexOf(d.id) >= 0 ? 0.5: null)
                .attr("fill", (d) => DISPUTED_REGIONS.indexOf(d.id) >= 0 ? "transparent": "#fff")
                .on("click", function (d) { onRegionClicked(d.id) })
                .on("dblclick", function () { d3.event.stopPropagation() })
            if (hashs.lvl[index]) {
                setCountryLevel(d.id, hashs.lvl[index]);
            }
        })

    // country labels — sorted by area descending so larger regions have higher priority
    var sortedFeatures = regions.features.slice().sort(function (a, b) {
        return d3.geoArea(b) - d3.geoArea(a);
    });

    let loadedImgQnt = 0;
    nodes = group.append("g").attr("class", "labels").selectAll("g").data(sortedFeatures).enter()
        .append("g").each(function (d) {
            UI.setArea(d.id, d.id);

            const center = cachedLabelCentroid(d, true);
            var { fg, bg } = addShadowLabel(d3.select(this), center, INIT_FONTSIZE, d.id);
            initRegionLabel(bg, d.id);
            initRegionLabel(fg, d.id);
            bg.attr("class", "place place-outline")
                .attr("stroke", "white")
                .attr("stroke-width", "2")
            fg.attr("class", "place place-label")

            d3.select(this).append("image").each(function(d) {
                d3.select(this)
                    .attr("class", "place-flag")
                    .attr("href", `flags/${d.id}.webp`)
                    .attr("data-height", FLAG_HEIGHT + 2)  // add margin to height
                    .attr("height", FLAG_HEIGHT)
                    .on("click", function(d) {onRegionClicked(d.id)})
                const img = new Image();
                img.src = `flags/${d.id}.webp`
                img.onload = () => {
                    let width = img.naturalWidth * FLAG_HEIGHT / img.naturalHeight;
                    d3.select(this)
                        .attr("width", width)
                        .attr("data-width", width + 2)  // add margin to image
                    if (loadedImgQnt == sortedFeatures.length) {
                        arrangeLabels();
                    }
                }
            })
        })
    addTitleLabel(group.append("g").attr("id", "level"), hashs.lvl.reduce((a, b) => a + b));

    for (const [key, val] of Object.entries(hashs)) {
        hashMap[key].initUi(val)
    }

    draw();
    updateLabelBBox();
    arrangeLabels();
    addSmallLevelsLegend();
});

const TITLE_FONTSZ = 42;
function addTitleLabel(d3Node, lvl) {
    let homeLinks = document.querySelector(".nav-group")
    let bbox = homeLinks.getBoundingClientRect();
    let top = bbox.bottom + bbox.top + TITLE_FONTSZ;
    let {fg, bg} = addShadowLabel(d3Node, [16, top], TITLE_FONTSZ, UI._("globe-level") + " " + lvl);
    fg.attr("font-weight", 800)
    bg.attr("font-weight", 800)
}

function addShadowLabel(group, position, fontSize, text = "") {
    let bg = group.append("text")
        .attr("x", position[0] || 0)
        .attr("y", position[1] || 0)
        .attr("font-size", fontSize)
        .text(text)
        .attr("stroke", "white")
        .attr("stroke-width", "4")
    let fg = group.append("text")
        .attr("x", position[0] || 0)
        .attr("y", position[1] || 0)
        .attr("font-size", fontSize)
        .text(text)
    // var b = bg.node().getBoundingClientRect();
    // bg.attr("data-width", b.width + 4)
    //     .attr("data-height", b.height + 4)
    return { fg, bg };
}

function initRegionLabel(d3Node, text) {
    d3Node
        .attr("text-anchor", "middle")
        .attr("i18n", text)
        .on("click", function (d) { onRegionClicked(text) })
        .on("dblclick", function () { d3.event.stopPropagation() })
}

function onRegionClicked(id) {
    if (d3.event.defaultPrevented) return;
    d3.event.stopPropagation();
    showPopup(id, d3.event.pageX, d3.event.pageY);
}

function addSmallLevelsLegend() {
    const LINE_HEIGHT = 26;
    const PADDING = 10;
    let titleBox = document.querySelector("#level");
    let bbox = titleBox.getBoundingClientRect();
    let g = group.append("g").attr("id", "legend").selectAll("g")
        .data(levelColorNames).enter();
    g.append("rect")
        .attr("x", 16)
        .attr("y", bbox.bottom + 11)
        .attr("width", (LINE_HEIGHT + PADDING) * levelColorNames.length + PADDING + 2)
        .attr("height", LINE_HEIGHT + PADDING)
        .attr("stroke", "black")
        .attr("stroke-width", 1)
        .attr("fill", "white")
        .attr("rx", 6)
    g.append("rect")
        .attr("x", (d, i) => 16 + PADDING + i * (LINE_HEIGHT + PADDING))
        .attr("y", bbox.bottom + 10 + PADDING)
        .attr("width", LINE_HEIGHT + 1)
        .attr("height", 18)
        .attr("stroke", "#eaeaea")
        .attr("stroke-width", (d, i) => i == 0 ? 1 : 0)
        .attr("rx", 3)
        .attr("fill", (d, i) => levelColors[i])
    g.append("text")
        .attr("x", (d, i) => 16 + PADDING + i * (LINE_HEIGHT + PADDING) + 9)
        .attr("y", bbox.bottom + 10 + PADDING + 14)
        .attr("font-size", 14)
        .attr("font-weight", 600)
        .attr("fill", (d, i) => i == 0 ? "#000000b0": "#ffffffb0")
        .text((d, i) => i)
}

function addBigLevelsLegend() {
    const LINE_HEIGHT = 26;
    const PADDING = 10;
    let titleBox = document.querySelector("#level");
    let bbox = titleBox.getBoundingClientRect();
    let g = group.append("g").attr("id", "legend").selectAll("g")
        .data(levelColorNames).enter();
    g.append("rect")
        .attr("x", 16)
        .attr("y", bbox.bottom + 11)
        .attr("width", 180)
        .attr("height", levelColorNames.length * LINE_HEIGHT + PADDING)
        .attr("stroke", "black")
        .attr("stroke-width", 1)
        .attr("fill", "white")
        .attr("rx", 4)
    g.append("rect")
        .attr("x", 16 + PADDING)
        .attr("y", (d, i) => i * LINE_HEIGHT + bbox.bottom + 11 + PADDING)
        .attr("width", LINE_HEIGHT + 1)
        .attr("height", 18)
        .attr("stroke", "#eaeaea")
        .attr("stroke-width", (d, i) => i == 0 ? 1 : 0)
        .attr("rx", 3)
        .attr("fill", (d, i) => levelColors[i])
    g.append("text")
        .attr("x", 25 + PADDING)
        .attr("y", (d, i) => (i + 1) * LINE_HEIGHT + bbox.bottom - 1 + PADDING)
        .attr("font-size", 14)
        .attr("font-weight", 600)
        .attr("fill", (d, i) => i == 0 ? "#000000b0": "#ffffffb0")
        .text((d, i) => i)
    g.append("text")
        .attr("x", 51 + PADDING)
        .attr("y", (d, i) => (i + 1) * LINE_HEIGHT + bbox.bottom - 1 + PADDING)
        .attr("i18n", (d, i) => `level${i}`)
        .attr("font-size", 13)
        .text((d, i) => UI._(`level${i}`))
}

function switchLegend(option) {
    let legend = document.querySelector("#legend");
    if (legend) {
        legend.outerHTML = "";
    }
    if (option == "small") {
        addSmallLevelsLegend()
    } else if (option == "big") {
        addBigLevelsLegend()
    }
    // updateHash();
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
        // console.log(inertia.position)
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
        updateLabelBBox();
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
    time: 1000,
});
svg.call(d3.drag()
    .filter(() => {
        if (d3.event.touches?.length == 2) return false;  // 2+ fingers = zoom, not drag
        return true;
    })
    .on("start", inertia.start)
    .on("drag", inertia.move)
    .on("end", inertia.end)
);


const showLabel = document.querySelector("#showLabel");
const showFlag = document.querySelector("#showFlag");
const showHint = document.querySelector("#regionHint");

function draw() {
    const isShowLabel = showLabel.checked;
    const isShowFlag = showFlag.checked;
    const offsetY = (isShowFlag && isShowLabel) ? 5 : 0;

    svg.selectAll("path").attr("d", path);
    svg.selectAll("text.place").each(function (d) {
        var c = cachedLabelCentroid(d, true);
        d3.select(this)
            .attr("x", isNaN(c[0]) ? 0 : c[0])
            .attr("y", isNaN(c[1]) ? 0 : c[1] + offsetY)
            .selectAll("tspan")
            .attr("x", isNaN(c[0]) ? 0 : c[0])
    })
    svg.selectAll("image.place-flag")
        .each(function(d) {
            var c = cachedLabelCentroid(d);
            var width = this.attributes.width?.value || 16;
            var height = this.attributes.height.value;
            const offsetY = (isShowLabel && isShowFlag) ? height * 1.8 : height * 0.8;
            d3.select(this)
                .attr("x", isNaN(c[0]) ? 0 : c[0] - width / 2)
                .attr("y", isNaN(c[1]) ? 0 : c[1] - offsetY)
        })

    svg.selectAll("text.place")
        .attr("shown", null)
        .style("display", null);
    svg.selectAll("image.place-flag")
        .attr("shown", null)
        .style("display", null);
}

let evCache = [];
let prevDiff = -1;
svg.node().addEventListener("pointerdown", function(ev) {
    evCache.push(ev);
})
svg.node().addEventListener("pointermove", function(ev) {
    const index = evCache.findIndex(
        (cachedEv) => cachedEv.pointerId === ev.pointerId,
    );
    evCache[index] = ev;
    if (evCache.length === 2) {
    // Calculate the distance between the two pointers
        const curDiff = Math.hypot(
            evCache[0].clientX - evCache[1].clientX,
            evCache[0].clientY - evCache[1].clientY,
        );

        if (prevDiff > 0) {
            onzoom(curDiff / prevDiff)
            updateLabelBBox();
            draw();
            arrangeLabels();
            arrangePopup();
        }

        // Cache the distance for the next move event
        prevDiff = curDiff;
    }
})
svg.node().addEventListener("pointerleave", function(ev) {
    const index = evCache.findIndex(
        (cachedEv) => cachedEv.pointerId === ev.pointerId,
    );
    if (index >= 0) {
        evCache.splice(index, 1);
    }
})
svg.node().addEventListener("pointerup", function(ev) {
  // Remove this event from the target's cache
  const index = evCache.findIndex(
    (cachedEv) => cachedEv.pointerId === ev.pointerId,
  );
  prevDiff = -1;
  evCache.splice(index, 1);
  updateHash();
})
function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
}
let updateHashTimer = null;
function lazyUpdateHash() {
    return setTimeout(function() {
        updateHash()
    }, 500)
}
let baseDeltaY = 0;
window.addEventListener("wheel", function(ev) {
    if (ev.ctrlKey) {
        ev.preventDefault();
    }

    let absDeltaY = Math.abs(ev.deltaY);
    if (baseDeltaY == 0 || absDeltaY < baseDeltaY) {
        if (absDeltaY >= 100) {
            baseDeltaY = absDeltaY / 25;
        } else {
            baseDeltaY = clamp(baseDeltaY, 1, Math.max(absDeltaY, 1));
        }
    }

    // also rotate to cursor position
    let cursorPos = attachToEarth([ev.clientX, ev.clientY])
    let v0 = versor.cartesian(projection.invert(cursorPos));
    let q0 = versor(projection.rotate());
    if (ev.deltaY < 0) {
        onzoom(clamp(Math.pow(2, -ev.deltaY / baseDeltaY / 128), 1, 2))
    } else if (ev.deltaY > 0) {
        onzoom(clamp(Math.pow(0.5, ev.deltaY / baseDeltaY / 128), 0.5, 1))
    }
    let v1 = versor.cartesian(projection.invert(cursorPos));
    let q1 = versor.multiply(q0, versor.delta(v0, v1))
    let r1 = versor.rotation(q1);
    projection.rotate([r1[0], r1[1], 0])

    updateLabelBBox();
    draw();
    arrangeLabels();
    arrangePopup();
    if (updateHashTimer) {
        clearTimeout(updateHashTimer)
    }
    updateHashTimer = lazyUpdateHash();

}, {"passive": false})

function attachToEarth([x, y]) {
    let centerDir = [width / 2 - x, height / 2 - y];
    let cursorDist = Math.hypot(centerDir[0], centerDir[1]);
    let ratio = 1 - 0.8 * earthRadius * lastZoomK / cursorDist;
    if (ratio > 0) {
        return [x + centerDir[0] * ratio, y + centerDir[1] * ratio];
    } else {
        return [x, y];
    }
}

function onzoom(scale) {
    let k = clamp(lastZoomK * scale, MIN_K, MAX_K);
    var s = INIT_SCALE * k;
    lastZoomK = k;
    projection.scale(s);

    // Do not apply d3.zoom's mouse-relative transform — redraw centered via projection
    group.attr("transform", null);

    // Scale font size inversely with projection scale so labels stay readable
    var relScale = projection.scale() / INIT_SCALE;
    svg.selectAll("text.place")
    .style("font-size", Math.max(11, INIT_FONTSIZE / Math.pow(relScale, 0.05)) + "px");
}

function updateLabelBBox() {
    const isShowFlag = showFlag.checked;
    const extraHeight = isShowFlag ? FLAG_HEIGHT : 0;
    svg.selectAll("text.place-outline").each(function(d){
        var b = this.getBoundingClientRect();
        if (b.width <= 0 || b.height <= 0) {
            return;
        }
        d3.select(this)
            .attr("data-width", b.width + 4)
            .attr("data-height", b.height + 4 + extraHeight)
    })
}

function arrangeLabels() {
    const isShowLabel = showLabel.checked;
    const isShowFlag = showFlag.checked;
    const isShowHint = showHint.checked;

    var shown = [];
    let targetElem = showLabel ? "text.place-outline" : "image.place-flag";
    svg.selectAll(targetElem)
        .each(function (d) {
            const geo = cachedLabelCentroid(d);
            var isShown = true;
            if (isNaN(geo[0])) isShown = false;
            if (!(isShowHint || levels[d.id] > 0)) isShown = false;

            var b = {
                width: parseInt(this.dataset.width),
                height: parseInt(this.dataset.height),
            };
            b.x = geo[0] - b.width / 2;
            b.y = geo[1] - b.height / 2;

            if (isShown) {
                for (var i = 0; i < shown.length; i++) {
                    var s = shown[i];
                    if (b.x < s.x + s.width && b.x + b.width > s.x &&
                        b.y < s.y + s.height && b.y + b.height > s.y) {
                        isShown = false; // Hide if overlaps a higher-priority label
                    }
                }
            }

            d3.select(this)
                .attr("shown", isShown)
                .style("display", function (d) {
                    if (!isShown) return "none"
                    // Store a plain object copy (not a live DOMRect)
                    shown.push(b);
                    return null; // Show (remove inline style override)
                });
        })
    svg.selectAll("[shown=true] ~ text.place-label")
        .style("display", null)
    svg.selectAll("[shown=true] ~ image.place-flag")
        .style("display", null)
    svg.selectAll("[shown=false] ~ text.place-label")
        .style("display", "none")
    svg.selectAll("[shown=false] ~ image.place-flag")
        .style("display", "none")

    if (!isShowLabel) {
        svg.selectAll("text.place")
            .style("display", "none");
    }
    if (!isShowFlag) {
        svg.selectAll("image.place-flag")
            .style("display", "none")
    }
}

function toggleRegionStyle(value) {
    draw();
    arrangeLabels();
    updateHash();
}

function toggleGraticule(show) {
    if (!show) {
        svg.selectAll("path.graticule").attr("display", "none");
    } else {
        svg.selectAll("path.graticule").attr("display", null);
    }
    updateHash();
}

function toggleHint(show) {
    draw();
    arrangeLabels();
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

let centroidCache = {};
function cachedLabelCentroid(d, update=false) {
    if (centroidCache[d.id] && !update) {
        return centroidCache[d.id];
    }
    let out = getLabelCentroid(d);
    centroidCache[d.id] = out;
    return out;
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

function arrangePopup() {
    if (!activeGeoCentroid || popup.style("display") === "none") return;
    var projected = projection(activeGeoCentroid);
    if (!projected) return; // country rotated to back hemisphere
    var client = {x: projected[0], y: projected[1]};
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
    activeGeoCentroid = projection.invert([clientX, clientY]);
    popup.select(".place-name")
        .attr("i18n", id)
        .text(UI.area(id));
    popup.style("display", "block")
        .style("left", clientX + "px")
        .style("top", clientY + "px");
    popup.select(".search")
        .attr("href", 'https://google.com/search?q=' + id)
        .attr("title", 'Search: ' + id)
    let nativeName = UI.area(id);
    let isAscii = (str) => /^[\x00-\x7F]+$/.test(str);
    if (lang_selector.value == "native" && RTL_REGIONS.indexOf(id) >= 0 && !isAscii(nativeName)) {
        popup.node().classList.add("rtl")
    } else {
        popup.node().classList.remove("rtl")
    }
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
        .attr("fill", DISPUTED_REGIONS.indexOf(id) >= 0 && level == 0 ? "transparent": levelColors[level]);
    levels[id] = level;
    updateHash();
    updateTitle();
    draw();
    arrangeLabels();
}
document.addEventListener("click", function(e) {
    // console.log(e.target)
    if (e.target.closest("#form")) {
        if (!e.target.classList.contains("close")) {
            return;
        }
    }
    if (e.target.closest(".bottom-right")) {
        return;
    }
    hidePopup();
});

let cb = null;
function reloadPage() {
    return setTimeout(function() {
        window.location.reload()
    }, 500);
}
window.addEventListener("resize", function(ev) {
    if (cb) {
        clearTimeout(cb)
    }
    cb = reloadPage()
})

function updateTitle() {
    const title = document.querySelector("#level");
    if (title) {
        title.innerHTML = "";
        addTitleLabel(d3.select(title), Object.values(levels).reduce((a, b) => a + b, 0));
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

    levels = {};
    svg.selectAll(".node path")
        .attr("levelcolor", null)
        .attr("level", null)
        .attr("fill", "white")
    updateHash();
    updateTitle();
    draw();
    arrangeLabels();
}

function setAuthor() {
    let name = hashMap["name"].currentValue();
    answer = prompt(UI._("ask-for-name"), name);
    if (answer != null) {
        hashMap["name"].initUi(answer)
        updateHash();
    }
}

function toDataURL(width, height, cb) {
    var svgString = new XMLSerializer().serializeToString(document.querySelector('svg'));
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvg(canvas, svgString, {
        renderCallback: function(d) {
            cb(canvas.toDataURL("image/png"))
        },
    });
}

function saveAsImage(elem) {
    // const svg = document.querySelector("svg");
    const dpi = window.devicePixelRatio;
    const label = elem.querySelector("[i18n]");
    toDataURL(width * dpi, height * dpi, function(png) {
        elem.setAttribute('href', png);
        label.innerHTML = "Download"
    });
};
function clearImage() {
    const elem = document.querySelector("#saveAsImage")
    const label = elem.querySelector("[i18n]");
    elem.removeAttribute("href");
    label.innerHTML = UI._(label.attributes.i18n.value)
}

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
        UI.setLocale(lang);
        lang_selector.value = lang;
        document.querySelectorAll("[i18n]").forEach(function (elem) {
            const key = elem.attributes.i18n.value;
            if (elem.classList.contains("place")) {
                const text = UI.area(key);
                if (elem.tagName == "text") {
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
                    elem.innerHTML = text;
                }
            } else {
                elem.innerHTML = fmt(UI._(key));
            }
        })
        updateLabelBBox();
        arrangeLabels();
        updateTitle();
        updateHash();
    }
}

loadData("map/links.json", function(data) {
    links = data;
})
