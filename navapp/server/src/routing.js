// Wraps OSRM's route API and turns its response into the shape the client
// uses everywhere. OSRM returns [lng, lat] pairs; the app uses {lat, lng}, so
// the swap happens once, here, and nowhere else.

function instructionFor(step) {
  const m = step.maneuver || {};
  const name = step.name ? ` onto ${step.name}` : '';
  const road = step.name || 'the road';
  switch (m.type) {
    case 'depart':
      return `Head ${m.modifier || 'on'} ${road}`;
    case 'arrive':
      return 'You have arrived';
    case 'turn':
      return `Turn ${m.modifier || ''}${name}`.replace(/\s+/g, ' ').trim();
    case 'roundabout':
    case 'rotary':
      return `Take the roundabout${name}`;
    default:
      return `Continue on ${road}`;
  }
}

function parseOsrmResponse(json) {
  if (!json || json.code !== 'Ok' || !Array.isArray(json.routes) || json.routes.length === 0) {
    throw new Error(`no route found (${json && json.code ? json.code : 'unknown'})`);
  }
  const route = json.routes[0];
  const steps = route.legs.flatMap((leg) => leg.steps).map((step) => ({
    instruction: instructionFor(step),
    distanceM: step.distance,
    maneuver: step.maneuver.type,
    location: { lat: step.maneuver.location[1], lng: step.maneuver.location[0] },
  }));
  return {
    distanceM: route.distance,
    durationS: route.duration,
    geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    steps,
  };
}

function createRouter(options) {
  const fetchImpl = options.fetchImpl;
  const baseUrl = options.baseUrl;

  async function getRoute({ from, to }) {
    if (from.lat === to.lat && from.lng === to.lng) {
      throw new Error('start and destination are the same');
    }
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const url = `${baseUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`routing service returned ${res.status}`);
    return parseOsrmResponse(await res.json());
  }

  return { getRoute };
}

module.exports = { createRouter, parseOsrmResponse, instructionFor };
