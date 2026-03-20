var width = 500, height = 500;
// var context = d3.select("canvas").node().getContext("2d");
// path = d3.geoPath(d3.geoOrthographic(), context);
var svg = d3.select("svg").attr("viewBox", "0, 0, " + width + ", " + height + "")
// .attr("width", width).attr("height", height);
var group = svg.append("svg:g");
const INIT_SCALE = 200;
var projection = d3.geoOrthographic().scale(INIT_SCALE).translate([width / 2, height / 2])
// var projection = d3.geoEquirectangular().scale(245).translate([width/2,height/2])
    .clipAngle(90);
var path = d3.geoPath().projection(projection);
var colors = d3.scaleOrdinal(d3['schemeCategory20']);

d3.json("test/map.topojson", function (world) {
    console.log(world)

    // Ocean (sphere background)
    group.append("path")
        .datum({type: "Sphere"})
        .attr("class", "sphere")
        .attr("d", path)
        .attr("fill", "#9EC3FB");

    var countries = topojson.feature(world, world.objects.collection);
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
        .attr("fill", function (d, i) {
            return colors(i)
        })

    // country labels — sorted by area descending so larger countries have higher priority
    var sortedFeatures = countries.features.slice().sort(function(a, b) {
        return d3.geoArea(b) - d3.geoArea(a);
    });
    nodes = group.append("g").selectAll("g").data(sortedFeatures).enter()
    .append("text")
        .attr("class", "place-label")
        .attr("text-anchor", "middle")
        .attr("font-size", "8px")
        .attr("x", function (d) {
            return path.centroid(d)[0] || 0;
        })
        .attr("y", function (d) {
            return path.centroid(d)[1] || 0;
        })
        .text(function (d) {
            return d.id;
        })
        // .call(wrap, 60)
    arrangeLabels();
});



svg.call(d3.drag()
    .on("start", dragstart)
    .on("drag", dragging)
    .on("end", function () {
        svg.attr("class", null);
        arrangeLabels();
        // inertia.start();
    })
);
var v0, r0, q0;
function dragstart() {
    v0 = versor.cartesian(projection.invert(d3.mouse(this)));
    r0 = projection.rotate();
    q0 = versor(r0);
    svg.attr("class", "dragging");
}
function dragging() {
    var v1 = versor.cartesian(projection.rotate(r0).invert(d3.mouse(this))),
        q1 = versor.multiply(q0, versor.delta(v0, v1)),
        r1 = versor.rotation(q1);

    projection.rotate(r1);
    draw();
}


function draw() {
    svg.selectAll("path").attr("d", path);
    svg.selectAll("text")
        .attr("x", function (d) {
            return path.centroid(d)[0] || 0;
        })
        .attr("y", function (d) {
            return path.centroid(d)[1] || 0;
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
}


function arrangeLabels() {
    // Reset all to visible first — getBBox() throws on display:none elements in Chrome
    svg.selectAll("text.place-label").style("display", null);

    var shown = [];
    svg.selectAll("text.place-label")
        .style("display", function(d) {
            // Hide labels for countries on the back hemisphere (centroid not projected)
            var geo = d3.geoCentroid(d);
            if (projection(geo) === null) return "none";

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
