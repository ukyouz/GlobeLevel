var width = window.innerWidth, height = window.innerHeight;
var svg = d3.select("svg").attr("viewBox", "0, 0, " + width + ", " + height + "")
var group = svg.append("svg:g");
const levelColorNames = ['white', 'blue', 'green', 'yellow', 'orange', 'red'];
const levelColors = ['#ffffff', '#3598db', '#30cc70', '#f3c218', '#d58337', '#e84c3d'];
let LANGS = {
    "en": {
        "about-world-level": "About World Level",
        "level0": "Never been there",
        "level1": "Passed there",
        "level2": "Alighted there",
        "level3": "Visited there",
        "level4": "Stayed there",
        "level5": "Lived there",
        "set-name": "Set Name",
        "screenshot": "Screenshot",
        "show-labels": "Show Labels",
        "confirm-clear-levels": "Are you sure to clear all level colors?",
        "ask-for-name": "Please enter the name you want to show:",
        "projection.orthographic": "3D Globe",
        "projection.natural-earth": "Natural Earth",
        "projection.equirectangular": "Equirectangular",
        "projection.mercator": "Mercator",
        "projection.stereographic": "Stereographic",
        "rotate-snap.free-rotate": "Free Rotate",
        "rotate-snap.15-deg": "15 deg",
        "rotate-snap.30-deg": "30 deg",
    },
}
let UI = LANGS["en"];
const INIT_SCALE = 160;
const INIT_K = 2.5;
const INIT_FONTSIZE = 13;
const PROJECTIONS = [
    { name: 'Orthographic', object: d3.geoOrthographic().clipAngle(90), scale: INIT_SCALE },
    { name: 'Natural Earth', object: d3.geoNaturalEarth1(),             scale: INIT_SCALE },
    { name: 'Equirectangular', object: d3.geoEquirectangular(),         scale: INIT_SCALE },
    { name: 'Mercator',      object: d3.geoMercator(),                  scale: INIT_SCALE },
    { name: 'Stereographic', object: d3.geoStereographic().clipAngle(179), scale: INIT_SCALE },
];
var projectionIndex = 0;
var projection = PROJECTIONS[0].object.scale(INIT_SCALE).translate([width / 2, height / 2]);
var path = d3.geoPath().projection(projection);

d3.json("test/map.topojson", function (world) {
    console.log(world)
    const {projId, k, rot, lvl, locale} = readHash();
    translateUI(locale);

    // Ocean (sphere background)
    group.append("path")
        .datum({type: "Sphere"})
        .attr("class", "sphere")
        .attr("d", path)
        .attr("fill", "#9EC3FB")
        .on("dblclick", function(){d3.event.stopPropagation()})

    var countries = topojson.feature(world, world.objects.collection);

    // Areas
    var nodes = group.append("g").selectAll("g").data(countries.features).enter()
        .each(function(d, index) {
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
            .on("click", function(d) {
                if (d3.event.defaultPrevented) return;
                d3.event.stopPropagation();
                showPopup(d.id, d3.event.pageX, d3.event.pageY);
            })
            .on("dblclick", function(){d3.event.stopPropagation()})
            if (lvl[index]) {
                setCountryLevel(d.id, lvl[index]);
            }
        })

    // country labels — sorted by area descending so larger countries have higher priority
    var sortedFeatures = countries.features.slice().sort(function(a, b) {
        return d3.geoArea(b) - d3.geoArea(a);
    });
    nodes = group.append("g").selectAll("g").data(sortedFeatures).enter()
    .append("g").each(function(d) {
        const center = getLabelCentroid(d);
        var bg = addLabel(d3.select(this).append("text"), center, d.id);
        var fg = addLabel(d3.select(this).append("text"), center, d.id);
        bg.attr("class", "place place-outline")
            .attr("stroke", "white")
            .attr("stroke-width", "2")
        fg.attr("class", "place place-label")
    })

	params = parseQuery(window.location.search);
    group.append("text")
        .attr("x", "40")
        .attr("y", height - 40)
        .attr("font-size", "32")
        .text(params.t || "")
        .attr("stroke", "white")
        .attr("stroke-width", "4")
    group.append("text")
        .attr("x", "40")
        .attr("y", height - 40)
        .attr("font-size", "32")
        .text(params.t || "")


    projection.rotate([rot[0], rot[1], 0])
    switchProjection(projId);
    svg.call(zoom.transform, d3.zoomIdentity.scale(k))
    document.querySelector("#proj-select").value = projId;
    arrangeLabels();
});

function addLabel(d3Node, center, text) {
    d3Node
    .attr("text-anchor", "middle")
    .attr("font-size", INIT_FONTSIZE + "px")
    .style("display", isNaN(center[0]) ? "none": null)
    .attr("x", center[0] || 0)
    .attr("y", center[1] || 0)
    .on("click", function(d) {
        if (d3.event.defaultPrevented) return;
        d3.event.stopPropagation();
        showPopup(text, d3.event.pageX, d3.event.pageY);
    })
    .on("dblclick", function(){d3.event.stopPropagation()})

    const longText = text.length > 15 && text.indexOf(" ") > 0;
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
        d3Node.append("tspan")
            .attr("x", center[0] || 0)
            .attr("dy", "0")
            .text(text.slice(0, last_space_pos));
        d3Node.append("tspan")
            .attr("x", center[0] || 0)
            .attr("dy", "1em")
            .text(text.slice(last_space_pos + 1));
    }
    return d3Node;
}

svg.call(d3.drag()
    .on("start", dragstart)
    .on("drag", dragging)
    .on("end", function () {
        svg.attr("class", null);
        arrangeLabels();
        updateHash();
    })
);
var v0, r0, q0;
function dragstart() {
    const mousePos = d3.mouse(this);
    v0 = versor.cartesian(projection.invert(mousePos));
    r0 = projection.rotate();
    q0 = versor(r0);
    svg.attr("class", "dragging");
    arrangePopup();
}
function dragging() {
    const mousePos = d3.mouse(this);
    var v1 = versor.cartesian(projection.rotate(r0).invert(mousePos)),
        q1 = versor.multiply(q0, versor.delta(v0, v1)),
        r1 = versor.rotation(q1);

    const snapDegree = parseInt(document.querySelector("#snap-select").value);
    if (snapDegree) {
        const a = Math.round(r1[0] / snapDegree) * snapDegree;
        const b = Math.round(r1[1] / snapDegree) * snapDegree;
        projection.rotate([a, b, r0[2]]);
    } else {
        projection.rotate([r1[0], r1[1], r0[2]]);
    }
    draw();
    arrangePopup();
}


function draw() {
    svg.selectAll("path").attr("d", path);
    svg.selectAll("text.place").each(function(d) {
        var c = getLabelCentroid(d);
        d3.select(this)
        .attr("x", isNaN(c[0]) ? 0 : c[0])
        .attr("y", isNaN(c[1]) ? 0 : c[1])
        .selectAll("tspan")
        .attr("x", isNaN(c[0]) ? 0 : c[0])
    })

    arrangeLabels();
}


var zoom = d3.zoom()
    .scaleExtent([1, 50])
    .on("zoom", onzoom);
svg.call(zoom);
var lastZoomK = 1;
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
    svg.selectAll("text.place").style("display", null);

    var shown = [];
    svg.selectAll("text.place-outline")
        .each(function(d) {
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
            .style("display", function(d) {
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


// For MultiPolygon features, centroid may fall outside all polygons (e.g. USA, Russia).
// Find the largest sub-polygon, compute its geographic centroid, then project that
// single point — more robust than path.centroid() which averages projected SVG coords
// and breaks across antimeridian or under heavy projection distortion.
function getLabelCentroid(d) {
    if (!d || !d.geometry) return [NaN, NaN];
    if (projection == PROJECTIONS[0].object) {
        return path.centroid(d);       // geographic [lon, lat] — projection-independent
    }
    var feature = d;
    if (d.geometry.type === 'MultiPolygon') {
        var largest = null, largestArea = 0;
        d.geometry.coordinates.forEach(function(coords) {
            var poly = { type: 'Feature', geometry: { type: 'Polygon', coordinates: coords } };
            var a = d3.geoArea(poly);
            if (a > largestArea) { largestArea = a; largest = poly; }
        });
        if (largest) feature = largest;
    }
    var geo = d3.geoCentroid(feature);       // geographic [lon, lat] — projection-independent
    return projection(geo) || [NaN, NaN];    // null when clipped (back hemisphere)
}

function switchProjection(index) {
    projectionIndex = +index;
    var config = PROJECTIONS[projectionIndex];
    config.object
        .scale(projection.scale())
        .translate(projection.translate())
        .rotate(projection.rotate());
    path.projection(config.object);
    projection = config.object
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
         .style("top",  client.y + "px");
}

var popup = d3.select("#form");
popup.append("div").attr("class", "popup-title");
var levelBtns = popup.selectAll(".level-btn")
    .data(levelColorNames).enter()
    .append("label")
    .attr("class", (d) => `label lang level ${d}`)
    .text(function(d, i) { return UI[`level${i}`]; })
    .on("click", function(d, i) {
        d3.event.stopPropagation();
        setCountryLevel(activeAreaId, i);
        hidePopup();
    });

function showPopup(id, clientX, clientY) {
    activeAreaId = id;
    activeGeoCentroid = clientToGeo(clientX, clientY);
    popup.select(".place-name").text(id);
    popup.style("display", "block")
        .style("left", clientX + "px")
        .style("top",  clientY + "px");
    popup.select(".search")
        .attr("href", 'https://google.com/search?q='+id)
        .attr("title", 'Search: '+id)
}
function hidePopup() {
    popup.style("display", "none");
    activeAreaId = null;
    activeGeoCentroid = null;
}
function setCountryLevel(id, level) {
    if (!id) return;
    svg.selectAll(".node path").filter(function(d) { return d.id === id; })
        .attr("levelcolor", levelColorNames[level])
        .attr("level", level)
        .attr("fill", levelColors[level]);
    updateHash();
}
d3.select(document).on("click", hidePopup);


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
}

function readHash() {
    const hash = parseQuery(window.location.hash);
    const rot = (hash.r != undefined ? hash.r : "0.0,0.0").split(",")
    return {
        "projId": parseInt(hash.p != undefined ? hash.p: "0"),
        "k": parseFloat(hash.k != undefined ? hash.k : `${INIT_K}`),
        "rot": [parseFloat(rot[0]), parseFloat(rot[1])],
        "lvl": decodeLevels(hash.l || ""),
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
const RADIXCHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
const CHAR2LVLS = (function(){
    const LEVELS = "012345"
    var levels = {};
    for (var i=0; i<6; i++) {
        for (var j=0; j<6; j++) {
            let pos = i*6 + j;
            levels[RADIXCHARS[pos]] = [LEVELS[i], LEVELS[j]]
        }
    }
    return levels
})();

function encodeLevels() {
    const areas = document.querySelectorAll("path[id]")
    const levels = [...areas].map(e => e.attributes.level ? parseInt(e.attributes.level.value) : 0);
    let bignum = "";  // little endian in 32 based
    for (var i=0; i<areas.length; i+=2) {
        bignum += RADIXCHARS[levels[i] * 6 + (levels[i+1] || 0)]
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
    for (var i=0; i<rawbignum.length; i++) {
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

function parseQuery(search){
	params = {};
	queries = search.substring(1).split("&");
	queries.forEach(function(val){
		query = val.split("=");
		if(query.length==2)
			params[query[0]] = decodeURI(query[1]);
	});

	return params;
}

function clearLevels() {
    let result = confirm(UI["confirm-clear-levels"]);
    if (!result) return;

    const hashs = readHash();
    window.location.hash = encodeQuery("#", {
        p: hashs.projId,
        k: hashs.k,
        r: hashs.rot,
    });
    window.location.reload();
}

function setAuthor(){
	p = parseQuery(window.location.search);
	answer = prompt(UI["ask-for-name"], p.t);
	if(answer!=null){
		window.location.search = "t="+encodeURI(answer);
	}
}

function toDataURL (width, height) {
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
	var png = toDataURL(bbox.width, bbox.height);
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

function translateUI(lang="en") {
    if (LANGS[lang] == undefined) {
        loadData(`lang/${lang}.json`, function(data) {
            LANGS[lang] = data;
            translateUI(lang);
        });
    } else {
        document.querySelectorAll("[i18n]").forEach(function(elem) {
            const key = elem.attributes.i18n.value;
            UI = LANGS[lang];
            elem.innerHTML = UI[key];
        })
    }
    updateHash();
}
