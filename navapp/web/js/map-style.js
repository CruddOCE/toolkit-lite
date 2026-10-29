// Map look: a pale, low-contrast base map with thin grey roads, closer to Waze
// than a standard street map. The base style comes from OpenFreeMap (free, no key,
// attribution required), and this file overrides its colours after it loads.
// Everything the look depends on lives here, so it can be tuned in one place.

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

const COLOURS = {
  land: '#f6f7f5',
  park: '#e6f0e1',
  water: '#c8e0f2',
  building: '#eceff1',
  roadCasing: '#d5d9de',
  roadFill: '#ffffff',
  label: '#4a5560',
  route: '#1a8cff',
  routeEdge: '#ffffff',
};

// Road and label layers from the OpenFreeMap positron style, by layer id.
const ROAD_CASING_LAYERS = [
  'highway_major_casing',
  'highway_motorway_casing',
  'tunnel_motorway_casing',
  'highway_motorway_bridge_casing',
];
const ROAD_FILL_LAYERS = [
  'highway_minor',
  'highway_major_inner',
  'highway_motorway_inner',
  'tunnel_motorway_inner',
  'highway_motorway_bridge_inner',
  'highway_major_subtle',
  'highway_motorway_subtle',
];

// Layers the look changes. Layers missing from the style are skipped, so a style
// update from the provider cannot break the app.
function applyWazeLook(map) {
  const set = (id, prop, value) => {
    if (map.getLayer(id)) map.setPaintProperty(id, prop, value);
  };
  set('background', 'background-color', COLOURS.land);
  set('park', 'fill-color', COLOURS.park);
  set('water', 'fill-color', COLOURS.water);
  set('building', 'fill-color', COLOURS.building);
  for (const id of ROAD_CASING_LAYERS) set(id, 'line-color', COLOURS.roadCasing);
  for (const id of ROAD_FILL_LAYERS) set(id, 'line-color', COLOURS.roadFill);
  for (const layer of map.getStyle().layers) {
    if (layer.type === 'symbol' && layer.paint && 'text-color' in layer.paint) {
      map.setPaintProperty(layer.id, 'text-color', COLOURS.label);
    }
  }
}

// The route is a GeoJSON line in its own source, drawn under the labels so
// street names stay readable on top of it.
function addRouteLayers(map) {
  if (map.getSource('route')) return;
  map.addSource('route', {
    type: 'geojson',
    data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
  });
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol');
  const before = firstLabel ? firstLabel.id : undefined;
  map.addLayer(
    {
      id: 'route-casing',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': COLOURS.routeEdge, 'line-width': 13 },
    },
    before
  );
  map.addLayer(
    {
      id: 'route',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': COLOURS.route, 'line-width': 8 },
    },
    before
  );
}

// geometry arrives as [lat, lng] pairs from the server; MapLibre wants [lng, lat].
function setRouteGeometry(map, geometry) {
  map.getSource('route').setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: geometry.map(([lat, lng]) => [lng, lat]) },
  });
}

function clearRouteGeometry(map) {
  map.getSource('route').setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: [] },
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { STYLE_URL, COLOURS, applyWazeLook, addRouteLayers, setRouteGeometry, clearRouteGeometry };
}
