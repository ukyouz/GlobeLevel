var width = 500, height = 500;
// var context = d3.select("canvas").node().getContext("2d");
// path = d3.geoPath(d3.geoOrthographic(), context);
var svg = d3.select("svg").attr("viewBox", "0, 0, " + width + ", " + height + "")
// .attr("width", width).attr("height", height);
var group = svg.append("svg:g");
const INIT_SCALE = 100;
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

// For MultiPolygon features, centroid may fall outside all polygons (e.g. USA, Russia).
// Find the largest sub-polygon, compute its geographic centroid, then project that
// single point — more robust than path.centroid() which averages projected SVG coords
// and breaks across antimeridian or under heavy projection distortion.
function getLabelCentroid(d) {
    if (!d || !d.geometry) return [NaN, NaN];
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
    if (projection == PROJECTIONS[0].object) {
        return path.centroid(feature);       // geographic [lon, lat] — projection-independent
    }
    var geo = d3.geoCentroid(feature);       // geographic [lon, lat] — projection-independent
    return projection(geo) || [NaN, NaN];    // null when clipped (back hemisphere)
}

function resetNorthUp() {
    var r = projection.rotate();
    projection.rotate([r[0], r[1], 0]); // keep current longitude, reset tilt and roll
    draw();
    arrangeLabels();
    repositionPopup();
}

function switchProjection(index) {
    projectionIndex = +index;
    var config = PROJECTIONS[projectionIndex];
    var rotate = projection.rotate();
    config.object
        .scale(projection.scale())
        .translate(projection.translate())
        .rotate(projection.rotate());
    path.projection(config.object);
    projection = config.object
    // lastZoomK = 1;
    draw();
    arrangeLabels();
    repositionPopup();
}
var colors = d3.scaleOrdinal(d3['schemeCategory20']);

const levelColorNames = ['white', 'blue', 'green', 'yellow', 'orange', 'red'];
const levelColors = ['#ffffff', '#3598db', '#30cc70', '#f3c218', '#d58337', '#e84c3d'];
const levelTexts = [
    "Never been there",
    "Passed there",
    "Alighted there",
    "Visited there",
    "Stayed there",
    "Lived there",
]
var countryLevels = {};

// --- Popup ---
var activeCountryId = null;
var activeGeoCentroid = null; // geographic centroid of the active country, stable across zoom
var featureById = {};         // populated after topojson loads

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

function repositionPopup() {
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
    .text(function(d, i) { return levelTexts[i]; })
    .on("click", function(d, i) {
        d3.event.stopPropagation();
        setCountryLevel(activeCountryId, i);
        hidePopup();
    });

function showPopup(id, clientX, clientY) {
    activeCountryId = id;
    activeGeoCentroid = clientToGeo(clientX, clientY);
    popup.select(".place-name").text(id);
    popup.selectAll(".level-btn")
        .classed("current", function(d, i) { return i === (countryLevels[id] || 0); });
    popup.style("display", "block")
        .style("left", clientX + "px")
        .style("top",  clientY + "px");
}
function hidePopup() {
    popup.style("display", "none");
    activeCountryId = null;
    activeGeoCentroid = null;
}
function setCountryLevel(id, level) {
    if (!id) return;
    countryLevels[id] = level;
    svg.selectAll(".node path").filter(function(d) { return d.id === id; })
        .attr("fill", levelColors[level]);
}

d3.select(document).on("click", hidePopup);

// Make popup draggable by its title bar
var popupNode = document.getElementById("form");
var popupDragOffset = null;

function onPopupDragStart(clientX, clientY) {
    if (!activeCountryId) return;
    console.log(clientX, clientY)
    var rect = popupNode.getBoundingClientRect();
    popupDragOffset = { x: clientX - rect.left, y: clientY - rect.top };
};
function onPopupDragging(clientX, clientY) {
    if (!activeCountryId) return;
    if (!popupDragOffset) return;
    popupNode.style.left = (clientX - popupDragOffset.x) + "px";
    popupNode.style.top  = (clientY - popupDragOffset.y) + "px";
}

d3.json("test/map.topojson", function (world) {
    console.log(world)

    // Ocean (sphere background)
    group.append("path")
        .datum({type: "Sphere"})
        .attr("class", "sphere")
        .attr("d", path)
        .attr("fill", "#9EC3FB");

    var countries = topojson.feature(world, world.objects.collection);
    countries.features.forEach(function(f) { featureById[f.id] = f; });
    // console.log(topojson.feature(world, world.objects.countries), topojson.mesh(world, world.objects.countries));
    // var pathRenderer = d3.geoPath().projection(projection);
    var nodes = group.append("g").selectAll("g").data(countries.features).enter()
        .append("g")
        .attr("class", "node")

    // countries
    nodes
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

    // country labels — sorted by area descending so larger countries have higher priority
    var sortedFeatures = countries.features.slice().sort(function(a, b) {
        return d3.geoArea(b) - d3.geoArea(a);
    });
    nodes = group.append("g").selectAll("g").data(sortedFeatures).enter()
    .append("text").each(function(d) {
        const center = getLabelCentroid(d);
        d3.select(this)
        .attr("class", "place-label")
        .attr("text-anchor", "middle")
        .attr("font-size", "8px")
        .style("display", isNaN(center[0]) ? "none": null)
        .attr("x", center[0] || 0)
        .attr("y", center[1] || 0)
        .text(function (d) {
            return d.id;
        })
        .on("click", function(d) {
            if (d3.event.defaultPrevented) return;
            d3.event.stopPropagation();
            showPopup(d.id, d3.event.pageX, d3.event.pageY);
        })
        // .call(wrap, 60)
    })
    arrangeLabels();
});



svg.call(d3.drag()
    .on("start", dragstart)
    .on("drag", dragging)
    .on("end", function () {
        svg.attr("class", null);
        arrangeLabels();
        // inertia.start();
        console.log(projection.rotate())
    })
);
var v0, r0, q0;
function dragstart() {
    const mousePos = d3.mouse(this);
    v0 = versor.cartesian(projection.invert(mousePos));
    r0 = projection.rotate();
    q0 = versor(r0);
    svg.attr("class", "dragging");
    var e = d3.event.sourceEvent;
    onPopupDragStart(e.clientX, e.clientY);
}
function dragging() {
    const mousePos = d3.mouse(this);
    var v1 = versor.cartesian(projection.rotate(r0).invert(mousePos)),
        q1 = versor.multiply(q0, versor.delta(v0, v1)),
        r1 = versor.rotation(q1);

    projection.rotate(r1);
    draw();
    var e = d3.event.sourceEvent;
    onPopupDragging(e.clientX, e.clientY);
}


function draw() {
    svg.selectAll("path").attr("d", path);
    svg.selectAll("text.place-label")
        .attr("x", function (d) {
            var c = getLabelCentroid(d);
            return isNaN(c[0]) ? 0 : c[0];
        })
        .attr("y", function (d) {
            var c = getLabelCentroid(d);
            return isNaN(c[1]) ? 0 : c[1];
        });
    // arrangeLabels();
}
// var inertia = d3.geoInertiaDrag(svg, draw, projection);
// d3.timer(function(e) {
//   if (inertia.timer) return;
//   var rotate = projection.rotate();
//   projection.rotate([rotate[0] + 0.12, rotate[1], rotate[2]]);
//   draw();
// });

var zoom = d3.zoom()
    // no longer in d3 v4 - zoom initialises with zoomIdentity, so it's already at origin
    // .translate([0, 0])
    // .scale(1)
    .scaleExtent([1, 9])
    .on("zoom", onzoom);

svg.call(zoom);
var lastZoomK = 1;
function onzoom() {
    var s = projection.scale() * d3.event.transform.k / lastZoomK;
    lastZoomK = d3.event.transform.k;
    projection.scale(Math.max(INIT_SCALE, Math.min(s, 2500)));

    // Do not apply d3.zoom's mouse-relative transform — redraw centered via projection
    group.attr("transform", null);
    draw();

    // Scale font size inversely with projection scale so labels stay readable
    var relScale = projection.scale() / INIT_SCALE;
    svg.selectAll("text.place-label")
        .style("font-size", Math.max(4, 8 / Math.pow(relScale, 0.1)) + "px");
    arrangeLabels();
    repositionPopup();
}


function arrangeLabels() {
    // Reset all to visible first — getBBox() throws on display:none elements in Chrome
    svg.selectAll("text.place-label").style("display", null);

    var shown = [];
    svg.selectAll("text.place-label")
        .style("display", function(d) {

            var geo = getLabelCentroid(d);
            if (isNaN(geo[0])) return "none";

            var b = this.getBBox();
            for (var i = 0; i < shown.length; i++) {
                var s = shown[i];
                if (b.x < s.x + s.width && b.x + b.width > s.x &&
                    b.y < s.y + s.height && b.y + b.height > s.y) {
                    return "none"; // Hide if overlaps a higher-priority label
                }
            }
            // Store a plain object copy (not a live DOMRect)
            shown.push({ x: b.x, y: b.y, width: b.width, height: b.height });
            return null; // Show (remove inline style override)
        });
}
